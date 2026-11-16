"""shift_parts.py <source folder>:<try> <out folder> <x>,<y>:<dx>,<dy> ... [top=<px>] [still=<layer.png>,...]
   A flattened render's things moved about on its own ground; nothing is generated, every thing keeps its own pixels.
   Each thing is named by a point inside it and is moved dx px to the right and dy px down together with what it lays on the
   ground round itself (its shadow, its glow, its sparks); every thing of the picture is to be named, one that stays with 0,0.
   How: the ground is found as a smooth surface fitted to the picture where nothing lies (and carried in under the things
   from round them); what differs from it belongs to the nearest named thing and moves with it; where a thing was, the
   ground is left. top=<px>: the picture's far edge that many px deep is the bare ground (a render now and then paints the
   key caps' feet there). still=: flat prints of the panel (RGBA layers of its size, paths under the work folder): where a layer is
   not clear nothing moves and nothing is taken for a thing (a print is part of the ground; a flame that runs up to a
   print is not one thing with it). With still= only the things that move need naming; whatever else stands out of the
   ground beside a print goes with the nearest named thing (its loose sparks and streaks).
   python3 shift_parts.py grok-a1:1 grok-b1 560,690:70,0 1024,318:0,0 1600,560:-140,0 top=24    (needs scipy)"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
(src, n), out = sys.argv[1].split(':'), sys.argv[2]
OPT = dict(a.split('=', 1) for a in sys.argv[3:] if '=' in a)
MOVES = [tuple(tuple(int(v) for v in p.split(',')) for p in a.split(':')) for a in sys.argv[3:] if '=' not in a]
TOP = int(OPT.get('top', 0))
STILL = [f for f in OPT.get('still', '').split(',') if f]
I = np.asarray(Image.open(S + f'{src}/flat-{n}.png').convert('RGB'), dtype=np.float32)
H, W = I.shape[:2]

# the ground: a smooth surface (fourth order in x and y) through the pixels where nothing lies
step = 4
yy, xx = np.mgrid[0:H:step, 0:W:step]
terms = lambda u, v: np.stack([u ** i * v ** j for i in range(5) for j in range(5 - i)], 1)
A = terms(xx.ravel() / W * 2 - 1, yy.ravel() / H * 2 - 1); px = I[::step, ::step].reshape(-1, 3)
inner = (yy.ravel() > 24) & (xx.ravel() > 24) & (xx.ravel() < W - 24)
keep = inner.copy()
for _ in range(8):
    coef = np.linalg.lstsq(A[keep], px[keep], rcond=None)[0]
    res = np.abs(A @ coef - px).max(1)
    keep = (res < 12) & inner
print('ground fitted on %.0f %% of the picture; its error there: mean %.1f, 95th %.1f' % (keep.mean() * 100, res[keep].mean(), np.percentile(res[keep], 95)))
Y, X = np.mgrid[0:H, 0:W]
B = (terms((X.ravel() / W * 2 - 1).astype(np.float32), (Y.ravel() / H * 2 - 1).astype(np.float32)) @ coef).reshape(H, W, 3).astype(np.float32)
# the named things: what stands out of that surface and holds together round each named point, grown into the faint light
# and shade it lays round itself. Whatever else differs from the surface (the metal's own sheen) is ground.
far = np.abs(I - B).max(2)
edge = np.zeros((H, W), bool); edge[:24] = True; edge[:, :24] = True; edge[:, -24:] = True
still = np.zeros((H, W), bool)
for f in STILL: still |= np.asarray(Image.open(S + f).convert('RGBA'))[..., 3] > 8
exact = still.copy()
still = ndimage.binary_dilation(still, iterations=12) if STILL else still   # (a render's print lies a few px off the drawn one)
hi = ndimage.binary_opening((far > 20) & ~edge & ~still, iterations=1); lo = (far > 9) & ~edge & ~still
groups, count = ndimage.label(ndimage.binary_dilation(hi, iterations=30))
masks = []
for (x, y), _ in MOVES:
    g = groups[y, x]
    if g == 0:                                                    # the point lies beside the thing: the nearest one
        d, (iy, ix) = ndimage.distance_transform_edt(groups == 0, return_indices=True); g = groups[iy[y, x], ix[y, x]]
    m = groups == g
    faint, _ = ndimage.label((lo & ndimage.binary_dilation(m, iterations=90)) | m)
    m = np.isin(faint, np.unique(faint[m])) & (faint > 0)
    m = ndimage.binary_dilation(m, iterations=6) & ~edge
    ys, xs = np.nonzero(m); print('thing at (%d, %d): x %d..%d, y %d..%d' % (x, y, xs.min(), xs.max(), ys.min(), ys.max()))
    masks.append(m)
if STILL:                                                         # the loose pieces: each to the nearest named thing
    loose, count = ndimage.label(hi & ~np.any(masks, 0) & ~ndimage.binary_dilation(still, iterations=24))   # not a print's own fringe
    if count:
        which = np.argmin(np.stack([ndimage.distance_transform_edt(~m) for m in masks]), 0)
        for k in range(len(masks)): masks[k] = masks[k] | ndimage.binary_dilation((loose > 0) & (which == k), iterations=6)
        print('loose pieces taken along:', count)
thing = np.any(masks, 0)

# the ground, closer: the picture itself (lightly smoothed) where no named thing lies; under the things it is carried in
# from round them, from near before from far
bare = (~thing & ~edge & ~ndimage.binary_dilation(still, iterations=8)).astype(np.float32)
num, den = np.zeros_like(I), np.zeros((H, W), np.float32)
for sigma, k in ((10, 1.0), (28, 0.05), (70, 0.0025), (170, 1.2e-4), (400, 6e-6)):
    w = ndimage.gaussian_filter(bare, sigma) * k
    num += np.stack([ndimage.gaussian_filter(I[..., c] * bare, sigma) for c in range(3)], -1) * k; den += w
B = (num / np.maximum(den, 1e-9)[..., None]).astype(np.float32)
D = I - B
# what moves with a thing: the thing and the light and shade close round it, not the whole ground on its side of the
# picture (the rails' shade along the picture's edges and the metal's own sheen stay where they are)
dist = [ndimage.distance_transform_edt(~m) for m in masks]
near = np.argmin(np.stack(dist), 0)
share = np.stack([ndimage.gaussian_filter((near == k).astype(np.float32), 18) for k in range(len(MOVES))]); share /= share.sum(0) + 1e-6
goes = [np.clip(ndimage.gaussian_filter(ndimage.binary_dilation(m, iterations=14).astype(np.float32), 9) * 1.15, 0, 1) * share[k] * ~edge * ~still for k, m in enumerate(masks)]


def moved(a_, dx, dy):
    """A picture dx px to the right and dy px down; what leaves the picture is gone."""
    o_ = np.roll(np.roll(a_, dx, axis=1), dy, axis=0)
    if dx > 0: o_[:, :dx] = 0
    if dx < 0: o_[:, dx:] = 0
    if dy > 0: o_[:dy] = 0
    if dy < 0: o_[dy:] = 0
    return o_


# what a thing lays on the ground runs out of the picture at an edge: moved away from that edge, it would end in a straight
# cut, so it is faded out toward the edge it leaves
# (it is taken away from where it was whole; only what is laid down again is faded)
laid = [g.copy() for g in goes]
for k, (_, (dx, dy)) in enumerate(MOVES):
    if dy < 0: laid[k] = laid[k] * np.clip((H - 1 - Y) / 70, 0, 1)
    if dy > 0: laid[k] = laid[k] * np.clip((Y - 24) / 70, 0, 1)
    if dx < 0: laid[k] = laid[k] * np.clip((W - 25 - X) / 70, 0, 1)
    if dx > 0: laid[k] = laid[k] * np.clip((X - 24) / 70, 0, 1)
stays = 1 - np.sum(goes, 0)
if STILL:
    # close round a print, what is coloured and does not move (sparks a flame left at the print's rim) is taken out: without
    # the flame beside them they are loose dots
    fringe = ndimage.binary_dilation(still, iterations=28) & ~ndimage.binary_erosion(exact, iterations=3)
    stray = ndimage.binary_dilation(fringe & ((I.max(2) - I.min(2)) > 28) & (stays > 0.5), iterations=3)
    stays = stays * (1 - ndimage.gaussian_filter(stray.astype(np.float32), 1.5))
o = B + D * stays[..., None]
for k, (_, (dx, dy)) in enumerate(MOVES): o += moved(laid[k][..., None] * D, dx, dy)
if TOP:
    fade = np.clip((np.arange(H) - TOP) / 10, 0, 1)[:, None, None]
    ground = o.copy()
    ground[:TOP + 10] = ground[TOP + 10]                             # the far edge: the ground just under it, carried up
    o = ground * (1 - fade) + o * fade
o += np.random.default_rng(5).uniform(-0.5, 0.5, o.shape).astype(np.float32)
os.makedirs(S + out, exist_ok=True)
Image.fromarray(np.clip(np.rint(o), 0, 255).astype(np.uint8), 'RGB').save(S + out + '/flat-1.png')
json.dump({'from': f'{src}/flat-{n}.png', 'moves': [{'at': list(p), 'by': list(m)} for p, m in MOVES], 'top': TOP}, open(S + out + '/parts.json', 'w'), indent=1)
far = np.abs(o - B).max(2) > 30; ys, xs = np.nonzero(far[30:, 30:-30])
print('written', out + '/flat-1.png', '| things now span x %d..%d, y %d..%d' % (xs.min() + 30, xs.max() + 30, ys.min() + 30, ys.max() + 30))
