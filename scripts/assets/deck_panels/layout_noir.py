"""Trial: the flat layout drawings for the NOIR gear's lower panel (skin 8; the user: "2, 3 시안 뽑아보고 가운데 숫자 자리는
   1로 진행해줘": drafts 2 and 3 of the ideas, the middle left empty):
     noir-a2  the reference's black and red graphics as they lie (to be built as real, layered parts): a black field with a
              dark-red light at its middle, crossed by broad dark-red slanting bands and thin red orbit lines; a red block and
              a white bar overlapping at each side; a diamond of dark-red dots; a cluster of glowing red dots at each side
              near the bottom; white and red slanting stripes at the near edge; red chevrons, pixel marks, a faint grid of
              white dots, two upright hairlines;
     noir-a3  the same picture shown on an LED dot-matrix board: one dot to every 16 px (128 x 55 dots), each lit in the
              colour the picture has there, the unlit ones a faint dark dot.
   The reference's SCORE and COMBO lettering and numbers are left out and the middle stays empty (the user's choice; the
   game writes its numbers beside the gear). The reference (the user's picture, images/11.webp) is not copied here: its
   graphics are drawn again, wider, in this panel's own shape (2048 x 876). The strip of thin slots is the game's own (the
   keys, over the panel): it is not drawn again.
   Run with python3 -I: python3 -I layout_noir.py"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
P = S
W, H = 2048, 876
K = 2
PITCH = 16
BLACK, RED, WHITE, DIM = (5, 5, 7), (246, 18, 34), (250, 250, 250), (150, 150, 156)
BANDS = [([(600, 0), (900, 0), (1500, 876), (1200, 876)], (58, 6, 11)), ([(120, 876), (470, 876), (1010, 330), (835, 155)], (44, 4, 8)),
         ([(1370, 876), (1640, 876), (2048, 468), (2048, 198)], (50, 5, 9))]
ARCS = [((760, 560), (900, 330), -28, 6, (226, 22, 36)), ((1500, 700), (760, 250), -38, 6, (226, 22, 36)),
        ((1880, 590), (120, 34), -12, 9, (226, 22, 36)), ((150, 560), (140, 110), 0, 4, (150, 12, 22))]
BLOCKS = [((130, 292, 310, 364), RED), ((216, 344, 436, 390), WHITE), ((1622, 358, 1844, 434), RED), ((1690, 322, 1946, 368), WHITE)]
DIAMOND = {'middle': (590, 268), 'step': 50, 'radius': 17, 'colour': (132, 12, 22)}
CLUSTERS = [[(350, 656), (408, 656), (466, 656), (524, 656), (408, 708), (466, 708), (524, 708), (582, 708)],
            [(1524, 656), (1582, 656), (1640, 656), (1698, 656), (1466, 708), (1524, 708), (1582, 708), (1640, 708)]]
STRIPES = [(160, 770, 52, WHITE), (268, 770, 52, WHITE), (376, 770, 52, WHITE), (1210, 792, 30, (204, 16, 30)), (1268, 792, 30, (204, 16, 30)), (1326, 792, 30, (204, 16, 30))]
CHEVRONS = [(1462, 550), (1502, 550), (1542, 550)]
MARK_A = {'at': (1660, 498), 'cells': ['###..', '..#..', '..###', '....#', '#####'], 'pitch': 15}       # a pixel mark (no letter, no digit)
MARK_B = {'at': (1682, 796), 'cells': ['#.#.', '.#.#', '#.#.', '.#.#'], 'pitch': 14}
ICON = (1024, 716)
HAIRLINES = (246, 1802)


def field():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    glow = np.exp(-(((xx - 1024) / 620) ** 2 + ((yy - 520) / 330) ** 2))
    g = np.array(BLACK, np.float32) + (np.array([92, 8, 15], np.float32) - np.array(BLACK, np.float32)) * (glow * 0.8)[..., None]
    return Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def orbit(d, middle, radii, turn, width, colour):
    t = math.radians(turn); pts = []
    for k in range(361):
        a = math.radians(k); x, y = radii[0] * math.cos(a), radii[1] * math.sin(a)
        pts.append(((middle[0] + x * math.cos(t) - y * math.sin(t)) * K, (middle[1] + x * math.sin(t) + y * math.cos(t)) * K))
    d.line(pts, fill=colour + (255,), width=width * K, joint='curve')


def drawing():
    """The graphics as they lie, flat."""
    im = field()
    big = Image.new('RGBA', (W * K, H * K), (0, 0, 0, 0)); d = ImageDraw.Draw(big)
    for poly, colour in BANDS: d.polygon([(x * K, y * K) for x, y in poly], fill=colour + (235,))
    for x in HAIRLINES: d.rectangle([(x - 1) * K, 0, (x + 2) * K, H * K], fill=DIM + (255,))
    for y in range(136, 560, 68):                                                               # the faint grid of white dots
        for x in (92, 164, 236, 308, 380)[: 3 if y in (136, 408, 476) else 5]: d.ellipse([(x - 4) * K, (y - 4) * K, (x + 4) * K, (y + 4) * K], fill=DIM + (255,))
    for a in ARCS: orbit(d, *a)
    (cx, cy), s, r = DIAMOND['middle'], DIAMOND['step'], DIAMOND['radius']                      # the diamond of dark-red dots
    for i in range(4):
        for j in range(4):
            x, y = cx + (i - j) * s * 0.7071, cy + (i + j - 3) * s * 0.7071
            d.ellipse([(x - r) * K, (y - r) * K, (x + r) * K, (y + r) * K], fill=DIAMOND['colour'] + (255,))
    for (l, t, r_, b), colour in BLOCKS: d.rectangle([l * K, t * K, r_ * K, b * K], fill=colour + (255,))
    for x, y, w, colour in STRIPES: d.polygon([(x * K, y * K), ((x + w) * K, y * K), ((x + w + (H - y)) * K, H * K), ((x + (H - y)) * K, H * K)], fill=colour + (255,))
    for x, y in CHEVRONS: d.line([((x + 30) * K, (y - 30) * K), (x * K, y * K), ((x + 30) * K, (y + 30) * K)], fill=RED + (255,), width=12 * K, joint='curve')
    for mark, colour, r in ((MARK_A, (214, 200, 206), 5), (MARK_B, WHITE, 5)):
        for j, row in enumerate(mark['cells']):
            for i, c in enumerate(row):
                if c == '#':
                    x, y = mark['at'][0] + i * mark['pitch'], mark['at'][1] + j * mark['pitch']
                    d.rectangle([(x - r) * K, (y - r) * K, (x + r) * K, (y + r) * K], fill=colour + (255,))
    d.ellipse([(ICON[0] - 16) * K, (ICON[1] - 16) * K, (ICON[0] + 16) * K, (ICON[1] + 16) * K], outline=WHITE + (255,), width=6 * K)   # a small toothed ring
    for k in range(8):
        a = math.radians(k * 45); x, y = ICON[0] + 21 * math.cos(a), ICON[1] + 21 * math.sin(a)
        d.ellipse([(x - 4) * K, (y - 4) * K, (x + 4) * K, (y + 4) * K], fill=WHITE + (255,))
    im.alpha_composite(big.resize((W, H), Image.LANCZOS))
    lit = Image.new('RGBA', (W * K, H * K), (0, 0, 0, 0)); d = ImageDraw.Draw(lit)             # the glowing red dots
    for cl in CLUSTERS:
        for x, y in cl: d.ellipse([(x - 27) * K, (y - 27) * K, (x + 27) * K, (y + 27) * K], fill=(255, 22, 40, 255))
    lit = lit.resize((W, H), Image.LANCZOS)
    halo = lit.filter(ImageFilter.GaussianBlur(26)); halo.putalpha(halo.getchannel('A').point(lambda v: int(v * 0.7)))
    im.alpha_composite(halo); im.alpha_composite(lit)
    return im.convert('RGB')


def board():
    """The same graphics as an LED dot-matrix board shows them: one round dot to every PITCH px (128 x 55 dots). Drawn on
       the dots' own grid, as pixel art (a drawing merely sampled dot by dot runs its small things together): the bands dim
       red, the orbit lines one dot wide, each glowing dot of a cluster four dots across, the chevrons and marks dot by dot;
       the unlit dots faint and dark."""
    cols, rows = W // PITCH, -(-H // PITCH)
    g = Image.new('RGB', (cols, rows), (0, 0, 0)); d = ImageDraw.Draw(g)
    q = lambda v: v / PITCH
    for poly, colour in BANDS: d.polygon([(q(x), q(y)) for x, y in poly], fill=tuple(round(c * 1.5) for c in colour))
    for x in HAIRLINES: d.line([(int(q(x)), 0), (int(q(x)), rows)], fill=DIM)
    for y in range(136, 560, 68):
        for x in (92, 164, 236, 308, 380)[: 3 if y in (136, 408, 476) else 5]: d.point((int(q(x)), int(q(y))), fill=DIM)
    for middle, radii, turn, _, colour in ARCS:
        t = math.radians(turn); pts = []
        for k in range(0, 361, 2):
            a_ = math.radians(k); x, y = radii[0] * math.cos(a_), radii[1] * math.sin(a_)
            pts.append((q(middle[0] + x * math.cos(t) - y * math.sin(t)), q(middle[1] + x * math.sin(t) + y * math.cos(t))))
        d.line(pts, fill=colour, width=1)
    (cx, cy) = DIAMOND['middle']                                                              # the diamond: every other dot of a rhombus
    for j in range(-5, 6):
        for i in range(-5, 6):
            if abs(i) + abs(j) <= 5 and (i + j) % 2 == 0: d.point((int(q(cx)) + i, int(q(cy)) + j), fill=(168, 16, 30))
    for (l, t_, r_, b_), colour in BLOCKS: d.rectangle([int(q(l)), int(q(t_)), int(q(r_)) - 1, int(q(b_)) - 1], fill=colour)
    for k, cl in enumerate(CLUSTERS):                                                         # each glowing dot: four dots across, its corners off
        x0, y0 = int(q(min(x for x, _ in cl))) - 2, int(q(cl[0][1])) - 3
        for n in range(8):
            row, i = divmod(n, 4)
            x = x0 + i * 5 + (row * 3 if k == 0 else (1 - row) * 3 - 3); y = y0 + row * 5
            d.rectangle([x, y + 1, x + 3, y + 2], fill=(255, 24, 44)); d.rectangle([x + 1, y, x + 2, y + 3], fill=(255, 24, 44))
    for n, (x, y, w, colour) in enumerate(STRIPES):                                           # the stripes: three dots wide (the red ones two), a dot to the right each row
        wide = 3 if colour == WHITE else 2; x0 = int(q(STRIPES[0 if colour == WHITE else 3][0])) + (n % 3) * 2 * wide; y0 = int(q(y))
        for j in range(y0, rows): d.line([(x0 + (j - y0), j), (x0 + (j - y0) + wide - 1, j)], fill=colour)
    for n, (x, y) in enumerate(CHEVRONS):                                                     # the chevrons, dot by dot
        x0, y0 = int(q(CHEVRONS[0][0])) + n * 5, int(q(y)) - 3
        for j, row in enumerate(('...##', '..##.', '.##..', '##...', '.##..', '..##.', '...##')):
            for i, c in enumerate(row):
                if c == '#': d.point((x0 + i, y0 + j), fill=RED)
    for mark, colour in ((MARK_A, (214, 200, 206)), (MARK_B, WHITE)):
        for j, row in enumerate(mark['cells']):
            for i, c in enumerate(row):
                if c == '#': d.point((int(q(mark['at'][0])) + i, int(q(mark['at'][1])) + j), fill=colour)
    ix, iy = int(q(ICON[0])), int(q(ICON[1]))                                                 # the small ring
    for i, j in ((-1, -2), (0, -2), (1, -2), (-2, -1), (2, -1), (-2, 0), (2, 0), (-2, 1), (2, 1), (-1, 2), (0, 2), (1, 2)): d.point((ix + i, iy + j), fill=WHITE)
    a = np.asarray(g)
    big = Image.new('RGB', (W * K, H * K), (3, 3, 4)); dd = ImageDraw.Draw(big)
    lit = 0
    for j in range(rows):
        for i in range(cols):
            c = a[j, i]; on = int(c.sum()) > 30
            colour = tuple(int(v) for v in c) if on else (20, 20, 23)
            x, y = (i + 0.5) * PITCH, (j + 0.5) * PITCH
            r = 6.2 if on else 5.2
            dd.ellipse([(x - r) * K, (y - r) * K, (x + r) * K, (y + r) * K], fill=colour); lit += on
    print('the board: %d x %d dots, %d lit' % (cols, rows, lit))
    return big.resize((W, H), Image.LANCZOS)


flat = drawing()
for name, im in (('noir-a2', flat), ('noir-a3', board())):
    os.makedirs(P + name, exist_ok=True); im.save(P + name + '/layout.png')
    json.dump({'bands': [b[0] for b in BANDS], 'blocks': [list(b[0]) for b in BLOCKS], 'clusters': CLUSTERS, 'diamond': DIAMOND, 'hairlines': HAIRLINES,
               **({'pitch': PITCH} if name == 'noir-a3' else {})}, open(P + name + '/parts.json', 'w'), indent=1)
a, b = Image.open(P + 'noir-a2/layout.png'), Image.open(P + 'noir-a3/layout.png')
sheet = Image.new('RGB', (W, 2 * H + 10), (90, 90, 90)); sheet.paste(a, (0, 0)); sheet.paste(b, (0, H + 10))
sheet.resize((1280, round(sheet.height * 1280 / W)), Image.LANCZOS).save(P + 'noir-a-layouts.jpg', quality=92); print('layouts made')
