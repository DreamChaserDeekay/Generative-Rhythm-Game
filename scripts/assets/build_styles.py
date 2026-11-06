"""Builds the concept sets' game pictures from assets-src/styles/<set>/ into client/public/media/styles/<set>/
and lists them in client/public/media/manifest.json as "<set>/<name>" (the crystal set as "gem/<name>": see NAME;
the manifest's other entries are kept), and the flipbooks of the hits of no set (FLASH, FLARE, BUBBLES, GRID) from
assets-src/styles/hits/ into client/public/media/styles/hits/ as "<hit>/hitBurst" and "<hit>/hitHold".

    python scripts/assets/build_styles.py

The sources are the picked generations, stored as JPEG (quality 95, no chroma subsampling) to keep the
repository small; where each came from: assets-src/PROVENANCE.md. Notes, long notes and side notes become tint
pictures (client/src/render/tintArt.ts): red is how much of the lane colour shows, green how far it is then
lifted toward white, alpha the shape; the art is drawn for a neutral white lane, so its value says how much
colour shows. Hit effects become flipbooks of light on black. The sets have no gear: the four gears are built by
scripts/assets/build_gears.py. The layouts written here are read by client/src/render/styleArt.ts: change the
two together.
Needs Pillow, numpy and scipy.
"""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "styles"
MEDIA = ROOT / "client" / "public" / "media"
OUT = MEDIA / "styles"


# ---------- helpers ----------


def load(path: Path) -> np.ndarray:
    """RGB as float32 in 0..1."""
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255


def value(a: np.ndarray) -> np.ndarray:
    return a.mean(axis=2)


def blobs(v: np.ndarray, threshold: float, count: int) -> list[tuple[slice, slice]]:
    """The `count` largest shapes brighter than `threshold` (holes filled), top to bottom, then left to right."""
    mask = ndimage.binary_fill_holes(v > threshold)
    labels, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    boxes = ndimage.find_objects(labels)
    keep = [boxes[i] for i in np.argsort(sizes)[::-1][:count]]
    return sorted(keep, key=lambda b: (b[0].start // 64, b[1].start))


def shape_alpha(v: np.ndarray, threshold: float = 0.05, rim: float = 0.12) -> np.ndarray:
    """The coverage of a shape on black: 1 inside it, its anti-aliased edge from how bright the edge pixels are."""
    inside = ndimage.binary_fill_holes(v > threshold)
    core = ndimage.binary_erosion(inside, iterations=2)
    edge = ndimage.binary_dilation(inside, iterations=2) & ~core
    alpha = core.astype(np.float32)
    alpha[edge] = np.clip(v[edge] / rim, 0, 1)
    return alpha


def unpremultiply(v: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """A shape's own value where it only partly covers the black (its edge shows darker by its coverage)."""
    return np.where(alpha > 1e-3, np.clip(v / np.maximum(alpha, 1e-3), 0, 1), 0)


def resize_premultiplied(rgba: np.ndarray, w: int, h: int) -> np.ndarray:
    """Resizes an RGBA float image without dark fringes: colours are filtered weighted by their alpha."""
    a = rgba[..., 3:4]
    pre = np.concatenate([rgba[..., :3] * a, a], axis=2)
    out = np.stack([np.asarray(Image.fromarray(pre[..., c]).resize((w, h), Image.LANCZOS)) for c in range(4)], axis=2)
    out = np.clip(out, 0, 1)
    oa = out[..., 3:4]
    colour = np.where(oa > 1e-3, np.clip(out[..., :3] / np.maximum(oa, 1e-3), 0, 1), 0)
    return np.concatenate([colour, oa], axis=2)


def resize_grey(v: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.clip(np.asarray(Image.fromarray(v.astype(np.float32)).resize((w, h), Image.LANCZOS)), 0, 1)


def tint(v: np.ndarray, alpha: np.ndarray, gain: float, lift: float, white: float = 0.85, power: float = 1.3) -> np.ndarray:
    """A tint picture (RGBA float) of neutral art of value `v` (unpremultiplied): red = v × gain, the brightest
    parts (from `lift` up) lifted toward white, at most `white` of the way."""
    r = np.clip(v * gain, 0, 1)
    g = np.clip((v - lift) / (1 - lift), 0, 1) ** power * white
    return np.stack([r, g, np.zeros_like(r), alpha], axis=2)


def save_rgba(rgba: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(np.rint(rgba * 255), 0, 255).astype(np.uint8), "RGBA").save(path, optimize=True)


def save_grey(v: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(np.rint(v * 255), 0, 255).astype(np.uint8), "L").save(path, optimize=True)


def paste(canvas: np.ndarray, part: np.ndarray, x: int, y: int) -> None:
    canvas[y:y + part.shape[0], x:x + part.shape[1]] = part


def seamless_rows(a: np.ndarray, length: int, overlap: int) -> np.ndarray:
    """`length` rows of `a` that repeat without a seam: its last `overlap` rows are blended into its first."""
    body = a[:length + overlap].copy()
    t = np.linspace(0, 1, overlap, dtype=np.float32)[:, None, None]
    body[:overlap] = body[:overlap] * t + body[length:length + overlap] * (1 - t)
    return body[:length]


# ---------- MECHA ----------

MECHA = SRC / "mecha"
MECHA_OUT = OUT / "mecha"

# notes.png: a row per lane mark (white ○, blue △, gold ◇, scratch //), each note NOTE_W × NOTE_H at
# y = row × NOTE_ROW + NOTE_TOP; NOTE_CUTS: the end caps' and the mark's edges (x) — what lies between is
# stretched to the lane's proportions (styleArt.ts: MECHA_NOTES)
NOTE_W, NOTE_H, NOTE_ROW, NOTE_TOP = 1024, 210, 256, 23
NOTE_CUTS = (156, 451, 573, 868)

# long.png: the rail's body (a tile that repeats along the note) and its end, idle and held, LONG_W wide
LONG_W, LONG_TILE, LONG_END = 128, 256, 48

# side.png: the bar laid over half the keys at (0, 0), the side lane's own note at (0, SIDE_PLATE_Y)
SIDE_BAR_W, SIDE_PLATE_W, SIDE_PLATE_Y = 1024, 512, 240


def mecha_notes(textures: dict) -> None:
    a = load(MECHA / "notes.jpg")
    v = value(a)
    boxes = blobs(v, 0.05, 4)
    h = max(b[0].stop - b[0].start for b in boxes)
    w = max(b[1].stop - b[1].start for b in boxes)
    atlas = np.zeros((1024, 1024, 4), np.float32)
    for row, (ys, xs) in enumerate(boxes):
        cy, cx = (ys.start + ys.stop) // 2, (xs.start + xs.stop) // 2
        crop = v[cy - h // 2:cy - h // 2 + h, cx - w // 2:cx - w // 2 + w]
        alpha = shape_alpha(crop)
        own = unpremultiply(crop, alpha)
        rgba = tint(own, alpha, gain=1 / 0.62, lift=0.66, white=0.8)
        paste(atlas, resize_premultiplied(rgba, NOTE_W, NOTE_H), 0, row * NOTE_ROW + NOTE_TOP)
    save_rgba(atlas, MECHA_OUT / "notes.png")
    textures["mecha/notes"] = {"file": "styles/mecha/notes.png", "bundle": "notes", "size": [1024, 1024]}


def mecha_long(textures: dict) -> None:
    a = load(MECHA / "long.jpg")
    v = value(a)
    idle, held = sorted(blobs(v, 0.06, 2), key=lambda b: b[1].start)
    # the held rail glows past its edges: cut it as wide as the idle one, about its middle
    (iy, ix) = idle
    rail_w = ix.stop - ix.start
    mid = (held[1].start + held[1].stop) // 2
    hx = slice(mid - rail_w // 2, mid - rail_w // 2 + rail_w)
    # its end: the cut corners and the bevel under them, as deep as LONG_END is of LONG_W
    cap = round(rail_w * LONG_END / LONG_W)
    atlas = np.zeros((256, 512, 4), np.float32)
    for i, (xs, top) in enumerate([(ix, iy.start), (hx, iy.start)]):
        rail = v[:, xs]
        alpha = shape_alpha(rail)
        own = unpremultiply(rail, alpha)
        # held: the glow inside the rail is light, lifted toward white more than the idle metal is
        rgba = tint(own, alpha, gain=1 / 0.6, lift=0.62, white=0.85) if i == 0 else tint(own, alpha, gain=1 / 0.55, lift=0.55, white=0.9)
        # the body: a stretch of the rail's middle that repeats without a seam, LONG_TILE / LONG_W widths long
        length = round(rail_w * LONG_TILE / LONG_W)
        y0 = (iy.start + iy.stop) // 2 - length // 2
        body = seamless_rows(rgba[y0:y0 + length + length // 4], length, length // 4)
        paste(atlas, resize_premultiplied(body, LONG_W, LONG_TILE), i * LONG_W, 0)
        # the end: from the rail's top edge down, alpha cut off where the body takes over
        end = rgba[top:top + cap]
        paste(atlas, resize_premultiplied(end, LONG_W, LONG_END), 256 + i * LONG_W, 0)
    save_rgba(atlas, MECHA_OUT / "long.png")
    textures["mecha/long"] = {"file": "styles/mecha/long.png", "bundle": "notes", "size": [512, 256]}


def mecha_side(textures: dict) -> dict:
    a = load(MECHA / "side.jpg")
    v = value(a)
    plate, bar = sorted(blobs(v, 0.06, 2), key=lambda b: b[0].start)
    atlas = np.zeros((512, 1024, 4), np.float32)
    layout = {}
    # the bar over the keys: its two long edges glow; the grille between them is see-through
    ys, xs = bar
    crop = v[ys, xs]
    alpha = shape_alpha(crop, threshold=0.04, rim=0.3)
    own = unpremultiply(crop, alpha)
    h, w = crop.shape
    # the end blocks are opaque metal; the middle (grille) is half see-through, the glowing tubes opaque
    ends = np.zeros_like(crop, bool)
    profile = (v[ys, xs][h // 2 - 4:h // 2 + 4] > 0.45).mean(0)
    block = int(np.argmax(profile[: w // 3] < 0.5)) if (profile[: w // 3] < 0.5).any() else w // 10
    block = max(block, int(w * 0.06))
    ends[:, : block] = True
    ends[:, w - block:] = True
    tubes = own > 0.7
    see = (~ends) & (~tubes) & (alpha > 0.99)
    alpha = np.where(see, 0.62, alpha)
    rgba = tint(own, alpha, gain=1 / 0.55, lift=0.6, white=0.85)
    bh = round(SIDE_BAR_W * h / w)
    paste(atlas, resize_premultiplied(rgba, SIDE_BAR_W, bh), 0, 0)
    layout["bar"] = {"h": bh, "cut": round(block * SIDE_BAR_W / w)}
    # the side lane's own note: a grille plate
    ys, xs = plate
    crop = v[ys, xs]
    alpha = shape_alpha(crop)
    own = unpremultiply(crop, alpha)
    h, w = crop.shape
    rgba = tint(own, alpha, gain=1 / 0.6, lift=0.66, white=0.8)
    ph = round(SIDE_PLATE_W * h / w)
    paste(atlas, resize_premultiplied(rgba, SIDE_PLATE_W, ph), 0, SIDE_PLATE_Y)
    layout["plate"] = {"h": ph}
    save_rgba(atlas, MECHA_OUT / "side.png")
    textures["mecha/side"] = {"file": "styles/mecha/side.png", "bundle": "notes", "size": [1024, 512]}
    return layout


def chamfer_alpha(h: int, w: int, cut: float) -> np.ndarray:
    s = 4
    im = Image.new("L", (w * s, h * s), 0)
    c = min(w, h) * cut * s
    W, H = w * s, h * s
    ImageDraw.Draw(im).polygon([(c, 0), (W - c, 0), (W, c), (W, H - c), (W - c, H), (c, H), (0, H - c), (0, c)], fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


# hit_burst.png: 16 frames (4 × 4 of HIT_CELL px) of a hit, played once; hit_hold.png: 16 frames of the light while a
# long note is held, looping. The judge line runs through the middle of a frame and the effect spreads from it every
# way, whole: its numbers are in HIT_SIZE px (the effect's own size), each frame is drawn HIT_ROOM px square (room all
# round it, its edges faded) and sampled down to HIT_CELL. The manifest's "span" (HIT_SPAN) tells the renderer how
# much larger than the effect a frame is.
HIT_CELL, HIT_SIZE, HIT_ROOM = 256, 256, 352
HIT_SPAN = HIT_ROOM / HIT_SIZE


def hit_entry(file: str, kind: str) -> dict:
    """A hit flipbook's manifest entry: `kind` "burst" (once, fast) or "hold" (a loop)."""
    return {
        "file": file,
        "bundle": "effects",
        "size": [HIT_CELL * 4, HIT_CELL * 4],
        "flipbook": {"cols": 4, "rows": 4, "frames": 16, "fps": 60 if kind == "burst" else 24, "loop": kind == "hold"},
        "anchorY": 0.5,
        "span": round(HIT_SPAN, 4),
    }


def light_cells() -> dict[str, np.ndarray]:
    """The effect sheet's four cells (light on black), the faint lines between them cleared."""
    v = np.asarray(Image.open(MECHA / "fx.jpg").convert("L"), dtype=np.float32) / 255
    n = v.shape[0] // 2
    cells = {"flash": v[:n, :n], "ring": v[:n, n:], "sprites": v[n:, :n], "weld": v[n:, n:]}
    out = {}
    for key, c in cells.items():
        c = c.copy()
        c[:8], c[-8:], c[:, :8], c[:, -8:] = 0, 0, 0, 0
        # the JPEG's faint noise in the black stays black (it would add up over the screen)
        out[key] = np.clip((c - 0.03) / 0.97, 0, 1)
    return out


def place(frame: np.ndarray, sprite: np.ndarray, cx: float, cy: float, size: float, angle: float = 0, gain: float = 1) -> None:
    """Adds `sprite` (light, square) onto `frame`, centred at (cx, cy), `size` px across, turned `angle` degrees."""
    if size < 2 or gain <= 0:
        return
    im = Image.fromarray(sprite.astype(np.float32))
    if angle:
        im = im.rotate(angle, resample=Image.BICUBIC, expand=True)
    k = size / sprite.shape[1]
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    s = np.clip(np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32), 0, 1) * gain
    x0, y0 = round(cx - w / 2), round(cy - h / 2)
    fx0, fy0 = max(0, x0), max(0, y0)
    fx1, fy1 = min(frame.shape[1], x0 + w), min(frame.shape[0], y0 + h)
    if fx1 <= fx0 or fy1 <= fy0:
        return
    frame[fy0:fy1, fx0:fx1] += s[fy0 - y0:fy1 - y0, fx0 - x0:fx1 - x0]


def crop_around(c: np.ndarray, cy: int, cx: int, r: int) -> np.ndarray:
    pad = np.pad(c, r)
    return pad[cy:cy + 2 * r, cx:cx + 2 * r]


def mecha_hits(textures: dict) -> None:
    cells = light_cells()
    n = cells["flash"].shape[0]
    flash = crop_around(cells["flash"], 495, 509, n // 2 - 8)
    ring = crop_around(cells["ring"], 470, 494, n // 2 - 8)
    # the spark streaks of the sprites' right column, each turned to point right (its bright head outward)
    streaks = []
    s = cells["sprites"]
    labels, count = ndimage.label(ndimage.binary_dilation(s > 0.1, iterations=3))
    for box in ndimage.find_objects(labels):
        ys, xs = box
        if xs.start < s.shape[1] // 2 or xs.stop - xs.start < 150:
            continue
        piece = s[ys, xs]
        if piece[:, : piece.shape[1] // 2].sum() > piece[:, piece.shape[1] // 2:].sum():
            piece = piece[:, ::-1]
        w = piece.shape[1]
        sq = np.zeros((w, w), np.float32)
        sq[w // 2 - piece.shape[0] // 2:w // 2 - piece.shape[0] // 2 + piece.shape[0]] = piece
        streaks.append(sq)
    cell, cx = HIT_SIZE, HIT_ROOM / 2
    line = cx

    def draw(f: int, frame: np.ndarray) -> None:
        # the white-hot flash: two frames at its peak, then gone by the sixth
        flash_gain = [1.0, 1.0, 0.72, 0.45, 0.24, 0.1][f] if f < 6 else 0
        place(frame, flash, cx, line, cell * [0.62, 0.86, 0.94, 0.98, 1.0, 1.0][min(f, 5)], f * 2.5, flash_gain)
        # the shards fly out in a ring, slowing, and fade from the sixth frame
        if f >= 1:
            t = min(1, (f - 1) / 12)
            grow = 0.34 + 0.78 * (1 - (1 - t) ** 2)
            fade = max(0.0, 1 - max(0, f - 5) / 10) ** 1.3
            place(frame, ring, cx, line, cell * grow, f * 0.8, fade)
        # sparks shoot out all round the hit, fast, and are gone by the tenth frame
        if f < 10:
            t = f / 10
            for i in range(10):
                angle = i * 36 + 14
                st = streaks[i % len(streaks)]
                reach = cell * (0.08 + 0.42 * (1 - (1 - t) ** 2)) * (0.85 + 0.1 * (i % 3))
                a = math.radians(angle)
                place(frame, st, cx + reach * math.cos(a), line + reach * math.sin(a), cell * 0.3, -angle, (1 - t) ** 1.4)
        # an afterglow on the line, fading
        if f >= 1:
            afterglow(frame, line, 0.55 * (1 - f / 16) ** 1.2)

    save_grey(burst_sheet(draw), MECHA_OUT / "hit_burst.png")
    textures["mecha/hitBurst"] = hit_entry("styles/mecha/hit_burst.png", "burst")
    mecha_hold(cells["weld"], textures)


def mecha_hold(weld: np.ndarray, textures: dict) -> None:
    """The weld glow on the line, flickering a little, and sparks flying out all round it, as a seamless loop."""
    n = weld.shape[0]
    # the glow: the band of rows where the white-hot spot is wide (the spark shower under it is narrow)
    width = (weld > 0.9).sum(1)
    band = np.where(width > width.max() * 0.5)[0]
    cy = (band[0] + band[-1]) // 2
    cols = np.where(weld[band[0]:band[-1] + 1] > 0.9)[1]
    cx = (cols.min() + cols.max()) // 2
    # the glow alone: the cell down to a short way under the spot (the shower is drawn anew)
    y = np.arange(n, dtype=np.float32)[:, None]
    under = band[-1] + 16
    glow = weld * np.clip(1 - (y - under) / 40, 0, 1)
    glow = crop_around(glow, cy, cx, n // 2 - 8)
    cell, mid = HIT_SIZE, HIT_ROOM / 2
    rng = np.random.default_rng(7)
    sparks = [(rng.uniform(0, 1), math.radians(rng.uniform(0, 360)), rng.uniform(0.4, 1.0), rng.uniform(0.6, 1.0)) for _ in range(72)]

    def draw(f: int, frame: np.ndarray) -> None:
        flicker = 0.93 + 0.07 * math.sin(2 * math.pi * f * 3 / 16)
        place(frame, glow, mid, mid, cell * 0.98, 0, flicker)
        # each spark flies out from the glow, its own way, over a sixteenth of its own period, then starts again
        hi = Image.new("L", (HIT_ROOM * 4, HIT_ROOM * 4), 0)
        d = ImageDraw.Draw(hi)
        for phase, a, speed, bright in sparks:
            t = (f / 16 + phase) % 1
            r = cell * (0.05 + 0.42 * speed * t)
            x, y0 = mid + r * math.cos(a), mid + r * math.sin(a)
            tail = cell * 0.035 * speed
            x1, y1 = x - tail * math.cos(a), y0 - tail * math.sin(a)
            level = int(255 * bright * (1 - t))
            if level > 4:
                d.line([(x1 * 4, y1 * 4), (x * 4, y0 * 4)], fill=level, width=6)
        frame += np.asarray(hi.resize((HIT_ROOM, HIT_ROOM), Image.LANCZOS), dtype=np.float32) / 255

    save_grey(burst_sheet(draw), MECHA_OUT / "hit_hold.png")
    textures["mecha/hitHold"] = hit_entry("styles/mecha/hit_hold.png", "hold")


# ---------- CLUB, CRYSTAL, NEON: one builder, each set's own numbers ----------
#
# Px of a source sheet. The atlases (styleArt.ts):
#   notes.png 1024 × 1024: a 2 × 2 grid of 512 cells (white, blue, gold, scratch), the note fitted in 500 px about
#     the cell's middle (CRYSTAL's four-pointed star STAR_CELL deep and as wide as its shape makes it, see gem_star;
#     `rows`: the source sheet's notes lie one under another; without `star` they would go a row of 256 each, 1024
#     wide about the row's middle)
#   long.png 512 × 256: body idle | body held | end idle | end held, 128 wide (ends `end` px deep)
#   side.png 1024 × 512: the bar over the keys at (0, 0); the side lane's own note at (0, 256)

SET_ART = {
    "club": {
        "notes": {"rows": False, "gain": 1 / 0.6, "lift": 0.7, "white": 0.8, "disc": True},
        "long": {"cap": 140, "idle": (1 / 0.8, 0.74, 0.7), "held": (1 / 0.62, 0.6, 0.9), "see": None},
        "side": {"cut": 0.105, "plate_cut": 0.21, "tint": (1 / 0.62, 0.68, 0.85), "bright": 0.62},
    },
    "crystal": {
        # its long cut gem drawn as a four-pointed star (gem_star), in a cell as the others'
        "notes": {"rows": True, "gain": 1 / 0.7, "lift": 0.74, "white": 0.85, "star": {"shape": 1.15, "arm": 2.6, "reach": 0.2, "power": 3}},
        "long": {"cap": 150, "idle": (1 / 0.7, 0.72, 0.8), "held": (1 / 0.6, 0.6, 0.9), "see": None},
        "side": {"cut": 0.04, "plate_cut": 0.07, "tint": (1 / 0.65, 0.7, 0.9), "bright": 0.6},
    },
    "neon": {
        "notes": {"rows": False, "gain": 1 / 0.7, "lift": 0.72, "white": 0.85},
        "long": {"cap": 184, "idle": (1 / 0.72, 0.7, 0.85), "held": (1 / 0.62, 0.6, 0.9), "see": 0.55},
        "side": {"cut": 0.04, "plate_cut": 0.16, "tint": (1 / 0.7, 0.7, 0.9), "bright": 0.62},
    },
}

# Sets whose notes were taken out of the game: their hit alone is built (PIANO's musical notes).
HIT_ONLY = ["piano"]


# The sets' names in the manifest: "crystal" already names an earlier texture set (skins/crystal/, which user
# skins may ask for by name), so the crystal set's pictures are listed as "gem/<name>".
NAME = {"crystal": "gem"}


def fit_into(rgba: np.ndarray, w: int, h: int) -> np.ndarray:
    """`rgba` scaled to fit w × h, keeping its proportions, about the middle of a transparent w × h."""
    sh, sw = rgba.shape[:2]
    k = min(w / sw, h / sh)
    tw, th = max(1, round(sw * k)), max(1, round(sh * k))
    out = np.zeros((h, w, 4), np.float32)
    paste(out, resize_premultiplied(rgba, tw, th), (w - tw) // 2, (h - th) // 2)
    return out


def disc_of(v: np.ndarray, ys: slice, xs: slice) -> tuple[float, float, float]:
    """The round note in a blob (centre y, x and radius in `v`), its glint's glow past the rim left out: a circle
    fitted to the lower right half of its outline, where the glow is not."""
    m = ndimage.binary_fill_holes(v[ys, xs] > 0.05)
    edge = m & ~ndimage.binary_erosion(m)
    py, px = np.nonzero(edge)
    keep = (px - m.shape[1] / 2) + (py - m.shape[0] / 2) > 0
    py, px = py[keep].astype(np.float64), px[keep].astype(np.float64)
    # a least-squares circle: x² + y² = 2ax + 2by + c
    sol = np.linalg.lstsq(np.stack([2 * px, 2 * py, np.ones_like(px)], axis=1), px ** 2 + py ** 2, rcond=None)[0]
    a, b = sol[0], sol[1]
    return ys.start + b, xs.start + a, float(np.sqrt(sol[2] + a * a + b * b))


# A four-pointed star's cell (CRYSTAL's notes): as deep as this, as wide as its shape makes it, in the middle of a
# 512 cell's 500 (styleArt.ts: NOTE_CELL.crystal).
STAR_CELL = 500


def gem_star(rgba: np.ndarray, w: int, h: int, arm: float, reach: float, power: float) -> np.ndarray:
    """CRYSTAL's long cut gem (`rgba`, fitted across a row about its middle) drawn as a four-pointed star w × h, in
    proportions as on the screen: each column of the gem stretched deeper the nearer the middle, `arm` times the gem's
    own depth (drawn w wide) out along its arms and rising to all of h in its middle column, the stretch falling off as
    (1 − u / reach) ** power of the half width u, so its short vertical points grow into long ones and its horizontal
    points stay at the edges. Filtered with the colours weighted by their alpha (no dark fringes)."""
    sh, sw = rgba.shape[:2]
    a = rgba[..., 3]
    rows = np.where(a.max(axis=1) > 0.05)[0]
    own = (rows[-1] - rows[0] + 1) * w / sw
    cy = (rows[0] + rows[-1] + 1) / 2
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = np.abs((xx + 0.5) / w - 0.5) * 2
    stretch = arm + (h / own - arm) * np.clip(1 - u / reach, 0, 1) ** power
    sx = (xx + 0.5) * sw / w - 0.5
    sy = cy + (yy + 0.5 - h / 2) / (stretch * w / sw) - 0.5
    pre = [rgba[..., 0] * a, rgba[..., 1] * a, a]
    out = [ndimage.map_coordinates(c, [sy, sx], order=3, mode="constant", cval=0.0) for c in pre]
    oa = np.clip(out[2], 0, 1)
    colour = [np.where(oa > 1e-3, np.clip(c / np.maximum(oa, 1e-3), 0, 1), 0) for c in out[:2]]
    return np.stack([colour[0], colour[1], np.zeros_like(oa), oa], axis=2).astype(np.float32)


def set_notes(cid: str, textures: dict) -> None:
    c = SET_ART[cid]["notes"]
    a = load(SRC / cid / "notes.jpg")
    v = value(a)
    boxes = blobs(v, 0.05, 4)
    if c["rows"]:
        boxes = sorted(boxes, key=lambda b: b[0].start)
    h = max(b[0].stop - b[0].start for b in boxes)
    w = max(b[1].stop - b[1].start for b in boxes)
    atlas = np.zeros((1024, 1024, 4), np.float32)
    for i, (ys, xs) in enumerate(boxes):
        cy, cx = (ys.start + ys.stop) // 2, (xs.start + xs.stop) // 2
        if c.get("disc"):
            # the coin alone, cut round about its own middle
            dy, dx, r = disc_of(v, ys, xs)
            cy, cx, h = round(dy), round(dx), 2 * int(r - 1)
            w = h
        cut = (slice(cy - h // 2 + h, cy - h // 2 + 2 * h), slice(cx - w // 2 + w, cx - w // 2 + 2 * w))
        crop = np.pad(v, ((h, h), (w, w)))[cut]
        alpha = shape_alpha(crop)
        if c.get("disc"):
            alpha = alpha * circle_mask(h, w)
        rgba = tint(unpremultiply(crop, alpha), alpha, gain=c["gain"], lift=c["lift"], white=c["white"])
        if c.get("star"):
            st = c["star"]
            r, col = divmod(i, 2)
            sw = round(STAR_CELL / st["shape"])
            star = gem_star(fit_into(rgba, 1024, 256), sw, STAR_CELL, st["arm"], st["reach"], st["power"])
            paste(atlas, star, col * 512 + 6 + (500 - sw) // 2, r * 512 + 6)
        elif c["rows"]:
            paste(atlas, fit_into(rgba, 1024, 256), 0, i * 256)
        else:
            r, col = divmod(i, 2)
            paste(atlas, fit_into(rgba, 500, 500), col * 512 + 6, r * 512 + 6)
    save_rgba(atlas, OUT / cid / "notes.png")
    textures[f"{NAME.get(cid, cid)}/notes"] = {"file": f"styles/{cid}/notes.png", "bundle": "notes", "size": [1024, 1024]}


def set_long(cid: str, textures: dict) -> dict:
    c = SET_ART[cid]["long"]
    a = load(SRC / cid / "long.jpg")
    v = value(a)
    idle, held = sorted(blobs(v, 0.06, 2), key=lambda b: b[1].start)
    iy, ix = idle
    rail_w = ix.stop - ix.start
    mid = (held[1].start + held[1].stop) // 2
    hx = slice(mid - rail_w // 2, mid - rail_w // 2 + rail_w)
    end = round(c["cap"] * LONG_W / rail_w)
    atlas = np.zeros((256, 512, 4), np.float32)
    for i, (xs, params) in enumerate([(ix, c["idle"]), (hx, c["held"])]):
        rail = v[:, xs]
        alpha = shape_alpha(rail)
        own = unpremultiply(rail, alpha)
        if c["see"] is not None:
            # between its tubes the body is dark glass: half see-through
            alpha = np.where((alpha > 0.99) & (own < 0.2), c["see"], alpha)
        gain, lift, white = params
        rgba = tint(own, alpha, gain=gain, lift=lift, white=white)
        length = round(rail_w * LONG_TILE / LONG_W)
        y0 = (iy.start + iy.stop) // 2 - length // 2
        body = seamless_rows(rgba[y0:y0 + length + length // 4], length, length // 4)
        paste(atlas, resize_premultiplied(body, LONG_W, LONG_TILE), i * LONG_W, 0)
        paste(atlas, resize_premultiplied(rgba[iy.start:iy.start + c["cap"]], LONG_W, end), 256 + i * LONG_W, 0)
    save_rgba(atlas, OUT / cid / "long.png")
    textures[f"{NAME.get(cid, cid)}/long"] = {"file": f"styles/{cid}/long.png", "bundle": "notes", "size": [512, 256]}
    return {"end": end}


def set_side(cid: str, textures: dict) -> dict:
    c = SET_ART[cid]["side"]
    v = value(load(SRC / cid / "side.jpg"))
    plate, bar = sorted(blobs(v, 0.06, 2), key=lambda b: b[0].start)
    atlas = np.zeros((512, 1024, 4), np.float32)
    layout = {}
    gain, lift, white = c["tint"]
    for key, (ys, xs), width, y, cut in [("bar", bar, 1024, 0, c["cut"]), ("plate", plate, 512, 256, c["plate_cut"])]:
        crop = v[ys, xs]
        alpha = shape_alpha(crop, threshold=0.04, rim=0.3)
        own = unpremultiply(crop, alpha)
        h, w = crop.shape
        if key == "bar":
            # its ends and bright edges are solid; the rest of it lets the lanes show through
            ends = np.zeros_like(crop, bool)
            e = int(w * cut)
            ends[:, :e] = True
            ends[:, w - e:] = True
            see = (~ends) & (own < c["bright"]) & (alpha > 0.99)
            alpha = np.where(see, 0.62, alpha)
        rgba = tint(own, alpha, gain=gain, lift=lift, white=white)
        th = min(round(width * h / w), 256)
        paste(atlas, resize_premultiplied(rgba, width, th), 0, y)
        layout[key] = {"h": th, "cut": round(cut * width)}
    save_rgba(atlas, OUT / cid / "side.png")
    textures[f"{NAME.get(cid, cid)}/side"] = {"file": f"styles/{cid}/side.png", "bundle": "notes", "size": [1024, 512]}
    return layout


def circle_mask(h: int, w: int) -> np.ndarray:
    """A circle as wide as the smaller side of h × w, about its middle, antialiased (4 × 4 samples a px)."""
    s = 4
    im = Image.new("L", (w * s, h * s), 0)
    r = min(w, h) * s / 2
    cx, cy = w * s / 2, h * s / 2
    ImageDraw.Draw(im).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def fx_cells(cid: str) -> dict[str, np.ndarray]:
    """A set's effect sheet in four cells (light on black), the faint lines between them and the JPEG's noise cleared."""
    return sheet_cells(SRC / cid / "fx.jpg")


def sheet_cells(path: Path) -> dict[str, np.ndarray]:
    """An effect sheet in its four cells: flash | ring over sprites | hold (light on black, as fx_cells)."""
    v = np.asarray(Image.open(path).convert("L"), dtype=np.float32) / 255
    n = v.shape[0] // 2
    out = {}
    for key, c in {"flash": v[:n, :n], "ring": v[:n, n:], "sprites": v[n:, :n], "hold": v[n:, n:]}.items():
        c = c.copy()
        c[:8], c[-8:], c[:, :8], c[:, -8:] = 0, 0, 0, 0
        out[key] = np.clip((c - 0.03) / 0.97, 0, 1)
    return out


def sprites_of(cell: np.ndarray, min_size: int = 20) -> list[np.ndarray]:
    """The separate sprites of a cell, each on a square of black about its middle, largest first."""
    labels, _ = ndimage.label(ndimage.binary_dilation(cell > 0.1, iterations=4))
    found = []
    for ys, xs in ndimage.find_objects(labels):
        h, w = ys.stop - ys.start, xs.stop - xs.start
        if max(h, w) < min_size:
            continue
        side = max(h, w) + 8
        sq = np.zeros((side, side), np.float32)
        sq[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = cell[ys, xs]
        found.append(sq)
    return sorted(found, key=lambda a: -a.shape[0])


def burst_sheet(draw) -> np.ndarray:
    """A 4 × 4 sheet of HIT_CELL frames, each drawn HIT_ROOM px square by `draw(frame index, frame)` (light added on
    black, the judge line through its middle), its edges faded so nothing ends in a straight cut, then sampled down."""
    edges = cell_edges(HIT_ROOM)
    sheet = np.zeros((HIT_CELL * 4, HIT_CELL * 4), np.float32)
    for f in range(16):
        frame = np.zeros((HIT_ROOM, HIT_ROOM), np.float32)
        draw(f, frame)
        frame = np.clip(frame, 0, 1) * edges
        small = np.asarray(Image.fromarray(frame, "F").resize((HIT_CELL, HIT_CELL), Image.LANCZOS), dtype=np.float32)
        r, c = divmod(f, 4)
        sheet[r * HIT_CELL:(r + 1) * HIT_CELL, c * HIT_CELL:(c + 1) * HIT_CELL] = np.clip(small, 0, 1)
    return sheet


def afterglow(frame: np.ndarray, line: float, gain: float, wx: float = 34, wy: float = 15) -> None:
    yy, xx = np.mgrid[0:frame.shape[0], 0:frame.shape[1]].astype(np.float32)
    frame += gain * np.exp(-(((xx - frame.shape[1] / 2) / wx) ** 2 + ((yy - line) / wy) ** 2))


def set_hits(cid: str, textures: dict) -> None:
    """The set's hit (16 frames, once) and hold (16 frames, a loop), spreading every way from the judge line."""
    cells = fx_cells(cid)
    n = cells["flash"].shape[0]
    cell, cx = HIT_SIZE, HIT_ROOM / 2
    line = hold_line = cx
    centres = {
        "club": {"flash": (513, 511), "ring": (522, 511), "hold": (499, 510)},
        "crystal": {"flash": (514, 515), "ring": (502, 521), "hold": (463, 504)},
        "neon": {"flash": (425, 522), "ring": (442, 513), "hold": (381, 518)},
        "piano": {"flash": (511, 511), "ring": (510, 511), "hold": (508, 512)},
    }[cid]
    flash = crop_around(cells["flash"], *centres["flash"], n // 2 - 8)
    ring = crop_around(cells["ring"], *centres["ring"], n // 2 - 8)
    hold = crop_around(cells["hold"], *centres["hold"], n // 2 - 8)
    sprites = sprites_of(cells["sprites"])
    if cid == "piano":
        # its pieces are musical notes (the glints are smaller): they fly out upright
        sprites = [sp for sp in sprites if sp.shape[0] >= 100]
    rng = np.random.default_rng({"club": 3, "crystal": 5, "neon": 9, "piano": 11}[cid])
    if cid == "crystal":
        # its shards were drawn flying up: turned over, the most of them fly toward the player
        ring = ring[::-1]
    flicker = [1.0, 0.72, 1.0, 0.86, 0.95, 0.62, 1.0, 0.8, 0.9, 0.7, 1.0, 0.75, 0.9, 0.8, 1.0, 0.85] if cid == "neon" else [1.0] * 16
    spin = 18 if cid == "piano" else 90
    # one piece every eighth of the way round, each a little off its place
    throws = [(math.radians(i * 45 + rng.uniform(-18, 18)), rng.uniform(0.55, 1.0), rng.integers(0, max(1, len(sprites))), rng.uniform(-spin, spin)) for i in range(8)]

    def draw_burst(f: int, frame: np.ndarray) -> None:
        g = flicker[f]
        if f < 6:
            place(frame, flash, cx, line, cell * [0.5, 0.72, 0.82, 0.88, 0.92, 0.94][f], f * 2.0, [1.0, 1.0, 0.72, 0.45, 0.24, 0.1][f] * g)
        if f >= 1:
            t = min(1, (f - 1) / 12)
            grow = 0.3 + 0.85 * (1 - (1 - t) ** 2)
            fade = max(0.0, 1 - max(0, f - 5) / 10) ** 1.3
            place(frame, ring, cx, line, cell * grow, 0, fade * g)
        # pieces thrown out all round the hit, slowing, gone by the twelfth frame
        if f < 12 and sprites:
            t = f / 12
            for a, speed, k, spin in throws:
                reach = cell * 0.46 * speed * (1 - (1 - t) ** 2)
                x, y = cx + reach * math.cos(a), line + reach * math.sin(a)
                sp = sprites[int(k) % len(sprites)]
                # a musical note large enough to read as one
                size = cell * (0.17 + 0.05 * sp.shape[0] / 190) if cid == "piano" else cell * min(0.16, 0.04 + sp.shape[0] / n * 0.5)
                place(frame, sp, x, y, size, spin * t, (1 - t) ** 1.2 * g)
        if f >= 1:
            afterglow(frame, line, 0.5 * (1 - f / 16) ** 1.2 * g)

    save_grey(burst_sheet(draw_burst), OUT / cid / "hit_burst.png")
    textures[f"{NAME.get(cid, cid)}/hitBurst"] = hit_entry(f"styles/{cid}/hit_burst.png", "burst")

    # where each sparkle twinkles round the glow (across, along; a share of the effect's size from its middle)
    twinkles = [(rng.uniform(-0.35, 0.35), rng.uniform(-0.3, 0.3), rng.uniform(0, 1), rng.integers(0, max(1, len(sprites)))) for _ in range(9)]

    def draw_hold(f: int, frame: np.ndarray) -> None:
        phase = 2 * math.pi * f / 16
        if cid == "club":
            # the glowing ring breathes a little
            place(frame, hold, cx, hold_line, cell * (0.72 + 0.03 * math.sin(phase * 2)), 0, 0.92 + 0.08 * math.sin(phase * 2))
        elif cid == "piano":
            # the glow and the notes round it breathe a little
            place(frame, hold, cx, hold_line, cell * (0.86 + 0.03 * math.sin(phase * 2)), 0, 0.9 + 0.1 * math.sin(phase * 2))
        elif cid == "crystal":
            place(frame, hold, cx, hold_line, cell * 0.9, 0, 0.9)
        else:
            # the arcs crackle: turned over every other frame, a little shifted, flickering
            arc = hold[:, ::-1] if f % 2 else hold
            place(frame, arc, cx + rng.uniform(-6, 6), hold_line, cell * 0.98, 0, flicker[(f * 5) % 16])
        # sparkles twinkling over it, each at its own beat (a seamless loop)
        if sprites and cid != "neon":
            for x, y, ph, k in twinkles:
                b = max(0.0, math.sin(phase + 2 * math.pi * ph))
                if b > 0.05:
                    sp = sprites[int(k) % len(sprites)]
                    size = cell * (0.15 if cid == "piano" else 0.08) * (0.6 + 0.4 * b)
                    place(frame, sp, cx + cell * x, hold_line + cell * y, size, 0, b)

    save_grey(burst_sheet(draw_hold), OUT / cid / "hit_hold.png")
    textures[f"{NAME.get(cid, cid)}/hitHold"] = hit_entry(f"styles/{cid}/hit_hold.png", "hold")


# ---------- the hits of no set: FLASH, FLARE, BUBBLES, GRID ----------
# assets-src/styles/hits/<name>.jpg: an effect sheet as the sets' (flash | ring over sprites | hold) ->
# client/public/media/styles/hits/<name>_burst.png and <name>_hold.png, "<name>/hitBurst" and "<name>/hitHold".
HITS_OUT = OUT / "hits"
ANY_HITS = ("flash", "flare", "bubbles", "grid")


def place_xy(frame: np.ndarray, sprite: np.ndarray, cx: float, cy: float, w: float, h: float, gain: float = 1) -> None:
    """As place, `sprite` stretched to `w` × `h` px."""
    if w < 2 or h < 2 or gain <= 0:
        return
    im = Image.fromarray(sprite.astype(np.float32)).resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)
    s = np.clip(np.asarray(im, dtype=np.float32), 0, 1) * gain
    x0, y0 = round(cx - s.shape[1] / 2), round(cy - s.shape[0] / 2)
    fx0, fy0 = max(0, x0), max(0, y0)
    fx1, fy1 = min(frame.shape[1], x0 + s.shape[1]), min(frame.shape[0], y0 + s.shape[0])
    if fx1 > fx0 and fy1 > fy0:
        frame[fy0:fy1, fx0:fx1] += s[fy0 - y0:fy1 - y0, fx0 - x0:fx1 - x0]


def cell_edges(cell: int, margin: float = 12) -> np.ndarray:
    """1 inside a frame, going to 0 over its last `margin` px: nothing ends in a straight cut at a frame's edge."""
    d = np.minimum(np.arange(cell, dtype=np.float32), np.arange(cell, dtype=np.float32)[::-1]) + 0.5
    ramp = np.clip(d / margin, 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)
    return ramp[:, None] * ramp[None, :]


def bbox_centre(c: np.ndarray) -> tuple[int, int]:
    ys, xs = np.nonzero(c > 0.1)
    return (int(ys.min() + ys.max()) // 2, int(xs.min() + xs.max()) // 2)


def save_hit(name: str, kind: str, sheet: np.ndarray, textures: dict) -> None:
    save_grey(sheet, HITS_OUT / f"{name}_{kind}.png")
    textures[f"{name}/hit{'Burst' if kind == 'burst' else 'Hold'}"] = hit_entry(f"styles/hits/{name}_{kind}.png", kind)


def any_hits(textures: dict) -> None:
    """FLASH, FLARE, BUBBLES and GRID: a hit (16 frames, once) and a hold (16 frames, a loop) each, as the sets'."""
    cell, cx = HIT_SIZE, HIT_ROOM / 2
    line = cx
    for name in ANY_HITS:
        cells = sheet_cells(SRC / "hits" / f"{name}.jpg")
        n = cells["flash"].shape[0]
        r = n // 2 - 8
        flash = crop_around(cells["flash"], *bbox_centre(cells["flash"]), r)
        ring = crop_around(cells["ring"], *bbox_centre(cells["ring"]), r)
        hold = crop_around(cells["hold"], *bbox_centre(cells["hold"]), r)
        sprites = sprites_of(cells["sprites"])
        rng = np.random.default_rng({"flash": 21, "flare": 23, "bubbles": 25, "grid": 27}[name])
        burst, loop = HIT_DRAW[name](flash, ring, hold, sprites, rng, cell, line, cx)
        save_hit(name, "burst", burst_sheet(burst), textures)
        save_hit(name, "hold", burst_sheet(loop), textures)


def flash_draw(flash, ring, hold, sprites, rng, cell, line, cx):
    """A starburst on the hit, a shockwave ring spreading round it, glints thrown out all round; held, a glow
    breathing with glints twinkling round it."""
    glints = [sp for sp in sprites if sp.shape[0] >= 40]
    throws = [(math.radians(i * 45 + rng.uniform(-20, 20)), rng.uniform(0.5, 1.0), rng.integers(0, len(glints)), rng.uniform(-30, 30)) for i in range(8)]
    twinkles = [(rng.uniform(-0.32, 0.32), rng.uniform(-0.26, 0.26), rng.uniform(0, 1), rng.integers(0, len(glints))) for _ in range(7)]

    def burst(f, frame):
        if f < 7:
            place(frame, flash, cx, line, cell * [0.56, 0.76, 0.86, 0.92, 0.95, 0.97, 0.98][f], f * 2.0, [0.95, 0.92, 0.82, 0.64, 0.44, 0.25, 0.1][f])
        if 1 <= f <= 13:
            t = (f - 1) / 12
            place(frame, ring, cx, line, cell * (0.22 + 0.86 * (1 - (1 - t) ** 2)), 0, (1 - t) ** 1.3)
        if f < 11:
            t = f / 11
            for a, speed, k, spin in throws:
                reach = cell * 0.44 * speed * (1 - (1 - t) ** 2)
                sp = glints[int(k) % len(glints)]
                place(frame, sp, cx + reach * math.cos(a), line + reach * math.sin(a), cell * (0.05 + 0.08 * sp.shape[0] / 204), spin * t, (1 - t) ** 1.2)
        afterglow(frame, line, 0.42 * (1 - f / 16) ** 1.3)

    def loop(f, frame):
        phase = 2 * math.pi * f / 16
        place(frame, hold, cx, line, cell * (0.74 + 0.03 * math.sin(phase * 2)), 0, 0.86 + 0.1 * math.sin(phase * 2))
        for x, y, ph, k in twinkles:
            b = max(0.0, math.sin(phase + 2 * math.pi * ph))
            if b > 0.05:
                place(frame, glints[int(k) % len(glints)], cx + cell * x, line + cell * y, cell * 0.08 * (0.6 + 0.4 * b), 0, b)

    return burst, loop


def flare_draw(flash, ring, hold, sprites, rng, cell, line, cx):
    """A four-point star flaring on the hit with a lens streak stretching across the lanes and star glints thrown out
    along it; held, a star shimmering on a faint streak."""
    # the star glints (the sheet's lens ghosts, rings and discs, read as stray circles on the gear: left out)
    stars = [sp for sp in sprites if sp.max() > 0.9]
    throws = [((1 if i % 2 else -1), math.radians(rng.uniform(-24, 24)), rng.uniform(0.55, 1.0), rng.integers(0, len(stars))) for i in range(6)]

    def burst(f, frame):
        if f < 9:
            place(frame, flash, cx, line, cell * [0.86, 1.0, 1.04, 1.06, 1.07, 1.08, 1.08, 1.08, 1.08][f], 0, [1.0, 1.0, 0.86, 0.68, 0.5, 0.34, 0.2, 0.1, 0.04][f])
        if f < 11:
            t = f / 10
            place_xy(frame, ring, cx, line, cell * (0.62 + 0.38 * (1 - (1 - t) ** 2)), cell * 0.5, [1.0, 0.95, 0.85, 0.72, 0.58, 0.45, 0.33, 0.22, 0.13, 0.06, 0.02][f])
        if f < 12:
            t = f / 12
            for side, a, speed, k in throws:
                reach = cell * 0.42 * speed * (1 - (1 - t) ** 2)
                place(frame, stars[int(k) % len(stars)], cx + side * reach * math.cos(a), line + reach * math.sin(a), cell * 0.1 * (1 - 0.3 * t), 0, (1 - t) ** 1.1)
        afterglow(frame, line, 0.38 * (1 - f / 16) ** 1.3, wx=44, wy=12)

    def loop(f, frame):
        phase = 2 * math.pi * f / 16
        place_xy(frame, ring, cx, line, cell * (0.84 + 0.05 * math.sin(phase * 2)), cell * 0.42, 0.5 + 0.12 * math.sin(phase * 2 + 1))
        place(frame, hold, cx, line, cell * (0.86 + 0.04 * math.sin(phase * 2)), 2.5 * math.sin(phase), 0.9 + 0.1 * math.sin(phase * 2 + 0.5))

    return burst, loop


def bubbles_draw(flash, ring, hold, sprites, rng, cell, line, cx):
    """A bubble popping on the hit in a ring of spray, bubbles thrown out all round, swelling and popping one by one;
    held, a glow with bubbles rising through it."""
    big = [sp for sp in sprites if sp.shape[0] >= 90]
    drops = [sp for sp in sprites if sp.shape[0] < 60] or big
    throws = [(math.radians(i * 45 + rng.uniform(-18, 18)), rng.uniform(0.45, 1.0), rng.integers(0, len(big)), rng.uniform(0.09, 0.17), int(rng.integers(9, 16)), rng.uniform(0, 6.3)) for i in range(8)]
    spray = [(math.radians(i * 360 / 7 + rng.uniform(-20, 20)), rng.uniform(0.6, 1.0), rng.integers(0, len(drops))) for i in range(7)]
    rising = [(rng.uniform(-0.3, 0.3), rng.uniform(0, 1), rng.integers(0, len(big)), rng.uniform(0.05, 0.09)) for _ in range(6)]

    def burst(f, frame):
        if f < 8:
            place(frame, flash, cx, line, cell * [0.42, 0.62, 0.76, 0.86, 0.93, 0.98, 1.02, 1.05][f], 0, [1.0, 1.0, 0.82, 0.62, 0.44, 0.28, 0.15, 0.06][f])
        for a, speed, k, size, pop, wob in throws:
            if f > pop or (f == pop and pop == 15):
                continue
            t = f / 15
            reach = cell * 0.4 * speed * (1 - (1 - t) ** 2)
            x = cx + reach * math.cos(a) + 2.5 * math.sin(f * 0.9 + wob)
            y = line + reach * math.sin(a)
            grow = 0.45 + 0.55 * min(1.0, f / 5)
            if f < pop:
                place(frame, big[int(k) % len(big)], x, y, cell * size * grow, 0, 0.95)
            else:
                # it pops: a puff of spray where it was
                place(frame, flash, x, y, cell * size * 1.7, 0, 0.7)
        if f < 9:
            t = f / 9
            for a, speed, k in spray:
                reach = cell * 0.46 * speed * (1 - (1 - t) ** 2)
                place(frame, drops[int(k) % len(drops)], cx + reach * math.cos(a), line + reach * math.sin(a), cell * 0.035, 0, (1 - t) ** 1.3)
        afterglow(frame, line, 0.34 * (1 - f / 16) ** 1.3)

    def loop(f, frame):
        phase = 2 * math.pi * f / 16
        place(frame, hold, cx, line, cell * (0.84 + 0.03 * math.sin(phase * 2)), 0, 0.8 + 0.1 * math.sin(phase * 2))
        # each bubble rises through the glow, from below the line to above it, and fades, at its own place in the loop
        for dx, ph, k, size in rising:
            u = (f / 16 + ph) % 1
            place(frame, big[int(k) % len(big)], cx + cell * dx + 3 * math.sin(2 * math.pi * u * 2), line + cell * (0.34 - 0.68 * u), cell * size, 0, 0.9 * math.sin(math.pi * u))

    return burst, loop


def grid_draw(flash, ring, hold, sprites, rng, cell, line, cx):
    """LED pixels about the line, as a dot-matrix panel: lit at the hit, a square wave of them running out all round
    with stray pixels blinking behind it; held, the pixels about the key rising and falling like a level meter, mirrored
    about the line."""
    leds = [sp for sp in sprites if sp.shape[0] >= 70]
    # the brightest of the largest: one LED drawn everywhere, so the panel is even
    led = max(leds, key=lambda sp: float(sp.max()) * 10 + float(sp.mean()))
    pitch = cell * 0.078
    size = pitch * 1.18
    cols, rows = range(-5, 6), range(-6, 7)

    def at(c: int, r: int) -> tuple[float, float]:
        return cx + c * pitch, line + r * pitch

    blink = rng.uniform(0, 1, (16, len(rows), len(cols)))

    def burst(f, frame):
        front = 0.4 + f * 0.62
        fade = (1 - f / 16) ** 0.5
        for ri, r in enumerate(rows):
            for ci, c in enumerate(cols):
                d = max(abs(c), abs(r) * 1.1)
                b = math.exp(-(((d - front) / 0.55) ** 2))
                if d < front:
                    b = max(b, 0.7 * math.exp(-(front - d) / 0.8))
                    if blink[f, ri, ci] > 0.9:
                        b = max(b, 0.7)
                if f < 3 and d <= 1.2:
                    b = 1.0
                b *= fade
                if b > 0.04:
                    place(frame, led, *at(c, r), size, 0, min(1.0, b))
        afterglow(frame, line, 0.22 * (1 - f / 16) ** 1.5, wx=40, wy=10)

    levels = [(int(rng.integers(1, 3)), rng.uniform(0, 2 * math.pi)) for _ in range(5)]

    def loop(f, frame):
        phase = 2 * math.pi * f / 16
        for ci, c in enumerate(range(-2, 3)):
            k, ph = levels[ci]
            level = 1 + 3 * (0.5 + 0.5 * math.sin(phase * k + ph))
            for r in range(4):
                lit = r < level
                b = (1.0 if r + 1 >= level else 0.82) if lit else 0.1
                # the meter runs out from the line both ways (its middle row once)
                for rr in {r, -r}:
                    place(frame, led, *at(c, rr), size, 0, b)

    return burst, loop


HIT_DRAW = {"flash": flash_draw, "flare": flare_draw, "bubbles": bubbles_draw, "grid": grid_draw}


def main() -> None:
    textures: dict = {}
    if MECHA_OUT.exists():
        shutil.rmtree(MECHA_OUT)
    mecha_notes(textures)
    mecha_long(textures)
    side = mecha_side(textures)
    mecha_hits(textures)
    report = {"mecha": {"side": side}}
    for cid in SET_ART:
        if (OUT / cid).exists():
            shutil.rmtree(OUT / cid)
        set_notes(cid, textures)
        report[cid] = {"long": set_long(cid, textures), "side": set_side(cid, textures)}
        set_hits(cid, textures)
    for cid in HIT_ONLY:
        if (OUT / cid).exists():
            shutil.rmtree(OUT / cid)
        set_hits(cid, textures)
    if HITS_OUT.exists():
        shutil.rmtree(HITS_OUT)
    any_hits(textures)
    print(json.dumps(report, indent=1))
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    kept = {k: t for k, t in manifest["textures"].items() if not t["file"].startswith("styles/")}
    manifest["textures"] = dict(sorted({**kept, **textures}.items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
