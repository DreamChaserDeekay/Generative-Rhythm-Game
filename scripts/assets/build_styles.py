"""Builds the concept sets' game pictures from assets-src/styles/<set>/ into client/public/media/styles/<set>/
and lists them in client/public/media/manifest.json as "<set>/<name>" (the crystal set as "gem/<name>": see NAME;
the manifest's other entries are kept).

    python scripts/assets/build_styles.py

The sources are the picked generations, stored as JPEG (quality 95, no chroma subsampling) to keep the
repository small; where each came from: assets-src/PROVENANCE.md. Notes, long notes, side notes and the gear's
key caps become tint pictures (client/src/render/tintArt.ts): red is how much of the lane colour shows, green
how far it is then lifted toward white, alpha the shape; the art is drawn for a neutral white lane, so its value
says how much colour shows. Hit effects become flipbooks of light on black. The gear's plates keep their own
colours, one picture per colourway. The layouts written here are read by client/src/render/styleArt.ts: change
the two together.
Needs Pillow, numpy and scipy.
"""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
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


def hex_of(rgb: np.ndarray) -> str:
    return "#" + "".join(f"{int(round(c * 255)):02x}" for c in rgb)


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

# keys.png: a key cap per cell (KEY_CELL square), at rest in the first row and lit in the second: ○ △ ◇ and
# a blank cap (a side lane)
KEY_CELL = 256

# gear_<colourway>.png: the turntable's module at (0, 0) within TT × TT, the strip under the keys at (0, STRIP_Y),
# STRIP_W wide and as deep as it is for that width in the default gear's sheet
TT, STRIP_Y, STRIP_W = 512, 512, 1024
COLOURWAYS = ("gunmetal", "white", "red", "blue")


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


def gear_parts(a: np.ndarray) -> dict:
    """Where the gear sheet's parts lie (px of the sheet): the panel, its key caps, the turntable and the strip under the keys."""
    v = value(a)
    rows = np.where((v > 0.06).mean(1) > 0.5)[0]
    cols = np.where((v > 0.06).mean(0) > 0.3)[0]
    panel = (rows.min(), rows.max() + 1, cols.min(), cols.max() + 1)
    return {"panel": panel}


def erase_mark(cap: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """The cap with what lies in `box` (y0, y1, x0, x1) painted over from the face around it (each row blended across)."""
    out = cap.copy()
    y0, y1, x0, x1 = box
    for y in range(y0, y1):
        left, right = out[y, x0 - 3:x0].mean(0), out[y, x1:x1 + 3].mean(0)
        t = np.linspace(0, 1, x1 - x0, dtype=np.float32)[:, None] if out.ndim == 3 else np.linspace(0, 1, x1 - x0, dtype=np.float32)
        out[y, x0:x1] = left * (1 - t) + right * t
    return out


def draw_mark(size: int, mark: str, lit: bool) -> np.ndarray:
    """A key cap's mark as coverage (size × size, 4× supersampled): a ring, a triangle or a diamond."""
    s = size * 4
    im = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(im)
    c = s / 2
    if mark == "white":
        r, t = s * 0.36, s * 0.085
        d.ellipse((c - r, c - r, c + r, c + r), fill=255)
        d.ellipse((c - r + t, c - r + t, c + r - t, c + r - t), fill=0)
    elif mark == "blue":
        r = s * 0.42
        d.polygon([(c, c - r * 0.95), (c + r, c + r * 0.72), (c - r, c + r * 0.72)], fill=255)
    elif mark == "gold":
        r = s * 0.44
        d.polygon([(c, c - r), (c + r, c), (c, c + r), (c - r, c)], fill=255)
    return np.asarray(im.resize((size, size), Image.LANCZOS), dtype=np.float32) / 255


def mecha_keys(textures: dict) -> dict:
    """Key caps at rest and lit, as tint pictures, from the default gear's sheet (2nd and 4th caps lit)."""
    a = load(MECHA / "gear_gunmetal.jpg")
    v = value(a)
    y0, y1, x0, x1 = gear_parts(a)["panel"]
    height = y1 - y0
    # the caps' middles along the row and their size with the socket's rim (shares of the panel's width)
    side = int((x1 - x0) * MECHA_KEY_SIZE)
    my = y0 + int(height * MECHA_KEY_ROW)

    def cut(i: int) -> np.ndarray:
        cx = x0 + int((x1 - x0) * MECHA_KEYS[i])
        return v[my - side // 2:my - side // 2 + side, cx - side // 2:cx - side // 2 + side]

    unlit_round, lit_tri, unlit_square, lit_diamond = (cut(i) for i in (0, 1, 2, 3))
    # the mark lies within the cap's middle third: erase it to get the blank caps, then draw each mark
    m = side // 3
    box = (side // 2 - m // 2 - 6, side // 2 + m // 2 + 6, side // 2 - m // 2 - 6, side // 2 + m // 2 + 6)
    blank_idle = erase_mark(unlit_square, box)
    blank_lit = erase_mark(lit_tri, box)
    # the marks' ink: the engraving at rest (a little darker than the face), the dark print on a lit cap
    idle_face = np.median(blank_idle[box[0]:box[1], box[2]:box[3]])
    lit_ink = float(np.percentile(lit_tri[box[0]:box[1], box[2]:box[3]], 3))
    atlas = np.zeros((512, 1024, 4), np.float32)
    marks = ["white", "blue", "gold", "side"]
    for col, mark in enumerate(marks):
        for row, (blank, lit) in enumerate([(blank_idle, False), (blank_lit, True)]):
            cap = blank.copy()
            if mark != "side":
                cov = draw_mark(m, mark, lit)
                y, x = box[0] + 6, box[2] + 6
                patch = cap[y:y + m, x:x + m]
                ink = lit_ink * 0.55 if lit else idle_face * 0.55
                cap[y:y + m, x:x + m] = patch * (1 - cov) + ink * cov
            # at rest dim (the lane colour mixed into black), lit the colour with a white-hot face; the
            # square's corners rounded off in alpha, so no plate shows as a square round the socket
            alpha = socket_alpha(side)
            rgba = tint(cap, alpha, gain=1 / 0.7, lift=0.8, white=0.7) if not lit else tint(cap, alpha, gain=1 / 0.6, lift=0.66, white=0.92, power=1.1)
            paste(atlas, resize_premultiplied(rgba, KEY_CELL, KEY_CELL), col * KEY_CELL, row * KEY_CELL)
    save_rgba(atlas, MECHA_OUT / "keys.png")
    textures["mecha/keys"] = {"file": "styles/mecha/keys.png", "bundle": "gear", "size": [1024, 512]}
    return {"side": side}


def socket_alpha(size: int) -> np.ndarray:
    """A rounded square's coverage (size × size): a key cap with its socket's rim."""
    s = size * 4
    im = Image.new("L", (s, s), 0)
    ImageDraw.Draw(im).rounded_rectangle((s * 0.02, s * 0.02, s * 0.98, s * 0.98), radius=s * 0.14, fill=255)
    return np.asarray(im.resize((size, size), Image.LANCZOS), dtype=np.float32) / 255


def mecha_gear(textures: dict) -> dict:
    """Per colourway: the turntable's module and the strip of plates and grille under the keys, in their own colours."""
    colours = {}
    ref = load(MECHA / "gear_gunmetal.jpg")
    y0, y1, x0, x1 = gear_parts(ref)["panel"]
    t, b, l, r = MECHA_STRIP_BOX
    strip_h = round(STRIP_W * (y1 - y0) * (b - t) / ((x1 - x0) * (r - l)))
    for cw in COLOURWAYS:
        a = load(MECHA / f"gear_{cw}.jpg")
        py0, py1, px0, px1 = gear_parts(a)["panel"]
        # the same layout in every colourway (redrawn from the default): parts as shares of the panel
        def box(t: float, b: float, l: float, r: float) -> np.ndarray:
            return a[py0 + int((py1 - py0) * t):py0 + int((py1 - py0) * b), px0 + int((px1 - px0) * l):px0 + int((px1 - px0) * r)]

        tt = box(*MECHA_TT_BOX)
        strip = box(*MECHA_STRIP_BOX)
        atlas = np.zeros((1024, 1024, 4), np.float32)
        th, tw = tt.shape[:2]
        side = max(th, tw)
        tt_rgba = np.concatenate([tt, chamfer_alpha(th, tw, MECHA_TT_CUT)[..., None]], axis=2)
        paste(atlas, resize_premultiplied(tt_rgba, round(TT * tw / side), round(TT * th / side)), 0, 0)
        strip_rgba = np.concatenate([strip, np.ones(strip.shape[:2] + (1,), np.float32)], axis=2)
        paste(atlas, resize_premultiplied(strip_rgba, STRIP_W, strip_h), 0, STRIP_Y)
        save_rgba(atlas, MECHA_OUT / f"gear_{cw}.png")
        textures[f"mecha/gear_{cw}"] = {"file": f"styles/mecha/gear_{cw}.png", "bundle": "gear", "size": [1024, 1024]}
        # the plate's own colours: its face between the keys, the face's darker trim, the bright edge
        face = box(0.06, 0.1, 0.4, 0.95).reshape(-1, 3)
        low = box(0.905, 0.925, 0.4, 0.95).reshape(-1, 3)
        edge = box(0.0, 0.015, 0.3, 0.9).reshape(-1, 3)
        colours[cw] = {
            "face": hex_of(np.median(face, 0)),
            "trim": hex_of(np.median(low, 0)),
            "edge": hex_of(np.percentile(edge, 90, axis=0)),
            "tt": [round(tw / side * TT), round(th / side * TT)],
        }
    return {"strip_h": strip_h, "colours": colours}


# the turntable's module (top, bottom, left, right as shares of the panel) and its corners' cut (share of its side)
MECHA_TT_BOX = (0.028, 0.9, 0.028, 0.264)
MECHA_TT_CUT = 0.13
# the key row's middle (share of the panel's height), its caps' middles and their size with the socket's rim
# (shares of the panel's width)
MECHA_KEY_ROW = 0.266
MECHA_KEYS = (0.430, 0.508, 0.589, 0.671, 0.755, 0.839, 0.923)
MECHA_KEY_SIZE = 0.068
# the strip under the keys: the two bolted plates and the grille between them
MECHA_STRIP_BOX = (0.452, 0.9, 0.266, 0.969)


def chamfer_alpha(h: int, w: int, cut: float) -> np.ndarray:
    s = 4
    im = Image.new("L", (w * s, h * s), 0)
    c = min(w, h) * cut * s
    W, H = w * s, h * s
    ImageDraw.Draw(im).polygon([(c, 0), (W - c, 0), (W, c), (W, H - c), (W - c, H), (c, H), (0, H - c), (0, c)], fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


# hit_burst.png: 16 frames (4 × 4 of HIT_CELL) of a hit, the judge line HIT_LINE of a frame down from its top;
# hit_hold.png: 16 frames of the sparks while a long note is held, looping, the line HOLD_LINE down
HIT_CELL, HIT_LINE, HOLD_LINE = 256, 0.3, 0.27


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


def above_line(cell: int, line: float, keep: float, gone: float) -> np.ndarray:
    """How much of an effect stays above the judge line (rows of a frame): all of it within `keep` px of the line,
    none past `gone` (the next notes come down there); all of it below the line."""
    y = np.arange(cell, dtype=np.float32)[:, None]
    d = line - y
    t = np.clip((d - keep) / (gone - keep), 0, 1)
    return np.where(d > 0, 1 - t * t * (3 - 2 * t), 1).astype(np.float32)


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
    cell, line = HIT_CELL, HIT_LINE * HIT_CELL
    cx = cell / 2
    keep_flash = above_line(cell, line, 14, 46)
    keep_ring = above_line(cell, line, 6, 34)
    sheet = np.zeros((cell * 4, cell * 4), np.float32)
    yy, xx = np.mgrid[0:cell, 0:cell].astype(np.float32)
    for f in range(16):
        frame = np.zeros((cell, cell), np.float32)
        # the white-hot flash: two frames at its peak, then gone by the sixth
        flash_gain = [1.0, 1.0, 0.72, 0.45, 0.24, 0.1][f] if f < 6 else 0
        place(frame, flash, cx, line, cell * [0.62, 0.86, 0.94, 0.98, 1.0, 1.0][min(f, 5)], f * 2.5, flash_gain)
        frame *= keep_flash
        # the shards fly out in a ring, slowing, and fade from the sixth frame
        if f >= 1:
            t = min(1, (f - 1) / 12)
            grow = 0.34 + 0.78 * (1 - (1 - t) ** 2)
            fade = max(0.0, 1 - max(0, f - 5) / 10) ** 1.3
            shards = np.zeros_like(frame)
            place(shards, ring, cx, line + 6 * t, cell * grow, f * 0.8, fade)
            frame += shards * keep_ring
        # sparks shoot out in a fan down from the line, fast, and are gone by the tenth frame
        if f < 10:
            t = f / 10
            for i, angle in enumerate((22, 50, 76, 104, 130, 158)):
                st = streaks[i % len(streaks)]
                reach = cell * (0.08 + 0.42 * (1 - (1 - t) ** 2)) * (0.85 + 0.1 * (i % 3))
                a = math.radians(angle)
                place(frame, st, cx + reach * math.cos(a), line + reach * math.sin(a), cell * 0.3, -angle, (1 - t) ** 1.4)
        # an afterglow on the line, fading
        if f >= 1:
            glow = 0.55 * (1 - f / 16) ** 1.2
            frame += glow * np.exp(-(((xx - cx) / 34) ** 2 + ((yy - line) / 15) ** 2))
        r, c = divmod(f, 4)
        sheet[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = np.clip(frame, 0, 1)
    save_grey(sheet, MECHA_OUT / "hit_burst.png")
    textures["mecha/hitBurst"] = {
        "file": "styles/mecha/hit_burst.png",
        "bundle": "effects",
        "size": [cell * 4, cell * 4],
        "flipbook": {"cols": 4, "rows": 4, "frames": 16, "fps": 60, "loop": False},
        "anchorY": round(1 - HIT_LINE, 3),
    }
    mecha_hold(cells["weld"], textures)


def mecha_hold(weld: np.ndarray, textures: dict) -> None:
    """The weld glow on the line, flickering a little, and sparks raining down from it, as a seamless loop."""
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
    cell, line = HIT_CELL, HOLD_LINE * HIT_CELL
    sheet = np.zeros((cell * 4, cell * 4), np.float32)
    rng = np.random.default_rng(7)
    sparks = [(rng.uniform(0, 1), math.radians(rng.uniform(52, 128)), rng.uniform(0.4, 1.0), rng.uniform(0.6, 1.0)) for _ in range(72)]
    for f in range(16):
        frame = np.zeros((cell, cell), np.float32)
        flicker = 0.93 + 0.07 * math.sin(2 * math.pi * f * 3 / 16)
        place(frame, glow, cell / 2, line, cell * 0.98, 0, flicker)
        # each spark flies out and down from the glow over a sixteenth of its own period, then starts again
        hi = Image.new("L", (cell * 4, cell * 4), 0)
        d = ImageDraw.Draw(hi)
        for phase, a, speed, bright in sparks:
            t = (f / 16 + phase) % 1
            r = cell * (0.05 + 0.5 * speed * t)
            x, y0 = cell / 2 + r * math.cos(a), line + r * math.sin(a) + cell * 0.25 * t * t
            tail = cell * 0.035 * speed
            x1, y1 = x - tail * math.cos(a), y0 - tail * math.sin(a)
            level = int(255 * bright * (1 - t))
            if level > 4:
                d.line([(x1 * 4, y1 * 4), (x * 4, y0 * 4)], fill=level, width=6)
        frame += np.asarray(hi.resize((cell, cell), Image.LANCZOS), dtype=np.float32) / 255
        r, c = divmod(f, 4)
        sheet[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = np.clip(frame, 0, 1)
    save_grey(sheet, MECHA_OUT / "hit_hold.png")
    textures["mecha/hitHold"] = {
        "file": "styles/mecha/hit_hold.png",
        "bundle": "effects",
        "size": [cell * 4, cell * 4],
        "flipbook": {"cols": 4, "rows": 4, "frames": 16, "fps": 24, "loop": True},
        "anchorY": round(1 - HOLD_LINE, 3),
    }


# ---------- CLUB, CRYSTAL, NEON: one builder, each set's own numbers ----------
#
# Shares are of the gear sheet's panel (x across its width, y down its height); px of a source sheet otherwise.
# The atlases (styleArt.ts: SETS):
#   notes.png 1024 × 1024: a 2 × 2 grid of 512 cells (white, blue, gold, scratch), the note fitted in 500 px about
#     the cell's middle; or, `rows`, a row of 256 per note, the note 1024 wide about the row's middle
#   long.png 512 × 256: body idle | body held | end idle | end held, 128 wide (ends `end` px deep)
#   side.png 1024 × 512: the bar over the keys at (0, 0); the side lane's own note at (0, 256)
#   keys.png 512 × 256: the light at rest | lit, fitted in 256 about the cell's middle
#   gear_<colourway>.png 1024 × 1024: the scratch's module fitted in 512 at (0, 0); the gear's strip under the row
#     at (0, 512), 1024 wide; club's fader at (512, 0), fitted in 256 × 512

SET_ART = {
    "club": {
        "notes": {"rows": False, "gain": 1 / 0.6, "lift": 0.7, "white": 0.8, "disc": True},
        "long": {"cap": 140, "idle": (1 / 0.8, 0.74, 0.7), "held": (1 / 0.62, 0.6, 0.9), "see": None},
        "side": {"cut": 0.105, "plate_cut": 0.21, "tint": (1 / 0.62, 0.68, 0.85), "bright": 0.62},
        "keys": {"way": "black", "idle": (0.532, 0.502), "lit": (0.4326, 0.502), "box": (0.055, None), "mask": "circle", "fit": 0.62},
        "ways": ("black", "white", "silver", "walnut"),
        "module": {"centre": (0.147, 0.51), "r": 0.112, "mask": "circle"},
        "strip": None,
        "fader": {"centre": 0.531, "w": 0.05, "y": (0.6, 0.9)},
        "colours": {"face": (0.27, 0.28, 0.06, 0.94), "edge": (0.0, 0.012, 0.3, 0.9)},
    },
    "crystal": {
        "notes": {"rows": True, "gain": 1 / 0.7, "lift": 0.74, "white": 0.85},
        "long": {"cap": 150, "idle": (1 / 0.7, 0.72, 0.8), "held": (1 / 0.6, 0.6, 0.9), "see": None},
        "side": {"cut": 0.04, "plate_cut": 0.07, "tint": (1 / 0.65, 0.7, 0.9), "bright": 0.6},
        "keys": {"way": "silver", "idle": (0.4588, 0.474), "lit": (0.3471, 0.474), "box": (0.0896, 0.56), "mask": "diamond", "fit": 0.768},
        "ways": ("silver", "rosegold", "gold", "smoke"),
        "module": {"centre": (0.108, 0.46), "r": 0.071, "mask": "circle"},
        "strip": {"x": (0.3, 0.93), "y": (0.66, 0.92)},
        "fader": None,
        # its glass panes, the dark board under them, its frame
        "colours": {"glass": (0.25, 0.4, 0.1, 0.25), "panel": (0.45, 0.55, 0.08, 0.2), "edge": (0.0, 0.012, 0.3, 0.9)},
    },
    "neon": {
        "notes": {"rows": False, "gain": 1 / 0.7, "lift": 0.72, "white": 0.85},
        "long": {"cap": 184, "idle": (1 / 0.72, 0.7, 0.85), "held": (1 / 0.62, 0.6, 0.9), "see": 0.55},
        "side": {"cut": 0.04, "plate_cut": 0.16, "tint": (1 / 0.7, 0.7, 0.9), "bright": 0.62},
        "keys": {"way": "black", "idle": (0.5125, 0.498), "lit": (0.4126, 0.498), "box": (0.12, 0.48), "mask": "plate", "fit": 0.74},
        "ways": ("black", "carbon", "navy", "burgundy"),
        # the module's plate, measured per colourway (carbon's lies further right in its wider frame)
        "module": {"box": (0.0422, 0.2375, 0.1247, 0.8614), "mask": "plate"},
        "module_ways": {
            "carbon": {"box": (0.0374, 0.281, 0.133, 0.8478)},
            "navy": {"box": (0.0422, 0.2379, 0.1234, 0.8616)},
            "burgundy": {"box": (0.0416, 0.2365, 0.1233, 0.8606)},
        },
        # carbon's panel is taller for its margins, not drawn taller
        "stretch_ways": {"carbon": 1.0},
        "strip": {"x": (0.25, 0.98), "y": (0.7, 0.95)},
        "fader": None,
        # its circuit board above the lights, its frame
        "colours": {"face": (0.3, 0.95, 0.08, 0.24), "edge": (0.0, 0.012, 0.3, 0.9)},
    },
}


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


def set_notes(cid: str, textures: dict) -> None:
    c = SET_ART[cid]["notes"]
    v = value(load(SRC / cid / "notes.jpg"))
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
        crop = np.pad(v, ((h, h), (w, w)))[cy - h // 2 + h:cy - h // 2 + 2 * h, cx - w // 2 + w:cx - w // 2 + 2 * w]
        alpha = shape_alpha(crop)
        if c.get("disc"):
            alpha = alpha * shape_mask("circle", h, w, 1.0)
        rgba = tint(unpremultiply(crop, alpha), alpha, gain=c["gain"], lift=c["lift"], white=c["white"])
        if c["rows"]:
            paste(atlas, fit_into(rgba, 1024, 256), 0, i * 256)
        else:
            r, col = divmod(i, 2)
            paste(atlas, fit_into(rgba, 500, 500), col * 512 + 6, r * 512 + 6)
    save_rgba(atlas, OUT / cid / "notes.png")
    textures[f"{NAME.get(cid, cid)}/notes"] = {"file": f"styles/{cid}/notes.png", "bundle": "notes", "size": [1024, 1024]}


def set_long(cid: str, textures: dict) -> dict:
    c = SET_ART[cid]["long"]
    v = value(load(SRC / cid / "long.jpg"))
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


def panel_of(a: np.ndarray) -> tuple[int, int, int, int]:
    return gear_parts(a)["panel"]


def shape_mask(kind: str, h: int, w: int, fit: float, soft: float = 0.0) -> np.ndarray:
    """A circle, a diamond, a hexagon (flat top and bottom) or neon's module plate filling `fit` of h × w about its
    middle, its edge softened over `soft` of its size (lit lights keep their glow)."""
    s = 4
    im = Image.new("L", (w * s, h * s), 0)
    d = ImageDraw.Draw(im)
    cx, cy = w * s / 2, h * s / 2
    rx, ry = w * s * fit / 2, h * s * fit / 2
    if kind == "circle":
        r = min(rx, ry)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    elif kind == "diamond":
        d.polygon([(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)], fill=255)
    elif kind == "plate":
        # neon's module: a hexagon standing on a point, its sides upright, its corners worn round
        q = ry / 2
        d.polygon([(cx, cy - ry), (cx + rx, cy - ry + q), (cx + rx, cy + ry - q), (cx, cy + ry), (cx - rx, cy + ry - q), (cx - rx, cy - ry + q)], fill=255)
        im = im.filter(ImageFilter.GaussianBlur(min(w, h) * s * 0.03)).point(lambda p: 255 if p >= 128 else 0)
    else:
        d.polygon([(cx - rx, cy), (cx - rx / 2, cy - ry), (cx + rx / 2, cy - ry), (cx + rx, cy), (cx + rx / 2, cy + ry), (cx - rx / 2, cy + ry)], fill=255)
    if soft > 0:
        im = im.filter(ImageFilter.GaussianBlur(min(w, h) * s * soft))
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def set_keys(cid: str, textures: dict) -> None:
    """A set's lane light at rest and lit (from its own colourway's sheet), each cut about its middle (where the
    light is mirror-symmetric) in the light's shape."""
    c = SET_ART[cid]["keys"]
    a = load(SRC / cid / f"gear_{c['way']}.jpg")
    v = value(a)
    y0, y1, x0, x1 = panel_of(a)
    W, H = x1 - x0, y1 - y0
    bw = int(W * c["box"][0])
    bh = int(H * c["box"][1]) if c["box"][1] else bw
    atlas = np.zeros((256, 512, 4), np.float32)
    for i, key in enumerate(("idle", "lit")):
        sx, sy = c[key]
        cx, cy = x0 + int(W * sx), y0 + int(H * sy)
        crop = v[cy - bh // 2:cy - bh // 2 + bh, cx - bw // 2:cx - bw // 2 + bw]
        lit = key == "lit"
        alpha = shape_mask(c["mask"], bh, bw, c["fit"] * (1.18 if lit else 1.0), soft=0.05 if lit else 0.0)
        if lit:
            # the glow past the light's edge is light, not plate: as bright as it is, fading out
            rgba = tint(crop, alpha * np.clip(crop / 0.5, 0, 1), gain=1 / 0.62, lift=0.66, white=0.92, power=1.1)
            rgba[..., 3] = np.maximum(shape_mask(c["mask"], bh, bw, c["fit"]), rgba[..., 3])
        else:
            rgba = tint(crop, alpha, gain=1 / 0.75, lift=0.8, white=0.7)
        paste(atlas, fit_into(rgba, 256, 256), i * 256, 0)
    save_rgba(atlas, OUT / cid / "keys.png")
    textures[f"{NAME.get(cid, cid)}/keys"] = {"file": f"styles/{cid}/keys.png", "bundle": "gear", "size": [512, 256]}


def set_gear(cid: str, textures: dict) -> dict:
    """Per colourway: the scratch's module, the strip under the row (or club's fader), and the plate's colours.

    Some recolours drew the whole panel taller than the set's own colourway did (club's white and silver, neon's
    carbon): their parts are cut as they lie and then brought back to the own colourway's proportions (a round
    platter round again)."""
    c = SET_ART[cid]
    out = {}
    ry0, ry1, rx0, rx1 = panel_of(load(SRC / cid / f"gear_{c['ways'][0]}.jpg"))
    ref = (ry1 - ry0) / (rx1 - rx0)
    for way in c["ways"]:
        a = load(SRC / cid / f"gear_{way}.jpg")
        y0, y1, x0, x1 = panel_of(a)
        W, H = x1 - x0, y1 - y0
        k = c.get("stretch_ways", {}).get(way, (H / W) / ref)

        def box(t: float, b: float, l: float, r: float) -> np.ndarray:
            return a[y0 + int(H * t):y0 + int(H * b), x0 + int(W * l):x0 + int(W * r)]

        def unstretch(rgba: np.ndarray) -> np.ndarray:
            return rgba if abs(k - 1) < 0.02 else resize_premultiplied(rgba, rgba.shape[1], max(1, round(rgba.shape[0] / k)))

        atlas = np.zeros((1024, 1024, 4), np.float32)
        m = {**c["module"], **c.get("module_ways", {}).get(way, {})}
        if "centre" in m:
            sx, sy = m["centre"]
            r = int(W * m["r"])
            rh = int(r * k)
            cx, cy = x0 + int(W * sx), y0 + int(H * sy)
            mod = unstretch(np.concatenate([a[cy - rh:cy + rh, cx - r:cx + r], np.ones((2 * rh, 2 * r, 1), np.float32)], axis=2))
            mod[..., 3] = shape_mask("circle", mod.shape[0], mod.shape[1], 1.0)
        else:
            l, rr, t, b = m["box"]
            raw = box(t, b, l, rr)
            mod = unstretch(np.concatenate([raw, np.ones(raw.shape[:2] + (1,), np.float32)], axis=2))
            mod[..., 3] = shape_mask(m["mask"], mod.shape[0], mod.shape[1], 1.0)
        paste(atlas, fit_into(mod, 512, 512), 0, 0)
        info = {"module": [int(mod.shape[1]), int(mod.shape[0])]}
        if c["strip"]:
            l, rr = c["strip"]["x"]
            t, b = c["strip"]["y"]
            strip = unstretch(np.concatenate([box(t, b, l, rr), np.ones(box(t, b, l, rr).shape[:2] + (1,), np.float32)], axis=2))
            sh = round(1024 * strip.shape[0] / strip.shape[1])
            paste(atlas, resize_premultiplied(strip, 1024, sh), 0, 512)
            info["strip_h"] = sh
        if c["fader"]:
            f = c["fader"]
            fd = box(f["y"][0], f["y"][1], f["centre"] - f["w"] / 2, f["centre"] + f["w"] / 2)
            fd = unstretch(np.concatenate([fd, np.ones(fd.shape[:2] + (1,), np.float32)], axis=2))
            paste(atlas, fit_into(fd, 256, 512), 512, 0)
            info["fader"] = [int(fd.shape[1]), int(fd.shape[0])]
        save_rgba(atlas, OUT / cid / f"gear_{way}.png")
        textures[f"{NAME.get(cid, cid)}/gear_{way}"] = {"file": f"styles/{cid}/gear_{way}.png", "bundle": "gear", "size": [1024, 1024]}
        cols = {}
        for key, (l, rr, t, b) in c["colours"].items():
            px = box(t, b, l, rr).reshape(-1, 3)
            cols[key] = hex_of(np.percentile(px, 90, axis=0) if key == "edge" else np.median(px, 0))
        info["colours"] = cols
        info["stretch"] = round(k, 3)
        out[way] = info
    return out


def fx_cells(cid: str) -> dict[str, np.ndarray]:
    """A set's effect sheet in four cells (light on black), the faint lines between them and the JPEG's noise cleared."""
    v = np.asarray(Image.open(SRC / cid / "fx.jpg").convert("L"), dtype=np.float32) / 255
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
    """A 4 × 4 sheet of HIT_CELL frames, each drawn by `draw(frame index, frame)` (light added on black)."""
    cell = HIT_CELL
    sheet = np.zeros((cell * 4, cell * 4), np.float32)
    for f in range(16):
        frame = np.zeros((cell, cell), np.float32)
        draw(f, frame)
        r, c = divmod(f, 4)
        sheet[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = np.clip(frame, 0, 1)
    return sheet


def afterglow(frame: np.ndarray, line: float, gain: float, wx: float = 34, wy: float = 15) -> None:
    yy, xx = np.mgrid[0:frame.shape[0], 0:frame.shape[1]].astype(np.float32)
    frame += gain * np.exp(-(((xx - frame.shape[1] / 2) / wx) ** 2 + ((yy - line) / wy) ** 2))


def set_hits(cid: str, textures: dict) -> None:
    """The set's hit (16 frames, once) and hold (16 frames, a loop), spreading from the judge line down over the gear."""
    cells = fx_cells(cid)
    n = cells["flash"].shape[0]
    cell, line, hold_line = HIT_CELL, HIT_LINE * HIT_CELL, HIT_LINE * HIT_CELL
    cx = cell / 2
    centres = {
        "club": {"flash": (513, 511), "ring": (522, 511), "hold": (499, 510)},
        "crystal": {"flash": (514, 515), "ring": (502, 521), "hold": (463, 504)},
        "neon": {"flash": (425, 522), "ring": (442, 513), "hold": (381, 518)},
    }[cid]
    flash = crop_around(cells["flash"], *centres["flash"], n // 2 - 8)
    ring = crop_around(cells["ring"], *centres["ring"], n // 2 - 8)
    hold = crop_around(cells["hold"], *centres["hold"], n // 2 - 8)
    sprites = sprites_of(cells["sprites"])
    rng = np.random.default_rng({"club": 3, "crystal": 5, "neon": 9}[cid])
    keep_flash = above_line(cell, line, 14, 46)
    keep_ring = above_line(cell, line, 5, 26)
    if cid == "crystal":
        # its shards were drawn flying up: turned over, they fly down over the gear
        ring = ring[::-1]
    flicker = [1.0, 0.72, 1.0, 0.86, 0.95, 0.62, 1.0, 0.8, 0.9, 0.7, 1.0, 0.75, 0.9, 0.8, 1.0, 0.85] if cid == "neon" else [1.0] * 16
    throws = [(math.radians(rng.uniform(25, 155)), rng.uniform(0.55, 1.0), rng.integers(0, max(1, len(sprites))), rng.uniform(-90, 90)) for _ in range(8)]

    def draw_burst(f: int, frame: np.ndarray) -> None:
        g = flicker[f]
        if f < 6:
            fl = np.zeros_like(frame)
            place(fl, flash, cx, line, cell * [0.5, 0.72, 0.82, 0.88, 0.92, 0.94][f], f * 2.0, [1.0, 1.0, 0.72, 0.45, 0.24, 0.1][f] * g)
            frame += fl * keep_flash
        if f >= 1:
            t = min(1, (f - 1) / 12)
            grow = 0.3 + 0.85 * (1 - (1 - t) ** 2)
            fade = max(0.0, 1 - max(0, f - 5) / 10) ** 1.3
            rg = np.zeros_like(frame)
            place(rg, ring, cx, line + 4 * t, cell * grow, 0, fade * g)
            frame += rg * keep_ring
        # pieces thrown out and down from the hit, slowing, falling a little, gone by the twelfth frame
        if f < 12 and sprites:
            t = f / 12
            for a, speed, k, spin in throws:
                reach = cell * 0.46 * speed * (1 - (1 - t) ** 2)
                x, y = cx + reach * math.cos(a), line + reach * math.sin(a) + cell * 0.08 * t * t
                sp = sprites[int(k) % len(sprites)]
                size = cell * min(0.16, 0.04 + sp.shape[0] / n * 0.5)
                place(frame, sp, x, y, size, spin * t, (1 - t) ** 1.2 * g)
        if f >= 1:
            afterglow(frame, line, 0.5 * (1 - f / 16) ** 1.2 * g)

    sheet = burst_sheet(draw_burst)
    save_grey(sheet, OUT / cid / "hit_burst.png")
    textures[f"{NAME.get(cid, cid)}/hitBurst"] = {
        "file": f"styles/{cid}/hit_burst.png",
        "bundle": "effects",
        "size": [cell * 4, cell * 4],
        "flipbook": {"cols": 4, "rows": 4, "frames": 16, "fps": 60, "loop": False},
        "anchorY": round(1 - HIT_LINE, 3),
    }

    keep_hold = above_line(cell, hold_line, 8, 34)
    twinkles = [(rng.uniform(0.15, 0.85), rng.uniform(0.32, 0.8), rng.uniform(0, 1), rng.integers(0, max(1, len(sprites)))) for _ in range(9)]

    def draw_hold(f: int, frame: np.ndarray) -> None:
        phase = 2 * math.pi * f / 16
        if cid == "club":
            # the glowing ring breathes a little
            place(frame, hold, cx, hold_line, cell * (0.72 + 0.03 * math.sin(phase * 2)), 0, 0.92 + 0.08 * math.sin(phase * 2))
        elif cid == "crystal":
            place(frame, hold, cx, hold_line, cell * 0.9, 0, 0.9)
        else:
            # the arcs crackle: turned over every other frame, a little shifted, flickering
            arc = hold[:, ::-1] if f % 2 else hold
            place(frame, arc, cx + rng.uniform(-6, 6), hold_line, cell * 0.98, 0, flicker[(f * 5) % 16])
        frame *= keep_hold
        # sparkles twinkling over it, each at its own beat (a seamless loop)
        if sprites and cid != "neon":
            for x, y, ph, k in twinkles:
                b = max(0.0, math.sin(phase + 2 * math.pi * ph))
                if b > 0.05:
                    sp = sprites[int(k) % len(sprites)]
                    place(frame, sp, cell * x, hold_line + cell * (y - 0.3) * 0.9, cell * 0.08 * (0.6 + 0.4 * b), 0, b)

    sheet = burst_sheet(draw_hold)
    save_grey(sheet, OUT / cid / "hit_hold.png")
    textures[f"{NAME.get(cid, cid)}/hitHold"] = {
        "file": f"styles/{cid}/hit_hold.png",
        "bundle": "effects",
        "size": [cell * 4, cell * 4],
        "flipbook": {"cols": 4, "rows": 4, "frames": 16, "fps": 24, "loop": True},
        "anchorY": round(1 - HIT_LINE, 3),
    }


def main() -> None:
    textures: dict = {}
    if MECHA_OUT.exists():
        shutil.rmtree(MECHA_OUT)
    mecha_notes(textures)
    mecha_long(textures)
    side = mecha_side(textures)
    keys = mecha_keys(textures)
    gear = mecha_gear(textures)
    mecha_hits(textures)
    report = {"mecha": {"side": side, "keys": keys, "gear": gear}}
    for cid in SET_ART:
        if (OUT / cid).exists():
            shutil.rmtree(OUT / cid)
        set_notes(cid, textures)
        report[cid] = {"long": set_long(cid, textures), "side": set_side(cid, textures)}
        set_keys(cid, textures)
        report[cid]["gear"] = set_gear(cid, textures)
        set_hits(cid, textures)
    print(json.dumps(report, indent=1))
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    kept = {k: t for k, t in manifest["textures"].items() if not t["file"].startswith("styles/")}
    manifest["textures"] = dict(sorted({**kept, **textures}.items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
