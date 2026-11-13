"""Trial: lays the whole crystal panel, painted in the game camera's perspective (a repaint of this game's own frame with
   the frame moved up), flat as the 2048 x 869 picture the game lays on the deck.
   python3 prism_flat.py <generation.png> <out.png>   (prints the alignment; the rows the frame did not show repeat the last row)"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S as WORK
S = WORK + 'inputs/p3/'
CROP = (160, 180, 1760, 1080)
KEEP = 0.41                      # the share of the crop above the panel: what was to be kept
cal = json.load(open(S + 'calib.json'))
Hm = np.array(cal['h']).reshape(3, 3)
W, H = cal['picture']
VMAX = cal['vmax']


def edges(im, size):
    g = np.asarray(im.convert('L').resize(size, Image.LANCZOS), dtype=np.float32) / 255
    return np.hypot(ndimage.sobel(g, 0), ndimage.sobel(g, 1))


def align(gen, tmpl):
    size = (688, 384)
    t = edges(tmpl, size)
    keep = np.zeros_like(t); keep[: int(size[1] * KEEP)] = 1
    t = t * keep
    best = None
    for s in np.arange(0.90, 1.1001, 0.004):
        w, h = round(gen.width / s), round(gen.height / s)
        l, u = (gen.width - w) // 2, (gen.height - h) // 2
        g = edges(gen.crop((l, u, l + w, u + h)), size) * keep
        f = np.fft.irfft2(np.fft.rfft2(t) * np.conj(np.fft.rfft2(g)), s=t.shape)
        k = np.unravel_index(np.argmax(f), f.shape)
        score = f[k] / np.sqrt((t * t).sum() * (g * g).sum())
        dy, dx = [(v + n // 2) % n - n // 2 for v, n in zip(k, f.shape)]
        if best is None or score > best[0]: best = (float(score), float(s), dx, dy)
    return best


if __name__ == "__main__":
    gen = Image.open(sys.argv[1]).convert('RGB')
    tmpl = Image.open(S + 'tmpl-crop.png').convert('RGB')
    score, s, dx, dy = align(gen, tmpl)
    kx, ky = gen.width / tmpl.width, gen.height / tmpl.height
    shift = np.array([dx * gen.width / 688, dy * gen.height / 384])
    print('%s: correlation %.3f, scale %.3f, shift %s px of the generation (%d x %d)' % (sys.argv[1].split('/')[-1], score, s, np.round(shift, 1), gen.width, gen.height))
    if len(sys.argv) < 3: sys.exit(0)
    rows = int(H * VMAX)
    U, V = np.meshgrid(np.arange(W) + 0.5, np.arange(rows) + 0.5)
    q = Hm @ np.stack([U.ravel(), V.ravel(), np.ones(U.size)])
    x, y = q[0] / q[2], q[1] / q[2]
    gx, gy = (x - CROP[0]) * kx, (y - CROP[1]) * ky
    c = np.array([gen.width / 2, gen.height / 2])
    gx, gy = (gx - c[0]) * s + c[0] - shift[0], (gy - c[1]) * s + c[1] - shift[1]
    a = np.asarray(gen, dtype=np.float32)
    flat = np.stack([ndimage.map_coordinates(a[..., ch], [gy - 0.5, gx - 0.5], order=1, mode='nearest') for ch in range(3)], -1).reshape(rows, W, 3)
    flat = np.concatenate([flat, np.repeat(flat[-1:], H - rows, 0)], 0)
    Image.fromarray(np.clip(np.rint(flat), 0, 255).astype(np.uint8), 'RGB').save(sys.argv[2])
    print('flat', (W, H), 'rows read', rows, 'bottom row at y %.1f of %d' % (gy.reshape(rows, W)[-1, W // 2], gen.height))
