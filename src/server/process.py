"""Runs the active project's dev server on port 8001."""
from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import time
from pathlib import Path

PREVIEW_PORT = 8001
LOG = Path("/tmp/crane-preview.log")
_proc: subprocess.Popen | None = None


def _env() -> dict:
    env = dict(os.environ)
    env["PATH"] = f"{Path.home()}/.local/bin:{env.get('PATH', '')}"
    env["BROWSER"] = "none"
    return env


def _port_open() -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", PREVIEW_PORT)) == 0


def running() -> bool:
    return _proc is not None and _proc.poll() is None and _port_open()


def detect(root: Path) -> list[str] | None:
    pkg = root / "package.json"
    if pkg.exists():
        try:
            scripts = json.loads(pkg.read_text()).get("scripts", {})
        except ValueError:
            scripts = {}
        if not (root / "node_modules").exists():
            return ["bash", "-lc", f"npm install && npm run dev -- --host 127.0.0.1 --port {PREVIEW_PORT}"]
        if "dev" in scripts:
            return ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", str(PREVIEW_PORT)]
        if "start" in scripts:
            return ["bash", "-lc", f"PORT={PREVIEW_PORT} npm start"]
    if (root / "index.html").exists() or not any(root.iterdir()):
        return ["python3", "-m", "http.server", str(PREVIEW_PORT), "--bind", "127.0.0.1"]
    return None


def start(root: Path, wait: float = 120.0) -> dict:
    global _proc
    stop()
    cmd = detect(root)
    if cmd is None:
        return {"ok": False, "error": "no index.html or package.json dev script yet - ask Qwen to create one"}
    log = open(LOG, "w")
    _proc = subprocess.Popen(cmd, cwd=root, env=_env(), stdout=log, stderr=subprocess.STDOUT,
                             start_new_session=True)
    deadline = time.time() + wait
    while time.time() < deadline:
        if _proc.poll() is not None:
            return {"ok": False, "error": "dev server exited", "log": LOG.read_text()[-1500:]}
        if _port_open():
            return {"ok": True, "url": f"http://localhost:{PREVIEW_PORT}"}
        time.sleep(0.5)
    return {"ok": False, "error": "dev server did not open the port in time", "log": LOG.read_text()[-1500:]}


def stop() -> None:
    global _proc
    if _proc and _proc.poll() is None:
        try:
            os.killpg(os.getpgid(_proc.pid), signal.SIGTERM)
            _proc.wait(timeout=5)
        except Exception:
            try:
                os.killpg(os.getpgid(_proc.pid), signal.SIGKILL)
            except Exception:
                pass
    _proc = None
