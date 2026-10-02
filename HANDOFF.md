# CRANE Builder IDE — Phase 1 Handoff

## What was built

CRANE is a self-hosted, browser-based AI IDE running at `http://localhost:8000`. It pairs a local AI coding agent (Qwen2.5-Coder via a GCP GPU node) with a full development environment: code editor, live preview, terminal, container management, and secure credential storage.

---

## Architecture

```
/mnt/elana/ai_apps/crane/
  src/
    server/          FastAPI backend (port 8000)
      main.py        REST + WebSocket routes
      chat.py        Qwen streaming + tool calls (read/write/run file ops)
      files.py       File tree, read/write, watchdog broadcast
      terminal.py    ptyprocess shell ↔ xterm.js WebSocket
      process.py     Project dev-server lifecycle (port 8001)
      gpu.py         GCP berylize-node GPU metrics + start/pause
      vault.py       Secure credential store + usage logging
      podman.py      Podman/Docker container management
      static/        Vite production build (served by FastAPI)
    client/          React + Vite frontend
      src/
        App.tsx              Main layout, panel state, WebSocket orchestration
        components/
          ChatPanel.tsx      Composer with code blocks, GitHub picker, voice
          CodePanel.tsx      CodeMirror 6 editor with AI streaming
          TerminalPanel.tsx  xterm.js — LOCAL / GCP / NVIDIA tabs, Split/Close
          BackendPanel.tsx   React Flow graph — Qwen, MiniMax, Kokoro nodes
          PodmanPanel.tsx    Container manager (8 tabs, 10 features)
          VaultPanel.tsx     Token vault + Usage Report tab
          GpuMeter.tsx       GPU stats / start / pause
          PreviewPanel.tsx   iframe → port 8001
          FileTree.tsx       Project file navigator
  projects/          One subdirectory per user project
  run_crane.sh       Launcher (starts server + Hermes if configured)
```

---

## Key design decisions

| Decision | Rationale |
|---|---|
| FastAPI + uvicorn (port 8000) | Async WebSocket support, single process serving both API and static files |
| React + Vite → compiled to `src/server/static/` | No separate dev server in production; `vite build` output served by FastAPI |
| Local `~/.crane_vault.env` (chmod 600) | API keys never leave the machine, never committed, never returned by API |
| `~/.crane_usage.json` | Tracks per-service usage (tokens, caller, device) without hitting third-party dashboards |
| Qwen OpenAI-compat endpoint | Qwen at port 8010 speaks the OpenAI streaming API — same SDK, zero extra deps |
| xterm.js + ptyprocess | Standard terminal stack (same as VS Code); handles resize, colors, binary PTY output |
| React Flow for BackendPanel | Graph layout handles node positions without manual CSS; `_dispatch` module-level ref avoids re-mount issues |
| Podman over Docker | Rootless, no daemon, systemd integration, Kubernetes-compatible pods |

---

## Services / Ports

| Port | Service |
|---|---|
| 8000 | CRANE API + static UI |
| 8001 | Project preview dev server |
| 8010 | Qwen2.5-Coder (SSH tunnel from berylize-node) |
| 8011 | MiniMax H3 (SSH tunnel or ZeroGPU Space) |
| 8012 | Kokoro TTS (kokoro-onnx serve) |

---

## Credentials (stored in `~/.crane_vault.env`)

| Service | Env var |
|---|---|
| Hugging Face | `HF_TOKEN` |
| GitHub | `GITHUB_TOKEN` |
| NVIDIA NGC | `NGC_API_KEY` |
| NVIDIA Enterprise | `NVIDIA_ENT_KEY` |
| Google Cloud | `GCP_AUTH` (gcloud CLI) |
| JEV | `JEV_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| College Football | `CFB_API_KEY` |
| Tank01 | `TANK_API_KEY` |
| Hostinger | `HOSTINGER_API_KEY` |

---

## GCP GPU Node (berylize-node)

- Project: `posh-eden`, zone `us-east1-c`, machine `g2-standard-4` + NVIDIA L4
- Cost: ~$0.40/hr when running
- **$240 credits expire 2026-11-01**
- Auto-pauses after idle timeout (configurable in GPU panel)
- `run_crane.sh` handles SSH tunnel setup before launching Hermes/CRANE

---

## Phase 1 complete — all features shipped

1. Secure Token Vault (11 services + test endpoints)
2. Usage Report (per-service: last used, tokens, caller, device)
3. Terminal: LOCAL / GCP / NVIDIA tabs, Split, Close
4. Chat code blocks with Copy + ▶ Run (executes in terminal)
5. BACKEND panel: React Flow graph, Hermes launcher, voice test
6. Big Proppa color palette applied to full UI
7. GitHub Codex-style repo picker in composer
8. Podman panel: 8 tabs, 10 container management features
9. Terminal accessible without an open project
10. Chat composer: voice input, file attach, GitHub repo browse

---

## Phase 2 TODO

- Autonomous computer-use agents from chat (Anthropic computer-use API)
- Big Proppa: lock tickets with kickoff timestamp
- Big Proppa: grader (fill `actual_value`, set HIT/MISS, compute `result_units`)
- Big Proppa: calibration view (predicted probability vs actual hit rate)
- Big Proppa: replace parlay EV with "UNPROVEN" until edge proven
- Podman: install wizard (auto-install via terminal exec)
- ZeroGPU Space deployment flow (HF token required)
- MiniMax H3 tunnel setup wizard

---

## How to run

```bash
# Start the server
cd /mnt/elana/ai_apps/crane/src/server
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

# Or use the launcher (also starts Hermes)
bash /mnt/elana/ai_apps/crane/run_crane.sh
```

Then open http://localhost:8000 in a browser.

---

## Update — 2026-10-02

- Repo renamed to **tyronne-os/CRANE-IT** on GitHub: https://github.com/tyronne-os/CRANE-IT
- Local path: `/mnt/elana/ai_apps/crane`
- Reference folder: `~/Downloads/CRANE IT`
- All Phase 1 features committed and pushed
- Podman panel, server podman routes, and `podman-workstation/` added
- CRANE IDE confirmed running at `http://localhost:8000`
- GPU offline (berylize-node not tunneled) — run `run_crane.sh` to activate
