"""reground_gemini.py <source folder>:<try> <out folder> : a flattened render's things kept as they are, on new ground. The Gemini
   gear's panel (the user's direction on draft 4-A): the metal one step lighter and the same from its far edge to its near
   edge (its bright far half read as a separate white band on the default camera); the spark, the wordmark and the crown
   moved together so that the wordmark lies at the panel's very middle; the banana where it is.
   How: the old ground is found as a smooth surface fitted to the picture where nothing lies; what differs from it is a thing
   (kept as it is) or a thing's shadow (kept as a darkening of the new ground); the logo's box is laid down again further
   left. Nothing is generated: every thing is draft 4-A's own pixels.
   Then (the user's next direction): the logo a little to the right of that and a little up (<right px> <up px>); and the
   ground read as smooth metal again: long soft streaks of light lying across it at a slant, as a strip light mirrored in
   polished metal (they run on from the far edge to the near edge, so nothing sets the far part apart), and each thing
   mirrored faintly in the metal toward the camera.
   python3 reground_gemini.py gemini-e1:3 gemini-h1 70 45     (needs scipy)
   Options after those: ground=<png> (a picture of the ground, 2048 x 876, used as it is and not the drawn one),
   mirror=<0..1> (how strong the things' mirror images are; 0.20 when not given). The ground alone is written beside the
   picture as ground-1.png."""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
(src, n), out = sys.argv[1].split(':'), sys.argv[2]
OPT = dict(a.split('=', 1) for a in sys.argv[3:] if '=' in a); PLAIN = [a for a in sys.argv[3:] if '=' not in a]
RIGHT, UP = (int(PLAIN[0]) if len(PLAIN) > 0 else 0), (int(PLAIN[1]) if len(PLAIN) > 1 else 0)
MIRROR = float(OPT.get('mirror', 0.20))
W, H = 2048, 876
BLEND = ((198, 221, 250), (221, 213, 247), (246, 215, 230))    # the new ground, from its left edge to its right
I = np.asarray(Image.open(S + f'{src}/flat-{n}.png').convert('RGB'), dtype=np.float32)

# the old ground: a smooth surface (fourth order in x and y) through the pixels where nothing lies
step = 4
yy, xx = np.mgrid[0:H:step, 0:W:step]
u, v = xx.ravel() / W * 2 - 1, yy.ravel() / H * 2 - 1
terms = lambda u, v: np.stack([u ** i * v ** j for i in range(5) for j in range(5 - i)], 1)
A = terms(u, v); px = I[::step, ::step].reshape(-1, 3)
keep = np.ones(len(A), bool); keep &= (yy.ravel() > 20) & (xx.ravel() > 20) & (xx.ravel() < W - 20)
for _ in range(6):
    coef = np.linalg.lstsq(A[keep], px[keep], rcond=None)[0]
    res = np.abs(A @ coef - px).max(1)
    keep = (res < 14) & (yy.ravel() > 20) & (xx.ravel() > 20) & (xx.ravel() < W - 20)
print('ground fitted on %.0f %% of the picture; its error there: mean %.1f, 95th %.1f' % (keep.mean() * 100, res[keep].mean(), np.percentile(res[keep], 95)))
Y, X = np.mgrid[0:H, 0:W]
B = (terms((X.ravel() / W * 2 - 1).astype(np.float32), (Y.ravel() / H * 2 - 1).astype(np.float32)) @ coef).reshape(H, W, 3).astype(np.float32)
# closer: where the surface says nothing lies, the picture itself is the ground; under the things it is carried in from
# round them (a blur of the bare ground only)
bare = (np.abs(I - B).max(2) < 16).astype(np.float32); bare[:20] = 0; bare[:, :20] = 0; bare[:, -20:] = 0
bare = ndimage.binary_erosion(bare > 0, iterations=4).astype(np.float32)
wsum = ndimage.gaussian_filter(bare, 46) + 1e-6
B = np.stack([ndimage.gaussian_filter(I[..., c] * bare, 46) / wsum for c in range(3)], -1).astype(np.float32)
D = I - B
far = np.abs(D).max(2)
alpha = np.clip((far - 18) / 42, 0, 1); alpha = alpha * alpha * (3 - 2 * alpha)
alpha = ndimage.gaussian_filter(alpha, 1.0)[..., None]

# the new ground: the three colours from left to right, the same from far to near; a very faint gloss in long soft bands that
# run from far to near (so nothing changes along the depth)
t = (np.arange(W) / (W - 1))[None, :, None]
G = np.where(t < 0.5, np.array(BLEND[0]) * (1 - t * 2) + np.array(BLEND[1]) * (t * 2), np.array(BLEND[1]) * (2 - t * 2) + np.array(BLEND[2]) * (t * 2 - 1))
G = np.broadcast_to(G, (H, W, 3)).astype(np.float32).copy()
# the metal's gloss: streaks of light across the slab at a slant, each a soft band toward white, and a slightly deeper tone
# between them; the same strength along their whole length
along = X + (Y - H / 2) * 0.55                      # a streak leans 0.55 px across for a px of depth
band = lambda centre, wide: np.exp(-((along - centre * W) / (wide * W)) ** 2)
light = 0.40 * band(0.20, 0.070) + 0.16 * band(0.335, 0.022) + 0.30 * band(0.60, 0.050) + 0.34 * band(0.90, 0.075)
deep = 0.050 * band(0.42, 0.070) + 0.045 * band(0.75, 0.060)
G = (G + light[..., None] * (255 - G)) * (1 - deep[..., None])
if 'ground' in OPT:
    # a picture of the ground (a generated sheet of metal): its light and grain as they are, its broad colours brought to the
    # drawn ground's, which has the lightness the user settled: for each column and channel, as much paler (toward white) as
    # the drawn ground is there, the amount running smoothly across the picture
    T = np.asarray(Image.open(OPT['ground']).convert('RGB').resize((W, H), Image.LANCZOS), dtype=np.float32)
    wide = lambda a_: ndimage.gaussian_filter1d(255 - a_.mean(0), 160, axis=0, mode='nearest')
    k = wide(G) / wide(T); print('paler by (share of the way to white kept), left / middle / right:', np.round(k[[100, W // 2, W - 100]], 2).tolist())
    G = 255 - (255 - T) * k[None]
os.makedirs(S + out, exist_ok=True)
Image.fromarray(np.clip(np.rint(G), 0, 255).astype(np.uint8), 'RGB').save(S + out + '/ground-1.png')

# where the things are in the source: the black letters give the wordmark's place; the yellow of the lower right is the banana
dark = I.mean(2) < 55
cols = 300 + np.nonzero(dark[330:660, 300:1900].sum(0) > 25)[0]       # the letters' own black, not the dark edges of the picture
word = (int(cols.min()), int(cols.max())); shift = round((word[0] + word[1]) / 2 - W / 2)
yel = (I[..., 0] > 200) & (I[..., 1] > 170) & (I[..., 2] < 110); ys, xs = np.nonzero(yel); sel = ys > 560
banana = [int(xs[sel].min()), int(ys[sel].min()), int(xs[sel].max()), int(ys[sel].max())]
print('wordmark from x %d to %d: moved %d px to the left; banana box %s' % (word[0], word[1], shift, banana))
# the things, piece by piece: the banana is what holds its yellow; the logo is every other piece (the spark, the letters, the
# crown). The picture's own edges (a dark seam under the key caps, the rails' shade) are not things.
alpha[:18] = 0; alpha[:, :18] = 0; alpha[:, -18:] = 0; D[:18] = 0; D[:, :18] = 0; D[:, -18:] = 0
things = alpha[..., 0] > 0.4
lab, count = ndimage.label(ndimage.binary_dilation(things, iterations=3))
is_banana = np.zeros(count + 1, bool); is_banana[np.unique(lab[yel & (Y > 560)])] = True; is_banana[0] = False
banana_mask = is_banana[lab] & (lab > 0); logo_mask = (lab > 0) & ~banana_mask
print('pieces: %d, of the banana %d; logo pixels %d, banana pixels %d' % (count, is_banana.sum(), logo_mask.sum(), banana_mask.sum()))


def reach(mask, other, px=34):
    """How much of the source goes along with a thing: the thing, and its shadow round it, fading out; never the other thing."""
    near = ndimage.gaussian_filter(ndimage.binary_dilation(mask, iterations=px).astype(np.float32), 9)
    return near * (1 - ndimage.gaussian_filter(ndimage.binary_dilation(other, iterations=5).astype(np.float32), 2))


def moved(a_, dx, dy):
    """A picture dx px to the left and dy px up; what leaves the picture is gone (nothing comes back in at the other edge)."""
    o_ = np.roll(np.roll(a_, -dx, axis=1), -dy, axis=0)
    if dx > 0: o_[:, -dx:] = 0
    if dx < 0: o_[:, :-dx] = 0
    if dy > 0: o_[-dy:] = 0
    if dy < 0: o_[:-dy] = 0
    return o_


def lay(o, w, dx, dy=0):
    """The source's things laid on the new ground dx px to the left and dy px up: a thing as it is, its shadow as a darkening."""
    w_, a_, i_, shade = moved(w, dx, dy)[..., None], moved(alpha, dx, dy), moved(I, dx, dy), moved(np.minimum(D, 0), dx, dy)    # only what is darker than the old ground is a shadow
    return o + w_ * (a_ * (i_ - o) + (1 - a_) * shade)


shift -= RIGHT
wl, wb = reach(logo_mask, banana_mask), reach(banana_mask, logo_mask)
# each thing mirrored faintly in the metal: its picture drawn out toward the camera and blurred, under the thing itself
cover = moved(wl[..., None] * alpha, shift, UP) + wb[..., None] * alpha
tone = moved(wl[..., None] * alpha * I, shift, UP) + wb[..., None] * alpha * I
far_to_near = lambda a_: moved(ndimage.gaussian_filter(ndimage.gaussian_filter1d(a_, 30, axis=0, mode='constant'), (0, 3, 0), mode='constant'), 0, -34)
mc, mt = far_to_near(cover), far_to_near(tone)
mirror = np.clip(mc, 0, 1) * MIRROR
o = G * (1 - mirror) + (mt / np.maximum(mc, 1e-4)) * mirror
o = lay(o, wl, shift, UP)
o = lay(o, wb, 0)
logo = [int(v) for v in (np.nonzero(logo_mask.any(0))[0].min(), np.nonzero(logo_mask.any(1))[0].min(), np.nonzero(logo_mask.any(0))[0].max(), np.nonzero(logo_mask.any(1))[0].max())]
o += np.random.default_rng(3).uniform(-0.5, 0.5, o.shape).astype(np.float32)      # against steps in the smooth colours
os.makedirs(S + out, exist_ok=True)
Image.fromarray(np.clip(np.rint(o), 0, 255).astype(np.uint8), 'RGB').save(S + out + '/flat-1.png')
json.dump({'from': f'{src}/flat-{n}.png', 'logo_box': logo, 'moved_left': shift, 'moved_up': UP, 'banana_box': banana, 'ground': BLEND},
          open(S + out + '/parts.json', 'w'), indent=1)
lum = o.mean(2)
print('written', out + '/flat-1.png', '| ground from far to near at the left:', np.round(lum[::125, 60:300].mean(1)).astype(int).tolist(), 'at the right:', np.round(lum[::125, 1900:2010].mean(1)).astype(int).tolist())
