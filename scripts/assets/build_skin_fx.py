"""Builds the skins' hit effects from assets-src/styles/skinfx/ into client/public/media/fx/ and lists them in
client/public/media/manifest.json as "<hit>/hitBurst" and "<hit>/hitHold" (the manifest's other entries are kept;
build_styles.py keeps these too: they are not under styles/).

    python scripts/assets/build_skin_fx.py [--src DIR] [--out DIR] [hit ...]

Each source is one picture from the image model (scripts/assets/make_skin_fx.py; where each came from:
assets-src/PROVENANCE.md): the frame-by-frame animation of the effect, 16 frames in a 4 x 4 grid on black, read row by
row. `<hit>_burst.jpg` is the hit (played once), `<hit>_hold.jpg` the light while a long note is held (a loop). They are
light in colours of their own: the game adds them to the screen as they are ("plain" in the manifest), except BASIC
(the default skin's FLASH; "flash/..." in the manifest is build_styles.py's older sheet), which is white light the
game colours with the lane's colour.

What is done to a sheet: its black is made black (the model's is not quite, and JPEG adds noise), every frame fades out
toward the edges of its cell (a ray that reaches the edge would end in a straight line), the frames after the effect
has gone are dropped, and so is a first frame that is next to nothing (the flash is there the moment the key goes
down). A hit lasts BURST_SECONDS whatever its number of frames. The layouts written here are read by
client/src/render/skinArt.ts and styleArt.ts: change them together.
Needs Pillow and numpy.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "styles" / "skinfx"
MEDIA = ROOT / "client" / "public" / "media"
FOLDER = "fx"

GRID = 4
#: px of one frame in the game's sheets
BURST_CELL = 384
HOLD_CELL = 256
#: how long a hit plays (the user's rule: under 0.4 s)
BURST_SECONDS = 0.32
HOLD_FPS = 24
#: a hit's frames end where its light falls under this share of its brightest frame's
GONE = 0.03
#: a first frame fainter than this share of the brightest is left out
FAINT_START = 0.12
#: a hold's frame fainter than this share of their median is left out of the loop
HOLD_FAINT = 0.55

#: hit (the name in the manifest and HitStyle) -> its numbers: `grey` (white light, coloured by the game), `span`
#: (how much larger a frame is than the effect at its brightest: the game draws the effect 2.5 lanes wide times this),
#: `anchor` (where the judge line crosses a frame, 0 its bottom .. 1 its top), `hold_span`
HITS: dict[str, dict] = {
    "basic": {"grey": True},
    "prism": {},
    "sky": {},
    "fire": {},
    "gpt": {},
    "gemini": {},
    "grok": {},
    "claude": {},
    "aqua": {},
    "steel": {},
    "rainbow": {},
    # its light is thin (slices and pixels): drawn larger than its measure says
    "noir": {"span": 1.2},
    "magenta": {},
    "wire": {},
    "astral": {},
}


def smoothstep(lo: float, hi: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def load(path: Path) -> np.ndarray:
    """RGB as float32 in 0..1."""
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255


def clean(a: np.ndarray) -> np.ndarray:
    """The sheet with its black made black: what is darker than a faint glow is noise."""
    v = a.max(axis=2)
    return a * smoothstep(0.025, 0.085, v)[..., None]


def frames_of(a: np.ndarray) -> list[np.ndarray]:
    n = a.shape[0] // GRID
    m = a.shape[1] // GRID
    return [a[r * n:(r + 1) * n, c * m:(c + 1) * m] for r in range(GRID) for c in range(GRID)]


def edge_mask(n: int, soft: float = 0.07) -> np.ndarray:
    """1 inside a frame, falling to 0 at its edges over `soft` of its size."""
    d = (np.minimum(np.arange(n), np.arange(n)[::-1]) + 0.5) / n
    side = smoothstep(0, soft, d)
    return np.outer(side, side).astype(np.float32)[..., None]


def energy(frame: np.ndarray) -> float:
    return float(frame.max(axis=2).sum())


def reach(frame: np.ndarray, share: float = 0.9) -> float:
    """The radius about the frame's middle that holds `share` of its light, per half frame."""
    n = frame.shape[0]
    v = frame.max(axis=2)
    ys, xs = np.mgrid[0:n, 0:n]
    r = np.hypot(xs - (n - 1) / 2, ys - (n - 1) / 2).ravel()
    order = np.argsort(r)
    total = np.cumsum(v.ravel()[order])
    if total[-1] <= 0:
        return 0
    return float(r[order][np.searchsorted(total, share * total[-1])] / (n / 2))


def resize(frame: np.ndarray, cell: int) -> np.ndarray:
    im = Image.fromarray(np.clip(np.rint(frame * 255), 0, 255).astype(np.uint8), "RGB")
    return np.asarray(im.resize((cell, cell), Image.LANCZOS), dtype=np.float32) / 255


def sheet_of(frames: list[np.ndarray], cell: int, grey: bool) -> Image.Image:
    sheet = np.zeros((GRID * cell, GRID * cell, 3), dtype=np.float32)
    for i, f in enumerate(frames):
        small = resize(f, cell)
        if grey:
            small = np.repeat(small.max(axis=2, keepdims=True), 3, axis=2)
        r, c = divmod(i, GRID)
        sheet[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = small
    return Image.fromarray(np.clip(np.rint(sheet * 255), 0, 255).astype(np.uint8), "RGB")


def burst(name: str, spec: dict, src: Path) -> tuple[Image.Image, dict, dict]:
    frames = [f * edge_mask(f.shape[0]) for f in frames_of(clean(load(src / f"{name}_burst.jpg")))]
    e = np.array([energy(f) for f in frames])
    peak = float(e.max())
    last = int(np.nonzero(e >= GONE * peak)[0].max())
    first = 1 if e[0] < FAINT_START * peak else 0
    kept = frames[first:min(len(frames), last + 2)]
    # how far its light reaches when it is brightest: the game sizes the frame so that this is four fifths of a lane
    # (the game draws a hit's frame 2.5 lanes wide times its span)
    bright = max(reach(f) for f, x in zip(frames, e) if x >= 0.6 * peak)
    span = spec.get("span", round(float(np.clip(0.64 / max(bright, 0.3), 0.75, 1.6)), 2))
    count = len(kept)
    entry = {
        "file": f"{FOLDER}/{name}_burst.webp",
        "bundle": "effects",
        "size": [GRID * BURST_CELL, GRID * BURST_CELL],
        "flipbook": {"cols": GRID, "rows": GRID, "frames": count, "fps": round(count / BURST_SECONDS, 1), "loop": False},
        "anchorY": spec.get("anchor", 0.5),
        "span": span,
    }
    if not spec.get("grey"):
        entry["plain"] = True
    info = {"frames": count, "first": first, "last": last, "reach": round(bright, 3), "span": span}
    return sheet_of(kept, BURST_CELL, bool(spec.get("grey"))), entry, info


def hold(name: str, spec: dict, src: Path) -> tuple[Image.Image, dict, dict]:
    frames = [f * edge_mask(f.shape[0]) for f in frames_of(clean(load(src / f"{name}_hold.jpg")))]
    e = np.array([energy(f) for f in frames])
    # a loop has no start and no end: a frame the model let die away (its last ones) or begin small (its first) is left out
    lit = e >= HOLD_FAINT * float(np.median(e))
    frames, e = [f for f, keep in zip(frames, lit) if keep], e[lit]
    count = len(frames)
    # as bright as each other: a loop that pulses with the model's uneven hand reads as a stutter
    mean = float(e.mean())
    frames = [np.clip(f * float(np.clip(mean / max(x, 1e-6), 0.8, 1.25)), 0, 1) for f, x in zip(frames, e)]
    bright = float(np.median([reach(f) for f in frames]))
    # its light about half a lane from the line's middle (the game draws a hold's frame 2.9 lanes wide times its span)
    span = spec.get("hold_span", round(float(np.clip(0.36 / max(bright, 0.2), 0.6, 1.4)), 2))
    entry = {
        "file": f"{FOLDER}/{name}_hold.webp",
        "bundle": "effects",
        "size": [GRID * HOLD_CELL, GRID * HOLD_CELL],
        "flipbook": {"cols": GRID, "rows": GRID, "frames": count, "fps": HOLD_FPS, "loop": True},
        "anchorY": spec.get("anchor", 0.5),
        "span": span,
        "cored": True,
    }
    if not spec.get("grey"):
        entry["plain"] = True
    info = {"frames": count, "reach": round(bright, 3), "span": span}
    return sheet_of(frames, HOLD_CELL, bool(spec.get("grey"))), entry, info


def main() -> None:
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("--src", type=Path, default=SRC, help="where the sheets are (default: assets-src/styles/skinfx)")
    args.add_argument("--out", type=Path, default=None, help="write the sheets here and leave the game's media alone")
    args.add_argument("hits", nargs="*", help="the hits to build (all of them when none is named)")
    opts = args.parse_args()
    out = opts.out or MEDIA
    textures: dict[str, dict] = {}
    for name in opts.hits or list(HITS):
        spec = HITS[name]
        for kind, make in (("burst", burst), ("hold", hold)):
            if not (opts.src / f"{name}_{kind}.jpg").exists():
                print(f"{name}: no {kind} sheet")
                continue
            image, entry, info = make(name, spec, opts.src)
            path = out / entry["file"]
            path.parent.mkdir(parents=True, exist_ok=True)
            image.save(path, "WEBP", quality=90, method=6)
            textures[f"{name}/hit{'Burst' if kind == 'burst' else 'Hold'}"] = entry
            print(f"{name} {kind}: {path.stat().st_size // 1024} KB", info)
    if opts.out:
        (opts.out / "skinfx.json").write_text(json.dumps(textures, indent=2), encoding="utf-8")
        return
    manifest_file = MEDIA / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    manifest["textures"].update(textures)
    manifest["textures"] = dict(sorted(manifest["textures"].items()))
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
