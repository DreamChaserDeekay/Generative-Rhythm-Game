#!/bin/bash
# stickers.sh <gear> off|on: the build's stage pictures of a gear out of, or back in, the list the game reads (written in
# place; the list taken out is kept in the work folder, not in the repository)
. "$(dirname "$0")/paths.sh"
python3 - "$1" "$2" "$R" "$S" <<'PY'
import json, sys
gear, to, R, S = sys.argv[1:5]
p = R + '/client/public/stage/index.json'
keep = S + '/stage-kept-' + gear + '.json'
d = json.load(open(p))
if to == 'off':
    if d.get(gear): json.dump(d[gear], open(keep, 'w')); d[gear] = []
else:
    d[gear] = json.load(open(keep))
s = json.dumps(d, indent=1)
with open(p, 'r+') as f: f.seek(0); f.write(s); f.truncate()
print(gear, 'stickers', to, d[gear])
PY
