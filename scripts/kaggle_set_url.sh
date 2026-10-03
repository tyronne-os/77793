#!/usr/bin/env bash
# Usage: kaggle_set_url.sh https://xxxx.trycloudflare.com
# Points the "kaggle" provider in opencode.jsonc at the new tunnel URL and verifies it.
set -euo pipefail
URL="${1:?usage: kaggle_set_url.sh https://xxxx.trycloudflare.com}"
URL="${URL%/}"
[[ "$URL" =~ ^https://[a-z0-9-]+\.trycloudflare\.com$ ]] || { echo "Not a trycloudflare URL: $URL"; exit 1; }
CFG="$HOME/.config/opencode/opencode.jsonc"
python3 - "$CFG" "$URL" <<'PY'
import re, sys
p, url = sys.argv[1], sys.argv[2]
s = open(p).read()
s2, n = re.subn(r'https://[a-z0-9-]+\.trycloudflare\.com/v1', url + '/v1', s)
assert n == 1, f"expected exactly 1 kaggle baseURL, found {n}"
open(p, 'w').write(s2)
PY
echo "Updated opencode.jsonc -> $URL/v1"
curl -s -m 20 "$URL/api/tags" | python3 -c "import sys,json;print('Models up:', [m['name'] for m in json.load(sys.stdin)['models']])"
