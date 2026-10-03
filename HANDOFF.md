# CRANE Session Handoff — 2026-10-03 (All-Night Session)

**Next agent: pick up from here. Everything is documented. No gaps.**

---

## SYSTEM MAP

| Component | Location | Status |
|-----------|----------|--------|
| CRANE IDE (FastAPI + Vite) | `/mnt/elana/ai_apps/crane/` | Running on localhost:8000 |
| berylize-node (GCP L4) | `34.74.41.235`, zone `us-east1-c`, project `posh-eden` | VM running |
| vLLM (Qwen2.5-Coder-14B-Instruct-AWQ) | berylize-node port 8010 | **Loading right now** (~15 min from restart) |
| Speaches TTS (Kokoro ONNX) | berylize-node port 8013 | ✅ Up, Kokoro model loaded |
| Hermes Agent | `~/.hermes/` + `~/.local/bin/hermes` | ✅ Configured, JEV installed |
| SSH Tunnels | local 8010→node 8010, local 8013→node 8013 | Need to verify after each reconnect |

---

## PORT MAP (RESERVED + ACTIVE)

| Port | Service |
|------|---------|
| 8000 | CRANE FastAPI |
| 8001 | CRANE preview |
| 8002–8005 | CRANE reserved (do NOT use) |
| 8010 | Berylize vLLM (Qwen2.5-Coder-14B-Instruct-AWQ) |
| 8011 | Berylize Creatives (MiniMax H3 — weights on nvme0n2, NOT yet served) |
| 8012 | Kokoro TTS standalone (NOT yet started) |
| 8013 | Speaches TTS / elana-voice Podman container ✅ |
| 11434 | Ollama (for CodeRAG small models — NOT yet running) |

---

## WHAT WAS DONE THIS SESSION

### 1. Nav Bar + Mastering Suite (COMPLETE)
- `src/client/src/App.tsx` — nav bar: HOME / BUILD / MASTERING / BACKEND / REPORTS
- HOME button = `<a href="/">` for landing page
- `src/client/src/components/MasteringPanel.tsx` — full animated talking avatar:
  - Mic → Web Speech API (STT) → `/ws/avatar-chat` → Berylize → TTS → animated SVG face
  - State machine: idle / listening / thinking / speaking
  - Eye blink loop, mouth animation driven by sine wave
  - TTS priority: Kokoro (`/api/services/kokoro/tts`) → Speaches (`/api/services/speaches/tts`) → browser SpeechSynthesis
- `src/client/src/styles.css` — nav bar + mastering styles appended

### 2. Backend Wiring (COMPLETE)
- `src/server/main.py`:
  - `/ws/avatar-chat` — dedicated isolated-history WebSocket for avatar
  - `/api/services/speaches/tts` — proxies to port 8013 (speaches container)
  - `/ws/rag-chat` — NEW: CodeRAG WebSocket (Ollama small models + Second Brain)
  - `import coderag` + `app.include_router(coderag.router)`
- `src/server/gpu.py` — `CRANE_GPU_IDLE=0` env var disables auto-pause
- `src/server/coderag.py` — **NEW FILE**: small coder RAG service

### 3. CodeRAG Service (NEW — needs Ollama to be running)
**File:** `src/server/coderag.py`
- Three models: `qwen2.5-coder:3b` (default), `phi3.5:latest`, `starcoder2:3b`
- Each query hits `knowledge.retrieve()` (Second Brain BM25+graph) first
- Retrieved context + Berylize persona injected as system prompt
- Streams via Ollama `/api/chat` API
- REST endpoints: `GET /api/coderag/status`, `POST /api/coderag/pull/{model_key}`
- Config: `CRANE_OLLAMA_URL` env var (default `http://localhost:11434`)
- **WebSocket:** `/ws/rag-chat` — send `{"type":"chat","message":"...","model":"qwen-coder-3b"}`

### 4. berylize-node Infrastructure (COMPLETE)
- **Docker permanently disabled**: `systemctl disable docker docker.socket containerd`
- **Podman only** — Podman 3.4.4, CDI syntax `nvidia.com/gpu=all` NOT supported
  - GPU passthrough if needed: `--device /dev/nvidia0 --device /dev/nvidiactl --device /dev/nvidia-uvm`
- **elana-voice container** (Speaches + Kokoro):
  ```bash
  sudo podman run -d --name elana-voice -p 127.0.0.1:8013:8000 \
    -e UVICORN_HOST=0.0.0.0 -e UVICORN_PORT=8000 \
    -e WHISPER__TTL=-1 -e DO_NOT_TRACK=1 \
    ghcr.io/speaches-ai/speaches:latest-cuda
  # Then load Kokoro:
  curl -X POST http://localhost:8013/v1/models/speaches-ai%2FKokoro-82M-v1.0-ONNX-int8
  ```
  - No GPU flag needed — Kokoro ONNX runs on CPU
  - **NOT set to restart on boot** — needs a systemd unit: `sudo podman generate systemd elana-voice > /etc/systemd/system/elana-voice.service`

### 5. vLLM Switch: 32B → 14B (IN PROGRESS)
- Switched from `Qwen2.5-Coder-32B-Instruct-AWQ` to `Qwen2.5-Coder-14B-Instruct-AWQ`
- Reason: 32B OOM'd on KV cache at 16384 context. 14B fits with 32768 context.
- AWQ weights downloading to `/mnt/disks/extra-storage/huggingface/` (~9GB, was ~5.6GB complete when checked)
- Service file: `/etc/systemd/system/berylize-vllm.service`
  - `--max-model-len 32768 --gpu-memory-utilization 0.90`
- **Hermes config already has `Qwen/Qwen2.5-Coder-14B-Instruct` as default model** — Hermes is the harness, it auto-connects via port 8010 tunnel
- vLLM will also serve as fallback: abliterated option `TobiasLogic/Qwen2.5-Coder-32B-abliterated` is in the Hermes config for future use

### 6. Hermes Agent (CONFIRMED + JEV INSTALLED)
- Location: `~/.hermes/`, binary: `~/.local/bin/hermes`
- Config: `~/.hermes/config.yaml` — `default_provider: crane_tunnel` → `http://localhost:8010/v1`
- Paired with CRANE: `~/.hermes/skills/crane/SKILL.md` defines CRANE as the project
- **JEV plugin installed**: `hermes plugins install jev && hermes plugins enable jev`
  - Provides `jev_evaluate` tool for decision judging
  - Location: `~/.hermes/plugins/jev`
- Hermes model list in config references `Qwen/Qwen2.5-Coder-14B-Instruct` (matches vLLM)
- Direct fallback: `gcp_vllm_direct` at `http://34.74.41.235:8000/v1`

---

## IMMEDIATE RESUME TASKS

### A. Verify vLLM is up
```bash
curl -s http://localhost:8010/v1/models
```
If not: check download completed first:
```bash
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden \
  --command='du -sh /mnt/disks/extra-storage/huggingface/models--Qwen--Qwen2.5-Coder-14B-Instruct-AWQ/blobs/'
```
Download complete = ~9.2GB in blobs. Then start service:
```bash
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden \
  --command='sudo systemctl start berylize-vllm && sudo journalctl -fu berylize-vllm'
```

### B. Verify SSH tunnels
```bash
# Check if ports are forwarded
curl -s --max-time 3 http://localhost:8010/v1/models
curl -s --max-time 3 http://localhost:8013/health
```
If down, re-establish:
```bash
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden -- -L 8010:localhost:8010 -N -f
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden -- -L 8013:localhost:8013 -N -f
```

### C. Install Ollama + pull small RAG models
The CodeRAG service (`/ws/rag-chat`) needs Ollama running. Three options:
1. **On berylize-node** (GPU-accelerated, fastest):
   ```bash
   gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden \
     --command='curl -fsSL https://ollama.com/install.sh | sh && \
       ollama pull qwen2.5-coder:3b && \
       ollama pull phi3.5 && \
       ollama pull starcoder2:3b'
   ```
   Then add tunnel: `-- -L 11434:localhost:11434 -N -f`

2. **On local CRANE machine** (no GPU, but 3B models run fine on CPU):
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull qwen2.5-coder:3b
   ```
   CRANE_OLLAMA_URL defaults to `http://localhost:11434` — no config needed.

3. **On Hermes machine** (when Lenovo is repaired):
   Same Ollama install. Set `CRANE_OLLAMA_URL=http://<hermes-ip>:11434` in CRANE's env.

### D. Test full avatar pipeline
1. Open CRANE → MASTERING tab
2. Click mic → speak → avatar goes idle→listening→thinking→speaking
3. Check TTS mode in panel (speaches recommended)

### E. Add systemd unit for elana-voice (so it survives reboots)
```bash
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden --command='
sudo podman generate systemd elana-voice --new > /tmp/elana-voice.service
sudo cp /tmp/elana-voice.service /etc/systemd/system/
sudo systemctl enable elana-voice
sudo systemctl daemon-reload
'
```

---

## KNOWN ISSUES / LIMITATIONS

1. **Podman 3.4.4** — `--device nvidia.com/gpu=all` not supported (CDI). Use device files directly if GPU needed in container.
2. **elana-voice** not auto-starting on reboot (no systemd unit yet)
3. **CodeRAG** needs Ollama installed — not done yet
4. **MiniMax H3** weights on nvme0n2 but vLLM serve not configured (port 8011 empty)
5. **REPORTS tab** in nav bar is a stub — no content
6. **vLLM OOM history**: if 14B fails on KV cache, add `Environment=VLLM_MEMORY_PROFILER_ESTIMATE_CUDAGRAPHS=0` to service file

---

## KEY FILE PATHS

### CRANE (local)
| File | Purpose |
|------|---------|
| `src/server/main.py` | FastAPI app — all endpoints + WebSockets |
| `src/server/chat.py` | Main Berylize chat engine (vLLM streaming) |
| `src/server/coderag.py` | **NEW** CodeRAG small model service |
| `src/server/knowledge.py` | Second Brain — BM25+graph retrieval over Obsidian vault |
| `src/server/berylize.py` | Berylize persona + display name |
| `src/server/gpu.py` | GPU idle timer (CRANE_GPU_IDLE=0 = never pause) |
| `src/client/src/App.tsx` | Main UI — nav bar, panel routing |
| `src/client/src/components/MasteringPanel.tsx` | Animated avatar + mic + TTS |
| `src/client/src/styles.css` | All styles inc. nav + mastering |
| `knowledge/` | Obsidian vault (Second Brain) |
| `persona/berylize.md` | Berylize persona text |

### berylize-node (remote)
| Path | Purpose |
|------|---------|
| `/etc/systemd/system/berylize-vllm.service` | vLLM systemd unit |
| `/mnt/disks/extra-storage/huggingface/` | Model weights cache |
| `/mnt/disks/extra-storage/envs/vllm-berylize/` | vLLM Python venv |
| `/tmp/dl14b.log` | 14B download progress |

### Hermes (local)
| Path | Purpose |
|------|---------|
| `~/.hermes/config.yaml` | LLM providers + model list |
| `~/.hermes/skills/crane/SKILL.md` | CRANE project guidelines for Hermes |
| `~/.hermes/plugins/jev/` | JEV plugin (just installed) |
| `~/.hermes/SOUL.md` | Hermes persona/identity |
| `~/.local/bin/hermes` | CLI binary |

---

## UPDATE: Hermes → OpenCode Migration (2026-10-03 morning)

**Hermes dropped** — subscription required. Replaced with **OpenCode** (free, open source).

### OpenCode Install
- Binary: `~/.opencode/bin/opencode` (v1.18.34)
- Added to PATH in `~/.bashrc`
- Config: `~/.config/opencode/opencode.jsonc`
- Run from any project: `opencode` (TUI) or `opencode run "message"`

### OpenCode Config (`~/.config/opencode/opencode.jsonc`)
- **Default model**: `berylize/Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` via port 8010 tunnel
- **Provider `berylize`**: `@ai-sdk/openai-compatible` → `http://localhost:8010/v1`
- **Provider `coderag`**: `@ai-sdk/openai-compatible` → `http://localhost:11434/v1` (Ollama small models)
- **MCP `crane`**: `http://localhost:8000/mcp` (CRANE backend tools)
- Switch models in TUI with `/models`

### Connect Script
```bash
bash /mnt/elana/ai_apps/crane/scripts/connect_berylize.sh
```
Kills stale tunnels, re-opens 8010+8013, starts vLLM + speaches if down.
Run this any time you reconnect or after VM restart.

### berylize-node GPU Issue
VM had GPU detach (nvidia-smi: "No devices were found" despite /dev/nvidia0 present).
Fixed with stop+start (NOT reboot). VM restarting now.
After VM is up: run `connect_berylize.sh`, then vLLM loads ~15 min.

### 14B Download State
~9.3GB downloaded (3/5 shards in shared blobs). Will auto-resume on next vLLM start.
If it fails, force re-download:
```bash
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden \
  --command='/mnt/disks/extra-storage/envs/vllm-berylize/bin/python -c "
from huggingface_hub import snapshot_download
snapshot_download(\"Qwen/Qwen2.5-Coder-14B-Instruct-AWQ\", cache_dir=\"/mnt/disks/extra-storage/huggingface\")
"'
```
