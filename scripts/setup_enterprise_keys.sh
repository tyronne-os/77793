#!/usr/bin/env bash
# CRANE · Enterprise NGC + HuggingFace key setup
# Asks one at a time — no pipefail, every step is soft-fail safe.

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; CYN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'
ok()  { echo -e "${GRN}✓${NC}  $*"; }
bad() { echo -e "${RED}✗${NC}  $*"; }
hdr() { echo -e "\n${CYN}══ $* ══${NC}"; }
inf() { echo -e "   ${DIM}$*${NC}"; }

ENV_FILE="$HOME/.hermes/.env"
CRANE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NIM_BASE="https://integrate.api.nvidia.com/v1"

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

# Load env file silently
while IFS='=' read -r k v; do
  [[ "$k" =~ ^#.*$ || -z "$k" ]] && continue
  export "$k"="${v}" 2>/dev/null || true
done < "$ENV_FILE"

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

# ── [1/2] NGC Enterprise key ─────────────────────────────────────────────
echo ""
echo -e "${CYN}[1/2]${NC} NGC Enterprise key"
inf "Paste whatever NVIDIA gave you — any format accepted."
echo -n "      → "
read -rs NGC_ENT || NGC_ENT=""
echo ""

if [[ -z "$NGC_ENT" ]]; then
  bad "No key entered — skipping NGC Enterprise."
else
  echo -e "      ${GRN}✓${NC} Received (${NGC_ENT:0:14}…)"
fi

# ── [2/2] HuggingFace token ──────────────────────────────────────────────
echo ""
echo -e "${CYN}[2/2]${NC} HuggingFace token"
inf "From hf.co → Settings → Access Tokens  (hf_...)"

# Try to find existing token
EXISTING_HF=""
EXISTING_HF=$(grep -o '"apiKey": *"hf_[^"]*"' "$HOME/.config/opencode/opencode.jsonc" 2>/dev/null | grep -o 'hf_[^"]*' | head -1) || EXISTING_HF=""
[[ -z "$EXISTING_HF" ]] && EXISTING_HF="${HUGGINGFACE_API_KEY:-}"

if [[ -n "$EXISTING_HF" ]]; then
  inf "Found existing token (${EXISTING_HF:0:10}…) — press Enter to keep it."
fi
echo -n "      → "
read -rs HF_INPUT || HF_INPUT=""
echo ""

if [[ -n "$HF_INPUT" ]]; then
  HF_KEY="$HF_INPUT"
  echo -e "      ${GRN}✓${NC} New HF token received (${HF_KEY:0:10}…)"
elif [[ -n "$EXISTING_HF" ]]; then
  HF_KEY="$EXISTING_HF"
  echo -e "      ${GRN}✓${NC} Keeping existing token (${HF_KEY:0:10}…)"
else
  HF_KEY=""
  bad "No HF token — skipping HuggingFace."
fi

echo ""
echo -e "${GRN}Storing + testing…${NC}"

# ════════════════════════════════════════════════════════════════════════
# NGC ENTERPRISE
# ════════════════════════════════════════════════════════════════════════
if [[ -n "$NGC_ENT" ]]; then
  hdr "NGC ENTERPRISE KEY"

  if   [[ "$NGC_ENT" == nvapi-* ]];    then FORMAT="nvapi (NIM inference)"
  elif [[ "$NGC_ENT" == *:* ]];        then FORMAT="user:password (registry)"
  elif [[ ${#NGC_ENT} -ge 60 ]];       then FORMAT="hex/bearer token"
  else                                      FORMAT="unknown — trying as Bearer"
  fi
  ok "Format: $FORMAT"

  _upsert "NGC_ENTERPRISE_KEY" "$NGC_ENT"
  [[ "$NGC_ENT" == nvapi-* ]] && _upsert "NGC_API_KEY_ENTERPRISE" "$NGC_ENT"
  ok "Saved to $ENV_FILE"

  hdr "TESTING ENTERPRISE NIM"
  TEST_RESP=""
  TEST_RESP=$(curl -sf --max-time 15 "$NIM_BASE/chat/completions" \
    -H "Authorization: Bearer $NGC_ENT" \
    -H "Content-Type: application/json" \
    -d '{"model":"nvidia/llama-3.1-nemotron-70b-instruct","messages":[{"role":"user","content":"Reply: ENT_OK"}],"max_tokens":6,"stream":false}' \
    2>/dev/null) || TEST_RESP=""

  if [[ -n "$TEST_RESP" ]]; then
    CONTENT=$(echo "$TEST_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'][:60])" 2>/dev/null || echo "")
    ok "NIM responding: $CONTENT"
  else
    inf "NIM test inconclusive — key saved, test manually"
  fi

  hdr "ENTERPRISE MODEL CATALOG"
  MODEL_RESP=$(curl -sf --max-time 15 "$NIM_BASE/models" \
    -H "Authorization: Bearer $NGC_ENT" 2>/dev/null) || MODEL_RESP=""

  if [[ -n "$MODEL_RESP" ]]; then
    python3 - "$MODEL_RESP" << 'PYEOF'
import sys, json
try:
    d = json.loads(sys.argv[1])
    models = [m['id'] for m in d.get('data', [])]
    print(f"  {len(models)} models accessible")
    ent = [m for m in models if any(x in m.lower() for x in ['nemotron','cosmos','edify','vila','nemo','parakeet','canary','megatron'])]
    if ent:
        print(f"  Enterprise/exclusive models ({len(ent)}):")
        for m in ent[:15]: print(f"    {m}")
        if len(ent) > 15: print(f"    … +{len(ent)-15} more")
    else:
        print("  (no exclusive models flagged — all standard NIM models available)")
except Exception as e:
    print(f"  Could not parse model list: {e}")
PYEOF
  else
    inf "Model catalog unavailable — check ngc.nvidia.com/enterprise"
  fi

  hdr "ENTERPRISE PIPELINES FILE"
  cat > "$CRANE_DIR/src/server/nim_enterprise_pipelines.json" << JSONEOF
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
JSONEOF
  _upsert "CRANE_NIM_ENT_PIPELINES" "$CRANE_DIR/src/server/nim_enterprise_pipelines.json"
  ok "Written nim_enterprise_pipelines.json"
fi

# ════════════════════════════════════════════════════════════════════════
# HUGGINGFACE
# ════════════════════════════════════════════════════════════════════════
if [[ -n "$HF_KEY" ]]; then
  hdr "HUGGINGFACE TOKEN"
  _upsert "HUGGINGFACE_API_KEY" "$HF_KEY"
  ok "Saved to $ENV_FILE"

  HF_RESP=$(curl -sf --max-time 10 "https://huggingface.co/api/whoami" \
    -H "Authorization: Bearer $HF_KEY" 2>/dev/null) || HF_RESP=""

  if [[ -n "$HF_RESP" ]]; then
    python3 - "$HF_RESP" << 'PYEOF'
import sys, json
try:
    d = json.loads(sys.argv[1])
    name = d.get('name','?')
    pro = d.get('isPro', False)
    plan = 'Pro' if pro else 'Free'
    print(f"✓  Account: {name} ({plan})")
except:
    print("   Token accepted (could not parse profile)")
PYEOF
  else
    inf "HF API check inconclusive — token saved"
  fi

  # Patch opencode.jsonc
  OC="$HOME/.config/opencode/opencode.jsonc"
  if [[ -f "$OC" ]]; then
    sed -i "s|\"apiKey\": *\"hf_[^\"]*\"|\"apiKey\": \"$HF_KEY\"|g" "$OC" && \
      ok "Updated HF token in opencode.jsonc" || true
  fi

  # Vault
  if curl -sf --max-time 5 http://localhost:8000/health > /dev/null 2>&1; then
    curl -sf -X POST http://localhost:8000/api/vault/store \
      -H "Content-Type: application/json" \
      -d "{\"key\":\"huggingface\",\"value\":\"$HF_KEY\"}" > /dev/null && \
      ok "Stored in CRANE vault" || true
  fi
fi

# ════════════════════════════════════════════════════════════════════════
# FINAL STATUS TABLE
# ════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YEL}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YEL}║  Key status                                         ║${NC}"
echo -e "${YEL}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

_chk() {
  local label="$1" key="$2"
  local val
  val=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true) || val=""
  if [[ -n "$val" ]]; then
    printf "  ${GRN}✓${NC}  %-30s ${DIM}[%d chars] %s…${NC}\n" "$label" "${#val}" "${val:0:12}"
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
echo ""
