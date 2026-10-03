#!/bin/bash
# Start the CRANE API (port 8000) WITH the NVIDIA/HF keys loaded from ~/.hermes/.env.
# Starting uvicorn without this makes deploy report "NGC_ENTERPRISE_KEY not set".
set -a; source ~/.hermes/.env; set +a
cd "$(dirname "$0")/../src/server"
exec ../../.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
