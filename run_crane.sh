#!/bin/bash
# RUN CRANE v2 - preflight + launch. Differences from v1 are listed in the review notes.
set -uo pipefail

CRANE_DIR="/mnt/elana/ai_apps/crane"
PROJECTS_DIR="${CRANE_DIR}/projects"
NODE="berylize-node"; PROJECT="posh-eden"; ZONE="us-east1-c"
LOCAL_PORT="${CRANE_PORT:-8010}"        # NOT 8000: Big Proppa backend uses 8000 locally
REMOTE_PORT=8000
LOCAL_MM_PORT=8011                      # MiniMax H3 diffusion tunnel
REMOTE_MM_PORT="${CRANE_MM_PORT:-8001}" # port vLLM serves MiniMax on the node
WANT_MODEL="${CRANE_MODEL:-}"         # optional substring; empty = use whatever vLLM serves
GC=(gcloud compute ssh "$NODE" --project="$PROJECT" --zone="$ZONE" --quiet)
SSHOPT=(--ssh-flag="-o ConnectTimeout=15" --ssh-flag="-o ServerAliveInterval=30")

ok()   { echo "  [ OK ] $*"; }
fail() { echo "  [FAIL] $*" >&2; exit 1; }
info() { echo "  [ .. ] $*"; }
remote() { timeout 60 "${GC[@]}" "${SSHOPT[@]}" --command "$1" 2>/dev/null; }

mkdir -p "$PROJECTS_DIR"
echo "=================================================="
echo " RUN CRANE - preflight"
echo "=================================================="

# 0. local tools
for t in gcloud ssh curl nc; do command -v "$t" >/dev/null || fail "missing local tool: $t"; done
gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q . \
  || fail "gcloud not authenticated - run: gcloud auth login"

# 1. GPU node
echo; echo "[1/5] GPU node $NODE"
STATUS=$(gcloud compute instances describe "$NODE" --project="$PROJECT" --zone="$ZONE" \
         --format="value(status)" 2>/dev/null || echo NOT_FOUND)
case "$STATUS" in
  RUNNING) ok "running (billing is active)";;
  TERMINATED|STOPPED|SUSPENDED)
    info "status $STATUS - starting"
    gcloud compute instances start "$NODE" --project="$PROJECT" --zone="$ZONE" --quiet >/dev/null \
      || fail "could not start $NODE (quota/capacity? try again or another zone)"
    ;;
  *) fail "node status '$STATUS' - check project/zone/auth";;
esac
info "waiting for SSH"
for i in $(seq 1 30); do remote "true" >/dev/null && break; sleep 4; [ "$i" = 30 ] && fail "SSH never came up"; done
ok "SSH reachable"

# 2. GPU + vLLM (polls instead of fixed sleeps)
echo; echo "[2/5] GPU and vLLM"
remote "nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader" \
  | sed 's/^/        GPU: /' || fail "nvidia-smi failed - GPU driver not healthy"
models_json() { remote "curl -s -m 5 http://localhost:${REMOTE_PORT}/v1/models"; }
MODELS=$(models_json || true)
if [ -z "$MODELS" ]; then
  if remote "systemctl cat vllm >/dev/null 2>&1"; then
    info "vLLM not answering - restarting service"
    remote "sudo systemctl restart vllm" >/dev/null
  else
    fail "no vLLM answering on :${REMOTE_PORT} and no 'vllm' systemd unit - start it manually"
  fi
  info "waiting for model to load (up to ~10 min)"
  for i in $(seq 1 60); do
    MODELS=$(models_json || true); [ -n "$MODELS" ] && break
    sleep 10; [ "$i" = 60 ] && { remote "journalctl -u vllm -n 25 --no-pager" >&2; fail "vLLM did not come up"; }
  done
fi
MODEL_ID=$(echo "$MODELS" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["id"])' 2>/dev/null) \
  || fail "vLLM answered but /v1/models was not valid JSON"
[ -n "$WANT_MODEL" ] && [[ "$MODEL_ID" != *"$WANT_MODEL"* ]] && fail "serving '$MODEL_ID', expected '*$WANT_MODEL*'"
ok "serving model: $MODEL_ID"
remote "curl -s -m 60 http://localhost:${REMOTE_PORT}/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{\"model\":\"${MODEL_ID}\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"max_tokens\":4}'" \
  | grep -q '"choices"' || fail "model listed but a test completion failed (out of VRAM?)"
ok "test completion succeeded"

# 3. tunnels (Qwen on 8010, MiniMax H3 on 8011)
echo; echo "[3/5] SSH tunnels"
open_tunnel() {
  local lp="$1" rp="$2" label="$3"
  local check_url="http://localhost:${lp}/v1/models"
  if curl -s -m 3 "$check_url" | grep -q '"data"'; then
    ok "port ${lp} tunnel already live ($label)"
    return
  fi
  pkill -f "${lp}:localhost:${rp}" 2>/dev/null || true
  nc -z localhost "$lp" 2>/dev/null && { echo "  [WARN] port ${lp} in use by something else - skipping $label tunnel"; return; }
  "${GC[@]}" "${SSHOPT[@]}" -- -N -f -o ExitOnForwardFailure=yes \
      -L "${lp}:localhost:${rp}" 2>/dev/null || { echo "  [WARN] tunnel for $label failed - skipping"; return; }
  for i in 1 2 3 4 5; do curl -s -m 3 "$check_url" | grep -q '"data"' && break; sleep 2; done
  ok "tunnel ${lp} -> ${NODE}:${rp} ($label)"
}
# Qwen / main coding model
tunnel_ok() { curl -s -m 5 "http://localhost:${LOCAL_PORT}/v1/models" | grep -q "$MODEL_ID"; }
if ! tunnel_ok; then
  open_tunnel "$LOCAL_PORT" "$REMOTE_PORT" "Qwen"
  tunnel_ok || fail "Qwen tunnel opened but model not reachable through it"
fi
ok "Qwen tunnel verified end-to-end"
# MiniMax H3 (best-effort - only if vLLM is serving it on the node)
MM_UP=$(remote "curl -s -m 3 http://localhost:${REMOTE_MM_PORT}/v1/models" 2>/dev/null || true)
if [ -n "$MM_UP" ]; then
  open_tunnel "$LOCAL_MM_PORT" "$REMOTE_MM_PORT" "MiniMax H3"
else
  echo "  [INFO] MiniMax H3 not detected on node:${REMOTE_MM_PORT} - skipping that tunnel"
fi

# 4. hermes
echo; echo "[4/5] Hermes"
export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$PATH"
UI="${CRANE_UI:-ide}"      # ide (default) | desktop | cli
if command -v hermes >/dev/null; then ok "$(command -v hermes)"
elif [ "$UI" != ide ]; then fail "'hermes' not found - install: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash"
else info "hermes not installed (not needed for the CRANE IDE)"; fi

# 4b. CRANE IDE (ports 8000 api/ui, 8001 preview, 8002-8004 reserved)
if [ "$UI" = ide ]; then
  echo; echo "[IDE] CRANE Builder"
  for p in 8000 8001; do
    if nc -z 127.0.0.1 $p 2>/dev/null && ! curl -s -m 2 http://127.0.0.1:8000/api/status 2>/dev/null | grep -q '"ok"'; then
      fail "port $p is in use by something else - CRANE needs 8000-8004"; fi
  done
  if ! curl -s -m 2 http://127.0.0.1:8000/api/status 2>/dev/null | grep -q '"ok"'; then
    (cd "$CRANE_DIR/src/server" && setsid nohup "$CRANE_DIR/.venv/bin/uvicorn" main:app --host 127.0.0.1 --port 8000 >/tmp/crane-server.log 2>&1 &)
    for i in $(seq 1 20); do curl -s -m 1 http://127.0.0.1:8000/api/status 2>/dev/null | grep -q '"ok"' && break; sleep 1; [ "$i" = 20 ] && { tail -5 /tmp/crane-server.log >&2; fail "CRANE server did not start"; }; done
  fi
  ok "CRANE IDE running at http://localhost:8000"
  (xdg-open http://localhost:8000 >/dev/null 2>&1 &)
  echo; echo "  Qwen tunnel + IDE are up. Leave this window open while you build."
  read -rp "  Press Enter here when you are done to shut down... " _
  for pid in $(pgrep -f "uvicorn main:app --host 127.0.0.1 --port 8000"); do kill "$pid" 2>/dev/null; done
  STOP_ASK=1
fi

# 5. workspace
[ "$UI" = ide ] && { read -rp "Stop $NODE now to stop GPU billing? [Y/n] " A; if [[ ! "$A" =~ ^[Nn] ]]; then pkill -f "${LOCAL_PORT}:localhost:" 2>/dev/null || true; gcloud compute instances stop "$NODE" --project="$PROJECT" --zone="$ZONE" --quiet && ok "node stopped - billing ended"; fi; exit 0; }
echo; echo "[5/5] Workspace"
echo "  1) Open existing project   2) New project   3) Root workspace"
read -rp "  Select [1-3]: " CHOICE
TARGET_DIR="$CRANE_DIR"
case "$CHOICE" in
  1) mapfile -t PROJS < <(find "$PROJECTS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
     [ ${#PROJS[@]} -eq 0 ] && echo "  no projects yet - using root" || {
       select P in "${PROJS[@]}" "Cancel"; do [ -n "${P:-}" ] && [ "$P" != Cancel ] && TARGET_DIR="${PROJECTS_DIR}/${P}"; break; done; } ;;
  2) read -rp "  New project name: " N
     N=$(echo "$N" | tr -cs 'A-Za-z0-9._-' '_' | sed 's/^_*//;s/_*$//')
     [ -z "$N" ] && fail "empty project name"
     TARGET_DIR="${PROJECTS_DIR}/${N}"; mkdir -p "$TARGET_DIR"; ok "created $TARGET_DIR" ;;
esac

cd "$TARGET_DIR" || fail "cannot cd to $TARGET_DIR"
export OPENAI_API_BASE="http://localhost:${LOCAL_PORT}/v1"
export OPENAI_BASE_URL="http://localhost:${LOCAL_PORT}/v1"
export OPENAI_API_KEY="${OPENAI_API_KEY:-not-needed}"
# Update Hermes config to use the verified model
python3 -c "
import yaml, pathlib
cfg = pathlib.Path.home() / '.hermes/config.yaml'
d = yaml.safe_load(cfg.read_text())
d.setdefault('providers',{}).setdefault('crane_tunnel',{})['models'] = ['${MODEL_ID}']
d['settings']['default_model'] = '${MODEL_ID}'
cfg.write_text(yaml.dump(d, default_flow_style=False))
" 2>/dev/null && ok "Hermes pointed at $MODEL_ID" || true
echo; echo "Launching Hermes in $TARGET_DIR with $MODEL_ID"
if [ "$UI" = desktop ]; then
  hermes desktop
else
  hermes chat --model "$MODEL_ID"
fi

# on exit: the GPU keeps billing until it is stopped
echo
read -rp "Stop $NODE now to stop GPU billing? [Y/n] " A
if [[ ! "$A" =~ ^[Nn] ]]; then
  pkill -f "${LOCAL_PORT}:localhost:" 2>/dev/null || true
  gcloud compute instances stop "$NODE" --project="$PROJECT" --zone="$ZONE" --quiet && ok "node stopped - billing ended"
fi
