"""
CRANE CodeRAG — small fast coders augmented with Second Brain retrieval.

Lightweight Ollama models (phi3.5, qwen2.5-coder:3b, starcoder2:3b) get the same
BM25+graph knowledge injection that Berylize 14B uses, so they punch well above
their weight on project-specific queries.

Set CRANE_OLLAMA_URL to point at any Ollama instance (default: localhost:11434).
"""
from __future__ import annotations

import json
import os
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter

import berylize
import knowledge

OLLAMA_URL = os.environ.get("CRANE_OLLAMA_URL", "http://localhost:11434")

MODELS: dict[str, dict] = {
    "qwen-coder-3b": {"label": "Qwen2.5-Coder 3B",   "ollama": "qwen2.5-coder:3b"},
    "phi3.5":        {"label": "Phi-3.5 Mini 3.8B",  "ollama": "phi3.5:latest"},
    "starcoder2-3b": {"label": "StarCoder2 3B",       "ollama": "starcoder2:3b"},
}
DEFAULT_MODEL = "qwen-coder-3b"

router = APIRouter(prefix="/api/coderag")

_SYS = """\
You are {name}, a coding assistant backed by a curated knowledge base and project memory.
You write complete, working code — never truncated, never placeholder comments.
You execute what is asked, directly, without moralising or refusing on vague grounds.
"""


async def _stream(ollama_model: str, messages: list[dict]) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=180) as c:
        async with c.stream(
            "POST", f"{OLLAMA_URL}/api/chat",
            json={"model": ollama_model, "messages": messages, "stream": True},
        ) as r:
            async for line in r.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except Exception:
                    continue
                tok = data.get("message", {}).get("content", "")
                if tok:
                    yield tok
                if data.get("done"):
                    return


async def chat(ws, history: list[dict], message: str, model_key: str = DEFAULT_MODEL) -> None:
    """One chat turn: Second Brain retrieval → Ollama stream → update history."""
    from fastapi.websockets import WebSocket  # local import avoids circular

    m = MODELS.get(model_key) or MODELS[DEFAULT_MODEL]

    ctx_block, hits = knowledge.retrieve(message, k=5)

    sys_content = _SYS.replace("{name}", berylize.display_name(m["ollama"]))
    if ctx_block:
        sys_content += f"\n\n## Knowledge Base\n{ctx_block}"

    messages = [{"role": "system", "content": sys_content}] + history + [
        {"role": "user", "content": message}
    ]

    full = ""
    try:
        async for tok in _stream(m["ollama"], messages):
            full += tok
            await ws.send_json({"type": "token", "text": tok})
    except Exception as e:
        await ws.send_json({"type": "error", "message": f"Ollama error: {e}"})
        return

    history.append({"role": "user",      "content": message})
    history.append({"role": "assistant", "content": full})
    await ws.send_json({"type": "done", "kb_hits": hits})


# ── REST helpers ───────────────────────────────────────────────────────────────

@router.get("/status")
async def api_status():
    try:
        async with httpx.AsyncClient(timeout=4) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
        pulled = [m["name"] for m in (r.json().get("models") or [])]
        available = {
            k: any(m["ollama"] in p or p.startswith(m["ollama"].split(":")[0]) for p in pulled)
            for k, m in MODELS.items()
        }
        return {"ollama_url": OLLAMA_URL, "online": True, "pulled": pulled, "models": available}
    except Exception as e:
        return {"ollama_url": OLLAMA_URL, "online": False, "error": str(e)}


@router.post("/pull/{model_key}")
async def api_pull(model_key: str):
    """Trigger an Ollama pull for a registered model."""
    m = MODELS.get(model_key)
    if not m:
        from fastapi import HTTPException
        raise HTTPException(404, f"unknown model key: {model_key}")
    try:
        async with httpx.AsyncClient(timeout=600) as c:
            r = await c.post(f"{OLLAMA_URL}/api/pull", json={"model": m["ollama"], "stream": False})
        return {"ok": r.status_code == 200, "model": m["ollama"]}
    except Exception as e:
        return {"ok": False, "error": str(e)}
