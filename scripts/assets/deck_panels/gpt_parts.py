"""The parts the GPT gear's layout drawings are put together from (trial): the white slab, the emblem, lettering in the
   game's own font, the reset button (plain, or inside a ring gauge), a straight gauge bar, plates. Flat drawings in the
   panel's own pixels (2048 x 876); what lies flat and is neither the emblem nor round is drawn TALL times deeper than it
   is, as the default camera shows the panel pressed."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from paths import R
W, H = 2048, 876
TALL = 1.25
FONT = R + 'client/src/assets/fonts/PretendardVariable.woff2'
GREEN = (16, 163, 127)
LED = (30, 205, 140)
INK = (22, 22, 26, 255)


def font(size, weight):
    f = ImageFont.truetype(FONT, round(size)); f.set_variation_by_axes([weight]); return f


def glow(base, xy, r, colour, a):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot((xx - xy[0]) / r[0], (yy - xy[1]) / r[1])
    arr = np.zeros((H, W, 4), np.uint8); arr[..., :3] = colour; arr[..., 3] = (np.clip(1 - d, 0, 1) ** 2 * 255 * a).astype(np.uint8)
    base.alpha_composite(Image.fromarray(arr, 'RGBA'))


def slab():
    """The white look: a milk-white slab, pastel light at its sides (the draft the user chose)."""
    s = Image.new('RGBA', (W, H), (244, 244, 246, 255))
    for xy, r, col in (((120, 200), (760, 620), (214, 202, 231)), ((1930, 180), (760, 620), (171, 229, 252)), ((200, 800), (800, 560), (234, 179, 216)), ((1880, 820), (800, 560), (216, 181, 169))):
        glow(s, xy, r, col, 0.95)
    return s


def put(base, patch, centre, shade=0.0):
    """A patch with its middle at a place, over a soft shadow toward the camera. Returns its box."""
    x, y = round(centre[0] - patch.width / 2), round(centre[1] - patch.height / 2)
    if shade:
        a = patch.getchannel('A').point(lambda v: int(v * shade))
        sh = Image.new('RGBA', patch.size, (40, 40, 60, 0)); sh.putalpha(a)
        pad = Image.new('RGBA', (patch.width + 80, patch.height + 80), (0, 0, 0, 0)); pad.alpha_composite(sh, (40, 40))
        base.alpha_composite(pad.filter(ImageFilter.GaussianBlur(11)), (x - 40 + 8, y - 40 + 14))
    base.alpha_composite(patch, (x, y))
    return [x, y, x + patch.width, y + patch.height]


def tall(patch, k=TALL):
    return patch.resize((patch.width, round(patch.height * k)), Image.LANCZOS)


def emblem(ai, h):
    e = Image.open(ai + 'png/commons-OpenAI_logo_2025_(symbol)-000000.png').convert('RGBA')
    return e.resize((round(e.width * h / e.height), h), Image.LANCZOS)


def letters(text, size, weight, fill, track=0.0):
    f = font(size, weight); probe = ImageDraw.Draw(Image.new('RGBA', (8, 8)))
    wide = [probe.textlength(c, font=f) for c in text]
    w = round(sum(wide) + track * size * (len(text) - 1)) + 8
    im = Image.new('RGBA', (w, round(size * 1.3)), (0, 0, 0, 0)); d = ImageDraw.Draw(im); x = 4
    for c, cw in zip(text, wide):
        d.text((x, size * 0.08), c, font=f, fill=fill); x += cw + track * size
    return im.crop(im.getbbox())


def button(D, word=None):
    """The reset button from above: a chrome collar, a dark well, a red dome (with the word on it). 1.26 D across."""
    k = 4; n = round(D * 1.26) * k; c = n / 2
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.hypot(xx - c, yy - c)
    out = np.zeros((n, n, 4), np.float32)
    def ring(lo, hi, colour):
        m = (r >= lo) & (r < hi); out[m, :3] = colour; out[m, 3] = 255
    ring(0, n / 2 - 1, (150, 154, 162)); ring(0, n / 2 - 3 * k, (214, 218, 224)); ring(0, D * 0.55 * k, (26, 26, 30))
    dome = r < D * 0.5 * k
    lit = np.clip(1 - np.hypot(xx - (c - D * 0.14 * k), yy - (c - D * 0.17 * k)) / (D * 0.62 * k), 0, 1)
    for ch, (deep, bright) in enumerate(zip((150, 10, 14), (255, 74, 58))): out[..., ch][dome] = (deep + (bright - deep) * lit ** 1.3)[dome]
    out[..., 3][dome] = 255
    im = Image.fromarray(out.astype(np.uint8), 'RGBA').resize((n // k, n // k), Image.LANCZOS)
    shine = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(shine); m = im.width / 2
    d.ellipse([m - D * 0.3, m - D * 0.36, m + D * 0.06, m - D * 0.14], fill=(255, 255, 255, 120))
    im.alpha_composite(shine.filter(ImageFilter.GaussianBlur(D * 0.035)))
    if word:
        t = letters(word, D * 0.2, 800, (255, 255, 255, 255), 0.06)
        im.alpha_composite(t, (round(m - t.width / 2), round(m - t.height / 2 + D * 0.03)))
    return im


def ringbutton(D, share, word=None):
    """The reset button inside a ring gauge: round the collar a dark channel, lit green for `share` of the way round
       (clockwise from the top); under it all a low silver base. 1.9 D across."""
    k = 4; n = round(D * 1.9) * k; c = n / 2
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    disc = lambda r, fill: d.ellipse([c - r, c - r, c + r, c + r], fill=fill)
    disc(n / 2 - 1, (150, 154, 162, 255)); disc(n / 2 - 3 * k, (222, 225, 230, 255))
    out, inn = D * 0.86 * k, D * 0.69 * k
    disc(out, (44, 46, 50, 255))
    d.pieslice([c - out, c - out, c + out, c + out], -90, -90 + 360 * share, fill=LED + (255,))
    mid, half = (out + inn) / 2, (out - inn) / 2
    for a in (-90, -90 + 360 * share):   # the lit part's round ends
        x, y = c + mid * np.cos(np.radians(a)), c + mid * np.sin(np.radians(a))
        d.ellipse([x - half, y - half, x + half, y + half], fill=LED + (255,))
    disc(inn, (222, 225, 230, 255))
    im = im.resize((n // k, n // k), Image.LANCZOS)
    b = button(D, word); im.alpha_composite(b, ((im.width - b.width) // 2, (im.height - b.height) // 2))
    return im


def bar(L, T, share):
    """A straight gauge: a dark slot with round ends, lit green for `share` of its length from the left."""
    k = 4; im = Image.new('RGBA', (L * k, T * k), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, L * k - 1, T * k - 1], T * k / 2, fill=(44, 46, 50, 255), outline=(120, 124, 132, 255), width=2 * k)
    e = 5 * k; d.rounded_rectangle([e, e, e + (L * k - 2 * e) * share, T * k - 1 - e], (T * k - 2 * e) / 2, fill=LED + (255,))
    return im.resize((L, T), Image.LANCZOS)


def plate(w, h, r=30, top=(240, 242, 246), bottom=(206, 210, 216), edge=(150, 154, 160)):
    g = np.linspace(0, 1, h)[:, None, None]
    grad = (np.array(top) * (1 - g) + np.array(bottom) * g) * np.ones((1, w, 1))
    im = Image.fromarray(grad.astype(np.uint8), 'RGB').convert('RGBA')
    mask = Image.new('L', (w, h), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255); im.putalpha(mask)
    ImageDraw.Draw(im).rounded_rectangle([0, 0, w - 1, h - 1], r, outline=edge + (255,), width=3)
    return im


def screen(w, h, name, left, share, fs):
    """A small display (before it is drawn TALL): dark glass, the limit's name, what is left of it, a bar."""
    k = 2; im = Image.new('RGBA', (w * k, h * k), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w * k - 1, h * k - 1], 20 * k, fill=(27, 27, 30, 255), outline=(78, 78, 86, 255), width=2 * k)
    pad = round(fs * 0.6) * k
    d.text((pad, pad * 0.8), name, font=font(fs * k, 600), fill=(236, 236, 240, 255))
    d.text((pad, pad * 0.8 + fs * k * 1.3), left, font=font(fs * 1.15 * k, 800), fill=(255, 255, 255, 255))
    by, bh = h * k - pad - round(fs * 0.5) * k, round(fs * 0.5) * k
    d.rounded_rectangle([pad, by, w * k - pad, by + bh], bh / 2, fill=(62, 62, 68, 255))
    d.rounded_rectangle([pad, by, pad + (w * k - 2 * pad) * share, by + bh], bh / 2, fill=LED + (255,))
    return im.resize((w, h), Image.LANCZOS)
