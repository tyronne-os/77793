"""
CRANE Multi-Avatar engine for the Beryl Mastering Suite.

1-4 avatar "seats" converse with each other (mode "converse") or answer one prompt
side by side (mode "arena"). Every seat can run on the SAME shared cluster or on its
OWN pipeline (local Ollama, Kaggle GPU tunnel, berylize vLLM, ...) for head-to-head tests.

Pipelines are a server-side registry; clients only pick names (no client-supplied URLs):
  local        CRANE_AVATAR_LLM_URL (default http://localhost:11434/v1), CRANE_AVATAR_MODEL
  <provider>   every provider in ~/.config/opencode/opencode.jsonc (kaggle, berylize, ...)
               - re-read on each call, so `kaggle_set_url.sh` takes effect with no restart
  CRANE_PIPELINES  optional JSON {"name":{"url","key","model","concurrency"}} (overrides)
Each pipeline has its own concurrency gate, so isolated pipelines truly run in parallel.

Client -> server
  start {mode:"converse"|"arena", topic, max_turns, wait_for_speech, policy:"round_robin"|"random"|"mention",
         guard:bool, seats:[{id,name,persona,pipeline?,model?,temperature?,max_tokens?}]}
  say {text, as?, interrupt?}   host line; interrupt=true barges in on the current speaker
  spoke {seat}                  browser finished speaking (gates the next turn)
  stop
Server -> client
  started, turn_start, token, turn_done{text,metrics,quality,pipeline,model}, interrupted,
  warning, finished{summary,run_id}, stopped, error
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
import time
import uuid
from pathlib import Path
from typing import Awaitable, Callable

import httpx
import jev
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

LLM_URL = os.environ.get("CRANE_AVATAR_LLM_URL", "http://localhost:11434/v1").rstrip("/")
API_KEY = os.environ.get("CRANE_AVATAR_API_KEY", "EMPTY")
DEFAULT_MODEL = os.environ.get("CRANE_AVATAR_MODEL", "phi3.5:latest")
OPENCODE_CFG = Path(os.environ.get("CRANE_OPENCODE_CFG", Path.home() / ".config/opencode/opencode.jsonc"))

MAX_SEATS, MAX_TURNS, HISTORY_WINDOW, SPEECH_ACK_TIMEOUT = 4, 200, 24, 90
POLICIES = ("round_robin", "random", "mention", "jev")

router = APIRouter(prefix="/api/multiavatar")

_SYS = """\
You are {name}, a live conversational avatar. {persona}

You are in a spoken conversation with: {others}.
Rules: reply in 1-3 short spoken sentences. No stage directions, no emojis, no markdown, \
and never start your reply with your own name. React to what was just said and move the \
conversation forward."""


# ── pipeline registry ──────────────────────────────────────────────────────────

def _runs_dir() -> Path:
    return Path(os.environ.get("CRANE_RUNS_DIR") or Path(__file__).resolve().parents[2] / "runs" / "mastering")


def _load_jsonc(path: Path) -> dict:
    text = "\n".join(l for l in path.read_text().splitlines() if not l.lstrip().startswith("//"))
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", text))


def _kaggle_first(pls: dict) -> dict:
    """Kaggle is the default pipeline (32 GB RAM, 2xT4); everything else keeps its order after it."""
    d = os.environ.get("CRANE_DEFAULT_PIPELINE", "kaggle")
    return {**({d: pls[d]} if d in pls else {}), **{k: v for k, v in pls.items() if k != d}}


def load_pipelines() -> dict[str, dict]:
    pls: dict[str, dict] = {"local": {"url": LLM_URL, "key": API_KEY, "model": DEFAULT_MODEL,
                                      "concurrency": int(os.environ.get("CRANE_AVATAR_CONCURRENCY", "1"))}}
    try:
        for name, prov in (_load_jsonc(OPENCODE_CFG).get("provider") or {}).items():
            base = ((prov.get("options") or {}).get("baseURL") or "").rstrip("/")
            models = list((prov.get("models") or {}).keys())
            if name == "local" or not base or not models:
                continue
            pls[name] = {"url": base, "key": (prov["options"].get("apiKey") or "EMPTY"),
                         "model": "crane-chat" if "crane-chat" in models else models[0],
                         "concurrency": 2 if name == "kaggle" else 1}
    except Exception:           # noqa: BLE001 - missing/invalid opencode config just means fewer pipelines
        pass
    try:
        for name, cfg in json.loads(os.environ.get("CRANE_PIPELINES") or "{}").items():
            pls[name] = {"url": cfg["url"].rstrip("/"), "key": cfg.get("key", "EMPTY"),
                         "model": cfg["model"], "concurrency": int(cfg.get("concurrency", 1))}
    except Exception:           # noqa: BLE001
        pass
    return _kaggle_first(pls)


_gates: dict[tuple[str, int], asyncio.Semaphore] = {}


def _gate(name: str, pl: dict) -> asyncio.Semaphore:
    key = (name, max(1, pl["concurrency"]))
    return _gates.setdefault(key, asyncio.Semaphore(key[1]))


# ── helpers ────────────────────────────────────────────────────────────────────

def _clean(s: object, limit: int) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:limit]


def _num(v: object, lo: float, hi: float, default: float) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return default


def normalize_seats(raw: list, pls: dict[str, dict]) -> list[dict]:
    seats: list[dict] = []
    for i, s in enumerate((raw or [])[:MAX_SEATS]):
        if not isinstance(s, dict):
            continue
        pipe = _clean(s.get("pipeline") or "local", 32)
        if pipe not in pls:
            raise ValueError(f"unknown pipeline '{pipe}' (available: {', '.join(pls)})")
        seats.append({
            "id": _clean(s.get("id") or f"seat{i + 1}", 32),
            "name": _clean(s.get("name") or f"Avatar {i + 1}", 40),
            "persona": _clean(s.get("persona") or "You are curious, warm and concise.", 600),
            "pipeline": pipe,
            "model": _clean(s.get("model") or pls[pipe]["model"], 80),
            "temperature": _num(s.get("temperature"), 0.0, 1.5, 0.85),
            "max_tokens": int(_num(s.get("max_tokens"), 16, 600, 140)),
        })
    return seats


def _words(t: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", t.lower())


def _trigrams(t: str) -> set:
    w = _words(t)
    return {tuple(w[i:i + 3]) for i in range(len(w) - 2)}


def quality(text: str, prior: list[str]) -> dict:
    """Repetition = share of this turn's word trigrams already said earlier; diversity = unique/total words."""
    w, tri = _words(text), _trigrams(text)
    seen = set().union(*(_trigrams(p) for p in prior)) if prior else set()
    return {"words": len(w), "repetition": round(len(tri & seen) / len(tri), 2) if tri else 0.0,
            "diversity": round(len(set(w)) / len(w), 2) if w else 0.0}


def _build_messages(seat: dict, seats: list[dict], topic: str, transcript: list[dict]) -> list[dict]:
    others = ", ".join(s["name"] for s in seats if s["id"] != seat["id"]) or "the human host"
    msgs = [{"role": "system", "content": _SYS.format(name=seat["name"], persona=seat["persona"], others=others)},
            {"role": "user", "content": f"Conversation topic: {topic or 'open conversation'}"}]
    for t in transcript[-HISTORY_WINDOW:]:
        if t["seat"] == seat["id"]:
            msgs.append({"role": "assistant", "content": t["text"]})
        else:
            msgs.append({"role": "user", "content": f'{t["name"]}: {t["text"]}'})
    merged: list[dict] = []      # chat templates reject consecutive same-role messages
    for m in msgs:
        if merged and merged[-1]["role"] == m["role"] != "system":
            merged[-1]["content"] += "\n" + m["content"]
        else:
            merged.append(dict(m))
    if merged[-1]["role"] == "assistant":
        merged.append({"role": "user", "content": "(continue the conversation)"})
    return merged


async def _stream_llm(pl: dict, model: str, messages: list[dict], temperature: float, max_tokens: int):
    async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=10)) as c:
        async with c.stream("POST", f"{pl['url']}/chat/completions",
                            headers={"Authorization": f"Bearer {pl['key']}"},
                            json={"model": model, "messages": messages, "stream": True,
                                  "max_tokens": max_tokens, "temperature": temperature}) as r:
            if r.status_code != 200:
                raise RuntimeError(f"LLM {r.status_code}: {(await r.aread()).decode(errors='replace')[:300]}")
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    return
                try:
                    delta = json.loads(payload)["choices"][0]["delta"].get("content") or ""
                except Exception:       # noqa: BLE001
                    continue
                if delta:
                    yield delta


# ── session ────────────────────────────────────────────────────────────────────

class Session:
    def __init__(self, send: Callable[[dict], Awaitable[None]]):
        self.send = send
        self.seats: list[dict] = []
        self.pls: dict[str, dict] = {}
        self.transcript: list[dict] = []
        self.topic = ""
        self.runner: asyncio.Task | None = None
        self.spoke, self.stop, self.barge = asyncio.Event(), asyncio.Event(), asyncio.Event()
        self.record: dict = {}
        self._jtasks: list[asyncio.Task] = []

    # -- JEV judge (non-blocking; scores arrive as events)
    async def _judge(self, entry: dict, seat: dict, prior: list[str]) -> None:
        j = await jev.judge_turn(self.topic, seat["persona"], seat["name"], entry["text"], prior)
        if j:
            entry["jev"] = j
            await self.send({"type": "jev_judge", "seat": seat["id"], "turn": entry["turn"], "jev": j})

    # -- generation with metrics
    async def _generate(self, seat: dict, messages: list[dict]) -> dict | None:
        pl = self.pls[seat["pipeline"]]
        t_req = time.perf_counter()
        first = None
        chunks, text, interrupted = 0, "", False
        async with _gate(seat["pipeline"], pl):
            t0 = time.perf_counter()
            gen = _stream_llm(pl, seat["model"], messages, seat["temperature"], seat["max_tokens"])
            try:
                async for tok in gen:
                    if self.stop.is_set():
                        return None
                    if first is None:
                        first = time.perf_counter() - t0
                    chunks += 1
                    text += tok
                    await self.send({"type": "token", "seat": seat["id"], "text": tok})
                    if self.barge.is_set():
                        interrupted = True
                        break
            finally:
                await gen.aclose()
        total = time.perf_counter() - t0
        gen_s = total - (first or 0)
        return {"text": text, "interrupted": interrupted, "metrics": {
            "queue_ms": round((t0 - t_req) * 1000), "ttft_ms": round((first or total) * 1000),
            "total_ms": round(total * 1000), "chunks": chunks,
            "tps": round((chunks - 1) / gen_s, 1) if chunks > 1 and gen_s > 0 else 0.0}}

    def _log(self, seat: dict, turn: int, text: str, res: dict, q: dict) -> dict:
        entry = {"turn": turn, "seat": seat["id"], "name": seat["name"], "pipeline": seat["pipeline"],
                 "model": seat["model"], "text": text, "metrics": res["metrics"], "quality": q}
        self.record["turns"].append(entry)
        return entry

    def _next(self, policy: str, last: int, last_text: str) -> int:
        n = len(self.seats)
        if last < 0:
            return 0
        if policy == "random" and n > 1:
            return random.choice([i for i in range(n) if i != last])
        if policy == "mention":
            for i, s in enumerate(self.seats):
                if i != last and re.search(rf"\b{re.escape(s['name'])}\b", last_text, re.I):
                    return i
        return (last + 1) % n

    async def _converse(self, max_turns: int, policy: str, guard: bool, wait_for_speech: bool) -> None:
        turn, last, last_text, high_rep = 0, -1, "", 0
        while turn < max_turns and not self.stop.is_set():
            if policy == "jev" and last >= 0:
                who = await jev.pick_speaker(last_text, self.seats[last]["name"], [s["name"] for s in self.seats])
                idx = next((i for i, s in enumerate(self.seats) if s["name"] == who), None)
                if idx is None:
                    idx = self._next("mention", last, last_text)
            else:
                idx = self._next(policy, last, last_text)
            seat = self.seats[idx]
            self.barge.clear()
            await self.send({"type": "turn_start", "seat": seat["id"], "turn": turn})
            res = await self._generate(seat, _build_messages(seat, self.seats, self.topic, self.transcript))
            if res is None:
                return
            text = re.sub(rf"^\s*{re.escape(seat['name'])}\s*:\s*", "", res["text"]).strip()
            prior = [t["text"] for t in self.transcript]
            q = quality(text, prior)
            if res["interrupted"]:
                self.transcript.append({"seat": seat["id"], "name": seat["name"], "text": text + " —"})
                self._log(seat, turn, text + " —", res, q)
                await self.send({"type": "interrupted", "seat": seat["id"], "turn": turn, "text": text})
            else:
                self.transcript.append({"seat": seat["id"], "name": seat["name"], "text": text})
                entry = self._log(seat, turn, text, res, q)
                self._jtasks.append(asyncio.create_task(self._judge(entry, seat, prior)))
                await self.send({"type": "turn_done", "seat": seat["id"], "text": text, "turn": turn,
                                 "metrics": res["metrics"], "quality": q,
                                 "pipeline": seat["pipeline"], "model": seat["model"]})
                high_rep = high_rep + 1 if q["repetition"] >= 0.6 else 0
                if guard and high_rep >= 3:
                    await self.send({"type": "warning", "message": "Conversation is looping (3 highly repetitive turns). Stopped by guard."})
                    self.record["guard_tripped"] = True
                    return
                if wait_for_speech:
                    self.spoke.clear()
                    try:
                        await asyncio.wait_for(self.spoke.wait(), SPEECH_ACK_TIMEOUT)
                    except asyncio.TimeoutError:
                        pass
            turn, last, last_text = turn + 1, idx, text

    async def _arena(self) -> None:
        async def one(i: int, seat: dict):
            await self.send({"type": "turn_start", "seat": seat["id"], "turn": i})
            msgs = [{"role": "system", "content": seat["persona"]}, {"role": "user", "content": self.topic}]
            res = await self._generate(seat, msgs)
            if res is None:
                return
            q = quality(res["text"], [])
            entry = self._log(seat, i, res["text"], res, q)
            await self.send({"type": "turn_done", "seat": seat["id"], "text": res["text"], "turn": i,
                             "metrics": res["metrics"], "quality": q,
                             "pipeline": seat["pipeline"], "model": seat["model"]})
            self._jtasks.append(asyncio.create_task(self._judge(entry, seat, [])))
        await asyncio.gather(*(one(i, s) for i, s in enumerate(self.seats)))

    def summary(self) -> dict:
        out: dict[str, dict] = {}
        for s in self.seats:
            ts = [t for t in self.record["turns"] if t["seat"] == s["id"]]
            if not ts:
                continue
            avg = lambda f: round(sum(f(t) for t in ts) / len(ts), 2)      # noqa: E731
            out[s["id"]] = {"name": s["name"], "pipeline": s["pipeline"], "model": s["model"], "turns": len(ts),
                            "avg_ttft_ms": avg(lambda t: t["metrics"]["ttft_ms"]),
                            "avg_tps": avg(lambda t: t["metrics"]["tps"]),
                            "avg_total_ms": avg(lambda t: t["metrics"]["total_ms"]),
                            "avg_words": avg(lambda t: t["quality"]["words"]),
                            "avg_repetition": avg(lambda t: t["quality"]["repetition"]),
                            "avg_diversity": avg(lambda t: t["quality"]["diversity"]),
                            "avg_jev": (round(sum(t["jev"]["score"] for t in ts if "jev" in t) / sum(1 for t in ts if "jev" in t), 2)
                                        if any("jev" in t for t in ts) else None)}
        return out

    def _save(self) -> str:
        rid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
        self.record.update({"id": rid, "summary": self.summary()})
        try:
            d = _runs_dir()
            d.mkdir(parents=True, exist_ok=True)
            (d / f"{rid}.json").write_text(json.dumps(self.record, indent=2))
        except OSError:
            pass
        return rid

    async def _run(self, mode: str, max_turns: int, policy: str, guard: bool, wait_for_speech: bool) -> None:
        try:
            if mode == "arena":
                await self._arena()
            else:
                await self._converse(max_turns, policy, guard, wait_for_speech)
            if self._jtasks:
                await asyncio.gather(*self._jtasks, return_exceptions=True)
                self._jtasks.clear()
            rid = self._save()
            await self.send({"type": "finished", "turns": len(self.record["turns"]),
                             "summary": self.record["summary"], "run_id": rid})
        except asyncio.CancelledError:
            raise
        except Exception as e:      # noqa: BLE001
            await self.send({"type": "error", "message": f"{type(e).__name__}: {e}"})

    # -- control
    async def start(self, msg: dict) -> None:
        await self.halt()
        self.pls = load_pipelines()
        try:
            self.seats = normalize_seats(msg.get("seats"), self.pls)
        except ValueError as e:
            await self.send({"type": "error", "message": str(e)})
            return
        if not self.seats:
            await self.send({"type": "error", "message": "no valid seats"})
            return
        mode = "arena" if msg.get("mode") == "arena" else "converse"
        policy = msg.get("policy") if msg.get("policy") in POLICIES else "round_robin"
        self.topic = _clean(msg.get("topic"), 400)
        self.transcript.clear()
        self.stop.clear()
        max_turns = int(_num(msg.get("max_turns"), 1, MAX_TURNS, 12))
        self.record = {"started": time.strftime("%Y-%m-%dT%H:%M:%S"), "mode": mode, "policy": policy,
                       "topic": self.topic, "seats": self.seats, "turns": []}
        await self.send({"type": "started", "mode": mode, "seats": self.seats})
        self.runner = asyncio.create_task(self._run(
            mode, max_turns, policy, bool(msg.get("guard", True)), bool(msg.get("wait_for_speech", True))))

    async def say(self, msg: dict) -> None:
        text = _clean(msg.get("text"), 500)
        if not text:
            return
        self.transcript.append({"seat": "human", "name": _clean(msg.get("as") or "Host", 30), "text": text})
        if msg.get("interrupt"):
            self.barge.set()
            await self.send({"type": "interrupted", "seat": "*"})   # client cuts any speech in progress
            self.spoke.set()

    async def halt(self) -> None:
        self.stop.set()
        self.spoke.set()
        if self.runner and not self.runner.done():
            self.runner.cancel()
            try:
                await self.runner
            except (asyncio.CancelledError, Exception):     # noqa: BLE001
                pass
        self.runner = None


async def run_session(ws: WebSocket) -> None:
    s = Session(ws.send_json)
    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get("type")
            if kind == "start":
                await s.start(msg)
            elif kind == "say":
                await s.say(msg)
            elif kind == "spoke":
                s.spoke.set()
            elif kind == "stop":
                await s.halt()
                await ws.send_json({"type": "stopped"})
    except WebSocketDisconnect:
        pass
    finally:
        await s.halt()


async def run_headless(msg: dict) -> dict:
    """Run a scenario with no browser/WebSocket; returns the saved run record (used by scripts/run_scenario.py)."""
    events: list[dict] = []

    async def collect(m: dict) -> None:
        events.append(m)
    s = Session(collect)
    await s.start({**msg, "wait_for_speech": False})
    if s.runner:
        await s.runner
    err = next((e for e in events if e["type"] == "error"), None)
    if err:
        raise RuntimeError(err["message"])
    return s.record


# ── REST ───────────────────────────────────────────────────────────────────────

@router.get("/pipelines")
async def api_pipelines():
    pls = load_pipelines()

    async def probe(name: str, pl: dict) -> dict:
        host = re.sub(r"^https?://", "", pl["url"]).split("/")[0]
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.get(f"{pl['url']}/models", headers={"Authorization": f"Bearer {pl['key']}"})
            return {"name": name, "host": host, "model": pl["model"], "concurrency": pl["concurrency"], "online": r.status_code == 200,
                    "latency_ms": round((time.perf_counter() - t0) * 1000),
                    "models": [m.get("id") for m in (r.json().get("data") or [])] if r.status_code == 200 else []}
        except Exception as e:      # noqa: BLE001
            return {"name": name, "host": host, "model": pl["model"], "concurrency": pl["concurrency"],
                    "online": False, "error": type(e).__name__, "models": []}
    return {"pipelines": await asyncio.gather(*(probe(n, p) for n, p in pls.items())), "max_seats": MAX_SEATS,
            "policies": list(POLICIES)}


@router.get("/runs")
async def api_runs():
    d = _runs_dir()
    out = []
    for f in sorted(d.glob("*.json"), reverse=True)[:50] if d.exists() else []:
        try:
            r = json.loads(f.read_text())
            out.append({"id": r["id"], "started": r["started"], "mode": r["mode"], "topic": r["topic"][:80], "turns": len(r["turns"])})
        except Exception:       # noqa: BLE001
            continue
    return {"runs": out}


@router.get("/runs/{run_id}")
async def api_run(run_id: str):
    if not re.fullmatch(r"[\w-]{1,64}", run_id):
        raise HTTPException(400, "bad run id")
    f = _runs_dir() / f"{run_id}.json"
    if not f.exists():
        raise HTTPException(404, "run not found")
    return json.loads(f.read_text())
