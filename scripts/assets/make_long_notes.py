"""Makes the notes and long notes that were drawn in code again with the image model, as the concept sets' long notes are
(assets-src/styles/<set>/long.jpg): on one sheet the style's key tap and scratch tap along the top, and under them two
rails standing upright on black, the left one idle, the right one held, each closed at both ends by its own end: the
taps and the long note in one picture, so their material, colour and light agree. Each is drawn from the code's own picture of it (assets-src/styles/longs/
refs/<long>.jpg, made by design-mockups/note-skins/lab/refs.mjs: the code's taps and long note for a light grey
lane), sent with the prompt as the look to keep: the model raises its
finish, not its design. What comes back is kept in assets-src/styles/longs/_tries/ (not in the repository) with a
record of its prompt; the one picked is stored as assets-src/styles/longs/<long>.jpg and built into the game by
build_long_notes.py (the taps into media/notes/<note>.png, the long note into media/longs/<long>.png).

    GOOGLE_API_KEY=... python scripts/assets/make_long_notes.py make <long> [...]
    GOOGLE_API_KEY=... python scripts/assets/make_long_notes.py material <logo> [...]   (the AI companies' notes' inside)
    python scripts/assets/make_long_notes.py pick <long> <try number>

Nothing else is sent: no picture of another game and no logo. Each try costs money: it runs only for the names
given. Needs Pillow.
"""

from __future__ import annotations

import hashlib
import sys
import time
from pathlib import Path

from make_skin_fx import MODEL, generate

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets-src" / "styles" / "longs"
REFS = OUT / "refs"
TRIES = OUT / "_tries"
STORED = 1536

KEEP = (
    "The attached picture shows the notes of one skin of a commercial PC keyboard rhythm game, as the game draws them now in flat "
    "code-drawn graphics, for a lane whose colour is a light neutral grey. Top row: two TAP NOTES seen from above, the key lanes' "
    "note (left) and the scratch lane's note (right, the same note with its mark in the middle). Below: the skin's LONG NOTE twice, "
    "standing upright: idle (left) and held (right).\n\n"
    "Draw this same sheet again as production game art at the finish level of a top commercial rhythm game: the SAME design, with "
    "real material detail. Keep exactly: the layout (the two taps at the top, the two rails below them, each at the same place and "
    "size), every outline (the taps' corners, flames, cuts and ends; each rail's width and the shape of its two ends), every band, "
    "line, groove, bolt, stripe, star and mark and where it lies, and HOW BRIGHT EACH PART IS: match the grey value of every part of "
    "the attached picture (a light grey part stays light grey, a near-white line stays near white, a dark part stays dark), and keep "
    "it as opaque as shown: a part is see-through only where the picture shows the black through it. Add nothing: no rings, collars, "
    "caps, screws, marks or parts that are not in the picture. Only raise the finish: material texture, crisp bevels and edge "
    "highlights, subtle depth.\n\n"
)
RULES = (
    "\n\nRULES: Each tap's lower long edge is the edge that meets the judgement line: keep it perfectly straight, crisp and the "
    "brightest edge of the tap. The scratch tap keeps its mark exactly as shown, clear and readable. A long note is one continuous "
    "body only, with no tap note at either end: each end is closed by the body's own end, drawn the same at the top and the bottom. "
    "Along its whole length between its ends the body looks exactly the same, so any stretch of it repeats seamlessly: no gradient "
    "from top to bottom, no one-off details, any mark down it evenly spaced. The held long note is the same note, brighter, its "
    "inner light stronger. Colour: neutral greys and white only, with no hue at all, because the game tints everything with the "
    "lane colour; glowing parts are near white. Strictly orthographic, straight top-down, no perspective, every edge straight and "
    "level. Pure black background (#000000) around and between everything, no shadow cast onto it, no glow spreading onto the "
    "black beyond a thin rim. No text, letters, numbers, logos or watermarks."
)

#: each code-drawn long note: its skin, and what it is made of (the code's look, in words)
LONGS = {
    "solid": "the default skin: a plain, solid bar of glossy lacquer with a crisp bright rim down each long edge, lit from the left; held, a line of light glows down its middle",
    "prism": "the crystal skin: a long triangular prism of cut glass, a bright ridge line down its middle between a lit left facet and a shaded right facet, each end closed by the prism's own pointed end facet",
    "sky": "the sky skin: a soft, matte, half see-through pillow band with fully rounded ends, a pale soft rim down each edge and a soft white line down its middle, like a band of cloud",
    "fire": "the Firestarter skin: an opaque, solid bar of glossy hot lacquer, light grey, darker toward its two sides as a rounded bar is, a white-hot wire glowing down its middle, ends cut straight across with a thin bright rim",
    "aqua": "the aqua mecha skin: a rail of clear, wet, glossy water-glass with bright edges and a row of evenly spaced chevrons pointing down its middle, ends cut at 45-degree corners",
    "steel": "the gunmetal skin: a thick bar of brushed gunmetal with a deep dark groove down its middle and small round rivets evenly spaced down both sides, ends with slightly rounded corners",
    "noir": "the black-and-red skin: a hard-edged band between two bright edge lines, flat and graphic, small squares evenly spaced down its middle, ends cut at their corners",
    "wire": "the white-line skin: a hollow rail of light: two thin bright lines along its edges, the inside nearly see-through and dark, ends cut straight across by a thin line",
    "astral": "the starry-night skin: a deep night-sky band with tiny stars scattered over it and a small four-pointed star, a pale gold rim down each edge, ends cut at their corners",
    "chrome": "a mirror-polished chrome bar: bevels down both edges, the left lit and the right in half shade, a mirror face between them with a sharp bright reflection line, ends cut at their corners",
    "hairline": "a bar of brushed metal with fine hairline grain running along its length and a soft band of light down its left third, ends cut straight across",
    "glass": "a bar of clear glass: mostly see-through and dark in the middle, bright refracting edges along both sides and a faint inner line, ends with slightly rounded corners",
    "enamel": "a rod of deep glossy enamel: a crisp bright highlight down its left third, darker toward its right as it rounds over, ends fully rounded like a pill",
    "pearl": "a bar of soft satin pearl: pale, with a soft iridescent sheen down its left half, ends well rounded",
    "carbon": "a bar of woven carbon fibre under a clear coat: the twill weave along its length, a bright stripe down each edge and down its middle, ends cut straight across",
}


#: the AI companies' notes are each company's mark, its outline the build's own picture (client/public/stage/<logo>/
#: note.png), never sent: the model draws only a square of the material that fills it, in words
MATERIALS = {
    "gpt": "smooth satin porcelain, softly lit from the top-left: a broad soft highlight toward the top-left corner easing to a calm light grey, with a faint fine grain",
    "gemini": "glossy glass with a soft inner glow: a smooth gradient from near white at the top-left to light grey, with a few soft rounded light reflections",
    "grok": "polished metal, cool and sharp: light grey with crisp diagonal bands of reflection running from top-left to bottom-right",
    "claude": "warm handmade matte clay: an even light grey with a fine organic grain and the faintest brush texture, softly lit from the top-left",
}
MATERIAL = (
    "A seamless square material swatch for a game asset: the surface material of a small game note, filling the WHOLE image edge to "
    "edge with no border, no object, no shape and no background. The material: {material}. It is mostly light: light grey to white, "
    "with no area darker than mid grey, because the game fills a bright note with it and tints it with the lane colour. Neutral "
    "greys and white only, with no hue at all. Flat, straight-on view. No text, letters, numbers, logos or watermarks."
)


def material_prompt(logo: str) -> str:
    return MATERIAL.format(material=MATERIALS[logo])


def prompt_of(long: str) -> str:
    return f"{KEEP}THE SKIN AND ITS LONG NOTE: {LONGS[long]}. Its taps are of the same material.{RULES}"


def record() -> dict:
    import json

    file = TRIES / "record.json"
    return json.loads(file.read_text(encoding="utf-8")) if file.exists() else {}


def keep(rec: dict) -> None:
    import json

    (TRIES / "record.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")


def make_materials(logos: list[str]) -> None:
    TRIES.mkdir(parents=True, exist_ok=True)
    for logo in logos:
        prompt = material_prompt(logo)
        try:
            png, usage = generate(prompt)
        except Exception as e:
            print("failed:", logo, str(e)[:300])
            continue
        rec = record()
        n = 1 + max((int(k.rsplit("-", 1)[1]) for k in rec if k.startswith(f"{logo}-")), default=0)
        key = f"{logo}-{n}"
        (TRIES / f"{key}.png").write_bytes(png)
        rec[key] = {"model": MODEL, "aspect": "1:1", "size": "2K", "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"), "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage}
        keep(rec)
        print("made:", key, len(png), usage.get("totalTokenCount"))


def make(longs: list[str]) -> None:
    TRIES.mkdir(parents=True, exist_ok=True)
    for long in longs:
        ref = (REFS / f"{long}.jpg").read_bytes()
        prompt = prompt_of(long)
        try:
            png, usage = generate(prompt, ref)
        except Exception as e:  # one failing does not stop the others
            print("failed:", long, str(e)[:300])
            continue
        rec = record()
        n = 1 + max((int(k.rsplit("-", 1)[1]) for k in rec if k.startswith(f"{long}-")), default=0)
        key = f"{long}-{n}"
        (TRIES / f"{key}.png").write_bytes(png)
        rec[key] = {
            "model": MODEL, "aspect": "1:1", "size": "2K", "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
            "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
            "sent": {"file": f"refs/{long}.jpg", "sha256": hashlib.sha256(ref).hexdigest()},
        }
        keep(rec)
        print("made:", key, len(png), usage.get("totalTokenCount"))


def pick(long: str, n: int) -> None:
    from PIL import Image

    key = f"{long}-{n}"
    image = Image.open(TRIES / f"{key}.png").convert("RGB").resize((STORED, STORED), Image.LANCZOS)
    path = OUT / f"{long}.jpg"
    image.save(path, "JPEG", quality=95, subsampling=0)
    rec = record()
    for k, entry in rec.items():
        if k.startswith(f"{long}-"):
            entry["picked"] = k == key
    keep(rec)
    print("picked:", key, "->", path.relative_to(ROOT), path.stat().st_size)


def main() -> None:
    args = sys.argv[1:]
    if len(args) >= 2 and args[0] == "make" and all(a in LONGS for a in args[1:]):
        make(args[1:])
    elif len(args) >= 2 and args[0] == "material" and all(a in MATERIALS for a in args[1:]):
        make_materials(args[1:])
    elif len(args) == 3 and args[0] == "pick" and (args[1] in LONGS or args[1] in MATERIALS):
        pick(args[1], int(args[2]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
