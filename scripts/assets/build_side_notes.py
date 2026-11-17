"""Builds the side notes drawn with the image model (assets-src/styles/side/<side>.jpg, make_side_notes.py) into
client/public/media/side/<side>.png, listed in client/public/media/manifest.json as "side/<side>" (its other entries
are kept):

- side/bar.png, 1024 × 512: the tap laid over the keys (BAR_TAP: its ends kept as drawn, its middle stretched to the
  half it spans), the long note's body (BAR_BODY, a tile that repeats along it) and its end band (BAR_END);
- side/dots.png, 256 × 128: an LED dot lit (0, 0) and dim (128, 0), 128 square, the dot DOT_R from its middle (the
  game lays them out in rows, as many as the key lanes take).

The pictures are light on black for a lane 0.72 grey (the references were drawn so): each is turned back into a tint
picture of the lane's colour, its alpha how much shows (a value of 0.72 all of it) and its brighter parts lifted
toward white. Each part is first brought to the reference's brightness (its median over the same part), so what was
see-through in the code stays as see-through: the key notes under a side note must read.

    python scripts/assets/build_side_notes.py [bar|dots ...]

The game draws a side note from its picture where it is listed (client/src/render/styleArt.ts: ART_SIDES) and loaded;
without it, in code. Needs Pillow, numpy and scipy.
"""

from __future__ import annotations

import json
import sys

import numpy as np
from PIL import Image

from build_styles import MEDIA, SRC, blobs, load, paste, save_rgba, value

LANE = 0.72
#: side/bar.png's parts: (y, rows) in its 1024 × 512
BAR_TAP, BAR_BODY, BAR_END = (0, 176), (192, 128), (336, 64)
DOT, DOT_R = 128, 48


def tint(v: np.ndarray) -> np.ndarray:
    """Light on black for a lane LANE grey → a tint picture: the colour at alpha v / LANE, lifted toward white above it."""
    a = np.clip(v / LANE, 0, 1)
    g = np.clip((v - LANE) / (1 - LANE), 0, 1)
    return np.stack([np.where(a > 0, 1.0, 0.0), g, np.zeros_like(v), a], axis=2).astype(np.float32)


def resize(v: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.asarray(Image.fromarray((np.clip(v, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS), np.float32) / 255


def matched(v: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """`v` scaled so its median is the reference part's."""
    m = float(np.median(v))
    return v * (float(np.median(ref)) / m) if m > 1e-3 else v


def two(v: np.ndarray) -> tuple[tuple[slice, slice], tuple[slice, slice]]:
    """The tap (the upper shape) and the long note (the lower) of a bar sheet."""
    return tuple(sorted(blobs(v, 0.1, 2), key=lambda b: b[0].start))  # type: ignore[return-value]


def build_bar() -> dict:
    v = value(load(SRC / "side" / "bar.jpg"))
    r = value(load(SRC / "side" / "refs" / "bar.jpg"))
    r = resize(r, v.shape[1], v.shape[0])
    (ty, tx), (ly, lx) = two(v)
    (rty, rtx), (rly, rlx) = two(r)
    atlas = np.zeros((512, 1024, 4), np.float32)
    # the tap, whole
    tap = matched(v[ty, tx], r[rty, rtx])
    paste(atlas, tint(resize(tap, 1024, BAR_TAP[1])), 0, BAR_TAP[0])
    # the long note: its end band (its top, as deep as the reference's), and a stretch of its body's middle
    long, ref = v[ly, lx], r[rly, rlx]
    band = max(4, int(np.flatnonzero(ref[:, ref.shape[1] // 2] < ref[2, ref.shape[1] // 2] * 0.7)[0] * long.shape[1] / ref.shape[1]))
    paste(atlas, tint(resize(long[:band], 1024, BAR_END[1])), 0, BAR_END[0])
    h = long.shape[0]
    body = matched(long[int(h * 0.4): int(h * 0.6)], ref[int(ref.shape[0] * 0.4): int(ref.shape[0] * 0.6)])
    # alike all along: each column its mean down the stretch (the body repeats; a sheen across it would step)
    body = np.repeat(body.mean(axis=0, keepdims=True), 8, axis=0)
    paste(atlas, tint(resize(body, 1024, BAR_BODY[1])), 0, BAR_BODY[0])
    save_rgba(atlas, MEDIA / "side" / "bar.png")
    return {"side/bar": {"file": "side/bar.png", "bundle": "notes", "size": [1024, 512]}}


def build_dots() -> dict:
    v = value(load(SRC / "side" / "dots.jpg"))
    r = value(load(SRC / "side" / "refs" / "dots.jpg"))
    r = resize(r, v.shape[1], v.shape[0])
    atlas = np.zeros((DOT, 2 * DOT, 4), np.float32)
    rows = sorted(blobs(r, 0.05, 12), key=lambda b: (b[0].start, b[1].start))
    lit_ref, dim_ref = rows[2], rows[8]
    for i, box in enumerate([lit_ref, dim_ref]):
        ys, xs = box
        cy, cx = (ys.start + ys.stop) // 2, (xs.start + xs.stop) // 2
        rad = (xs.stop - xs.start) / 2
        # the dot with room round it for its glow, DOT_R / (DOT / 2) of the cell its lens
        half = int(rad * (DOT / 2) / DOT_R)
        cell = v[cy - half: cy + half, cx - half: cx + half]
        disk = (np.hypot(*np.mgrid[-half:half, -half:half]) < rad * 0.8)
        cell = cell * (float(r[cy - half: cy + half, cx - half: cx + half][disk].mean()) / max(1e-3, float(cell[disk].mean())))
        paste(atlas, tint(resize(cell, DOT, DOT)), i * DOT, 0)
    save_rgba(atlas, MEDIA / "side" / "dots.png")
    return {"side/dots": {"file": "side/dots.png", "bundle": "notes", "size": [2 * DOT, DOT]}}


def main() -> None:
    sides = sys.argv[1:] or ["bar", "dots"]
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for side in sides:
        manifest["textures"].update({"bar": build_bar, "dots": build_dots}[side]())
        print("built", side)
    manifest["textures"] = dict(sorted(manifest["textures"].items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
