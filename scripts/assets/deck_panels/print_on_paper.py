"""print_on_paper.py <folder> <try> <picture> : a drawing printed on the paper of a flattened render, as it is: <folder>/flat-<try>.png
   is kept as flat-<try>-paper.png, and the picture (with its own clear ground) is laid into the box parts.json names
   ("pelican"), its colours under the render's own light (the render over the paper's own colour: the shafts of light, the
   shading and the grain run over the print as over the paper).   Run with python3 -I."""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
folder, n, picture = sys.argv[1:4]
IVORY = np.array([250, 249, 245], np.float32)
keep = S + f'{folder}/flat-{n}-paper.png'
if not os.path.exists(keep): os.replace(S + f'{folder}/flat-{n}.png', keep)
flat = np.asarray(Image.open(keep).convert('RGB'), dtype=np.float32)
l, t, r, b = json.load(open(S + f'{folder}/parts.json'))['pelican']
ink = np.asarray(Image.open(picture).convert('RGBA').resize((r - l, b - t), Image.LANCZOS), dtype=np.float32)
# the light on the paper there: read from the paper as rendered, before any lettering was printed on it (lettering is ink,
# not light: the print lies over it and must not take its colour)
plain = S + f'{folder}/flat-{n}-paper-plain.png'
lit = np.asarray(Image.open(plain).convert('RGB'), dtype=np.float32) if os.path.exists(plain) else flat
light = lit[t:b, l:r] / IVORY
a = ink[..., 3:] / 255
flat[t:b, l:r] = flat[t:b, l:r] * (1 - a) + np.clip(ink[..., :3] * light, 0, 255) * a
Image.fromarray(np.clip(np.rint(flat), 0, 255).astype(np.uint8), 'RGB').save(S + f'{folder}/flat-{n}.png')
print('printed onto', folder, n, 'at', (l, t, r, b), '| the light there: mean', np.round(light.mean((0, 1)), 3))
