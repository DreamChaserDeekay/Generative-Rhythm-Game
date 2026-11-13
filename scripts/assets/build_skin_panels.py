"""Builds the skins' deck panels from assets-src/gears/panels/<gear>.jpg into client/public/media/panels/<gear>.webp,
lists them in client/public/media/manifest.json as "<gear>/panel" (the manifest's other entries are kept; build_gears.py
keeps these too: they are not under gears/), and writes each panel's size to client/src/render/deckPanels.json.

    python scripts/assets/build_skin_panels.py [--src DIR] [--out DIR] [gear ...]

A panel is the painting of a gear's lower part, under its row of keys: one picture, flat, as wide as the deck. It was
painted by the image model as the game's own camera sees that part of the screen and laid flat again
(scripts/assets/deck_panels; where each came from: assets-src/PROVENANCE.md and the record beside each picture,
assets-src/gears/panels/<gear>.json). The game lays it across the deck from under the keys down to the screen's bottom
edge (client/src/render/deckArt.ts: panelSpan, panelPainting).

None of these pictures has a display: the score, the best combo and the speed are written beside the gear, not on it,
so the table holds each picture's size and nothing else. A picture that does have a display for them is given its
glass by hand in GLASS (shares of the picture: left, top, right, bottom), and the game writes them on it again
(deckArt.ts: deckReadouts). Needs Pillow.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "gears" / "panels"
MEDIA = ROOT / "client" / "public" / "media"
TABLE = ROOT / "client" / "src" / "render" / "deckPanels.json"
FOLDER = "panels"
#: px across of the game's pictures
WIDTH = 2048

GEARS = ["standard", "prism", "sky", "fire", "gpt", "gemini", "grok", "claude", "aqua", "steel", "noir", "wire", "astral"]

#: the glass of a panel's display, for a picture that has one (none does)
GLASS: dict[str, list[float]] = {}


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
        if image.width != WIDTH:
            image = image.resize((WIDTH, round(WIDTH * image.height / image.width)), Image.LANCZOS)
        path = out / FOLDER / f"{gear}.webp"
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, "WEBP", quality=90, method=6)
        textures[f"{gear}/panel"] = {"file": f"{FOLDER}/{gear}.webp", "bundle": "gear", "size": [image.width, image.height]}
        table[gear] = {"size": [image.width, image.height], **({"glass": GLASS[gear]} if gear in GLASS else {})}
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
