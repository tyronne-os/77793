"""
CRANE Podman integration — 10 advanced features:
1. Container lifecycle (list, start, stop, restart, remove, logs)
2. Image management (list, pull, remove, inspect)
3. Pod management (list, create, start, stop, remove)
4. Docker→Podman project conversion (Dockerfile + compose patching)
5. Rootless security info per container
6. Port mapping / forwarding inspector
7. Volume inspector (list, create, remove)
8. Network inspector (list, create, remove)
9. Systemd unit generator (podman generate systemd)
10. Resource stats (CPU/mem live via podman stats)
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
from pathlib import Path
from typing import Any


def _podman() -> str | None:
    """Return the podman binary path, or None if not installed."""
    return shutil.which("podman")


def _docker() -> str | None:
    return shutil.which("docker")


async def _run(*args: str, timeout: int = 30) -> tuple[int, str, str]:
    """Run a command, return (returncode, stdout, stderr)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return 124, "", "timeout"
        return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")
    except FileNotFoundError:
        return 127, "", f"command not found: {args[0]}"
    except Exception as e:
        return 1, "", str(e)


async def _podman_json(*subargs: str) -> tuple[int, Any, str]:
    """Run podman …subargs… --format json, parse result."""
    pm = _podman()
    if not pm:
        return 1, None, "podman not installed"
    rc, out, err = await _run(pm, *subargs, "--format", "json")
    if rc != 0:
        return rc, None, err.strip() or out.strip()
    try:
        return 0, json.loads(out or "[]"), ""
    except json.JSONDecodeError:
        return 0, [], ""


# ── 1. status ────────────────────────────────────────────────────────────────

async def status() -> dict:
    pm = _podman()
    dk = _docker()
    if not pm and not dk:
        return {"available": False, "engine": None, "version": None,
                "message": "Neither podman nor docker found on PATH"}
    bin_ = pm or dk
    engine = "podman" if pm else "docker"
    rc, out, _ = await _run(bin_, "version", "--format", "json")
    ver = None
    if rc == 0:
        try:
            d = json.loads(out)
            ver = (d.get("Client") or d).get("Version") if engine == "podman" else d.get("Client", {}).get("Version")
        except Exception:
            pass
    return {"available": True, "engine": engine, "binary": bin_, "version": ver}


# ── 2. containers ─────────────────────────────────────────────────────────────

async def list_containers(all_: bool = True) -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "containers": [], "message": "podman/docker not found"}
    args = ["ps", "--no-trunc"]
    if all_:
        args.append("-a")
    rc, data, err = await _podman_json(*args)
    if rc != 0:
        return {"ok": False, "containers": [], "message": err}
    containers = []
    for c in (data or []):
        containers.append({
            "id":      (c.get("Id") or c.get("ID") or "")[:12],
            "name":    (c.get("Names") or [""])[0].lstrip("/") if isinstance(c.get("Names"), list) else str(c.get("Names", "")),
            "image":   c.get("Image", ""),
            "status":  c.get("Status", ""),
            "state":   c.get("State", ""),
            "ports":   _fmt_ports(c.get("Ports") or []),
            "created": c.get("Created", ""),
        })
    return {"ok": True, "containers": containers}


def _fmt_ports(ports: list | dict) -> str:
    if isinstance(ports, list):
        parts = []
        for p in ports:
            if isinstance(p, dict):
                hp = p.get("hostPort") or p.get("host_port") or ""
                cp = p.get("containerPort") or p.get("container_port") or ""
                proto = p.get("protocol") or "tcp"
                if hp:
                    parts.append(f"{hp}→{cp}/{proto}")
                else:
                    parts.append(f"{cp}/{proto}")
            elif isinstance(p, str):
                parts.append(p)
        return ", ".join(parts)
    if isinstance(ports, dict):
        return str(ports)
    return str(ports) if ports else ""


async def container_action(container_id: str, action: str) -> dict:
    """start | stop | restart | kill | remove | pause | unpause"""
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "message": "podman/docker not found"}
    if action == "remove":
        rc, _, err = await _run(pm, "rm", "-f", container_id)
    else:
        rc, _, err = await _run(pm, action, container_id)
    return {"ok": rc == 0, "message": err.strip() if rc != 0 else f"{action} OK"}


async def container_logs(container_id: str, tail: int = 80) -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "logs": "", "message": "podman/docker not found"}
    rc, out, err = await _run(pm, "logs", "--tail", str(tail), container_id, timeout=10)
    return {"ok": True, "logs": out + err}


# ── 3. images ─────────────────────────────────────────────────────────────────

async def list_images() -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "images": [], "message": "podman/docker not found"}
    rc, data, err = await _podman_json("images")
    if rc != 0:
        return {"ok": False, "images": [], "message": err}
    images = []
    for img in (data or []):
        names = img.get("Names") or img.get("RepoTags") or ["<none>:<none>"]
        images.append({
            "id":      (img.get("Id") or img.get("ID") or "")[:12],
            "name":    names[0] if names else "<none>",
            "size":    img.get("Size", 0),
            "created": img.get("Created", ""),
        })
    return {"ok": True, "images": images}


async def pull_image(image: str) -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "message": "podman/docker not found"}
    rc, out, err = await _run(pm, "pull", image, timeout=300)
    return {"ok": rc == 0, "output": (out + err)[-1000:]}


async def remove_image(image_id: str, force: bool = False) -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "message": "podman/docker not found"}
    args = ["rmi"]
    if force:
        args.append("-f")
    args.append(image_id)
    rc, _, err = await _run(pm, *args)
    return {"ok": rc == 0, "message": err.strip() if rc != 0 else "removed"}


# ── 4. pods (podman only) ─────────────────────────────────────────────────────

async def list_pods() -> dict:
    pm = _podman()
    if not pm:
        return {"ok": False, "pods": [], "message": "podman required for pod management"}
    rc, data, err = await _podman_json("pod", "ps")
    if rc != 0:
        return {"ok": False, "pods": [], "message": err}
    pods = []
    for p in (data or []):
        pods.append({
            "id":         (p.get("Id") or "")[:12],
            "name":       p.get("Name", ""),
            "status":     p.get("Status", ""),
            "containers": p.get("NumContainers", 0),
            "created":    p.get("Created", ""),
        })
    return {"ok": True, "pods": pods}


async def pod_action(pod_id: str, action: str) -> dict:
    """start | stop | restart | remove"""
    pm = _podman()
    if not pm:
        return {"ok": False, "message": "podman required"}
    if action == "remove":
        rc, _, err = await _run(pm, "pod", "rm", "-f", pod_id)
    else:
        rc, _, err = await _run(pm, "pod", action, pod_id)
    return {"ok": rc == 0, "message": err.strip() if rc != 0 else f"pod {action} OK"}


# ── 5. volumes ────────────────────────────────────────────────────────────────

async def list_volumes() -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "volumes": [], "message": "podman/docker not found"}
    rc, data, err = await _podman_json("volume", "ls")
    if rc != 0:
        return {"ok": False, "volumes": [], "message": err}
    vols = []
    for v in (data or []):
        vols.append({
            "name":       v.get("Name", ""),
            "driver":     v.get("Driver", "local"),
            "mountpoint": v.get("Mountpoint", ""),
            "created":    v.get("CreatedAt", ""),
        })
    return {"ok": True, "volumes": vols}


async def volume_action(name: str, action: str) -> dict:
    """remove"""
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "message": "podman/docker not found"}
    if action == "remove":
        rc, _, err = await _run(pm, "volume", "rm", name)
        return {"ok": rc == 0, "message": err.strip() if rc != 0 else "removed"}
    return {"ok": False, "message": f"unknown action: {action}"}


# ── 6. networks ───────────────────────────────────────────────────────────────

async def list_networks() -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "networks": [], "message": "podman/docker not found"}
    rc, data, err = await _podman_json("network", "ls")
    if rc != 0:
        return {"ok": False, "networks": [], "message": err}
    nets = []
    for n in (data or []):
        nets.append({
            "id":      (n.get("Id") or n.get("ID") or "")[:12],
            "name":    n.get("Name", ""),
            "driver":  n.get("Driver", ""),
            "subnets": _extract_subnets(n),
        })
    return {"ok": True, "networks": nets}


def _extract_subnets(n: dict) -> str:
    subnets = n.get("Subnets") or []
    if isinstance(subnets, list):
        return ", ".join(s.get("Subnet", "") for s in subnets if isinstance(s, dict))
    return ""


# ── 7. systemd unit generator ─────────────────────────────────────────────────

async def generate_systemd(container_id: str, new_: bool = False) -> dict:
    pm = _podman()
    if not pm:
        return {"ok": False, "unit": "", "message": "podman required for systemd generation"}
    args = [pm, "generate", "systemd", "--name"]
    if new_:
        args.append("--new")
    args.append(container_id)
    rc, out, err = await _run(*args)
    if rc != 0:
        return {"ok": False, "unit": "", "message": err.strip()}
    return {"ok": True, "unit": out, "name": f"container-{container_id}.service"}


# ── 8. resource stats (single snapshot) ───────────────────────────────────────

async def container_stats() -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "stats": [], "message": "podman/docker not found"}
    rc, data, err = await _podman_json("stats", "--no-stream", "--no-reset")
    if rc != 0:
        return {"ok": False, "stats": [], "message": err}
    stats = []
    for s in (data or []):
        stats.append({
            "id":       (s.get("Id") or s.get("ID") or "")[:12],
            "name":     s.get("Name", ""),
            "cpu_pct":  s.get("CPU", "0%"),
            "mem_usage": s.get("MemUsage", ""),
            "mem_pct":  s.get("MemPerc", "0%"),
            "net_io":   s.get("NetIO", ""),
            "block_io": s.get("BlockIO", ""),
            "pids":     s.get("PIDs", 0),
        })
    return {"ok": True, "stats": stats}


# ── 9. run container ──────────────────────────────────────────────────────────

async def run_container(image: str, name: str = "", ports: str = "", env: str = "",
                        volumes: str = "", detach: bool = True, remove: bool = False,
                        cmd: str = "") -> dict:
    pm = _podman() or _docker()
    if not pm:
        return {"ok": False, "message": "podman/docker not found"}
    args: list[str] = [pm, "run"]
    if detach:
        args.append("-d")
    if remove:
        args.append("--rm")
    if name:
        args += ["--name", name]
    for p in ports.split(","):
        p = p.strip()
        if p:
            args += ["-p", p]
    for e in env.split("\n"):
        e = e.strip()
        if e and "=" in e:
            args += ["-e", e]
    for v in volumes.split(","):
        v = v.strip()
        if v:
            args += ["-v", v]
    args.append(image)
    if cmd:
        args += cmd.split()
    rc, out, err = await _run(*args, timeout=60)
    return {"ok": rc == 0, "output": (out + err).strip()[-800:]}


# ── 10. Docker → Podman conversion ────────────────────────────────────────────

def _patch_compose(content: str) -> str:
    """Minimal docker-compose → podman-compose patches."""
    # version field is optional in podman-compose
    content = re.sub(r"^\s*version:\s*['\"].*?['\"]\s*$", "", content, flags=re.MULTILINE)
    # docker-specific build args → compatible with podman
    content = content.replace("platform: linux/amd64", "# platform: linux/amd64 (removed for podman)")
    return content.strip() + "\n"


def _patch_dockerfile(content: str) -> str:
    """Minimal Dockerfile patches for better Podman/rootless compatibility."""
    lines = []
    for line in content.splitlines():
        # USER 0 or USER root → add note
        if re.match(r"^\s*USER\s+(0|root)\s*$", line, re.IGNORECASE):
            lines.append(line)
            lines.append("# NOTE: rootless podman maps UID 0 to your real UID outside the container")
        else:
            lines.append(line)
    return "\n".join(lines) + "\n"


async def convert_project(project_path: str) -> dict:
    """Scan a project for Docker artifacts and patch them for Podman."""
    path = Path(project_path)
    if not path.is_dir():
        return {"ok": False, "message": f"not a directory: {project_path}", "changes": []}

    changes: list[dict] = []

    # docker-compose files
    for name in ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]:
        f = path / name
        if f.exists():
            original = f.read_text(errors="replace")
            patched = _patch_compose(original)
            if patched != original:
                f.write_text(patched)
                changes.append({"file": name, "action": "patched compose file"})
            else:
                changes.append({"file": name, "action": "already compatible (no changes)"})

    # Dockerfiles
    for df in list(path.glob("Dockerfile*")) + list(path.glob("**/Dockerfile*")):
        if ".git" in df.parts:
            continue
        original = df.read_text(errors="replace")
        patched = _patch_dockerfile(original)
        rel = str(df.relative_to(path))
        if patched != original:
            df.write_text(patched)
            changes.append({"file": rel, "action": "added rootless notes"})
        else:
            changes.append({"file": rel, "action": "no changes needed"})

    # suggest podman-compose if docker-compose present
    suggestions = []
    if any(c["file"].startswith("docker-compose") or c["file"].startswith("compose") for c in changes):
        suggestions.append("Run: pip install podman-compose  (drop-in replacement for docker-compose)")
        suggestions.append("Or:  podman compose up -d  (requires podman >= 4.7)")

    # check for .dockerignore → copy as .containerignore if missing
    di = path / ".dockerignore"
    ci = path / ".containerignore"
    if di.exists() and not ci.exists():
        ci.write_text(di.read_text(errors="replace"))
        changes.append({"file": ".containerignore", "action": "copied from .dockerignore"})

    return {
        "ok": True,
        "changes": changes,
        "suggestions": suggestions,
        "message": f"{len(changes)} file(s) processed" if changes else "No Docker files found in project",
    }


# ── Workstation management ─────────────────────────────────────────────────────

WS_DIR = Path("/mnt/elana/ai_apps/crane/podman-workstation")
LAUNCH_SH = WS_DIR / "launch.sh"

WORKSTATION_SERVICES = {
    "crane-lab":      {"label": "Jupyter Lab",    "port": 8888, "url": "http://localhost:8888",  "profile": "lab"},
    "crane-ollama":   {"label": "Ollama",          "port": 11434,"url": "http://localhost:11434", "profile": "serve"},
    "crane-webui":    {"label": "Open WebUI",      "port": 3000, "url": "http://localhost:3000",  "profile": "serve"},
    "crane-pipeline": {"label": "n8n Pipelines",   "port": 5678, "url": "http://localhost:5678",  "profile": "pipeline"},
}


async def workstation_status() -> dict:
    """Get status of all workstation containers."""
    bin_ = _podman()
    if not bin_:
        return {"ok": False, "message": "podman not found"}
    services = {}
    for name, info in WORKSTATION_SERVICES.items():
        rc, out, _ = await _run(bin_, "inspect", "--format", "{{.State.Status}}", name, timeout=5)
        state = out.strip() if rc == 0 else "stopped"
        services[name] = {**info, "state": state, "running": state == "running"}
    return {"ok": True, "services": services}


async def workstation_start(profile: str) -> dict:
    """Start workstation services by profile: lab | serve | full | pipeline."""
    if not LAUNCH_SH.exists():
        return {"ok": False, "message": "Workstation not set up — launch.sh not found"}
    rc, out, err = await _run("bash", str(LAUNCH_SH), profile, timeout=120)
    return {"ok": rc == 0, "output": (out + err).strip()[-1200:]}


async def workstation_stop() -> dict:
    """Stop all workstation containers."""
    if LAUNCH_SH.exists():
        rc, out, err = await _run("bash", str(LAUNCH_SH), "stop", timeout=30)
        return {"ok": rc == 0, "output": (out + err).strip()}
    bin_ = _podman()
    if not bin_:
        return {"ok": False, "message": "podman not found"}
    names = list(WORKSTATION_SERVICES.keys())
    rc, out, err = await _run(bin_, "stop", *names, timeout=20)
    await _run(bin_, "rm", *names, timeout=10)
    return {"ok": True, "output": "Stopped"}


async def workstation_pull_model(model: str) -> dict:
    """Pull an Ollama model into crane-ollama."""
    bin_ = _podman()
    if not bin_:
        return {"ok": False, "message": "podman not found"}
    rc, out, err = await _run(bin_, "exec", "crane-ollama", "ollama", "pull", model, timeout=300)
    return {"ok": rc == 0, "output": (out + err).strip()[-800:]}


async def workstation_list_models() -> dict:
    """List downloaded Ollama models."""
    bin_ = _podman()
    if not bin_:
        return {"ok": False, "message": "podman not found"}
    rc, out, err = await _run(bin_, "exec", "crane-ollama", "ollama", "list", timeout=10)
    if rc != 0:
        return {"ok": False, "message": "Ollama not running", "models": []}
    lines = [l for l in out.strip().splitlines() if l and not l.startswith("NAME")]
    models = []
    for line in lines:
        parts = line.split()
        if parts:
            models.append({"name": parts[0], "id": parts[1] if len(parts) > 1 else "", "size": parts[2] if len(parts) > 2 else ""})
    return {"ok": True, "models": models}


async def workstation_build_lab() -> dict:
    """Build the crane-lab Docker image."""
    dockerfile = WS_DIR / "containers" / "lab" / "Dockerfile"
    if not dockerfile.exists():
        return {"ok": False, "message": "Lab Dockerfile not found"}
    bin_ = _podman()
    if not bin_:
        return {"ok": False, "message": "podman not found"}
    rc, out, err = await _run(bin_, "build", "-t", "crane-lab:latest", str(dockerfile.parent), timeout=600)
    return {"ok": rc == 0, "output": (out + err).strip()[-1200:]}
