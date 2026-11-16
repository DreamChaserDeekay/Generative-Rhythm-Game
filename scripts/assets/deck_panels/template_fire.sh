#!/bin/bash
# template_fire.sh <folder>...: the template frame of each folder's layout.png (the fire gear), the frame moved up (the judge line at 43 %)
. "$(dirname "$0")/paths.sh"
$D/set_line.sh 0.43 || exit 1
for d in "$@"; do
  python3 $D/tools.py place fire $S/$d/layout.png
  (cd $R/client && VIEW=1920x1080 HIDEHUD=1 node $D/frame_shots.cjs 7K+1S $S/$d/tmpl "{\"parts\":{\"note\":\"fire\",\"side\":\"bar\",\"deck\":\"fire\",\"hit\":\"fire\"},\"cameraPreset\":\"SDVX\"}" 9000 > $S/$d/tmpl.log 2>&1)
  ls -la $S/$d/tmpl-0.png | cut -c20-
done
$D/set_line.sh 0.72
