# CRANE Builder IDE — User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Header & Navigation](#header--navigation)
3. [Chat with Qwen](#chat-with-qwen)
4. [Code Editor](#code-editor)
5. [Live Preview](#live-preview)
6. [Terminal](#terminal)
7. [File Tree](#file-tree)
8. [GPU Panel](#gpu-panel)
9. [Backend Panel](#backend-panel)
10. [Podman Panel](#podman-panel)
11. [Secure Token Vault](#secure-token-vault)
12. [Usage Report](#usage-report)
13. [GitHub Integration](#github-integration)
14. [Voice Input](#voice-input)
15. [Clone / Scrape a URL](#clone--scrape-a-url)
16. [GoClone (Mirror a website)](#goclone-mirror-a-website)
17. [Projects](#projects)
18. [Keyboard Shortcuts & Tips](#keyboard-shortcuts--tips)

---

## Getting Started

CRANE runs at **http://localhost:8000**. It starts automatically with `run_crane.sh`.

To create your first project:
1. Click **+ New** in the header and type a project name
2. Type a prompt in the chat box: *"Build a landing page for a coffee shop"*
3. Watch Qwen write the code live in the editor
4. Click **▶ Start preview** (or **▶ Run** in the header) to see it running

---

## Header & Navigation

```
[🏗 CRANE BUILDER] [Choose project▾] [+New] [CODE] [PREVIEW] [⊞] [AUTO] [⌨] [GPU] [● model] [PODMAN] [BACKEND] [🔒]
```

| Button | What it does |
|---|---|
| **Choose project** | Switch between saved projects |
| **+ New** | Create a new empty project |
| **CODE** | Show only the code editor |
| **PREVIEW** | Show only the live preview iframe |
| **⊞** | Split view: editor left, preview right |
| **AUTO / PLAN** | Toggle Qwen's mode: autonomous edits vs. plan-first |
| **⌨** | Open/close the terminal panel |
| **GPU** | Open the GPU usage meter and berylize-node controls |
| **PODMAN** | Open the Podman container manager |
| **BACKEND** | Open the AI backend panel (Hermes, voice, service nodes) |
| **🔒** | Open the Secure Token Vault |

---

## Chat with Qwen

The left panel is your conversation with Qwen2.5-Coder. Type instructions and Qwen edits your project files live.

**Interrupting:** Type a new instruction at any time — Qwen stops and restarts with your correction.

**Modes:**
- **AUTO** — Qwen edits files immediately as it plans
- **PLAN** — Qwen writes a plan first, waits for you to review, then acts

**Code blocks in responses** have two buttons:
- **Copy** — copies the code to clipboard
- **▶ Run** — opens the terminal and executes the command

**Suggestions on the welcome screen:** Click any chip to start that build instantly.

**Clear chat:** The trash icon in the toolbar resets the conversation (Qwen forgets context).

---

## Code Editor

The editor (CodePanel) uses CodeMirror 6 and supports:
- JavaScript, TypeScript, JSX, TSX, CSS, HTML, JSON, Python, Markdown
- Live streaming: Qwen's token output updates the editor as it writes
- Syntax highlighting, line numbers, dark theme
- Auto-scroll to the line Qwen is currently writing

**Active file:** The filename shown in the tab above the editor. Click any file in the File Tree to switch.

**Unsaved indicator:** A gold pulsing dot in the tab means Qwen is actively writing to that file.

---

## Live Preview

The PREVIEW pane is an iframe pointing at **http://localhost:8001**, which runs your project's dev server (Vite, Next.js, CRA, or a raw static server).

**Starting the preview:**
- Click **▶ Start preview** in the empty state, or
- Click **▶ Run** in the header when a project is open

**Vite HMR:** Changes Qwen makes to files trigger Vite's Hot Module Replacement automatically — the preview updates in under a second without a full reload.

---

## Terminal

Click **⌨** in the header to open the terminal panel. It appears as a strip at the bottom of the stage area.

### Tabs

| Tab | What it connects to |
|---|---|
| **LOCAL** | Bash in your project directory (or home if no project open) |
| **GCP** | SSH into berylize-node (the GPU cloud node) |
| **NVIDIA** | Local shell with NIM / NGC environment variables loaded |

### Terminal controls

- **⊞ SPLIT** — Opens a second terminal pane side-by-side with the current one
- **× CLOSE** — Closes the terminal panel (all panes)

**Run from chat:** When Qwen's response contains a shell code block, click **▶ Run** to send it directly to the LOCAL terminal.

**Terminal works without a project** — useful for GCP/NVIDIA operations.

---

## File Tree

The left sidebar under the header shows your project's file structure. Click any file to open it in the editor. Folders are listed with a muted color.

---

## GPU Panel

Click **GPU** in the header to open the GPU usage meter.

### Metrics tab
- Real-time CPU %, memory, GPU util, GPU memory (updates via WebSocket)
- Uptime, idle time, estimated session cost

### Sessions tab
- History of GPU sessions with start/end time and cost

### Settings tab
- **Idle timeout:** How many minutes of inactivity before auto-pause
- **Hourly rate:** Used to calculate cost display ($0.40/hr default)

### Controls
- **▶ Start** — Starts berylize-node (GCP CLI call)
- **⏸ Pause** — Pauses the instance to stop billing

---

## Backend Panel

Click **BACKEND** in the header. This is a React Flow graph showing your AI service stack.

### Nodes

| Node | Port | Purpose |
|---|---|---|
| **Qwen** | 8010 | Primary coding model — SSH tunnel from berylize-node |
| **MiniMax H3** | 8011 | Fallback LLM — SSH tunnel or ZeroGPU Space |
| **Kokoro** | 8012 | TTS (text-to-speech) — kokoro-onnx serve |

Each node shows a live status dot (green = online, red = offline) and action buttons:
- **Qwen:** Tunnel (open SSH port-forward), NIM→ (load NVIDIA NIM env)
- **MiniMax:** Tunnel, ZeroGPU (open Hugging Face Space)
- **Kokoro:** ▶ Start (launch kokoro-onnx), ♪ Test (send test phrase)

### Bottom dock

**HERMES:** Launch the Hermes AI agent framework
- 🖥 **desktop** — `hermes desktop` (GUI mode)
- 💬 **chat** — `hermes chat` (terminal chat)
- ⚡ **Full Stack** — runs `run_crane.sh` (full stack including tunnels)

**GPU:** Quick GPU status strip with Start/Pause buttons

**VOICE TEST:** Type any text and click 🔊 Speak to hear Kokoro TTS output (requires Kokoro running)

---

## Podman Panel

Click **PODMAN** in the header. Full container management for self-hosting.

### Tabs

| Tab | Feature |
|---|---|
| **CONTAINERS** | List all containers — start, stop, restart, view logs, generate systemd unit, remove |
| **IMAGES** | Pull from any registry, view local images, remove |
| **PODS** | Podman pods (group containers like Kubernetes) — start, stop, restart, remove |
| **VOLUMES** | List and remove named volumes |
| **NETWORKS** | Inspect container networks and subnets |
| **STATS** | Live CPU %, memory, network I/O snapshot for running containers |
| **RUN** | Launch any container with image, name, ports, volumes, env vars, command |
| **CONVERT** | Scan the active project for Docker files and patch them for Podman/rootless compatibility |

### Install

If Podman is not installed, the header shows the install command:
```bash
sudo apt install podman
```

### Ask Qwen

You can manage containers through chat. Examples:
- *"Create a podman-compose file for nginx + postgres + redis"*
- *"Convert my docker-compose.yml to use podman"*
- *"Run a postgres container on port 5432"*

---

## Secure Token Vault

Click **🔒** in the header. Tokens are stored in `~/.crane_vault.env` (chmod 600) — never committed, never logged, never returned by the API.

### Services

| Service | What it unlocks |
|---|---|
| **Hugging Face** | ZeroGPU inference, Space deployment, unlimited inference |
| **GitHub** | Repo picker in chat composer, push CRANE to private repo |
| **NVIDIA NGC** | LLM fallback via NIM when GPU is paused |
| **NVIDIA Enterprise** | Full NIM catalog access |
| **Google Cloud** | GCP terminal auth (uses gcloud CLI, not a token) |
| **JEV** | Space secret — deployed pipeline only |
| **Gemini** | Google Gemini API |
| **OpenAI** | GPT models fallback |
| **College Football API** | CFB stats agent |
| **Tank01** | Sports data via RapidAPI |
| **Hostinger** | Email management agent API |

**Saving a token:** Paste the token and click **Save & Test**. The backend immediately tests connectivity and shows ✓ or ✗.

**Removing a token:** Click **✕** on a configured service.

---

## Usage Report

Inside the Vault panel, click the **USAGE REPORT** tab.

Shows a table per service:
- **Last Used** — timestamp of most recent API call
- **Program** — the CRANE component that made the call (e.g. `crane/chat`)
- **Device** — hostname, confirming it was your machine
- **Calls** — total number of API calls
- **Tokens** — total tokens used (estimated for streaming responses)
- **Model** — last model used

Below the summary, **Recent Activity** lists the last 50 individual API calls in reverse chronological order.

Click **↺ Refresh** to reload from `~/.crane_usage.json`.

---

## GitHub Integration

### Repo Picker (Codex-style)

Click the **GitHub icon** (octocat) in the chat composer toolbar. A picker drops down showing all your GitHub repos (requires GitHub token in Vault). Search by name or description, click a repo to clone it into CRANE as a new project.

### Push CRANE to GitHub

In the Vault → GitHub card (after saving your GitHub token), enter a repo name and click **🚀 Push to GitHub**. CRANE pushes itself to a new private repo under your account.

---

## Voice Input

Click the **microphone icon** in the chat composer toolbar (requires a browser that supports Web Speech API — Chrome/Edge recommended).

- A red banner appears: **"Listening… speak now"**
- Click **Done** to finalize the transcript and send it to Qwen
- Your spoken text is inserted into the composer and sent automatically

---

## Clone / Scrape a URL

Click the **link icon** in the chat composer toolbar.

- **GitHub / GitLab / Bitbucket URL** → `git clone --depth=1` into a new project
- **Any other URL** → `wget --mirror` to scrape the site into a new project

The cloned/scraped content becomes a new CRANE project you can then ask Qwen to modify.

---

## Projects

Projects live in `/mnt/elana/ai_apps/crane/projects/`. Each is a directory.

| Action | How |
|---|---|
| **Create** | **+ New** button → type name |
| **Open** | **Choose project** dropdown |
| **Clone from GitHub** | GitHub repo picker or link icon → GitHub URL |
| **Delete** | Delete the directory from terminal |

---

## Keyboard Shortcuts & Tips

| Shortcut | Action |
|---|---|
| **Enter** in composer | Send message to Qwen |
| **Shift + Enter** | New line in composer |
| **Ctrl/Cmd + S** | (browser) Save — files are auto-saved by Qwen |
| Escape in clone bar | Cancel clone URL input |

**Pro tips:**
- Interrupt Qwen mid-build by typing a correction — it stops and restarts
- Keep **SPLIT** view while chatting so you see the live preview update as Qwen writes
- The GCP terminal tab gives you a full shell on the GPU node
- Use **PLAN mode** for complex refactors — review Qwen's plan before it edits
