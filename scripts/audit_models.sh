#!/usr/bin/env bash
# Read-only audit of GPU, disks, model files and model servers. Changes nothing.
set -u
hr() { printf '\n===== %s =====\n' "$1"; }

hr "GPU"
nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version --format=csv 2>&1 | head -5

hr "DISKS (is the 500GB berylize-extra-storage mounted?)"
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT 2>&1
df -h -x tmpfs -x devtmpfs 2>&1

hr "MODEL SERVERS / RUNTIMES"
for c in ollama vllm llama-server llama-cli text-generation-launcher docker cloudflared python3; do
  printf '%-26s %s\n' "$c" "$(command -v $c || echo '-')"
done
echo; echo "listening ports:"; ss -ltnp 2>/dev/null | awk 'NR==1 || /LISTEN/' | head -20
echo; echo "ollama models:"; (ollama list 2>&1 | head -30) || true
echo; echo "docker images:"; (docker images 2>&1 | head -20) || true
echo; echo "python packages:"; pip list 2>/dev/null | grep -iE '^(vllm|transformers|torch|llama.cpp|llama-cpp-python|huggingface.hub|accelerate|bitsandbytes|peft|auto-gptq|autoawq|optimum|sentence-transformers) ' || true

hr "HUGGING FACE CACHES"
for d in "$HOME/.cache/huggingface" /root/.cache/huggingface /home/*/.cache/huggingface /mnt/*/huggingface /mnt/*/.cache/huggingface; do
  [ -d "$d" ] && { echo "--- $d"; du -sh "$d" 2>/dev/null; ls -1 "$d/hub" 2>/dev/null | grep '^models--' | sed 's/models--//; s/--/\//g'; }
done

hr "MODEL FILES > 100MB (gguf, safetensors, bin, pt, pth, onnx, ckpt)"
SEARCH="/ /mnt /home /root /opt /srv /data"
sudo -n true 2>/dev/null && SUDO=sudo || SUDO=
$SUDO find $SEARCH -xdev \( -path /proc -o -path /sys -o -path /dev -o -path /usr/lib -o -path /usr/share -o -path /snap \) -prune -o \
  -type f -size +100M \( -iname '*.gguf' -o -iname '*.safetensors' -o -iname '*.bin' -o -iname '*.pt' -o -iname '*.pth' -o -iname '*.onnx' -o -iname '*.ckpt' \) \
  -printf '%s\t%p\n' 2>/dev/null | sort -rn | head -60 | awk -F'\t' '{printf "%8.2f GB  %s\n",$1/1073741824,$2}'
# also check any other mounted disks (find -xdev skips them)
for m in $(lsblk -nrpo MOUNTPOINT 2>/dev/null | grep -vE '^$|^/$|^/boot|^/snap|\[SWAP\]'); do
  $SUDO find "$m" -type f -size +100M \( -iname '*.gguf' -o -iname '*.safetensors' -o -iname '*.bin' -o -iname '*.pt' -o -iname '*.pth' -o -iname '*.onnx' -o -iname '*.ckpt' \) \
    -printf '%s\t%p\n' 2>/dev/null | sort -rn | head -60 | awk -F'\t' '{printf "%8.2f GB  %s\n",$1/1073741824,$2}'
done

hr "DONE"
