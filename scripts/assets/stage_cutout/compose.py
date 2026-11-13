"""A side picture of the Firestarter gear with its two characters alone: the illustration's own px inside the cut-out the image
model made of it, the model's px where the illustration has none (above its top edge) or where the model took away something
that lay over a character, and nothing else.

    python3 compose.py <work dir> <piece> <try> [--mend <try of the mending> x,y,w,h] [--cut x,y,w,h ...]

`--mend`: a part of a character that a removed figure hid, painted by the model on the cut-out itself (mend.py): taken inside
that box of the canvas only. `--cut`: a box of the canvas left out of the picture.
Writes <piece>-final.png (the picture, RGBA, the size the game has it), <piece>-cut-<try>.png (the figure on green over the
whole canvas: what a mending request is given) and views."""
import json, os, sys
S = sys.argv[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from laid import laid, key
import geom

name, n = sys.argv[2], sys.argv[3]
cuts, mend = [], None
rest = sys.argv[4:]
while rest:
    flag = rest.pop(0)
    if flag == '--mend':
        mend = (rest.pop(0), tuple(int(v) for v in rest.pop(0).split(',')))
    elif flag == '--cut':
        while rest and not rest[0].startswith('--'):
            cuts.append(tuple(int(v) for v in rest.pop(0).split(',')))
    else:
        raise SystemExit('unknown ' + flag)

#: how far the low-pass difference between the illustration and the cut-out goes before the cut-out's px are taken (0..255)
T1, T2 = 26.0, 46.0
#: px of the canvas round the figure's outline that take their colour from further inside (they are mixed with what was behind)
RIM = 3
#: how far from a px well inside the figure an outline px may be to take its colour (px of the canvas)
REACH = 9
#: the share of the picture's width over which what reaches its outer edge fades
FADE = 0.05
#: over how many px of the figure its own px go over into a mending's, toward the part the mending added (px of the canvas)
JOIN = 44
#: a part of the figure smaller than this is a speck (px of the canvas)
SPECK = 900


def figure(b):
    """A cut-out's matte (0..1, specks dropped) and its colours with the green taken out of its edges."""
    raw = key(b)
    solid = raw > 0.5
    lab, k = ndi.label(solid)
    areas = ndi.sum(solid, lab, np.arange(1, k + 1))
    big = np.isin(lab, 1 + np.flatnonzero(areas >= SPECK))
    al = raw * ndi.binary_dilation(big, iterations=5)
    # b = alpha F + (1 - alpha) G, G the flat green as the model painted it
    green = b[raw < 0.02].mean(0)
    f = np.clip((b - (1 - al[..., None]) * green) / np.maximum(al, 0.3)[..., None], 0, 255)
    # where too little of the figure is in a px to tell its colour, the colour of the nearest px that has enough of it
    _, (iy, ix) = ndi.distance_transform_edt(al < 0.3, return_indices=True)
    f = f[iy, ix]
    # no green left by the outline: within a few px of it the green channel is no more than the larger of the others
    edge = ndi.binary_dilation(al < 0.5, iterations=6)
    f[..., 1] = np.where(edge, np.minimum(f[..., 1], np.maximum(f[..., 0], f[..., 2])), f[..., 1])
    return al, f, int((areas >= SPECK).sum()), int((areas < SPECK).sum())


def low(x):
    return np.stack([ndi.gaussian_filter(x[..., c], 2.5) for c in range(3)], -1)


def matched(f, to, where):
    """f with a gain and an offset a channel that bring its colours to `to`'s, fitted on the px of `where` that agree; and how the two differ then."""
    agree = where & (np.abs(low(to) - low(f)).max(-1) < 14)
    fit = []
    f = f.copy()
    for c in range(3):
        g, o = np.polyfit(f[agree][:, c], to[agree][:, c], 1)
        fit.append((round(float(g), 4), round(float(o), 2)))
        f[..., c] = np.clip(f[..., c] * g + o, 0, 255)
    return f, np.abs(low(to) - low(f)).max(-1), fit, int(agree.sum())


def outlined(c, al, own):
    """c with its outline recoloured. A px on the outline is a mix with what was behind it (the illustration's background, the
    cut-out's green), so the px within RIM of the outline and outside it take the colour of the nearest px well inside the figure.
    A part too thin to have such a px near it (a claw's tip, a strand of hair) keeps the cut-out's own colour (`own`), the green
    taken out of it."""
    dist = ndi.distance_transform_edt(al > 0.5)
    deep = dist >= RIM
    far, (jy, jx) = ndi.distance_transform_edt(~deep, return_indices=True)
    spread = (~deep) & (far <= REACH)
    thin = (~deep) & (far > REACH)
    c = c.copy()
    c[thin] = own[thin]
    c[spread] = c[jy[spread], jx[spread]]
    return c, int((spread & (al > 0.02)).sum()), int((thin & (al > 0.02)).sum())


def ramp(d):
    t = np.clip((d - T1) / (T2 - T1), 0, 1)
    return ndi.gaussian_filter(ndi.maximum_filter(t * t * (3 - 2 * t), size=5), 2.0)


a, b = laid(S, name, n)
H, W = a.shape[:2]
L = geom.layout(name)
top = L['art'][1]
px0, _, px1, _ = L['picture']
yy, xx = np.mgrid[0:H, 0:W]

al, f, parts, specks = figure(b)
for x, y, w, h in cuts:
    al[y:y + h, x:x + w] = 0
inside = ndi.binary_erosion(al > 0.98, iterations=10)
inside[:top + 12] = False
f, D, fit, agreeing = matched(f, a, inside)
print('figure parts', parts, 'specks dropped', specks, '| agreeing px', agreeing, 'of', int(inside.sum()), 'fit', fit)
print('difference inside: median', np.median(D[inside]).round(1), 'p90', np.percentile(D[inside], 90).round(1), 'p99', np.percentile(D[inside], 99).round(1), 'share over T1', (D[inside] > T1).mean().round(4))

# whose px: 0 the illustration's, 1 the cut-out's. The cut-out's where the two differ, and above the illustration's top edge
w_rim = np.clip((RIM + 4 - ndi.distance_transform_edt(al > 0.5)) / 4, 0, 1)
w = np.maximum(np.maximum(ramp(D), w_rim), np.clip((top + 20 - yy) / 16, 0, 1))
w[:top] = 1
c, recoloured, thin_px = outlined(a * (1 - w[..., None]) + f * w[..., None], al, f)
record = {'try': n, 'fit': fit, 'T': [T1, T2], 'rim': RIM, 'reach': REACH, 'fade': FADE, 'cut': cuts}

# the figure on flat green over the whole canvas, as a request to mend it is given it
tight = np.clip((al - 0.1) / 0.86, 0, 1)[..., None]
on_green = np.empty_like(c); on_green[:] = (0, 255, 0)
Image.fromarray(np.clip(on_green * (1 - tight) + c * tight, 0, 255).astype(np.uint8)).save(f'{S}/work/{name}-cut-{n}.png')

mended = np.zeros((H, W), np.float32)
if mend:
    m_try, (bx, by, bw, bh) = mend
    _, b2 = laid(S, name, m_try, ref=f'cut-{n}')
    al2, f2, _, _ = figure(b2)
    both = ndi.binary_erosion((al > 0.98) & (al2 > 0.98), iterations=10)
    f2, D2, fit2, agreeing2 = matched(f2, c, both)
    # inside the box: the mending's px where the figure had none, and where the mending changed it
    box = np.zeros((H, W), np.float32); box[by:by + bh, bx:bx + bw] = 1
    box = np.minimum(ndi.gaussian_filter(box, 10), box)
    w2 = np.maximum(ramp(D2), ndi.gaussian_filter((al < 0.98).astype(np.float32), 1.5) > 0.02)
    # and the figure's own px go over into the mending's little by little toward the part it added, so that no line shows where
    # the figure was cut (the mending painted that place again too, in one piece with what it added)
    added = ndi.binary_opening((al2 > 0.5) & (al < 0.5) & (box > 0.5), iterations=3)
    t = np.clip(1 - ndi.distance_transform_edt(~added) / JOIN, 0, 1)
    w2 = np.maximum(w2, t * t * (3 - 2 * t)) * box
    c = c * (1 - w2[..., None]) + f2 * w2[..., None]
    grown = np.maximum(al, al2 * (box > 0.5))
    mended = np.maximum(w2 * grown, 0)
    print('mending', m_try, 'fit', fit2, 'agreeing px', agreeing2, '| px added to the figure', int(((grown > 0.5) & ~(al > 0.5)).sum()), 'px of the figure repainted', int(((w2 > 0.5) & (al > 0.5)).sum()))
    al = grown
    record['mend'] = {'try': m_try, 'box': [bx, by, bw, bh], 'fit': fit2, 'join': JOIN}

if mend:
    own = f * (1 - mended[..., None]) + f2 * mended[..., None]
    c, recoloured, thin_px = outlined(c, al, own)
whose = np.where(yy < top, 1.0, np.maximum(w, mended))
print('outline px recoloured from inside', recoloured, 'thin parts with the cut-out\'s own colour', thin_px)
print('px of the figure from the illustration', round(float(((1 - whose) * al).sum() / al.sum()), 3), '| above its top edge', round(float(al[:top].sum() / al.sum()), 3), '| mended', round(float((mended * al).sum() / al.sum()), 3))

# the matte a little tighter, and what reaches the picture's outer edge fades
alpha = np.clip((al - 0.1) / 0.86, 0, 1)
span = FADE * (px1 - px0)
r = np.clip((px1 - 1 - xx) / span, 0, 1) if geom.PIECES[name]['inner_left'] else np.clip((xx - px0) / span, 0, 1)
alpha = alpha * (r * r * (3 - 2 * r))

rgba = np.dstack([c, alpha * 255])[:, px0:px1]
Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA').save(f'{S}/work/{name}-full.png')
# the game's size: half, weighted by the matte
pre = rgba.copy(); pre[..., :3] *= rgba[..., 3:4] / 255
small = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), 'RGBA').resize(((px1 - px0) // geom.K, H // geom.K), Image.BOX)).astype(np.float32)
out = small.copy(); out[..., :3] = np.where(small[..., 3:4] > 0, small[..., :3] * 255 / np.maximum(small[..., 3:4], 1), 0)
final = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')
final.save(f'{S}/work/{name}-final.png')
rows = np.flatnonzero((out[..., 3] > 8).any(1)); cols = np.flatnonzero((out[..., 3] > 8).any(0))
print('final', final.size, 'covered', round(float((out[..., 3] > 8).mean()), 3), 'figure rows', int(rows[0]), int(rows[-1]), 'columns', int(cols[0]), int(cols[-1]))
record['final'] = {'size': list(final.size), 'from_illustration': round(float(((1 - whose) * al).sum() / al.sum()), 3)}


# views: on the game's dark background and on a bright one, and whose px (teal the illustration's, red the cut-out's, yellow the mending's)
def over(bg):
    base = np.empty((H, px1 - px0, 3), np.float32); base[:] = bg
    return base * (1 - rgba[..., 3:4] / 255) + rgba[..., :3] * rgba[..., 3:4] / 255


v3 = np.zeros((H, W, 3), np.float32)
v3[..., 0] = np.maximum(whose, mended) * al * 255
v3[..., 1] = np.maximum((1 - whose) * 150, mended * 230) * al
v3[..., 2] = (1 - whose) * al * 150
gap = np.full((H, 14, 3), 60.0)
v = np.concatenate([over((10, 10, 16)), gap, over((235, 235, 240)), gap, v3[:, px0:px1]], 1)
im = Image.fromarray(np.clip(v, 0, 255).astype(np.uint8)); im = im.resize((im.width * 1100 // im.height, 1100), Image.LANCZOS)
im.save(f'{S}/work/{name}-final-view.jpg', quality=88)
json.dump(record, open(f'{S}/work/{name}-final.json', 'w'), indent=1)
