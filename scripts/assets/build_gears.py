"""Builds the gears' game pictures into client/public/media/gears/<gear>/ and lists them in
client/public/media/manifest.json as "<gear>/<part>" (the manifest's other entries are kept).

    python scripts/assets/build_gears.py

Three kinds of picture:

- each gear's deck, painted whole in the game camera's perspective (the generation in
  assets-src/gears/<gear>/deck.jpg, the deck's things standing up out of it) and laid flat on the deck
  here: each texel of the deck plane (plane px across the track, along it from the deck's top edge down
  as far as the generation shows it) sampled where the generation shows it, through the mapping in
  deck.json (deck plane px to the generation's px: the camera's homography of the template frame the
  generation was asked to repaint, times the alignment of the generation onto that frame). The renderer
  draws it on the cameras near the one it was painted from (deckArt.ts: deckPicture);

- materials, made here from seeded noise (so they come out the same on every run, and tile without a
  seam: the noise is filtered in frequency space, which wraps): the arcade cabinet's embossed ABS, the
  receiver's brushed silver and walnut, the standard gear's brushed graphite, the keyboard's
  bead-blasted aluminium, the racing wheel's twill carbon, the orbital panel's grey paint; and the
  orbital frame's gold foil, cut from a generated texture (the renderer repeats it mirrored);
- objects, from the picked generations in assets-src/gears/<gear>/ (drawn top-down on a flat magenta
  ground, where they came from: assets-src/PROVENANCE.md): each is cut to the object and masked to its
  shape (a circle or a rounded rectangle, the ground keyed out of its edge), and the najeon frame's
  pearl vine, cut from the generated band (the renderer repeats it down the track mirrored, so it runs
  on without a seam). The decks lay them out as each object's own panel: none is a lane's key. The
  generation lit the objects' rims with the magenta ground: it is taken out of them (despill), and out
  of the orbital panel's colourless parts whole (their chrome mirrored it).

The renderer draws them (client/src/render/deckArt.ts: GEAR_PLATES, GEAR_FRAMES; the parts' manifest ids in
styleArt.ts: GEAR_PICTURES), each object at its picture's proportions.
Needs Pillow, numpy and scipy.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
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


def save_webp(a: np.ndarray, path: Path, quality: int = 90) -> None:
    """A photo-like picture (a deck) as lossy WebP, a fraction of its PNG."""
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "RGB").save(path, "WEBP", quality=quality, method=6)


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


def bead_blast(seed: int, base: str) -> np.ndarray:
    """Bead-blasted anodised aluminium (the keyboard's case): a fine even grain over a faint slow cloud."""
    h = w = 512
    v = 0.75 * noise(h, w, seed, 0.45, 0.45) + 0.25 * noise(h, w, seed + 1, 0.01, 0.01)
    return np.clip(hexrgb(base)[None, None, :] * (1 + 0.07 * v[..., None]), 0, 1)


def carbon() -> np.ndarray:
    """2×2 twill carbon fibre (the racing wheel's): tows 16 px wide, each over two and under two, a step
    on at every row (the twill's diagonal); each lit across its round and dark where it dives under,
    fine fibres along it, the tows down the track catching more of the light than those across;
    16 tows a side, so it tiles."""
    cell, n = 16, 16
    size = cell * n
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    i, j = (y // cell).astype(int), (x // cell).astype(int)
    phase = (i + j) % 4
    down = phase < 2
    u = (x % cell + 0.5) / cell
    v = (y % cell + 0.5) / cell
    round_ = np.sin(np.pi * np.where(down, u, v)) ** 0.6
    # where a float starts and ends, the tow dives under its neighbour
    along = np.where(down, np.where(phase == 0, v, 1 - v), np.where(phase == 2, u, 1 - u))
    dive = smoothstep(0.0, 0.3, along)
    fibres = np.where(down, noise(size, size, 71, 0.03, 0.7), noise(size, size, 72, 0.7, 0.03))
    k = np.where(down, 1.0, 0.6) * (0.35 + 0.65 * round_) * (0.55 + 0.45 * dive) + 0.05 * fibres
    dark, light = hexrgb("#0c0d0f"), hexrgb("#3b3e44")
    k = np.clip(k, 0, 1)[..., None]
    return np.clip(dark * (1 - k) + light * k + 0.012, 0, 1)


def grey_paint() -> np.ndarray:
    """The orbital panel's light grey paint: a fine orange peel and a faint slow mottle."""
    h = w = 512
    v = 0.5 * noise(h, w, 81, 0.25, 0.25) + 0.5 * noise(h, w, 82, 0.008, 0.008)
    return np.clip(hexrgb("#c3c6cb")[None, None, :] * (1 + 0.025 * v[..., None]), 0, 1)


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


def object_box(a: np.ndarray, warm: bool = False) -> tuple[int, int, int, int]:
    """The object's box (top, bottom, left, right): the largest part off the ground (`warm`: of its px
    with no more blue than green, a brass face without the side face and shadow the ground turned pink)."""
    fg = ground_mask(a)
    if warm:
        fg &= a[..., 1] >= a[..., 2]
    fg = ndimage.binary_opening(fg, iterations=3)
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


def cut_disc(a: np.ndarray, size: int, keep: float = 1.0) -> np.ndarray:
    """A round object: keyed off its ground and trimmed to the circle of its box (`keep` of its radius: a
    light ring round it left for the renderer to draw)."""
    t, b, l, r = object_box(a)
    cy, cx = (t + b) / 2, (l + r) / 2
    rad = (min(b - t, r - l) / 2 + 2) * keep
    crop = a[max(0, int(cy - rad)):int(cy + rad), max(0, int(cx - rad)):int(cx + rad)]
    out = shrink(keyed(crop), size, size)
    out[..., 3] = np.minimum(out[..., 3], disc_alpha(size, 0.004))
    return out


def cut_round_rect(a: np.ndarray, height: int, corner: float, inset: float = 0.0, warm: bool = False) -> np.ndarray:
    """An object with round corners: keyed off its ground at its box's proportions, `height` px tall, trimmed to a rectangle with corners `corner` of its shorter side
    (`inset` of that side cut off all round: an outer rim the ground coloured; `warm`: see object_box)."""
    t, b, l, r = object_box(a, warm)
    d = round(inset * min(b - t, r - l))
    t, b, l, r = t + d, b - d, l + d, r - d
    pad = 2 if d == 0 else 0
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


def deck_flat(src: Path, meta: dict, width_px: int = 2048, inset: float = 1.5) -> np.ndarray:
    """A gear's deck laid flat from its generation (see the module's doc): `width_px` texels across the
    deck (`meta["width"]` plane px, sampled `inset` plane px clear of the walls' foot), as many along it
    as `meta["room"]` plane px down from the deck's top edge (`meta["top"]` under the judge line) take;
    `meta["h"]`: row-major 3×3 homography from deck plane px (across from the track's middle, toward
    the camera from the judge line) to the generation's px."""
    img = load(src)
    h = np.array(meta["h"], dtype=np.float64).reshape(3, 3)
    width, top, room = meta["width"], meta["top"], meta["room"]
    k = width_px / width
    rows = int(round(room * k))
    u = (np.arange(width_px) + 0.5) / k
    v = (np.arange(rows) + 0.5) / k
    x = inset + u * (width - 2 * inset) / width - width / 2
    xx, yy = np.meshgrid(x, top + v)
    p = h @ np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)])
    sx, sy = p[0] / p[2] - 0.5, p[1] / p[2] - 0.5
    out = np.stack([ndimage.map_coordinates(img[..., c], [sy, sx], order=1, mode="nearest") for c in range(3)], axis=-1)
    return out.reshape(rows, width_px, 3)


def despill(rgba: np.ndarray, reach: int = 12) -> np.ndarray:
    """The magenta ground's light taken out of an object's rim (`reach` px in from its edge): red and blue
    down to where green allows, as a keyer's despill; colours further in (a red ball, pink pearl) are kept."""
    edge = Image.fromarray(np.clip(rgba[..., 3] * 255 + 0.5, 0, 255).astype(np.uint8), "L").filter(ImageFilter.BoxBlur(reach))
    near = np.asarray(edge, dtype=np.float32) / 255 < 0.995
    out = rgba.copy()
    spill = np.clip(np.minimum(out[..., 0] - out[..., 1], out[..., 2] - out[..., 1]), 0, None) * near
    out[..., 0] -= spill
    out[..., 2] -= spill
    return out


def own_hue_rim(rgba: np.ndarray, reach: int = 10) -> np.ndarray:
    """An object's rim (`reach` px in from its edge) in the colour of its middle, at the rim's own
    brightness: a bevel that mirrored the ground pink where despill cannot tell it from the object's warm
    colour (brass)."""
    h, w = rgba.shape[:2]
    middle = rgba[h // 4:3 * h // 4, w // 4:3 * w // 4, :3].reshape(-1, 3)
    hue = np.median(middle, axis=0)
    weights = np.array([0.299, 0.587, 0.114], dtype=np.float32)
    hue = hue / float(hue @ weights)
    # the alpha with clear px round it, so the picture's own edge counts as the object's
    alpha = np.pad(np.clip(rgba[..., 3] * 255 + 0.5, 0, 255).astype(np.uint8), reach + 1)
    edge = np.asarray(Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(2 * reach + 1)), dtype=np.float32)[reach + 1:-reach - 1, reach + 1:-reach - 1]
    rim = (edge / 255 < 0.5)[..., None]
    out = rgba.copy()
    lum = (rgba[..., :3] @ weights)[..., None]
    out[..., :3] = np.where(rim, np.clip(lum * hue, 0, 1), rgba[..., :3])
    return out


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

    def deck(gear: str) -> None:
        src = SRC / gear / "deck.jpg"
        if not src.exists():
            return
        a = deck_flat(src, json.loads((SRC / gear / "deck.json").read_text(encoding="utf-8")))
        save_webp(a, OUT / gear / "deck.webp")
        entry(textures, gear, "deck", "deck.webp", (a.shape[1], a.shape[0]))
        report[f"{gear}/deck"] = [a.shape[1], a.shape[0]]

    for gear in ("standard", "cabinet", "receiver", "najeon", "keyboard", "racing", "orbital"):
        deck(gear)

    def sprite(gear: str, part: str, a: np.ndarray) -> None:
        a = despill(a)
        save_rgba(a, OUT / gear / f"{part}.png")
        entry(textures, gear, part, f"{part}.png", (a.shape[1], a.shape[0]))
        report[f"{gear}/{part}"] = [a.shape[1], a.shape[0]]

    # STANDARD: brushed graphite down its rails; a smoked glass jog dial on its deck
    material("standard", "graphite", brushed(1024, 256, 31, "#2a2c31", 0.05, vertical=True))
    sprite("standard", "jog", cut_disc(load(SRC / "standard" / "jog.jpg"), 512))

    # CABINET: embossed ABS; on its control panel a joystick, acrylic buttons and the coin entry
    material("cabinet", "abs", abs_plastic())
    sprite("cabinet", "joystick", cut_disc(load(SRC / "cabinet" / "joystick.jpg"), 512))
    sprite("cabinet", "button", cut_disc(load(SRC / "cabinet" / "button.jpg"), 384))
    sprite("cabinet", "coin", cut_round_rect(load(SRC / "cabinet" / "coin.jpg"), 384, 0.06))

    # RECEIVER: walnut sides, brushed silver faceplate; the tuning knob and the piano-key switches
    material("receiver", "walnut", walnut())
    material("receiver", "silver", brushed(512, 512, 41, "#c3c7cc", 0.06, vertical=False))
    sprite("receiver", "knob", cut_disc(load(SRC / "receiver" / "knob.jpg"), 512))
    # the selector switches: the lamp lies in the switch's top part, which is kept as drawn; its bevel mirrored the magenta ground, and aluminium has no colour of its own
    sprite("receiver", "switch", neutral(shorten(cut_round_rect(load(SRC / "receiver" / "switch.jpg"), 512, 0.1), 1.15), 1.0))

    # NAJEON: the frame's pearl vine (the generated band's narrow left column: its wide middle is too fine
    # for a frame 30 plane px wide; the deck lays it across too), the crane's lid, the lock plate
    band = load(SRC / "najeon" / "band.jpg")[:, 80:258]
    material("najeon", "band", resize(band, 128, 2048))
    sprite("najeon", "lid", cut_disc(load(SRC / "najeon" / "lid.jpg"), 512))
    sprite("najeon", "lock", cut_disc(load(SRC / "najeon" / "lock.jpg"), 512))

    # KEYBOARD: bead-blasted charcoal aluminium; the volume knob in its light ring, the arrow keys' caps, the brass name plate
    material("keyboard", "alu", bead_blast(51, "#2b2d32"))
    # the knob without its light ring (the deck draws it in code); knob and caps colourless (the
    # deck tints the caps); the plate without its side face and shadow, which the ground turned pink
    sprite("keyboard", "knob", neutral(cut_disc(load(SRC / "keyboard" / "knob.jpg"), 512, keep=0.895), 1.0))
    sprite("keyboard", "keycap", neutral(cut_round_rect(load(SRC / "keyboard" / "keycap.jpg"), 384, 0.16), 1.0))
    sprite("keyboard", "brass", own_hue_rim(cut_round_rect(load(SRC / "keyboard" / "brass.jpg"), 192, 0.06, inset=0.01, warm=True)))

    # RACING: twill carbon (its frame too); the big rotary and the small one, the rubber buttons (the deck tints their rings)
    material("racing", "carbon", carbon())
    sprite("racing", "rotary", neutral(cut_disc(load(SRC / "racing" / "rotary.jpg"), 512), 1.0))
    sprite("racing", "button", neutral(cut_disc(load(SRC / "racing" / "button.jpg"), 384), 1.0))

    # ORBITAL: grey paint; the gold foil down its frame (a strip of the generated texture, 1:6 as the frame
    # lays it, so it is not stretched); the guarded selector, the guarded toggles, the square push buttons
    material("orbital", "paint", grey_paint())
    foil = load(SRC / "orbital" / "foil.jpg")
    material("orbital", "foil", resize(foil[:, : foil.shape[0] // 6], 128, 768))
    sprite("orbital", "selector", neutral(cut_disc(load(SRC / "orbital" / "selector.jpg"), 512), 1.0))
    sprite("orbital", "toggle", neutral(cut_round_rect(load(SRC / "orbital" / "toggle.jpg"), 512, 0.05), 1.0))
    sprite("orbital", "button", neutral(cut_round_rect(load(SRC / "orbital" / "button.jpg"), 384, 0.1), 1.0))

    print(json.dumps(report, indent=1))
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    kept = {k: t for k, t in manifest["textures"].items() if not t["file"].startswith("gears/")}
    manifest["textures"] = dict(sorted({**kept, **textures}.items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
