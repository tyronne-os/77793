"""Project file access (path-jailed) and the watchdog -> WebSocket broadcast."""
from __future__ import annotations

import asyncio
import re
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

PROJECTS = Path("/mnt/elana/ai_apps/crane/projects")
IGNORE = {"node_modules", ".git", "dist", "build", ".venv", "__pycache__", ".next", ".vite"}
MAX_READ = 400_000


class Workspace:
    """The one active project: its root, its watcher, and the connected browsers."""

    def __init__(self) -> None:
        self.root: Path | None = None
        self.observer: Observer | None = None
        self.clients: set = set()
        self.loop: asyncio.AbstractEventLoop | None = None
        self._last: dict[str, float] = {}

    # ---- project selection -------------------------------------------------
    @staticmethod
    def clean_name(name: str) -> str:
        n = re.sub(r"[^A-Za-z0-9._-]+", "_", name.strip()).strip("._")
        if not n:
            raise ValueError("empty project name")
        return n

    def list_projects(self) -> list[str]:
        PROJECTS.mkdir(parents=True, exist_ok=True)
        return sorted(p.name for p in PROJECTS.iterdir() if p.is_dir())

    def create(self, name: str) -> str:
        n = self.clean_name(name)
        (PROJECTS / n).mkdir(parents=True, exist_ok=True)
        return n

    def open(self, name: str, loop: asyncio.AbstractEventLoop) -> Path:
        root = (PROJECTS / self.clean_name(name)).resolve()
        if not root.is_dir() or PROJECTS.resolve() not in root.parents:
            raise FileNotFoundError(name)
        self.close()
        self.root, self.loop = root, loop
        handler = _Handler(self)
        self.observer = Observer()
        self.observer.schedule(handler, str(root), recursive=True)
        self.observer.start()
        return root

    def close(self) -> None:
        if self.observer:
            self.observer.stop()
            self.observer = None

    # ---- jailed file ops ---------------------------------------------------
    def safe(self, rel: str) -> Path:
        if self.root is None:
            raise RuntimeError("no project open")
        p = (self.root / rel).resolve()
        if p != self.root and self.root not in p.parents:
            raise PermissionError(f"path escapes project: {rel}")
        if any(part in IGNORE for part in p.relative_to(self.root).parts):
            raise PermissionError(f"path is in an ignored directory: {rel}")
        return p

    def tree(self) -> list[dict]:
        if self.root is None:
            return []
        out: list[dict] = []

        def walk(d: Path, depth: int) -> None:
            for p in sorted(d.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
                if p.name in IGNORE or p.name.startswith(".") and p.name not in {".env.example"}:
                    continue
                out.append({"path": str(p.relative_to(self.root)), "name": p.name,
                            "dir": p.is_dir(), "depth": depth})
                if p.is_dir() and depth < 8:
                    walk(p, depth + 1)

        walk(self.root, 0)
        return out

    def read(self, rel: str) -> str:
        p = self.safe(rel)
        if p.stat().st_size > MAX_READ:
            raise ValueError("file too large to open")
        return p.read_text(errors="replace")

    def write(self, rel: str, content: str) -> None:
        p = self.safe(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def write_binary(self, rel: str, data: bytes) -> None:
        p = self.safe(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def delete(self, rel: str) -> None:
        p = self.safe(rel)
        if p.is_file():
            p.unlink()
        else:
            raise IsADirectoryError(rel)

    # ---- broadcast ---------------------------------------------------------
    async def broadcast(self, msg: dict) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:
                self.clients.discard(ws)

    def _fire(self, path: str, kind: str) -> None:
        if not self.root or not self.loop:
            return
        try:
            rel = str(Path(path).resolve().relative_to(self.root))
        except ValueError:
            return
        if any(part in IGNORE for part in Path(rel).parts):
            return
        now = time.monotonic()
        if now - self._last.get(rel, 0) < 0.05:  # collapse editor double-writes
            return
        self._last[rel] = now
        msg: dict = {"event": kind, "path": rel}
        if kind != "delete":
            try:
                p = Path(path)
                if p.is_file() and p.stat().st_size <= MAX_READ:
                    msg["content"] = p.read_text(errors="replace")
            except OSError:
                return
        asyncio.run_coroutine_threadsafe(self.broadcast(msg), self.loop)


class _Handler(FileSystemEventHandler):
    def __init__(self, ws: Workspace) -> None:
        self.ws = ws

    def on_modified(self, e):
        if not e.is_directory:
            self.ws._fire(e.src_path, "change")

    def on_created(self, e):
        self.ws._fire(e.src_path, "tree" if e.is_directory else "change")

    def on_deleted(self, e):
        self.ws._fire(e.src_path, "delete")

    def on_moved(self, e):
        self.ws._fire(e.dest_path, "change")


WS = Workspace()
