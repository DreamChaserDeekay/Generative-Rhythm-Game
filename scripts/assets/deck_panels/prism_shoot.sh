#!/bin/bash
# prism_shoot.sh <try>: puts inputs/p3/flat-<try>.png in as the crystal gear's panel and takes the four cameras (1280x720)
. "$(dirname "$0")/paths.sh"
i=$1
python3 -c "
from PIL import Image
im = Image.open('$S/inputs/p3/flat-$i.png').convert('RGB'); assert im.size == (2048, 869), im.size
im.save('$R/client/public/media/panels/prism.webp', 'WEBP', quality=92, method=6)"
cd $R/client
for cam in SDVX LOW FLAT PLANE; do
  node $D/frame_shots.cjs 7K+1S $S/inputs/p3/shot-$i-$cam "{\"parts\":{\"note\":\"prism\",\"side\":\"bar\",\"deck\":\"prism\",\"hit\":\"prism\"},\"cameraPreset\":\"$cam\"}" 9000 > $S/inputs/p3/shot-$i-$cam.log 2>&1 &
done
wait
grep -L "nothing" $S/inputs/p3/shot-$i-*.log | xargs grep -H "FAILED\|pageerror" ; ls $S/inputs/p3/shot-$i-*.png | wc -l
