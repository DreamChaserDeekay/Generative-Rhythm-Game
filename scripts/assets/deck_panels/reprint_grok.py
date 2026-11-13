"""reprint_grok.py <folder> <try> <out folder> [rim=<px>] [dark=<0..1>]
   The GROK panel's two prints put back as they were drawn, and its ground brought down. The image model keeps the flat
   prints of the layout but paints them again in its own hand (the ball a flatter or a rounder white, the emblem duller,
   the rocket's flame over the ball): here
     - the panel's far edge (where a render paints the key caps' feet) is made the ground under it;
     - dark=: the bare metal and the shadows on it are brought down to that share of their brightness (the user: "the
       gear's ground may be a little darker"); what stands out of the metal by its colour or its brightness stays;
     - the render's emblem is taken out (the metal carried in) and the drawn one (<out or folder>/icon.png) laid there;
     - the drawn Bot (<out or folder>/bot.png: the ball and its eyes from the user's own picture) is laid over the render's
       ball, the render kept on it only where the flame and its sparks colour it and only within rim= px of the ball's rim
       (the ball's face stays clear; the two eyes are the drawn ones entirely).
   Nothing is generated.   python3 reprint_grok.py grok-e1 3 grok-f1 rim=150 dark=0.62   (needs scipy)"""
import os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
src, n, out = sys.argv[1:4]
OPT = dict(x.split('=') for x in sys.argv[4:])
RIM, DARK = float(OPT.get('rim', 150)), float(OPT.get('dark', 1.0))
layer = lambda name: np.asarray(Image.open(S + (f'{out}/{name}' if os.path.exists(S + f'{out}/{name}') else f'{src}/{name}')).convert('RGBA'), dtype=np.float32)
step = lambda v, lo, hi: (lambda t: t * t * (3 - 2 * t))(np.clip((v - lo) / (hi - lo), 0, 1))
I = np.asarray(Image.open(S + f'{src}/flat-{n}.png').convert('RGB'), dtype=np.float32)
H, W = I.shape[:2]
bot = layer('bot.png'); rgb, a = bot[..., :3], bot[..., 3:] / 255
icon = layer('icon.png'); irgb, ia = icon[..., :3], icon[..., 3:] / 255
o = I.copy()

# the metal's own brightness everywhere: the bare metal's, carried in under the things (near before far)
lum = o.mean(2); chroma = o.max(2) - o.min(2)
smooth = (np.abs(lum - ndimage.gaussian_filter(lum, 40)) < 10) & (lum < 150) & (chroma < 22) & (a[..., 0] < 0.02) & (ia[..., 0] < 0.02)
smooth = ndimage.binary_opening(smooth, iterations=3).astype(np.float32)
num, den, col = np.zeros_like(lum), np.zeros_like(lum), np.zeros_like(o)
for sigma, k in ((12, 1.0), (40, 0.03), (120, 1e-3), (360, 3e-5)):
    w = ndimage.gaussian_filter(smooth, sigma) * k; den += w
    num += ndimage.gaussian_filter(lum * smooth, sigma) * k
    col += np.stack([ndimage.gaussian_filter(o[..., c] * smooth, sigma) for c in range(3)], -1) * k
metal, metal_rgb = num / np.maximum(den, 1e-9), col / np.maximum(den, 1e-9)[..., None]

# the render's emblem out: where the picture is rust-coloured at the drawn emblem's place, the metal
near = ndimage.binary_dilation(ia[..., 0] > 0.02, iterations=30)
rust = ndimage.gaussian_filter(step((o[..., 0] - o[..., 2]) * near, 22, 48), 1.2)
rust = np.clip(ndimage.grey_dilation(rust, size=5), 0, 1)[..., None]
o = o * (1 - rust) + metal_rgb * rust

# the far edge: the ground just under it, carried up (after the render's emblem is out: its tip lies at that edge)
top = 22; fade = np.clip((np.arange(H) - top) / 10, 0, 1)[:, None, None]
ground = o.copy(); ground[:top + 10] = ndimage.gaussian_filter1d(o[top + 10: top + 14].mean(0), 6, axis=0)
o = ground * (1 - fade) + o * fade

# darker: the bare metal and the shadows on it; what stands out by its colour (the dog, the flame and its coloured light,
# the sparks) or by its brightness (the steel, the streaks) stays as it is
if DARK < 1:
    lum = o.mean(2)
    thing = np.maximum(step(o.max(2) - o.min(2), 22, 40), step(lum - metal, 25, 70))
    o = o * (DARK + (1 - DARK) * ndimage.gaussian_filter(thing, 1.5)[..., None])
    print('ground brought down to %.0f %%: mean of the bare metal %.0f -> %.0f' % (DARK * 100, lum[smooth > 0.5].mean(), o.mean(2)[smooth > 0.5].mean()))

# the drawn emblem
o = o * (1 - ia) + irgb * ia

# the drawn Bot: over the render's ball; the render stays on it where the flame colours it (the ball's plain white has a
# chroma of about 8), near the rim only, never on the eyes or close round them, never where the render is dark
flame = ndimage.gaussian_filter(step(ndimage.gaussian_filter(I.max(2) - I.min(2), 3.0), 12, 26), 7.0)
eyes = ndimage.binary_dilation((rgb.mean(2) < 60) & (a[..., 0] > 0.5), iterations=3)
flame = flame * (1 - ndimage.gaussian_filter(eyes.astype(np.float32), 4.0)) * step(ndimage.gaussian_filter(I.mean(2), 2.0), 110, 150)
inside = ndimage.distance_transform_edt(a[..., 0] > 0.5)
flame = (np.clip(flame * step(RIM - inside, 0, RIM * 0.7), 0, 1) if RIM > 0 else np.zeros_like(flame))[..., None]   # rim=0: the drawn print everywhere
o = o * (1 - a) + (rgb * (1 - flame) + I * flame) * a

os.makedirs(S + out, exist_ok=True)
Image.fromarray(np.clip(np.rint(o), 0, 255).astype(np.uint8), 'RGB').save(S + out + '/flat-1.png')
shutil.copy(S + f'{src}/calib.json', S + out + '/calib.json')
ball = a[..., 0] > 0.5
print('written', out + '/flat-1.png', '| of the ball: %.0f %% the drawn print, %.0f %% the flame kept' % ((flame[..., 0][ball] < 0.1).mean() * 100, (flame[..., 0][ball] > 0.5).mean() * 100),
      '| emblem: mean colour', o[ia[..., 0] > 0.9].mean(0).round().tolist())
