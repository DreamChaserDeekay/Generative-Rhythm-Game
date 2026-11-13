"""dim_edge.py <folder>:<try> <out folder> <right px> <down px>
   A flattened render's pale band along its left edge taken out (a render now and then lights the side rail's inner wall and
   paints it into the panel): left of <right px> and above <down px> the picture becomes the dark ground beside it (each
   row's own, from the columns just right of the band), fading back to the picture over 26 px to the right and 40 px down.
   Nothing is generated.   python3 dim_edge.py wire-a2:1 wire-b2 96 470   (needs scipy)"""
import os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
(src, n), out, right, down = sys.argv[1].split(':'), sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
I = np.asarray(Image.open(S + f'{src}/flat-{n}.png').convert('RGB'), dtype=np.float32)
H, W = I.shape[:2]
ground = ndimage.gaussian_filter1d(np.median(I[:, right + 4: right + 64], axis=1), 12, axis=0)          # each row's dark ground
step = lambda v, lo, hi: (lambda t: t * t * (3 - 2 * t))(np.clip((v - lo) / (hi - lo), 0, 1))
Y, X = np.mgrid[0:H, 0:W]
m = (step(right - X, 0, 26) * step(down - Y, 0, 40))[..., None]
o = I * (1 - m) + ground[:, None, :] * m
os.makedirs(S + out, exist_ok=True)
Image.fromarray(np.clip(np.rint(o), 0, 255).astype(np.uint8), 'RGB').save(S + out + '/flat-1.png')
for f in ('calib.json', 'layout.png', 'tmpl-crop.png'): shutil.copy(S + f'{src}/{f}', S + out + '/' + f)
band = I[: down - 40, : right - 26].mean(); print('written', out + '/flat-1.png', '| the band\'s mean brightness %.1f -> %.1f' % (band, o[: down - 40, : right - 26].mean()))
