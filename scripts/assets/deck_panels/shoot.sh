#!/bin/bash
# shoot.sh <gear> <try>: puts <gear>/flat-<try>.png in as the gear's panel and takes the four cameras (1280x720)
. "$(dirname "$0")/paths.sh"
d=$1; i=$2; g=${d%%-*}
# the play as it is framed: never with the frame moved up for a template
v=$($D/served_line.sh); if [ "$v" != "0.72" ]; then echo "THE DEV SERVER SERVES judgeLineY $v: no shots taken"; exit 1; fi
python3 $D/tools.py place $g $S/$d/flat-$i.png
cd $R/client
for cam in SDVX LOW FLAT PLANE; do
  node $D/frame_shots.cjs 7K+1S $S/$d/shot-$i-$cam "{\"parts\":{\"note\":\"${NOTE:-$g}\",\"side\":\"bar\",\"deck\":\"$g\",\"hit\":\"${HIT:-$g}\"},\"cameraPreset\":\"$cam\"}" 9000 > $S/$d/shot-$i-$cam.log 2>&1 &
done
wait
grep -H "FAILED\|pageerror" $S/$d/shot-$i-*.log; ls $S/$d/shot-$i-*.png | wc -l
