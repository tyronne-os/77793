#!/bin/bash
# CRANE LLM Workstation Launcher
# Usage: ./launch.sh [lab|serve|full|pull <model>|stop]

set -e
WS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$WS"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; CYN='\033[0;36m'; NC='\033[0m'
BOLD='\033[1m'

banner() {
  echo -e "${CYN}${BOLD}"
  echo "  ╔═══════════════════════════════════════╗"
  echo "  ║    CRANE LLM Workstation  v1.0        ║"
  echo "  ║    Podman · CPU-Optimized · Rootless  ║"
  echo "  ╚═══════════════════════════════════════╝"
  echo -e "${NC}"
}

check_space() {
  AVAIL=$(df -BG /mnt/elana | awk 'NR==2{print $4}' | tr -d 'G')
  if [ "$AVAIL" -lt 5 ]; then
    echo -e "${RED}Warning: Only ${AVAIL}GB free on /mnt/elana — models may fail to pull${NC}"
  else
    echo -e "${GRN}Disk: ${AVAIL}GB free on /mnt/elana${NC}"
  fi
}

check_podman() {
  if ! command -v podman &>/dev/null; then
    echo -e "${RED}Podman not installed. Run: sudo apt install podman${NC}"
    exit 1
  fi
  # Verify storage works
  if ! podman info &>/dev/null; then
    echo -e "${YLW}Configuring Podman for ZFS...${NC}"
    mkdir -p ~/.config/containers /mnt/elana/ai_apps/podman-storage
    cat > ~/.config/containers/storage.conf << 'CONF'
[storage]
driver = "overlay"
graphRoot = "/mnt/elana/ai_apps/podman-storage"

[storage.options.overlay]
mount_program = "/usr/bin/fuse-overlayfs"
mountopt = "nodev,metacopy=on"
CONF
    echo -e "${GRN}✓ Storage configured${NC}"
  fi
}

status() {
  echo -e "${BOLD}Service Status:${NC}"
  for name in crane-lab crane-ollama crane-webui crane-pipeline; do
    STATE=$(podman inspect --format '{{.State.Status}}' "$name" 2>/dev/null || echo "stopped")
    if [ "$STATE" = "running" ]; then
      echo -e "  ${GRN}●${NC} $name"
    else
      echo -e "  ${RED}●${NC} $name (${STATE})"
    fi
  done
  echo ""
  echo -e "${BOLD}URLs:${NC}"
  podman inspect --format '{{.State.Status}}' crane-lab 2>/dev/null | grep -q running && \
    echo -e "  ${GRN}Jupyter Lab   → http://localhost:8888${NC}"
  podman inspect --format '{{.State.Status}}' crane-ollama 2>/dev/null | grep -q running && \
    echo -e "  ${GRN}Ollama API    → http://localhost:11434${NC}"
  podman inspect --format '{{.State.Status}}' crane-webui 2>/dev/null | grep -q running && \
    echo -e "  ${GRN}Open WebUI    → http://localhost:3000${NC}"
  podman inspect --format '{{.State.Status}}' crane-pipeline 2>/dev/null | grep -q running && \
    echo -e "  ${GRN}n8n Pipeline  → http://localhost:5678${NC}"
}

start_ollama() {
  if podman inspect crane-ollama &>/dev/null 2>&1; then
    echo -e "${YLW}→ crane-ollama already running${NC}"; return
  fi
  echo -e "→ Starting Ollama..."
  mkdir -p "$WS/data/ollama"
  podman network create llm-net 2>/dev/null || true
  podman run -d \
    --name crane-ollama \
    --network llm-net \
    -p 11434:11434 \
    -v "$WS/data/ollama":/root/.ollama \
    -e OLLAMA_NUM_PARALLEL=1 \
    -e OLLAMA_MAX_LOADED_MODELS=1 \
    -e OLLAMA_KEEP_ALIVE=5m \
    ollama/ollama:latest
  echo -e "${GRN}✓ Ollama → http://localhost:11434${NC}"
}

start_webui() {
  if podman inspect crane-webui &>/dev/null 2>&1; then
    echo -e "${YLW}→ crane-webui already running${NC}"; return
  fi
  echo -e "→ Starting Open WebUI..."
  mkdir -p "$WS/data/webui"
  sleep 3
  podman run -d \
    --name crane-webui \
    --network llm-net \
    -p 3000:8080 \
    -v "$WS/data/webui":/app/backend/data \
    -e OLLAMA_BASE_URL=http://crane-ollama:11434 \
    -e WEBUI_AUTH=false \
    -e "WEBUI_NAME=CRANE LLM Lab" \
    ghcr.io/open-webui/open-webui:main
  echo -e "${GRN}✓ Open WebUI → http://localhost:3000${NC}"
}

start_lab() {
  if podman inspect crane-lab &>/dev/null 2>&1; then
    echo -e "${YLW}→ crane-lab already running${NC}"; return
  fi
  echo -e "→ Starting Jupyter Lab..."
  # Build if image not present
  if ! podman image exists crane-lab:latest; then
    echo -e "${YLW}→ Building lab image (first time ~5min)...${NC}"
    podman build -t crane-lab:latest "$WS/containers/lab/"
  fi
  mkdir -p "$WS/workspace" "$WS/data/hf-cache"
  podman network create llm-net 2>/dev/null || true
  podman run -d \
    --name crane-lab \
    --network llm-net \
    -p 8888:8888 -p 7860:7860 -p 8080:8080 \
    -v "$WS/workspace":/workspace \
    -v "$WS/data/hf-cache":/root/.cache/huggingface \
    -e HF_HOME=/root/.cache/huggingface \
    -e TRANSFORMERS_CACHE=/root/.cache/huggingface/hub \
    -e OLLAMA_HOST=http://crane-ollama:11434 \
    crane-lab:latest
  echo -e "${GRN}✓ Jupyter Lab → http://localhost:8888${NC}"
}

# ── Main ──────────────────────────────────────────────────────────────────────
banner
check_podman
check_space

CMD="${1:-status}"

case "$CMD" in
  lab)
    start_lab
    echo -e "\n${GRN}${BOLD}Lab ready → http://localhost:8888${NC}"
    ;;
  serve)
    start_ollama
    start_webui
    echo -e "\n${GRN}${BOLD}Model server ready → http://localhost:3000${NC}"
    ;;
  full)
    start_ollama
    start_webui
    start_lab
    echo ""
    echo -e "${GRN}${BOLD}Full workstation running:${NC}"
    echo -e "  ${GRN}Jupyter Lab   → http://localhost:8888${NC}"
    echo -e "  ${GRN}Open WebUI    → http://localhost:3000${NC}"
    echo -e "  ${GRN}Ollama API    → http://localhost:11434${NC}"
    ;;
  pull)
    MODEL="${2:-phi3:mini}"
    echo -e "→ Pulling model: ${BOLD}$MODEL${NC}"
    if ! podman inspect crane-ollama &>/dev/null 2>&1; then
      start_ollama
      sleep 5
    fi
    podman exec crane-ollama ollama pull "$MODEL"
    echo -e "${GRN}✓ Model ready: $MODEL${NC}"
    ;;
  models|list)
    podman exec crane-ollama ollama list 2>/dev/null || echo "Ollama not running"
    ;;
  stop)
    echo "→ Stopping all workstation containers..."
    podman stop crane-lab crane-ollama crane-webui crane-pipeline 2>/dev/null || true
    podman rm crane-lab crane-ollama crane-webui crane-pipeline 2>/dev/null || true
    echo -e "${GRN}✓ Stopped${NC}"
    ;;
  status|*)
    status
    ;;
esac
