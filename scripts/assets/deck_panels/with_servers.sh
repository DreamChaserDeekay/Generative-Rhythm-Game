#!/bin/bash
# with_servers.sh <command...>: the game's API server and the dev server up for as long as the command runs (each started
# only if it is not up already, and then stopped again when the command ends)
. "$(dirname "$0")/paths.sh"
PIDS=""
trap 'for p in $PIDS; do kill $p 2>/dev/null; done; wait 2>/dev/null' EXIT
if ! curl -s -m 2 -o /dev/null http://127.0.0.1:8798/api/songs; then
  (cd $R/client && PYTHONPATH=../server exec ../server/.venv/bin/python -m rhythm_server --port 8798 --data $S/inputs/data2 > $S/inputs/api.log 2>&1) &
  PIDS="$PIDS $!"
fi
if ! curl -s -m 2 -o /dev/null http://127.0.0.1:5198/; then
  (cd $R/client && CHOKIDAR_USEPOLLING=1 CHOKIDAR_INTERVAL=300 GRG_SERVER_URL=http://127.0.0.1:8798 exec npx vite --port 5198 --strictPort > $S/inputs/vite.log 2>&1) &
  PIDS="$PIDS $!"
fi
for i in $(seq 1 80); do curl -s -m 2 -o /dev/null http://127.0.0.1:8798/api/songs && curl -s -m 2 -o /dev/null http://127.0.0.1:5198/ && break; python3 -c "import time; time.sleep(0.5)"; done
curl -s -m 2 -o /dev/null http://127.0.0.1:8798/api/songs || { echo "THE API SERVER DID NOT COME UP"; exit 1; }
curl -s -m 2 -o /dev/null http://127.0.0.1:5198/ || { echo "THE DEV SERVER DID NOT COME UP"; exit 1; }
"$@"
