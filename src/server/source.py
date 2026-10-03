"""CRANE Source — read-only browser for the project's own code, for auditing the pipeline.

Secrets are never served: secret-looking files are skipped and key-shaped strings are redacted.
"""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/source")

ROOT = Path(__file__).resolve().parents[2]
SCAN = ["src/server", "src/client/src", "scripts", "tests", "HANDOFF.md", "run_crane.sh"]
SKIP_DIRS = {"node_modules", ".venv", "static", ".git", "__pycache__", "dist", ".vite"}
TEXT_EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".jsonl", ".css", ".html", ".md", ".sh", ".yaml", ".yml", ".toml", ".txt"}
SECRET_NAME = re.compile(r"(\.env|secret|credential|token|opencode|hostinger|\.key$|\.pem$|id_rsa)", re.I)
SECRET_VAL = re.compile(r"(nvapi-[A-Za-z0-9_\-]{20,}|hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_\-]{20,}|ghp_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_\-]{30,})")
MAX_BYTES = 600_000


def _ok(p: Path) -> bool:
    return (p.is_file() and p.suffix in TEXT_EXT and not SECRET_NAME.search(p.name)
            and not (set(p.relative_to(ROOT).parts) & SKIP_DIRS))


@router.get("/tree")
def tree() -> dict:
    out: list[dict] = []
    for entry in SCAN:
        base = ROOT / entry
        files = [base] if base.is_file() else sorted(base.rglob("*")) if base.is_dir() else []
        for f in files:
            if _ok(f):
                out.append({"path": f.relative_to(ROOT).as_posix(), "size": f.stat().st_size})
    return {"root": ROOT.name, "files": out}


@router.get("/file")
def read_file(path: str) -> dict:
    p = (ROOT / path).resolve()
    if ROOT not in p.parents and p != ROOT:
        raise HTTPException(400, "outside project")
    if not p.exists() or not _ok(p):
        raise HTTPException(404, "not available")
    if p.stat().st_size > MAX_BYTES:
        raise HTTPException(413, "file too large to display")
    text = p.read_text(errors="replace")
    redacted = len(SECRET_VAL.findall(text))
    return {"path": path, "content": SECRET_VAL.sub("[REDACTED]", text), "redacted": redacted}
