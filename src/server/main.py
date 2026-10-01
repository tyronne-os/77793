"""CRANE API (port 8000): REST + WebSockets, and the built UI as static files."""
from __future__ import annotations

import asyncio
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import chat
import gpu
import process
import terminal
import vault
from files import WS

app = FastAPI(title="CRANE")
STATIC = Path(__file__).parent / "static"
ALLOWED_HOSTS = {"localhost", "127.0.0.1"}   # the terminal socket is a shell: loopback origins only

# Mutable server-side settings (shared across WebSocket connections)
_settings: dict = {"mode": "auto"}  # "auto" | "plan"


def origin_ok(ws: WebSocket) -> bool:
    o = ws.headers.get("origin")
    return o is None or urlparse(o).hostname in ALLOWED_HOSTS


@app.on_event("startup")
async def _startup() -> None:
    vault.load_into_env()
    gpu.start_background(asyncio.get_running_loop())


@app.on_event("shutdown")
def _shutdown() -> None:
    process.stop()
    WS.close()


@app.get("/api/status")
async def status():
    return {"ok": True, "model": await chat.model_id(), "llm": chat.QWEN_URL,
            "project": WS.root.name if WS.root else None, "preview": process.running(),
            "mode": _settings["mode"]}


@app.get("/api/settings")
def get_settings():
    return dict(_settings)


@app.post("/api/settings")
def update_settings(body: dict):
    if "mode" in body and body["mode"] in ("auto", "plan"):
        _settings["mode"] = body["mode"]
    return dict(_settings)


@app.get("/api/projects")
def projects():
    return {"projects": WS.list_projects(), "active": WS.root.name if WS.root else None}


@app.post("/api/projects")
def create_project(body: dict):
    try:
        return {"name": WS.create(body.get("name", ""))}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/open")
async def open_project(body: dict):
    try:
        process.stop()
        root = WS.open(body.get("name", ""), asyncio.get_running_loop())
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, "no such project")
    return {"name": root.name, "tree": WS.tree()}


@app.get("/api/tree")
def tree():
    return {"tree": WS.tree()}


@app.get("/api/file")
def read_file(path: str):
    try:
        return {"path": path, "content": WS.read(path)}
    except (PermissionError, RuntimeError) as e:
        raise HTTPException(403, str(e))
    except (FileNotFoundError, IsADirectoryError, ValueError) as e:
        raise HTTPException(404, str(e))


@app.put("/api/file")
def write_file(body: dict):
    try:
        WS.write(body["path"], body.get("content", ""))
        return {"ok": True}
    except (PermissionError, RuntimeError, KeyError) as e:
        raise HTTPException(403, str(e))


@app.post("/api/process/start")
async def start_preview():
    if WS.root is None:
        raise HTTPException(400, "open a project first")
    return await asyncio.to_thread(process.start, WS.root)


@app.post("/api/process/stop")
def stop_preview():
    process.stop()
    return {"ok": True}


@app.websocket("/ws/files")
async def ws_files(ws: WebSocket):
    if not origin_ok(ws):
        return await ws.close(code=1008)
    await ws.accept()
    WS.clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        WS.clients.discard(ws)


@app.websocket("/ws/chat")
async def ws_chat(ws: WebSocket):
    if not origin_ok(ws):
        return await ws.close(code=1008)
    await ws.accept()
    history: list[dict] = []
    current: asyncio.Task | None = None
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "stop" and current:
                current.cancel()
                await ws.send_json({"type": "done"})
                continue
            if msg.get("type") == "reset":
                history.clear()
                continue
            if WS.root is None:
                await ws.send_json({"type": "error", "message": "open or create a project first"})
                continue
            if current and not current.done():          # a correction mid-build: stop, then restart with it
                current.cancel()
                await asyncio.sleep(0)
            gpu.ping()
            current = asyncio.create_task(chat.handle(ws, history, msg["message"], msg.get("active_file"), _settings["mode"]))
    except WebSocketDisconnect:
        if current:
            current.cancel()


@app.websocket("/ws/gpu")
async def ws_gpu(ws: WebSocket):
    if not origin_ok(ws):
        return await ws.close(code=1008)
    await ws.accept()
    gpu._clients.add(ws)
    # send current metrics immediately on connect
    m = await gpu.get_metrics()
    await ws.send_json({"type": "metrics", "data": m})
    try:
        while True:
            await ws.receive_text()   # keep-alive; client sends "ping"
    except WebSocketDisconnect:
        pass
    finally:
        gpu._clients.discard(ws)


@app.get("/api/gpu/status")
async def gpu_status():
    return await gpu.get_metrics()


@app.post("/api/gpu/start")
async def gpu_start():
    return await gpu.start_instance()


@app.post("/api/gpu/pause")
async def gpu_pause():
    return await gpu.pause_instance()


@app.get("/api/gpu/sessions")
def gpu_sessions():
    return {"sessions": gpu.get_session_log()}


@app.get("/api/gpu/settings")
def gpu_settings_get():
    return dict(gpu.settings)


@app.post("/api/gpu/settings")
def gpu_settings_set(body: dict):
    if "idle_timeout" in body:
        try:
            gpu.settings["idle_timeout"] = max(60, int(body["idle_timeout"]))
        except (ValueError, TypeError):
            pass
    if "hourly_rate" in body:
        try:
            gpu.settings["hourly_rate"] = max(0.0, float(body["hourly_rate"]))
        except (ValueError, TypeError):
            pass
    return dict(gpu.settings)


@app.get("/api/vault")
def vault_status():
    """Return which services are configured (true/false) — no token values."""
    return vault.status()


@app.post("/api/vault/set")
async def vault_set(body: dict):
    """Store a token and immediately test connectivity."""
    service = body.get("service", "").strip()
    token = body.get("token", "").strip()
    if not service or service not in vault._KEY_MAP:
        raise HTTPException(400, f"unknown service: {service}")
    if not token:
        raise HTTPException(400, "token is required")
    vault.store(service, token)
    result = await vault.test(service)
    return {"stored": True, **result}


@app.delete("/api/vault/{service}")
def vault_delete(service: str):
    if service not in vault._KEY_MAP:
        raise HTTPException(404, "unknown service")
    vault.delete(service)
    return {"ok": True}


@app.post("/api/vault/test/{service}")
async def vault_test(service: str):
    if service not in vault._KEY_MAP:
        raise HTTPException(404, "unknown service")
    return await vault.test(service)


@app.post("/api/vault/hf/deploy-space")
async def vault_hf_deploy_space(body: dict):
    repo_id = (body.get("repo_id") or "").strip()
    if not repo_id or "/" not in repo_id:
        raise HTTPException(400, "repo_id must be 'username/space-name'")
    return await vault.deploy_hf_space(repo_id)


@app.post("/api/vault/github/create-repo")
async def vault_github_create_repo(body: dict):
    name = (body.get("name") or "crane-shipped").strip()
    result = await vault.create_github_repo(name)
    return result


@app.post("/api/clone")
async def clone_project(body: dict):
    """Clone a GitHub repo or mirror a website into a new project.

    body: {url: str, name?: str}
    - GitHub/GitLab URL  → git clone
    - any other URL      → wget --mirror
    """
    import re
    import shutil
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(400, "url required")
    # derive project name
    name = (body.get("name") or "").strip()
    if not name:
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", url.rstrip("/").split("/")[-1].removesuffix(".git"))
    try:
        name = WS.clean_name(name)
    except ValueError:
        raise HTTPException(400, "invalid project name")

    from files import PROJECTS
    dest = PROJECTS / name
    if dest.exists():
        raise HTTPException(409, f"project '{name}' already exists")

    is_git = bool(re.match(r"https?://(github|gitlab|bitbucket)\.com/", url)) or url.endswith(".git")

    import subprocess
    if is_git:
        r = await asyncio.to_thread(
            subprocess.run,
            ["git", "clone", "--depth=1", url, str(dest)],
            capture_output=True, text=True, timeout=120,
        )
    else:
        dest.mkdir(parents=True, exist_ok=True)
        r = await asyncio.to_thread(
            subprocess.run,
            ["wget", "--mirror", "--convert-links", "--adjust-extension",
             "--no-parent", "-P", str(dest), url],
            capture_output=True, text=True, timeout=180,
        )
    if r.returncode != 0:
        if dest.exists() and not any(dest.iterdir()):
            shutil.rmtree(dest, ignore_errors=True)
        raise HTTPException(500, (r.stderr or r.stdout)[-400:].strip())

    return {"ok": True, "name": name, "tree": WS.tree() if WS.root == dest else []}


@app.websocket("/ws/terminal")
async def ws_terminal(ws: WebSocket, target: str = "local"):
    if not origin_ok(ws):
        return await ws.close(code=1008)
    # GCP and NVIDIA terminals don't need an open project
    cwd = WS.root if WS.root else Path.home()
    await terminal.serve(ws, cwd, target=target)


if STATIC.exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{full:path}")
    def spa(full: str):
        f = STATIC / full
        return FileResponse(f if f.is_file() else STATIC / "index.html")
