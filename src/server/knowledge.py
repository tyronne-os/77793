"""Second Brain — Obsidian-vault retrieval for Berylize.

The vault (knowledge/) is plain Markdown with [[wikilinks]], frontmatter and tags, so it opens directly
in Obsidian. This module indexes it for the IDE:

  * chunks notes by heading
  * BM25 ranking with title/tag boosts
  * link-graph expansion: a chunk gains score when notes it links to / is linked from also match,
    so hub notes (concepts, playbooks) surface together with their evidence (papers, repos)

No vector DB and no model download: it runs on the local machine with zero GPU. The retrieved text is
injected into Berylize's prompt as *secondary* context (chat.py); the model's own knowledge stays primary.
"""
from __future__ import annotations

import math
import os
import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException

CRANE_DIR = Path(__file__).resolve().parents[2]
VAULT = Path(os.environ.get("CRANE_VAULT", CRANE_DIR / "knowledge")).expanduser()
MIN_SCORE = float(os.environ.get("CRANE_KB_MIN", "4.0"))   # below this the query is treated as off-topic
MAX_CHUNK = 1400

router = APIRouter(prefix="/api/knowledge")

WIKILINK = re.compile(r"\[\[([^\]\|#\\]+)(?:#[^\]\|\\]*)?(?:\\?\|[^\]]*)?\]\]")
HEADING = re.compile(r"^(#{1,4})\s+(.*)$")
TOKEN = re.compile(r"[a-z0-9]+")
STOP = frozenset("a an and are as at be but by for from has have how i in is it its of on or that the this to was we what when where which with you your do does can should".split())


def tokens(text: str) -> list[str]:
    return [t for t in TOKEN.findall(text.lower()) if t not in STOP and len(t) > 1]


@dataclass
class Note:
    path: str                      # vault-relative
    title: str
    kind: str                      # first folder or 'root'
    tags: list[str]
    links: set[str]                # resolved lowercase titles, filled after all notes are parsed
    raw_links: list[str]
    mtime: float
    chunks: list["Chunk"] = field(default_factory=list)


@dataclass
class Chunk:
    note: str                      # lowercase title key
    heading: str
    text: str
    tf: Counter
    length: int


class Index:
    def __init__(self) -> None:
        self.notes: dict[str, Note] = {}
        self.chunks: list[Chunk] = []
        self.df: Counter = Counter()
        self.avg_len = 1.0
        self.backlinks: dict[str, set[str]] = defaultdict(set)
        self.signature: tuple = ()
        self.built_at = 0.0
        self.last_hits: list[dict] = []
        self.last_query = ""
        self.enabled = True


IDX = Index()


def _signature() -> tuple:
    if not VAULT.exists():
        return ()
    return tuple(sorted((str(p.relative_to(VAULT)), p.stat().st_mtime_ns) for p in VAULT.rglob("*.md")
                        if not any(part.startswith(".") for part in p.relative_to(VAULT).parts)))


def _split(text: str) -> list[tuple[str, str]]:
    """Split a note body into (heading path, text) chunks, each <= MAX_CHUNK chars."""
    out: list[tuple[str, str]] = []
    stack: list[tuple[int, str]] = []
    buf: list[str] = []

    def flush() -> None:
        body = "\n".join(buf).strip()
        buf.clear()
        if not body:
            return
        head = " > ".join(h for _, h in stack)
        if len(body) <= MAX_CHUNK:
            out.append((head, body))
            return
        cur = ""
        for para in re.split(r"\n\s*\n", body):
            if cur and len(cur) + len(para) > MAX_CHUNK:
                out.append((head, cur.strip()))
                cur = ""
            while len(para) > MAX_CHUNK:                       # very long paragraph / table
                out.append((head, para[:MAX_CHUNK]))
                para = para[MAX_CHUNK:]
            cur += para + "\n\n"
        if cur.strip():
            out.append((head, cur.strip()))

    for line in text.splitlines():
        m = HEADING.match(line)
        if m:
            flush()
            level = len(m.group(1))
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, m.group(2).strip()))
        else:
            buf.append(line)
    flush()
    return out


def _parse(path: Path) -> Note:
    rel = str(path.relative_to(VAULT))
    text = path.read_text(errors="replace")
    meta: dict = {}
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            try:
                meta = yaml.safe_load(text[4:end]) or {}
            except yaml.YAMLError:
                meta = {}
            text = text[end + 4:]
    tags = meta.get("tags") or []
    tags = [str(t) for t in (tags if isinstance(tags, list) else [tags])]
    tags += re.findall(r"(?<![\w/])#([A-Za-z][\w/-]+)", text)
    parts = Path(rel).parts
    n = Note(path=rel, title=path.stem, kind=parts[0] if len(parts) > 1 else "root", tags=sorted(set(tags)),
             links=set(), raw_links=[m.strip() for m in WIKILINK.findall(text)], mtime=path.stat().st_mtime)
    for head, body in _split(text):
        searchable = f"{path.stem} {path.stem} {head} {' '.join(n.tags)} {body}"      # title counted twice
        toks = tokens(searchable)
        n.chunks.append(Chunk(note=path.stem.lower(), heading=head, text=body, tf=Counter(toks), length=len(toks) or 1))
    return n


def rebuild() -> dict:
    """Re-read the vault. Cheap (hundreds of small files); called lazily when files change."""
    global IDX
    idx = Index()
    idx.enabled, idx.last_hits, idx.last_query = IDX.enabled, IDX.last_hits, IDX.last_query
    for p in sorted(VAULT.rglob("*.md")) if VAULT.exists() else []:
        if any(part.startswith(".") for part in p.relative_to(VAULT).parts):
            continue
        n = _parse(p)
        idx.notes[n.title.lower()] = n
    for key, n in idx.notes.items():
        n.links = {t.lower() for t in n.raw_links if t.lower() in idx.notes and t.lower() != key}
        for t in n.links:
            idx.backlinks[t].add(key)
        idx.chunks.extend(n.chunks)
    for c in idx.chunks:
        idx.df.update(c.tf.keys())
    idx.avg_len = (sum(c.length for c in idx.chunks) / len(idx.chunks)) if idx.chunks else 1.0
    idx.signature = _signature()
    idx.built_at = time.time()
    IDX = idx
    return stats()


def ensure_fresh() -> None:
    sig = _signature()
    if sig != IDX.signature or not IDX.notes:
        rebuild()


def _bm25(chunk: Chunk, q: list[str], k1: float = 1.5, b: float = 0.75) -> float:
    n = len(IDX.chunks)
    score = 0.0
    for t in set(q):
        f = chunk.tf.get(t, 0)
        if not f:
            continue
        idf = math.log(1 + (n - IDX.df[t] + 0.5) / (IDX.df[t] + 0.5))
        score += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * chunk.length / IDX.avg_len))
    return score


def _stem(t: str) -> str:
    for suf in ("ing", "ed", "es", "s"):
        if t.endswith(suf) and len(t) - len(suf) >= 4:
            return t[: -len(suf)]
    return t


# Domain words that signal "this is about live avatars / the pipeline" even when no note title contains them.
DOMAIN_WORDS = set("""avatar avatars face faces facial lip lips lipsync blink blinking gaze expression expressions emotion emotional
listen listening talk talking speak speaking voice speech video render rendering diffusion latency fps gpu tts asr vad webrtc viseme visemes
uncanny realism realistic stream streaming duplex barge interrupt backchannel digital human humans persona conversational hologram
blendshape blendshapes arkit splat splatting nvidia riva tokkio omniverse audio2face lipsync sync""".split())


GENERIC_TITLE = set("""playbook top part build repair broken live affordable profitable deployment audit debugging cost ceiling economics
long horizon memory start cold block wise generation control delivery conversation brain home map guide human digital""".split())


def _anchors() -> set[str]:
    if IDX.__dict__.get("_anchor_cache_for") != IDX.built_at:
        a = {_stem(t) for t in DOMAIN_WORDS}
        for n in IDX.notes.values():
            if n.kind in ("papers", "repos", "MOC", "research"):
                continue
            a |= {_stem(t) for t in tokens(n.title) if t not in GENERIC_TITLE}
            a |= {_stem(t) for t in n.tags if t not in {"concept", "playbook", "paper", "repo", "index", "moc", "pipeline", "hub", "reference", "build", "debug", "business", "cost", "risk", "persona", "skills", "latency", "quality", "delivery", "brain", "conversation", "audio", "render", "3d"}}
        IDX._anchor_cache_for, IDX._anchor_cache = IDX.built_at, a
    return IDX._anchor_cache


def search(query: str, k: int = 5) -> list[dict]:
    """Top-k chunks for a query. Returns [] when nothing in the vault is relevant."""
    ensure_fresh()
    q = tokens(query)
    if not q or not IDX.chunks:
        return []
    base = [(_bm25(c, q), c) for c in IDX.chunks]
    base = [(s, c) for s, c in base if s > 0]
    if not base:
        return []
    note_best: dict[str, float] = {}
    for s, c in base:
        note_best[c.note] = max(note_best.get(c.note, 0.0), s)
    if max(note_best.values()) < MIN_SCORE:
        return []
    qset = set(q)
    if not (_anchors() & {_stem(t) for t in qset}):     # no domain word at all: not a question for this vault
        return []
    scored = []
    for s, c in base:
        n = IDX.notes[c.note]
        neigh = n.links | IDX.backlinks.get(c.note, set())
        support = sorted((note_best.get(x, 0.0) for x in neigh), reverse=True)[:3]
        graph_bonus = 0.12 * sum(support)                                   # link-graph expansion
        title_hit = 1.0 + 0.3 * len(qset & set(tokens(n.title)))            # title/tag affinity
        scored.append((s * title_hit + graph_bonus, c))
    scored.sort(key=lambda x: -x[0])
    out, per_note = [], Counter()
    top = scored[0][0]
    for s, c in scored:
        if per_note[c.note] >= 2 or s < top * 0.35:
            continue
        per_note[c.note] += 1
        n = IDX.notes[c.note]
        out.append({"note": n.title, "path": n.path, "heading": c.heading, "score": round(s, 2),
                    "kind": n.kind, "text": c.text})
        if len(out) >= k:
            break
    return out


def retrieve(query: str, k: int = 4, max_chars: int = 5500) -> tuple[str, list[dict]]:
    """For chat.py: (prompt block, hit summaries). Empty block when disabled or off-topic."""
    if not IDX.enabled:
        return "", []
    try:
        hits = search(query, k)
    except Exception:
        return "", []
    IDX.last_query = query[:200]
    IDX.last_hits = [{"note": h["note"], "heading": h["heading"], "score": h["score"]} for h in hits]
    if not hits:
        return "", []
    parts, used = [], 0
    for h in hits:
        label = f"[{h['note']}]" + (f" ({h['heading']})" if h["heading"] else "")
        piece = f"{label}\n{h['text']}"
        if used + len(piece) > max_chars:
            break
        parts.append(piece)
        used += len(piece)
    return "\n\n---\n".join(parts), IDX.last_hits


def stats() -> dict:
    kinds = Counter(n.kind for n in IDX.notes.values())
    return {"vault": str(VAULT), "exists": VAULT.exists(), "enabled": IDX.enabled, "notes": len(IDX.notes),
            "chunks": len(IDX.chunks), "links": sum(len(n.links) for n in IDX.notes.values()),
            "kinds": dict(kinds), "built_at": IDX.built_at, "last_query": IDX.last_query, "last_hits": IDX.last_hits}


# ── API ────────────────────────────────────────────────────────────────────────

@router.get("/status")
def api_status():
    ensure_fresh()
    return stats()


@router.post("/reindex")
def api_reindex():
    return rebuild()


@router.post("/toggle")
def api_toggle(body: dict | None = None):
    IDX.enabled = bool((body or {}).get("enabled", not IDX.enabled))
    return {"enabled": IDX.enabled}


@router.get("/search")
def api_search(q: str, k: int = 5):
    return {"query": q, "hits": [{kk: vv for kk, vv in h.items() if kk != "text"} | {"text": h["text"][:400]} for h in search(q, min(k, 12))]}


@router.get("/note")
def api_note(path: str):
    p = (VAULT / path).resolve()
    if VAULT.resolve() not in p.parents or p.suffix != ".md" or not p.exists():
        raise HTTPException(404, "note not found")
    return {"path": path, "text": p.read_text(errors="replace")}


@router.get("/graph")
def api_graph(limit: int = 400):
    ensure_fresh()
    nodes = [{"id": n.title, "kind": n.kind, "tags": n.tags[:6], "degree": len(n.links) + len(IDX.backlinks.get(n.title.lower(), ()))}
             for n in IDX.notes.values()]
    nodes.sort(key=lambda x: -x["degree"])
    nodes = nodes[:limit]
    keep = {n["id"].lower() for n in nodes}
    edges = [{"source": n.title, "target": IDX.notes[t].title} for n in IDX.notes.values() for t in n.links if n.title.lower() in keep and t in keep]
    return {"nodes": nodes, "edges": edges}
