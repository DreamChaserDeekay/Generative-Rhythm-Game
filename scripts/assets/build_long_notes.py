"""Builds the notes and long notes drawn with the image model (assets-src/styles/longs/<long>.jpg, made by
make_long_notes.py): the taps into client/public/media/notes/<note>.png ("notes/<note>": the key lanes' tap and the
scratch's, a row each, NOTE_W × NOTE_H), the long note into client/public/media/longs/<long>.png ("longs/<long>"),
listed in client/public/media/manifest.json (its other entries are kept). The long note is in the layout of the concept sets' long.png (build_styles.py): 512 × 256,
body idle | body held | end idle | end held, 128 wide, the body a tile that repeats along the note, the ends
`end` px deep, as tint pictures (red how much of the lane colour shows, green how far it is lifted toward white).

    python scripts/assets/build_long_notes.py [<long> ...]

The game draws a note or long note from its picture where it is listed (client/src/render/styleArt.ts: ART_NOTES,
ART_LONGS, whose ends' depth must match end_px below) and loaded; without it, from code. Needs Pillow, numpy and scipy.
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
#: `see`: the body's dark inside, half see-through (its alpha), as the code's is; `window`: where the body's tile is cut
#: from the idle rail (its first row and its rows, of the rail as found: from halfway between one mark and the next
#: to halfway between it and the one after, so a tile holds one mark whole; read off the picture), else one width of
#: its middle (the generated rails are short: a longer stretch would take in their ends' details)
LOOK: dict[str, dict] = {
    "solid": {}, "prism": {}, "sky": {"see": 0.55}, "fire": {},
    # a chevron every 460 rows (at 310 and 770), a rivet pair every 410 (305, 715), a square every 230 (210, 440, 670)
    "aqua": {"see": 0.75, "window": (80, 460)}, "steel": {"window": (100, 410)}, "noir": {"window": (325, 230)}, "wire": {"see": 0.4},
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


#: the taps' layout in media/notes/<note>.png (styleArt.ts: ART_NOTE): the key lanes' tap in the first row, the
#: scratch's in the second, each NOTE_W × NOTE_H at the row's top + NOTE_TOP
NOTE_W, NOTE_H, NOTE_ROW, NOTE_TOP = 1024, 224, 256, 16
#: each long note's tap style (the skin's note)
NOTE_OF = {"solid": "flat"}


def level(rgba: np.ndarray, mid: int, length: int) -> np.ndarray:
    """The rail with its tint evened out along its length about its middle: a picture a little brighter at one end
    than the other would show a step at every tile of the body."""
    out = rgba.copy()
    span = slice(max(0, mid - length), min(len(rgba), mid + length))
    rows = rgba[span, :, 0].mean(axis=1)
    # the drift: a straight line fitted to the rows' means
    y = np.arange(len(rows), dtype=np.float32)
    k, c = np.polyfit(y, rows, 1)
    trend = k * y + c
    target = float(rows.mean())
    out[span, :, 0] = np.clip(rgba[span, :, 0] * (target / np.maximum(trend, 1e-3))[:, None], 0, 1)
    return out


def build_taps(long: str, v: np.ndarray, below: int) -> dict:
    """The two taps above the rails (key, scratch) as tint pictures, each stretched to NOTE_W × NOTE_H."""
    key, scratch = sorted(blobs(v[:below], 0.15, 2), key=lambda b: b[1].start)
    atlas = np.zeros((2 * NOTE_ROW, NOTE_W, 4), np.float32)
    for row, (ys, xs) in enumerate([key, scratch]):
        # all of its outline (the fire's flames rise off it: not "mostly lit" rows)
        tap = v[ys, xs]
        alpha = shape_alpha(tap)
        rgba = tint(unpremultiply(tap, alpha), alpha, gain=GAIN, lift=0.74, white=0.8)
        paste(atlas, resize_premultiplied(rgba, NOTE_W, NOTE_H), 0, row * NOTE_ROW + NOTE_TOP)
    note = NOTE_OF.get(long, long)
    save_rgba(atlas, MEDIA / "notes" / f"{note}.png")
    return {f"notes/{note}": {"file": f"notes/{note}.png", "bundle": "notes", "size": [NOTE_W, 2 * NOTE_ROW]}}


def build(long: str) -> dict:
    look = LOOK[long]
    v = value(load(SRC / "longs" / f"{long}.jpg"))
    # the two rails (the tallest shapes), found above their glow; the taps above them
    idle, held = sorted(sorted(blobs(v, 0.15, 4), key=lambda b: b[0].stop - b[0].start)[-2:], key=lambda b: b[1].start)
    textures = build_taps(long, v, min(idle[0].start, held[0].start) - 4)
    end = end_px(long)
    atlas = np.zeros((256, 512, 4), np.float32)
    width = (lambda xs: xs.stop - xs.start)(solid(v, idle)[1])
    for i, (box, (lift, white)) in enumerate([(idle, (0.74, 0.75)), (held, (0.6, 0.9))]):
        ys, xs = solid(v, box)
        # both as wide as the idle rail (a held rail's glow can pass for its edge), about its own middle
        mid_x = (xs.start + xs.stop) // 2
        xs = slice(mid_x - width // 2, mid_x - width // 2 + width)
        rail = v[ys, xs]
        rail_w = xs.stop - xs.start
        alpha = shape_alpha(rail)
        own = unpremultiply(rail, alpha)
        if "see" in look:
            alpha = np.where((alpha > 0.99) & (own < 0.18), look["see"], alpha)
        rgba = tint(own, alpha, gain=GAIN, lift=lift, white=white)
        # the body: one tile of the rail (body_window: one mark whole, or a width of its plain middle), the idle rail's
        # window for both (alike in length for its width), stored LONG_TILE deep (the game stretches it back: `tile`),
        # its two ends blended over a few rows so it repeats without a seam
        if i == 0:
            y0, length = look.get("window") or (rail.shape[0] // 2 - rail_w // 2, rail_w)
            share, tiles = y0 / rail.shape[0], length / rail_w
        else:
            y0, length = round(share * rail.shape[0]), round(tiles * rail_w)
        rgba = level(rgba, y0 + length // 2, length)
        blend = max(2, length // 10)
        body = seamless_rows(rgba[y0:y0 + length + blend], length, blend)
        paste(atlas, resize_premultiplied(body, LONG_W, LONG_TILE), i * LONG_W, 0)
        # the end: the rail's top, as deep for its width as the code's end
        cap = round(end * rail_w / LONG_W)
        paste(atlas, resize_premultiplied(rgba[:cap], LONG_W, end), 256 + i * LONG_W, 0)
    save_rgba(atlas, OUT / f"{long}.png")
    print(long, "tile", round(tiles, 4))
    return {**textures, f"longs/{long}": {"file": f"longs/{long}.png", "bundle": "notes", "size": [512, 256]}}


#: the AI companies' notes' materials (make_long_notes.py material): a tint square filling the mark (styleArt.ts: ART_MATERIALS)
MATERIALS = ("gpt", "gemini", "grok", "claude")
MATERIAL_PX = 512


def build_material(logo: str) -> dict:
    """The material as a tint picture, opaque: its light grey all of the lane colour, its brightest lifted toward white."""
    from PIL import Image

    a = load(SRC / "longs" / f"{logo}.jpg")
    v = np.asarray(Image.fromarray((value(a) * 255).astype(np.uint8)).resize((MATERIAL_PX, MATERIAL_PX), Image.LANCZOS), np.float32) / 255
    rgba = tint(v, np.ones_like(v), gain=1 / 0.6, lift=0.72, white=0.6)
    save_rgba(rgba, MEDIA / "notes" / f"{logo}.png")
    return {f"notes/{logo}": {"file": f"notes/{logo}.png", "bundle": "notes", "size": [MATERIAL_PX, MATERIAL_PX]}}


def main() -> None:
    longs = sys.argv[1:] or [p.stem for p in sorted((SRC / "longs").glob("*.jpg"))]
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    textures = manifest["textures"]
    for long in longs:
        if long in MATERIALS:
            textures.update(build_material(long))
            print(long, "material")
            continue
        if long not in LOOK:
            sys.exit(f"unknown long note: {long}")
        textures.update(build(long))
        print(long, "end", end_px(long))
    manifest["textures"] = dict(sorted(textures.items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
