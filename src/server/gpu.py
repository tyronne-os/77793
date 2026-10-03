"""
CRANE GPU Manager — GCP berylize-node lifecycle, metrics, idle-pause, session log.

Polls nvidia-smi via SSH every POLL_INTERVAL seconds while the node is running.
Auto-pauses after IDLE_TIMEOUT seconds of no user activity (configurable).
Logs every session to gpu_sessions.json for the Reports tab.
"""
from __future__ import annotations

import asyncio
import csv
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

NODE    = os.environ.get("CRANE_GPU_NODE",    "berylize-node")
PROJECT = os.environ.get("CRANE_GCP_PROJECT", "posh-eden")
ZONE    = os.environ.get("CRANE_GCP_ZONE",    "us-east1-c")
HOURLY_RATE  = float(os.environ.get("CRANE_GPU_RATE", "0.40"))   # $/hr — g2-standard-4 + L4
POLL_INTERVAL = 15          # seconds between nvidia-smi polls
DEFAULT_IDLE  = int(os.environ.get("CRANE_GPU_IDLE", "7200"))   # 2 h; GPU busy / model loaded also counts as active

LOG_FILE = Path("/mnt/elana/ai_apps/crane/gpu_sessions.json")

# ── shared state ──────────────────────────────────────────────────────────────

settings: dict = {"idle_timeout": DEFAULT_IDLE, "hourly_rate": HOURLY_RATE}
_metrics: dict = {}
_session: dict = {}        # active session info: start_time, project, cost_so_far
_last_activity = time.monotonic()
_clients: set = set()      # WebSocket clients for /ws/gpu
_loop: asyncio.AbstractEventLoop | None = None
_task: asyncio.Task | None = None


# ── internal helpers ─────────────────────────────────────────────────────────

def _gcloud(*args: str, timeout: int = 30) -> tuple[int, str]:
    """Run a gcloud command, return (returncode, output)."""
    cmd = ["gcloud", *args, f"--project={PROJECT}", f"--zone={ZONE}", "--quiet"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return 1, "timeout"
    except FileNotFoundError:
        return 1, "gcloud not found"


def _ssh(command: str, timeout: int = 20) -> tuple[int, str]:
    """Run a command on the GCP node over SSH."""
    code, out = _gcloud(
        "compute", "ssh", NODE, "--ssh-flag=-o ConnectTimeout=10",
        f"--command={command}", timeout=timeout
    )
    return code, out


def _parse_smi(raw: str) -> dict:
    """
    Parse nvidia-smi CSV output for a single GPU:
      utilization.gpu, utilization.memory, memory.used, memory.total,
      temperature.gpu, power.draw, power.limit
    Returns dict with numeric fields; empty dict if parse fails.
    """
    try:
        parts = [p.strip().rstrip(" %MiB W") for p in raw.split(",")]
        if len(parts) < 7:
            return {}
        return {
            "gpu_util":     float(parts[0]),
            "mem_util":     float(parts[1]),
            "mem_used_mb":  float(parts[2]),
            "mem_total_mb": float(parts[3]),
            "gpu_temp_c":   float(parts[4]),
            "power_w":      float(parts[5]),
            "power_limit_w":float(parts[6]),
        }
    except (ValueError, IndexError):
        return {}


def _instance_status() -> str:
    """RUNNING | TERMINATED | STOPPED | STAGING | unknown"""
    code, out = _gcloud("compute", "instances", "describe", NODE,
                        "--format=value(status)", timeout=15)
    if code != 0:
        return "unknown"
    return out.strip().upper() or "unknown"


def _start_time_epoch() -> float | None:
    """Returns the instance's last start timestamp as epoch seconds, or None."""
    code, out = _gcloud("compute", "instances", "describe", NODE,
                        "--format=value(lastStartTimestamp)", timeout=15)
    if code != 0 or not out.strip():
        return None
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(out.strip().replace("Z", "+00:00"))
        return dt.timestamp()
    except ValueError:
        return None


async def _broadcast(msg: dict) -> None:
    dead = set()
    for ws in list(_clients):
        try:
            await ws.send_json(msg)
        except Exception:
            dead.add(ws)
    _clients.difference_update(dead)


async def _poll_loop() -> None:
    """Background task: poll GPU metrics and enforce the idle timer."""
    global _metrics
    while True:
        await asyncio.sleep(POLL_INTERVAL)
        status = await asyncio.to_thread(_instance_status)
        now = time.monotonic()
        idle_secs = int(now - _last_activity)
        idle_timeout = settings["idle_timeout"]

        if status == "RUNNING":
            # poll nvidia-smi
            code, raw = await asyncio.to_thread(_ssh,
                "nvidia-smi --query-gpu=utilization.gpu,utilization.memory,"
                "memory.used,memory.total,temperature.gpu,power.draw,power.limit "
                "--format=csv,noheader", 15)
            smi = _parse_smi(raw) if code == 0 else {}

            # uptime cost
            start_epoch = _session.get("start_epoch") or await asyncio.to_thread(_start_time_epoch)
            if start_epoch:
                _session["start_epoch"] = start_epoch
                uptime_h = (time.time() - start_epoch) / 3600
                cost = round(uptime_h * settings["hourly_rate"], 4)
            else:
                uptime_h = 0.0
                cost = 0.0

            # a loaded model or a busy GPU is activity: never pause mid-load / mid-serve
            if smi.get("gpu_util", 0) > 5 or smi.get("mem_used_mb", 0) > 2000:
                ping()
                idle_secs = 0

            idle_until_pause = max(0, idle_timeout - idle_secs) if idle_timeout > 0 else -1   # -1 = sleeper disabled
            _metrics = {
                "instance_status": "running",
                **smi,
                "uptime_h":          round(uptime_h, 3),
                "cost_usd":          cost,
                "idle_secs":         idle_secs,
                "idle_until_pause":  idle_until_pause,
                "hourly_rate":       settings["hourly_rate"],
                "ts":                int(time.time()),
            }
            if _clients:
                await _broadcast({"type": "metrics", "data": _metrics})

            # idle-pause
            if idle_timeout > 0 and idle_secs >= idle_timeout:
                await pause_instance()

        else:
            _metrics = {"instance_status": status.lower(), "ts": int(time.time())}
            if _clients:
                await _broadcast({"type": "metrics", "data": _metrics})


def start_background(loop: asyncio.AbstractEventLoop) -> None:
    global _loop, _task
    _loop = loop
    _task = loop.create_task(_poll_loop())


def ping() -> None:
    """Call this on any user activity to reset the idle timer."""
    global _last_activity
    _last_activity = time.monotonic()


# ── public controls ──────────────────────────────────────────────────────────

async def get_metrics() -> dict:
    """Return the latest cached metrics, refreshing instance status if stale."""
    if not _metrics or time.time() - _metrics.get("ts", 0) > 30:
        status = await asyncio.to_thread(_instance_status)
        return {"instance_status": status.lower(), "ts": int(time.time())}
    return dict(_metrics)


async def start_instance() -> dict:
    """Start the GPU node and open the Qwen SSH tunnel on port 8010."""
    code, out = await asyncio.to_thread(
        _gcloud, "compute", "instances", "start", NODE, timeout=120)
    if code != 0:
        return {"ok": False, "error": out}

    # wait for SSH
    for _ in range(30):
        c, _ = await asyncio.to_thread(_ssh, "true", 10)
        if c == 0:
            break
        await asyncio.sleep(4)

    # re-open tunnel on 8010
    await asyncio.to_thread(_open_tunnel, 8010, 8000)

    epoch = await asyncio.to_thread(_start_time_epoch)
    _session["start_epoch"] = epoch
    _session["project"] = "crane"
    ping()
    return {"ok": True, "status": "running"}


async def pause_instance() -> dict:
    """Stop (not delete) the GPU node to end billing, log the session."""
    metrics = dict(_metrics)
    cost = metrics.get("cost_usd", 0.0)
    uptime_h = metrics.get("uptime_h", 0.0)

    code, out = await asyncio.to_thread(
        _gcloud, "compute", "instances", "stop", NODE, timeout=120)
    result = {"ok": code == 0, "cost_usd": cost, "uptime_h": uptime_h}
    if code != 0:
        result["error"] = out

    _append_session_log(uptime_h, cost)
    _session.clear()
    global _last_activity
    _last_activity = time.monotonic()
    return result


def _open_tunnel(local_port: int, remote_port: int) -> None:
    """Open an SSH background tunnel (non-blocking)."""
    subprocess.Popen(
        ["gcloud", "compute", "ssh", NODE, f"--project={PROJECT}", f"--zone={ZONE}",
         "--quiet", "--", "-N", "-f", "-o", "ExitOnForwardFailure=yes",
         f"-L", f"{local_port}:localhost:{remote_port}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _append_session_log(uptime_h: float, cost_usd: float) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        sessions = json.loads(LOG_FILE.read_text()) if LOG_FILE.exists() else []
    except Exception:
        sessions = []
    sessions.append({
        "ended_at":  datetime.now(timezone.utc).isoformat(),
        "uptime_h":  round(uptime_h, 3),
        "cost_usd":  round(cost_usd, 4),
        "project":   _session.get("project", "unknown"),
        "node":      NODE,
    })
    LOG_FILE.write_text(json.dumps(sessions[-200:], indent=2))  # keep last 200


def get_session_log() -> list:
    if not LOG_FILE.exists():
        return []
    try:
        return json.loads(LOG_FILE.read_text())
    except Exception:
        return []
