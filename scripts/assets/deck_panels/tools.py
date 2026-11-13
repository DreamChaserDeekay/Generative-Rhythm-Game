"""Scratch tools for the skins' 3D panels (trial), one folder a gear: <work folder>/<gear>/.
   python3 tools.py dots <gear> <H>                 the calibration picture (2048 x H) into the game as the gear's panel
   python3 tools.py place <gear> <picture>          a picture into the game as the gear's panel (its size into the tables)
   python3 tools.py calib <gear>                    the homography from <gear>/calib-0.png -> <gear>/calib.json
   python3 tools.py crop <gear>                     <gear>/tmpl-0.png -> <gear>/tmpl-crop.png
   python3 tools.py flat <gear> <n>                 <gear>/try-<n>.png -> <gear>/flat-<n>.png (prints the alignment)
Needs scipy for calib and flat."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S, R
W = 2048
CROP = (160, 180, 1760, 1080)
US = [0.08 + 0.07 * i for i in range(13)]
VS = [0.03 + 0.06 * i for i in range(16)] + [0.975]
LINE = 0.43
#: the dots' colour: one the gear's own lights and effects do not have (DOTS=green for a red or pink gear)
import os
GREEN = os.environ.get('DOTS') == 'green'
DOT = (0, 255, 0) if GREEN else (255, 0, 255)


def place(gear, image):
    """The picture as the gear's panel, its size in the manifest and the panels' table (a panel with no display)."""
    image = image.convert('RGB')
    assert image.width == W, image.size
    image.save(R + f'client/public/media/panels/{gear}.webp', 'WEBP', quality=92, method=6)
    p = R + 'client/src/render/deckPanels.json'
    d = json.load(open(p)); d[gear] = {'size': [image.width, image.height]}
    open(p, 'w').write(json.dumps(d, indent=2) + '\n')
    m = R + 'client/public/media/manifest.json'
    man = json.load(open(m)); man['textures'][f'{gear}/panel']['size'] = [image.width, image.height]
    open(m, 'w').write(json.dumps(man, ensure_ascii=False, indent=2) + '\n')
    print('placed', gear, image.size)


def dots(gear, H):
    im = Image.new('RGB', (W, H), (58, 58, 62)); d = ImageDraw.Draw(im)
    for v in VS:
        for u in US:
            x, y = u * W, v * H
            d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=DOT)
    place(gear, im)


def calib(gear):
    from scipy import ndimage
    # the dots picture's height: the table's (as `dots` wrote it), or PANEL_H when the working tree has been put back since
    H = int(os.environ['PANEL_H']) if os.environ.get('PANEL_H') else json.load(open(R + 'client/src/render/deckPanels.json'))[gear.split('-')[0]]['size'][1]
    a = np.asarray(Image.open(S + f'{gear}/calib-0.png').convert('RGB'), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mask = ((g > 110) & (r < 0.5 * g) & (b < 0.5 * g)) if GREEN else ((r > 90) & (b > 90) & (g < 0.45 * np.minimum(r, b)))
    mask[: int(LINE * a.shape[0]) + 30] = False
    lab, n = ndimage.label(mask)
    blobs = []
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        ys, xs = np.nonzero(lab[sl] == k)
        if len(ys) < 12: continue
        blobs.append((ys.mean() + sl[0].start, xs.mean() + sl[1].start, len(ys), sl[0].stop >= a.shape[0] - 1))
    blobs.sort()
    rows = []
    for bl in blobs:
        if rows and abs(rows[-1][-1][0] - bl[0]) < 6: rows[-1].append(bl)
        else: rows.append([bl])
    print('rows:', [(round(r[0][0]), len(r)) for r in rows])
    assert len(rows) == len(VS) and all(len(r) == 13 for r in rows), 'the dots were not all found, or something else has their colour'
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
    at = lambda u, v: (lambda q: (float(q[0] / q[2]), float(q[1] / q[2])))(Hm @ np.array([u, v, 1.0]))
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if at(0.5 * W, mid * H)[1] < a.shape[0] else (lo, mid)
    print('points', len(src), 'reprojection px: mean %.2f max %.2f' % (err.mean(), err.max()), '| corners', [tuple(round(c, 1) for c in at(u, v)) for u, v in ((0, 0), (W, 0), (0, H), (W, H))], '| v at the bottom %.4f' % lo)
    json.dump({'h': Hm.ravel().tolist(), 'vmax': lo, 'picture': [W, H], 'screen': [a.shape[1], a.shape[0]], 'top': at(W / 2, 0)[1]}, open(S + f'{gear}/calib.json', 'w'), indent=1)


def crop(gear):
    Image.open(S + f'{gear}/tmpl-0.png').convert('RGB').crop(CROP).save(S + f'{gear}/tmpl-crop.png')


def edges(im, size):
    from scipy import ndimage
    g = np.asarray(im.convert('L').resize(size, Image.LANCZOS), dtype=np.float32) / 255
    return np.hypot(ndimage.sobel(g, 0), ndimage.sobel(g, 1))


def flat(gear, n):
    from scipy import ndimage
    cal = json.load(open(S + f'{gear}/calib.json'))
    Hm = np.array(cal['h']).reshape(3, 3); Wp, Hp = cal['picture']
    gen = Image.open(S + f'{gear}/try-{n}.png').convert('RGB')
    tmpl = Image.open(S + f'{gear}/tmpl-crop.png').convert('RGB')
    # what was to be kept: above the panel
    keep_to = (cal['top'] - CROP[1]) / (CROP[3] - CROP[1]) - 0.012
    size = (688, 384)
    t = edges(tmpl, size)
    keep = np.zeros_like(t); keep[: int(size[1] * keep_to)] = 1
    t = t * keep
    best = None
    for s in np.arange(0.90, 1.1001, 0.004):
        w, h = round(gen.width / s), round(gen.height / s)
        l, u = (gen.width - w) // 2, (gen.height - h) // 2
        g = edges(gen.crop((l, u, l + w, u + h)), size) * keep
        f = np.fft.irfft2(np.fft.rfft2(t) * np.conj(np.fft.rfft2(g)), s=t.shape)
        k = np.unravel_index(np.argmax(f), f.shape)
        score = f[k] / np.sqrt((t * t).sum() * (g * g).sum())
        dy, dx = [(v + m // 2) % m - m // 2 for v, m in zip(k, f.shape)]
        if best is None or score > best[0]: best = (float(score), float(s), dx, dy)
    score, s, dx, dy = best
    kx, ky = gen.width / tmpl.width, gen.height / tmpl.height
    shift = np.array([dx * gen.width / size[0], dy * gen.height / size[1]])
    print('%s try %s: correlation %.3f, scale %.3f, shift %s px of the generation (%d x %d)' % (gear, n, score, s, np.round(shift, 1), gen.width, gen.height))
    rows = int(Hp * cal['vmax'])
    U, V = np.meshgrid(np.arange(Wp) + 0.5, np.arange(rows) + 0.5)
    q = Hm @ np.stack([U.ravel(), V.ravel(), np.ones(U.size)])
    x, y = q[0] / q[2], q[1] / q[2]
    gx, gy = (x - CROP[0]) * kx, (y - CROP[1]) * ky
    c = np.array([gen.width / 2, gen.height / 2])
    gx, gy = (gx - c[0]) * s + c[0] - shift[0], (gy - c[1]) * s + c[1] - shift[1]
    a = np.asarray(gen, dtype=np.float32)
    out = np.stack([ndimage.map_coordinates(a[..., ch], [gy - 0.5, gx - 0.5], order=1, mode='nearest') for ch in range(3)], -1).reshape(rows, Wp, 3)
    out = np.concatenate([out, np.repeat(out[-1:], Hp - rows, 0)], 0)
    Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), 'RGB').save(S + f'{gear}/flat-{n}.png')


if __name__ == "__main__":
    cmd, folder = sys.argv[1], sys.argv[2]
    gear = folder.split('-')[0]
    if cmd == 'dots': dots(gear, int(sys.argv[3]))
    elif cmd == 'place': place(gear, Image.open(sys.argv[3]))
    elif cmd == 'calib': calib(folder)
    elif cmd == 'crop': crop(folder)
    elif cmd == 'flat': flat(folder, sys.argv[3])
