#!/usr/bin/env bash
# kaggle_ops.sh {push|status|url|sync}   — drive the Kaggle GPU notebook with the API token only
#   push   upload the notebook as a new version (Kaggle auto-runs it as a batch session)
#   status kernel run status
#   url    scrape the tunnel URL from the run log
#   sync   url + point opencode.jsonc at it
set -euo pipefail
USER_NAME=tjjacques; SLUG=crane-ollama-server
NB="$(dirname "$0")/kaggle_ollama_server.ipynb"
TOK="$(cat "$HOME/.kaggle/access_token")"
API=https://www.kaggle.com/api/v1
auth=(-H "Authorization: Bearer $TOK")

case "${1:-status}" in
  push)
    python3 - "$NB" "$TOK" <<'PY'
import json, sys, urllib.request
nb, tok = sys.argv[1], sys.argv[2]
body = {"slug":"tjjacques/crane-ollama-server","newTitle":"CRANE Ollama Server","text":open(nb).read(),"language":"python",
        "kernelType":"notebook","isPrivate":True,"enableGpu":True,"enableInternet":True}
req = urllib.request.Request("https://www.kaggle.com/api/v1/kernels/push", json.dumps(body).encode(),
      {"Authorization":f"Bearer {tok}","Content-Type":"application/json"}, method="POST")
d = json.load(urllib.request.urlopen(req)); print("pushed version", d.get("versionNumber"), d.get("error",""))
PY
    ;;
  status)
    curl -s "${auth[@]}" "$API/kernels/status?userName=$USER_NAME&kernelSlug=$SLUG"; echo ;;
  url)
    curl -s "${auth[@]}" "$API/kernels/output?userName=$USER_NAME&kernelSlug=$SLUG" \
      | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 ;;
  sync)
    U="$("$0" url)"; [[ -n "$U" ]] || { echo "no tunnel URL in log yet"; exit 1; }
    bash "$(dirname "$0")/kaggle_set_url.sh" "$U" ;;
  *) echo "usage: $0 {push|status|url|sync}"; exit 1 ;;
esac
