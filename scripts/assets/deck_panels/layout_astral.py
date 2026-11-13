"""Trial: the flat layout drawings for the ASTRAL gear's lower panel (skin 11, shown as 별밤; the user: "1, 3, 4 뽑아봐":
   drafts 1, 3 and 4 of the ideas): the reference's night sky in deep navy: at the middle a white four-pointed star with
   long points and a pair of pale blue wings behind it; a tilted orbit line round them with two small rings on it; a row of
   moon phases over the star and another under it; a faint large circle behind (the star chart); pale blue-white flowers
   with long feathery leaves at each side edge; dim blue flowers and a blue light in the two near corners; small sparkles.
     astral-a1, astral-a3  the drawing as it is (a1: glowing in navy glass; a3: on the still water of a night lake)
     astral-a4             the same drawing with the lead lines of a stained-glass window drawn in
   The reference's SCORE and COMBO lettering and numbers are left out (the game writes its numbers beside the gear). In the
   reference the flowers and ribbons hang outside the track; here they lie inside the panel's side edges. The reference (the
   user's picture, images/14.webp) is not copied here: its drawing is made again, wider, in this panel's own shape
   (2048 x 876). The star is not drawn deeper than it is. The row of navy key caps with gold stars is the game's own (the
   keys, over the panel): it is not drawn again.
   Run with python3 -I: python3 -I layout_astral.py"""
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
P = S
W, H = 2048, 876
K = 2
MID = (1024, 440)
WHITE, PALE, WING, LEAF, LINE, FAINT, LEAD = (250, 252, 255), (226, 236, 255), (150, 186, 250), (200, 206, 250), (172, 196, 255), (72, 102, 192), (9, 11, 28)
STAR = {'up': 205, 'across': 195, 'waist': 26}
ORBIT = {'middle': (1024, 430), 'radii': (600, 165), 'turn': -11}
MOONS = {'xs': (842, 918, 1024, 1130, 1206), 'over': 105, 'under': 742}
FLOWERS = [(72, 420, 66), (44, 548, 48), (134, 322, 40)]                 # the left cluster (the right one mirrors it)
DEEP = [(120, 770, 96), (330, 838, 80), (20, 668, 70)]                   # the dim blue flowers in the near-left corner


def field():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    g = np.array([8, 12, 40], np.float32) + (np.array([14, 24, 82], np.float32) - np.array([8, 12, 40], np.float32)) * (yy / H)[..., None]
    for (cx, cy), (rx, ry), colour, k in (((1024, 440), (360, 260), (60, 104, 226), 0.55), ((150, 900), (520, 330), (30, 84, 236), 0.7), ((1898, 900), (520, 330), (30, 84, 236), 0.7)):
        glow = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2))
        g = g + (np.array(colour, np.float32) - g) * (glow * k)[..., None]
    return Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def lens(base, turn, length, width):
    """A long leaf or feather: from its base, `length` px in the direction `turn` (degrees, y down), at most `width` wide."""
    t = math.radians(turn); c, s = math.cos(t), math.sin(t); left, right = [], []
    for k in range(25):
        u = k / 24; h = width / 2 * math.sin(math.pi * u) ** 0.8
        x, y = base[0] + u * length * c, base[1] + u * length * s
        left.append((x - h * s, y + h * c)); right.append((x + h * s, y - h * c))
    return left + right[::-1]


def flower(d, x, y, r, colour, heart, lead):
    for k in range(5):
        a = math.radians(k * 72 - 90); px, py = x + 0.56 * r * math.cos(a), y + 0.56 * r * math.sin(a)
        d.ellipse([(px - 0.52 * r) * K, (py - 0.52 * r) * K, (px + 0.52 * r) * K, (py + 0.52 * r) * K], fill=colour, outline=LEAD + (255,) if lead else None, width=5 * K if lead else 0)
    d.ellipse([(x - 0.24 * r) * K, (y - 0.24 * r) * K, (x + 0.24 * r) * K, (y + 0.24 * r) * K], fill=heart)


def moon(d, x, y, r, phase, colour, lead):
    """phase: -2 a crescent open to the left, -1 a half lit at its right ... 0 the full moon ... 2; 9 a ring."""
    box = [(x - r) * K, (y - r) * K, (x + r) * K, (y + r) * K]
    if phase == 9: d.ellipse(box, outline=colour, width=4 * K); return
    if phase == 0: d.ellipse(box, fill=colour, outline=LEAD + (255,) if lead else None, width=4 * K if lead else 0); return
    if abs(phase) == 1: d.pieslice(box, -90 if phase < 0 else 90, 90 if phase < 0 else 270, fill=colour); return
    m = Image.new('L', (4 * r * K, 4 * r * K), 0); dm = ImageDraw.Draw(m)
    dm.ellipse([r * K, r * K, 3 * r * K, 3 * r * K], fill=255); off = (0.62 if phase < 0 else -0.62) * r
    dm.ellipse([(r - off) * K, r * K, (3 * r - off) * K, 3 * r * K], fill=0)
    d.bitmap(((x - 2 * r) * K, (y - 2 * r) * K), m, fill=colour)


def drawing(lead):
    im = field()
    big = Image.new('RGBA', (W * K, H * K), (0, 0, 0, 0)); d = ImageDraw.Draw(big)
    q = lambda pts: [(x * K, y * K) for x, y in pts]
    if lead:                                                                          # the window's lead lines: rays and rings round the star, a rim
        for k in range(16):
            a = math.radians(k * 22.5 + 11.25)
            d.line(q([(MID[0] + 236 * math.cos(a), MID[1] + 236 * math.sin(a)), (MID[0] + 1300 * math.cos(a), MID[1] + 1300 * math.sin(a))]), fill=LEAD + (255,), width=6 * K)
        for r in (236, 520): d.ellipse([(MID[0] - r) * K, (MID[1] - r) * K, (MID[0] + r) * K, (MID[1] + r) * K], outline=LEAD + (255,), width=6 * K)
        d.rectangle([0, 0, W * K - 1, H * K - 1], outline=LEAD + (255,), width=10 * K)
    else:                                                                             # the star chart, faint: two rings and their ticks
        for r, w in ((520, 3), (548, 2)): d.ellipse([(MID[0] - r) * K, (MID[1] - r) * K, (MID[0] + r) * K, (MID[1] + r) * K], outline=FAINT + (255,), width=w * K)
        for k in range(0, 360, 15):
            a = math.radians(k); d.line(q([(MID[0] + 524 * math.cos(a), MID[1] + 524 * math.sin(a)), (MID[0] + 544 * math.cos(a), MID[1] + 544 * math.sin(a))]), fill=FAINT + (255,), width=2 * K)
    # the dim blue flowers in the two near corners
    for x, y, r in DEEP:
        for fx in (x, W - x): flower(d, fx, y, r, (52, 104, 228, 170), (120, 170, 255, 200), lead)
    # the orbit and its two small rings
    t = math.radians(ORBIT['turn']); pts = []
    at = lambda a: (ORBIT['middle'][0] + ORBIT['radii'][0] * math.cos(a) * math.cos(t) - ORBIT['radii'][1] * math.sin(a) * math.sin(t),
                    ORBIT['middle'][1] + ORBIT['radii'][0] * math.cos(a) * math.sin(t) + ORBIT['radii'][1] * math.sin(a) * math.cos(t))
    for k in range(361): pts.append(at(math.radians(k)))
    d.line(q(pts), fill=(LEAD if lead else LINE) + (255,), width=(6 if lead else 5) * K, joint='curve')
    for a, r in ((-48, 24), (132, 24), (122, 9)):
        x, y = at(math.radians(a)); d.ellipse([(x - r) * K, (y - r) * K, (x + r) * K, (y + r) * K], fill=(14, 22, 70, 255), outline=LINE + (255,), width=5 * K)
    # the wings behind the star: a fan of long feathers at each side, a row of shorter ones over their roots
    for side in (-1, 1):
        base = (MID[0] + side * 84, MID[1] + 40)
        for row, (count, reach, wide, colour) in enumerate(((7, 1.0, 50, WING + (235,)), (5, 0.56, 44, PALE + (245,)))):
            for k in range(count):
                u = k / (count - 1); turn = 205 + 50 * u; length = (250 + 90 * math.sin(math.pi * u)) * reach
                turn = turn if side == -1 else 180 - turn
                d.polygon(q(lens(base, turn, length, wide)), fill=colour, outline=LEAD + (255,) if lead else (236, 242, 255, 255), width=(5 if lead else 2) * K)
    # the flowers at the two side edges and their long feathery leaves
    for side in (-1, 1):
        fx = lambda x: x if side == -1 else W - x
        for base, turn, length, wide in (((96, 420), -62, 330, 40), ((104, 430), -34, 300, 36), ((96, 470), 44, 280, 38), ((110, 450), 14, 300, 32)):
            turn = turn if side == -1 else 180 - turn
            d.polygon(q(lens((fx(base[0]), base[1]), turn, length, wide)), fill=LEAF + (235,), outline=LEAD + (255,) if lead else None, width=5 * K if lead else 0)
        for x, y, r in FLOWERS: flower(d, fx(x), y, r, PALE + (255,), (150, 180, 250, 255), lead)
    # the moon phases, over the star and under it
    for row, (y, colour) in enumerate(((MOONS['over'], WHITE + (255,)), (MOONS['under'], (190, 206, 250, 255)))):
        for x, phase, r in zip(MOONS['xs'], (-2, -1, 0 if row == 0 else 9, 1, 2), (15, 16, 24, 16, 15)): moon(d, x, y, r, phase, colour, lead)
    # the star
    R, A, w = STAR['up'], STAR['across'], STAR['waist']
    d.polygon(q([(MID[0], MID[1] - R), (MID[0] + w, MID[1] - w), (MID[0] + A, MID[1]), (MID[0] + w, MID[1] + w), (MID[0], MID[1] + R), (MID[0] - w, MID[1] + w), (MID[0] - A, MID[1]), (MID[0] - w, MID[1] - w)]),
              fill=WHITE + (255,), outline=LEAD + (255,) if lead else None, width=5 * K if lead else 0)
    # the sparkles and the tiny stars
    rnd = random.Random(11)
    for x, y, r in ((190, 250, 20), (1858, 250, 20), (420, 200, 16), (1628, 200, 16), (533, 800, 18), (1515, 800, 18), (640, 150, 14), (1408, 690, 14), (700, 690, 14)):
        d.polygon(q([(x, y - r), (x + r * 0.2, y - r * 0.2), (x + r, y), (x + r * 0.2, y + r * 0.2), (x, y + r), (x - r * 0.2, y + r * 0.2), (x - r, y), (x - r * 0.2, y - r * 0.2)]), fill=WHITE + (255,))
    for _ in range(70):
        x, y, r = rnd.uniform(20, W - 20), rnd.uniform(20, H - 20), rnd.choice((2, 2, 3))
        d.ellipse([(x - r) * K, (y - r) * K, (x + r) * K, (y + r) * K], fill=(200, 215, 255, 200))
    art = big.resize((W, H), Image.LANCZOS)
    if not lead:
        glow = art.filter(ImageFilter.GaussianBlur(18)); glow.putalpha(glow.getchannel('A').point(lambda v: int(v * 0.5)))
        im.alpha_composite(glow)
    im.alpha_composite(art)
    return im.convert('RGB')


plain, leaded = drawing(False), drawing(True)
for name, im in (('astral-a1', plain), ('astral-a3', plain), ('astral-a4', leaded)):
    os.makedirs(P + name, exist_ok=True); im.save(P + name + '/layout.png')
    json.dump({'star': {'middle': MID, **STAR}, 'orbit': ORBIT, 'moons': MOONS, 'flowers': FLOWERS, 'leaded': name == 'astral-a4'}, open(P + name + '/parts.json', 'w'), indent=1)
sheet = Image.new('RGB', (W, 2 * H + 10), (90, 90, 90)); sheet.paste(plain, (0, 0)); sheet.paste(leaded, (0, H + 10))
sheet.resize((1280, round(sheet.height * 1280 / W)), Image.LANCZOS).save(P + 'astral-a-layouts.jpg', quality=92); print('layouts made')
