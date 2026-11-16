"""Trial: the flat layout drawings for the STEEL gear's lower panel (skin 6; the user: "3, 4 뽑아봐. 글자는 비워두고."):
     steel-a3  the reference's console: a two-step body of dark blue-grey brushed metal (the face, then a darker shelf a
               step lower with an engraved rule, a blue light window at its right corner and three embossed circles); its
               two number capsules are LED level meters here (green, blue);
     steel-a4  the same body read as a hi-fi amplifier: the two capsules are dark glass with one small lamp each, and in
               place of the embossed circles lies a machined aluminium knob.
   The face's lettering is left out (the user's choice), and so are the reference's numbers (the game writes its numbers
   beside the gear). The reference (the user's picture, images/9.webp) is not copied here: its console is drawn again,
   wider, in this panel's own shape (2048 x 876). The slot that glows blue under the middle keys is the game's own (the
   band over the panel): it is not drawn again.
   Run with python3 -I: python3 -I layout_steel.py"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
P = S
W, H = 2048, 876
K = 2
FACE, LEDGE = 318, 22                      # the face's depth, the step down to the shelf
TOP = FACE + LEDGE                         # the shelf's far edge
BLUE, GREEN, LAMP_BLUE = (70, 170, 240), (84, 236, 92), (72, 150, 255)
WINDOW = [(1500, TOP), (W, TOP), (W, TOP + 128), (1596, TOP + 128)]         # the light window at the shelf's right corner
RULE = {'y': TOP + 116, 'from': 92, 'to': 1330}
CAPS = [(96, 566, 632, 700), (716, 566, 1368, 700)]                         # the two capsules (left, top, right, bottom)
RINGS = {'middle': (1790, 706), 'radius': 58, 'spread': 70}                 # the three embossed circles
KNOB = {'middle': (1786, 690), 'radius': 148}


def body():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    o = np.zeros((H, W, 3), np.float32)
    face = np.array([46, 54, 66], np.float32) + (np.array([40, 46, 57]) - np.array([46, 54, 66])) * (xx / W)[..., None] * 0.4
    haze = np.exp(-(((xx - 1500) / 620) ** 2 + ((yy - FACE) / 170) ** 2))                    # the blue light on the face, from the shelf's window
    face = face + (np.array([40, 92, 156]) - face) * (haze * 0.62)[..., None]
    shelf = np.array([30, 36, 45], np.float32) + (np.array([19, 23, 30]) - np.array([30, 36, 45])) * np.clip((yy - TOP) / (H - TOP), 0, 1)[..., None]
    o[:] = np.where((yy < FACE)[..., None], face, shelf)
    im = Image.fromarray(np.clip(o, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    d = ImageDraw.Draw(im)
    d.rectangle([0, FACE, W, FACE + 5], fill=(104, 118, 138, 255))                          # the face's near edge, catching the light
    d.rectangle([0, FACE + 6, W, TOP - 1], fill=(6, 8, 11, 255))                            # the step's shadow
    d.rectangle([0, 0, W, 5], fill=(84, 96, 114, 255))                                      # the lip under the keys
    return im


def window(im):
    """The light window at the shelf's right corner: dark glass cut at a slant, glowing blue from inside."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    glow = np.exp(-(((xx - 1830) / 250) ** 2 + ((yy - (TOP + 128)) / 96) ** 2))
    g = np.array([8, 24, 44], np.float32) + (np.array(BLUE, np.float32) - np.array([8, 24, 44])) * glow[..., None]
    lit = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    mask = Image.new('L', (W * K, H * K), 0); ImageDraw.Draw(mask).polygon([(x * K, y * K) for x, y in WINDOW], fill=255)
    im.paste(lit, (0, 0), mask.resize((W, H), Image.LANCZOS))
    d = ImageDraw.Draw(im)
    d.line(WINDOW + [WINDOW[0]], fill=(4, 6, 9, 255), width=5)
    halo = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(halo).ellipse([1560, TOP + 60, 2100, TOP + 300], fill=BLUE + (70,))
    spill = Image.new('L', (W, H), 0); ImageDraw.Draw(spill).rectangle([0, TOP + 130, W, H], fill=255)     # its light on the shelf under it
    im.paste(Image.alpha_composite(im, halo.filter(ImageFilter.GaussianBlur(50))), (0, 0), spill)


def rule(d):
    """The engraved rule along the shelf, two dots and a dash after its end."""
    y = RULE['y']
    d.rectangle([RULE['from'], y - 3, RULE['to'], y + 2], fill=(5, 7, 10, 255)); d.rectangle([RULE['from'], y + 3, RULE['to'], y + 4], fill=(58, 68, 82, 255))
    for x in (RULE['to'] + 44, RULE['to'] + 72): d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(5, 7, 10, 255))
    d.rounded_rectangle([RULE['to'] + 104, y - 6, RULE['to'] + 150, y + 6], radius=6, fill=(5, 7, 10, 255))


def capsule(d, box):
    l, t, r, b = box
    d.rounded_rectangle([l - 5, t - 5, r + 5, b + 5], radius=(b - t) // 2 + 5, fill=(62, 72, 88, 255))      # its bevelled rim
    d.rounded_rectangle(box, radius=(b - t) // 2, fill=(7, 9, 13, 255))


def meter(d, box, colour, count, lit):
    """A capsule as an LED level meter: a row of upright bars, the first `lit` of them alight."""
    l, t, r, b = box; capsule(d, box)
    pad = (b - t) // 2 - 6; room = r - l - 2 * pad; gap = 9; w = (room - gap * (count - 1)) / count
    dim = tuple(round(c * 0.16) for c in colour)
    for k in range(count):
        x = l + pad + k * (w + gap)
        d.rounded_rectangle([x, t + 28, x + w, b - 28], radius=4, fill=(colour if k < lit else dim) + (255,))


def lamp(d, box, colour):
    """A capsule as a pane of dark glass with one small lamp at its left end."""
    l, t, r, b = box; capsule(d, box)
    c = (l + (b - t) // 2 + 8, (t + b) // 2)
    d.ellipse([c[0] - 21, c[1] - 21, c[0] + 21, c[1] + 21], fill=colour + (255,))
    d.line([(c[0] + 70, t + 26), (r - 60, t + 26)], fill=(40, 48, 60, 255), width=4)                        # a line of light on the glass


def rings(d):
    """Three circles pressed into the metal, tone on tone."""
    (cx, cy), r, s = RINGS['middle'], RINGS['radius'], RINGS['spread']
    for a in (-90, 30, 150):
        x, y = cx + s * math.cos(math.radians(a)), cy + s * math.sin(math.radians(a))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(15, 18, 24, 255), outline=(60, 70, 86, 255), width=5)


def knob(im):
    """A machined aluminium knob lying on the shelf: its knurled rim, its brushed face, an index line; ticks round it."""
    (cx, cy), r = KNOB['middle'], KNOB['radius']
    n = (r + 60) * 2 * K; c = n / 2
    k = Image.new('RGBA', (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(k)
    for i in range(13):                                                                    # the ticks engraved round it
        a = math.radians(135 + i * 22.5)
        d.line([(c + (r + 22) * K * math.cos(a), c + (r + 22) * K * math.sin(a)), (c + (r + 44) * K * math.cos(a), c + (r + 44) * K * math.sin(a))], fill=(84, 96, 114, 255), width=4 * K)
    d.ellipse([c - (r + 8) * K, c - (r + 8) * K, c + (r + 8) * K, c + (r + 8) * K], fill=(6, 8, 11, 255))
    d.ellipse([c - r * K, c - r * K, c + r * K, c + r * K], fill=(118, 128, 142, 255))
    for i in range(72):                                                                    # the knurling
        a = math.radians(i * 5)
        d.line([(c + (r - 20) * K * math.cos(a), c + (r - 20) * K * math.sin(a)), (c + r * K * math.cos(a), c + r * K * math.sin(a))], fill=(70, 78, 90, 255), width=2 * K)
    d.ellipse([c - (r - 22) * K, c - (r - 22) * K, c + (r - 22) * K, c + (r - 22) * K], fill=(160, 170, 184, 255), outline=(204, 212, 224, 255), width=3 * K)
    a = math.radians(-125)
    d.line([(c + 46 * K * math.cos(a), c + 46 * K * math.sin(a)), (c + (r - 30) * K * math.cos(a), c + (r - 30) * K * math.sin(a))], fill=(246, 249, 252, 255), width=9 * K)
    k = k.resize((n // K, n // K), Image.LANCZOS)
    im.alpha_composite(k, (cx - k.width // 2, cy - k.height // 2))


def layout(name, amp):
    im = body(); window(im); d = ImageDraw.Draw(im); rule(d)
    if amp:
        lamp(d, CAPS[0], GREEN); lamp(d, CAPS[1], LAMP_BLUE); knob(im)
    else:
        meter(d, CAPS[0], GREEN, 13, 9); meter(d, CAPS[1], LAMP_BLUE, 16, 12); rings(d)
    os.makedirs(P + name, exist_ok=True)
    im.convert('RGB').save(P + name + '/layout.png')
    json.dump({'face': FACE, 'shelf': TOP, 'window': WINDOW, 'rule': RULE, 'capsules': CAPS, **({'knob': KNOB} if amp else {'rings': RINGS})}, open(P + name + '/parts.json', 'w'), indent=1)
    return im.convert('RGB')


a, b = layout('steel-a3', False), layout('steel-a4', True)
sheet = Image.new('RGB', (W, 2 * H + 10), (90, 90, 90)); sheet.paste(a, (0, 0)); sheet.paste(b, (0, H + 10))
sheet.resize((1280, round(sheet.height * 1280 / W)), Image.LANCZOS).save(P + 'steel-a-layouts.jpg', quality=90); print('layouts made')
