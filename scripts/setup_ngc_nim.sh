#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CRANE · NGC NIM + Hostinger email setup
#
# Collects ALL credentials upfront in one go, then runs every setup step.
# No interruptions mid-run.
#
# Usage:  bash scripts/setup_ngc_nim.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; CYN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'
ok()  { echo -e "${GRN}✓${NC}  $*"; }
bad() { echo -e "${RED}✗${NC}  $*"; }
hdr() { echo -e "\n${CYN}══ $* ══${NC}"; }
inf() { echo -e "   ${DIM}$*${NC}"; }

CRANE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$HOME/.hermes/.env"
NIM_BASE="https://integrate.api.nvidia.com/v1"
NIM_MODEL="${NIM_MODEL:-nvidia/llama-3.1-nemotron-70b-instruct}"
PIPELINES_FILE="$CRANE_DIR/src/server/nim_pipelines.json"
HOSTINGER_CONF="$CRANE_DIR/src/server/hostinger_email.json"

# Load existing env file (soft — don't fail if missing)
mkdir -p "$(dirname "$ENV_FILE")"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" 2>/dev/null && set +a || true

# ════════════════════════════════════════════════════════════════════════════
# STEP 1 — COLLECT ALL CREDENTIALS UPFRONT
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YEL}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YEL}║  CRANE · Credential Setup                           ║${NC}"
echo -e "${YEL}║  Paste all three tokens now — then sit back.        ║${NC}"
echo -e "${YEL}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1a. NGC API key ───────────────────────────────────────────────────────
NGC_KEY="${NGC_API_KEY:-}"
if [[ -z "$NGC_KEY" ]]; then
  echo -e "${CYN}[1/3]${NC} NGC API key  ${DIM}(nvapi-... from ngc.nvidia.com → Account → API Keys)${NC}"
  echo -n "      → "
  read -rs NGC_KEY; echo
fi
[[ -z "$NGC_KEY" ]] && { bad "NGC API key required. Exiting."; exit 1; }
echo -e "      ${GRN}✓${NC} NGC key received (${NGC_KEY:0:12}…)"

# ── 1b. Hostinger email ───────────────────────────────────────────────────
HOSTINGER_EMAIL="${HOSTINGER_EMAIL:-}"
if [[ -z "$HOSTINGER_EMAIL" ]]; then
  echo ""
  echo -e "${CYN}[2/3]${NC} Hostinger email address  ${DIM}(e.g. you@yourdomain.com)${NC}"
  echo -n "      → "
  read -r HOSTINGER_EMAIL
fi
echo -e "      ${GRN}✓${NC} Email: $HOSTINGER_EMAIL"

# ── 1c. Hostinger SMTP password ───────────────────────────────────────────
HOSTINGER_PASS="${HOSTINGER_SMTP_PASS:-}"
if [[ -z "$HOSTINGER_PASS" ]]; then
  echo ""
  echo -e "${CYN}[3/3]${NC} Hostinger SMTP password  ${DIM}(hPanel → Email → Manage → App Password)${NC}"
  echo -n "      → "
  read -rs HOSTINGER_PASS; echo
fi
echo -e "      ${GRN}✓${NC} SMTP password received"

# ── 1d. Hostinger API key (optional) ─────────────────────────────────────
HOSTINGER_API_KEY="${HOSTINGER_API_KEY:-}"
if [[ -z "$HOSTINGER_API_KEY" ]]; then
  echo ""
  echo -e "${DIM}[opt]  Hostinger API key  (hPanel → API Tokens — press Enter to skip)${NC}"
  echo -n "      → "
  read -rs HOSTINGER_API_KEY; echo
  [[ -z "$HOSTINGER_API_KEY" ]] && inf "Skipped — email tasks will use SMTP/IMAP only"
fi
[[ -n "$HOSTINGER_API_KEY" ]] && echo -e "      ${GRN}✓${NC} Hostinger API key received"

echo ""
echo -e "${GRN}All credentials collected. Running setup…${NC}"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# STEP 2 — PERSIST TO ENV FILE
# ════════════════════════════════════════════════════════════════════════════
hdr "SAVING TO $ENV_FILE"

_upsert() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

_upsert "NGC_API_KEY"       "$NGC_KEY"
_upsert "HOSTINGER_EMAIL"   "$HOSTINGER_EMAIL"
_upsert "HOSTINGER_SMTP_PASS" "$HOSTINGER_PASS"
[[ -n "$HOSTINGER_API_KEY" ]] && _upsert "HOSTINGER_API_KEY" "$HOSTINGER_API_KEY"
_upsert "CRANE_NIM_PIPELINES"  "$PIPELINES_FILE"
_upsert "CRANE_EMAIL_CONFIG"   "$HOSTINGER_CONF"
ok "All keys written to $ENV_FILE"

# ════════════════════════════════════════════════════════════════════════════
# STEP 3 — NGC NIM: TEST + REGISTER PIPELINES
# ════════════════════════════════════════════════════════════════════════════
hdr "NIM ENDPOINT TEST  ($NIM_MODEL)"
RESP=$(curl -sf "$NIM_BASE/chat/completions" \
  -H "Authorization: Bearer $NGC_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$NIM_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply: CRANE_NIM_OK\"}],\"max_tokens\":8,\"stream\":false}" \
  2>&1) || { bad "NIM request failed — check NGC key or network:\n$RESP"; RESP=""; }

if [[ -n "$RESP" ]]; then
  CONTENT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'].strip())" 2>/dev/null || echo "")
  ok "NIM responding: ${CONTENT:0:80}"
fi

hdr "STREAMING TEST"
curl -sf "$NIM_BASE/chat/completions" \
  -H "Authorization: Bearer $NGC_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$NIM_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Hi\"}],\"max_tokens\":5,\"stream\":true}" \
  | head -c 300 | grep -q "data:" && ok "Streaming SSE confirmed" || inf "Streaming check inconclusive"

hdr "AVAILABLE NIM MODELS (first 12)"
curl -sf "$NIM_BASE/models" -H "Authorization: Bearer $NGC_KEY" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
for m in d.get('data',[])[:12]: print('  ', m['id'])
" 2>/dev/null || inf "(model list endpoint not available)"

hdr "REGISTERING NIM PIPELINES → nim_pipelines.json"
cat > "$PIPELINES_FILE" << JSONEOF
{
  "nim-nemotron-70b": {
    "url": "$NIM_BASE",
    "model": "nvidia/llama-3.1-nemotron-70b-instruct",
    "api_key_env": "NGC_API_KEY",
    "concurrency": 4,
    "label": "NIM Nemotron 70B",
    "tier": "nim",
    "notes": "NVIDIA NIM cloud — Tokkio Model-1 baseline chat layer"
  },
  "nim-llama3-8b": {
    "url": "$NIM_BASE",
    "model": "meta/llama-3.1-8b-instruct",
    "api_key_env": "NGC_API_KEY",
    "concurrency": 8,
    "label": "NIM Llama 3.1 8B",
    "tier": "nim",
    "notes": "NVIDIA NIM cloud — fast 8B speed baseline"
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

# ════════════════════════════════════════════════════════════════════════════
# STEP 4 — HOSTINGER: TEST SMTP + WRITE CONFIG
# ════════════════════════════════════════════════════════════════════════════
hdr "HOSTINGER SMTP TEST"
python3 - <<PYEOF
import smtplib, ssl, sys
EMAIL = "$HOSTINGER_EMAIL"
PASS  = "$HOSTINGER_PASS"
try:
    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.hostinger.com", 465, context=ctx) as s:
        s.login(EMAIL, PASS)
        s.sendmail(EMAIL, EMAIL,
            f"From: CRANE <{EMAIL}>\r\nTo: {EMAIL}\r\n"
            f"Subject: CRANE email agent connected\r\n\r\n"
            f"Hostinger SMTP verified. CRANE agentic email is live.")
    print("✓  Test email sent to", EMAIL)
except Exception as e:
    print(f"✗  SMTP failed: {e}")
    print("   Use an App Password from hPanel → Email → Manage")
PYEOF

if [[ -n "$HOSTINGER_API_KEY" ]]; then
  hdr "HOSTINGER API TEST"
  API_RESP=$(curl -sf "https://api.hostinger.com/v1/profile" \
    -H "Authorization: Bearer $HOSTINGER_API_KEY" 2>&1 || echo "{}")
  echo "$API_RESP" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print('✓  API connected — account:', d.get('email', d.get('id','?')))
except:
    print('   API response received (check docs.hostinger.com/api for profile path)')
" 2>/dev/null || true
fi

hdr "WRITING HOSTINGER CONFIG → hostinger_email.json"
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
ok "Written $HOSTINGER_CONF"

# ════════════════════════════════════════════════════════════════════════════
# STEP 5 — CRANE VAULT (if server running)
# ════════════════════════════════════════════════════════════════════════════
hdr "CRANE VAULT"
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
  _vault() { curl -sf -X POST http://localhost:8000/api/vault/store \
    -H "Content-Type: application/json" -d "{\"key\":\"$1\",\"value\":\"$2\"}" > /dev/null; }
  _vault "ngc"             "$NGC_KEY"
  _vault "hostinger_email" "$HOSTINGER_EMAIL"
  _vault "hostinger_smtp"  "$HOSTINGER_PASS"
  [[ -n "$HOSTINGER_API_KEY" ]] && _vault "hostinger_api" "$HOSTINGER_API_KEY"
  curl -sf -X POST http://localhost:8000/api/pipelines/reload > /dev/null 2>/dev/null || true
  ok "All keys stored in CRANE vault + pipelines reloaded"
else
  inf "CRANE server not running — keys in $ENV_FILE only; vault + reload on next server start"
fi

# ════════════════════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GRN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}║  Setup complete                                      ║${NC}"
echo -e "${GRN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GRN}║${NC}  NGC NIM     3 pipelines in nim_pipelines.json       ${GRN}║${NC}"
echo -e "${GRN}║${NC}  Hostinger   SMTP/IMAP + 6 agent tasks wired         ${GRN}║${NC}"
echo -e "${GRN}║${NC}  Env file    $ENV_FILE"
echo -e "${GRN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GRN}║${NC}  ${YEL}Next:${NC} bash scripts/setup_tokkio_ace.sh --nim-only  ${GRN}║${NC}"
echo -e "${GRN}╚══════════════════════════════════════════════════════╝${NC}"
