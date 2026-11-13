"""Trial: the flat layout drawing for the WIRE gear's lower panel (skin 10, shown as 화이트 라인; the user: "1, 2 뽑아봐":
   drafts 1 and 2 of the ideas): the reference's line drawing in white light on near-black: at the middle the mark (an open
   ring, two dots in it and an upright trapezoid under them); behind it a faint large dial; thin tilted orbit lines; a small
   lens ring at the right; a chevron at each side pointing in; a cluster of small dots near the bottom at each side; a few
   small bars; faint traces of a circuit board; a white light rising from the middle of the near edge.
     wire-a1  the drawing as lines of white light under black glass
     wire-a2  the same drawing as a hologram floating over the black panel
   (one drawing for both: the two differ in how the image model builds it.) The reference's small lettering and numbers are
   left out (the game writes its numbers beside the gear). The reference (the user's picture, images/13.webp) is not copied
   here: its drawing is made again, wider, in this panel's own shape (2048 x 876). The mark is round: not drawn deeper than
   it is. The strip of thin trays is the game's own (the keys, over the panel): it is not drawn again.
   Run with python3 -I: python3 -I layout_wire.py"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
P = S
W, H = 2048, 876
K = 2
WHITE, SOFT, FAINT, TRACE = (242, 245, 255), (150, 158, 180), (66, 71, 88), (34, 37, 48)
MARK = {'middle': (1024, 400), 'radius': 220, 'stroke': 26}
ORBITS = [((900, 330), (430, 150), -22, 5, WHITE), ((1150, 560), (1050, 300), -24, 5, WHITE), ((1750, 620), (330, 110), -18, 4, SOFT)]
LENS = {'middle': (1620, 290), 'radii': (92, 62, 28)}
CHEVRONS = [(170, 400, 1), (1878, 400, -1)]
BARS = [(120, 520, 250, 34, -10), (230, 590, 300, 38, -10), (1620, 720, 300, 40, 24), (1790, 800, 260, 36, 24), (1480, 800, 200, 30, 24)]


def turned(d, middle, radii, turn, width, colour, a0=0, a1=360):
    t = math.radians(turn); pts = []
    for k in range(a0, a1 + 1):
        a = math.radians(k); x, y = radii[0] * math.cos(a), radii[1] * math.sin(a)
        pts.append(((middle[0] + x * math.cos(t) - y * math.sin(t)) * K, (middle[1] + x * math.sin(t) + y * math.cos(t)) * K))
    d.line(pts, fill=colour + (255,), width=width * K, joint='curve')


def field():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    haze = np.exp(-(((xx - 1024) / 640) ** 2 + ((yy - 930) / 330) ** 2))                    # the light rising from the near edge
    core = np.exp(-(((xx - 1024) / 330) ** 2 + ((yy - 920) / 150) ** 2))
    g = np.array([6, 7, 12], np.float32) + (np.array([150, 160, 190], np.float32) - 6) * (haze * 0.7)[..., None] + np.array([105, 95, 65], np.float32) * core[..., None]
    return Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def drawing():
    im = field()
    big = Image.new('RGBA', (W * K, H * K), (0, 0, 0, 0)); d = ImageDraw.Draw(big)
    # the circuit board's traces, faint: right-angled paths and a few small parts
    for pts in ([(330, 876), (330, 760), (520, 760), (520, 700), (700, 700)], [(1718, 876), (1718, 780), (1560, 780), (1560, 690), (1380, 690)],
                [(760, 876), (760, 800), (640, 800)], [(1288, 876), (1288, 800), (1408, 800)], [(60, 250), (300, 250), (300, 150), (520, 150)], [(1988, 180), (1800, 180), (1800, 100), (1560, 100)]):
        d.line([(x * K, y * K) for x, y in pts], fill=TRACE + (255,), width=5 * K, joint='curve')
        for x, y in (pts[0], pts[-1]): d.ellipse([(x - 9) * K, (y - 9) * K, (x + 9) * K, (y + 9) * K], outline=FAINT + (255,), width=4 * K)
    for l, t, r, b in ((560, 590, 690, 650), (1370, 560, 1480, 640), (420, 300, 500, 350), (1500, 440, 1570, 480)):
        d.rectangle([l * K, t * K, r * K, b * K], outline=FAINT + (255,), width=4 * K)
        for x in range(l + 12, r - 4, 20): d.line([(x * K, (t - 10) * K), (x * K, t * K)], fill=FAINT + (255,), width=4 * K); d.line([(x * K, b * K), (x * K, (b + 10) * K)], fill=FAINT + (255,), width=4 * K)
    # the large dial behind the mark, faint: two rings and their ticks
    for r in (430, 474): turned(d, (1024, 470), (r, r), 0, 3, FAINT)
    for k in range(0, 360, 6):
        a = math.radians(k); d.line([((1024 + 440 * math.cos(a)) * K, (470 + 440 * math.sin(a)) * K), ((1024 + (464 if k % 30 else 474) * math.cos(a)) * K, (470 + (464 if k % 30 else 474) * math.sin(a)) * K)], fill=FAINT + (255,), width=3 * K)
    # the lens ring at the right
    for r, w, c in zip(LENS['radii'], (7, 5, 4), (SOFT, SOFT, FAINT)): turned(d, LENS['middle'], (r, r), 0, w, c)
    for o in ORBITS: turned(d, *o)
    # the small bars
    for x, y, length, wide, turn in BARS:
        t = math.radians(turn); c, s = math.cos(t), math.sin(t)
        pts = [(x + (u * length / 2) * c - (v * wide / 2) * s, y + (u * length / 2) * s + (v * wide / 2) * c) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        d.polygon([(px * K, py * K) for px, py in pts], fill=WHITE + (235,))
    # the clusters of small dots (two rows) and the upright pixel bars beside them
    for x0, sign in ((150, 1), (1898, -1)):
        for row, count in ((0, 5), (1, 4)):
            for i in range(count):
                x, y = x0 + sign * (i * 38 + row * 19), 700 + row * 34
                d.ellipse([(x - 13) * K, (y - 13) * K, (x + 13) * K, (y + 13) * K], fill=WHITE + (255,))
        for i, (dy, h) in enumerate(((0, 60), (26, 96), (10, 44), (40, 70))):
            x = 430 + i * 26 if sign == 1 else x0 + 40 - i * 26                              # (the left ones stand clear of the bars there)
            d.rectangle([(x - 8) * K, (500 + dy) * K, (x + 8) * K, (500 + dy + h) * K], fill=SOFT + (255,))
    for x, y, sign in CHEVRONS:
        d.line([((x - sign * 22) * K, (y - 44) * K), ((x + sign * 22) * K, y * K), ((x - sign * 22) * K, (y + 44) * K)], fill=WHITE + (255,), width=16 * K, joint='curve')
    # the mark: the open ring (its upper right missing), two dots, the upright trapezoid
    (cx, cy), R, st = MARK['middle'], MARK['radius'], MARK['stroke']
    d.arc([(cx - R) * K, (cy - R) * K, (cx + R) * K, (cy + R) * K], start=0, end=272, fill=WHITE + (255,), width=st * K)
    for a in (0, 272):
        x, y = cx + (R - st / 2) * math.cos(math.radians(a)), cy + (R - st / 2) * math.sin(math.radians(a))
        d.ellipse([(x - st / 2) * K, (y - st / 2) * K, (x + st / 2) * K, (y + st / 2) * K], fill=WHITE + (255,))
    for sx in (-1, 1):
        x, y = cx + sx * 104, cy - 78
        d.ellipse([(x - 27) * K, (y - 27) * K, (x + 27) * K, (y + 27) * K], fill=WHITE + (255,))
        d.ellipse([(x - 9) * K, (y - 9) * K, (x + 9) * K, (y + 9) * K], fill=(8, 9, 14, 255))
    trap = [(cx - 34, cy - 52), (cx + 34, cy - 52), (cx + 58, cy + 132), (cx - 58, cy + 132)]
    d.line([(x * K, y * K) for x, y in trap + [trap[0], trap[1]]], fill=WHITE + (255,), width=20 * K, joint='curve')
    lines = big.resize((W, H), Image.LANCZOS)
    glow = lines.filter(ImageFilter.GaussianBlur(14)); glow.putalpha(glow.getchannel('A').point(lambda v: int(v * 0.55)))
    im.alpha_composite(glow); im.alpha_composite(lines)
    return im.convert('RGB')


flat = drawing()
for name in ('wire-a1', 'wire-a2'):
    os.makedirs(P + name, exist_ok=True); flat.save(P + name + '/layout.png')
    json.dump({'mark': MARK, 'lens': LENS, 'chevrons': CHEVRONS, 'bars': BARS}, open(P + name + '/parts.json', 'w'), indent=1)
flat.resize((1280, round(H * 1280 / W)), Image.LANCZOS).save(P + 'wire-a-layout.jpg', quality=92); print('layout made')
