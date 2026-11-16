"""The sky gear's place-holder: the picture the game showed as the panel in the frame the image model repainted
   (prompt_sky.py). This was typed on the command line when the panel was made, not kept as a file: the lines under the
   imports are those lines as they were run, with their folder named as the other scripts name it.
   python3 placeholder_sky.py     (then: tools.py place sky <work folder>/sky/placeholder.png)"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
W, H = 2048, 977
# a flat placeholder drawing of a sky: a blue fall and soft white banks of cloud, no display
y = np.linspace(0, 1, H)[:, None]
top, bot = np.array([34, 96, 186.0]), np.array([150, 205, 245.0])
a = (top * (1 - y) + bot * y)[:, None, :].repeat(W, 1) if False else np.repeat((top * (1 - y) + bot * y)[:, None, :], W, 1)
im = Image.fromarray(a.astype(np.uint8), 'RGB')
cl = Image.new('L', (W, H), 0); d = ImageDraw.Draw(cl)
rng = np.random.default_rng(7)
for cx, cy, r in [(260, 520, 210), (520, 640, 170), (900, 760, 230), (1280, 690, 190), (1650, 560, 230), (1900, 700, 180), (120, 820, 220), (700, 900, 260), (1450, 880, 250), (1050, 420, 120)]:
    for k in range(9):
        dx, dy, rr = rng.normal(0, r * 0.45), rng.normal(0, r * 0.18), r * rng.uniform(0.35, 0.7)
        d.ellipse([cx + dx - rr, cy + dy - rr * 0.7, cx + dx + rr, cy + dy + rr * 0.7], fill=255)
cl = cl.filter(ImageFilter.GaussianBlur(18))
im = Image.composite(Image.new('RGB', (W, H), (246, 250, 255)), im, cl.point(lambda v: int(v * 0.92)))
im.save(S + 'sky/placeholder.png'); print(im.size)
