"""CRANE Deploy — one-click pipeline connectivity probe, streamed as SSE.

Each pipeline definition lists its stages in signal-flow order.
The SSE stream emits JSON events so the UI can light each node as it clears.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/deploy")

NIM_GRPC = "grpc.nvcf.nvidia.com"
NIM_REST = "integrate.api.nvidia.com"

PIPELINES: dict[str, dict] = {
    "nvidia-prebuilt": {
        "name": "NVIDIA PRE-BUILT (Tokkio NIM)",
        "description": "Riva ASR → Nemotron 3.5 Lightning 30B → Riva TTS → Audio2Face-3D",
        "stages": [
            {
                "id": "mic", "name": "MIC", "color": "#93c5fd",
                "detail": "Browser WebRTC · client-side VAD · no probe needed",
                "host": None, "port": None, "key_env": None, "ms_budget": 20,
            },
            {
                "id": "asr", "name": "ASR", "color": "#93c5fd",
                "detail": "Riva ASR · NVIDIA NIM gRPC",
                "host": NIM_GRPC, "port": 443, "key_env": "NGC_API_KEY", "ms_budget": 100,
            },
            {
                "id": "llm", "name": "LLM", "color": "#f6d775",
                "detail": "Nemotron 3.5 Lightning 30B · NVIDIA NIM REST",
                "host": NIM_REST, "port": 443, "key_env": "NGC_ENTERPRISE_KEY",
                "nim_model": "nvidia/nemotron-3.5-lightning-30b-a3b", "ms_budget": 350,
            },
            {
                "id": "tts", "name": "TTS", "color": "#c4b5fd",
                "detail": "Riva TTS · NVIDIA NIM gRPC",
                "host": NIM_GRPC, "port": 443, "key_env": "NGC_API_KEY", "ms_budget": 160,
            },
            {
                "id": "a2f", "name": "A2F", "color": "#c4b5fd",
                "detail": "Audio2Face-3D · NVIDIA NIM gRPC blendshapes",
                "host": NIM_GRPC, "port": 443, "key_env": "NGC_API_KEY", "ms_budget": 40,
            },
            {
                "id": "anm", "name": "ANM", "color": "#6ee7b7",
                "detail": "AnimGraph · client-side pose blending",
                "host": None, "port": None, "key_env": None, "ms_budget": 33,
            },
            {
                "id": "ov", "name": "OV", "color": "#fda4af",
                "detail": "Omniverse RTX · on-prem only in NIM mode",
                "host": None, "port": None, "key_env": None, "ms_budget": 50,
                "note": "Omniverse requires a local GPU node (on-prem or GKE A100). NIM cloud mode skips this stage.",
                "skip": True,
            },
        ],
    },
}


async def _tcp(host: str, port: int, timeout: float = 5.0) -> tuple[bool, int]:
    t0 = time.monotonic()
    try:
        _, w = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
        w.close()
        try:
            await w.wait_closed()
        except Exception:
            pass
        return True, int((time.monotonic() - t0) * 1000)
    except Exception:
        return False, int((time.monotonic() - t0) * 1000)


async def _nim_llm(model: str, key: str, timeout: float = 20.0) -> tuple[bool, int, str]:
    import httpx
    err = "no response"
    for attempt in (1, 2):
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=timeout) as c:
                r = await c.post(
                    f"https://{NIM_REST}/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
                )
            ms = int((time.monotonic() - t0) * 1000)
            if r.status_code == 200:
                return True, ms, "authorized"
            if r.status_code in (401, 403):
                return False, ms, f"auth error {r.status_code} - check NGC_ENTERPRISE_KEY"
            err = f"HTTP {r.status_code}"
        except Exception as e:
            err = f"{type(e).__name__}: {str(e)[:100]}"
    return False, int((time.monotonic() - t0) * 1000), err


def _ev(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _stream(pipeline_id: str, slot: int) -> AsyncIterator[str]:
    pl = PIPELINES.get(pipeline_id)
    if not pl:
        yield _ev({"event": "error", "message": f"unknown pipeline: {pipeline_id}"})
        return

    yield _ev({"event": "start", "slot": slot, "pipeline": pipeline_id,
               "name": pl["name"], "description": pl["description"],
               "stages": [{"id": s["id"], "name": s["name"], "color": s["color"],
                           "detail": s["detail"], "ms_budget": s["ms_budget"],
                           "skip": s.get("skip", False)} for s in pl["stages"]]})
    await asyncio.sleep(0.04)

    live = 0
    core = {"asr", "llm", "tts"}
    core_live = set()

    for stage in pl["stages"]:
        sid = stage["id"]
        color = stage["color"]

        if stage.get("skip"):
            yield _ev({"event": "stage", "id": sid, "name": stage["name"], "color": color,
                       "status": "skip", "ms": 0, "detail": stage["detail"],
                       "note": stage.get("note", "skipped")})
            await asyncio.sleep(0.12)
            continue

        if stage["host"] is None:
            yield _ev({"event": "stage", "id": sid, "name": stage["name"], "color": color,
                       "status": "live", "ms": 0, "detail": stage["detail"], "note": "client-side"})
            live += 1
            await asyncio.sleep(0.12)
            continue

        yield _ev({"event": "stage", "id": sid, "name": stage["name"], "color": color,
                   "status": "checking", "detail": stage["detail"]})
        await asyncio.sleep(0.08)

        if "nim_model" in stage:
            key = os.environ.get(stage.get("key_env") or "", "")
            if not key:
                yield _ev({"event": "stage", "id": sid, "name": stage["name"], "color": color,
                           "status": "down", "ms": 0,
                           "note": f'{stage["key_env"]} not set — run setup_enterprise_keys.sh'})
                await asyncio.sleep(0.1)
                continue
            ok, ms, note = await _nim_llm(stage["nim_model"], key)
        else:
            ok, ms = await _tcp(stage["host"], stage["port"])
            note = f"TCP reachable in {ms}ms" if ok else f"{stage['host']}:{stage['port']} unreachable"

        status = "live" if ok else "down"
        if ok:
            live += 1
            if sid in core:
                core_live.add(sid)

        yield _ev({"event": "stage", "id": sid, "name": stage["name"], "color": color,
                   "status": status, "ms": ms, "detail": stage["detail"], "note": note})
        await asyncio.sleep(0.1)

    total = sum(1 for s in pl["stages"] if not s.get("skip"))
    ready = core_live >= core
    yield _ev({"event": "done", "slot": slot, "live": live, "total": total,
               "core_ready": ready,
               "summary": (f"LIVE — {live}/{total} stages connected" if ready
                           else f"PARTIAL — {live}/{total} stages · core pipeline not complete")})


@router.get("/stream/{pipeline_id}")
async def deploy_stream(pipeline_id: str, slot: int = 1):
    return StreamingResponse(
        _stream(pipeline_id, slot),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/pipelines")
def list_pipelines():
    return {
        "pipelines": [
            {"id": pid, "name": pl["name"], "description": pl["description"]}
            for pid, pl in PIPELINES.items()
        ]
    }
