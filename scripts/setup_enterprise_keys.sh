#!/usr/bin/env bash
# Usage:
#   bash scripts/setup_enterprise_keys.sh  NGC_ENTERPRISE_KEY  HF_TOKEN
#
# Example:
#   bash scripts/setup_enterprise_keys.sh  nvapi-xxxx  hf_xxxx

ENV_FILE="$HOME/.hermes/.env"
CRANE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NIM_BASE="https://integrate.api.nvidia.com/v1"

GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[1;33m'; CYN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'
ok()  { echo -e "${GRN}✓${NC}  $*"; }
bad() { echo -e "${RED}✗${NC}  $*"; }
hdr() { echo -e "\n${CYN}══ $* ══${NC}"; }
inf() { echo -e "   ${DIM}$*${NC}"; }

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

NGC_ENT="${1:-}"
HF_KEY="${2:-}"

if [[ -z "$NGC_ENT" && -z "$HF_KEY" ]]; then
  echo -e "${YEL}Usage:${NC}"
  echo "  bash scripts/setup_enterprise_keys.sh  NGC_ENTERPRISE_KEY  HF_TOKEN"
  echo ""
  echo "  Both args are optional — pass only what you have:"
  echo "  bash scripts/setup_enterprise_keys.sh  nvapi-xxxx  ''"
  echo "  bash scripts/setup_enterprise_keys.sh  ''  hf_xxxx"
  exit 0
fi

_upsert() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

echo ""
echo -e "${YEL}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YEL}║  CRANE · Enterprise + HuggingFace key setup         ║${NC}"
echo -e "${YEL}╚══════════════════════════════════════════════════════╝${NC}"

# ── NGC Enterprise ────────────────────────────────────────────────────────
if [[ -n "$NGC_ENT" ]]; then
  hdr "NGC ENTERPRISE KEY"

  if   [[ "$NGC_ENT" == nvapi-* ]];  then FORMAT="nvapi (NIM inference)"
  elif [[ "$NGC_ENT" == *:* ]];      then FORMAT="user:password (registry)"
  elif [[ ${#NGC_ENT} -ge 60 ]];     then FORMAT="hex/bearer token"
  else                                    FORMAT="unknown — trying as Bearer"
  fi

  _upsert "NGC_ENTERPRISE_KEY"     "$NGC_ENT"
  _upsert "NGC_API_KEY_ENTERPRISE" "$NGC_ENT"
  ok "Saved NGC_ENTERPRISE_KEY  ($FORMAT)"

  hdr "TESTING NIM ACCESS"
  TEST=$(curl -sf --max-time 15 "$NIM_BASE/chat/completions" \
    -H "Authorization: Bearer $NGC_ENT" \
    -H "Content-Type: application/json" \
    -d '{"model":"nvidia/llama-3.1-nemotron-70b-instruct","messages":[{"role":"user","content":"Reply: ENT_OK"}],"max_tokens":6,"stream":false}' 2>/dev/null) || TEST=""

  if [[ -n "$TEST" ]]; then
    echo "$TEST" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print('✓  NIM responding:', d['choices'][0]['message']['content'][:60])
except: print('   NIM reached (could not parse response)')
" 2>/dev/null || ok "NIM reachable"
  else
    inf "NIM test timed out — key saved, test manually"
  fi

  hdr "ENTERPRISE MODEL CATALOG"
  MLIST=$(curl -sf --max-time 15 "$NIM_BASE/models" \
    -H "Authorization: Bearer $NGC_ENT" 2>/dev/null) || MLIST=""
  if [[ -n "$MLIST" ]]; then
    echo "$MLIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids=[m['id'] for m in d.get('data',[])]
print(f'  {len(ids)} models accessible')
ent=[m for m in ids if any(x in m.lower() for x in ['nemotron','cosmos','edify','vila','nemo','parakeet','canary'])]
if ent:
  print(f'  Enterprise models:')
  for m in ent[:12]: print(f'    {m}')
" 2>/dev/null || inf "Model list received"
  else
    inf "Model catalog unavailable with this key"
  fi

  cat > "$CRANE_DIR/src/server/nim_enterprise_pipelines.json" << EOF
{
  "nim-nemotron-340b": {
    "url": "$NIM_BASE",
    "model": "nvidia/nemotron-4-340b-instruct",
    "api_key_env": "NGC_ENTERPRISE_KEY",
    "concurrency": 2,
    "label": "NIM Nemotron-4 340B (Enterprise)",
    "tier": "nim-enterprise"
  },
  "nim-nemotron-70b-ent": {
    "url": "$NIM_BASE",
    "model": "nvidia/llama-3.1-nemotron-70b-instruct",
    "api_key_env": "NGC_ENTERPRISE_KEY",
    "concurrency": 4,
    "label": "NIM Nemotron 70B (Enterprise key)",
    "tier": "nim-enterprise"
  },
  "nim-parakeet-asr": {
    "url": "https://ai.api.nvidia.com/v1/asr/nvidia/parakeet-ctc-1-1b",
    "model": "nvidia/parakeet-ctc-1-1b",
    "api_key_env": "NGC_ENTERPRISE_KEY",
    "concurrency": 4,
    "label": "NIM Parakeet ASR (Enterprise)",
    "tier": "nim-enterprise"
  }
}
EOF
  _upsert "CRANE_NIM_ENT_PIPELINES" "$CRANE_DIR/src/server/nim_enterprise_pipelines.json"
  ok "Written nim_enterprise_pipelines.json"
fi

# ── HuggingFace ───────────────────────────────────────────────────────────
if [[ -n "$HF_KEY" ]]; then
  hdr "HUGGINGFACE TOKEN"
  _upsert "HUGGINGFACE_API_KEY" "$HF_KEY"
  ok "Saved HUGGINGFACE_API_KEY"

  HF_RESP=$(curl -sf --max-time 10 "https://huggingface.co/api/whoami" \
    -H "Authorization: Bearer $HF_KEY" 2>/dev/null) || HF_RESP=""
  if [[ -n "$HF_RESP" ]]; then
    echo "$HF_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('✓  Account:', d.get('name','?'), '|', 'Pro' if d.get('isPro') else 'Free')
" 2>/dev/null || ok "HF token accepted"
  else
    inf "HF API check inconclusive — token saved"
  fi

  OC="$HOME/.config/opencode/opencode.jsonc"
  if [[ -f "$OC" ]]; then
    sed -i "s|\"apiKey\": *\"hf_[^\"]*\"|\"apiKey\": \"$HF_KEY\"|g" "$OC" && ok "Updated opencode.jsonc" || true
  fi
fi

# ── Final status ──────────────────────────────────────────────────────────
echo ""
echo -e "${YEL}╔══════════ Key status ════════════════════════════════╗${NC}"
_chk() {
  local label="$1" key="$2"
  local val
  val=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"') || val=""
  if [[ -n "$val" ]]; then
    printf "  ${GRN}✓${NC}  %-30s ${DIM}%s…${NC}\n" "$label" "${val:0:16}"
  else
    printf "  ${RED}✗${NC}  %-30s ${YEL}MISSING${NC}\n" "$label"
  fi
}
_chk "NGC_API_KEY"            "NGC_API_KEY"
_chk "NGC_ENTERPRISE_KEY"     "NGC_ENTERPRISE_KEY"
_chk "HUGGINGFACE_API_KEY"    "HUGGINGFACE_API_KEY"
_chk "TYPESAFE_API_KEY (JEV)" "TYPESAFE_API_KEY"
_chk "HOSTINGER_EMAIL"        "HOSTINGER_EMAIL"
_chk "HOSTINGER_SMTP_PASS"    "HOSTINGER_SMTP_PASS"
echo -e "${YEL}╚══════════════════════════════════════════════════════╝${NC}"
