"""bash in the project directory, bridged to xterm.js over a WebSocket."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from fastapi import WebSocket, WebSocketDisconnect
from ptyprocess import PtyProcess


async def serve(ws: WebSocket, cwd: Path) -> None:
    await ws.accept()
    env = dict(os.environ, TERM="xterm-256color", PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")
    pty = PtyProcess.spawn(["bash", "-l"], cwd=str(cwd), env=env, dimensions=(24, 100))
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
