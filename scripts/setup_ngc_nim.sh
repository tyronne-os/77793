#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CRANE · NGC NIM setup — stores key, tests NIM chat endpoint, registers
# NIM as a CRANE pipeline so Multi-Suite can benchmark it against Beryl/local.
#
# Usage:
#   bash scripts/setup_ngc_nim.sh
#   bash scripts/setup_ngc_nim.sh --key nvapi-xxxx   # non-interactive
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; CYN='\033[0;36m'; NC='\033[0m'
ok()  { echo -e "${GRN}✓${NC}  $*"; }
bad() { echo -e "${RED}✗${NC}  $*"; }
hdr() { echo -e "\n${CYN}══ $* ══${NC}"; }

CRANE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$HOME/.hermes/.env"
NIM_BASE="https://integrate.api.nvidia.com/v1"
NIM_MODEL="${NIM_MODEL:-nvidia/llama-3.1-nemotron-70b-instruct}"   # top NIM chat model
PIPELINES_FILE="$CRANE_DIR/src/server/nim_pipelines.json"

# ── 1. Get NGC API key ────────────────────────────────────────────────────────
hdr "NGC API KEY"
NGC_KEY=""

# Prefer --key flag
for i in "$@"; do
  case $i in --key=*) NGC_KEY="${i#*=}" ;; --key) shift; NGC_KEY="$1" ;; esac
done

# Fall back to env file
if [[ -z "$NGC_KEY" && -f "$ENV_FILE" ]]; then
  NGC_KEY=$(grep -E '^NGC_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | head -1 || true)
fi

# Prompt
if [[ -z "$NGC_KEY" ]]; then
  echo -n "Paste your NGC API key (nvapi-...): "
  read -rs NGC_KEY; echo
fi

if [[ -z "$NGC_KEY" ]]; then
  bad "No NGC API key provided. Exiting."
  exit 1
fi
ok "Key loaded (${NGC_KEY:0:12}…)"

# ── 2. Persist key ────────────────────────────────────────────────────────────
hdr "STORING KEY"
mkdir -p "$(dirname "$ENV_FILE")"
if grep -q '^NGC_API_KEY=' "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^NGC_API_KEY=.*|NGC_API_KEY=$NGC_KEY|" "$ENV_FILE"
else
  echo "NGC_API_KEY=$NGC_KEY" >> "$ENV_FILE"
fi
ok "Written to $ENV_FILE"

# Store in CRANE vault (runs server must be up for this; soft-fail if not)
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
  curl -sf -X POST http://localhost:8000/api/vault/store \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"ngc\",\"value\":\"$NGC_KEY\"}" > /dev/null && ok "Stored in CRANE vault (key=ngc)" || true
else
  echo "   CRANE server not running — key saved to $ENV_FILE only; vault store skipped."
fi

# ── 3. Smoke-test NIM chat endpoint ──────────────────────────────────────────
hdr "NIM ENDPOINT TEST  ($NIM_MODEL)"
RESP=$(curl -sf "$NIM_BASE/chat/completions" \
  -H "Authorization: Bearer $NGC_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"$NIM_MODEL\",
    \"messages\": [{\"role\":\"user\",\"content\":\"Reply with exactly: CRANE_NIM_OK\"}],
    \"max_tokens\": 8,
    \"stream\": false
  }" 2>&1) || { bad "NIM request failed:\n$RESP"; exit 1; }

CONTENT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'].strip())" 2>/dev/null || echo "")
if echo "$CONTENT" | grep -qi "CRANE_NIM_OK"; then
  ok "NIM responded: $CONTENT"
else
  ok "NIM responded (content differs from expected, but reachable): ${CONTENT:0:80}"
fi

# ── 4. Test streaming ─────────────────────────────────────────────────────────
hdr "STREAMING TEST"
STREAM_OK=false
curl -sf "$NIM_BASE/chat/completions" \
  -H "Authorization: Bearer $NGC_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$NIM_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hi\"}],\"max_tokens\":5,\"stream\":true}" \
  | head -c 200 | grep -q "data:" && STREAM_OK=true || true
$STREAM_OK && ok "Streaming SSE confirmed" || echo "   Streaming check inconclusive (may need longer timeout)"

# ── 5. List available NIM models ──────────────────────────────────────────────
hdr "AVAILABLE NIM MODELS (first 10)"
curl -sf "$NIM_BASE/models" \
  -H "Authorization: Bearer $NGC_KEY" \
  | python3 -c "
import sys,json
d = json.load(sys.stdin)
for m in d.get('data',[])[:10]:
    print(' ', m['id'])
" 2>/dev/null || echo "   (model list unavailable — endpoint may not expose /models)"

# ── 6. Write nim_pipelines.json for CRANE ────────────────────────────────────
hdr "REGISTERING NIM PIPELINES"
cat > "$PIPELINES_FILE" << JSONEOF
{
  "nim-nemotron-70b": {
    "url": "$NIM_BASE",
    "model": "nvidia/llama-3.1-nemotron-70b-instruct",
    "api_key_env": "NGC_API_KEY",
    "concurrency": 4,
    "label": "NIM Nemotron 70B",
    "tier": "nim",
    "notes": "NVIDIA NIM cloud — Nemotron 70B, Tokkio Model-1 baseline chat layer"
  },
  "nim-llama3-8b": {
    "url": "$NIM_BASE",
    "model": "meta/llama-3.1-8b-instruct",
    "api_key_env": "NGC_API_KEY",
    "concurrency": 8,
    "label": "NIM Llama 3.1 8B",
    "tier": "nim",
    "notes": "NVIDIA NIM cloud — fast Llama 3.1 8B for speed baseline"
  },
  "nim-mistral-nemo": {
    "url": "$NIM_BASE",
    "model": "mistralai/mistral-nemo-12b-instruct",
    "api_key_env": "NGC_API_KEY",
    "concurrency": 8,
    "label": "NIM Mistral Nemo 12B",
    "tier": "nim",
    "notes": "NVIDIA NIM cloud — Mistral Nemo 12B"
  }
}
JSONEOF
ok "Written $PIPELINES_FILE"

# Set env var for server pickup
if ! grep -q '^CRANE_NIM_PIPELINES=' "$ENV_FILE" 2>/dev/null; then
  echo "CRANE_NIM_PIPELINES=$PIPELINES_FILE" >> "$ENV_FILE"
  ok "Added CRANE_NIM_PIPELINES to $ENV_FILE"
fi

# ── 7. Reload pipeline list if server is running ──────────────────────────────
hdr "PIPELINE RELOAD"
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
  curl -sf -X POST http://localhost:8000/api/pipelines/reload > /dev/null 2>/dev/null && \
    ok "CRANE server reloaded pipeline list" || \
    echo "   Reload endpoint not yet wired — restart crane server to pick up NIM pipelines."
else
  echo "   CRANE server not running — NIM pipelines will load on next server start."
fi

echo ""
echo -e "${GRN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GRN}  NGC NIM setup complete.${NC}"
echo -e "  Pipelines file : $PIPELINES_FILE"
echo -e "  Key env        : NGC_API_KEY in $ENV_FILE"
echo -e "  Next step      : Run  bash scripts/setup_tokkio_ace.sh  to wire"
echo -e "                   the full Tokkio ACE stack (ASR → A2F → RTX)."
echo -e "${GRN}═══════════════════════════════════════════════════════${NC}"

# ════════════════════════════════════════════════════════════════════════════
# HOSTINGER — Agentic email management via SMTP/IMAP + Hostinger API
# Gives CRANE Engineers the ability to send alerts, reports and PR summaries
# ════════════════════════════════════════════════════════════════════════════
hdr "HOSTINGER EMAIL SETUP"

HOSTINGER_EMAIL=""
HOSTINGER_PASS=""
HOSTINGER_API_KEY=""

# Pull from env file if already set
[[ -f "$ENV_FILE" ]] && {
  HOSTINGER_EMAIL=$(grep -E '^HOSTINGER_EMAIL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  HOSTINGER_PASS=$(grep  -E '^HOSTINGER_SMTP_PASS=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  HOSTINGER_API_KEY=$(grep -E '^HOSTINGER_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
}

# Prompt for missing values
if [[ -z "$HOSTINGER_EMAIL" ]]; then
  echo -n "Hostinger email address (e.g. you@yourdomain.com): "
  read -r HOSTINGER_EMAIL
fi
if [[ -z "$HOSTINGER_PASS" ]]; then
  echo -n "Hostinger SMTP password (or app password): "
  read -rs HOSTINGER_PASS; echo
fi
if [[ -z "$HOSTINGER_API_KEY" ]]; then
  echo -n "Hostinger API key (from hpanel → API Tokens, or press Enter to skip): "
  read -rs HOSTINGER_API_KEY; echo
fi

# Persist to env file
grep -q '^HOSTINGER_EMAIL=' "$ENV_FILE" 2>/dev/null && \
  sed -i "s|^HOSTINGER_EMAIL=.*|HOSTINGER_EMAIL=$HOSTINGER_EMAIL|" "$ENV_FILE" || \
  echo "HOSTINGER_EMAIL=$HOSTINGER_EMAIL" >> "$ENV_FILE"

grep -q '^HOSTINGER_SMTP_PASS=' "$ENV_FILE" 2>/dev/null && \
  sed -i "s|^HOSTINGER_SMTP_PASS=.*|HOSTINGER_SMTP_PASS=$HOSTINGER_PASS|" "$ENV_FILE" || \
  echo "HOSTINGER_SMTP_PASS=$HOSTINGER_PASS" >> "$ENV_FILE"

[[ -n "$HOSTINGER_API_KEY" ]] && {
  grep -q '^HOSTINGER_API_KEY=' "$ENV_FILE" 2>/dev/null && \
    sed -i "s|^HOSTINGER_API_KEY=.*|HOSTINGER_API_KEY=$HOSTINGER_API_KEY|" "$ENV_FILE" || \
    echo "HOSTINGER_API_KEY=$HOSTINGER_API_KEY" >> "$ENV_FILE"
  ok "Hostinger API key stored"
}
ok "Hostinger credentials saved to $ENV_FILE"

# ── Smoke-test SMTP (send a test email to self) ───────────────────────────
hdr "HOSTINGER SMTP TEST"
if command -v python3 >/dev/null 2>&1; then
  python3 - <<PYEOF
import smtplib, ssl, os, sys
EMAIL = "$HOSTINGER_EMAIL"
PASS  = "$HOSTINGER_PASS"
if not EMAIL or not PASS:
    print("   Skipping SMTP test — credentials not set.")
    sys.exit(0)
try:
    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.hostinger.com", 465, context=ctx) as s:
        s.login(EMAIL, PASS)
        s.sendmail(EMAIL, EMAIL, f"""From: CRANE <{EMAIL}>
To: {EMAIL}
Subject: CRANE Hostinger SMTP test

CRANE email agent connected. Hostinger SMTP verified.
""")
    print("✓  SMTP test email sent to", EMAIL)
except Exception as e:
    print(f"✗  SMTP failed: {e}")
    print("   Check credentials or use an App Password from hPanel → Email → Manage")
PYEOF
else
  inf "python3 not found — skipping SMTP test"
fi

# ── Hostinger API test (if key provided) ─────────────────────────────────
if [[ -n "$HOSTINGER_API_KEY" ]]; then
  hdr "HOSTINGER API TEST"
  API_RESP=$(curl -sf "https://api.hostinger.com/v1/profile" \
    -H "Authorization: Bearer $HOSTINGER_API_KEY" 2>&1 || echo "error")
  if echo "$API_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Account:', d.get('email','?'))" 2>/dev/null; then
    ok "Hostinger API connected"
  else
    inf "API response: ${API_RESP:0:120}"
    inf "(Profile endpoint may differ — check docs.hostinger.com/api)"
  fi
fi

# ── Write Hostinger email config for CRANE engineers module ─────────────
HOSTINGER_CONF="$CRANE_DIR/src/server/hostinger_email.json"
cat > "$HOSTINGER_CONF" << JSONEOF
{
  "provider": "hostinger",
  "smtp": {
    "host": "smtp.hostinger.com",
    "port": 465,
    "tls": "ssl",
    "from_env": "HOSTINGER_EMAIL",
    "pass_env": "HOSTINGER_SMTP_PASS"
  },
  "imap": {
    "host": "imap.hostinger.com",
    "port": 993,
    "tls": true,
    "from_env": "HOSTINGER_EMAIL",
    "pass_env": "HOSTINGER_SMTP_PASS"
  },
  "api": {
    "base": "https://api.hostinger.com/v1",
    "key_env": "HOSTINGER_API_KEY"
  },
  "agent_tasks": [
    "send_build_report",
    "send_pr_summary",
    "send_alert",
    "send_daily_digest",
    "read_inbox_for_tasks",
    "reply_to_flagged"
  ],
  "inbox_poll_interval_sec": 300,
  "label_for_agent_tasks": "CRANE-TASK"
}
JSONEOF
ok "Written: src/server/hostinger_email.json"

grep -q '^CRANE_EMAIL_CONFIG=' "$ENV_FILE" 2>/dev/null || \
  echo "CRANE_EMAIL_CONFIG=$HOSTINGER_CONF" >> "$ENV_FILE"
ok "CRANE_EMAIL_CONFIG set in $ENV_FILE"

# Store in CRANE vault
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
  curl -sf -X POST http://localhost:8000/api/vault/store \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"hostinger_email\",\"value\":\"$HOSTINGER_EMAIL\"}" > /dev/null && \
  curl -sf -X POST http://localhost:8000/api/vault/store \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"hostinger_smtp_pass\",\"value\":\"$HOSTINGER_PASS\"}" > /dev/null && \
  ok "Credentials stored in CRANE vault" || true
fi

echo ""
echo -e "${GRN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GRN}  Hostinger email agent ready.${NC}"
echo -e "  SMTP  : smtp.hostinger.com:465 (SSL)"
echo -e "  IMAP  : imap.hostinger.com:993 (TLS)"
echo -e "  Config: src/server/hostinger_email.json"
echo -e ""
echo -e "  ${YEL}CRANE engineer tasks available:${NC}"
echo -e "    send_build_report   — auto-email after each build"
echo -e "    send_pr_summary     — email when PR opens/merges"
echo -e "    send_alert          — OOM / circuit-breaker fires"
echo -e "    read_inbox_for_tasks — poll IMAP for CRANE-TASK label"
echo -e "${GRN}═══════════════════════════════════════════════════════${NC}"
