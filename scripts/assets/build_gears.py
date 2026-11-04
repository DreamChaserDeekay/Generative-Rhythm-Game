"""Builds the gears' game pictures into client/public/media/gears/<gear>/ and lists them in
client/public/media/manifest.json as "<gear>/<part>" (the manifest's other entries are kept).

    python scripts/assets/build_gears.py

Two kinds of picture:

- materials, made here from seeded noise (so they come out the same on every run, and tile without a
  seam: the noise is filtered in frequency space, which wraps): the arcade cabinet's embossed ABS, the
  receiver's brushed silver and walnut, the standard gear's brushed graphite;
- objects, from the picked generations in assets-src/gears/<gear>/ (drawn top-down on a flat magenta
  ground, where they came from: assets-src/PROVENANCE.md): each is cut to the object and masked to its
  shape (a circle or a rounded rectangle, the ground keyed out of its edge), and the najeon frame's
  pearl vine, cut from the generated band (the renderer repeats it down the track mirrored, so it runs
  on without a seam).

The renderer draws them (client/src/render/deckArt.ts: GEAR_PLATES, GEAR_FRAMES; the parts' manifest ids in
styleArt.ts: GEAR_PICTURES); the keys' proportions (KEY_SHAPES) and the receiver's lamp (lampSpot) are read
from the pictures made here: change the two together.
Needs Pillow, numpy and scipy.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "gears"
MEDIA = ROOT / "client" / "public" / "media"
OUT = MEDIA / "gears"


# ---------- helpers ----------


def load(path: Path) -> np.ndarray:
    """RGB as float32 in 0..1."""
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255


def hexrgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255


def save_rgb(a: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "RGB").save(path, optimize=True)


def save_rgba(a: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").save(path, optimize=True)


def noise(h: int, w: int, seed: int, fy: float, fx: float) -> np.ndarray:
    """Gaussian noise low-passed with cut-offs `fy`, `fx` (cycles a px) in frequency space: it wraps at the edges. Zero mean, unit spread."""
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    out = np.real(np.fft.ifft2(f * np.exp(-((kx / fx) ** 2 + (ky / fy) ** 2))))
    return (out - out.mean()) / (out.std() + 1e-9)


def emboss(height: np.ndarray, strength: float) -> np.ndarray:
    """Light from the top-left on a height map (wrapping): -1 .. 1 about flat."""
    dx = np.roll(height, -1, 1) - np.roll(height, 1, 1)
    dy = np.roll(height, -1, 0) - np.roll(height, 1, 0)
    return np.tanh(-(dx + dy) * strength)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------- materials ----------


def abs_plastic() -> np.ndarray:
    """The cabinet's black ABS: a fine leather-grain emboss under a faint even sheen."""
    h = w = 512
    cells = np.abs(noise(h, w, 11, 0.09, 0.09))
    grain = 0.75 * smoothstep(0.1, 0.9, cells) + 0.25 * noise(h, w, 12, 0.3, 0.3)
    shade = emboss(grain, 0.9)
    base = hexrgb("#17181b")
    out = base[None, None, :] * (1 + 0.16 * shade[..., None]) + 0.006 * noise(h, w, 13, 0.02, 0.02)[..., None]
    return np.clip(out, 0, 1)


def brushed(h: int, w: int, seed: int, base: str, depth: float, vertical: bool) -> np.ndarray:
    """Brushed metal: long streaks along the brushing, fine grain across it."""
    fy, fx = (0.002, 0.45) if vertical else (0.45, 0.002)
    streaks = noise(h, w, seed, fy, fx)
    fine = noise(h, w, seed + 1, fy * 4, fx * 4)
    v = 0.75 * streaks + 0.25 * fine
    c = hexrgb(base)
    return np.clip(c[None, None, :] * (1 + depth * v[..., None]), 0, 1)


def walnut() -> np.ndarray:
    """Walnut with its grain running down (the receiver's cabinet sides): growth bands warped by slow noise, pores, an amber figure."""
    h, w = 1024, 512
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    warp = 26 * noise(h, w, 21, 0.004, 0.01) + 6 * noise(h, w, 22, 0.012, 0.03)
    # whole cycles across the width, so the bands meet the next tile
    bands = np.sin(2 * np.pi * (x + warp) * 9 / w) + 0.5 * np.sin(2 * np.pi * (x + 0.7 * warp) * 23 / w + 1.3)
    streaks = noise(h, w, 23, 0.01, 0.35)
    pores = (noise(h, w, 24, 0.05, 0.9) > 2.1).astype(np.float32)
    pores = ndimage.uniform_filter(pores, size=(5, 1), mode="wrap")
    t = 0.5 + 0.22 * bands + 0.16 * streaks
    figure = smoothstep(0.6, 1.6, noise(h, w, 25, 0.003, 0.02))
    dark, mid, amber = hexrgb("#2e1a10"), hexrgb("#4f2f1c"), hexrgb("#7a4a26")
    t = np.clip(t, 0, 1)[..., None]
    out = dark * (1 - t) + mid * t
    out = out * (1 - 0.35 * figure[..., None]) + amber * 0.35 * figure[..., None]
    out = out * (1 - 0.45 * pores[..., None])
    # satin lacquer: a faint lift
    return np.clip(out * 1.04 + 0.01, 0, 1)


# ---------- objects ----------


MAGENTA = np.array([1.0, 0.0, 1.0], dtype=np.float32)


def ground_mask(a: np.ndarray) -> np.ndarray:
    """Where the picture is not its magenta ground."""
    return np.linalg.norm(a - MAGENTA, axis=2) > 0.42


def object_box(a: np.ndarray) -> tuple[int, int, int, int]:
    """The object's box (top, bottom, left, right): the largest part off the ground."""
    fg = ndimage.binary_opening(ground_mask(a), iterations=3)
    labels, n = ndimage.label(fg)
    if n == 0:
        raise SystemExit("no object found")
    sizes = ndimage.sum(fg, labels, range(1, n + 1))
    keep = labels == (1 + int(np.argmax(sizes)))
    ys, xs = np.nonzero(keep)
    return int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1


def resize(a: np.ndarray, w: int, h: int) -> np.ndarray:
    im = Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8))
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def disc_alpha(size: int, inset: float = 0.006) -> np.ndarray:
    """A circle filling a square, antialiased (4×4 samples a px)."""
    s = size * 4
    y, x = np.mgrid[0:s, 0:s].astype(np.float32)
    c = (s - 1) / 2
    inside = ((x - c) ** 2 + (y - c) ** 2 <= (c * (1 - inset)) ** 2).astype(np.float32)
    return inside.reshape(size, 4, size, 4).mean(axis=(1, 3))


def round_rect_alpha(w: int, h: int, r: float) -> np.ndarray:
    """A rectangle with round corners `r` px, antialiased."""
    s = 4
    y, x = np.mgrid[0:h * s, 0:w * s].astype(np.float32) / s
    rx = np.clip(np.maximum(r - x, x - (w - r)), 0, None)
    ry = np.clip(np.maximum(r - y, y - (h - r)), 0, None)
    inside = (rx ** 2 + ry ** 2 <= r * r).astype(np.float32)
    return inside.reshape(h, s, w, s).mean(axis=(1, 3))


def keyed(crop: np.ndarray) -> np.ndarray:
    """RGBA off the magenta ground: alpha from how far a px is from the ground, and the ground taken back out of the edge px."""
    alpha = smoothstep(0.22, 0.6, np.linalg.norm(crop - MAGENTA, axis=2))[..., None]
    rgb = np.clip((crop - (1 - alpha) * MAGENTA) / np.maximum(alpha, 1e-3), 0, 1)
    return np.concatenate([np.where(alpha > 0.002, rgb, 0), alpha], axis=2)


def shrink(rgba: np.ndarray, w: int, h: int) -> np.ndarray:
    """RGBA resized with its colour weighted by alpha, so no ground colour bleeds into the edge."""
    pre = np.concatenate([rgba[..., :3] * rgba[..., 3:], rgba[..., 3:]], axis=2)
    im = Image.fromarray(np.clip(pre * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)
    out = np.asarray(im, dtype=np.float32) / 255
    out[..., :3] = np.clip(out[..., :3] / np.maximum(out[..., 3:], 1e-3), 0, 1)
    return out


def cut_disc(a: np.ndarray, size: int) -> np.ndarray:
    """A round object: keyed off its ground and trimmed to the circle of its box."""
    t, b, l, r = object_box(a)
    cy, cx = (t + b) / 2, (l + r) / 2
    rad = min(b - t, r - l) / 2 + 2
    crop = a[max(0, int(cy - rad)):int(cy + rad), max(0, int(cx - rad)):int(cx + rad)]
    out = shrink(keyed(crop), size, size)
    out[..., 3] = np.minimum(out[..., 3], disc_alpha(size, 0.004))
    return out


def cut_round_rect(a: np.ndarray, height: int, corner: float) -> np.ndarray:
    """An object with round corners: keyed off its ground at its box's proportions, `height` px tall, trimmed to a rectangle with corners `corner` of its shorter side."""
    t, b, l, r = object_box(a)
    pad = 2
    crop = a[max(0, t - pad):b + pad, max(0, l - pad):r + pad]
    w = round(height * crop.shape[1] / crop.shape[0])
    out = shrink(keyed(crop), w, height)
    out[..., 3] = np.minimum(out[..., 3], round_rect_alpha(w, height, corner * min(w, height) + 2))
    return out


def neutral(rgba: np.ndarray, k: float) -> np.ndarray:
    """Colour taken out of a picture toward its grey by `k` (the smoked glass's tint of the generation)."""
    out = rgba.copy()
    grey = rgba[..., :3].mean(axis=2, keepdims=True)
    out[..., :3] = rgba[..., :3] * (1 - k) + grey * k
    return out


def cut_keyed(a: np.ndarray, size: int) -> np.ndarray:
    """The object off its magenta ground, edges keyed soft and the ground's tint taken out of them."""
    t, b, l, r = object_box(a)
    side = max(b - t, r - l) + 8
    cy, cx = (t + b) // 2, (l + r) // 2
    crop = a[max(0, cy - side // 2):cy + side // 2, max(0, cx - side // 2):cx + side // 2]
    d = np.linalg.norm(crop - MAGENTA, axis=2)
    alpha = smoothstep(0.35, 0.6, d)
    rgb = crop.copy()
    # the ground's purple out of the edge: blue and red no higher than the green allows
    rgb[..., 2] = np.minimum(rgb[..., 2], rgb[..., 1] * 0.9 + 0.08)
    rgb[..., 0] = np.where(alpha < 0.98, np.minimum(rgb[..., 0], rgb[..., 1] * 1.6 + 0.1), rgb[..., 0])
    rgba = np.concatenate([rgb, alpha[..., None]], axis=2)
    im = Image.fromarray(np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255


def shorten(rgba: np.ndarray, aspect: float, keep: float = 0.3) -> np.ndarray:
    """A tall key made `aspect` deep for its width: its top and bottom `keep` as they are, its plain middle squeezed (the row is shallow)."""
    h, w = rgba.shape[:2]
    target = round(w * aspect)
    if target >= h:
        return rgba
    end = int(h * keep)
    mid = rgba[end:h - end]
    im = Image.fromarray(np.clip(mid * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").resize((w, max(1, target - 2 * end)), Image.LANCZOS)
    return np.concatenate([rgba[:end], np.asarray(im, dtype=np.float32) / 255, rgba[h - end:]], axis=0)


# ---------- the gears ----------


def entry(textures: dict, gear: str, part: str, file: str, size: tuple[int, int]) -> None:
    textures[f"{gear}/{part}"] = {"file": f"gears/{gear}/{file}", "bundle": "gear", "size": [int(size[0]), int(size[1])]}


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    textures: dict = {}
    report: dict = {}

    def material(gear: str, part: str, a: np.ndarray) -> None:
        save_rgb(a, OUT / gear / f"{part}.png")
        entry(textures, gear, part, f"{part}.png", (a.shape[1], a.shape[0]))

    def sprite(gear: str, part: str, a: np.ndarray) -> None:
        save_rgba(a, OUT / gear / f"{part}.png")
        entry(textures, gear, part, f"{part}.png", (a.shape[1], a.shape[0]))
        report[f"{gear}/{part}"] = [a.shape[1], a.shape[0]]

    # STANDARD: brushed graphite down its rails; smoked glass pads and a jog disc
    material("standard", "graphite", brushed(1024, 256, 31, "#2a2c31", 0.05, vertical=True))
    sprite("standard", "pad", neutral(cut_round_rect(load(SRC / "standard" / "pad.jpg"), 384, 0.2), 1.0))
    sprite("standard", "jog", cut_disc(load(SRC / "standard" / "jog.jpg"), 512))

    # CABINET: embossed ABS; the turntable and the acrylic buttons
    material("cabinet", "abs", abs_plastic())
    sprite("cabinet", "turntable", cut_disc(load(SRC / "cabinet" / "turntable.jpg"), 512))
    sprite("cabinet", "button", cut_disc(load(SRC / "cabinet" / "button.jpg"), 384))

    # RECEIVER: walnut sides, brushed silver faceplate; the tuning knob and the piano-key switches
    material("receiver", "walnut", walnut())
    material("receiver", "silver", brushed(512, 512, 41, "#c3c7cc", 0.06, vertical=False))
    sprite("receiver", "knob", cut_disc(load(SRC / "receiver" / "knob.jpg"), 512))
    # the switch's lamp lies in its top part, which is kept as drawn; its bevel mirrored the magenta ground, and aluminium has no colour of its own
    sprite("receiver", "switch", neutral(shorten(cut_round_rect(load(SRC / "receiver" / "switch.jpg"), 512, 0.1), 1.15), 1.0))

    # NAJEON: the frame's pearl vine (the generated band's narrow left column: its wide middle is too fine
    # for a frame 30 plane px wide), the pearl tablets, the crane's lid, the lock plate
    band = load(SRC / "najeon" / "band.jpg")[:, 80:258]
    material("najeon", "band", resize(band, 128, 2048))
    sprite("najeon", "tablet", shorten(cut_round_rect(load(SRC / "najeon" / "tablet.jpg"), 512, 0.3), 1.05))
    sprite("najeon", "lid", cut_disc(load(SRC / "najeon" / "lid.jpg"), 512))
    sprite("najeon", "lock", cut_disc(load(SRC / "najeon" / "lock.jpg"), 512))

    print(json.dumps(report, indent=1))
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    kept = {k: t for k, t in manifest["textures"].items() if not t["file"].startswith("gears/")}
    manifest["textures"] = dict(sorted({**kept, **textures}.items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
