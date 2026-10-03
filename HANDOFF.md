# CRANE Session Handoff — Updated 2026-10-03

**Next agent: read this top-to-bottom. Everything you need is here.**

---

## CURRENT STATE (what works RIGHT NOW)

| What | Status |
|------|--------|
| OpenCode IDE | ✅ `~/.opencode/bin/opencode` v1.18.34 — run `opencode` from any project dir |
| Ollama (local) | ✅ Running — all 4 models on USB stick at `/mnt/usbpool/ollama` |
| dolphin3:8b | ✅ Pulled, uncensored lead model — default in OpenCode (`local/dolphin3:8b`) |
| qwen2.5-coder:3b | ✅ Pulled |
| phi3.5:latest | ✅ Pulled |
| starcoder2:3b | ✅ Pulled |
| USB Pool (85 GB LVM) | ✅ `/mnt/usbpool` — auto-mounts on boot |
| Kaggle GPU tunnel | ⏳ Batch run in progress — v2 notebook pulling qwen3-coder:30b (~20 min) |
| BitNet | ⏳ Clone re-started in terminal — llama.cpp submodule still cloning |
| berylize-node (GCP) | ❓ Not reconnected this session — tunnels down |

---

## USING OPENCODE RIGHT NOW

```bash
cd /mnt/elana/ai_apps/crane
opencode
```

Default model is `local/dolphin3:8b` (uncensored, no guardrails, runs on CPU via Ollama).
Switch models with `/models` inside OpenCode.

Configs:
- `~/.config/opencode/opencode.jsonc` — providers, models, MCP, permissions
- `~/.config/opencode/AGENTS.md` — global agent instructions (Claude Code style)

---

## KAGGLE GPU — AUTONOMOUS MANAGEMENT

The Kaggle GPU is **fully automated** now. No browser needed.

**v2 notebook is live:** `https://www.kaggle.com/code/tjjacques/crane-ollama-server`

What v2 does differently from v1:
- Installs `zstd` before Ollama (v1 failed on this)
- Pulls `qwen3-coder:30b` as `crane-agent` (30B, tool calling, 32k context, spans both T4s)
- Pulls `dolphin3:8b` as `crane-chat` (uncensored, no tools)
- Both models tuned with `OLLAMA_KV_CACHE_TYPE=q8_0` and `OLLAMA_SCHED_SPREAD=1`
- Cell 5 watchdog auto-restarts Ollama and tunnel if either dies
- Saves tunnel URL to `/kaggle/working/tunnel_url.txt` in the notebook filesystem

**To manage from the terminal (no browser, no Kaggle UI):**
```bash
# Check if run is still going
bash /mnt/elana/ai_apps/crane/scripts/kaggle_ops.sh status

# Get the current tunnel URL (only works once Cell 4 has run)
bash /mnt/elana/ai_apps/crane/scripts/kaggle_ops.sh url

# Auto-detect URL and patch opencode.jsonc
bash /mnt/elana/ai_apps/crane/scripts/kaggle_ops.sh sync

# Push a new notebook version (triggers a fresh run)
bash /mnt/elana/ai_apps/crane/scripts/kaggle_ops.sh push
```

**When Kaggle tunnel is up**, OpenCode default switches to `kaggle/crane-agent` (Qwen3-Coder 30B).

**When tunnel dies (URL changes):**
```bash
bash /mnt/elana/ai_apps/crane/scripts/kaggle_ops.sh sync
```

---

## RESUME TASKS (in priority order)

### 1. Confirm BitNet clone finishes — PENDING
Check terminal tab 7:
```bash
# If the clone finished, run deps:
cd /mnt/usbpool/bitnet && pip3 install -r requirements.txt
# Then download the model:
python3 setup_env.py -md /mnt/usbpool/bitnet/models -q i2_s
```
Model: `microsoft/BitNet-b1.58-2B-4T` (~400 MB, CPU-only inference)

### 2. Sync the Kaggle tunnel URL — PENDING
Once the Kaggle batch run finishes (allow ~30-45 min from push):
```bash
bash /mnt/elana/ai_apps/crane/scripts/kaggle_ops.sh sync
```
This patches `opencode.jsonc` and verifies the tunnel responds.

### 3. Push all local commits to GitHub
```bash
cd /mnt/elana/ai_apps/crane && git push origin main
```
Local commits not yet pushed: `02a0a48`, `8371ba1`

### 4. Reconnect berylize-node (GCP L4 GPU)
```bash
bash /mnt/elana/ai_apps/crane/scripts/connect_berylize.sh
```
Then verify 14B download completed and start vLLM:
```bash
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden \
  --command='du -sh /mnt/disks/extra-storage/huggingface/models--Qwen--Qwen2.5-Coder-14B-Instruct-AWQ/blobs/'
# Should be ~9.2 GB. Then:
gcloud compute ssh berylize-node --zone=us-east1-c --project=posh-eden \
  --command='sudo systemctl start berylize-vllm && sudo journalctl -fu berylize-vllm'
```

### 5. Abliterate the coder models (if guardrails detected)
Tool: `sunkencity999/blasphemer` (Heretic fork)
- `qwen2.5-coder:3b`, `phi3.5:latest`, `starcoder2:3b` may have guardrails
- `dolphin3:8b` is already fully uncensored — skip it

### 6. Test full CRANE IDE
```bash
cd /mnt/elana/ai_apps/crane
uvicorn src.server.main:app --host 0.0.0.0 --port 8000
```
Then: Mastering tab → mic → avatar should go idle→listening→thinking→speaking via berylize TTS

---

## SYSTEM MAP

| Component | Location | Status |
|-----------|----------|--------|
| CRANE FastAPI | `/mnt/elana/ai_apps/crane/` port 8000 | Not running |
| OpenCode | `~/.opencode/bin/opencode` v1.18.34 | ✅ Ready |
| Ollama | `/usr/local/bin/ollama` | ✅ Running |
| USB Pool | `/mnt/usbpool` (85 GB LVM, 4 drives) | ✅ Mounted |
| Ollama models | `/mnt/usbpool/ollama` | ✅ All 4 pulled |
| BitNet | `/mnt/usbpool/bitnet` | ⏳ Cloning |
| Kaggle T4x2 | `crane-agent` (qwen3-coder:30b) | ⏳ Pulling |
| berylize-node | GCP L4, `34.74.41.235` | ❓ Tunnels down |
| vLLM (14B) | berylize port 8010 | ❓ Not started |
| Speaches TTS | berylize port 8013 | ❓ Container may still be running |

---

## PORT MAP

| Port | Service |
|------|---------|
| 8000 | CRANE FastAPI |
| 8001 | CRANE preview |
| 8002–8005 | CRANE reserved |
| 8010 | berylize vLLM (Qwen2.5-Coder-14B-AWQ) |
| 8011 | MiniMax H3 — not yet served |
| 8012 | Kokoro TTS standalone — not started |
| 8013 | Speaches / elana-voice Podman |
| 11434 | Ollama local |

---

## KEY FILES

| File | Purpose |
|------|---------|
| `~/.config/opencode/opencode.jsonc` | OpenCode providers, models, MCP, permissions |
| `~/.config/opencode/AGENTS.md` | Global agent instructions (Claude Code emulation) |
| `scripts/kaggle_ops.sh` | Kaggle API: push/status/url/sync |
| `scripts/kaggle_set_url.sh` | Patches opencode.jsonc with new tunnel URL |
| `scripts/kaggle_ollama_server.ipynb` | Notebook v2 (qwen3-coder:30b agent) |
| `scripts/setup_usbpool.sh` | Rebuild LVM pool if drives change |
| `scripts/setup_ollama_models.sh` | Pull all 4 local models to USB |
| `scripts/connect_berylize.sh` | SSH tunnels + start berylize services |
| `src/server/main.py` | FastAPI app — all endpoints + WebSockets |
| `src/server/mcp_server.py` | CRANE MCP server (SSE, port 8000/mcp) |
| `src/server/coderag.py` | CodeRAG small model service (needs Ollama) |
| `src/client/src/components/MasteringPanel.tsx` | Animated avatar + mic + TTS |

---

## KNOWN ISSUES

1. BitNet shallow clone corrupted submodule — full re-clone running now
2. Kaggle tunnel URL changes every notebook session — run `kaggle_ops.sh sync` to fix
3. berylize-node GPU had detach event — fixed with stop+start, but tunnels need re-opening
4. elana-voice container not set to auto-start on reboot (no systemd unit)
5. MiniMax H3 weights on nvme0n2 but vLLM serve not configured (port 8011 empty)
6. REPORTS tab in CRANE nav is a stub

---

## WHAT TO TELL NEXT CLAUDE SESSION

"Continue CRANE setup. HANDOFF.md is at `/mnt/elana/ai_apps/crane/HANDOFF.md`. All 4 local models are pulled to `/mnt/usbpool/ollama`. OpenCode is configured at `~/.config/opencode/opencode.jsonc`. The next tasks are: (1) run `kaggle_ops.sh sync` to get the Kaggle tunnel URL, (2) finish BitNet install, (3) push unpushed commits, (4) reconnect berylize-node."
