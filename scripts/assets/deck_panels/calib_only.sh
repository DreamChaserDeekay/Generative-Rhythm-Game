#!/bin/bash
# calib_only.sh <gear> <panel height> <folder>: only the calibration dots' frame (the judge line at 43 %), into <folder>.
# The dots' colour comes from DOTS (DOTS=green for a gear that has pink or red of its own).
. "$(dirname "$0")/paths.sh"
g=$1; H=$2; d=$3
P="{\"parts\":{\"note\":\"${NOTE:-$g}\",\"side\":\"bar\",\"deck\":\"$g\",\"hit\":\"${HIT:-$g}\"},\"cameraPreset\":\"SDVX\"}"
$D/set_line.sh 0.43 || exit 1
python3 $D/tools.py dots $g $H && (cd $R/client && VIEW=1920x1080 HIDEHUD=1 node $D/frame_shots.cjs 7K+1S $S/$d/calib "$P" 9000 > $S/$d/calib.log 2>&1); ls -la $S/$d/calib-0.png | cut -c24-
$D/set_line.sh 0.72
