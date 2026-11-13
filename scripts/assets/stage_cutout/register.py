"""How the image model's cut-out lies on the working canvas it was made from: an affine fit of patch matches inside the kept
figures, and how alike the two are once the cut-out is laid back.
   python3 register.py <work dir> <piece> <try> [the picture it was made from: canvas (the default) or cut-<try>]   (needs scipy)"""
import json, os, sys
S = sys.argv[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

name, n = sys.argv[2], sys.argv[3]
ref = sys.argv[4] if len(sys.argv) > 4 else 'canvas'
A = Image.open(f'{S}/work/{name}-{ref}.png').convert('RGB')
B0 = Image.open(f'{S}/work/{name}-try-{n}.png').convert('RGB')
W, H = A.size
B = B0.resize((W, H), Image.LANCZOS)
a = np.asarray(A).astype(np.float32)
b = np.asarray(B).astype(np.float32)


def greenness(x):
    """How green a px is: 1 on the flat key colour, 0 on anything else."""
    r, g, bl = x[..., 0], x[..., 1], x[..., 2]
    return np.clip((g - np.maximum(r, bl) - 40) / 120, 0, 1)


kept = greenness(b) < 0.2
if ref != 'canvas':
    # a picture that is itself a figure on green: matches only where both are figure
    kept &= greenness(a) < 0.2
inside = ndi.binary_erosion(kept, iterations=24)
ga = ndi.gaussian_filter(a.mean(2), 1.0) - ndi.gaussian_filter(a.mean(2), 8.0)
gb = ndi.gaussian_filter(b.mean(2), 1.0) - ndi.gaussian_filter(b.mean(2), 8.0)
P, R = 48, 20          # half a patch, the search's reach
pts = []
for y in range(P + R + 4, H - P - R - 4, 72):
    for x in range(P + R + 4, W - P - R - 4, 72):
        if not inside[y, x]:
            continue
        pa = ga[y - P:y + P, x - P:x + P]
        if pa.std() < 4:
            continue
        win = gb[y - P - R:y + P + R, x - P - R:x + P + R]
        # the patch of the canvas found again in the cut-out: normalised correlation over the search window
        best, at = -2, (0, 0)
        pa0 = (pa - pa.mean()) / (pa.std() + 1e-6)
        for dy in range(-R, R + 1, 1):
            rows = win[dy + R:dy + R + 2 * P]
            for dx in range(-R, R + 1, 1):
                pb = rows[:, dx + R:dx + R + 2 * P]
                c = float((pa0 * (pb - pb.mean())).mean() / (pb.std() + 1e-6))
                if c > best:
                    best, at = c, (dx, dy)
        if best > 0.6 and abs(at[0]) < R and abs(at[1]) < R:
            pts.append((x, y, at[0], at[1], best))
pts = np.array(pts)
print('matches', len(pts), 'mean score', pts[:, 4].mean().round(3))
# the cut-out's px for a canvas px: [x', y'] = M [x, y, 1], fitted twice, the second time without the worst matches
X = np.c_[pts[:, 0], pts[:, 1], np.ones(len(pts))]
Y = np.c_[pts[:, 0] + pts[:, 2], pts[:, 1] + pts[:, 3]]
keep = np.ones(len(pts), bool)
for _ in range(3):
    M, *_ = np.linalg.lstsq(X[keep], Y[keep], rcond=None)
    res = np.sqrt(((X @ M - Y) ** 2).sum(1))
    keep = res < max(1.5, np.percentile(res, 85))
print('affine (canvas px -> resized cut-out px):\n', M.T.round(5))
print('residual px: median', np.median(res).round(2), '90%', np.percentile(res, 90).round(2), 'max', res.max().round(2), 'kept', int(keep.sum()), 'of', len(pts))
json.dump({'matrix': M.T.tolist(), 'canvas': [W, H], 'cutout': list(B0.size), 'matches': int(len(pts)), 'median': float(np.median(res)), 'p90': float(np.percentile(res, 90))},
          open(f'{S}/work/{name}-try-{n}-fit.json', 'w'))
# the residuals over the picture: where the model moved things
grid = np.c_[pts[:, :2], (X @ M - Y), res]
worst = grid[np.argsort(-res)[:12]]
print('worst matches (x, y, ex, ey, e):\n', worst.round(1))
