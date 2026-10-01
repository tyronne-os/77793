"""
CRANE Terminal — bash over WebSocket, bridged to xterm.js.

Targets:
  local   — bash in the project directory (default)
  gcp     — gcloud compute ssh berylize-node (interactive SSH)
  nvidia  — local bash pre-loaded with NVIDIA NIM + NGC env vars
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from fastapi import WebSocket, WebSocketDisconnect
from ptyprocess import PtyProcess

NODE    = os.environ.get("CRANE_GPU_NODE",    "berylize-node")
PROJECT = os.environ.get("CRANE_GCP_PROJECT", "posh-eden")
ZONE    = os.environ.get("CRANE_GCP_ZONE",    "us-east1-c")


def _spawn(target: str, cwd: Path) -> PtyProcess:
    base_env = dict(os.environ,
                    TERM="xterm-256color",
                    PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")

    if target == "gcp":
        # Full interactive SSH to berylize-node
        cmd = [
            "gcloud", "compute", "ssh", NODE,
            f"--project={PROJECT}", f"--zone={ZONE}",
            "--", "-t", "bash -l",
        ]
        return PtyProcess.spawn(cmd, cwd=str(Path.home()), env=base_env, dimensions=(24, 160))

    if target == "nvidia":
        # Local bash with NVIDIA NIM + NGC env pre-loaded
        nim_key = os.environ.get("NVIDIA_ENT_KEY") or os.environ.get("NGC_API_KEY", "")
        ngc_key = os.environ.get("NGC_API_KEY", "")
        env = dict(base_env,
                   NVIDIA_API_KEY=nim_key,
                   NGC_API_KEY=ngc_key,
                   NVIDIA_NIM_URL="https://integrate.api.nvidia.com/v1",
                   # banner tells user which mode they're in
                   CRANE_TERMINAL_TARGET="nvidia")
        return PtyProcess.spawn(
            ["bash", "--rcfile",
             _write_nvidia_rc(nim_key, ngc_key)],
            cwd=str(cwd), env=env, dimensions=(24, 160)
        )

    # default: local
    return PtyProcess.spawn(["bash", "-l"], cwd=str(cwd), env=base_env, dimensions=(24, 160))


def _write_nvidia_rc(nim_key: str, ngc_key: str) -> str:
    """Write a temp bashrc that sources the normal profile + prints NVIDIA banner."""
    rc = Path("/tmp/crane_nvidia_rc.sh")
    rc.write_text(f"""#!/bin/bash
[[ -f ~/.bashrc ]] && source ~/.bashrc
export NVIDIA_API_KEY="{nim_key}"
export NGC_API_KEY="{ngc_key}"
export NVIDIA_NIM_URL="https://integrate.api.nvidia.com/v1"
echo -e "\\033[38;5;82m  CRANE NVIDIA TERMINAL\\033[0m"
echo -e "\\033[90m  NIM API : https://integrate.api.nvidia.com/v1\\033[0m"
echo -e "\\033[90m  NGC Key : ${{NGC_API_KEY:0:8}}••••\\033[0m"
echo ""
""")
    rc.chmod(0o600)
    return str(rc)


async def serve(ws: WebSocket, cwd: Path, target: str = "local") -> None:
    await ws.accept()
    try:
        pty = _spawn(target, cwd)
    except Exception as e:
        await ws.send_bytes(f"\r\n\x1b[31m[spawn failed: {e}]\x1b[0m\r\n".encode())
        await ws.close()
        return

    loop = asyncio.get_running_loop()
    q: asyncio.Queue[bytes | None] = asyncio.Queue()

    def reader() -> None:
        try:
            while True:
                data = pty.read(4096)
                loop.call_soon_threadsafe(q.put_nowait, data)
        except EOFError:
            loop.call_soon_threadsafe(q.put_nowait, None)

    reader_task = loop.run_in_executor(None, reader)

    async def pump() -> None:
        while (data := await q.get()) is not None:
            await ws.send_bytes(data)

    pump_task = asyncio.create_task(pump())
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                pty.write(msg["bytes"])
            elif msg.get("text") is not None:
                try:
                    j = json.loads(msg["text"])
                    if j.get("type") == "resize":
                        pty.setwinsize(int(j["rows"]), int(j["cols"]))
                        continue
                except ValueError:
                    pass
                pty.write(msg["text"].encode())
    except WebSocketDisconnect:
        pass
    finally:
        pump_task.cancel()
        if pty.isalive():
            pty.terminate(force=True)
        await asyncio.sleep(0)
        del reader_task
