"""Trial: the flat layout drawing for the Claude gear's lower panel, the user's third direction (on draft 2-B): the sun set
   large into the panel's far left corner so that only a quarter of it shows, its painted strokes only at that corner; the
   black speed lines gone (the puffs of dust stay); the rest as in draft 2 (layout_claude_base.py): the pelican's place and
   size, the mascot.   Writes <folder>/layout.png, parts.json and preview.jpg (with the pelican).
   Run with python3 -I: python3 -I layout_claude.py [<folder>]"""
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
C, P = S + 'inputs/claude/', S
name = sys.argv[1] if len(sys.argv) > 1 else 'claude-c1'
W, H = 2048, 876
TALL = 1.25
IVORY, CLAY, INK = (250, 249, 245), (217, 119, 87), (26, 24, 22)
REACH = 480                                        # how far the spark's rays reach from the corner (its middle is the corner)
RAYS = {'at': (5, 22, 39, 56, 73, 89), 'from': 1.13, 'to': 1.37}     # the painted strokes: degrees from the top edge round to the left edge
PELICAN = {'height': 610, 'middle': (1230, 440)}
GROUND = 794
MASCOT = {'height': 190, 'middle_x': 1752}
rnd = random.Random(7)

paper = Image.new('RGBA', (W, H), IVORY + (255,))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
halo = np.zeros((H, W, 4), np.uint8); r = np.hypot(xx, yy)
halo[..., :3] = (255, 226, 170); halo[..., 3] = (np.clip(1 - r / 900, 0, 1) ** 2 * 120).astype(np.uint8)
paper.alpha_composite(Image.fromarray(halo, 'RGBA'))
d = ImageDraw.Draw(paper)
for k, deg in enumerate(RAYS['at']):
    a = math.radians(deg + rnd.uniform(-3, 3))
    r0, r1, wide = REACH * RAYS['from'] + rnd.uniform(-10, 12), REACH * RAYS['to'] + rnd.uniform(-18, 16), rnd.uniform(44, 60)
    ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux
    pts = []
    for t, w in ((0, 0.55), (0.3, 1.0), (0.7, 0.9), (1, 0.4)):
        rr = r0 + (r1 - r0) * t; pts.append((ux * rr + px * wide * w / 2, uy * rr + py * wide * w / 2))
    for t, w in ((1, 0.4), (0.7, 0.9), (0.3, 1.0), (0, 0.55)):
        rr = r0 + (r1 - r0) * t; pts.append((ux * rr - px * wide * w / 2, uy * rr - py * wide * w / 2))
    d.polygon(pts, fill=((244, 180, 54) if k % 2 else (239, 152, 40)) + (255,))
spark = Image.open(C + 'png/lobe-claude-color.png').convert('RGBA').resize((2 * REACH, 2 * REACH), Image.LANCZOS)
quarter = spark.crop((REACH, REACH, 2 * REACH, 2 * REACH))            # its lower right quarter: the part on the sheet
paper.alpha_composite(quarter, (0, 0))

pel = Image.open(C + 'png/pelican-paper.png').convert('RGBA')
w, h = round(pel.width * PELICAN['height'] / pel.height), round(PELICAN['height'] * TALL)
box = [round(PELICAN['middle'][0] - w / 2), round(PELICAN['middle'][1] - h / 2)]; box += [box[0] + w, box[1] + h]
left = box[0]
for cx, cy, rr, fill in ((left - 60, GROUND - 26, 30, CLAY), (left - 130, GROUND - 16, 22, IVORY), (left - 196, GROUND - 30, 16, IVORY)):
    for dx, dy, k in ((-0.6, 0.1, 0.8), (0, -0.3, 1.0), (0.6, 0.1, 0.75)):
        d.ellipse([cx + dx * rr - rr * k, cy + dy * rr - rr * k, cx + dx * rr + rr * k, cy + dy * rr + rr * k], fill=fill + (255,), outline=INK + (255,), width=6)

def clawd(unit, stride=True):
    k = 4; u = unit * k
    im = Image.new('RGBA', (round(26 * u), round(18 * u)), (0, 0, 0, 0)); g = ImageDraw.Draw(im)
    box_ = lambda x0, y0, x1, y1, fill: g.rectangle([(x0 + 1) * u, (y0 - 4) * u, (x1 + 1) * u, (y1 - 4) * u], fill=fill)
    box_(3, 5, 21, 17.08, CLAY + (255,)); box_(0, 10.95, 24, 14.05, CLAY + (255,))
    lift = (1.1, 0, 0, 1.1) if stride else (0, 0, 0, 0)
    for x, up in zip((4.49, 7.49, 15, 18), lift): box_(x, 17.0, x + 1.51, 20 - up, CLAY + (255,))
    for x in (6, 16.51): box_(x, 8.1, x + 1.49, 10.95, INK + (255,))
    return im.resize((im.width // k, im.height // k), Image.LANCZOS)
m = clawd(MASCOT['height'] / 15).rotate(-7, expand=True, resample=Image.BICUBIC)
m = m.crop(m.getbbox()); m = m.resize((m.width, round(m.height * TALL)), Image.LANCZOS)
mbox = [round(MASCOT['middle_x'] - m.width / 2), GROUND - m.height]; mbox += [mbox[0] + m.width, mbox[1] + m.height]
shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(shadow).ellipse([mbox[0] + 10, GROUND - 14, mbox[2] - 10, GROUND + 12], fill=(60, 50, 40, 70))
paper.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8))); paper.alpha_composite(m, tuple(mbox[:2]))

os.makedirs(P + name, exist_ok=True)
paper.convert('RGB').save(P + name + '/layout.png')
json.dump({'pelican': box, 'reach': REACH, 'tall': TALL, 'mascot': mbox, 'ground': GROUND}, open(P + name + '/parts.json', 'w'), indent=1)
preview = paper.copy(); preview.alpha_composite(pel.resize((w, h), Image.LANCZOS), tuple(box[:2]))
preview.convert('RGB').resize((1366, 584), Image.LANCZOS).save(P + name + '/preview.jpg', quality=90)
print(name, 'layout made; the pelican goes to', box, '| the mascot at', mbox)
