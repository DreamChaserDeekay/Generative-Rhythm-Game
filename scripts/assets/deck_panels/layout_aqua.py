"""Trial: the flat layout drawings for the AQUA gear's lower panel (skin 5; the user: "as close to the reference as can
   be"; drafts 1 and 3 of the ideas put to the user):
     aqua-a1  the reference's console as it is: a pane of dark teal glass with faint rings round its middle; at the
              middle the machine's mark, a white ring of three chasing arrows round a pale disc, in an aqua glow; at each
              side five slanting aqua vent stripes over a white blade; white armour collars at the far corners; hot-pink
              marks at the outer edges and the near corners. (The reference's two number boxes are left out: the game
              writes its numbers beside the gear now.)
     aqua-a2  the same console with the glass as WATER: the rings are ripples going out from the mark, a few drops lie
              on the surface.
   The reference (the user's picture, images/8.webp) is not copied here: its console is drawn again, wider, in this
   panel's own shape (2048 x 876). The mark is round: not drawn deeper than it is.
   Run with python3 -I: python3 -I layout_aqua.py"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
P = S
W, H = 2048, 876
K = 2
CYAN, PINK, WHITE = (34, 224, 230), (255, 63, 147), (244, 247, 250)
MID = (1024, 452)
MARK = {'outer': 232, 'inner': 162, 'disc': 104}


def glass(water):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((xx - MID[0]) / 1.25, yy - MID[1])
    glow = np.exp(-(r / 330) ** 2)
    deep, lit = (np.array([4, 30, 36]), np.array([30, 118, 126])) if not water else (np.array([4, 44, 56]), np.array([40, 150, 168]))
    g = deep + (lit - deep) * glow[..., None]
    im = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    d = ImageDraw.Draw(im)
    for k, rad in enumerate((300, 372, 452, 540, 636) if water else (300, 384, 468)):
        a = (150 - 22 * k) if water else 46
        box = [MID[0] - rad * 1.25, MID[1] - rad, MID[0] + rad * 1.25, MID[1] + rad]
        d.ellipse(box, outline=(150, 235, 240, a), width=7 if water else 3)
    if water:
        for x, y, s in ((560, 250, 26), (1500, 300, 20), (1380, 690, 30), (700, 700, 18), (1640, 560, 14), (430, 520, 16)):
            d.ellipse([x - s, y - s * 0.8, x + s, y + s * 0.8], fill=(170, 240, 246, 210), outline=(240, 255, 255, 255), width=3)
    return im


def mark():
    """The machine's mark: a white ring of three arcs, each ending in an arrow head (they chase one another round a pale
       disc)."""
    n = (MARK['outer'] + 30) * 2 * K; c = n / 2
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    ro, ri, rd = MARK['outer'] * K, MARK['inner'] * K, MARK['disc'] * K
    for k in range(3):
        a0 = -90 + k * 120 + 14; a1 = a0 + 96
        d.pieslice([c - ro, c - ro, c + ro, c + ro], a0, a1, fill=WHITE + (255,))
        tip = math.radians(a1 + 16); base = math.radians(a1 - 2); rm = (ro + ri) / 2
        d.polygon([(c + (ro + 22 * K) * math.cos(base), c + (ro + 22 * K) * math.sin(base)), (c + (ri - 22 * K) * math.cos(base), c + (ri - 22 * K) * math.sin(base)),
                   (c + rm * math.cos(tip), c + rm * math.sin(tip))], fill=WHITE + (255,))
    d.ellipse([c - ri, c - ri, c + ri, c + ri], fill=(0, 0, 0, 0))
    hole = Image.new('L', (n, n), 0); ImageDraw.Draw(hole).ellipse([c - ri, c - ri, c + ri, c + ri], fill=255)
    im.putalpha(Image.composite(Image.new('L', (n, n), 0), im.getchannel('A'), hole))
    d = ImageDraw.Draw(im)
    d.ellipse([c - rd, c - rd, c + rd, c + rd], fill=(214, 246, 248, 255))
    return im.resize((n // K, n // K), Image.LANCZOS)


def side(flip):
    """What one side of the console carries (the left one; flip mirrors it): the armour collar at the far corner, the vent's
       five slanting stripes, the white blade under them, the pink marks at the outer edge and the near corner."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon([(0, 0), (640, 0), (560, 92), (318, 92), (246, 164), (0, 164)], fill=WHITE + (255,))                 # the collar
    d.line([(0, 164), (246, 164), (318, 92), (560, 92), (640, 0)], fill=CYAN + (255,), width=6)
    for k in range(5):                                                                                              # the vent
        x = 250 + k * 68; a = 255 - k * 34
        d.polygon([(x + 70, 372), (x + 122, 372), (x + 52, 492), (x, 492)], fill=CYAN + (a,))
    d.polygon([(214, 512), (662, 512), (626, 552), (214, 552)], fill=WHITE + (255,))                               # the blade
    d.polygon([(40, 300), (150, 300), (40, 470)], fill=PINK + (255,))                                              # pink at the outer edge
    d.polygon([(40, 520), (120, 600), (40, 600)], fill=PINK + (255,))
    for k in range(4): d.polygon([(70 + k * 54, 876), (112 + k * 54, 876), (182 + k * 54, 790), (140 + k * 54, 790)], fill=PINK + (255,))   # hatch at the near corner
    d.line([(330, 790), (560, 790), (640, 876)], fill=CYAN + (255,), width=6)
    d.polygon([(0, 640), (36, 640), (36, 876), (0, 876)], fill=WHITE + (255,))
    return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im


def layout(name, water):
    base = glass(water)
    glowy = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(glowy).ellipse([MID[0] - 300, MID[1] - 300, MID[0] + 300, MID[1] + 300], fill=CYAN + (90,))
    base.alpha_composite(glowy.filter(ImageFilter.GaussianBlur(60)))
    m = mark(); base.alpha_composite(m, (MID[0] - m.width // 2, MID[1] - m.height // 2))
    base.alpha_composite(side(False)); base.alpha_composite(side(True))
    os.makedirs(P + name, exist_ok=True)
    base.convert('RGB').save(P + name + '/layout.png')
    json.dump({'mark': {'middle': MID, **MARK}, 'water': water}, open(P + name + '/parts.json', 'w'), indent=1)
    return base.convert('RGB')


a, b = layout('aqua-a1', False), layout('aqua-a2', True)
sheet = Image.new('RGB', (W, 2 * H + 10), (90, 90, 90)); sheet.paste(a, (0, 0)); sheet.paste(b, (0, H + 10))
sheet.resize((1280, round(sheet.height * 1280 / W)), Image.LANCZOS).save(P + 'aqua-a-layouts.jpg', quality=90); print('layouts made')
