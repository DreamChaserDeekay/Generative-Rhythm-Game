"""The homography from the crystal panel's picture (px of 2048 x 869) to the 1920x1080 screen of the SDVX camera with the
   frame moved up (the judge line at 43 % of the screen, so that the whole panel shows), from a frame of the game with
   a grid of magenta dots as the panel: python3 prism_calib.py <frame.png> <out.json>"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 2048, 869
US = [0.08 + 0.07 * i for i in range(13)]
VS = [0.03 + 0.06 * i for i in range(16)] + [0.975]

a = np.asarray(Image.open(sys.argv[1]).convert('RGB'), dtype=np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mask = (r > 90) & (b > 90) & (g < 0.45 * np.minimum(r, b))
mask[: int(0.43 * a.shape[0]) + 40] = False                      # only under the keys
lab, n = ndimage.label(mask)
blobs = []
for k, sl in enumerate(ndimage.find_objects(lab), 1):
    ys, xs = np.nonzero(lab[sl] == k)
    if len(ys) < 12: continue
    y0, x0 = sl[0].start, sl[1].start
    touches = sl[0].stop >= a.shape[0] - 1
    blobs.append((ys.mean() + y0, xs.mean() + x0, len(ys), touches))
blobs.sort()
rows = []
for bl in blobs:
    if rows and abs(rows[-1][-1][0] - bl[0]) < 6: rows[-1].append(bl)
    else: rows.append([bl])
print('rows:', [(round(r[0][0]), len(r)) for r in rows])
src, dst = [], []
for j, row in enumerate(rows):
    if len(row) != 13 or any(bl[3] for bl in row): continue
    for i, bl in enumerate(sorted(row, key=lambda t: t[1])):
        src.append((US[i] * W, VS[j] * H)); dst.append((bl[1] + 0.5, bl[0] + 0.5))
src, dst = np.array(src), np.array(dst)
A = []
for (u, v), (x, y) in zip(src, dst):
    A.append([u, v, 1, 0, 0, 0, -x * u, -x * v, -x]); A.append([0, 0, 0, u, v, 1, -y * u, -y * v, -y])
_, _, vt = np.linalg.svd(np.array(A))
Hm = vt[-1].reshape(3, 3); Hm /= Hm[2, 2]
p = (Hm @ np.c_[src, np.ones(len(src))].T).T; p = p[:, :2] / p[:, 2:]
err = np.hypot(*(p - dst).T)
print('points', len(src), 'reprojection px: mean %.2f max %.2f' % (err.mean(), err.max()))
corner = lambda u, v: (lambda q: (round(float(q[0] / q[2]), 1), round(float(q[1] / q[2]), 1)))(Hm @ np.array([u, v, 1.0]))
print('corners on the screen:', corner(0, 0), corner(W, 0), corner(0, H), corner(W, H))
lo, hi = 0.0, 1.0
for _ in range(40):
    mid = (lo + hi) / 2
    q = Hm @ np.array([0.5 * W, mid * H, 1]); y = q[1] / q[2]
    lo, hi = (mid, hi) if y < a.shape[0] else (lo, mid)
print('v at the bottom of the screen: %.4f' % lo)
json.dump({'h': Hm.ravel().tolist(), 'vmax': lo, 'picture': [W, H], 'screen': [a.shape[1], a.shape[0]]}, open(sys.argv[2], 'w'), indent=1)
