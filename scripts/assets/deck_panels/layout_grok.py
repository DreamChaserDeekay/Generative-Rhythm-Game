"""Trial: the flat layout drawing for the GROK gear's lower panel, the user's second direction (on drafts 1-A / 1-B):
     - the Grok Bot "with the very feel of this picture" (the white one; the picture the user sent: inputs/grok/ref/bot-avatar.png),
       at the lower left, in 2D, large;
     - the Starship and the Doge a little larger, so that the SpaceX logo goes on the ship's hull; more of a fast-moving look;
     - at the upper right the Grok icon in the colour of Mars, about as large as the Bot.
   The Bot is drawn here from the picture's own measures (inputs/grok/ref/bot-avatar.json: the ball's circle, its two eyes, its
   shading), cut off by the panel's near edge where the picture's lower edge cuts it; what the picture's left edge cuts is
   behind the gear's left corner sticker. The icon is the official mark's own shape (inputs/ai/dl/lobe-grok.svg), filled with
   Mars's rust colours under the Bot's light. Both are flat prints. They are NOT drawn deeper than they are (TALL 1): the
   rule settled with the user draws flat lettering 1.25 times deeper but leaves emblems and round things as they are, and a
   ball drawn deeper is an egg on the two flat cameras. The rocket is a place-holder for the image model.
   What the direction leaves open and this drawing fills in (to be told to the user): the silver logo of the first drafts
   (the mark and the word Grok at the middle) is gone, the Mars-coloured icon being the logo now; the icon is a flat print
   like the Bot; the rocket flies from the Bot toward the icon, its nose over the icon's lower left.
   Run with python3 -I: python3 -I layout_grok.py <folder>"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
name = sys.argv[1]
W, H = 2048, 876
TALL = 1.0                                                          # the prints' depth against their width (see above)
#: the user's third direction: the Bot against the left corner, the icon against the right corner. The Bot lies as the user's
#: picture has it, cut by the panel's left edge (0.666 of the radius left of the middle) and by its near edge; larger, so that
#: what shows of it is about as large as before. A numbered grid shot on the four cameras (grok-grid) shows what the
#: corner stickers hide: at the Bot's eyes' depth x < 200 on the default camera and x < 300 on the flat ones; at the far
#: right corner x > 2000 (x > 1900 on the top-down camera): the icon keeps that much off the right edge.
BOT = {'centre': (266, 740), 'radius': 400}                        # the picture's lower cut (0.339 of the radius under the middle) is the panel's near edge
ICON = {'left': 1580, 'top': 14, 'wide': 405}
#: the first try's rocket came out larger than drawn and further left, and its flame ran across the Bot's eyes: the rocket is
#: drawn further right now (a clear gap of metal between the ball and the engines), its nose under the icon's lower left,
#: and its flame short enough to end at the ball's lower right rim, far under the eyes
SHIP = {'tail': (905, 772), 'nose': (1565, 532), 'wide': 122, 'flame': 240}
MARS = {'lit': (238, 132, 78), 'mid': (198, 80, 38), 'deep': (112, 40, 22)}
K = 3


def ground():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    along = xx + (yy - H / 2) * 0.5
    sheen = 9 * np.exp(-((along - 0.34 * W) / (0.16 * W)) ** 2) + 6 * np.exp(-((along - 0.80 * W) / (0.12 * W)) ** 2)
    g = np.stack([24 + sheen, 24 + sheen, 26 + sheen, np.full_like(xx, 255)], -1)
    return Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGBA')


def shade(u, v, coef):
    """The Bot picture's own shading: its brightness at a place on the ball (u to the right, v down, 1 at the rim)."""
    r2 = u * u + v * v
    return coef[0] + coef[1] * u + coef[2] * v + coef[3] * r2 + coef[4] * r2 ** 2 + coef[5] * u * r2 + coef[6] * v * r2 + coef[7] * r2 ** 4


def bot(R):
    """The Grok Bot as the user's picture has it: the ball with its soft shading and its two slanted black eyes."""
    m = json.load(open(S + 'inputs/grok/ref/bot-avatar.json')); n = 2 * R * 2
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32); u, v = (xx + 0.5) / (n / 2) - 1, (yy + 0.5) / (n / 2) - 1
    g = np.clip(shade(u, v, m['shade']), 150, 255)
    # (outside what the picture shows, left of its left cut, the fitted shading runs on smoothly into the ball's shaded side)
    a = np.clip((1 - np.hypot(u, v)) * (n / 2) + 0.5, 0, 1)
    im = Image.fromarray(np.stack([g, g, g, a * 255], -1).astype(np.uint8), 'RGBA'); d = ImageDraw.Draw(im)
    for e in m['eyes']:
        cx, cy = (e['centre'][0] + 1) * n / 2, (e['centre'][1] + 1) * n / 2
        wd, half = e['wide'] * n / 2, (e['length'] - e['wide']) * n / 4
        ax, ay = math.cos(math.radians(e['angle'])), math.sin(math.radians(e['angle']))
        p0, p1 = (cx - ax * half, cy - ay * half), (cx + ax * half, cy + ay * half)
        d.line([p0, p1], fill=(10, 10, 10, 255), width=round(wd))
        for p in (p0, p1): d.ellipse([p[0] - wd / 2, p[1] - wd / 2, p[0] + wd / 2, p[1] + wd / 2], fill=(10, 10, 10, 255))
    return im.resize((2 * R, round(2 * R * TALL)), Image.LANCZOS)


def icon(wide):
    """The Grok mark in the colours of Mars: rust lit from the upper right as the Bot is, with the planet's soft darker
       markings."""
    m = json.load(open(S + 'inputs/grok/ref/bot-avatar.json'))
    mark = Image.open(S + 'inputs/grok/png/lobe-grok-ffffff.png').convert('RGBA'); mark = mark.crop(mark.getbbox())
    n = 2 * wide; mark = mark.resize((n, round(n * mark.height / mark.width)), Image.LANCZOS); h = mark.height
    yy, xx = np.mgrid[0:h, 0:n].astype(np.float32); u, v = (xx + 0.5) / (n / 2) - 1, (yy + 0.5) / (h / 2) - 1
    lit = np.clip((shade(u * 0.8, v * 0.8, m['shade']) - 150) / 105, 0, 1)                       # 0 in the shade, 1 in the light
    rng = np.random.default_rng(7)
    from_noise = lambda s: (lambda f: (f - f.mean()) / (f.std() + 1e-6))(np.asarray(Image.fromarray((rng.random((h // s + 2, n // s + 2)) * 255).astype(np.uint8)).resize((n, h), Image.BICUBIC), dtype=np.float32))
    marks = np.clip(0.5 + 0.5 * from_noise(46) + 0.25 * from_noise(18), 0, 1)                      # the planet's markings
    lit = np.clip(lit * (0.9 + 0.16 * marks), 0, 1)                                                # (calm: a hint of the planet's face, not a pattern)
    col = np.where(lit[..., None] < 0.5, np.array(MARS['deep']) + (np.array(MARS['mid']) - np.array(MARS['deep'])) * (lit[..., None] * 2),
                   np.array(MARS['mid']) + (np.array(MARS['lit']) - np.array(MARS['mid'])) * (lit[..., None] * 2 - 1))
    out = np.concatenate([col, np.asarray(mark)[..., 3:4].astype(np.float32)], -1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').resize((wide, round(wide * h / n * TALL)), Image.LANCZOS)


def rocket(L, wd, F):
    """A place-holder: the Doge on the Starship from above, the nose to the right; the flame and the speed lines behind it;
       the SpaceX word on the hull before the dog. Returns the picture and where the tail's middle is in it."""
    L, wd, F = round(L * K), round(wd * K), round(F * K)
    pad = 170 * K; cw, ch = F + L + 2 * pad, 2 * pad + wd + 220 * K
    im = Image.new('RGBA', (cw, ch), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x0, cy = pad + F, ch // 2
    for off, lng, a in ((-1.5, 0.9, 120), (-0.9, 1.0, 90), (0.95, 0.8, 100), (1.6, 0.6, 120), (-2.2, 0.7, 70)):   # speed lines, none of them as far back as the ball
        d.line([(x0 - F * lng, cy + off * wd), (x0 + L * 0.25, cy + off * wd)], fill=(225, 232, 245, a), width=2 * K)
    yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
    t = np.clip((x0 - xx) / F, 0, 1)
    half = wd * (0.36 + 0.5 * np.sin(t * math.pi) ** 0.8) * (1 - t ** 3)
    inside = np.clip(1 - np.abs(yy - cy) / np.maximum(half, 1), 0, 1) * (xx < x0) * (t < 1)
    stops = [(0.0, (235, 245, 255)), (0.18, (150, 190, 255)), (0.45, (190, 120, 255)), (0.7, (255, 150, 60)), (1.0, (255, 90, 20))]
    col = np.zeros((ch, cw, 3), np.float32)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        m = (t >= t0) & (t <= t1); f = ((t - t0) / (t1 - t0))[m]
        for k in range(3): col[..., k][m] = c0[k] + (c1[k] - c0[k]) * f
    core = np.clip(inside * 2.2, 0, 1) ** 1.5
    for k in range(3): col[..., k] = col[..., k] + (255 - col[..., k]) * core * (1 - t) * 0.8
    fl = np.concatenate([col, (np.clip(inside * 1.6, 0, 1) * (1 - t ** 2) * 255)[..., None]], -1)
    im.alpha_composite(Image.fromarray(np.clip(np.nan_to_num(fl), 0, 255).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(3 * K)))
    d = ImageDraw.Draw(im)
    dark, steel, edge = (58, 60, 66, 255), (198, 202, 208, 255), (120, 124, 132, 255)
    for s in (-1, 1):
        d.polygon([(x0 + 6 * K, cy + s * wd * 0.5), (x0 + 0.27 * L, cy + s * wd * 0.5), (x0 + 0.2 * L, cy + s * wd * 1.12), (x0 + 2 * K, cy + s * wd * 1.12)], fill=dark)
        d.polygon([(x0 + 0.68 * L, cy + s * wd * 0.48), (x0 + 0.84 * L, cy + s * wd * 0.36), (x0 + 0.78 * L, cy + s * wd * 0.86), (x0 + 0.7 * L, cy + s * wd * 0.9)], fill=dark)
    nose = [(x0 + 0.72 * L + 0.28 * L * math.sin(a), cy - wd / 2 * math.cos(a)) for a in np.linspace(0, math.pi, 40)]
    d.polygon([(x0, cy - wd / 2), (x0 + 0.72 * L, cy - wd / 2)] + nose + [(x0 + 0.72 * L, cy + wd / 2), (x0, cy + wd / 2)], fill=steel, outline=edge)
    d.rectangle([x0, cy - wd * 0.22, x0 + 0.86 * L, cy - wd * 0.08], fill=(232, 235, 240, 255))
    d.rectangle([x0 - 5 * K, cy - wd * 0.4, x0 + 5 * K, cy + wd * 0.4], fill=(40, 40, 44, 255))
    logo = Image.open(S + 'inputs/grok/png/commons-SpaceX-Logo.png').convert('RGBA')                   # the word on the hull, before the dog
    lw = round(0.27 * L); logo = logo.resize((lw, round(lw * logo.height / logo.width)), Image.LANCZOS)
    ink = Image.new('RGBA', logo.size, (18, 30, 52, 0)); ink.putalpha(logo.getchannel('A'))
    im.alpha_composite(ink, (round(x0 + 0.5 * L), round(cy + wd * 0.06)))
    d = ImageDraw.Draw(im)
    tan, cream = (226, 176, 104, 255), (250, 238, 214, 255)
    bx = x0 + 0.34 * L                                               # the dog, astride the aft half
    d.ellipse([bx - 0.17 * L, cy - wd * 0.92, bx + 0.11 * L, cy + wd * 0.92], fill=tan)
    for s in (-1, 1): d.ellipse([bx - 0.08 * L, cy + s * wd * 0.8 - wd * 0.22, bx + 0.05 * L, cy + s * wd * 0.8 + wd * 0.22], fill=tan)
    hx = bx + 0.14 * L
    for s in (-1, 1): d.polygon([(hx - 0.02 * L, cy + s * wd * 0.42), (hx + 0.04 * L, cy + s * wd * 0.98), (hx + 0.08 * L, cy + s * wd * 0.5)], fill=(196, 140, 76, 255))
    d.ellipse([hx - 0.08 * L, cy - wd * 0.72, hx + 0.09 * L, cy + wd * 0.72], fill=tan)
    d.ellipse([hx + 0.01 * L, cy - wd * 0.38, hx + 0.11 * L, cy + wd * 0.38], fill=cream)
    d.ellipse([hx + 0.085 * L, cy - wd * 0.1, hx + 0.115 * L, cy + wd * 0.1], fill=(30, 26, 26, 255))
    for s in (-1, 1): d.ellipse([hx + 0.0 * L, cy + s * wd * 0.34 - wd * 0.07, hx + 0.022 * L, cy + s * wd * 0.34 + wd * 0.07], fill=(30, 26, 26, 255))
    d.ellipse([bx - 0.22 * L, cy - wd * 0.3, bx - 0.13 * L, cy + wd * 0.3], fill=cream)
    return im, (x0, cy)


base = ground(); parts = {}
# the two prints
b = bot(BOT['radius']); x, y = BOT['centre'][0] - BOT['radius'], round(BOT['centre'][1] - BOT['radius'] * TALL)
layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); layer.alpha_composite(b, (x, y)); os.makedirs(S + name, exist_ok=True); layer.save(S + name + '/bot.png')   # the Bot's print alone
base.alpha_composite(b, (x, y)); parts['bot'] = {'box': [x, y, x + b.width, y + b.height], 'centre': BOT['centre'], 'radius': BOT['radius'], 'tall': TALL}
ic = icon(ICON['wide']); layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); layer.alpha_composite(ic, (ICON['left'], ICON['top'])); layer.save(S + name + '/icon.png')   # the emblem's print alone
base.alpha_composite(ic, (ICON['left'], ICON['top'])); parts['icon'] = [ICON['left'], ICON['top'], ICON['left'] + ic.width, ICON['top'] + ic.height]
prints = base.copy()
# the rocket over them
dx, dy = SHIP['nose'][0] - SHIP['tail'][0], SHIP['tail'][1] - SHIP['nose'][1]
long, angle = math.hypot(dx, dy), math.degrees(math.atan2(dy, dx))
r, (tx, ty) = rocket(long, SHIP['wide'], SHIP['flame'])
c = (r.width / 2, r.height / 2); a = math.radians(angle)
r2 = r.rotate(angle, expand=True, resample=Image.BICUBIC)
ox, oy = tx - c[0], ty - c[1]
px, py = r2.width / 2 + ox * math.cos(a) + oy * math.sin(a), r2.height / 2 - ox * math.sin(a) + oy * math.cos(a)
r2 = r2.resize((round(r2.width / K), round(r2.height / K)), Image.LANCZOS)
x, y = round(SHIP['tail'][0] - px / K), round(SHIP['tail'][1] - py / K)
base.alpha_composite(r2, (x, y)); box = r2.getbbox()
parts['rocket'] = {'box': [x + box[0], y + box[1], x + box[2], y + box[3]], 'tail': SHIP['tail'], 'nose': SHIP['nose'], 'long': round(long), 'angle': round(angle, 1)}
P = S + name + '/'; os.makedirs(P, exist_ok=True)
base.convert('RGB').save(P + 'layout.png'); prints.convert('RGB').save(P + 'prints.png'); json.dump(parts, open(P + 'parts.json', 'w'), indent=1)
base.convert('RGB').resize((1366, 584), Image.LANCZOS).save(P + 'layout-view.jpg', quality=90)
print(name, parts)
