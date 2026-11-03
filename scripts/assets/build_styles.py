"""Builds the concept sets' game pictures from assets-src/styles/<set>/ into client/public/media/styles/<set>/
and lists them in client/public/media/manifest.json as "<set>/<name>" (the manifest's other entries are kept).

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
    print(json.dumps({"side": side, "keys": keys, "gear": gear}, indent=1))
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    kept = {k: t for k, t in manifest["textures"].items() if not t["file"].startswith("styles/")}
    manifest["textures"] = dict(sorted({**kept, **textures}.items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
