"""Builds the long notes drawn with the image model (assets-src/styles/longs/<long>.jpg, made by make_long_notes.py)
into client/public/media/longs/<long>.png and lists them in client/public/media/manifest.json as "longs/<long>"
(the manifest's other entries are kept), in the layout of the concept sets' long.png (build_styles.py): 512 × 256,
body idle | body held | end idle | end held, 128 wide, the body a tile that repeats along the note, the ends
`end` px deep, as tint pictures (red how much of the lane colour shows, green how far it is lifted toward white).

    python scripts/assets/build_long_notes.py [<long> ...]

The game draws a long note from its picture where it is listed here and loaded (client/src/render/styleArt.ts:
ART_LONGS, whose `end` must match END below); without it, from code. Needs Pillow, numpy and scipy.
"""

from __future__ import annotations

import json
import sys

import numpy as np

from build_styles import LONG_TILE, LONG_W, MEDIA, SRC, blobs, load, paste, resize_premultiplied, save_rgba, seamless_rows, shape_alpha, tint, unpremultiply, value

NOTE_STRETCH = 1.7
#: the code's end depth per body width (tintArt.ts: LONG_PAINT[…].endDepth): the end is cut from the rail's top as deep
END_DEPTH = {"prism": 0.5 * NOTE_STRETCH * 0.55}
#: the references were drawn for a lane 0.72 grey: a value of 0.72 is all of the lane colour
GAIN = 1 / 0.72
#: (lift, white) of the tint idle and held; `see`: the body's dark inside, half see-through (its alpha), as the code's is
LOOK: dict[str, dict] = {
    "solid": {}, "prism": {}, "sky": {"see": 0.55}, "fire": {}, "aqua": {"see": 0.75}, "steel": {}, "noir": {}, "wire": {"see": 0.4},
    "astral": {}, "chrome": {}, "hairline": {}, "glass": {"see": 0.35}, "enamel": {}, "pearl": {}, "carbon": {},
}
OUT = MEDIA / "longs"


def end_px(long: str) -> int:
    """How deep the end is in the built picture (px of 128 across), as the code's end for its width."""
    return round(LONG_W * END_DEPTH.get(long, 0.2) * NOTE_STRETCH)


def solid(v: np.ndarray, box: tuple[slice, slice]) -> tuple[slice, slice]:
    """The rail itself in its box: the rows and columns that are mostly lit (a held rail's glow round it is not)."""
    ys, xs = box
    lit = v[ys, xs] > 0.15
    rows = np.flatnonzero(lit.mean(axis=1) > 0.8)
    cols = np.flatnonzero(lit.mean(axis=0) > 0.8)
    return slice(ys.start + rows[0], ys.start + rows[-1] + 1), slice(xs.start + cols[0], xs.start + cols[-1] + 1)


def build(long: str) -> dict:
    look = LOOK[long]
    v = value(load(SRC / "longs" / f"{long}.jpg"))
    # the two rails, found above their glow
    idle, held = sorted(blobs(v, 0.15, 2), key=lambda b: b[1].start)
    end = end_px(long)
    atlas = np.zeros((256, 512, 4), np.float32)
    for i, (box, (lift, white)) in enumerate([(idle, (0.74, 0.75)), (held, (0.6, 0.9))]):
        ys, xs = solid(v, box)
        rail = v[ys, xs]
        rail_w = xs.stop - xs.start
        alpha = shape_alpha(rail)
        own = unpremultiply(rail, alpha)
        if "see" in look:
            alpha = np.where((alpha > 0.99) & (own < 0.18), look["see"], alpha)
        rgba = tint(own, alpha, gain=GAIN, lift=lift, white=white)
        # the body: a stretch of the rail's middle that repeats without a seam
        length = round(rail_w * LONG_TILE / LONG_W)
        mid = rgba.shape[0] // 2
        body = seamless_rows(rgba[mid - length // 2: mid + length // 2 + length // 4 + 1], length, length // 4)
        paste(atlas, resize_premultiplied(body, LONG_W, LONG_TILE), i * LONG_W, 0)
        # the end: the rail's top, as deep for its width as the code's end
        cap = round(end * rail_w / LONG_W)
        paste(atlas, resize_premultiplied(rgba[:cap], LONG_W, end), 256 + i * LONG_W, 0)
    save_rgba(atlas, OUT / f"{long}.png")
    return {"file": f"longs/{long}.png", "bundle": "notes", "size": [512, 256]}


def main() -> None:
    longs = sys.argv[1:] or [p.stem for p in sorted((SRC / "longs").glob("*.jpg"))]
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    textures = manifest["textures"]
    for long in longs:
        if long not in LOOK:
            sys.exit(f"unknown long note: {long}")
        textures[f"longs/{long}"] = build(long)
        print(long, "end", end_px(long))
    manifest["textures"] = dict(sorted(textures.items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
