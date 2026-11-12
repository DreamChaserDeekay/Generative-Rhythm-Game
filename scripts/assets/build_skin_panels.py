"""Builds the skins' deck panels from assets-src/gears/panels/<gear>.jpg into client/public/media/panels/<gear>.webp,
lists them in client/public/media/manifest.json as "<gear>/panel" (the manifest's other entries are kept; build_gears.py
keeps these too: they are not under gears/), and writes where each panel's display is to
client/src/render/deckPanels.json.

    python scripts/assets/build_skin_panels.py [--src DIR] [--out DIR] [gear ...]

A panel is the painting of a gear's lower part, under its row of keys: one picture from the image model
(scripts/assets/make_skin_panels.py; where each came from: assets-src/PROVENANCE.md), flat and seen from straight
above, 21:9, with a wide dark display in its top middle, a decorated wing at each side of it, an emblem under it and
the rest of the panel below. The game lays it across the deck from under the keys (client/src/render/deckArt.ts:
panelPainting) and writes the score and the speed on its display, so the build measures the display's glass in each
picture: the even, dark rectangle about the picture's top middle, as shares of the picture (left, top, right, bottom).
Needs Pillow and numpy.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "gears" / "panels"
MEDIA = ROOT / "client" / "public" / "media"
TABLE = ROOT / "client" / "src" / "render" / "deckPanels.json"
FOLDER = "panels"
#: px across of the game's pictures
WIDTH = 2048

GEARS = ["standard", "prism", "sky", "fire", "gpt", "gemini", "grok", "claude", "aqua", "steel", "rainbow", "noir", "magenta", "wire", "astral"]

#: where a panel's display is looked for: its middle (shares of the picture), and how much lighter than the glass's own
#: tone a pixel may be and still count as glass (a sheen across the glass is glass; its frame is lighter than that)
SEED = (0.5, 0.17)
EVEN = 0.1
#: a display measured by hand, where a picture's glass and its frame are too alike to tell apart
GLASS: dict[str, list[float]] = {
    # a sheen is drawn across the top of its glass: the measure starts under it
    "standard": [0.2646, 0.0392, 0.7354, 0.3065],
}
#: a row or column is glass where this share of it is
FULL = 0.9


def glass(image: Image.Image) -> list[float]:
    """The display's glass: the rectangle of even tone about SEED, grown a row or a column at a time while the new
    one is glass almost all the way along (its frame, a brighter or busier line, ends it)."""
    small = image.convert("L").resize((512, round(512 * image.height / image.width)), Image.LANCZOS)
    v = np.asarray(small, dtype=np.float32) / 255
    h, w = v.shape
    cx, cy = round(SEED[0] * w), round(SEED[1] * h)
    patch = v[cy - 12:cy + 13, cx - 60:cx + 61]
    # glass: as dark as its darker part, or of its middle tone (a sheen drawn across it is one or the other)
    ok = (v < float(np.percentile(patch, 20)) + EVEN) | (np.abs(v - float(np.median(patch))) < 0.075)
    x0, x1, y0, y1 = cx - 12, cx + 12, cy - 5, cy + 5
    grown = True
    while grown:
        grown = False
        if x0 > 0 and ok[y0:y1 + 1, x0 - 1].mean() >= FULL:
            x0, grown = x0 - 1, True
        if x1 < w - 1 and ok[y0:y1 + 1, x1 + 1].mean() >= FULL:
            x1, grown = x1 + 1, True
        if y0 > 0 and ok[y0 - 1, x0:x1 + 1].mean() >= FULL:
            y0, grown = y0 - 1, True
        if y1 < h - 1 and ok[y1 + 1, x0:x1 + 1].mean() >= FULL:
            y1, grown = y1 + 1, True
    # a px in from its edge: the frame's own shade
    return [round((x0 + 1.5) / w, 4), round((y0 + 1.5) / h, 4), round((x1 - 0.5) / w, 4), round((y1 - 0.5) / h, 4)]


def main() -> None:
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("--src", type=Path, default=SRC, help="where the pictures are (default: assets-src/gears/panels)")
    args.add_argument("--out", type=Path, default=None, help="write the pictures and the table here and leave the game alone")
    args.add_argument("gears", nargs="*", help="the gears to build (all of them when none is named)")
    opts = args.parse_args()
    out = opts.out or MEDIA
    table_file = (opts.out / "deckPanels.json") if opts.out else TABLE
    table: dict[str, dict] = json.loads(table_file.read_text(encoding="utf-8")) if table_file.exists() else {}
    textures: dict[str, dict] = {}
    for gear in opts.gears or GEARS:
        source = opts.src / f"{gear}.jpg"
        if not source.exists():
            print(f"{gear}: no picture")
            continue
        image = Image.open(source).convert("RGB")
        image = image.resize((WIDTH, round(WIDTH * image.height / image.width)), Image.LANCZOS)
        path = out / FOLDER / f"{gear}.webp"
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, "WEBP", quality=90, method=6)
        textures[f"{gear}/panel"] = {"file": f"{FOLDER}/{gear}.webp", "bundle": "gear", "size": [image.width, image.height]}
        table[gear] = {"size": [image.width, image.height], "glass": GLASS.get(gear) or glass(image)}
        print(f"{gear}: {path.stat().st_size // 1024} KB", table[gear])
    table_file.write_text(json.dumps({g: table[g] for g in GEARS if g in table}, indent=2) + "\n", encoding="utf-8")
    if opts.out:
        return
    manifest_file = MEDIA / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    manifest["textures"].update(textures)
    manifest["textures"] = dict(sorted(manifest["textures"].items()))
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
