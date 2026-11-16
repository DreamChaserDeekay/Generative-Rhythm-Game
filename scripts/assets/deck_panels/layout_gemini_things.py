"""Trial: the flat layout drawing for the Gemini gear's lower panel, the user's change to draft 3-A: the four marbles gone;
   the metal's colours lighter; a banana (the image model's nickname, "nano banana") near the near right corner. The spark,
   the wordmark and the crown as in draft 3 (layout_gemini_base.py); with a shift given, the three move left together (the
   marbles' place is empty now, so the logo can sit at the middle of what the corner stickers leave in view).
   Run with python3 -I: python3 -I layout_gemini_things.py <folder> [<shift left px>]"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
G, P = S + 'inputs/gemini/', S
name = sys.argv[1]; SHIFT = int(sys.argv[2]) if len(sys.argv) > 2 else 0
W, H = 2048, 876
TALL = 1.25
GOLD = (232, 178, 48)
FOUR = ((66, 133, 244), (234, 67, 53), (251, 188, 4), (52, 168, 83))
BLEND = ((158, 198, 248), (196, 186, 242), (248, 198, 220))      # lighter than draft 3's (118,168,238) (168,150,232) (242,170,200)
MID = 505
SPARK = {'size': 225, 'middle': (846 - SHIFT, MID)}
WORD = {'left': 1001 - SHIFT, 'right': 1815 - SHIFT}
LOCKUP = {'word': (518, 60, 1792, 380), 'g': (518, 60, 826, 380)}
BANANA = {'middle': (1650, 742), 'long': 300, 'tilt': -14}


def put(base, patch, centre, shade=0.3):
    x, y = round(centre[0] - patch.width / 2), round(centre[1] - patch.height / 2)
    if shade:
        a = patch.getchannel('A').point(lambda v: int(v * shade))
        sh = Image.new('RGBA', patch.size, (70, 60, 110, 0)); sh.putalpha(a)
        pad = Image.new('RGBA', (patch.width + 80, patch.height + 80), (0, 0, 0, 0)); pad.alpha_composite(sh, (40, 40))
        base.alpha_composite(pad.filter(ImageFilter.GaussianBlur(8)), (x - 40 + 5, y - 40 + 10))
    base.alpha_composite(patch, (x, y)); return [x, y, x + patch.width, y + patch.height]


def crown(wide):
    k = 4; w = wide * k; h = round(w * 0.66)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    band = h * 0.74; edge = (150, 106, 14, 255)
    pts = [(0, band)]
    for i in range(5):
        x = w * (i + 0.5) / 5; tip = h * (0.16 if i == 2 else 0.24 if i in (1, 3) else 0.3)
        pts += [(x, tip)]
        if i < 4: pts += [(w * (i + 1) / 5, band * 0.74)]
    pts += [(w, band), (w, h), (0, h)]
    d.polygon(pts, fill=GOLD + (255,), outline=edge)
    d.line(pts + [pts[0]], fill=edge, width=3 * k, joint='curve')
    d.rectangle([0, band, w - 1, h - 1], fill=(244, 196, 62, 255), outline=edge, width=3 * k)
    for i in range(5):
        x = w * (i + 0.5) / 5; tip = h * (0.16 if i == 2 else 0.24 if i in (1, 3) else 0.3); r = w * 0.036
        d.ellipse([x - r, tip - r * 1.6, x + r, tip + r * 0.4], fill=(250, 208, 80, 255), outline=edge, width=2 * k)
    for i, c in enumerate(FOUR):
        x = w * (i + 0.5) / 4; r = (h - band) * 0.28; y = (band + h) / 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,), outline=edge, width=2 * k)
    return im.resize((wide, h // k), Image.LANCZOS)


def banana(long):
    """A banana seen from above: a curved body thickest at its middle, a short stem at one end, a dark tip at the other."""
    k = 4; n = long * k; im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    R = n * 0.62; cx, cy = n / 2, n * 0.5 - R * 0.72
    a0, a1 = math.radians(48), math.radians(132)
    outer, inner = [], []
    for i in range(41):
        t = i / 40; a = a0 + (a1 - a0) * t; half = n * (0.018 + 0.075 * math.sin(math.pi * t) ** 0.7)
        px, py = cx + R * math.cos(a), cy + R * math.sin(a)
        outer.append((px + half * math.cos(a), py + half * math.sin(a))); inner.append((px - half * math.cos(a), py - half * math.sin(a)))
    d.polygon(outer + inner[::-1], fill=(252, 214, 58, 255), outline=(176, 136, 16, 255))
    d.line(outer + inner[::-1] + [outer[0]], fill=(176, 136, 16, 255), width=2 * k, joint='curve')
    mid = [((o[0] + i_[0]) / 2, (o[1] + i_[1]) / 2) for o, i_ in zip(outer, inner)]
    d.line(mid[4:37], fill=(238, 190, 40, 255), width=3 * k)
    for (x, y), r, c in ((mid[0], n * 0.022, (104, 78, 30, 255)), (mid[-1], n * 0.016, (70, 54, 24, 255))): d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    im = im.resize((long, long), Image.LANCZOS); return im.crop(im.getbbox())


t = np.linspace(0, 1, W)[None, :, None]
grad = np.where(t < 0.5, np.array(BLEND[0]) * (1 - t * 2) + np.array(BLEND[1]) * (t * 2), np.array(BLEND[1]) * (2 - t * 2) + np.array(BLEND[2]) * (t * 2 - 1))
slab = Image.fromarray(np.broadcast_to(grad, (H, W, 3)).astype(np.uint8), 'RGB').convert('RGBA'); parts = {}
spark = Image.open(G + 'commons-Google_Gemini_icon_2025.png').convert('RGBA').resize((SPARK['size'], SPARK['size']), Image.LANCZOS)
parts['spark'] = put(slab, spark, SPARK['middle'], 0.3)
logo = Image.open(G + 'commons-Google_Gemini_logo_2025.png').convert('RGBA')
word = logo.crop(LOCKUP['word']); k = (WORD['right'] - WORD['left']) / word.width
word = word.resize((WORD['right'] - WORD['left'], round(word.height * k * TALL)), Image.LANCZOS)
parts['word'] = put(slab, word, ((WORD['left'] + WORD['right']) / 2, MID), 0.3)
gw = (LOCKUP['g'][2] - LOCKUP['g'][0]) * k; gtop = parts['word'][1]
c = crown(round(gw * 1.02)); c = c.resize((c.width, round(c.height * TALL)), Image.LANCZOS).rotate(13, expand=True, resample=Image.BICUBIC)
parts['crown'] = put(slab, c, (WORD['left'] + gw * 0.40, gtop - c.height * 0.30), 0.35)
b = banana(BANANA['long']); b = b.resize((b.width, round(b.height * TALL)), Image.LANCZOS).rotate(BANANA['tilt'], expand=True, resample=Image.BICUBIC)
parts['banana'] = put(slab, b, BANANA['middle'], 0.35); parts['tall'] = TALL; parts['shift'] = SHIFT
os.makedirs(P + name, exist_ok=True)
slab.convert('RGB').save(P + name + '/layout.png'); json.dump(parts, open(P + name + '/parts.json', 'w'), indent=1)
slab.convert('RGB').resize((1366, 584), Image.LANCZOS).save(P + name + '/preview.jpg', quality=90)
print(name, 'layout made', {k_: parts[k_] for k_ in ('spark', 'word', 'banana')})
