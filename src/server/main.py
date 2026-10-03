"""CRANE API (port 8000): REST + WebSockets, and the built UI as static files."""
from __future__ import annotations

import asyncio
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import berylize
import chat
import gpu
import knowledge
import podman as _podman
import process
import terminal
import vault
import coderag
import engineers
import jev
import mcp_server
import multiavatar, modellab, deploy, reports, source
from files import WS

app = FastAPI(title="CRANE")
app.include_router(knowledge.router)
app.include_router(coderag.router)
app.include_router(mcp_server.router)
app.include_router(multiavatar.router)
app.include_router(jev.router)
app.include_router(modellab.router)
app.include_router(deploy.router)
app.include_router(reports.router)
app.include_router(source.router)
app.include_router(engineers.router)
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
    mid = await chat.model_id()
    return {"ok": True, "model": mid, "name": berylize.display_name(mid), "creatives": berylize.CREATIVES_NAME, "llm": chat.QWEN_URL,
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


AVATAR_FACTS = {
    "body": "A 2D animated face inside the CRANE browser app. There is no video render and no camera.",
    "can_see_user": False,
    "can_hear_user": "Only when the user turns the microphone on; otherwise only typed text.",
    "memory": "Writes durable notes to the Second Brain and recalls them by search; does not remember everything.",
    "can_browse_or_act": "Only through the CRANE tools; it cannot take physical actions.",
}


class _HoldDone:
    """Avatar socket proxy: holds back 'done' (which starts speech) until the JEV performance plan is ready."""

    def __init__(self, ws):
        self.ws, self.held = ws, False

    async def send_json(self, m: dict) -> None:
        if m.get("type") == "done":
            self.held = True
            return
        await self.ws.send_json(m)

    async def release(self) -> None:
        if self.held:
            self.held = False
            await self.ws.send_json({"type": "done"})


async def _jev_event(ws: WebSocket, coro, event: str) -> None:
    """Run a JEV node off the critical path and push its result to the UI. Never raises."""
    try:
        r = await coro
        if r:
            await ws.send_json({"type": event, **r} if event == "jev_route" else {"type": event, "result": r})
    except Exception:           # noqa: BLE001  (socket closed or JEV down: the chat turn is unaffected)
        pass


async def _safe_chat(ws: WebSocket, history: list[dict], text: str, active_file: str | None,
                     avatar: bool = False) -> None:
    """Run one chat turn; surface unexpected exceptions to the UI instead of dying silently in the task.
    JEV nodes: avatar turns get perception (mood, delivery style) before the LLM; BUILD turns get a routing/risk read
    in parallel; both feed the memory gate afterwards."""
    try:
        hint, rerank = "", True
        if avatar:
            prev = next((m["content"] for m in reversed(history) if m["role"] == "assistant"), "")
            perc = await jev.perceive(text, prev)
            if perc:
                await ws.send_json({"type": "jev", "perception": perc})
            hint, rerank = jev.style_hint(perc), False          # avatar path skips rerank to keep first-word latency low
        else:
            asyncio.create_task(_jev_event(ws, jev.route_task(text), "jev_route"))
        before = len(history)
        sock = _HoldDone(ws) if avatar else ws
        await chat.handle(sock, history, text, active_file, _settings["mode"], style_hint=hint, rerank=rerank)
        if len(history) > before and history[-1]["role"] == "assistant":
            reply = history[-1]["content"]
            if avatar:
                # performance plan + self-knowledge check run together, ahead of speech (capped, fail-open)
                perf, prop = await asyncio.gather(jev.performance(text, reply), jev.proprioception(reply, AVATAR_FACTS))
                if perf:
                    await ws.send_json({"type": "jev_perf", "performance": perf})
                if prop:
                    await ws.send_json({"type": "jev_proprio", "check": prop})
            asyncio.create_task(_jev_event(ws, jev.remember(text, reply), "jev_memory"))
        if avatar:
            await sock.release()
    except asyncio.CancelledError:
        raise
    except Exception as e:                      # noqa: BLE001
        await ws.send_json({"type": "error", "message": f"chat failed: {type(e).__name__}: {e}"})


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
            current = asyncio.create_task(_safe_chat(ws, history, msg["message"], msg.get("active_file")))
    except WebSocketDisconnect:
        if current:
            current.cancel()


@app.websocket("/ws/avatar-chat")
async def ws_avatar_chat(ws: WebSocket):
    """Dedicated WebSocket for the Mastering Suite avatar — same chat handler, isolated history."""
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
            if current and not current.done():
                current.cancel()
                await asyncio.sleep(0)
            gpu.ping()
            current = asyncio.create_task(_safe_chat(ws, history, msg["message"], msg.get("active_file"), avatar=True))
    except WebSocketDisconnect:
        if current:
            current.cancel()


@app.websocket("/ws/multi-avatar")
async def ws_multi_avatar(ws: WebSocket):
    """Multi-seat avatar conversations: 1-4 avatars talk to each other (see multiavatar.py)."""
    if not origin_ok(ws):
        return await ws.close(code=1008)
    await ws.accept()
    gpu.ping()
    await multiavatar.run_session(ws)


@app.websocket("/ws/engineers")
async def ws_engineers(ws: WebSocket):
    """Engineering team: architect -> engineer -> verifier -> reviewer loop with JEV as team lead (engineers.py)."""
    if not origin_ok(ws):
        return await ws.close(code=1008)
    await ws.accept()
    await engineers.run_session(ws)


@app.websocket("/ws/rag-chat")
async def ws_rag_chat(ws: WebSocket):
    """CodeRAG: small Ollama models + Second Brain retrieval. Isolated history per session."""
    if not origin_ok(ws):
        return await ws.close(code=1008)
    await ws.accept()
    history: list[dict] = []
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "reset":
                history.clear()
                await ws.send_json({"type": "reset_ok"})
                continue
            model_key = msg.get("model", coderag.DEFAULT_MODEL)
            await coderag.chat(ws, history, msg["message"], model_key)
    except WebSocketDisconnect:
        pass



@app.post("/api/services/speaches/tts")
async def speaches_tts(body: dict):
    """Send text to speaches TTS on port 8013 and return base64 audio."""
    import base64
    import httpx as _httpx
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "text required")
    try:
        async with _httpx.AsyncClient(timeout=30) as c:
            r = await c.post("http://127.0.0.1:8013/v1/audio/speech",
                             json={"model": "speaches", "input": text, "voice": "af_bella"})
        if r.status_code == 200:
            return {"ok": True, "audio_b64": base64.b64encode(r.content).decode(),
                    "content_type": r.headers.get("content-type", "audio/wav")}
        return {"ok": False, "message": f"speaches {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "message": f"speaches not reachable: {e}"}


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
            gpu.settings["idle_timeout"] = (0 if int(body["idle_timeout"]) <= 0 else max(60, int(body["idle_timeout"])))
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


@app.get("/api/services/status")
async def services_status():
    """Check which AI service ports are open (8010 Qwen, 8011 MiniMax, 8012 Kokoro)."""
    import socket as _sock
    result: dict[str, bool | None] = {}
    for name, port in [("qwen", 8010), ("minimax", 8011), ("kokoro", 8012)]:
        try:
            s = _sock.socket(_sock.AF_INET, _sock.SOCK_STREAM)
            s.settimeout(0.8)
            result[name] = s.connect_ex(("127.0.0.1", port)) == 0
            s.close()
        except Exception:
            result[name] = False
    return result


@app.post("/api/services/hermes")
async def launch_hermes(body: dict):
    """Launch Hermes: mode=desktop|chat|full (full runs run_crane.sh headlessly)."""
    import subprocess
    mode = (body.get("mode") or "desktop").strip()
    if mode == "full":
        cmd = ["bash", "/mnt/elana/ai_apps/crane/run_crane.sh"]
    else:
        cmd = ["hermes", mode]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, start_new_session=True,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        vault.log_usage("hermes", f"crane/backend:{mode}", note=f"launched {' '.join(cmd)}")
        return {"ok": True, "pid": proc.pid, "mode": mode}
    except FileNotFoundError:
        return {"ok": False, "message": f"Command not found: {cmd[0]}"}
    except Exception as e:
        return {"ok": False, "message": str(e)[:200]}


@app.post("/api/services/kokoro/tts")
async def kokoro_tts(body: dict):
    """Send text to Kokoro TTS on port 8012 and return base64 audio."""
    import base64
    import httpx as _httpx
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "text required")
    try:
        async with _httpx.AsyncClient(timeout=30) as c:
            r = await c.post("http://127.0.0.1:8012/v1/audio/speech",
                             json={"model": "kokoro", "input": text, "voice": "af_bella"})
        if r.status_code == 200:
            vault.log_usage("kokoro", "crane/backend:voice_test", tokens=len(text.split()))
            return {"ok": True, "audio_b64": base64.b64encode(r.content).decode(),
                    "content_type": r.headers.get("content-type", "audio/wav")}
        return {"ok": False, "message": f"Kokoro {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "message": f"Kokoro not reachable: {e}"}


@app.get("/api/vault/usage")
def vault_usage_report():
    """Usage log — last 50 events plus per-service summary."""
    return {"summary": vault.usage_summary(), "recent": vault.get_usage(50)}


@app.get("/api/vault/github/repos")
async def vault_github_repos(page: int = 1):
    """List user's GitHub repos for the Codex-style repo picker."""
    return await vault.list_github_repos(per_page=100, page=page)


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


# ── Podman / Docker endpoints ──────────────────────────────────────────────────

@app.get("/api/podman/status")
async def podman_status():
    return await _podman.status()


@app.get("/api/podman/containers")
async def podman_containers(all: bool = True):
    return await _podman.list_containers(all_=all)


@app.post("/api/podman/containers/{cid}/{action}")
async def podman_container_action(cid: str, action: str):
    if action not in ("start", "stop", "restart", "kill", "remove", "pause", "unpause"):
        raise HTTPException(400, f"unknown action: {action}")
    return await _podman.container_action(cid, action)


@app.get("/api/podman/containers/{cid}/logs")
async def podman_container_logs(cid: str, tail: int = 80):
    return await _podman.container_logs(cid, tail=tail)


@app.get("/api/podman/containers/stats")
async def podman_container_stats():
    return await _podman.container_stats()


@app.get("/api/podman/images")
async def podman_images():
    return await _podman.list_images()


@app.post("/api/podman/images/pull")
async def podman_pull(body: dict):
    image = (body.get("image") or "").strip()
    if not image:
        raise HTTPException(400, "image required")
    return await _podman.pull_image(image)


@app.delete("/api/podman/images/{image_id}")
async def podman_remove_image(image_id: str, force: bool = False):
    return await _podman.remove_image(image_id, force=force)


@app.get("/api/podman/pods")
async def podman_pods():
    return await _podman.list_pods()


@app.post("/api/podman/pods/{pod_id}/{action}")
async def podman_pod_action(pod_id: str, action: str):
    if action not in ("start", "stop", "restart", "remove"):
        raise HTTPException(400, f"unknown action: {action}")
    return await _podman.pod_action(pod_id, action)


@app.get("/api/podman/volumes")
async def podman_volumes():
    return await _podman.list_volumes()


@app.delete("/api/podman/volumes/{name}")
async def podman_volume_remove(name: str):
    return await _podman.volume_action(name, "remove")


@app.get("/api/podman/networks")
async def podman_networks():
    return await _podman.list_networks()


@app.post("/api/podman/containers/{cid}/systemd")
async def podman_systemd(cid: str, new_: bool = False):
    return await _podman.generate_systemd(cid, new_=new_)


@app.post("/api/podman/run")
async def podman_run(body: dict):
    return await _podman.run_container(
        image=body.get("image", ""),
        name=body.get("name", ""),
        ports=body.get("ports", ""),
        env=body.get("env", ""),
        volumes=body.get("volumes", ""),
        detach=body.get("detach", True),
        remove=body.get("remove", False),
        cmd=body.get("cmd", ""),
    )


@app.post("/api/podman/convert")
async def podman_convert(body: dict):
    path = (body.get("path") or "").strip()
    if not path:
        if WS.root:
            path = str(WS.root)
        else:
            raise HTTPException(400, "path required (or open a project)")
    return await _podman.convert_project(path)


# ── Workstation endpoints ──────────────────────────────────────────────────────

@app.get("/api/workstation/status")
async def workstation_status():
    return await _podman.workstation_status()

@app.post("/api/workstation/start")
async def workstation_start(body: dict):
    profile = body.get("profile", "serve")
    return await _podman.workstation_start(profile)

@app.post("/api/workstation/stop")
async def workstation_stop():
    return await _podman.workstation_stop()

@app.post("/api/workstation/pull")
async def workstation_pull(body: dict):
    model = (body.get("model") or "").strip()
    if not model:
        raise HTTPException(400, "model required")
    return await _podman.workstation_pull_model(model)

@app.get("/api/workstation/models")
async def workstation_models():
    return await _podman.workstation_list_models()

@app.post("/api/workstation/build")
async def workstation_build():
    return await _podman.workstation_build_lab()


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
        return FileResponse(f if f.is_file() else STATIC / "index.html", headers={"Cache-Control": "no-store"})
