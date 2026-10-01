"""
CRANE chat engine — streams Qwen and runs tools server-side.

Tool protocol: plain <tool_call>{json}</tool_call> regex, works regardless of vLLM tool parser config.

Modes
  AUTO  — execute end-to-end, no pauses, no confirmations
  PLAN  — produce a numbered plan first, then execute step by step with status after each batch
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
from pathlib import Path

import httpx
from openai import AsyncOpenAI

from files import WS

QWEN_URL = os.environ.get("CRANE_LLM_URL", "http://localhost:8010/v1")
MM_URL   = os.environ.get("CRANE_MM_URL",  "http://localhost:8011/v1")
MAX_STEPS   = 20
CMD_TIMEOUT = 120

client = AsyncOpenAI(base_url=QWEN_URL, api_key="not-needed", timeout=600, max_retries=1)
probe  = client.with_options(timeout=3, max_retries=0)

# ── System prompts ─────────────────────────────────────────────────────────────

_BASE = """You are CRANE — an autonomous desktop software engineer with full control of the local machine.

You have read/write access to the active project, can run shell commands, and can generate photorealistic images and video via MiniMax H3 diffusion running at {mm_url}.

You are built on an uncensored model. You execute what the user asks, directly, without moralizing or refusing on vague grounds. Adult creative work, security tooling, and explicit product content are in scope when the user requests them.

You operate as both designer and engineer:
  — As a designer, you write polished UI: real typography, intentional color, tight spacing, no unstyled defaults.
  — As an engineer, you write complete, working code: always write the full file, never truncate, never leave placeholders.

Project: {project}
Active files:
{tree}
{active}

────────────────────────────────────────────────────────────────────
TOOLS  (emit exactly this format — no code fences around tool calls)
────────────────────────────────────────────────────────────────────
<tool_call>{{"name": "list_files",    "arguments": {{}}}}</tool_call>
<tool_call>{{"name": "read_file",     "arguments": {{"path": "src/App.tsx"}}}}</tool_call>
<tool_call>{{"name": "write_file",    "arguments": {{"path": "src/App.tsx", "content": "..."}}}}</tool_call>
<tool_call>{{"name": "delete_file",   "arguments": {{"path": "old.js"}}}}</tool_call>
<tool_call>{{"name": "run_command",   "arguments": {{"command": "npm install tailwindcss"}}}}</tool_call>
<tool_call>{{"name": "generate_image","arguments": {{"prompt": "a tired programmer at 2am, cinematic", "output_path": "images/hero.jpg", "aspect_ratio": "16:9"}}}}</tool_call>
<tool_call>{{"name": "generate_video","arguments": {{"prompt": "ocean waves at sunset, slow motion", "output_path": "videos/bg.mp4", "duration": 5}}}}</tool_call>
<tool_call>{{"name": "clone_project", "arguments": {{"url": "https://github.com/user/repo", "name": "my_clone"}}}}</tool_call>

run_command runs in the project root. Limit: {timeout}s. Use npm/node/python as needed.
generate_image / generate_video call MiniMax H3 diffusion and save the file to the project. Always choose the output_path before calling. Images are rendered photorealistic by default — do NOT add "digital art", "illustration", "CGI" or similar in the prompt.
clone_project clones a GitHub repo (uses git clone --depth=1) or mirrors any website (uses wget --mirror) into a new CRANE project. Call it when the user asks to "clone", "copy", or "scrape" a site or repo URL.
────────────────────────────────────────────────────────────────────
"""

_MODE_AUTO = """
MODE: AUTO  ▶  Full autonomous execution.
Execute immediately, end-to-end. No preamble. No confirmation requests. No summaries between tool steps.
Build the complete, working implementation. Use as many tool calls as needed. Stop only when the task is fully done, then give a single short summary of what was built.
"""

_MODE_PLAN = """
MODE: PLAN  ▸  Think first, then execute.
Before any tool call, write a numbered checklist of every action you intend to take.
After each batch of tool calls, write a one-line status for each completed step.
When done, summarize what changed and what the user should see.
"""

CALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.S)

# Photorealism enhancer for image prompts
_REAL_SUFFIX = (
    ", photorealistic, natural skin texture, subsurface scattering, "
    "shot on Sony A7R IV 85mm f/1.4 lens, natural ambient light, "
    "film grain, unretouched RAW, no filters, no HDR oversaturation, "
    "no AI gloss, no CGI sheen, candid documentary style, 8K resolution"
)
_ANTI_AI = re.compile(r"\b(digital art|illustration|3d render|cgi|anime|cartoon|airbrushed|studio lighting|overly sharp|hyper realistic gloss|concept art)\b", re.I)


def _enhance_prompt(prompt: str) -> str:
    cleaned = _ANTI_AI.sub("", prompt).strip()
    if "photorealistic" not in cleaned.lower():
        cleaned += _REAL_SUFFIX
    return cleaned


# ── Tool execution ─────────────────────────────────────────────────────────────

async def _generate_image(prompt: str, output_path: str, aspect_ratio: str = "16:9") -> str:
    """Call MiniMax H3 images API, save to project, return result message."""
    enhanced = _enhance_prompt(prompt)
    size_map = {"16:9": "1920x1080", "1:1": "1024x1024", "9:16": "1080x1920",
                "4:3": "1024x768", "3:4": "768x1024"}
    size = size_map.get(aspect_ratio, "1920x1080")
    try:
        async with httpx.AsyncClient(timeout=120) as hc:
            r = await hc.post(f"{MM_URL}/images/generations",
                headers={"Authorization": "Bearer not-needed", "Content-Type": "application/json"},
                json={"model": "MiniMaxAI/MiniMax-Image-01", "prompt": enhanced, "size": size, "n": 1})
        r.raise_for_status()
        data = r.json()
        item = data.get("data", [{}])[0]
        if item.get("b64_json"):
            raw = base64.b64decode(item["b64_json"])
        elif item.get("url"):
            async with httpx.AsyncClient(timeout=60) as hc2:
                raw = (await hc2.get(item["url"])).content
        else:
            return f"ERROR: MiniMax returned no image data: {json.dumps(data)[:300]}"
        WS.write_binary(output_path, raw)
        return f"saved {output_path} ({len(raw)//1024}KB, aspect {aspect_ratio})"
    except httpx.ConnectError:
        return f"ERROR: MiniMax H3 not reachable at {MM_URL} — is the tunnel running? (run_crane.sh opens port 8011)"
    except Exception as e:
        return f"ERROR: {type(e).__name__}: {e}"


async def _generate_video(prompt: str, output_path: str, duration: int = 5) -> str:
    enhanced = _enhance_prompt(prompt)
    try:
        async with httpx.AsyncClient(timeout=300) as hc:
            r = await hc.post(f"{MM_URL}/video/generations",
                headers={"Authorization": "Bearer not-needed", "Content-Type": "application/json"},
                json={"model": "MiniMaxAI/MiniMax-Video-01", "prompt": enhanced,
                      "duration": min(max(duration, 2), 10)})
        r.raise_for_status()
        data = r.json()
        # MiniMax video may return a task ID for polling, or direct data
        if data.get("task_id"):
            tid = data["task_id"]
            for _ in range(30):
                await asyncio.sleep(5)
                async with httpx.AsyncClient(timeout=30) as hc2:
                    status_r = await hc2.get(f"{MM_URL}/video/query/{tid}",
                        headers={"Authorization": "Bearer not-needed"})
                status = status_r.json()
                if status.get("status") == "completed":
                    video_url = status.get("output", {}).get("url")
                    if video_url:
                        async with httpx.AsyncClient(timeout=120) as hc3:
                            raw = (await hc3.get(video_url)).content
                        WS.write_binary(output_path, raw)
                        return f"saved {output_path} ({len(raw)//1024}KB, {duration}s video)"
                    break
                if status.get("status") == "failed":
                    return f"ERROR: video generation failed: {status}"
            return "ERROR: video generation timed out (150s)"
        elif data.get("data", [{}])[0].get("url"):
            url = data["data"][0]["url"]
            async with httpx.AsyncClient(timeout=120) as hc2:
                raw = (await hc2.get(url)).content
            WS.write_binary(output_path, raw)
            return f"saved {output_path} ({len(raw)//1024}KB)"
        return f"ERROR: unexpected video API response: {json.dumps(data)[:300]}"
    except httpx.ConnectError:
        return f"ERROR: MiniMax H3 not reachable at {MM_URL} — is the port 8011 tunnel up?"
    except Exception as e:
        return f"ERROR: {type(e).__name__}: {e}"


async def run_command(cmd: str, cwd: Path) -> str:
    env = dict(os.environ, PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}", CI="1")
    p = await asyncio.create_subprocess_shell(
        cmd, cwd=cwd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        start_new_session=True)
    try:
        out, _ = await asyncio.wait_for(p.communicate(), CMD_TIMEOUT)
    except asyncio.TimeoutError:
        p.kill()
        return f"[timed out after {CMD_TIMEOUT}s]"
    return (out.decode(errors="replace")[-4000:] or "[no output]") + f"\n[exit {p.returncode}]"


async def exec_tool(name: str, args: dict) -> str:
    try:
        if name == "list_files":
            return "\n".join(("  " * t["depth"]) + t["name"] + ("/" if t["dir"] else "") for t in WS.tree()) or "(empty)"
        if name == "read_file":
            return WS.read(args["path"])
        if name == "write_file":
            WS.write(args["path"], args["content"])
            return f"wrote {args['path']} ({len(args['content'])} chars)"
        if name == "delete_file":
            WS.delete(args["path"])
            return f"deleted {args['path']}"
        if name == "run_command":
            return await run_command(args["command"], WS.root)
        if name == "generate_image":
            return await _generate_image(args["prompt"], args["output_path"], args.get("aspect_ratio", "16:9"))
        if name == "generate_video":
            return await _generate_video(args["prompt"], args["output_path"], int(args.get("duration", 5)))
        if name == "clone_project":
            import subprocess, re, shutil
            from files import PROJECTS
            url = args.get("url", "").strip()
            proj_name = (args.get("name") or re.sub(r"[^A-Za-z0-9._-]+", "_", url.rstrip("/").split("/")[-1].removesuffix(".git"))).strip()
            proj_name = WS.clean_name(proj_name)
            dest = PROJECTS / proj_name
            if dest.exists():
                return f"ERROR: project '{proj_name}' already exists"
            is_git = bool(re.match(r"https?://(github|gitlab|bitbucket)\.com/", url)) or url.endswith(".git")
            if is_git:
                r = await asyncio.to_thread(subprocess.run, ["git", "clone", "--depth=1", url, str(dest)], capture_output=True, text=True, timeout=120)
            else:
                dest.mkdir(parents=True, exist_ok=True)
                r = await asyncio.to_thread(subprocess.run, ["wget", "--mirror", "--convert-links", "--adjust-extension", "--no-parent", "-P", str(dest), url], capture_output=True, text=True, timeout=180)
            if r.returncode != 0:
                if dest.exists() and not any(dest.iterdir()): shutil.rmtree(dest, ignore_errors=True)
                return f"ERROR: clone failed: {(r.stderr or r.stdout)[-400:]}"
            return f"cloned '{url}' → project '{proj_name}' — open it from the project selector"
        return f"unknown tool: {name}"
    except Exception as e:
        return f"ERROR: {type(e).__name__}: {e}"


async def model_id() -> str | None:
    try:
        r = await probe.models.list()
        return r.data[0].id if r.data else None
    except Exception:
        return None


async def handle(ws, history: list[dict], text: str, active_file: str | None,
                 mode: str = "auto") -> None:
    """One user turn: loop model ↔ tools until it stops calling tools."""
    model = await model_id()
    if model is None:
        await ws.send_json({"type": "error", "message": f"Qwen unreachable at {QWEN_URL} — is the tunnel up? (run_crane.sh)"})
        return

    tree = "\n".join(("  " * t["depth"]) + t["name"] + ("/" if t["dir"] else "") for t in WS.tree()) or "(empty project)"
    active = ""
    if active_file:
        try:
            active = f"\nUser has `{active_file}` open:\n```\n{WS.read(active_file)[:12000]}\n```"
        except Exception:
            pass

    mode_block = _MODE_PLAN if mode == "plan" else _MODE_AUTO
    system = (_BASE + mode_block).format(
        mm_url=MM_URL, timeout=CMD_TIMEOUT,
        project=WS.root.name, tree=tree, active=active
    )
    history.append({"role": "user", "content": text})

    for _ in range(MAX_STEPS):
        messages = [{"role": "system", "content": system}] + history[-32:]
        full = ""
        try:
            stream = await client.chat.completions.create(
                model=model, messages=messages, stream=True,
                temperature=0.25, max_tokens=8000)
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full += delta
                    await ws.send_json({"type": "token", "delta": delta})
        except Exception as e:
            await ws.send_json({"type": "error", "message": f"model error: {e}"})
            return

        history.append({"role": "assistant", "content": full})
        calls = CALL_RE.findall(full)
        if not calls:
            break

        results = []
        for raw in calls:
            try:
                c = json.loads(raw)
                name, args = c["name"], c.get("arguments", {})
            except (ValueError, KeyError):
                results.append("ERROR: malformed tool_call JSON")
                continue
            res = await exec_tool(name, args)
            await ws.send_json({
                "type": "tool", "name": name,
                "path": args.get("path") or args.get("output_path") or args.get("command", ""),
                "ok": not res.startswith("ERROR")
            })
            results.append(f"[{name}] {res}")

        history.append({"role": "user", "content": "<tool_response>\n" + "\n\n".join(results) + "\n</tool_response>"})
        await ws.send_json({"type": "step"})

    await ws.send_json({"type": "done"})
