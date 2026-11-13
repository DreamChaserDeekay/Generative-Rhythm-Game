"""Trial: the flat layout drawing for the Gemini gear's lower panel, the user's change of mind: instead of the word 젬황, the
   Gemini logo itself with a crown on its G (the same thought: Gemini the king), the logo and the crown as solid things. On
   a white slab, from left to right: Google's four dots rolling in, the four-colour spark, the wordmark Gemini with a gold
   crown on the G. The spark and the wordmark are the official 2025 logo's own shapes (inputs/ai/dl); the wordmark and the crown are
   drawn TALL times deeper, the spark and the dots are not. Everything lies between x 450 and x 1815: this gear's corner
   stickers are wide, and on the flat cameras they hide what lies outside that (the first draft's last letter was hidden).
   Run with python3 -I: python3 -I layout_gemini_base.py [<folder>]"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
G, P = S + 'inputs/gemini/', S
name = sys.argv[1] if len(sys.argv) > 1 else 'gemini-d1'
W, H = 2048, 876
TALL = 1.25
WHITE, INK, GOLD = (248, 249, 250), (24, 24, 26), (232, 178, 48)
#: the slab's colours from its left edge to its right (the user's direction: blue, violet, pink, as the gradient of the
#: logo picture the user sent, on smooth metal)
BLEND = ((118, 168, 238), (168, 150, 232), (242, 170, 200))
FOUR = ((66, 133, 244), (234, 67, 53), (251, 188, 4), (52, 168, 83))
MID = 505                                                        # the logo's middle line (the crown needs room above it)
DOTS = {'size': 60, 'at': ((480, MID + 24), (552, MID - 30), (624, MID + 12), (696, MID - 18))}
SPARK = {'size': 225, 'middle': (846, MID)}
WORD = {'left': 1001, 'right': 1815}                              # the wordmark's span
LOCKUP = {'word': (518, 60, 1792, 380), 'g': (518, 60, 826, 380)}   # in the official logo's picture (1773 x 400): the wordmark, its G


def put(base, patch, centre, shade=0.3):
    x, y = round(centre[0] - patch.width / 2), round(centre[1] - patch.height / 2)
    if shade:
        a = patch.getchannel('A').point(lambda v: int(v * shade))
        sh = Image.new('RGBA', patch.size, (60, 70, 90, 0)); sh.putalpha(a)
        pad = Image.new('RGBA', (patch.width + 80, patch.height + 80), (0, 0, 0, 0)); pad.alpha_composite(sh, (40, 40))
        base.alpha_composite(pad.filter(ImageFilter.GaussianBlur(10)), (x - 40 + 6, y - 40 + 12))
    base.alpha_composite(patch, (x, y)); return [x, y, x + patch.width, y + patch.height]


def dot(size, colour):
    k = 4; n = size * k; yy, xx = np.mgrid[0:n, 0:n].astype(np.float32); c = n / 2
    r = np.hypot(xx - c, yy - c); inside = r < c - 1
    lit = np.clip(1 - np.hypot(xx - c * 0.7, yy - c * 0.62) / (c * 1.25), 0, 1) ** 1.6
    out = np.zeros((n, n, 4), np.float32)
    for ch in range(3): out[..., ch] = colour[ch] * (0.82 + 0.18 * lit) + 255 * 0.42 * lit ** 3
    out[..., 3] = inside * 255
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS)


def crown(wide):
    """A crown seen from the front: a band set with four gems, five points each with a ball on it."""
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


t = np.linspace(0, 1, W)[None, :, None]
grad = np.where(t < 0.5, np.array(BLEND[0]) * (1 - t * 2) + np.array(BLEND[1]) * (t * 2), np.array(BLEND[1]) * (2 - t * 2) + np.array(BLEND[2]) * (t * 2 - 1))
slab = Image.fromarray(np.broadcast_to(grad, (H, W, 3)).astype(np.uint8), 'RGB').convert('RGBA'); parts = {}
parts['dots'] = [put(slab, dot(DOTS['size'], c), at, 0.35) for c, at in zip(FOUR, DOTS['at'])]
spark = Image.open(G + 'commons-Google_Gemini_icon_2025.png').convert('RGBA').resize((SPARK['size'], SPARK['size']), Image.LANCZOS)
parts['spark'] = put(slab, spark, SPARK['middle'], 0.3)
logo = Image.open(G + 'commons-Google_Gemini_logo_2025.png').convert('RGBA')
word = logo.crop(LOCKUP['word']); k = (WORD['right'] - WORD['left']) / word.width
word = word.resize((WORD['right'] - WORD['left'], round(word.height * k * TALL)), Image.LANCZOS)
parts['word'] = put(slab, word, ((WORD['left'] + WORD['right']) / 2, MID), 0.3)
# the crown: on the G's top, a little to the left of its middle, tilted
gw = (LOCKUP['g'][2] - LOCKUP['g'][0]) * k; gtop = parts['word'][1]
c = crown(round(gw * 1.02)); c = c.resize((c.width, round(c.height * TALL)), Image.LANCZOS).rotate(13, expand=True, resample=Image.BICUBIC)
parts['crown'] = put(slab, c, (WORD['left'] + gw * 0.40, gtop - c.height * 0.30), 0.35); parts['tall'] = TALL
os.makedirs(P + name, exist_ok=True)
slab.convert('RGB').save(P + name + '/layout.png'); json.dump(parts, open(P + name + '/parts.json', 'w'), indent=1)
slab.convert('RGB').resize((1366, 584), Image.LANCZOS).save(P + name + '/preview.jpg', quality=90)
# the reference for the image model: the official logo as it is
ref = Image.new('RGBA', (logo.width + 120, logo.height + 120), (255, 255, 255, 255)); ref.alpha_composite(logo, (60, 60)); ref.convert('RGB').save(P + 'refs/gemini-logo.png')
print(name, 'layout made', parts)
