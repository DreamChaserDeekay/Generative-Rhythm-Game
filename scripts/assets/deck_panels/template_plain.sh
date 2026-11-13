#!/bin/bash
# template_plain.sh <gear> <panel height> <folder>...: as template.sh, for a gear that has no corner stickers: the frame moved up
# (the judge line at 43 %): the calibration dots (into the first folder) and each folder's layout.png, one 1920x1080 frame each
. "$(dirname "$0")/paths.sh"
g=$1; H=$2; shift 2
P="{\"parts\":{\"note\":\"${NOTE:-$g}\",\"side\":\"bar\",\"deck\":\"$g\",\"hit\":\"${HIT:-$g}\"},\"cameraPreset\":\"SDVX\"}"
shot() { (cd $R/client && VIEW=1920x1080 HIDEHUD=1 node $D/frame_shots.cjs 7K+1S $1 "$P" 9000 > $1.log 2>&1); ls -la $1-0.png | cut -c24-; }
$D/set_line.sh 0.43 || exit 1
python3 $D/tools.py dots $g $H && shot $S/$1/calib
for d in "$@"; do python3 $D/tools.py place $g $S/$d/layout.png && shot $S/$d/tmpl; done
$D/set_line.sh 0.72
