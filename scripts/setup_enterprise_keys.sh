#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CRANE · Enterprise key setup — NGC Enterprise + HuggingFace
# Asks one at a time, detects key format, stores + tests both.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; CYN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'
ok()  { echo -e "${GRN}✓${NC}  $*"; }
bad() { echo -e "${RED}✗${NC}  $*"; }
hdr() { echo -e "\n${CYN}══ $* ══${NC}"; }
inf() { echo -e "   ${DIM}$*${NC}"; }

ENV_FILE="$HOME/.hermes/.env"
mkdir -p "$(dirname "$ENV_FILE")"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" 2>/dev/null && set +a || true

_upsert() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

NIM_BASE="https://integrate.api.nvidia.com/v1"
CRANE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo -e "${YEL}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YEL}║  CRANE · Enterprise + HuggingFace key setup         ║${NC}"
echo -e "${YEL}╚══════════════════════════════════════════════════════╝${NC}"

# ── [1/2] NGC Enterprise key ─────────────────────────────────────────────────
echo ""
echo -e "${CYN}[1/2]${NC} NGC Enterprise key"
inf "Paste whatever NVIDIA gave you — any format is fine."
inf "Could be: nvapi-...  •  org-token-...  •  a long hex string  •  email:password"
echo -n "      → "
read -rs NGC_ENT; echo

if [[ -z "$NGC_ENT" ]]; then
  bad "No key entered — skipping NGC Enterprise."
  NGC_ENT=""
else
  echo -e "      ${GRN}✓${NC} Enterprise key received (${NGC_ENT:0:14}…)"
fi

# ── [2/2] HuggingFace token ───────────────────────────────────────────────────
echo ""
echo -e "${CYN}[2/2]${NC} HuggingFace token"
inf "From hf.co → Settings → Access Tokens  (hf_...)"
# Check opencode.jsonc for existing token
HF_KEY="${HUGGINGFACE_API_KEY:-}"
if [[ -z "$HF_KEY" ]]; then
  HF_KEY=$(grep -o '"apiKey": *"hf_[^"]*"' "$HOME/.config/opencode/opencode.jsonc" 2>/dev/null \
           | grep -o 'hf_[^"]*' | head -1 || true)
fi
if [[ -n "$HF_KEY" ]]; then
  inf "Found existing token in opencode.jsonc (${HF_KEY:0:10}…) — press Enter to keep it."
fi
echo -n "      → "
read -rs HF_INPUT; echo
[[ -n "$HF_INPUT" ]] && HF_KEY="$HF_INPUT"

if [[ -z "$HF_KEY" ]]; then
  bad "No HF token — skipping HuggingFace."
else
  echo -e "      ${GRN}✓${NC} HF token received (${HF_KEY:0:10}…)"
fi

echo ""
echo -e "${GRN}All entries collected. Storing + testing…${NC}"

# ════════════════════════════════════════════════════════════════════════════
# NGC ENTERPRISE — detect format, store, test, unlock model list
# ════════════════════════════════════════════════════════════════════════════
if [[ -n "$NGC_ENT" ]]; then
  hdr "NGC ENTERPRISE KEY"

  # Detect format
  if   [[ "$NGC_ENT" == nvapi-* ]];           then FORMAT="nvapi (NIM inference)"
  elif [[ "$NGC_ENT" == *:* ]];               then FORMAT="user:password (NGC registry)"
  elif [[ ${#NGC_ENT} -eq 64 ]];             then FORMAT="hex token (NGC personal)"
  elif [[ "$NGC_ENT" == oauthtoken* ]];       then FORMAT="OAuth token"
  else                                              FORMAT="unknown — will try as Bearer"
  fi
  ok "Format detected: $FORMAT"

  _upsert "NGC_ENTERPRISE_KEY" "$NGC_ENT"
  ok "Stored as NGC_ENTERPRISE_KEY in $ENV_FILE"

  # Also alias as NGC_API_KEY if it looks like a NIM key and differs from existing
  EXISTING_NGC="${NGC_API_KEY:-}"
  if [[ "$NGC_ENT" == nvapi-* && "$NGC_ENT" != "$EXISTING_NGC" ]]; then
    inf "Looks like a NIM key — also storing as NGC_API_KEY_ENTERPRISE"
    _upsert "NGC_API_KEY_ENTERPRISE" "$NGC_ENT"
  fi

  # Test against NIM inference with enterprise key
  hdr "TESTING ENTERPRISE NIM ACCESS"
  RESP=$(curl -sf "$NIM_BASE/chat/completions" \
    -H "Authorization: Bearer $NGC_ENT" \
    -H "Content-Type: application/json" \
    -d '{"model":"nvidia/llama-3.1-nemotron-70b-instruct","messages":[{"role":"user","content":"Reply: ENT_OK"}],"max_tokens":6,"stream":false}' \
    2>&1) && \
  CONTENT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'][:60])" 2>/dev/null || echo "") && \
  ok "NIM inference with enterprise key: $CONTENT" || \
  inf "NIM inference test inconclusive — may need different endpoint for enterprise"

  # Pull full enterprise model list
  hdr "ENTERPRISE MODEL CATALOG"
  MODEL_RESP=$(curl -sf "$NIM_BASE/models" \
    -H "Authorization: Bearer $NGC_ENT" 2>/dev/null || echo "{}")
  MODEL_COUNT=$(echo "$MODEL_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "0")

  if [[ "$MODEL_COUNT" -gt 0 ]]; then
    ok "$MODEL_COUNT models accessible with enterprise key"
    echo "$MODEL_RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
models = [m['id'] for m in d.get('data',[])]
# Show enterprise-only models (ones with 'nemotron', 'cosmos', 'edify', 'vila', 'nemo')
ent = [m for m in models if any(x in m.lower() for x in ['nemotron','cosmos','edify','vila','nemo','parakeet','canary'])]
print(f'  Enterprise models detected ({len(ent)}):')
for m in ent[:15]: print(f'    {m}')
if len(ent) > 15: print(f'    … and {len(ent)-15} more')
" 2>/dev/null || true
  else
    inf "Model list empty — enterprise key may use a different catalog endpoint"
    inf "Check: https://catalog.ngc.nvidia.com/enterprise"
  fi

  # Write enterprise pipelines file
  hdr "WRITING ENTERPRISE PIPELINES"
  cat > "$CRANE_DIR/src/server/nim_enterprise_pipelines.json" << JSONEOF
{
  "nim-nemotron-340b": {
    "url": "$NIM_BASE",
    "model": "nvidia/nemotron-4-340b-instruct",
    "api_key_env": "NGC_ENTERPRISE_KEY",
    "concurrency": 2,
    "label": "NIM Nemotron-4 340B (Enterprise)",
    "tier": "nim-enterprise",
    "notes": "NVIDIA Enterprise — 340B, highest capability, restricted access"
  },
  "nim-nemotron-70b-ent": {
    "url": "$NIM_BASE",
    "model": "nvidia/llama-3.1-nemotron-70b-instruct",
    "api_key_env": "NGC_ENTERPRISE_KEY",
    "concurrency": 4,
    "label": "NIM Nemotron 70B (Enterprise key)",
    "tier": "nim-enterprise",
    "notes": "Same model, enterprise key — higher rate limits"
  },
  "nim-parakeet-asr": {
    "url": "https://ai.api.nvidia.com/v1/asr/nvidia/parakeet-ctc-1-1b",
    "model": "nvidia/parakeet-ctc-1-1b",
    "api_key_env": "NGC_ENTERPRISE_KEY",
    "concurrency": 4,
    "label": "NIM Parakeet ASR (Enterprise)",
    "tier": "nim-enterprise",
    "notes": "Riva ASR — enterprise tier, Tokkio Model-1 ASR layer"
  }
}
JSONEOF
  ok "Written src/server/nim_enterprise_pipelines.json"
  _upsert "CRANE_NIM_ENT_PIPELINES" "$CRANE_DIR/src/server/nim_enterprise_pipelines.json"
fi

# ════════════════════════════════════════════════════════════════════════════
# HUGGINGFACE — store, test, patch opencode.jsonc
# ════════════════════════════════════════════════════════════════════════════
if [[ -n "$HF_KEY" ]]; then
  hdr "HUGGINGFACE TOKEN"
  _upsert "HUGGINGFACE_API_KEY" "$HF_KEY"
  ok "Stored as HUGGINGFACE_API_KEY in $ENV_FILE"

  # Test whoami
  HF_RESP=$(curl -sf "https://huggingface.co/api/whoami" \
    -H "Authorization: Bearer $HF_KEY" 2>/dev/null || echo "{}")
  HF_USER=$(echo "$HF_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name','?'))" 2>/dev/null || echo "")
  HF_PLAN=$(echo "$HF_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
orgs = d.get('orgs',[])
pro = any(o.get('name','').lower() in ['pro','hf-pro'] for o in orgs) or d.get('isPro', False)
print('Pro' if pro else 'Free')
" 2>/dev/null || echo "unknown")

  if [[ -n "$HF_USER" && "$HF_USER" != "?" ]]; then
    ok "HuggingFace: $HF_USER ($HF_PLAN)"
  else
    inf "HF auth check inconclusive — token stored, check hf.co manually"
  fi

  # Patch opencode.jsonc apiKey if different
  OC_FILE="$HOME/.config/opencode/opencode.jsonc"
  if [[ -f "$OC_FILE" ]]; then
    EXISTING_HF=$(grep -o '"apiKey": *"hf_[^"]*"' "$OC_FILE" 2>/dev/null | grep -o 'hf_[^"]*' | head -1 || true)
    if [[ "$EXISTING_HF" != "$HF_KEY" ]]; then
      sed -i "s|\"apiKey\": *\"hf_[^\"]*\"|\"apiKey\": \"$HF_KEY\"|g" "$OC_FILE"
      ok "Updated HF apiKey in opencode.jsonc"
    else
      ok "opencode.jsonc already has correct HF token"
    fi
  fi

  # Vault
  if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    curl -sf -X POST http://localhost:8000/api/vault/store \
      -H "Content-Type: application/json" \
      -d "{\"key\":\"huggingface\",\"value\":\"$HF_KEY\"}" > /dev/null && \
      ok "HF token stored in CRANE vault"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# FINAL KEY CHECK
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YEL}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YEL}║  Key status after setup                             ║${NC}"
echo -e "${YEL}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

_chk() {
  local label="$1" key="$2"
  local val=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  if [[ -n "$val" ]]; then
    printf "  ${GRN}✓${NC}  %-30s ${DIM}[%d chars] %s…${NC}\n" "$label" "${#val}" "${val:0:12}"
  else
    printf "  ${RED}✗${NC}  %-30s ${YEL}MISSING${NC}\n" "$label"
  fi
}

_chk "NGC_API_KEY"             "NGC_API_KEY"
_chk "NGC_ENTERPRISE_KEY"      "NGC_ENTERPRISE_KEY"
_chk "HUGGINGFACE_API_KEY"     "HUGGINGFACE_API_KEY"
_chk "JEV / TYPESAFE_API_KEY"  "TYPESAFE_API_KEY"
_chk "HOSTINGER_EMAIL"         "HOSTINGER_EMAIL"
_chk "HOSTINGER_SMTP_PASS"     "HOSTINGER_SMTP_PASS"
echo ""
