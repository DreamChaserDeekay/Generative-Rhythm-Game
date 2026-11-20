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
down). The sheet is then measured as the game played it until 2026-11-20 (in BURST_SECONDS whatever its number of
frames, from the first frame about as bright as its brightest, each frame mixed with the next: flipbook_light.py),
and what the game gets is not the sheet but still layers cut from one frame of it (server/rhythm_server/fx_layers.py), which the game
moves on every frame of the screen (client/src/render/layerFx.ts; a sheet of 9 to 12 frames looked "about 30 fps"):

  - the hit: the layers of its first frame, the specks of a frame past its middle (the sparkles many sheets break
    into; CLAUDE has a body instead), and in the manifest's "layers" how its light fell ("light", every
    LIGHT_STEP_MS; the shape's: without the specks, never rising again), how the white in its middle went ("core"),
    and how far the middle of its light spread ("grow", against "reach", where it started); "tone", the colour of its
    light, for the flash on the judge line;
  - the light while a note is held: the layers of its frame of median light, and how it moves (HITS: "turn", "axis").

The layouts written here are read by client/src/render/skinArt.ts, styleArt.ts and layerFx.ts: change them together.
Needs Pillow, numpy and scipy.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from flipbook_light import frame_light, measure

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server"))
from rhythm_server.fx_layers import COLS, ROWS, atlas, late_frame, measure_burst, reach, specks, split  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "styles" / "skinfx"
MEDIA = ROOT / "client" / "public" / "media"
FOLDER = "fx"

GRID = 4
#: px of one layer in the game's atlases (a frame of the sheets as they were played)
BURST_CELL = 384
HOLD_CELL = 256
#: how long a hit's sheet played, whatever its number of frames: as long as sixteen frames at 60 a second, as the older
#: hits' sheets (build_styles.py) do (the user's rule: under 0.4 s). The model draws a hit's fade in 8 to 12 frames of
#: the 16 it is asked for, so a sheet held 30 to 45 frames a second. Its light is measured over this time.
BURST_SECONDS = 16 / 60
#: a hit's frames end where its light falls under this share of its brightest frame's
GONE = 0.03
#: a first frame fainter than this share of the brightest is left out
FAINT_START = 0.12
#: a hold's frame fainter than this share of their median is left out of the loop
HOLD_FAINT = 0.55


#: hit (the name in the manifest and HitStyle) -> its numbers: `grey` (white light, coloured by the game), `span`
#: (how much larger a frame is than the effect at its brightest: the game draws the effect 2.5 lanes wide times this),
#: `anchor` (where the judge line crosses a frame, 0 its bottom .. 1 its top), `hold_span`, and how its layers move
#: (layerFx.ts): `body` (a solid middle that parts into spokes), `axis` ("x": it grows along its width only),
#: `turn` (how fast its hold turns, radians a second; 0: it flickers in place)
HITS: dict[str, dict] = {
    "basic": {"grey": True, "turn": 0.9},
    "prism": {"turn": 0.6},
    # a flame: it does not turn
    "sky": {"turn": 0},
    "fire": {"turn": 0.9},
    "gpt": {"turn": 0.5},
    "gemini": {"turn": 0.6},
    "grok": {"turn": 0.7},
    "claude": {"body": True, "turn": 0.9},
    "aqua": {"turn": 0.5},
    "steel": {"turn": 0.6},
    # its light is thin (slices and pixels): drawn larger than its measure says; slices grow sideways, never turn
    "noir": {"span": 1.2, "axis": "x", "turn": 0},
    "wire": {"turn": 0.7},
    "astral": {"turn": 1.2},
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
    # the sheet as it was played: where it started and how its light fell (and its colour, for the judge line's flash)
    sheet = sheet_of(kept, BURST_CELL, bool(spec.get("grey")))
    book = {"cols": GRID, "rows": GRID, "frames": count, "fps": round(count / BURST_SECONDS, 1), "loop": False}
    played = {"flipbook": book, "plain": not spec.get("grey")}
    measure(played, sheet)
    start = played["flipbook"]["peak"]
    went = measure_burst(kept, start, frame_light(sheet, GRID, GRID, count), BURST_SECONDS)
    layers = split(resize(kept[start], BURST_CELL), body=bool(spec.get("body")))
    if not spec.get("body"):
        # the specks of a frame past the middle of the hit (where many sheets break into sparkles)
        layers["body"] = specks(resize(kept[late_frame(start, count)], BURST_CELL))
    entry = {
        "file": f"{FOLDER}/{name}_burst.webp",
        "bundle": "effects",
        "size": [COLS * BURST_CELL, ROWS * BURST_CELL],
        "layers": {"cols": COLS, "rows": ROWS, **went, **layer_options(spec, layers)},
        "anchorY": spec.get("anchor", 0.5),
        "span": span,
    }
    if not spec.get("grey"):
        entry["plain"] = True
        entry["tone"] = played["tone"]
    info = {"frames": count, "start": start, "reach": round(bright, 3), "span": span, "grow": went["grow"], "light": went["light"][:8]}
    return atlas(layers, BURST_CELL, bool(spec.get("grey"))), entry, info, layers


def layer_options(spec: dict, layers: dict, hit: bool = True) -> dict:
    out = {}
    if spec.get("axis"):
        out["axis"] = spec["axis"]
    if spec.get("body") and layers["body"].max() > 0:
        out["body"] = True
    elif hit and layers["body"].max(axis=2).sum() > 30:
        out["late"] = True
    return out


def hold(name: str, spec: dict, src: Path, burst_sparks: dict | None = None) -> tuple[Image.Image, dict, dict]:
    frames = [f * edge_mask(f.shape[0]) for f in frames_of(clean(load(src / f"{name}_hold.jpg")))]
    e = np.array([energy(f) for f in frames])
    # a loop has no start and no end: a frame the model let die away (its last ones) or begin small (its first) is left out
    lit = e >= HOLD_FAINT * float(np.median(e))
    frames, e = [f for f, keep in zip(frames, lit) if keep], e[lit]
    bright = float(np.median([reach(f) for f in frames]))
    # its light about half a lane from the line's middle (the game draws a hold's frame 2.9 lanes wide times its span)
    span = spec.get("hold_span", round(float(np.clip(0.36 / max(bright, 0.2), 0.6, 1.4)), 2))
    # the layers of its frame of median light (the loop's look; the game turns and breathes it)
    pick = int(np.argsort(e)[len(e) // 2])
    layers = split(frames[pick], body=bool(spec.get("body")))
    # a hold with few specks of its own flies its hit's
    if burst_sparks is not None and layers["sparks"].max(axis=2).sum() < 0.3 * burst_sparks["sparks"].max(axis=2).sum():
        layers["sparks"] = burst_sparks["sparks"]
        layers["order"][..., 2] = burst_sparks["order"][..., 2]
    entry = {
        "file": f"{FOLDER}/{name}_hold.webp",
        "bundle": "effects",
        "size": [COLS * HOLD_CELL, ROWS * HOLD_CELL],
        "layers": {"cols": COLS, "rows": ROWS, "turn": spec.get("turn", 0.9), **layer_options(spec, layers, hit=False)},
        "anchorY": spec.get("anchor", 0.5),
        "span": span,
        "cored": True,
    }
    if not spec.get("grey"):
        entry["plain"] = True
    info = {"frame": pick, "reach": round(bright, 3), "span": span}
    return atlas(layers, HOLD_CELL, bool(spec.get("grey"))), entry, info


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
        made = {}
        for kind in ("burst", "hold"):
            if not (opts.src / f"{name}_{kind}.jpg").exists():
                print(f"{name}: no {kind} sheet")
                continue
            if kind == "burst":
                image, entry, info, made = burst(name, spec, opts.src)
            else:
                image, entry, info = hold(name, spec, opts.src, made or None)
            path = out / entry["file"]
            path.parent.mkdir(parents=True, exist_ok=True)
            # lossless: the order cell's three channels are three maps (lossy WebP would blur them into each other)
            image.save(path, "WEBP", lossless=True, method=6)
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
