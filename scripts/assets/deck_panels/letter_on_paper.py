"""letter_on_paper.py <folder> <try> <lettering> <middle x> <middle y> <width> [<strength> [<tall> [<ink rrggbb>]]]: hand lettering (black on white)
   printed on the paper of a flattened render UNDER what already lies or is painted on it: it is laid only where the render
   shows bare paper (bright, hardly coloured), so painted strokes, clay objects and ink stay over it; shadows fall over it as
   over the paper. The render's paper (<folder>/flat-<try>-paper.png) is kept as flat-<try>-paper-plain.png; the pelican
   is printed after this (print_on_paper.py), so it lies over the lettering too.   Run with python3 -I."""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
folder, n, lettering = sys.argv[1:4]
mx, my, wide = float(sys.argv[4]), float(sys.argv[5]), int(sys.argv[6])
strength = float(sys.argv[7]) if len(sys.argv) > 7 else 0.55
tall = float(sys.argv[8]) if len(sys.argv) > 8 else 1.25
#: the ink's colour: clay unless another is given
CLAY = np.array([int(sys.argv[9][i:i + 2], 16) for i in (0, 2, 4)] if len(sys.argv) > 9 else [217, 119, 87], np.float32) / 255
p = S + f'{folder}/flat-{n}-paper.png'; plain = S + f'{folder}/flat-{n}-paper-plain.png'
if not os.path.exists(plain): os.replace(p, plain)
paper = np.asarray(Image.open(plain).convert('RGB'), dtype=np.float32)
# the lettering's ink, cut to its box, at its place (drawn `tall` times deeper, as the other flat things)
ink = 1 - np.asarray(Image.open(lettering).convert('L'), dtype=np.float32) / 255
ys, xs = np.nonzero(ink > 0.25)
ink = Image.fromarray((np.clip(ink[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 1.1, 0, 1) * 255).astype(np.uint8), 'L')
high = round(wide * ink.height / ink.width * tall)
ink = np.asarray(ink.resize((wide, high), Image.LANCZOS), dtype=np.float32) / 255
l, t = round(mx - wide / 2), round(my - high / 2)
layer = np.zeros(paper.shape[:2], np.float32)
y0, y1, x0, x1 = max(t, 0), min(t + high, paper.shape[0]), max(l, 0), min(l + wide, paper.shape[1])
layer[y0:y1, x0:x1] = ink[y0 - t:y1 - t, x0 - l:x1 - l]
# bare paper: bright and hardly coloured (paint, clay and ink are not)
hi, lo = paper.max(2), paper.min(2)
sat = (hi - lo) / np.maximum(hi, 1)
bare = np.clip((0.34 - sat) / 0.14, 0, 1) * np.clip((hi - 95) / 50, 0, 1)
bare = np.asarray(Image.fromarray((bare * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255
s = (layer * strength * bare)[..., None]
out = paper * (1 - s * (1 - CLAY))
Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), 'RGB').save(p)
print('lettered', folder, n, 'box', (l, t, l + wide, t + high), 'strength', strength, '| share of the lettering on bare paper %.2f' % float((layer * bare).sum() / max(layer.sum(), 1)))
