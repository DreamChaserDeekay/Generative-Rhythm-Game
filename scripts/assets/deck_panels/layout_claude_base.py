"""Trial: the flat layout drawing for the Claude gear's lower panel, the user's second direction: no shafts of light over
   the sheet (they read as a rising-sun flag): round the spark, short painted brush strokes like the rays of a child's sun;
   the pelican and its bicycle larger; behind the bicycle hand-drawn speed marks; before it the Claude Code mascot (Clawd)
   as a 3D figure running along. The pelican is not in the drawing the image model gets (it is printed on afterwards as it
   is, print_on_paper.py); the strokes, the speed marks and the mascot are guides the image model paints anew.
   Writes <folder>/layout.png, parts.json and preview.jpg (with the pelican), and the mascot's reference picture.
   Run with python3 -I: python3 -I layout_claude_base.py [<folder>]"""
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
C, P = S + 'inputs/claude/', S
name = sys.argv[1] if len(sys.argv) > 1 else 'claude-b1'
W, H = 2048, 876
TALL = 1.25
IVORY, CLAY, INK = (250, 249, 245), (217, 119, 87), (26, 24, 22)
SUN, SPARK = (470, 255), 250                       # the spark's middle and height
RAYS = {'count': 13, 'from': 168, 'to': 246}       # the painted strokes round it
PELICAN = {'height': 610, 'middle': (1230, 440)}   # before it is drawn TALL (540 in the first draft)
GROUND = 794                                       # where the wheels stand (the drawing's shadow)
MASCOT = {'height': 190, 'middle_x': 1752}         # before it is drawn TALL; its feet on the ground line
rnd = random.Random(7)

paper = Image.new('RGBA', (W, H), IVORY + (255,))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
halo = np.zeros((H, W, 4), np.uint8); r = np.hypot(xx - SUN[0], yy - SUN[1])
halo[..., :3] = (255, 226, 170); halo[..., 3] = (np.clip(1 - r / 520, 0, 1) ** 2 * 110).astype(np.uint8)
paper.alpha_composite(Image.fromarray(halo, 'RGBA'))
d = ImageDraw.Draw(paper)
# the sun's rays: short separate strokes, a little uneven
for k in range(RAYS['count']):
    a = math.radians(k * 360 / RAYS['count'] + rnd.uniform(-5, 5) - 90)
    r0, r1, wide = RAYS['from'] + rnd.uniform(-8, 10), RAYS['to'] + rnd.uniform(-16, 14), rnd.uniform(30, 44)
    ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux
    pts = []
    for t, w in ((0, 0.55), (0.3, 1.0), (0.7, 0.9), (1, 0.4)):
        rr = r0 + (r1 - r0) * t; pts.append((SUN[0] + ux * rr + px * wide * w / 2, SUN[1] + uy * rr + py * wide * w / 2))
    for t, w in ((1, 0.4), (0.7, 0.9), (0.3, 1.0), (0, 0.55)):
        rr = r0 + (r1 - r0) * t; pts.append((SUN[0] + ux * rr - px * wide * w / 2, SUN[1] + uy * rr - py * wide * w / 2))
    d.polygon(pts, fill=((244, 180, 54) if k % 2 else (239, 152, 40)) + (255,))
spark = Image.open(C + 'png/lobe-claude-color.png').convert('RGBA').resize((SPARK, SPARK), Image.LANCZOS)
paper.alpha_composite(spark, (SUN[0] - SPARK // 2, SUN[1] - SPARK // 2))

# where the pelican goes
pel = Image.open(C + 'png/pelican-paper.png').convert('RGBA')
w, h = round(pel.width * PELICAN['height'] / pel.height), round(PELICAN['height'] * TALL)
box = [round(PELICAN['middle'][0] - w / 2), round(PELICAN['middle'][1] - h / 2)]; box += [box[0] + w, box[1] + h]

# the speed marks behind the bicycle: lines, and puffs of dust by the ground
left = box[0]
for x0, y, x1 in ((left - 150, 300, left - 26), (left - 205, 372, left - 44), (left - 120, 452, left - 30), (left - 165, 566, left - 16), (left - 230, 646, left - 34), (left - 150, 722, left - 20)):
    d.line([(x0, y), (x1, y + rnd.uniform(-5, 5))], fill=INK + (255,), width=9)
    for x in (x0, x1): d.ellipse([x - 4.5, y - 4.5, x + 4.5, y + 4.5], fill=INK + (255,))
for cx, cy, rr, fill in ((left - 60, GROUND - 26, 30, CLAY), (left - 130, GROUND - 16, 22, IVORY), (left - 196, GROUND - 30, 16, IVORY)):
    for dx, dy, k in ((-0.6, 0.1, 0.8), (0, -0.3, 1.0), (0.6, 0.1, 0.75)):
        d.ellipse([cx + dx * rr - rr * k, cy + dy * rr - rr * k * TALL / 1.25, cx + dx * rr + rr * k, cy + dy * rr + rr * k], fill=fill + (255,), outline=INK + (255,), width=6)

# the mascot: the Claude Code icon's creature (24 x 24 units: its body 18 x 12, an arm at each side, four legs, two eyes),
# leaning into its run, its legs mid-stride
def clawd(unit, stride=True):
    k = 4; u = unit * k
    im = Image.new('RGBA', (round(26 * u), round(18 * u)), (0, 0, 0, 0)); g = ImageDraw.Draw(im)
    box_ = lambda x0, y0, x1, y1, fill: g.rectangle([(x0 + 1) * u, (y0 - 4) * u, (x1 + 1) * u, (y1 - 4) * u], fill=fill)
    box_(3, 5, 21, 17.08, CLAY + (255,)); box_(0, 10.95, 24, 14.05, CLAY + (255,))
    lift = (1.1, 0, 0, 1.1) if stride else (0, 0, 0, 0)
    for x, up in zip((4.49, 7.49, 15, 18), lift): box_(x, 17.0, x + 1.51, 20 - up, CLAY + (255,))
    for x in (6, 16.51): box_(x, 8.1, x + 1.49, 10.95, INK + (255,))
    return im.resize((im.width // k, im.height // k), Image.LANCZOS)
unit = MASCOT['height'] / 15
m = clawd(unit).rotate(-7, expand=True, resample=Image.BICUBIC)
m = m.crop(m.getbbox()); m = m.resize((m.width, round(m.height * TALL)), Image.LANCZOS)
mbox = [round(MASCOT['middle_x'] - m.width / 2), GROUND - m.height]; mbox += [mbox[0] + m.width, mbox[1] + m.height]
shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(shadow).ellipse([mbox[0] + 10, GROUND - 14, mbox[2] - 10, GROUND + 12], fill=(60, 50, 40, 70))
paper.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8))); paper.alpha_composite(m, tuple(mbox[:2]))

os.makedirs(P + name, exist_ok=True)
paper.convert('RGB').save(P + name + '/layout.png')
json.dump({'pelican': box, 'sun': list(SUN), 'spark': SPARK, 'tall': TALL, 'mascot': mbox, 'ground': GROUND}, open(P + name + '/parts.json', 'w'), indent=1)
preview = paper.copy(); preview.alpha_composite(pel.resize((w, h), Image.LANCZOS), tuple(box[:2]))
preview.convert('RGB').resize((1366, 584), Image.LANCZOS).save(P + name + '/preview.jpg', quality=90)
# the mascot's reference for the image model: the icon's creature as it is, on ivory
ref = Image.new('RGBA', (1024, 1024), IVORY + (255,)); big = clawd(34, stride=False); ref.alpha_composite(big, ((1024 - big.width) // 2, (1024 - big.height) // 2))
ref.convert('RGB').save(P + 'refs/claude-clawd.jpg', quality=92)
print(name, 'layout made; the pelican goes to', box, '| the mascot at', mbox)
