"""CRANE Reports — triage incident log and pipeline health history."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/reports")

DATA_DIR = Path(__file__).parent / "data"
TRIAGE_LOG = DATA_DIR / "triage_reports.jsonl"


def _ensure_dir() -> None:
    DATA_DIR.mkdir(exist_ok=True)


# ── models ────────────────────────────────────────────────────────────────────

class NodeRecord(BaseModel):
    id: str
    tag: str
    error: str | None = None
    error_code: str | None = None
    resolved_at_iso: str | None = None
    resolved_by: str | None = None    # "auto-retest" | "manual-test" | "connect" | "clear"


class TriageRecord(BaseModel):
    pipeline: str
    opened_at_iso: str
    cleared_at_iso: str | None = None
    duration_ms: int
    nodes: list[NodeRecord]
    feed_summary: list[str]           # key SYS+LEAD lines (caller trims to most important)
    gpu_host: str | None = None


# ── routes ────────────────────────────────────────────────────────────────────

@router.post("/triage")
async def save_triage(record: TriageRecord):
    _ensure_dir()
    entry = record.model_dump()
    entry["saved_at_iso"] = datetime.now(timezone.utc).isoformat()
    with TRIAGE_LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    return {"ok": True, "saved_at_iso": entry["saved_at_iso"]}


@router.get("/triage")
async def list_triage(limit: int = 50):
    _ensure_dir()
    if not TRIAGE_LOG.exists():
        return {"records": []}
    lines = TRIAGE_LOG.read_text().strip().splitlines()
    records = []
    for line in reversed(lines[-limit:]):
        try:
            records.append(json.loads(line))
        except Exception:
            pass
    return {"records": records}


@router.get("/triage/export")
async def export_triage():
    _ensure_dir()
    if not TRIAGE_LOG.exists():
        return JSONResponse({"records": []}, headers={"Content-Disposition": "attachment; filename=triage_reports.json"})
    lines = TRIAGE_LOG.read_text().strip().splitlines()
    records = []
    for line in lines:
        try:
            records.append(json.loads(line))
        except Exception:
            pass
    return JSONResponse({"records": records, "exported_at_iso": datetime.now(timezone.utc).isoformat()},
                        headers={"Content-Disposition": "attachment; filename=triage_reports.json"})
