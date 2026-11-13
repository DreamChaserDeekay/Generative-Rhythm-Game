"""Builds the pictures of a play's end from assets-src/end/ into client/public/end/ and lists them in
client/public/end/index.json (read by client/src/ui/endArt.ts: change them together). They are the HUD's pictures,
not the track's: they have a folder and a list of their own beside media/, whose manifest lists the renderer's.

    python scripts/assets/build_end_fx.py [--src DIR] [--out DIR]

Each source is one picture from the image model on black (scripts/assets/make_end_fx.py; where each came from:
assets-src/PROVENANCE.md): the lettering of the lamps that show their words (`words-<lamp>.jpg`), the seal of each clear
lamp (`seal-<lamp>.jpg`), the frame-by-frame sheets (16 frames in a 4 x 4 grid, read row by row) of the shockwave that
runs out from a seal as it is stamped (`ring.jpg`) and of the sparks where a hard clear's two halves close
(`sparks.jpg`), and the cracks over the lanes of a play that fails halfway (`cracks.jpg`).

What is done to a picture: its black is made black (the model's is not quite, and JPEG adds noise) and then nothing:
the picture becomes as opaque as it is bright, in colours such that over black it looks exactly as it did, so its glow
lies on the screen as light and what is dark in it lets the screen through. Words and seals are cut to what is drawn
and made the game's size. A sheet's frames fade toward the edges of their cells, the frames after the effect has gone
are dropped, and the rest are laid in one row (the styles play them left to right). The shockwave is kept as white:
the game gives it the lamp's colour.
Needs Pillow and numpy.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "end"
OUT = ROOT / "client" / "public" / "end"

#: lamp class (client/src/ui/lamps.tsx) -> the picture of its words
WORDS = {"perfect": "words-perfect", "maxcombo": "words-maxcombo", "failed": "words-failed"}
SEALS = ["clear", "easy", "assist", "hard", "exhard"]
#: px: the words' height, a seal's side, a frame of a sheet, the cracks' width
WORDS_HEIGHT = 320
SEAL_PX = 512
CELL = 384
CRACKS_WIDTH = 1024
GRID = 4
#: how much more opaque than bright a picture is: words and seals are solid where they are half bright or more
SOLID = 2.0
LIGHT = 1.25
#: a sheet's frames end where its light falls under this share of its brightest frame's
GONE = 0.03
QUALITY = 90
CRACKS_QUALITY = 78


def smoothstep(lo: float, hi: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def load(path: Path) -> np.ndarray:
    """RGB as float32 in 0..1, its black made black: what is darker than a faint glow is noise."""
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255
    return a * smoothstep(0.03, 0.09, a.max(axis=2))[..., None]


def lit(a: np.ndarray, gain: float) -> np.ndarray:
    """Light on black as RGBA: as opaque as it is bright times `gain`, coloured so that over black it is the picture itself."""
    alpha = np.clip(a.max(axis=2) * gain, 0, 1)
    rgb = np.where(alpha[..., None] > 1e-4, np.clip(a / np.maximum(alpha, 1e-4)[..., None], 0, 1), 0)
    return np.dstack([rgb, alpha]).astype(np.float32)


def drawn(rgba: np.ndarray, pad: float = 0.02) -> tuple[int, int, int, int]:
    """The box of what is drawn (left, top, right, bottom), a little room round it."""
    seen = rgba[..., 3] > 0.04
    rows, cols = np.flatnonzero(seen.any(axis=1)), np.flatnonzero(seen.any(axis=0))
    room = round(pad * max(rgba.shape[0], rgba.shape[1]))
    return max(0, cols[0] - room), max(0, rows[0] - room), min(rgba.shape[1], cols[-1] + 1 + room), min(rgba.shape[0], rows[-1] + 1 + room)


def sized(rgba: np.ndarray, size: tuple[int, int]) -> Image.Image:
    """The picture at `size`, its colours weighted by how opaque they are (no dark fringe where it thins out)."""
    pre = rgba.copy()
    pre[..., :3] *= pre[..., 3:4]
    channels = [np.asarray(Image.fromarray(pre[..., c]).resize(size, Image.LANCZOS)) for c in range(4)]
    small = np.clip(np.dstack(channels), 0, 1)
    small[..., :3] = np.where(small[..., 3:4] > 1e-4, small[..., :3] / np.maximum(small[..., 3:4], 1e-4), 0)
    return Image.fromarray(np.clip(np.rint(small * 255), 0, 255).astype(np.uint8), "RGBA")


def save(image: Image.Image, out: Path, name: str) -> dict:
    image.save(out / name, "WEBP", quality=QUALITY, method=6)
    return {"file": name, "size": list(image.size)}


def words(src: Path, out: Path, name: str) -> dict:
    rgba = lit(load(src / f"{name}.jpg"), SOLID)
    left, top, right, bottom = drawn(rgba)
    cut = rgba[top:bottom, left:right]
    # where the letters themselves stand in the picture (its glow and what falls from it reach further): the rows
    # with solid letter in them, as shares of its height; the game sizes the picture by them
    rows = np.flatnonzero((cut[..., 3] > 0.85).mean(axis=1) > 0.05)
    band = [round(float(rows[0]) / cut.shape[0], 4), round(float(rows[-1] + 1) / cut.shape[0], 4)]
    return {**save(sized(cut, (round(WORDS_HEIGHT * cut.shape[1] / cut.shape[0]), WORDS_HEIGHT)), out, f"{name}.webp"), "band": band}


def seal(src: Path, out: Path, lamp: str) -> dict:
    rgba = lit(load(src / f"seal-{lamp}.jpg"), SOLID)
    left, top, right, bottom = drawn(rgba, 0.03)
    # a square about what is drawn, so the seal's middle is the picture's
    half = max(right - left, bottom - top) // 2
    cx, cy = (left + right) // 2, (top + bottom) // 2
    h, w = rgba.shape[:2]
    square = np.zeros((2 * half, 2 * half, 4), dtype=np.float32)
    x0, y0, x1, y1 = max(0, cx - half), max(0, cy - half), min(w, cx + half), min(h, cy + half)
    square[y0 - (cy - half):y1 - (cy - half), x0 - (cx - half):x1 - (cx - half)] = rgba[y0:y1, x0:x1]
    return save(sized(square, (SEAL_PX, SEAL_PX)), out, f"seal-{lamp}.webp")


def edge_mask(n: int, soft: float = 0.07) -> np.ndarray:
    """1 inside a frame, falling to 0 at its edges over `soft` of its size."""
    d = (np.minimum(np.arange(n), np.arange(n)[::-1]) + 0.5) / n
    side = smoothstep(0, soft, d)
    return np.outer(side, side).astype(np.float32)[..., None]


def sheet(src: Path, out: Path, name: str, white: bool) -> dict:
    a = load(src / f"{name}.jpg")
    n = a.shape[0] // GRID
    frames = [a[r * n:(r + 1) * n, c * n:(c + 1) * n] * edge_mask(n) for r in range(GRID) for c in range(GRID)]
    energy = np.array([float(f.max(axis=2).sum()) for f in frames])
    last = int(np.nonzero(energy >= GONE * energy.max())[0].max())
    kept = frames[:min(len(frames), last + 2)]
    row = Image.new("RGBA", (len(kept) * CELL, CELL))
    for i, f in enumerate(kept):
        rgba = lit(f, LIGHT)
        if white:
            rgba[..., :3] = 1
        row.paste(sized(rgba, (CELL, CELL)), (i * CELL, 0))
    return {**save(row, out, f"{name}.webp"), "frames": len(kept)}


def cracks(src: Path, out: Path) -> dict:
    rgba = lit(load(src / "cracks.jpg"), SOLID)
    image = sized(rgba, (CRACKS_WIDTH, round(CRACKS_WIDTH * rgba.shape[0] / rgba.shape[1])))
    # thin bright lines on nothing: a lower quality shows no difference on the track and halves the file
    image.save(out / "cracks.webp", "WEBP", quality=CRACKS_QUALITY, method=6)
    return {"file": "cracks.webp", "size": list(image.size)}


def build(src: Path, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    index = {
        "words": {lamp: words(src, out, name) for lamp, name in WORDS.items()},
        "seals": {lamp: seal(src, out, lamp) for lamp in SEALS},
        "ring": sheet(src, out, "ring", True),
        "sparks": sheet(src, out, "sparks", False),
        "cracks": cracks(src, out),
    }
    (out / "index.json").write_text(json.dumps(index, indent=1) + "\n", encoding="utf-8")
    return index


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--src", type=Path, default=SRC)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    print(json.dumps(build(args.src, args.out), indent=1))
