# CRANE Session Handoff — 2026-10-03

## What's Done This Session

### UI: Nav Bar + Mastering Suite
- **Nav bar** added to CRANE IDE header: HOME / BUILD / MASTERING / BACKEND / REPORTS tabs
- **HOME** button = `<a href="/">` back to landing page
- **MasteringPanel.tsx** — full animated talking avatar:
  - Mic → Web Speech API (STT) → `/ws/avatar-chat` → Berylize (streaming tokens) → TTS → animated SVG face
  - TTS priority chain: Kokoro → Speaches → browser SpeechSynthesis
  - Eye blink, mouth animation, idle/listening/thinking/speaking state machine
- **`/ws/avatar-chat`** WebSocket in `main.py` — isolated chat history per session

### Infrastructure: berylize-node
- **Podman** replacing Docker permanently — Docker + containerd disabled at boot
- **speaches TTS container** running as `elana-voice`:
  - `podman run -d --name elana-voice -p 127.0.0.1:8013:8000 ghcr.io/speaches-ai/speaches:latest-cuda`
  - Kokoro-82M-v1.0-ONNX-int8 model loaded (CPU inference, no GPU needed)
  - Health: `http://localhost:8013/health` → OK
- **vLLM** (`berylize-vllm.service`) restarted with fixed config:
  - `--max-model-len 8192` (down from 16384 — was OOMing KV cache at 16k)
  - `--gpu-memory-utilization 0.93` (up from 0.90)
  - Port 8010 not yet open — ~15 min for shard load + CUDA graph capture

---

## What Needs Finishing (Resume Here)

### 1. Wait for vLLM Port 8010
vLLM is loading right now. All 5 safetensors shards (~18GB AWQ) take ~11 min then CUDA graphs ~5 min.

Check: `curl -s http://localhost:8010/v1/models`

If it fails again with same OOM ValueError, the next fix is adding env var to the service:
```
Environment=VLLM_MEMORY_PROFILER_ESTIMATE_CUDAGRAPHS=0
```
Then `systemctl daemon-reload && systemctl restart berylize-vllm`

### 2. Verify SSH Tunnels Are Still Up
After any reconnect, the tunnels may have dropped:
```bash
# Port 8010 (Berylize/vLLM)
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden -- -L 8010:localhost:8010 -N -f
# Port 8013 (Speaches TTS)
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden -- -L 8013:localhost:8013 -N -f
```

### 3. Test Speaches TTS via CRANE proxy
The `/api/services/speaches/tts` endpoint in `main.py` proxies to port 8013. Test:
```bash
curl -s -X POST http://localhost:8000/api/services/speaches/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from the avatar"}'
```
Expected: `{"ok": true, "audio_b64": "...", "content_type": "audio/wav"}`

If it returns `{"ok": false}`: check that `elana-voice` container is still running on berylize-node and the 8013 tunnel is live.

### 4. Test the Full Avatar Pipeline
1. Open CRANE → click MASTERING tab
2. Click mic button → speak something
3. Avatar should go: idle → listening → thinking → speaking
4. If TTS mode = speaches, audio comes back base64 from `/api/services/speaches/tts`

### 5. REPORTS Tab (Not Implemented)
Nav shows REPORTS but clicking it does nothing useful. Backend panel and Build panel exist; Reports panel is a stub.

---

## Port Map (Reserved + Active)
| Port | Service |
|------|---------|
| 8000 | CRANE FastAPI |
| 8001 | CRANE preview |
| 8002–8005 | CRANE reserved |
| 8010 | Berylize vLLM (Qwen2.5-Coder-32B-Instruct-AWQ) |
| 8011 | Berylize Creatives (MiniMax H3 — NOT YET SERVED) |
| 8012 | Kokoro TTS (standalone — NOT yet started) |
| 8013 | Speaches TTS (elana-voice Podman container) ✅ |

---

## Key Files Changed This Session
- `src/server/main.py` — `/ws/avatar-chat`, `/api/services/speaches/tts`
- `src/server/gpu.py` — `CRANE_GPU_IDLE` env var (0 = never pause)
- `src/client/src/App.tsx` — nav bar, MasteringPanel import
- `src/client/src/components/MasteringPanel.tsx` — NEW: full avatar component
- `src/client/src/styles.css` — nav bar + mastering styles appended
- `scripts/start_berylize_node.sh` — `vllm serve` (replaces deprecated module invocation)

## On berylize-node (not in git)
- `/etc/systemd/system/berylize-vllm.service` — systemd unit, updated max-model-len 8192, gpu-util 0.93
- `elana-voice` Podman container — started each boot manually (no systemd unit yet)
  - Consider adding a systemd unit for it: `podman generate systemd elana-voice`

---

## Known Issues
- **Podman 3.4.4** on berylize-node doesn't support CDI `--device nvidia.com/gpu=all` syntax
  - Speaches Kokoro ONNX runs fine on CPU — no GPU flag needed
  - If you need GPU in a future container, use `--device /dev/nvidia0 --device /dev/nvidiactl --device /dev/nvidia-uvm`
- **elana-voice** Podman container is NOT set up to restart on reboot yet
- **MiniMax H3** weights are on nvme0n2 but vLLM serving not configured
