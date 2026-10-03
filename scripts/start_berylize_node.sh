#!/bin/bash
# start_berylize_node.sh — run on berylize-node (GCP g2-standard-4, NVIDIA L4 23 GB)
# Serves Berylize (Qwen2.5-Coder-32B-Instruct-AWQ) on port 8010 via vLLM OpenAI API.
#
# Disk layout (nvme0n2, 500 GB, mounted at /mnt/disks/extra-storage):
#   envs/vllm-berylize/          vllm 0.30.0 Python venv
#   huggingface/hub/             HF model cache
#     models--Qwen--Qwen2.5-Coder-32B-Instruct-AWQ/   ~18 GB AWQ weights
#     models--unsloth--MiniMax-H3-FP8/                 Berylize Creatives weights
#   start_vllm.sh                this script (copy on disk)
#
# Permanent mount: UUID=56f60478-4db9-4b43-82f4-3c128cbdf158 /mnt/disks/extra-storage ext4 defaults,nofail 0 2
# (already in /etc/fstab after first setup)

set -e

DISK_MOUNT=/mnt/disks/extra-storage
VLLM_ENV="$DISK_MOUNT/envs/vllm-berylize"
HF_HOME_PATH="$DISK_MOUNT/huggingface"
PORT=8010
MODEL="Qwen/Qwen2.5-Coder-32B-Instruct-AWQ"

# 1. Mount extra-storage disk if not already mounted
if ! mountpoint -q "$DISK_MOUNT"; then
    echo "[berylize] Mounting extra-storage disk..."
    sudo mount /dev/nvme0n2 "$DISK_MOUNT"
fi

# 2. Activate venv
if [ ! -f "$VLLM_ENV/bin/activate" ]; then
    echo "[berylize] ERROR: vllm-berylize env not found at $VLLM_ENV"
    echo "  Run: python3 -m venv $VLLM_ENV && $VLLM_ENV/bin/pip install vllm"
    exit 1
fi

source "$VLLM_ENV/bin/activate"

# 3. Set env
export HF_HOME="$HF_HOME_PATH"
export TMPDIR="$DISK_MOUNT/tmp"
mkdir -p "$TMPDIR"

# 4. Start vLLM
echo "[berylize] Starting vLLM $MODEL on port $PORT"
echo "[berylize] VRAM budget: 23 GB L4 | AWQ INT4 ~18 GB | max-model-len 16384"

python3 -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --quantization awq \
  --port "$PORT" \
  --host 0.0.0.0 \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.90 \
  --trust-remote-code
