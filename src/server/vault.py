"""
CRANE Secure Token Vault

Stores API keys in ~/.crane_vault.env (chmod 600, outside the project).
Tokens are NEVER logged, NEVER returned via API, NEVER committed to git.

Supported services:
  huggingface  — HF_TOKEN
  github       — GITHUB_TOKEN (also used for repo creation)
  nvidia_ngc   — NGC_API_KEY
  nvidia_ent   — NVIDIA_ENT_KEY
  gcp          — no token; tests gcloud CLI auth
  jev          — JEV_API_KEY (Space secret)
  gemini       — GEMINI_API_KEY
  openai       — OPENAI_API_KEY
"""
from __future__ import annotations

import asyncio
import datetime
import json as _json
import os
import re
import socket as _socket
import stat
import subprocess
from pathlib import Path

import httpx

VAULT_FILE = Path.home() / ".crane_vault.env"

# service_id → env var name stored in vault file
_KEY_MAP: dict[str, str] = {
    "huggingface": "HF_TOKEN",
    "github":      "GITHUB_TOKEN",
    "nvidia_ngc":  "NGC_API_KEY",
    "nvidia_ent":  "NVIDIA_ENT_KEY",
    "gcp":         "GCP_AUTH",          # special: value is "gcloud" not a token
    "jev":         "JEV_API_KEY",
    "gemini":      "GEMINI_API_KEY",
    "openai":      "OPENAI_API_KEY",
    "cfb":         "CFB_API_KEY",        # College Football Data API
    "tank":        "TANK_API_KEY",       # Tank01 / sports stats API
    "hostinger":   "HOSTINGER_API_KEY",  # Hostinger email management API
}

_SERVICE_LABELS = {
    "huggingface": "Hugging Face",
    "github":      "GitHub",
    "nvidia_ngc":  "NVIDIA NGC",
    "nvidia_ent":  "NVIDIA Enterprise",
    "gcp":         "Google Cloud (gcloud)",
    "jev":         "JEV",
    "gemini":      "Gemini",
    "openai":      "OpenAI",
    "cfb":         "College Football API",
    "tank":        "Tank API",
    "hostinger":   "Hostinger",
}


# ── vault file I/O ─────────────────────────────────────────────────────────────

def _read_vault() -> dict[str, str]:
    """Read vault file → {KEY: value}. Never raises."""
    if not VAULT_FILE.exists():
        return {}
    try:
        pairs: dict[str, str] = {}
        for line in VAULT_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            k, _, v = line.partition("=")
            if k.strip():
                pairs[k.strip()] = v.strip()
        return pairs
    except Exception:
        return {}


def _write_vault(data: dict[str, str]) -> None:
    """Write vault file with mode 600. Never stores empty/None values."""
    VAULT_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# CRANE Vault — do not commit or share this file\n"]
    for k, v in data.items():
        if v:
            lines.append(f"{k}={v}\n")
    VAULT_FILE.write_text("".join(lines))
    VAULT_FILE.chmod(0o600)


def store(service: str, token: str) -> bool:
    """Persist a token. Returns True on success."""
    if service not in _KEY_MAP:
        return False
    env_key = _KEY_MAP[service]
    data = _read_vault()
    data[env_key] = token.strip()
    _write_vault(data)
    # also inject into current process env so new API calls pick it up immediately
    os.environ[env_key] = token.strip()
    return True


def retrieve(service: str) -> str | None:
    """Return the stored token (or None). Internal use only — never send to client."""
    if service not in _KEY_MAP:
        return None
    return _read_vault().get(_KEY_MAP[service])


def delete(service: str) -> bool:
    if service not in _KEY_MAP:
        return False
    data = _read_vault()
    data.pop(_KEY_MAP[service], None)
    _write_vault(data)
    os.environ.pop(_KEY_MAP[service], None)
    return True


def status() -> dict[str, bool]:
    """Return {service_id: is_configured} — no token values."""
    data = _read_vault()
    return {svc: bool(data.get(key)) for svc, key in _KEY_MAP.items()}


def load_into_env() -> None:
    """Call at server startup: inject vault tokens into os.environ."""
    for key, val in _read_vault().items():
        if val and key not in os.environ:
            os.environ[key] = val


# ── connectivity tests ─────────────────────────────────────────────────────────

async def test(service: str) -> dict:
    """
    Test connectivity for a service. Returns {ok: bool, message: str}.
    Never reveals the token in the response.
    """
    token = retrieve(service)
    if service == "gcp":
        return await _test_gcp()
    if not token:
        return {"ok": False, "message": "No token stored — paste one first"}
    try:
        if service == "huggingface":
            return await _test_hf(token)
        if service == "github":
            return await _test_github(token)
        if service == "nvidia_ngc":
            return await _test_ngc(token)
        if service == "nvidia_ent":
            return await _test_nvidia_ent(token)
        if service == "jev":
            return await _test_jev(token)
        if service == "gemini":
            return await _test_gemini(token)
        if service == "openai":
            return await _test_openai(token)
        if service == "cfb":
            return await _test_cfb(token)
        if service == "tank":
            return await _test_tank(token)
        if service == "hostinger":
            return await _test_hostinger(token)
    except httpx.ConnectError:
        return {"ok": False, "message": "Network error — check internet connection"}
    except Exception as e:
        return {"ok": False, "message": str(e)[:120]}
    return {"ok": False, "message": "unknown service"}


async def _test_hf(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://huggingface.co/api/whoami",
                        headers={"Authorization": f"Bearer {token}"})
    if r.status_code == 200:
        name = r.json().get("name", "unknown")
        return {"ok": True, "message": f"Connected — logged in as {name}"}
    return {"ok": False, "message": f"HF returned {r.status_code}"}


async def _test_github(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://api.github.com/user",
                        headers={"Authorization": f"Bearer {token}",
                                 "Accept": "application/vnd.github+json"})
    if r.status_code == 200:
        login = r.json().get("login", "unknown")
        return {"ok": True, "message": f"Connected — @{login}"}
    return {"ok": False, "message": f"GitHub returned {r.status_code}"}


async def _test_ngc(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://api.ngc.nvidia.com/v2/user",
                        headers={"Authorization": f"ApiKey {token}"})
    if r.status_code in (200, 403):  # 403 means auth hit but no org access
        ok = r.status_code == 200
        msg = "Connected" if ok else f"Token valid but access limited ({r.status_code})"
        return {"ok": ok, "message": msg}
    return {"ok": False, "message": f"NGC returned {r.status_code}"}


async def _test_nvidia_ent(token: str) -> dict:
    # NVIDIA Enterprise uses same NGC infra but different endpoint
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://api.ngc.nvidia.com/v2/org",
                        headers={"Authorization": f"ApiKey {token}"})
    if r.status_code == 200:
        return {"ok": True, "message": "NVIDIA Enterprise connected"}
    return {"ok": False, "message": f"NGC Enterprise returned {r.status_code}"}


async def _test_gcp() -> dict:
    try:
        r = await asyncio.to_thread(
            subprocess.run, ["gcloud", "auth", "list", "--format=value(account)", "--filter=status:ACTIVE"],
            capture_output=True, text=True, timeout=10
        )
        account = r.stdout.strip().split("\n")[0] if r.stdout.strip() else ""
        if account:
            return {"ok": True, "message": f"gcloud active — {account}"}
        return {"ok": False, "message": "No active gcloud account — run: gcloud auth login"}
    except FileNotFoundError:
        return {"ok": False, "message": "gcloud CLI not found"}


async def _test_jev(token: str) -> dict:
    # Real TypeSafe System One endpoint. One tiny billed call; the key is never logged or returned.
    try:
        async with httpx.AsyncClient(timeout=10, trust_env=False) as c:
            r = await c.post("https://api.typesafe.ai/v1/systemone",
                             headers={"Authorization": f"Bearer {token}"},
                             json={"model": "jev-latest", "state": "ping",
                                   "questions": {"ok": {"type": "noul", "instructions": "Is this a connectivity test?"}}})
        if r.status_code == 200:
            return {"ok": True, "message": "JEV connected (TypeSafe System One)"}
        return {"ok": False, "message": f"TypeSafe returned HTTP {r.status_code}"}
    except Exception as e:
        return {"ok": False, "message": type(e).__name__}


async def _test_gemini(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"https://generativelanguage.googleapis.com/v1beta/models",
                        params={"key": token})
    if r.status_code == 200:
        count = len(r.json().get("models", []))
        return {"ok": True, "message": f"Gemini connected — {count} models available"}
    return {"ok": False, "message": f"Gemini returned {r.status_code}"}


async def _test_openai(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://api.openai.com/v1/models",
                        headers={"Authorization": f"Bearer {token}"})
    if r.status_code == 200:
        count = len(r.json().get("data", []))
        return {"ok": True, "message": f"OpenAI connected — {count} models"}
    return {"ok": False, "message": f"OpenAI returned {r.status_code}"}


# ── GitHub repo creation ───────────────────────────────────────────────────────

async def _test_hostinger(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://api.hostinger.com/v1/profile",
                        headers={"Authorization": f"Bearer {token}",
                                 "Accept": "application/json"})
    if r.status_code == 200:
        info = r.json()
        email = info.get("data", {}).get("email") or info.get("email", "")
        return {"ok": True, "message": f"Hostinger connected — {email or 'authenticated'}"}
    if r.status_code == 401:
        return {"ok": False, "message": "Hostinger: invalid API token"}
    return {"ok": False, "message": f"Hostinger returned {r.status_code}"}


async def _test_cfb(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://api.collegefootballdata.com/games",
                        params={"year": "2024", "seasonType": "regular"},
                        headers={"Authorization": f"Bearer {token}"})
    if r.status_code == 200:
        count = len(r.json()) if r.content else 0
        return {"ok": True, "message": f"CFB API connected — {count} games in sample query"}
    return {"ok": False, "message": f"CFB API returned {r.status_code}"}


async def _test_tank(token: str) -> dict:
    # Tank01 on RapidAPI — test with NFL endpoint
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com/getNFLTeams",
                        headers={"X-RapidAPI-Key": token,
                                 "X-RapidAPI-Host": "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com"})
    if r.status_code == 200:
        return {"ok": True, "message": "Tank API connected — NFL endpoint live"}
    # Try alternate tank API endpoint formats
    async with httpx.AsyncClient(timeout=10) as c:
        r2 = await c.get("https://api.sportsdata.io/v3/nfl/scores/json/Teams",
                         params={"key": token})
    if r2.status_code == 200:
        return {"ok": True, "message": "Tank/SportsData API connected"}
    return {"ok": False, "message": f"Tank API returned {r.status_code} — check RapidAPI host or endpoint"}


# ── usage logging ─────────────────────────────────────────────────────────────

USAGE_LOG = Path.home() / ".crane_usage.json"

def log_usage(service: str, caller: str, tokens: int = 0,
              cost_usd: float = 0.0, model: str = "", note: str = "") -> None:
    """Append one usage record. Never raises — fire-and-forget."""
    entry = {
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "service": service,
        "caller": caller,          # e.g. "crane/chat", "crane/nim", "vault/test"
        "device": _socket.gethostname(),
        "tokens": tokens,
        "cost_usd": round(cost_usd, 6),
        "model": model,
        "note": note,
    }
    try:
        data: list = _json.loads(USAGE_LOG.read_text()) if USAGE_LOG.exists() else []
        data.append(entry)
        if len(data) > 2000:
            data = data[-2000:]
        USAGE_LOG.write_text(_json.dumps(data))
        USAGE_LOG.chmod(0o600)
    except Exception:
        pass


def get_usage(last: int = 200) -> list[dict]:
    try:
        return (_json.loads(USAGE_LOG.read_text()) if USAGE_LOG.exists() else [])[-last:]
    except Exception:
        return []


def usage_summary() -> dict[str, dict]:
    """Per-service rollup: last_used, last_caller, last_device, last_model,
    total_calls, total_tokens, total_cost_usd."""
    entries = get_usage(2000)
    result: dict[str, dict] = {}
    for e in entries:
        svc = e.get("service", "unknown")
        if svc not in result:
            result[svc] = {
                "last_used": None, "last_caller": "", "last_device": "",
                "last_model": "", "total_calls": 0, "total_tokens": 0, "total_cost_usd": 0.0,
            }
        s = result[svc]
        s["total_calls"] += 1
        s["total_tokens"] += e.get("tokens", 0)
        s["total_cost_usd"] = round(s["total_cost_usd"] + e.get("cost_usd", 0.0), 6)
        if e.get("ts") and (not s["last_used"] or e["ts"] > s["last_used"]):
            s["last_used"] = e["ts"]
            s["last_caller"] = e.get("caller", "")
            s["last_device"] = e.get("device", "")
            s["last_model"] = e.get("model", "")
    return result


async def deploy_hf_space(repo_id: str) -> dict:
    """Push hf_space/ to a HF Space repo using the stored HF token."""
    import subprocess
    token = retrieve("huggingface")
    if not token:
        return {"ok": False, "message": "Hugging Face token not stored"}

    space_dir = Path("/mnt/elana/ai_apps/crane/hf_space")
    if not space_dir.exists():
        return {"ok": False, "message": "hf_space/ directory not found"}

    # Use huggingface_hub CLI to upload
    try:
        r = await asyncio.to_thread(
            subprocess.run,
            ["python3", "-c",
             f"""
from huggingface_hub import HfApi
api = HfApi(token="{token}")
api.create_repo(repo_id="{repo_id}", repo_type="space", space_sdk="gradio", private=False, exist_ok=True)
api.upload_folder(folder_path="{space_dir}", repo_id="{repo_id}", repo_type="space")
print("ok")
"""],
            capture_output=True, text=True, timeout=120
        )
        if "ok" in r.stdout:
            url = f"https://huggingface.co/spaces/{repo_id}"
            # store the space URL as an env var for CRANE to use
            store_space_url(repo_id)
            return {"ok": True, "message": f"Deployed → {url}  Set CRANE_HF_MM_URL in vault or env to activate."}
        return {"ok": False, "message": (r.stderr or r.stdout)[-400:]}
    except Exception as e:
        return {"ok": False, "message": str(e)[:200]}


def store_space_url(repo_id: str) -> None:
    """Persist the ZeroGPU Space URL so CRANE can use it as a fallback."""
    space_url = f"https://{repo_id.replace('/', '-')}.hf.space"
    data = _read_vault()
    data["CRANE_HF_MM_URL"] = space_url
    _write_vault(data)
    os.environ["CRANE_HF_MM_URL"] = space_url


async def create_github_repo(repo_name: str, description: str = "CRANE Builder IDE — internal") -> dict:
    """Create a private GitHub repo and push crane to it."""
    token = retrieve("github")
    if not token:
        return {"ok": False, "message": "GitHub token not stored"}

    # 1. get username
    async with httpx.AsyncClient(timeout=10) as c:
        me = await c.get("https://api.github.com/user",
                         headers={"Authorization": f"Bearer {token}",
                                  "Accept": "application/vnd.github+json"})
    if me.status_code != 200:
        return {"ok": False, "message": f"Could not get GitHub user: {me.status_code}"}
    login = me.json()["login"]

    # 2. create the repo
    async with httpx.AsyncClient(timeout=15) as c:
        rr = await c.post("https://api.github.com/user/repos",
                          headers={"Authorization": f"Bearer {token}",
                                   "Accept": "application/vnd.github+json"},
                          json={"name": repo_name, "private": True,
                                "description": description, "auto_init": False})
    if rr.status_code not in (201, 422):  # 422 = already exists
        return {"ok": False, "message": f"Repo creation failed: {rr.status_code} {rr.text[:200]}"}
    already = rr.status_code == 422

    # 3. configure git remote and push
    crane_dir = "/mnt/elana/ai_apps/crane"
    remote_url = f"https://{login}:{token}@github.com/{login}/{repo_name}.git"

    def _git(*args: str, cwd: str = crane_dir) -> tuple[int, str]:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=60)
        return r.returncode, (r.stdout + r.stderr).strip()

    await asyncio.to_thread(_git, "config", "user.email", "crane@internal")
    await asyncio.to_thread(_git, "config", "user.name", "CRANE")

    # stage everything (gitignore already excludes secrets/build artifacts)
    code, _ = await asyncio.to_thread(_git, "add", "-A")
    code, msg = await asyncio.to_thread(_git, "commit", "-m", "feat: initial CRANE SHIPPED commit")
    if code != 0 and "nothing to commit" not in msg:
        # might already have commits
        pass

    # set/update remote
    await asyncio.to_thread(_git, "remote", "remove", "origin")
    await asyncio.to_thread(_git, "remote", "add", "origin", remote_url)
    await asyncio.to_thread(_git, "branch", "-M", "main")
    push_code, push_msg = await asyncio.to_thread(_git, "push", "-u", "origin", "main", "--force")

    if push_code != 0:
        return {"ok": False, "message": f"Push failed: {push_msg[:300]}"}

    repo_url = f"https://github.com/{login}/{repo_name}"
    verb = "already existed, pushed to" if already else "created and pushed to"
    return {"ok": True, "message": f"Repo {verb}: {repo_url}", "url": repo_url, "login": login}


async def list_github_repos(per_page: int = 100, page: int = 1) -> dict:
    """List the authenticated user's GitHub repos (for Codex-style picker)."""
    token = retrieve("github")
    if not token:
        return {"ok": False, "message": "GitHub token not stored", "repos": []}

    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            "https://api.github.com/user/repos",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            params={"per_page": per_page, "page": page, "sort": "updated", "affiliation": "owner,collaborator"},
        )
    if r.status_code != 200:
        return {"ok": False, "message": f"GitHub API {r.status_code}", "repos": []}

    repos = [
        {
            "full_name": repo["full_name"],
            "name":      repo["name"],
            "private":   repo["private"],
            "language":  repo.get("language") or "",
            "description": (repo.get("description") or "")[:120],
            "updated_at": repo.get("updated_at", ""),
            "html_url":  repo["html_url"],
            "clone_url": repo["clone_url"],
            "stars":     repo.get("stargazers_count", 0),
        }
        for repo in r.json()
    ]
    return {"ok": True, "repos": repos, "page": page}
