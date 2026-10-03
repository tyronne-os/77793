#!/usr/bin/env bash
# setup_kaggle.sh — install the Kaggle CLI and store your API token locally (never printed)
set -euo pipefail

pip3 install --user -q kaggle
export PATH="$HOME/.local/bin:$PATH"

mkdir -p ~/.kaggle && chmod 700 ~/.kaggle

if [[ -f ~/Downloads/kaggle.json ]]; then
    mv ~/Downloads/kaggle.json ~/.kaggle/kaggle.json
    chmod 600 ~/.kaggle/kaggle.json
    echo "Installed kaggle.json from Downloads"
else
    read -r -s -p "Paste your Kaggle API token (input hidden): " TOKEN
    echo
    printf '%s' "$TOKEN" > ~/.kaggle/access_token
    chmod 600 ~/.kaggle/access_token
fi

grep -q '.local/bin' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

echo "Checking credentials..."
kaggle kernels list --mine -s "" 2>&1 | head -5 && echo "KAGGLE CLI READY"
