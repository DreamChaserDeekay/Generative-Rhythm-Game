"""Trial: the flat layouts for the STANDARD gear's lower panel (the house skin, 기본; it has no reference picture; the user:
   "1, 2 뽑아봐": drafts 1 and 2 of the ideas):
     standard-a1  the panel as it is now (the game's own picture, client/public/media/panels/standard.webp, made 2048 x 876),
                  with only its display's glass painted over as a place-holder: a plain graphite plate with a slim cyan
                  light strip at its middle (the numbers are written beside the gear now, so the display stays empty).
                  The image model is to build that plate and leave the rest; afterwards only the plate's field is taken
                  from its render and the rest of the panel stays the picture it is (p6/window-standard.py).
     standard-a2  a plain slab of matte graphite with nothing on it but one slim cyan light strip near its near edge.
   Run with python3 -I: python3 -I layout_standard.py"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S, R
P = S
W, H = 2048, 876
K = 2
CYAN = (57, 212, 255)
STRIP1 = {'half': 250, 'thick': 12}                # draft 1: the strip at the plate's middle
STRIP2 = {'from': 614, 'to': 1434, 'y': 770, 'thick': 12}

# --- draft 1: the panel as it is, its display's glass a plain plate ---
now = Image.open(R + 'client/public/media/panels/standard.webp').convert('RGB').resize((W, H), Image.LANCZOS)
a = np.asarray(now, dtype=np.float32)
lum = a.mean(2)                                      # the glass: from the place the game's table gives it (deckPanels.json), outward to its frame's bright inner edge
seed = json.load(open(R + 'client/src/render/deckPanels.json'))['standard']['glass']
l, t, r, b = round(seed[0] * W), round(seed[1] * H), round(seed[2] * W), round(seed[3] * H)
edge = 60
while l > 0 and np.median(lum[t + 40: b - 40, l - 1]) < edge: l -= 1
while r < W and np.median(lum[t + 40: b - 40, r]) < edge: r += 1
while t > 0 and np.median(lum[t - 1, l + 80: r - 80]) < edge: t -= 1
while b < H and np.median(lum[b, l + 80: r - 80]) < edge: b += 1
print('the glass now: x %d..%d, y %d..%d (of %d x %d)' % (l, r, t, b, W, H))
plate = now.convert('RGBA')
yy = np.linspace(0, 1, b - t, dtype=np.float32)[:, None, None]
g = np.array([60, 63, 72], np.float32) + (np.array([44, 46, 54], np.float32) - np.array([60, 63, 72], np.float32)) * yy
plate.paste(Image.fromarray(np.broadcast_to(g, (b - t, r - l, 3)).astype(np.uint8), 'RGB'), (l, t))
d = ImageDraw.Draw(plate)
d.rectangle([l, t, r - 1, t + 2], fill=(92, 96, 108, 255))                                   # the plate's far edge, catching the light
cx, cy = (l + r) // 2, (t + b) // 2
glow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(glow).rounded_rectangle([cx - STRIP1['half'] - 14, cy - 22, cx + STRIP1['half'] + 14, cy + 22], radius=22, fill=CYAN + (120,))
clip = Image.new('L', (W, H), 0); ImageDraw.Draw(clip).rectangle([l, t, r - 1, b - 1], fill=255)
plate.paste(Image.alpha_composite(plate, glow.filter(ImageFilter.GaussianBlur(16))), (0, 0), clip)
ImageDraw.Draw(plate).rounded_rectangle([cx - STRIP1['half'], cy - STRIP1['thick'] // 2, cx + STRIP1['half'], cy + STRIP1['thick'] // 2], radius=STRIP1['thick'] // 2, fill=(190, 242, 255, 255))
os.makedirs(P + 'standard-a1', exist_ok=True)
plate.convert('RGB').save(P + 'standard-a1/layout.png'); now.save(P + 'standard-a1/original.png')
json.dump({'glass': [l, t, r, b], 'strip': {'middle': [cx, cy], **STRIP1}}, open(P + 'standard-a1/parts.json', 'w'), indent=1)

# --- draft 2: the plain slab ---
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
g = np.array([56, 59, 67], np.float32) + (np.array([36, 38, 45], np.float32) - np.array([56, 59, 67], np.float32)) * (yy / H)[..., None]
slab = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
d = ImageDraw.Draw(slab); d.rectangle([0, 0, W, 4], fill=(96, 100, 112, 255))
s = STRIP2
glow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(glow).rounded_rectangle([s['from'] - 20, s['y'] - 30, s['to'] + 20, s['y'] + 30], radius=30, fill=CYAN + (120,))
slab.alpha_composite(glow.filter(ImageFilter.GaussianBlur(22)))
ImageDraw.Draw(slab).rounded_rectangle([s['from'], s['y'] - s['thick'] // 2, s['to'], s['y'] + s['thick'] // 2], radius=s['thick'] // 2, fill=(190, 242, 255, 255))
os.makedirs(P + 'standard-a2', exist_ok=True)
slab.convert('RGB').save(P + 'standard-a2/layout.png')
json.dump({'strip': STRIP2}, open(P + 'standard-a2/parts.json', 'w'), indent=1)
sheet = Image.new('RGB', (W, 2 * H + 10), (90, 90, 90)); sheet.paste(plate.convert('RGB'), (0, 0)); sheet.paste(slab.convert('RGB'), (0, H + 10))
sheet.resize((1280, round(sheet.height * 1280 / W)), Image.LANCZOS).save(P + 'standard-a-layouts.jpg', quality=92); print('layouts made')
