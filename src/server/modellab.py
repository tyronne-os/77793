"""Model Lab: test any model from any pipeline (Kaggle, Ollama, llama.cpp, HuggingFace, NVIDIA NIM, ...).

Pipelines come from multiavatar.load_pipelines (every provider in opencode.jsonc), so adding a
provider to OpenCode makes it testable here. The model id is free text: any Hugging Face hub id,
any Ollama tag, any NIM id. Results are measured (TTFT, chunks/sec) and never include keys.
"""
from __future__ import annotations

import asyncio
import re
import time

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import multiavatar as ma

router = APIRouter(prefix="/api/lab")
MAX_TARGETS, TEST_TIMEOUT = 6, 90
_pulls: dict[str, dict] = {}


class Target(BaseModel):
    pipeline: str
    model: str = Field(min_length=1, max_length=120)


class CompareReq(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    targets: list[Target] = Field(min_length=1, max_length=MAX_TARGETS)
    temperature: float = 0.3
    max_tokens: int = 200


async def _stream(pl: dict, model: str, prompt: str, temperature: float, max_tokens: int):
    """Yield (kind, text) where kind is 'text' or 'think' (reasoning models emit thinking first)."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(TEST_TIMEOUT, connect=10)) as c:
        async with c.stream("POST", f"{pl['url']}/chat/completions", headers={"Authorization": f"Bearer {pl['key']}"},
                            json={"model": model, "messages": [{"role": "user", "content": prompt}], "stream": True,
                                  "max_tokens": max_tokens, "temperature": temperature}) as r:
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}: {(await r.aread()).decode(errors='replace')[:200]}")
            async for line in r.aiter_lines():
                if not line.startswith("data:") or line[5:].strip() == "[DONE]":
                    continue
                try:
                    d = __import__("json").loads(line[5:])["choices"][0]["delta"]
                except Exception:       # noqa: BLE001
                    continue
                if d.get("content"):
                    yield "text", d["content"]
                elif d.get("reasoning_content") or d.get("reasoning"):
                    yield "think", d.get("reasoning_content") or d.get("reasoning")


async def _run_one(pls: dict, t: Target, prompt: str, temperature: float, max_tokens: int) -> dict:
    pl = pls.get(t.pipeline)
    base = {"pipeline": t.pipeline, "model": t.model}
    if not pl:
        return {**base, "ok": False, "error": f"unknown pipeline '{t.pipeline}'"}
    t0, first, chunks, text, think = time.perf_counter(), None, 0, [], []
    try:
        async with ma._gate(t.pipeline, pl):
            queue_ms = round((time.perf_counter() - t0) * 1000)
            t1 = time.perf_counter()

            async def go():
                nonlocal first, chunks
                async for kind, d in _stream(pl, t.model, prompt, temperature, max_tokens):
                    if first is None:
                        first = time.perf_counter()
                    chunks += 1
                    (text if kind == "text" else think).append(d)
            await asyncio.wait_for(go(), TEST_TIMEOUT)
        end = time.perf_counter()
        gen = max(end - (first or end), 1e-6)
        return {**base, "ok": True, "text": "".join(text)[:1500], "thinking": "".join(think)[:600],
                "note": "reasoning model used the whole budget thinking; raise max_tokens" if think and not text else "", "ttft_ms": round(((first or end) - t1) * 1000),
                "total_ms": round((end - t1) * 1000), "tok_s": round(chunks / gen, 1) if chunks > 1 else None,
                "chunks": chunks, "queue_ms": queue_ms}
    except Exception as e:      # noqa: BLE001 - report per-target failure, keep the others running
        msg = re.sub(r"(nvapi-|hf_|Bearer )\S+", r"\1***", str(e) or type(e).__name__)[:300]
        return {**base, "ok": False, "error": msg, "total_ms": round((time.perf_counter() - t0) * 1000)}


@router.get("/sources")
async def sources():
    """All pipelines with online status and model lists; `default` is Kaggle when it is up."""
    data = await ma.api_pipelines()
    pls = data["pipelines"]
    for p in pls:
        p["models"] = p["models"][:400]
    names = [p["name"] for p in pls if p["online"]]
    default = next((n for n in (ma.os.environ.get("CRANE_DEFAULT_PIPELINE", "kaggle"), "local") if n in names), names[0] if names else None)
    return {"default": default, "pipelines": pls,
            "hints": {"huggingface": "any hub model id, e.g. Qwen/Qwen2.5-Coder-32B-Instruct",
                      "llamacpp": "start: llama-server -m model.gguf --port 8080",
                      "local": "Ollama tag, e.g. dolphin3:8b (pull first if missing)"}}


@router.post("/compare")
async def compare(req: CompareReq):
    pls = ma.load_pipelines()
    results = await asyncio.gather(*(_run_one(pls, t, req.prompt, max(0.0, min(1.5, req.temperature)),
                                              max(8, min(600, req.max_tokens))) for t in req.targets))
    return {"results": results}


class PullReq(BaseModel):
    model: str = Field(pattern=r"^[A-Za-z0-9._:/\-]{1,100}$")


async def _pull(model: str) -> None:
    st = _pulls[model]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(3600, connect=5)) as c:
            async with c.stream("POST", "http://localhost:11434/api/pull", json={"name": model, "stream": True}) as r:
                async for line in r.aiter_lines():
                    if line:
                        j = __import__("json").loads(line)
                        st["status"] = j.get("status", "")
                        if j.get("total"):
                            st["pct"] = round(100 * j.get("completed", 0) / j["total"])
                        if j.get("error"):
                            raise RuntimeError(j["error"])
        st.update(done=True, status="success", pct=100)
    except Exception as e:      # noqa: BLE001
        st.update(done=True, error=str(e)[:200])


@router.post("/ollama-pull")
async def ollama_pull(req: PullReq):
    if _pulls.get(req.model, {}).get("done") is False:
        return _pulls[req.model]
    _pulls[req.model] = {"model": req.model, "done": False, "status": "starting", "pct": 0}
    asyncio.create_task(_pull(req.model))
    return _pulls[req.model]


@router.get("/ollama-pull/{model:path}")
async def pull_status(model: str):
    if model not in _pulls:
        raise HTTPException(404, "no such pull")
    return _pulls[model]


# ── node reachability probe (Beryl Mastering Suite TEST buttons) ───────────────
from urllib.parse import urlparse  # noqa: E402

_LOOPBACK = {"localhost", "127.0.0.1", "::1"}
_ALLOW = {"integrate.api.nvidia.com", "ai.api.nvidia.com", "grpc.nvcf.nvidia.com", "api.anthropic.com",
          "api.x.ai", "router.huggingface.co", "huggingface.co"}


class ProbeReq(BaseModel):
    endpoint: str = Field(min_length=1, max_length=300)


@router.post("/probe")
async def probe(req: ProbeReq):
    """TCP-connect check only (reachable? how fast?). Allowlisted hosts so this cannot scan the network."""
    u = urlparse(req.endpoint if "://" in req.endpoint else f"http://{req.endpoint}")
    host = u.hostname or ""
    extra = {h.strip() for h in ma.os.environ.get("CRANE_PROBE_HOSTS", "").split(",") if h.strip()}
    known = {urlparse(p["url"]).hostname for p in ma.load_pipelines().values()}
    if host not in _LOOPBACK | _ALLOW | extra | known:
        raise HTTPException(400, f"host '{host}' is not an allowed probe target")
    port = u.port or (443 if u.scheme in ("https", "grpcs") else 80)
    t0 = time.perf_counter()
    try:
        _, w = await asyncio.wait_for(asyncio.open_connection(host, port), 3)
        w.close()
        return {"ok": True, "ms": round((time.perf_counter() - t0) * 1000), "host": host, "port": port}
    except Exception as e:      # noqa: BLE001
        return {"ok": False, "host": host, "port": port, "error": type(e).__name__ or "unreachable"}
