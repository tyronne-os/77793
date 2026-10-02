SHELL := /bin/bash
COMPOSE := podman-compose
WS := /mnt/elana/ai_apps/crane/podman-workstation
MODEL ?= phi3:mini

.PHONY: help setup build lab serve full pipeline stop clean pull logs model-list

help:
	@echo ""
	@echo "  CRANE LLM Workstation"
	@echo "  ─────────────────────────────────────────"
	@echo "  make setup        Install podman-compose, prep dirs"
	@echo "  make build        Build the lab container image"
	@echo ""
	@echo "  make lab          Jupyter Lab + full ML stack  → :8888"
	@echo "  make serve        Ollama + Open WebUI          → :11434 / :3000"
	@echo "  make pipeline     n8n workflow automation      → :5678"
	@echo "  make full         Everything at once"
	@echo ""
	@echo "  make pull MODEL=phi3:mini   Pull a model into Ollama"
	@echo "  make model-list             List downloaded models"
	@echo "  make stop                   Stop all workstation containers"
	@echo "  make clean                  Remove all workstation containers + images"
	@echo ""
	@echo "  Quick models (CPU-friendly):"
	@echo "    phi3:mini         2.3GB  Microsoft Phi-3 — best small model"
	@echo "    tinyllama:latest  637MB  TinyLlama 1.1B — fastest"
	@echo "    mistral:7b-q4    4.1GB  Mistral 7B quant — best quality"
	@echo "    deepseek-coder:1.3b 776MB  Code specialist"
	@echo "    qwen2:0.5b        394MB  Tiny but capable"
	@echo ""

setup:
	@echo "→ Installing podman-compose..."
	pip3 install podman-compose --user --quiet
	@echo "→ Creating data directories..."
	mkdir -p $(WS)/data/{ollama,hf-cache,webui,pipelines} $(WS)/workspace
	@echo "→ Configuring Podman storage (ZFS-safe)..."
	mkdir -p ~/.config/containers
	@if ! grep -q "fuse-overlayfs" ~/.config/containers/storage.conf 2>/dev/null; then \
		cat > ~/.config/containers/storage.conf << 'CONF'\n[storage]\ndriver = "overlay"\ngraphRoot = "/mnt/elana/ai_apps/podman-storage"\n\n[storage.options.overlay]\nmount_program = "/usr/bin/fuse-overlayfs"\nmountopt = "nodev,metacopy=on"\nCONF; \
	fi
	@echo "✓ Setup complete. Run: make build"

build:
	@echo "→ Building crane-lab image (this takes ~5min first time)..."
	cd $(WS) && podman build -t crane-lab:latest ./containers/lab/
	@echo "✓ Build complete."

lab:
	@echo "→ Starting Jupyter Lab..."
	@mkdir -p $(WS)/workspace $(WS)/data/hf-cache
	podman run -d --rm \
		--name crane-lab \
		--network llm-net 2>/dev/null || true \
		-p 8888:8888 -p 7860:7860 -p 8080:8080 \
		-v $(WS)/workspace:/workspace \
		-v $(WS)/data/hf-cache:/root/.cache/huggingface \
		-e HF_HOME=/root/.cache/huggingface \
		-e OLLAMA_HOST=http://localhost:11434 \
		crane-lab:latest 2>/dev/null || \
	podman run -d --rm \
		--name crane-lab \
		-p 8888:8888 -p 7860:7860 -p 8080:8080 \
		-v $(WS)/workspace:/workspace \
		-v $(WS)/data/hf-cache:/root/.cache/huggingface \
		-e HF_HOME=/root/.cache/huggingface \
		-e OLLAMA_HOST=http://host.containers.internal:11434 \
		crane-lab:latest
	@echo "✓ Jupyter Lab → http://localhost:8888"

serve:
	@echo "→ Starting Ollama + Open WebUI..."
	@mkdir -p $(WS)/data/{ollama,webui}
	@podman network create llm-net 2>/dev/null || true
	podman run -d \
		--name crane-ollama \
		--network llm-net \
		-p 11434:11434 \
		-v $(WS)/data/ollama:/root/.ollama \
		-e OLLAMA_NUM_PARALLEL=1 \
		-e OLLAMA_MAX_LOADED_MODELS=1 \
		ollama/ollama:latest
	@sleep 3
	podman run -d \
		--name crane-webui \
		--network llm-net \
		-p 3000:8080 \
		-v $(WS)/data/webui:/app/backend/data \
		-e OLLAMA_BASE_URL=http://crane-ollama:11434 \
		-e WEBUI_AUTH=false \
		-e WEBUI_NAME="CRANE LLM Lab" \
		ghcr.io/open-webui/open-webui:main
	@echo "✓ Ollama       → http://localhost:11434"
	@echo "✓ Open WebUI   → http://localhost:3000"

pipeline:
	@mkdir -p $(WS)/data/pipelines
	podman run -d \
		--name crane-pipeline \
		-p 5678:5678 \
		-v $(WS)/data/pipelines:/home/node/.n8n \
		-e N8N_BASIC_AUTH_ACTIVE=false \
		n8nio/n8n:latest
	@echo "✓ n8n pipelines → http://localhost:5678"

full: serve
	@sleep 5
	$(MAKE) lab
	@echo ""
	@echo "  ┌─────────────────────────────────────────┐"
	@echo "  │  CRANE LLM Workstation — FULL STACK      │"
	@echo "  │  Jupyter Lab    → http://localhost:8888  │"
	@echo "  │  Open WebUI     → http://localhost:3000  │"
	@echo "  │  Ollama API     → http://localhost:11434 │"
	@echo "  └─────────────────────────────────────────┘"

pull:
	@echo "→ Pulling model: $(MODEL)"
	podman exec crane-ollama ollama pull $(MODEL)
	@echo "✓ Model ready: $(MODEL)"

model-list:
	@podman exec crane-ollama ollama list 2>/dev/null || echo "Ollama not running — run: make serve"

stop:
	@echo "→ Stopping workstation..."
	-podman stop crane-lab crane-ollama crane-webui crane-pipeline 2>/dev/null
	-podman rm crane-lab crane-ollama crane-webui crane-pipeline 2>/dev/null
	@echo "✓ All stopped."

clean: stop
	@echo "→ Removing images..."
	-podman rmi crane-lab:latest ollama/ollama:latest ghcr.io/open-webui/open-webui:main n8nio/n8n:latest 2>/dev/null
	@echo "✓ Clean complete."

logs:
	@echo "=== crane-lab ===" && podman logs --tail=20 crane-lab 2>/dev/null || true
	@echo "=== crane-ollama ===" && podman logs --tail=10 crane-ollama 2>/dev/null || true
	@echo "=== crane-webui ===" && podman logs --tail=10 crane-webui 2>/dev/null || true
