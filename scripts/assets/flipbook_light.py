"""How bright each frame of a hit's flipbook is, and the frame a hit starts at.

    python scripts/assets/flipbook_light.py [--write] [hit ...]

A hit answers a key press: what the player sees in the very first frame on the screen is what tells them the note
was hit. A flipbook that swells for a few frames before it is at its brightest shows a tenth to a half of its light
then, and its brightest 30 to 130 ms later. So the build scripts (build_skin_fx.py, build_styles.py) measure every
frame of a hit's sheet and write, in the manifest, the first frame that is about as bright as its brightest
("peak" in its "flipbook"): the game starts a hit there (client/src/render/TrackRenderer.ts, drawHit), and the
frames before it are not played. A sheet in colours of its own also has the colour of its light there ("tone"),
for the flash the game draws on the judge line with it.

Run by itself this prints, for every "<hit>/hitBurst" of the manifest (or the hits named), each frame's light as a
share of the brightest frame's, and where the hit starts; `--write` writes "peak" (and "tone") into the manifest
from the sheets as they are in client/public/media (for a sheet whose build was not run again).
Needs Pillow and numpy.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / "client" / "public" / "media"

#: a hit starts at the first frame with this share of the brightest frame's light: as bright to the eye, and a frame
#: or two more of the effect's motion are kept than from the very brightest
NEAR_PEAK = 0.95


def frame_light(sheet: Image.Image, cols: int, rows: int, frames: int) -> list[float]:
    """The light of each frame: the mean over its cell of alpha x luma, 0..1."""
    a = np.asarray(sheet.convert("RGBA"), dtype=np.float32) / 255
    luma = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3]
    ch, cw = a.shape[0] // rows, a.shape[1] // cols
    return [float(luma[(f // cols) * ch:(f // cols + 1) * ch, (f % cols) * cw:(f % cols + 1) * cw].mean()) for f in range(frames)]


def start_frame(light: list[float]) -> int:
    """The first frame about as bright as the brightest (NEAR_PEAK of it)."""
    top = max(light)
    if top <= 0:
        return 0
    return next(f for f, x in enumerate(light) if x >= NEAR_PEAK * top)


def frame_tone(sheet: Image.Image, cols: int, rows: int, frame: int) -> str:
    """The colour of a frame's light: its pixels' mean weighted by their light, as bright as the colour goes ("#rrggbb")."""
    a = np.asarray(sheet.convert("RGBA"), dtype=np.float32) / 255
    ch, cw = a.shape[0] // rows, a.shape[1] // cols
    cell = a[(frame // cols) * ch:(frame // cols + 1) * ch, (frame % cols) * cw:(frame % cols + 1) * cw]
    rgb = cell[..., :3] * cell[..., 3:]
    luma = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    # the glow about the white-hot core carries the colour: the core itself is white whatever the effect's colour
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    weight = luma * spread
    if float(weight.sum()) <= 0:
        return "#ffffff"
    mean = (rgb * weight[..., None]).sum(axis=(0, 1)) / float(weight.sum())
    mean = mean / max(float(mean.max()), 1e-6)
    return "#" + "".join(f"{int(round(float(np.clip(c, 0, 1)) * 255)):02x}" for c in mean)


def measure(entry: dict, sheet: Image.Image) -> dict:
    """Writes where the hit starts into a hit's manifest entry (and its light's colour, of a sheet in its own colours)."""
    book = entry["flipbook"]
    light = frame_light(sheet, book["cols"], book["rows"], book["frames"])
    book["peak"] = start_frame(light)
    if entry.get("plain"):
        entry["tone"] = frame_tone(sheet, book["cols"], book["rows"], book["peak"])
    else:
        entry.pop("tone", None)
    return entry


def main() -> None:
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("--write", action="store_true", help="write each hit's start (and tone) into the manifest")
    args.add_argument("hits", nargs="*", help="the hits to measure (all of them when none is named)")
    opts = args.parse_args()
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for key, entry in sorted(manifest["textures"].items()):
        name, _, slot = key.partition("/")
        if slot != "hitBurst" or (opts.hits and name not in opts.hits):
            continue
        if "flipbook" not in entry:
            # a hit drawn from layers (the skins': build_skin_fx.py measured its sheet as it cut it)
            light = entry.get("layers", {}).get("light", [])
            print(f"{name:8s} layers  light every 20 ms: {' '.join(f'{x * 100:3.0f}' for x in light)}")
            continue
        book = entry["flipbook"]
        sheet = Image.open(MEDIA / entry["file"])
        light = frame_light(sheet, book["cols"], book["rows"], book["frames"])
        top = max(light) or 1
        brightest = light.index(max(light))
        start = start_frame(light)
        if opts.write:
            measure(entry, sheet)
        ms = 1000 / book["fps"]
        print(
            f"{name:8s} {book['frames']:2d} frames {book['fps']:5.1f} fps  first {light[0] / top:4.0%}  brightest f{brightest} = {brightest * ms:3.0f} ms"
            f"  starts f{start} ({light[start] / top:4.0%}), plays {(book['frames'] - start) * ms:3.0f} ms  {entry.get('tone', '')}"
            f"  | {' '.join(f'{x / top * 100:3.0f}' for x in light)}"
        )
    if opts.write:
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
