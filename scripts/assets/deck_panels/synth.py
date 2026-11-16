"""synth.py <folder> <frame>: a template frame without the game: <folder>/layout.png laid into the panel of an earlier
   template frame of the same gear (<frame>, 1920 x 1080, shot with the judge line at 43 %) by the gear's own homography
   (<folder>/calib.json) -> <folder>/tmpl-0.png and tmpl-crop.png. The game draws a panel's picture unlit, so this is what a
   shot of it would show.   Run with python3 -I."""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
folder, frame = sys.argv[1], sys.argv[2]
cal = json.load(open(S + folder + '/calib.json'))
Hm = np.array(cal['h']).reshape(3, 3); inv = np.linalg.inv(Hm); inv /= inv[2, 2]
base = Image.open(frame).convert('RGB'); lay = Image.open(S + folder + '/layout.png').convert('RGB')
assert base.size == tuple(cal['screen']) and lay.size == tuple(cal['picture'])
coeffs = inv.ravel()[:8].tolist()
warped = lay.transform(base.size, Image.PERSPECTIVE, coeffs, Image.BICUBIC)
mask = Image.new('L', lay.size, 255).transform(base.size, Image.PERSPECTIVE, coeffs, Image.BICUBIC)
out = Image.composite(warped, base, mask)
out.save(S + folder + '/tmpl-0.png'); out.crop((160, 180, 1760, 1080)).save(S + folder + '/tmpl-crop.png')
print('template made for', folder, '| panel pixels', int((np.asarray(mask) > 127).sum()))
