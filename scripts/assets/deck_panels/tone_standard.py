"""tone_standard.py <folder>:<try> <out folder> mean=<brightness> [field=<l>,<t>,<r>,<b>]
   A STANDARD try's bare metal brought to the gear's graphite. The image model paints "matte graphite" as a mid grey with a
   broad sheen, lighter than this gear's own plates; here the metal (what has little colour) is scaled so that its mean
   brightness is `mean`, while the cyan light and its glow (what has colour) keep their brightness.
   With field=: only that field of the try is used (the display's place in draft 1: <folder>/parts.json 'glass'), laid
   into the gear's present picture (<folder>/original.png), which is otherwise left exactly as it is (3 px inside the
   field's edge, feathered over 3 px). Nothing is generated.
   python3 tone_standard.py standard-a1:2 standard-b1 mean=62 field=525,28,1523,280     python3 tone_standard.py standard-a2:2 standard-b2 mean=58"""
import os, shutil, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
(src, n), out = sys.argv[1].split(':'), sys.argv[2]
OPT = dict(a.split('=', 1) for a in sys.argv[3:])
I = np.asarray(Image.open(S + f'{src}/flat-{n}.png').convert('RGB'), dtype=np.float32)
H, W = I.shape[:2]
step = lambda v, lo, hi: (lambda t: t * t * (3 - 2 * t))(np.clip((v - lo) / (hi - lo), 0, 1))
chroma = I.max(2) - I.min(2); lit = step(chroma, 16, 56)[..., None]             # 1 on the cyan light and its glow, 0 on bare metal
field = [int(v) for v in OPT['field'].split(',')] if 'field' in OPT else [0, 0, W, H]
l, t, r, b = field
part = I[t:b, l:r]; metal = (chroma[t:b, l:r] < 16)
was = float(part.mean(2)[metal].mean()); gain = float(OPT['mean']) / was
toned = I * (gain + (1 - gain) * lit)
if 'field' in OPT:
    base = np.asarray(Image.open(S + f'{src}/original.png').convert('RGB'), dtype=np.float32)
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).rounded_rectangle([l + 3, t + 3, r - 4, b - 4], radius=8, fill=255)
    m = np.asarray(m.filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32)[..., None] / 255
    o = base * (1 - m) + toned * m
    same = float(np.abs(o - base)[m[..., 0] == 0].max()) if (m[..., 0] == 0).any() else 0.0
else:
    o, same = toned, None
os.makedirs(S + out, exist_ok=True)
Image.fromarray(np.clip(np.rint(o), 0, 255).astype(np.uint8), 'RGB').save(S + out + '/flat-1.png')
for f in ('calib.json', 'layout.png', 'tmpl-crop.png'): shutil.copy(S + f'{src}/{f}', S + out + '/' + f)
print('written', out + '/flat-1.png', '| the metal\'s mean brightness %.0f -> %.0f (gain %.2f)' % (was, float(OPT['mean']), gain),
      '' if same is None else '| outside the field the picture differs from the present one by at most %.0f' % same)
