#!/bin/bash
# with_api.sh <command...>: the game's API server (the screenshots' data) up for as long as the command runs, and no longer
. "$(dirname "$0")/paths.sh"
if curl -s -m 2 -o /dev/null http://127.0.0.1:8798/api/songs; then exec "$@"; fi
(cd $R/client && PYTHONPATH=../server exec ../server/.venv/bin/python -m rhythm_server --port 8798 --data $S/inputs/data2 > $S/inputs/api.log 2>&1) &
API=$!
trap 'kill $API 2>/dev/null; wait $API 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -s -m 2 -o /dev/null http://127.0.0.1:8798/api/songs && break; python3 -c "import time; time.sleep(0.5)"; done
curl -s -m 2 -o /dev/null http://127.0.0.1:8798/api/songs || { echo "THE API SERVER DID NOT COME UP"; exit 1; }
"$@"
