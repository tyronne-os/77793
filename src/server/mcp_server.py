"""
CRANE MCP Server — exposes Second Brain + file tools to OpenCode (and any MCP client).

Protocol: MCP over SSE at /mcp  (Server-Sent Events, stateless per request)
Tools exposed:
  search_knowledge   — BM25+graph search over the Obsidian vault
  read_note          — read a full vault note by path
  knowledge_status   — vault stats (note count, index state)
"""
from __future__ import annotations

import json
import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

import knowledge

router = APIRouter()

# ── tool definitions ──────────────────────────────────────────────────────────

_TOOLS = [
    {
        "name": "search_knowledge",
        "description": (
            "Search the Second Brain (Obsidian vault) using BM25 + link-graph ranking. "
            "Returns the most relevant chunks from project notes, research papers, "
            "playbooks, and technical references. Use this before answering any "
            "question about the project, architecture, or domain knowledge."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query"},
                "k": {"type": "integer", "description": "Max results (default 5, max 12)", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_note",
        "description": "Read a full vault note by its vault-relative path (e.g. 'projects/crane.md').",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Vault-relative path to the .md file"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "knowledge_status",
        "description": "Return vault stats: note count, chunk count, last index time, and recent query hits.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
]


# ── tool execution ────────────────────────────────────────────────────────────

def _run_tool(name: str, args: dict) -> Any:
    if name == "search_knowledge":
        q = args.get("query", "")
        k = min(int(args.get("k", 5)), 12)
        hits = knowledge.search(q, k=k)
        if not hits:
            return "No relevant notes found for this query."
        parts = []
        for h in hits:
            label = f"**{h['note']}**" + (f" › {h['heading']}" if h["heading"] else "")
            parts.append(f"{label} (score {h['score']})\n{h['text']}")
        return "\n\n---\n".join(parts)

    if name == "read_note":
        from pathlib import Path
        import os
        vault = Path(os.environ.get("CRANE_VAULT",
                     Path(__file__).resolve().parents[2] / "knowledge")).expanduser()
        p = (vault / args["path"]).resolve()
        if vault.resolve() not in p.parents or not p.exists():
            return f"Note not found: {args['path']}"
        return p.read_text(errors="replace")

    if name == "knowledge_status":
        knowledge.ensure_fresh()
        return knowledge.stats()

    return f"Unknown tool: {name}"


# ── MCP SSE endpoint ──────────────────────────────────────────────────────────

def _event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.get("/mcp")
async def mcp_sse(request: Request):
    """MCP over SSE — OpenCode connects here for Second Brain tools."""
    async def stream():
        # 1. capabilities
        yield _event({
            "jsonrpc": "2.0", "method": "notifications/initialized",
            "params": {"serverInfo": {"name": "CRANE", "version": "1.0"},
                       "capabilities": {"tools": {}}}
        })
        # 2. tool list
        yield _event({
            "jsonrpc": "2.0", "id": "tools-list",
            "result": {"tools": _TOOLS}
        })
        # 3. keep-alive + wait for disconnect
        while not await request.is_disconnected():
            yield ": ping\n\n"
            await __import__("asyncio").sleep(15)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/mcp")
async def mcp_post(request: Request):
    """MCP JSON-RPC POST handler for tool calls."""
    body = await request.json()
    method = body.get("method", "")
    req_id = body.get("id")

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": _TOOLS}}

    if method == "tools/call":
        params = body.get("params", {})
        name = params.get("name", "")
        args = params.get("arguments", {})
        try:
            result = _run_tool(name, args)
            content = result if isinstance(result, str) else json.dumps(result, indent=2)
            return {"jsonrpc": "2.0", "id": req_id,
                    "result": {"content": [{"type": "text", "text": content}], "isError": False}}
        except Exception as e:
            return {"jsonrpc": "2.0", "id": req_id,
                    "result": {"content": [{"type": "text", "text": str(e)}], "isError": True}}

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": req_id,
                "result": {"protocolVersion": "2024-11-05",
                           "serverInfo": {"name": "CRANE", "version": "1.0"},
                           "capabilities": {"tools": {}}}}

    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown method: {method}"}}
