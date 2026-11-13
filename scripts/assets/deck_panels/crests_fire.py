"""Trial: the four members' crests for the FIRESTARTER gear's key caps, from the official crest picture: black chrome with the
   picture's own hot-pink edges, so that they read on a polished chrome cap. One strip of four square cells (RGBA).
   Run with python3 -I: python3 -I crests_fire.py <official crest picture> <out.png>"""
import sys
import numpy as np
from PIL import Image, ImageFilter
SRC, OUT = sys.argv[1:3]
CELL = 256
BOXES = ((50, 195, 315, 400), (335, 105, 510, 470), (545, 165, 780, 410), (800, 150, 1025, 425))   # Ahri, Akali, Evelynn, Kai'Sa

im = Image.open(SRC).convert('RGB')
strip = Image.new('RGBA', (4 * CELL, CELL), (0, 0, 0, 0))
for k, box in enumerate(BOXES):
    a = np.asarray(im.crop(box), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = a @ np.array([0.299, 0.587, 0.114])
    # the emblem: where the picture is bright (chrome) or hot pink (its edges), the dark ground left out
    pink = np.clip((r - np.maximum(g, 0) * 1.6 - 40) / 60, 0, 1) * np.clip((r - 110) / 60, 0, 1)
    alpha = np.clip(np.maximum((lum - 38) / 50, pink), 0, 1)
    # black chrome: the chrome's own shading kept faintly; the pink edges as they are
    dark = a * 0.2 + np.array([10, 4, 7], dtype=np.float32)
    hot = np.stack([np.clip(r * 1.15, 0, 255), g * 0.55, np.clip(b * 1.05, 0, 255)], -1)
    rgb = dark * (1 - pink[..., None]) + hot * pink[..., None]
    c = Image.fromarray(np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    bb = c.split()[3].point(lambda v: 255 if v > 60 else 0).getbbox()
    c = c.crop(bb)
    f = (CELL - 12) / max(c.size)
    c = c.resize((max(1, round(c.width * f)), max(1, round(c.height * f))), Image.LANCZOS)
    strip.alpha_composite(c, (k * CELL + (CELL - c.width) // 2, (CELL - c.height) // 2))
strip.save(OUT); print('crests', strip.size)
