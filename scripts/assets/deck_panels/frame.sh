#!/bin/bash
# frame.sh <gear> <out prefix>: one 1920x1080 frame of the gear on the SDVX camera, the HUD hidden, the frame moved up (the judge line at 43 %)
. "$(dirname "$0")/paths.sh"
$D/set_line.sh 0.43 || exit 1
(cd $R/client && VIEW=1920x1080 HIDEHUD=1 node $D/frame_shots.cjs 7K+1S $2 "{\"parts\":{\"note\":\"$1\",\"side\":\"bar\",\"deck\":\"$1\",\"hit\":\"$1\"},\"cameraPreset\":\"SDVX\"}" 9000)
$D/set_line.sh 0.72 || exit 1
