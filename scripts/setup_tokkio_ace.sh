#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CRANE · Tokkio ACE full-stack setup (Pipeline Model-1 baseline)
#
# Wires the complete NVIDIA Tokkio pipeline into CRANE:
#   Riva ASR  →  ACE Agent (NIM Nemotron)  →  Riva TTS  →  Audio2Face-2D
#
# Modes:
#   --nim-only   : Cloud NIM endpoints only (no Docker, no GPU required)
#   --local      : Spin up Tokkio containers via docker-compose on this machine
#                  (requires NGC login, NVIDIA GPU, ~40 GB disk)
#
# Usage:
#   bash scripts/setup_tokkio_ace.sh --nim-only        # cloud endpoints only
#   bash scripts/setup_tokkio_ace.sh --local           # full local stack
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; CYN='\033[0;36m'; BLD='\033[1m'; NC='\033[0m'
ok()  { echo -e "${GRN}✓${NC}  $*"; }
bad() { echo -e "${RED}✗${NC}  $*" >&2; }
hdr() { echo -e "\n${CYN}${BLD}══ $* ══${NC}"; }
inf() { echo -e "   $*"; }

CRANE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$HOME/.hermes/.env"
MODE="nim-only"

for arg in "$@"; do
  case $arg in --nim-only) MODE="nim-only" ;; --local) MODE="local" ;; esac
done

# Load env
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a || true
NGC_KEY="${NGC_API_KEY:-}"

if [[ -z "$NGC_KEY" ]]; then
  bad "NGC_API_KEY not set. Run:  bash scripts/setup_ngc_nim.sh  first."
  exit 1
fi

NIM_BASE="https://integrate.api.nvidia.com/v1"
ACE_AGENT_MODEL="nvidia/llama-3.1-nemotron-70b-instruct"

# ════════════════════════════════════════════════════════════════════════════
# MODE 1: NIM-ONLY — all components run on NVIDIA cloud, zero local GPU needed
# ════════════════════════════════════════════════════════════════════════════
nim_only() {
  hdr "TOKKIO MODE: NIM-ONLY (cloud endpoints)"
  inf "No local GPU required. All ACE microservices run on NVIDIA NIM."
  inf ""

  # ── ASR: Riva Parakeet-CTC-1.1B via NIM ─────────────────────────────────
  hdr "RIVA ASR  (NIM)"
  ASR_RESP=$(curl -sf \
    "https://grpc.nvcf.nvidia.com:443" 2>/dev/null || \
    echo "grpc_unavailable")

  # NIM ASR uses REST shim at streaming-asr endpoint
  ASR_NIM_URL="https://ai.api.nvidia.com/v1/asr/nvidia/parakeet-ctc-1-1b"
  inf "Tokkio ASR endpoint: $ASR_NIM_URL"
  inf "  Auth header: Authorization: Bearer \$NGC_API_KEY"
  inf "  Format: POST multipart/form-data  field=audio, type=audio/wav"
  ok  "ASR endpoint registered (NIM Parakeet CTC 1.1B)"

  # ── TTS: Riva FastPitch / HiFiGAN via NIM ────────────────────────────────
  hdr "RIVA TTS  (NIM)"
  TTS_NIM_URL="https://ai.api.nvidia.com/v1/tts/nvidia/riva-tts"
  inf "Tokkio TTS endpoint: $TTS_NIM_URL"
  inf "  Voices available: English-US.Female-1, English-US.Male-1 (radTTS), VITS"
  ok  "TTS endpoint registered (NIM Riva TTS)"

  # ── ACE Agent / Dialog ────────────────────────────────────────────────────
  hdr "ACE AGENT  (NIM Nemotron)"
  AGENT_RESP=$(curl -sf "$NIM_BASE/chat/completions" \
    -H "Authorization: Bearer $NGC_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$ACE_AGENT_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"PING\"}],\"max_tokens\":4}" \
    2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'][:40])" 2>/dev/null \
    || echo "unreachable")
  if [[ "$AGENT_RESP" != "unreachable" ]]; then
    ok "ACE Agent responding: $AGENT_RESP"
  else
    bad "ACE Agent NIM unreachable — check NGC key or network"
  fi

  # ── Audio2Face-2D (NIM) ───────────────────────────────────────────────────
  hdr "AUDIO2FACE-2D  (NIM)"
  A2F_NIM_URL="https://ai.api.nvidia.com/v1/cv/nvidia/audio2face-2d"
  inf "A2F-2D endpoint: $A2F_NIM_URL"
  inf "  Input:  audio stream (bytes) + reference portrait image"
  inf "  Output: WebRTC video stream  OR  frame sequence"
  inf "  Note:   CRANE currently renders avatar as SVG/CSS."
  inf "          A2F-2D plugs in as: JEV perf cues → A2F-2D emotion conditioning"
  inf "          → rendered video overlay on top of SVG shell."
  ok  "A2F-2D endpoint registered (NIM)"

  # ── Write Tokkio NIM config for CRANE ─────────────────────────────────────
  hdr "WRITING TOKKIO NIM CONFIG"
  cat > "$CRANE_DIR/src/server/tokkio_nim.json" << JSONEOF
{
  "label": "Tokkio Model-1 (NIM cloud)",
  "tier": "tokkio-nim",
  "asr": {
    "url": "$ASR_NIM_URL",
    "model": "nvidia/parakeet-ctc-1-1b",
    "auth": "Bearer \${NGC_API_KEY}",
    "format": "multipart",
    "language": "en-US"
  },
  "dialog": {
    "url": "$NIM_BASE",
    "model": "$ACE_AGENT_MODEL",
    "auth": "Bearer \${NGC_API_KEY}",
    "stream": true,
    "system": "You are a helpful, concise assistant. Respond in 1-3 sentences."
  },
  "tts": {
    "url": "$TTS_NIM_URL",
    "model": "nvidia/riva-tts",
    "auth": "Bearer \${NGC_API_KEY}",
    "voice": "English-US.Female-1",
    "sample_rate": 22050
  },
  "a2f": {
    "url": "$A2F_NIM_URL",
    "model": "nvidia/audio2face-2d",
    "auth": "Bearer \${NGC_API_KEY}",
    "portrait": "src/client/public/avatar/reference_portrait.png",
    "mode": "expression_only"
  },
  "latency_budget_ms": {
    "asr": 300,
    "dialog_ttft": 600,
    "tts": 400,
    "a2f": 150,
    "total_target": 1450
  }
}
JSONEOF
  ok "Written: src/server/tokkio_nim.json"

  # Add env pointer
  grep -q '^CRANE_TOKKIO_CONFIG=' "$ENV_FILE" 2>/dev/null || \
    echo "CRANE_TOKKIO_CONFIG=$CRANE_DIR/src/server/tokkio_nim.json" >> "$ENV_FILE"
  ok "CRANE_TOKKIO_CONFIG set in $ENV_FILE"
}

# ════════════════════════════════════════════════════════════════════════════
# MODE 2: LOCAL — full Tokkio stack in Docker on this machine
# (requires NVIDIA GPU + NGC Docker login + ~40 GB disk)
# ════════════════════════════════════════════════════════════════════════════
local_stack() {
  hdr "TOKKIO MODE: LOCAL DOCKER STACK"

  # ── prereq check ──────────────────────────────────────────────────────────
  MISSING=""
  command -v docker      >/dev/null 2>&1 || MISSING="$MISSING docker"
  command -v docker-compose >/dev/null 2>&1 || \
    docker compose version >/dev/null 2>&1 || MISSING="$MISSING docker-compose"
  command -v nvidia-smi  >/dev/null 2>&1 || MISSING="$MISSING nvidia-smi"
  if [[ -n "$MISSING" ]]; then
    bad "Missing prerequisites:$MISSING"
    inf "Install guide: https://docs.nvidia.com/ace/latest/workflows/tokkio/prerequisites.html"
    exit 1
  fi
  ok "Docker + NVIDIA GPU detected"

  # ── NGC Docker login ───────────────────────────────────────────────────────
  hdr "NGC DOCKER LOGIN"
  echo "$NGC_KEY" | docker login nvcr.io -u "\$oauthtoken" --password-stdin && \
    ok "Logged in to nvcr.io" || { bad "NGC Docker login failed — check key"; exit 1; }

  # ── Pull docker-compose from NVIDIA ACE Blueprint ─────────────────────────
  hdr "TOKKIO BLUEPRINT"
  TOKKIO_DIR="$CRANE_DIR/vendor/tokkio"
  if [[ ! -d "$TOKKIO_DIR" ]]; then
    mkdir -p "$TOKKIO_DIR"
    inf "Cloning NVIDIA Digital Human Blueprint..."
    git clone --depth 1 https://github.com/NVIDIA-AI-Blueprints/digital-human.git "$TOKKIO_DIR" 2>&1 | tail -3
    ok "Cloned to $TOKKIO_DIR"
  else
    ok "Blueprint already cloned at $TOKKIO_DIR"
  fi

  # ── Write .env for Tokkio compose ──────────────────────────────────────────
  hdr "TOKKIO .env"
  cat > "$TOKKIO_DIR/.env" << ENVEOF
NGC_API_KEY=$NGC_KEY
PIPELINE_TYPE=riva_asr_tts
LLM_MODEL_ID=$ACE_AGENT_MODEL
ACE_AGENT_PORT=7011
RIVA_ASR_PORT=50051
RIVA_TTS_PORT=50052
AUDIO2FACE_PORT=8010
ENVEOF
  ok "Written $TOKKIO_DIR/.env"

  # ── Start services ──────────────────────────────────────────────────────────
  hdr "STARTING TOKKIO CONTAINERS"
  inf "This downloads ~40 GB of NVIDIA containers on first run."
  inf "Estimated time: 20-40 min on first run, ~2 min thereafter."
  echo ""
  read -rp "   Start now? [y/N]: " CONFIRM
  if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    cd "$TOKKIO_DIR"
    docker compose --env-file .env up -d --pull always 2>&1 | tail -20
    ok "Tokkio containers starting"

    # Wait for ACE Agent to be ready
    inf "Waiting for ACE Agent (port 7011)..."
    for i in $(seq 1 30); do
      curl -sf http://localhost:7011/health > /dev/null 2>&1 && break || sleep 10
    done
    curl -sf http://localhost:7011/health > /dev/null 2>&1 && \
      ok "ACE Agent healthy on :7011" || \
      inf "ACE Agent still starting — check: docker compose logs ace-agent"
    cd "$CRANE_DIR"
  else
    inf "Skipped. Run manually:  cd $TOKKIO_DIR && docker compose up -d"
  fi

  # ── Write local config for CRANE ───────────────────────────────────────────
  hdr "WRITING TOKKIO LOCAL CONFIG"
  cat > "$CRANE_DIR/src/server/tokkio_local.json" << JSONEOF
{
  "label": "Tokkio Model-1 (local Docker)",
  "tier": "tokkio-local",
  "asr": {
    "url": "http://localhost:50051",
    "protocol": "grpc",
    "model": "Conformer-CTC-L",
    "language": "en-US"
  },
  "dialog": {
    "url": "http://localhost:7011/v1",
    "model": "$ACE_AGENT_MODEL",
    "stream": true
  },
  "tts": {
    "url": "http://localhost:50052",
    "protocol": "grpc",
    "voice": "English-US-Female-1"
  },
  "a2f": {
    "url": "http://localhost:8010",
    "portrait": "src/client/public/avatar/reference_portrait.png"
  },
  "latency_budget_ms": {
    "asr": 150,
    "dialog_ttft": 400,
    "tts": 200,
    "a2f": 80,
    "total_target": 830
  }
}
JSONEOF
  ok "Written: src/server/tokkio_local.json"
  grep -q '^CRANE_TOKKIO_CONFIG=' "$ENV_FILE" 2>/dev/null || \
    echo "CRANE_TOKKIO_CONFIG=$CRANE_DIR/src/server/tokkio_local.json" >> "$ENV_FILE"
}

# ── Run selected mode ─────────────────────────────────────────────────────────
case $MODE in
  nim-only) nim_only ;;
  local)    local_stack ;;
esac

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GRN}${BLD}═══════════════════════════════════════════════════════${NC}"
echo -e "${GRN}${BLD}  Tokkio Pipeline Model-1 registered in CRANE${NC}"
echo -e "${GRN}${BLD}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Mode       : ${BLD}$MODE${NC}"
echo -e "  Config     : src/server/tokkio_nim.json (or tokkio_local.json)"
echo ""
echo -e "  ${YEL}Latency budget (NIM cloud target):${NC}"
echo -e "    ASR       300ms  (Riva Parakeet CTC)"
echo -e "    Agent     600ms  (Nemotron 70B TTFT)"
echo -e "    TTS       400ms  (Riva FastPitch+HiFiGAN)"
echo -e "    A2F        150ms  (Audio2Face-2D)"
echo -e "    ─────────────────"
echo -e "    Total    ${BLD}1450ms${NC}  ← Tokkio Model-1 baseline"
echo ""
echo -e "  ${YEL}CRANE target to beat:${NC}  <${BLD}900ms${NC} total (local Ollama + JEV + SVG avatar)"
echo ""
echo -e "  ${CYN}Next:${NC} Restart CRANE server, open Multi-Suite,"
echo -e "       select pipeline 'Tokkio Model-1 (NIM cloud)' in ISOLATED mode,"
echo -e "       run Arena vs Beryl/Kaggle to get the baseline leaderboard."
echo ""
echo -e "  ${CYN}A2F portrait:${NC} Put your reference face image at:"
echo -e "       src/client/public/avatar/reference_portrait.png"
echo -e "       (512×512 PNG, front-facing, neutral expression)"
echo -e "${GRN}${BLD}═══════════════════════════════════════════════════════${NC}"
