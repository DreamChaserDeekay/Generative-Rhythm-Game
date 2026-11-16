#!/bin/bash
# set_line.sh <value>: the config's common judge line height, written in place (the file keeps its inode, so the dev
# server's watcher sees the change), and waited for until the dev server serves it
. "$(dirname "$0")/paths.sh"
python3 - "$1" "$R" <<'PY'
import re, sys
p = sys.argv[2] + '/config/camera.json'
s = open(p, encoding='utf-8').read()
t, n = re.subn(r'("trackLength": [0-9.]+,\s*"judgeLineY": )[0-9.]+', lambda m: m.group(1) + sys.argv[1], s)
assert n == 1
with open(p, 'r+', encoding='utf-8') as f:
    f.seek(0); f.write(t); f.truncate()
PY
for i in $(seq 1 20); do
  v=$($D/served_line.sh)
  if [ "$v" = "$1" ]; then echo "served judgeLineY $v"; exit 0; fi
  python3 -c "import time; time.sleep(1)"
done
echo "THE DEV SERVER STILL SERVES judgeLineY $v, NOT $1"; exit 1
