#!/usr/bin/env bash
# setup_ollama_models.sh — pull all required Ollama models
# Lead: dolphin3:8b (uncensored)
# CodeRAG: qwen2.5-coder:3b, phi3.5, starcoder2:3b
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"

# Start Ollama server if not running
if ! curl -s --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "Starting Ollama server..."
    OLLAMA_HOST=0.0.0.0 ollama serve &>/tmp/ollama.log &
    sleep 3
    echo "Ollama started (PID $!)"
fi

MODELS=(
    "dolphin3:8b"          # uncensored lead — ~5GB
    "qwen2.5-coder:3b"     # fast coder RAG — ~2GB
    "phi3.5:latest"        # balanced coder RAG — ~2.3GB
    "starcoder2:3b"        # code completion RAG — ~1.8GB
)

TOTAL=${#MODELS[@]}
COUNT=0
for MODEL in "${MODELS[@]}"; do
    COUNT=$((COUNT + 1))
    echo ""
    echo "[$COUNT/$TOTAL] Pulling $MODEL..."
    ollama pull "$MODEL"
    echo "✓ $MODEL ready"
done

echo ""
echo "All models pulled. Verifying..."
ollama list

echo ""
echo "Done. Start Ollama server with:"
echo "  OLLAMA_HOST=0.0.0.0 ollama serve"
echo "Then open OpenCode with: cd /mnt/elana/ai_apps/crane && opencode"
