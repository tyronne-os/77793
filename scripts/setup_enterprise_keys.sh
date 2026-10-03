#!/usr/bin/env bash
# CRANE · Enterprise NGC + HuggingFace key setup
# Stops and asks for each token (reads from the keyboard, so it works even if pasted).

ENV_FILE="$HOME/.hermes/.env"
OC="$HOME/.config/opencode/opencode.jsonc"
CRANE_DIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)"
[[ -d "$CRANE_DIR/src/server" ]] || CRANE_DIR="/mnt/elana/ai_apps/crane"
NIM_BASE="https://integrate.api.nvidia.com/v1"

GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[1;33m'; CYN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'
ok()  { echo -e "${GRN}✓${NC}  $*"; }
bad() { echo -e "${RED}✗${NC}  $*"; }
hdr() { echo -e "\n${CYN}══ $* ══${NC}"; }
inf() { echo -e "   ${DIM}$*${NC}"; }

mkdir -p "$(dirname "$ENV_FILE")"; touch "$ENV_FILE"

_upsert() {
  if grep -q "^$1=" "$ENV_FILE" 2>/dev/null; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else echo "$1=$2" >> "$ENV_FILE"; fi
}
_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; }

# Ask on the real keyboard. Re-asks until it gets a real value (rejects placeholders).
# $1=label  $2=hint  $3=var name  $4=allow_blank(1/0)
ask() {
  local label="$1" hint="$2" var="$3" blank="${4:-0}" val=""
  while true; do
    echo ""
    echo -e "${CYN}${label}${NC}  ${DIM}${hint}${NC}"
    printf "      paste here → "
    IFS= read -rs val < /dev/tty
    echo ""
    val="$(echo -n "$val" | tr -d '[:space:]')"
    if [[ -z "$val" ]]; then
      if [[ "$blank" == "1" ]]; then echo "      (skipped)"; break; fi
      bad "Nothing entered — try again."; continue
    fi
    if [[ "$val" =~ (PASTE|YOUR_|_HERE|PLACEHOLDER) ]]; then
      bad "That looks like placeholder text, not a real key — try again."; continue
    fi
    echo -e "      ${GRN}✓${NC} received (${#val} chars, starts ${val:0:8}…)"
    break
  done
  printf -v "$var" '%s' "$val"
}

echo -e "${YEL}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YEL}║  CRANE · Enterprise + HuggingFace key setup         ║${NC}"
echo -e "${YEL}╚══════════════════════════════════════════════════════╝${NC}"

NGC_ENT=""; HF_KEY=""
ask "[1/2] NVIDIA NGC Enterprise key" "(whatever format NVIDIA gave you)" NGC_ENT 0

EXIST_HF="$(_get HUGGINGFACE_API_KEY)"
if [[ -n "$EXIST_HF" && ! "$EXIST_HF" =~ (YOUR_|PASTE) ]]; then
  inf "HuggingFace token already saved (${EXIST_HF:0:8}…) — press Enter to keep it."
  ask "[2/2] HuggingFace token" "(hf_...)" HF_KEY 1
  [[ -z "$HF_KEY" ]] && HF_KEY="$EXIST_HF"
else
  ask "[2/2] HuggingFace token" "(hf_... from hf.co → Settings → Access Tokens)" HF_KEY 0
fi

echo -e "\n${GRN}Got both. Saving + testing…${NC}"

# ── NGC Enterprise ──
hdr "NGC ENTERPRISE"
_upsert NGC_ENTERPRISE_KEY "$NGC_ENT"
_upsert NGC_API_KEY_ENTERPRISE "$NGC_ENT"
ok "Saved NGC_ENTERPRISE_KEY"

CODE=$(curl -s -o /tmp/ngc_ent_test.json -w '%{http_code}' --max-time 25 "$NIM_BASE/chat/completions" \
  -H "Authorization: Bearer $NGC_ENT" -H "Content-Type: application/json" \
  -d '{"model":"nvidia/llama-3.1-nemotron-70b-instruct","messages":[{"role":"user","content":"Reply: ENT_OK"}],"max_tokens":6}' 2>/dev/null)
case "$CODE" in
  200) ok "NIM accepted the enterprise key (HTTP 200)" ;;
  401|403) bad "NIM rejected the key (HTTP $CODE) — check it was copied in full" ;;
  000) inf "NIM test timed out — key saved, retry later" ;;
  *)   inf "NIM returned HTTP $CODE" ;;
esac
rm -f /tmp/ngc_ent_test.json

curl -s --max-time 20 "$NIM_BASE/models" -H "Authorization: Bearer $NGC_ENT" 2>/dev/null | python3 -c "
import sys,json
try:
  ids=[m['id'] for m in json.load(sys.stdin).get('data',[])]
  print(f'   {len(ids)} models visible to this key')
except Exception: print('   (model list unavailable)')
" 2>/dev/null

# ── HuggingFace ──
hdr "HUGGINGFACE"
_upsert HUGGINGFACE_API_KEY "$HF_KEY"
ok "Saved HUGGINGFACE_API_KEY"
curl -s --max-time 10 https://huggingface.co/api/whoami -H "Authorization: Bearer $HF_KEY" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin); print('   ✓ HF account:', d.get('name','?'), '|', 'Pro' if d.get('isPro') else 'Free')
except Exception: print('   HF check inconclusive (token saved)')
" 2>/dev/null
[[ -f "$OC" ]] && sed -i "s|\"apiKey\": *\"hf_[^\"]*\"|\"apiKey\": \"$HF_KEY\"|g" "$OC" && ok "Updated opencode.jsonc (HF)"

# OpenCode enterprise provider: swap env-var reference for the real key so OpenCode can use it
if [[ -f "$OC" ]]; then
  sed -i "s|\"apiKey\": *\"\${NGC_ENTERPRISE_KEY}\"|\"apiKey\": \"$NGC_ENT\"|" "$OC" && ok "Wrote enterprise key into opencode.jsonc"
fi

echo ""
echo -e "${YEL}══════════ Key status ══════════${NC}"
for k in NGC_API_KEY NGC_ENTERPRISE_KEY HUGGINGFACE_API_KEY TYPESAFE_API_KEY HOSTINGER_EMAIL HOSTINGER_SMTP_PASS; do
  v="$(_get $k)"
  if [[ -n "$v" && ! "$v" =~ (YOUR_|PASTE) ]]; then printf "  ${GRN}✓${NC}  %-24s ${DIM}%s…${NC}\n" "$k" "${v:0:8}"
  else printf "  ${RED}✗${NC}  %-24s ${YEL}MISSING / placeholder${NC}\n" "$k"; fi
done
echo ""
