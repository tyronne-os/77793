#!/usr/bin/env bash
# setup_jev.sh — pair JEV with Hermes in one shot
# Asks for the key once, handles all saving/exporting automatically.
set -euo pipefail

HERMES_ENV="$HOME/.hermes/.env"
HERMES_CFG="$HOME/.hermes/config.yaml"
CRANE_VAULT="$HOME/.crane_vault.env"
RC_FILES=("$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile")

# ── backend selection ──────────────────────────────────────────────────────────
echo ""
echo "JEV backend:"
echo "  1) TypeSafe  (TYPESAFE_API_KEY)"
echo "  2) Cloudflare (CLOUDFLARE_JEV_API_TOKEN)"
echo ""
read -rp "Choose [1/2, default 1]: " CHOICE
CHOICE="${CHOICE:-1}"

if [[ "$CHOICE" == "2" ]]; then
    BACKEND="cloudflare"
    ENV_VAR="CLOUDFLARE_JEV_API_TOKEN"
    MODEL="typesafe/jev"
    read -rp "Cloudflare Account ID (32 hex chars): " CF_ACCOUNT
    if ! [[ "$CF_ACCOUNT" =~ ^[a-fA-F0-9]{32}$ ]]; then
        echo "ERROR: Account ID must be exactly 32 hex characters." >&2; exit 1
    fi
else
    BACKEND="typesafe"
    ENV_VAR="TYPESAFE_API_KEY"
    MODEL="jev-latest"
    CF_ACCOUNT=""
fi

# ── key input ─────────────────────────────────────────────────────────────────
echo ""
read -rsp "$ENV_VAR: " API_KEY
echo ""

if [[ -z "$API_KEY" || "$API_KEY" =~ [[:space:]] ]]; then
    echo "ERROR: Key is empty or contains whitespace." >&2; exit 1
fi

# ── 1. Hermes .env ─────────────────────────────────────────────────────────────
touch "$HERMES_ENV"
chmod 600 "$HERMES_ENV"
# Remove any existing entry for this var, then append
grep -v "^${ENV_VAR}=" "$HERMES_ENV" > "${HERMES_ENV}.tmp" 2>/dev/null || true
echo "${ENV_VAR}=${API_KEY}" >> "${HERMES_ENV}.tmp"
mv "${HERMES_ENV}.tmp" "$HERMES_ENV"
echo "✓ Saved to $HERMES_ENV"

# ── 2. Hermes config.yaml — inject connection block ───────────────────────────
python3 - <<PYEOF
import yaml, pathlib, json

cfg_path = pathlib.Path("$HERMES_CFG")
cfg = yaml.safe_load(cfg_path.read_text()) or {}

cfg.setdefault("plugins", {})
cfg["plugins"].setdefault("entries", {})
cfg["plugins"]["entries"].setdefault("jev", {})
cfg["plugins"]["entries"]["jev"].setdefault("settings", {})

connection = {
    "backend": "$BACKEND",
    "model":   "$MODEL",
    "account_id": "$CF_ACCOUNT",
    "timeout": 30,
}
cfg["plugins"]["entries"]["jev"]["settings"]["connection"] = connection

cfg_path.write_text(yaml.dump(cfg, default_flow_style=False, allow_unicode=True))
print("✓ Saved connection config to $HERMES_CFG")
PYEOF

# ── 3. CRANE vault ────────────────────────────────────────────────────────────
if [[ -f "$CRANE_VAULT" ]]; then
    touch "$CRANE_VAULT"
    chmod 600 "$CRANE_VAULT"
    grep -v "^${ENV_VAR}=" "$CRANE_VAULT" > "${CRANE_VAULT}.tmp" 2>/dev/null || true
    echo "${ENV_VAR}=${API_KEY}" >> "${CRANE_VAULT}.tmp"
    mv "${CRANE_VAULT}.tmp" "$CRANE_VAULT"
    echo "✓ Saved to CRANE vault ($CRANE_VAULT)"
fi

# ── 4. Shell rc files ─────────────────────────────────────────────────────────
for RC in "${RC_FILES[@]}"; do
    [[ -f "$RC" ]] || continue
    if grep -q "^export ${ENV_VAR}=" "$RC" 2>/dev/null; then
        sed -i "s|^export ${ENV_VAR}=.*|export ${ENV_VAR}=${API_KEY}|" "$RC"
    else
        echo "export ${ENV_VAR}=${API_KEY}" >> "$RC"
    fi
    echo "✓ Exported in $RC"
done

# ── 5. Current session ────────────────────────────────────────────────────────
export "${ENV_VAR}=${API_KEY}"
echo "✓ Exported in current shell"

# ── 6. Restart Hermes gateway ─────────────────────────────────────────────────
echo ""
if command -v hermes &>/dev/null; then
    echo "Restarting Hermes gateway..."
    hermes gateway restart 2>&1 | tail -3 || true
    echo "✓ Gateway restarted"
else
    echo "hermes not on PATH — run 'hermes gateway restart' manually"
fi

echo ""
echo "Done. JEV is paired with backend: $BACKEND / model: $MODEL"
echo "Verify with: hermes jev status"
