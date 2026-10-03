#!/usr/bin/env bash
# connect_berylize.sh — re-attach tunnels + start vLLM after any reconnect
set -euo pipefail

NODE="berylize-node"
ZONE="us-east1-c"
PROJECT="posh-eden"

echo "→ Killing stale tunnels on 8010 / 8013..."
pkill -f "L 8010:localhost:8010" 2>/dev/null || true
pkill -f "L 8013:localhost:8013" 2>/dev/null || true
sleep 1

echo "→ Opening SSH tunnels..."
gcloud compute ssh "$NODE" --zone="$ZONE" --project="$PROJECT" -- -L 8010:localhost:8010 -L 8013:localhost:8013 -N -f
echo "✓ Tunnels up (8010 + 8013)"

echo "→ Checking vLLM..."
if curl -s --max-time 3 http://localhost:8010/v1/models | grep -q "id"; then
    echo "✓ Berylize already serving on 8010"
else
    echo "→ Starting vLLM service..."
    gcloud compute ssh "$NODE" --zone="$ZONE" --project="$PROJECT" \
      --command="sudo systemctl start berylize-vllm && echo 'vLLM started'"
    echo "  Loading shards (~11 min). Tail: gcloud compute ssh $NODE --zone=$ZONE --project=$PROJECT --command='sudo journalctl -fu berylize-vllm'"
fi

echo "→ Checking speaches TTS..."
if curl -s --max-time 3 http://localhost:8013/health | grep -q "OK"; then
    echo "✓ Speaches healthy on 8013"
else
    echo "→ Starting elana-voice container..."
    gcloud compute ssh "$NODE" --zone="$ZONE" --project="$PROJECT" --command='
        sudo podman start elana-voice 2>/dev/null || \
        sudo podman run -d --name elana-voice -p 127.0.0.1:8013:8000 \
          -e UVICORN_HOST=0.0.0.0 -e UVICORN_PORT=8000 \
          -e WHISPER__TTL=-1 -e DO_NOT_TRACK=1 \
          ghcr.io/speaches-ai/speaches:latest-cuda && \
        sleep 3 && \
        curl -s -X POST http://localhost:8013/v1/models/speaches-ai%2FKokoro-82M-v1.0-ONNX-int8'
    echo "✓ Speaches started + Kokoro loaded"
fi

echo ""
echo "Done. Port status:"
curl -s --max-time 3 http://localhost:8010/v1/models | python3 -c "import sys,json; d=json.load(sys.stdin); print('  8010:', d['data'][0]['id'])" 2>/dev/null || echo "  8010: still loading"
curl -s --max-time 3 http://localhost:8013/health 2>/dev/null && echo "  8013: speaches OK" || echo "  8013: not ready"
