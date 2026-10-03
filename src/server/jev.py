"""JEV: TypeSafe System One decision layer for CRANE.

JEV is NOT a chat model. It takes a small `state` plus typed questions (choice / score / noul) and returns
calibrated probabilities in ~0.5s. CRANE keeps every model that generates text; JEV is inserted at the
decision points around them, where a fast, calibrated judgment beats a heuristic or a second LLM call.

Design rules (from the TypeSafe docs and the jev-1.13 jaggedness page):
  * One call per decision, many atomic questions inside it (they run in parallel server-side).
  * Literal, specific instructions. Arithmetic, dates and counting stay in code.
  * Send only the state a question needs. State is untrusted data, so code owns policy.
  * Confidence gates action; a failed, slow or unconfigured JEV returns None and CRANE behaves as before.
  * High-stakes choices are asked twice with the options reversed; a disagreement counts as uncertain.

The API key never leaves the server and is never logged. Clients can only trigger the named rubrics below.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import time
from collections import OrderedDict, deque
from pathlib import Path

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api/jev", tags=["jev"])

URL = "https://api.typesafe.ai/v1/systemone"
MODEL = os.environ.get("CRANE_JEV_MODEL", "jev-latest")
TIMEOUT = float(os.environ.get("CRANE_JEV_TIMEOUT", "2.5"))      # a node may never stall the avatar longer than this
CACHE_TTL = 120.0
CACHE_MAX = 256
MAX_STATE_CHARS = 6000

_state = {"enabled": os.environ.get("CRANE_JEV", "1") != "0"}
_stats: dict = {"calls": 0, "cache_hits": 0, "errors": 0, "last_error": None, "total_ms": 0.0,
                "input_tokens": 0, "output_tokens": 0, "by_backend": {}}
_cache: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
_sem = asyncio.Semaphore(6)
_client: httpx.AsyncClient | None = None
_transport: httpx.AsyncBaseTransport | None = None               # tests inject a fake here


# ── transport: the real TypeSafe System One API (key stays server-side, sent only to api.typesafe.ai) ──────────
# A circuit breaker skips the API for a minute after repeated failures, so an outage fails open (CRANE behaves as
# before) instead of adding timeouts to every avatar turn.

BREAKER_FAILS, BREAKER_COOLDOWN = 3, 60.0
_fails: dict[str, int] = {}
_down_until: dict[str, float] = {}


def _key() -> str | None:
    return os.environ.get("JEV_API_KEY") or os.environ.get("TYPESAFE_API_KEY") or None


def _backends() -> list[dict]:
    k = _key()
    return [{"name": "typesafe", "url": URL, "model": MODEL, "key": k}] if k else []


def available() -> bool:
    return _state["enabled"] and bool(_backends())


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT, connect=3.0), follow_redirects=False,
                                    trust_env=False, transport=_transport)
    return _client


def reset_for_tests(transport: httpx.AsyncBaseTransport | None = None) -> None:
    global _client, _transport
    _client, _transport = None, transport
    _cache.clear()
    _fails.clear()
    _down_until.clear()
    for k in _stats:
        _stats[k] = 0 if k not in ("last_error", "by_backend") else ({} if k == "by_backend" else None)
    _receipt["nodes"].clear()
    _receipt["events"].clear()


def _clip(v, n: int = 700):
    if isinstance(v, str):
        return v[:n]
    if isinstance(v, list):
        return [_clip(x, n) for x in v[:12]]
    if isinstance(v, dict):
        return {k: _clip(x, n) for k, x in v.items()}
    return v


async def _call(b: dict, state, questions: dict, timeout: float) -> tuple[dict, dict]:
    headers = {"Authorization": f"Bearer {b['key']}"} if b["key"] else {}
    async with _sem:
        r = await asyncio.wait_for(_http().post(b["url"], headers=headers,
                                                json={"model": b["model"], "state": state, "questions": questions}), timeout)
    if r.status_code != 200:
        raise RuntimeError(f"http_{r.status_code}")
    data = r.json()
    if not isinstance(data["answers"], dict):
        raise ValueError("bad_shape")
    return data["answers"], (data.get("usage") or {})


async def ask(state, questions: dict, *, timeout: float | None = None, use_cache: bool = True) -> dict | None:
    """One evaluation (circuit-broken, fail-open). Returns {question_id: answer} or None. Never raises."""
    backends = _backends()
    if not _state["enabled"] or not backends or not questions:
        return None
    state = _clip(state)
    ck = hashlib.sha1(json.dumps([state, questions], sort_keys=True, default=str).encode()).hexdigest()
    now = time.monotonic()
    if use_cache and ck in _cache and now - _cache[ck][0] < CACHE_TTL:
        _stats["cache_hits"] += 1
        _cache.move_to_end(ck)
        return _cache[ck][1]
    if len(json.dumps(state, default=str)) > MAX_STATE_CHARS:
        _stats["errors"] += 1
        _stats["last_error"] = "state_too_large"
        return None
    budget = timeout or TIMEOUT
    deadline = now + budget
    live = [b for b in backends if _down_until.get(b["name"], 0) <= now]
    for b in live:
        left = deadline - time.monotonic()
        if left <= 0.05:
            break
        per = left
        t0 = time.monotonic()
        try:
            answers, usage = await _call(b, state, questions, per)
        except asyncio.TimeoutError:
            _fail(b["name"], "timeout")
            continue
        except Exception as e:                      # noqa: BLE001  (category only; never echo bodies or headers)
            _fail(b["name"], str(e) if isinstance(e, RuntimeError) else type(e).__name__)
            continue
        _fails[b["name"]] = 0
        _stats["calls"] += 1
        _stats["total_ms"] += (time.monotonic() - t0) * 1000
        _stats["by_backend"][b["name"]] = _stats["by_backend"].get(b["name"], 0) + 1
        _stats["input_tokens"] += int(usage.get("input_tokens", 0) or 0)
        _stats["output_tokens"] += int(usage.get("output_tokens", 0) or 0)
        _cache[ck] = (now, answers)
        while len(_cache) > CACHE_MAX:
            _cache.popitem(last=False)
        return answers
    return None


def _fail(name: str, why: str) -> None:
    _stats["errors"] += 1
    _stats["last_error"] = f"{name}:{why}"
    _fails[name] = _fails.get(name, 0) + 1
    if _fails[name] >= BREAKER_FAILS:
        _down_until[name] = time.monotonic() + BREAKER_COOLDOWN
        _fails[name] = 0


# ── receipt: a live, per-session record of what was verified (the "face with a receipt") ─────────────────────

_receipt: dict = {"since": time.strftime("%Y-%m-%dT%H:%M:%S"), "nodes": {}, "events": deque(maxlen=60)}


def _note(node: str, flagged: bool = False, detail: str = "") -> None:
    n = _receipt["nodes"].setdefault(node, {"checked": 0, "flagged": 0})
    n["checked"] += 1
    if flagged:
        n["flagged"] += 1
        _receipt["events"].append({"t": time.strftime("%H:%M:%S"), "node": node, "detail": detail[:160]})


def receipt() -> dict:
    checked = sum(v["checked"] for v in _receipt["nodes"].values())
    flagged = sum(v["flagged"] for v in _receipt["nodes"].values())
    calls = max(_stats["calls"], 1)
    return {"since": _receipt["since"], "checked": checked, "flagged": flagged,
            "clean_rate": round(1 - flagged / checked, 3) if checked else None,
            "nodes": _receipt["nodes"], "recent_flags": list(_receipt["events"])[-12:],
            "served_by": _stats["by_backend"], "avg_latency_ms": round(_stats["total_ms"] / calls),
            "note": "Calibrated model judgments (advisory). Counts are of checks run this session, not a guarantee."}


# ── answer helpers ───────────────────────────────────────────────────────────────────────────────────────

def yes(ans: dict | None, key: str, default: float = 0.0) -> float:
    """Probability of yes for a noul."""
    a = (ans or {}).get(key)
    return float(a["noul"]) if isinstance(a, dict) and "noul" in a else default


def pick(ans: dict | None, key: str, min_conf: float = 0.0, flip: str | None = None) -> tuple[str | None, float]:
    """(choice, confidence). With `flip` (the reversed-order twin question) a disagreement means (None, 0)."""
    a = (ans or {}).get(key)
    if not isinstance(a, dict) or "choice" not in a:
        return None, 0.0
    c, conf = a["choice"], float(a.get("confidence", 0.0) or 0.0)
    if flip:
        b = ans.get(flip)
        if isinstance(b, dict) and b.get("choice") != c:
            return None, 0.0
        if isinstance(b, dict):
            conf = min(conf, float(b.get("confidence", 0.0) or 0.0))
    return (c, conf) if conf >= min_conf else (None, conf)


def level(ans: dict | None, key: str, levels: int) -> float:
    """Score normalised to 0..1 (levels = number of rubric levels). Used for thresholds, never for magnitude maths."""
    a = (ans or {}).get(key)
    if not isinstance(a, dict) or "score" not in a or levels < 2:
        return 0.0
    return max(0.0, min(1.0, float(a["score"]) / (levels - 1)))


def _choice_q(instr: str, criteria: dict) -> dict:
    return {"type": "choice", "instructions": instr, "criteria": criteria}


def _twin(q: dict) -> dict:
    """Same choice with the options in reverse order (jev leans to the first option; agreement = stable)."""
    return {**q, "criteria": dict(reversed(list(q["criteria"].items())))}


def _noul(instr: str) -> dict:
    return {"type": "noul", "instructions": instr}


def _score(instr: str, levels: list[str]) -> dict:
    return {"type": "score", "instructions": instr, "criteria": levels}


# ── NODE 1 · MASTERING avatar: perception (runs in parallel with the first LLM wait) ─────────────────────────

_EMOTIONS = {
    "warm": "The user is friendly, grateful or relaxed",
    "neutral": "A plain factual message with no clear emotion",
    "excited": "The user is enthusiastic or celebrating",
    "concerned": "The user is worried, confused or stressed",
    "frustrated": "The user is annoyed or angry",
}
_INTENTS = {
    "question": "The user asks for information or an explanation",
    "command": "The user asks the avatar to do or change something",
    "repeat_request": "The user asks the avatar to repeat, rephrase or slow down",
    "chitchat": "Greeting or small talk",
    "complaint": "The user complains or reports a problem",
    "farewell": "The user is ending the conversation",
    "other": "None of the other options fit",
}
_BREVITY = ["One short sentence is enough", "Two or three sentences are needed", "A detailed multi-part answer is needed"]
_FORMAL = ["Casual, slangy or very informal", "Neutral everyday register", "Formal or professional register"]

# avatar mood (what its FACE shows) is policy owned by code, derived from the user's emotion
_MOOD = {"warm": "warm", "neutral": "neutral", "excited": "excited", "concerned": "caring", "frustrated": "calm"}
_PROSODY = {"warm": (1.0, 1.0), "neutral": (1.0, 1.0), "excited": (1.08, 1.06), "caring": (0.93, 0.97), "calm": (0.9, 0.95)}


async def perceive(user_text: str, avatar_prev: str = "") -> dict | None:
    """What kind of moment is this? One fan-out call: emotion, intent, wanted length, register, urgency."""
    emo = _choice_q("What emotion does the user's message express?", _EMOTIONS)
    intent = _choice_q("What is the user's message asking for?", _INTENTS)
    ans = await ask({"user_message": user_text, "avatar_previous_reply": avatar_prev[-400:]}, {
        "emotion": emo, "emotion_r": _twin(emo),
        "intent": intent, "intent_r": _twin(intent),
        "brevity": _score("How much detail does the user's message call for in the reply?", _BREVITY),
        "formality": _score("What register is the user's message written in?", _FORMAL),
        "urgent": _noul("Does the user's message say or clearly imply that it is urgent?"),
        "wants_repeat": _noul("Is the user asking the avatar to repeat, rephrase or slow down what it just said?"),
    })
    if ans is None:
        return None
    emotion, e_conf = pick(ans, "emotion", 0.5, "emotion_r")
    intent_v, i_conf = pick(ans, "intent", 0.5, "intent_r")
    emotion = emotion or "neutral"                          # low confidence or unstable: stay neutral, never guess
    _note("perceive")
    mood = _MOOD[emotion]
    rate, pitch = _PROSODY[mood]
    return {"emotion": emotion, "emotion_conf": round(e_conf, 2), "intent": intent_v or "other",
            "intent_conf": round(i_conf, 2), "mood": mood, "tts": {"rate": rate, "pitch": pitch},
            "brevity": round(level(ans, "brevity", 3), 2), "formality": round(level(ans, "formality", 3), 2),
            "urgent": round(yes(ans, "urgent"), 2), "wants_repeat": round(yes(ans, "wants_repeat"), 2)}


def style_hint(p: dict | None) -> str:
    """Turn a perception into one line of reply guidance for the LLM (code owns this policy)."""
    if not p:
        return ""
    bits = []
    if p["wants_repeat"] >= 0.7 or p["intent"] == "repeat_request":
        bits.append("The user wants you to repeat or rephrase your last answer more simply and slowly; do not add new topics")
    if p["brevity"] <= 0.25:
        bits.append("answer in one short spoken sentence")
    elif p["brevity"] >= 0.75:
        bits.append("give a thorough but well-organised answer")
    if p["urgent"] >= 0.7:
        bits.append("lead with the answer immediately, no preamble")
    if p["mood"] == "calm":
        bits.append("the user sounds frustrated: stay calm, acknowledge it briefly, then fix the problem")
    elif p["mood"] == "caring":
        bits.append("the user sounds worried or confused: be reassuring and clear")
    elif p["mood"] == "excited":
        bits.append("match the user's enthusiasm")
    if p["formality"] <= 0.25:
        bits.append("keep a casual tone")
    elif p["formality"] >= 0.75:
        bits.append("keep a professional tone")
    return ("Delivery notes for this reply: " + "; ".join(bits) + ".") if bits else ""


# ── NODE 2 · MASTERING avatar: end-of-turn detection (answer sooner than a silence timeout) ──────────────────

_CUES = {
    "nod": "The user made a point a listener would acknowledge with a small nod",
    "lean_in": "The user said something interesting or important that draws the listener closer",
    "concern": "The user is describing a problem, difficulty or something upsetting",
    "none": "Nothing that needs a visible reaction",
}


async def turn_complete(partial: str) -> dict | None:
    """Has the user finished speaking? Lets the avatar answer ~700ms sooner than waiting for silence."""
    cue_q = _choice_q("What visible reaction would an attentive listener show to the user's message so far?", _CUES)
    ans = await ask({"user_message_so_far": partial}, {
        "complete": _noul("Is the user's message a finished thought that a person would reply to now?"),
        "continues": _noul("Does the message end with a word or phrase such as 'and', 'also', 'so', 'because' or 'but' "
                           "that signals the user is about to say more?"),
        "cue": cue_q, "cue_r": _twin(cue_q),
    }, timeout=1.2)
    if ans is None:
        return None
    c, k = yes(ans, "complete"), yes(ans, "continues")
    cue, cue_conf = pick(ans, "cue", 0.6, "cue_r")
    _note("turn_complete")
    return {"complete": round(c, 2), "continues": round(k, 2), "respond_now": c >= 0.85 and k <= 0.25,
            "listener_cue": cue or "none", "listener_cue_conf": round(cue_conf, 2)}


# ── NODE 2b · MASTERING avatar: performance director (the five realism dimensions) ──────────────────────────
# Typed cues for what a human would DO while saying this reply: emotion + valence/arousal, a micro-expression, where
# the eyes go, a nod, an ending smile, head energy. The client drives the face with them; the same schema maps onto
# render-model expression conditioning later. Timing, cooldowns and blending are code, not model output.

_EMO = {
    "neutral": "Plain, even delivery", "warm": "Friendly and kind", "happy": "Pleased or cheerful",
    "amused": "Lightly amused or playful", "curious": "Interested and inquisitive",
    "concerned": "Worried or empathetic", "apologetic": "Sorry or regretful",
    "serious": "Grave, careful or firm", "excited": "Energetic and enthusiastic",
}
_MICRO = {
    "none": "No facial flash", "brow_flash": "A quick raise of both eyebrows (interest or mild surprise)",
    "brow_knit": "A brief frown of the brows (concentration or concern)", "smile_flick": "A quick smile at one corner of the mouth",
    "lip_press": "A brief pressing of the lips (restraint or care)",
}
_GAZE = {
    "hold": "Holds steady eye contact", "away_think": "Glances up or aside briefly while forming a thought",
    "down_sincere": "Looks down briefly during something sincere or sensitive", "aside_recall": "Glances aside while recalling a fact",
}
_VAL = ["Negative or unpleasant content", "Neutral content", "Positive or pleasant content"]
_ARO = ["Calm and low energy", "Moderate energy", "Energetic and high energy"]
_HEAD = ["Head stays still", "Small head movements", "Expressive head movements"]


async def performance(user_text: str, reply: str) -> dict | None:
    """How would a person perform this reply? One fan-out call over the reply text."""
    emo = _choice_q("What emotion does the avatar_reply convey?", _EMO)
    micro = _choice_q("Which brief involuntary facial flash would a person show while saying avatar_reply?", _MICRO)
    gaze = _choice_q("Where would a person look while saying avatar_reply?", _GAZE)
    ans = await ask({"user_message": user_text, "avatar_reply": reply}, {
        "emotion": emo, "emotion_r": _twin(emo),
        "valence": _score("What is the emotional valence of avatar_reply?", _VAL),
        "arousal": _score("How energetic is avatar_reply?", _ARO),
        "micro": micro, "micro_r": _twin(micro),
        "gaze": gaze, "gaze_r": _twin(gaze),
        "nod": _noul("Does avatar_reply make a point a speaker would emphasise with a small head nod?"),
        "smile_end": _noul("Is avatar_reply warm enough that the speaker would finish it with a small smile?"),
        "head": _score("How much would a person move their head while saying avatar_reply?", _HEAD),
    }, timeout=1.5)
    if ans is None:
        return None
    emotion, ec = pick(ans, "emotion", 0.5, "emotion_r")
    micro_v, mc = pick(ans, "micro", 0.6, "micro_r")
    gaze_v, _gc = pick(ans, "gaze", 0.5, "gaze_r")
    arousal = level(ans, "arousal", 3)
    emotion = emotion or "neutral"
    _note("performance")
    return {"emotion": emotion, "emotion_conf": round(ec, 2), "valence": round(level(ans, "valence", 3), 2),
            "arousal": round(arousal, 2), "micro": micro_v or "none", "micro_conf": round(mc, 2),
            "gaze": gaze_v or "hold", "nod": round(yes(ans, "nod"), 2), "smile_end": round(yes(ans, "smile_end"), 2),
            "head": round(level(ans, "head", 3), 2),
            "lean": "in" if emotion in ("curious", "excited", "concerned") else "none",
            "breath": round(0.3 + 0.5 * arousal, 2)}


async def proprioception(reply: str, facts: dict) -> dict | None:
    """Self-knowledge check (the AWARENESS failure): does the reply claim a state or ability the facts contradict?"""
    ans = await ask({"facts_about_avatar": facts, "avatar_reply": reply}, {
        "contradicts": _noul("Does avatar_reply state something about the avatar's own current state that contradicts facts_about_avatar?"),
        "overclaims": _noul("Does avatar_reply claim the avatar can see, hear, remember or do something that facts_about_avatar says it cannot?"),
    }, timeout=1.5)
    if ans is None:
        return None
    c, o = yes(ans, "contradicts"), yes(ans, "overclaims")
    ok = c < 0.4 and o < 0.4
    _note("proprioception", not ok, f"contradicts={c:.2f} overclaims={o:.2f}")
    return {"consistent": ok, "contradicts": round(c, 2), "overclaims": round(o, 2)}


# ── NODE 3 · MULTI-SUITE: judge + floor control ─────────────────────────────────────────────────────────────

_NATURAL = ["Stilted, robotic or like a written essay", "Acceptable", "Natural, like a person talking"]


async def judge_turn(topic: str, persona: str, name: str, reply: str, prior: list[str]) -> dict | None:
    """Independent quality read of one avatar turn. Composite is weighted in code, so weights are tunable."""
    ans = await ask({"topic": topic, "speaker": name, "speaker_persona": persona[:300], "reply": reply,
                     "previous_turns": prior[-3:]}, {
        "on_topic": _noul("Is the reply relevant to the topic and to the previous turns?"),
        "in_persona": _noul("Does the reply sound like the speaker described in speaker_persona?"),
        "adds_new": _noul("Does the reply add a point that is not already in previous_turns?"),
        "natural": _score("How natural is the reply as spoken conversation?", _NATURAL),
    })
    if ans is None:
        return None
    on, per, new, nat = yes(ans, "on_topic"), yes(ans, "in_persona"), yes(ans, "adds_new"), level(ans, "natural", 3)
    _note("judge_turn", on < 0.4 or per < 0.3, f"{name}: on_topic={on:.2f} in_persona={per:.2f}")
    return {"on_topic": round(on, 2), "in_persona": round(per, 2), "adds_new": round(new, 2), "natural": round(nat, 2),
            "score": round(0.3 * on + 0.2 * per + 0.25 * new + 0.25 * nat, 2)}


async def pick_speaker(last_text: str, speaker: str, names: list[str]) -> str | None:
    """Who is the last line addressed to? None = nobody clearly (caller falls back to round-robin)."""
    others = [n for n in names if n != speaker]
    if len(others) < 2:
        return others[0] if others else None
    q = _choice_q("Which participant is the reply addressed to?",
                  {**{n: f"The reply speaks directly to {n}" for n in others}, "nobody": "No single participant is addressed"})
    ans = await ask({"reply": last_text, "speaker": speaker}, {"to": q, "to_r": _twin(q)}, timeout=1.5)
    c, conf = pick(ans, "to", 0.6, "to_r")
    return c if c in others else None


# ── NODE 4 · BUILD: routing + risk ───────────────────────────────────────────────────────────────────────────

_TASK_KIND = {
    "bug": "Diagnose or fix broken behaviour", "feature": "Implement or change a capability",
    "research": "Find facts or compare options", "docs": "Write or organise documentation",
    "operations": "Deploy, configure or operate systems", "unknown": "Not enough information",
}
_COMPLEX = ["A question or one small edit", "A change spanning a few files", "A multi-file feature or architecture work"]


async def route_task(text: str) -> dict | None:
    """Tier the request: small local RAG model for easy work, the big GPU model for hard work. Risk is advisory."""
    kind = _choice_q("Classify the requested work.", _TASK_KIND)
    ans = await ask({"request": text}, {
        "kind": kind, "kind_r": _twin(kind),
        "complexity": _score("How large is the requested work?", _COMPLEX),
        "risky": _noul("Does the request involve deleting data, production changes, credentials, payments or sending messages?"),
        "missing": _noul("Is essential information missing to start the work?"),
    })
    if ans is None:
        return None
    k, kc = pick(ans, "kind", 0.5, "kind_r")
    cx, risky, missing = level(ans, "complexity", 3), yes(ans, "risky"), yes(ans, "missing")
    tier = "large" if cx >= 0.5 or k in (None, "unknown") else "small"
    _note("route_task", risky >= 0.5, f"risky={risky:.2f} kind={k}")
    return {"kind": k or "unknown", "kind_conf": round(kc, 2), "complexity": round(cx, 2), "tier": tier,
            "risky": round(risky, 2), "missing_context": round(missing, 2), "needs_approval": risky >= 0.5}


# ── NODE 5 · SECOND BRAIN: rerank + memory gate ───────────────────────────────────────────────────────────────

_REL = ["Unrelated to the query", "Background that helps indirectly", "Directly answers or supports the query"]


async def rerank(query: str, hits: list[dict], keep: int = 4) -> list[dict]:
    """Reorder BM25 hits by judged relevance (one Score per passage, one call). On failure: original order."""
    if len(hits) < 2:
        return hits
    cand = hits[:10]
    qs = {f"p{i}": _score(f"How well does passages[{i}].text serve the query?", _REL) for i in range(len(cand))}
    ans = await ask({"query": query, "passages": [{"text": h["text"][:500]} for h in cand]}, qs, timeout=2.0)
    if ans is None:
        return hits[:keep]
    ranked = sorted(range(len(cand)), key=lambda i: (-float(ans.get(f"p{i}", {}).get("score", 0.0)), i))
    kept = [cand[i] for i in ranked if float(ans.get(f"p{i}", {}).get("score", 0.0)) >= 0.5]
    return (kept or [cand[ranked[0]]])[:keep]


async def retrieve_ranked(query: str, k: int = 4, max_chars: int = 5500) -> tuple[str, list[dict]]:
    """Drop-in for knowledge.retrieve: BM25 candidates reranked by JEV. Falls back to plain retrieve."""
    import knowledge
    if not available() or not knowledge.IDX.enabled:
        return await asyncio.to_thread(knowledge.retrieve, query, k, max_chars)
    try:
        hits = await asyncio.to_thread(knowledge.search, query, 8)
    except Exception:           # noqa: BLE001
        return "", []
    if not hits:
        return "", []
    hits = await rerank(query, hits, k)
    parts, used = [], 0
    for h in hits:
        piece = f"[{h['note']}]" + (f" ({h['heading']})" if h["heading"] else "") + f"\n{h['text']}"
        if used + len(piece) > max_chars:
            break
        parts.append(piece)
        used += len(piece)
    return "\n\n---\n".join(parts), [{"note": h["note"], "heading": h["heading"], "score": h["score"]} for h in hits]


_MEM_KIND = {
    "preference": "A lasting preference of the user", "project_fact": "A fact about the user's project or systems",
    "decision": "A decision the user made", "todo": "A task the user wants remembered", "none": "Nothing worth remembering",
}


async def memory_worth(user_text: str, reply: str) -> dict | None:
    """Should this exchange be written to the Second Brain? Sensitive content is never stored."""
    kind = _choice_q("What, if anything, did the user say that is worth remembering in future sessions?", _MEM_KIND)
    ans = await ask({"user_message": user_text, "assistant_reply": reply[:500]}, {
        "kind": kind, "kind_r": _twin(kind),
        "durable": _noul("Does the user's message state a rule, preference, decision or fact that should apply to future work, beyond this one request?"),
        "sensitive": _noul("Does the user's message contain a password, API key, token, or a private personal identifier?"),
    }, timeout=3.0)
    if ans is None:
        return None
    k, kc = pick(ans, "kind", 0.6, "kind_r")
    dur, sens = yes(ans, "durable"), yes(ans, "sensitive")
    _note("memory_gate", sens > 0.5, f"sensitive={sens:.2f}: not stored")
    return {"kind": k or "none", "confidence": round(kc, 2), "durable": round(dur, 2), "sensitive": round(sens, 2),
            "store": bool(k and k != "none" and dur >= 0.8 and sens <= 0.2)}


MEMORY_DIR = lambda: Path(os.environ.get("CRANE_VAULT", Path(__file__).resolve().parents[2] / "knowledge")) / "Memory"  # noqa: E731


def write_memory(kind: str, text: str) -> str | None:
    """Append one dated bullet to knowledge/Memory/<kind>.md (an Obsidian note the BM25 index already picks up)."""
    text = re.sub(r"\s+", " ", text).strip()[:400]
    if not text:
        return None
    try:
        d = MEMORY_DIR()
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{kind}.md"
        if not f.exists():
            f.write_text(f"---\ntags: [memory, {kind}]\n---\n# Memory: {kind}\n\n")
        if text in f.read_text():
            return None
        with f.open("a") as fh:
            fh.write(f"- {time.strftime('%Y-%m-%d')}: {text}\n")
        return str(f)
    except OSError:
        return None


async def remember(user_text: str, reply: str) -> dict | None:
    """Fire-and-forget after a turn: gate with memory_worth, then store."""
    v = await memory_worth(user_text, reply)
    if v and v["store"]:
        v["path"] = write_memory(v["kind"], user_text)
    return v


# ── NODE 7 · ENGINEERS: team-lead decisions ─────────────────────────────────────────────────────────────────

async def review_verdict(review: str, verification: str) -> dict | None:
    """Ship or fix? Two independent noul reads; code decides. None = JEV unavailable (caller parses the text verdict)."""
    ans = await ask({"review": review[-2500:], "verification_output": verification[-2500:]}, {
        "blocking": _noul("Does the review report at least one defect that must be fixed before this work can ship?"),
        "checks_failed": _noul("Does verification_output show a failing test, a build error, or a non-zero exit code?"),
        "no_evidence": _noul("Does verification_output lack any actual command output (only claims that things work)?"),
    }, timeout=4.0)
    if ans is None:
        return None
    b, f, n = yes(ans, "blocking"), yes(ans, "checks_failed"), yes(ans, "no_evidence")
    _note("review_verdict", not (b < 0.4 and f < 0.4 and n < 0.6), f"blocking={b:.2f} failed={f:.2f} no_evidence={n:.2f}")
    return {"blocking": round(b, 2), "checks_failed": round(f, 2), "no_evidence": round(n, 2),
            "pass": b < 0.4 and f < 0.4 and n < 0.6}


async def same_problem(previous_review: str, review: str) -> float:
    """Probability that two consecutive reviews report the same unresolved problem (the team is going in circles)."""
    ans = await ask({"previous_review": previous_review[-1800:], "latest_review": review[-1800:]}, {
        "same": _noul("Does latest_review report the same unresolved defect that previous_review reported?")}, timeout=3.0)
    return yes(ans, "same")


# ── NODE 6 · BACKEND: log triage ──────────────────────────────────────────────────────────────────────────────

_HEALTH = {"healthy": "Running normally", "degraded": "Errors or warnings but still serving", "failing": "Crashed, stuck or unable to serve"}


async def triage_log(log_tail: str) -> dict | None:
    lines = [ln for ln in log_tail.splitlines() if ln.strip()][-40:]          # filter in code: state stays small
    h = _choice_q("What is the health of the service that wrote this log?", _HEALTH)
    ans = await ask({"log_lines": lines}, {
        "health": h, "health_r": _twin(h),
        "restart": _noul("Would restarting the service most likely fix the problem shown in the log?"),
        "oom": _noul("Does the log show the process running out of memory?"),
    })
    if ans is None:
        return None
    v, c = pick(ans, "health", 0.5, "health_r")
    oom = yes(ans, "oom")
    if v is None and oom >= 0.8:                       # an unambiguous hard signal beats an unstable choice
        v, c = "failing", oom
    return {"health": v or "unknown", "confidence": round(c, 2), "restart_helps": round(yes(ans, "restart"), 2),
            "out_of_memory": round(yes(ans, "oom"), 2)}


# ── REST (named rubrics only; clients never send questions) ────────────────────────────────────────────────────

@router.get("/status")
def api_status():
    n = max(_stats["calls"], 1)
    return {"enabled": _state["enabled"], "key_present": _key() is not None, "model": MODEL, "timeout_s": TIMEOUT,
            "avg_latency_ms": round(_stats["total_ms"] / n), **_stats,
            "nodes": ["perceive", "turn_complete", "performance", "proprioception", "judge_turn", "pick_speaker", "route_task", "rerank",
                      "memory_worth", "triage_log"]}


@router.get("/receipt")
def api_receipt():
    return receipt()


@router.post("/toggle")
def api_toggle(body: dict | None = None):
    _state["enabled"] = bool((body or {}).get("enabled", not _state["enabled"]))
    return {"enabled": _state["enabled"]}


@router.post("/test")
async def api_test():
    """One real call. Reports reachability and latency, never the key."""
    t0 = time.monotonic()
    p = await perceive("Hey, could you slow down a little? You lost me.", "The compressor ratio should sit near four to one.")
    return {"ok": p is not None, "latency_ms": round((time.monotonic() - t0) * 1000), "sample": p,
            "error": None if p else (_stats["last_error"] or ("no_key" if not _key() else "disabled"))}


@router.post("/turn")
async def api_turn(body: dict):
    return await turn_complete(str(body.get("text", ""))[:1500]) or {"respond_now": False, "unavailable": True}


@router.post("/route")
async def api_route(body: dict):
    return await route_task(str(body.get("text", ""))[:3000]) or {"unavailable": True}


@router.post("/triage-log")
async def api_triage(body: dict):
    return await triage_log(str(body.get("log", ""))[-6000:]) or {"unavailable": True}
