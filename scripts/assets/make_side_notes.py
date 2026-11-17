"""Makes the side notes laid over half the keys (설정 → 노트 → 사이드 노트) again with the image model, as the notes
were (make_long_notes.py): each drawn from the code's own picture of it (assets-src/styles/side/refs/<side>.jpg, made by
design-mockups/note-skins/lab/siderefs.mjs), sent with the prompt as the look to keep: the model raises its finish,
not its design. 'bar': the see-through tap laid over the keys and a stretch of its long note closed by its end bands;
'dots': an LED panel's dot, lit and dim (the game lays the dots out itself, as many as the key lanes take). What comes
back is kept in assets-src/styles/side/_tries/ (not in the repository) with a record of its prompt; the one picked is
stored as assets-src/styles/side/<side>.jpg and built into the game by build_side_notes.py.

    GOOGLE_API_KEY=... python scripts/assets/make_side_notes.py make bar|dots
    python scripts/assets/make_side_notes.py pick bar|dots <try number>

Nothing else is sent: no picture of another game and no logo. Each try costs money: it runs only for the name given.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

from make_skin_fx import MODEL, generate

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets-src" / "styles" / "side"
REFS = OUT / "refs"
TRIES = OUT / "_tries"
STORED = 1536

COMMON = (
    "\n\nColour: neutral greys and white only, with no hue at all, because the game tints everything with the lane colour; "
    "glowing parts are near white. Strictly orthographic, straight top-down, no perspective, every edge straight and level. "
    "Pure black background (#000000) around everything, no shadow cast onto it, no glow spreading onto the black beyond a "
    "thin rim. No text, letters, numbers, logos or watermarks."
)
SIDES = {
    "bar": (
        "The attached picture shows the SIDE NOTE of a commercial PC keyboard rhythm game, as the game draws it now in flat "
        "code-drawn graphics, for a lane whose colour is a light neutral grey. It is a wide, flat bar laid OVER the key lanes, "
        "so the key notes under it must stay readable: it is a see-through panel. Top: the side note's tap: a translucent bar "
        "with a bright band along its top edge and along its bottom edge and bright short ends, the middle between the bands "
        "half see-through (shown mid grey). Below: a stretch of the side note's long note: a bright end band at its top and at "
        "its bottom, between them the body, mostly see-through (shown dark grey) with a thin bright line down each side.\n\n"
        "Draw this same sheet again as production game art at the finish level of a top commercial rhythm game: the SAME "
        "design, a panel of clear tinted acrylic light. Keep exactly: the layout, every part's place and size, the thickness "
        "of the bright bands and lines, and HOW BRIGHT EACH PART IS: the see-through parts stay as dark as shown (they let "
        "the notes under them show), the bands as bright as shown. Add nothing: no parts, marks, rivets or patterns that are "
        "not in the picture. Only raise the finish: crisp polished edges on the bright bands, a faint glassy sheen and the "
        "subtlest texture in the see-through parts. Along the long note's body, between its end bands, everything looks the "
        "same from top to bottom (it repeats seamlessly). The tap's bottom edge meets the judgement line: keep it perfectly "
        "straight and crisp."
    ),
    "dots": (
        "The attached picture shows the dots of an LED dot-matrix panel, as a commercial PC keyboard rhythm game draws them "
        "now in flat code-drawn graphics, for a lane whose colour is a light neutral grey: its side notes are rows of these "
        "dots laid over the key lanes. Top row: six LED dots lit (bright). Bottom row: six LED dots dim (unlit, faint).\n\n"
        "Draw this same sheet again as production game art at the finish level of a top commercial rhythm game: the SAME "
        "layout, each dot at the same place and size, perfectly round. Make each a real LED dot seen straight on: a small "
        "domed lens with a crisp rim, the lit ones glowing near white in the middle with a tight soft glow just round the "
        "lens, the dim ones a dark, faintly visible lens with a small glint. All six of a row alike. Keep how bright each row "
        "is: the lit row bright, the dim row faint. Add nothing: no panel, grid lines or housing between the dots; the black "
        "between them stays black."
    ),
}


def prompt_of(side: str) -> str:
    return SIDES[side] + COMMON


def record() -> dict:
    file = TRIES / "record.json"
    return json.loads(file.read_text(encoding="utf-8")) if file.exists() else {}


def keep(rec: dict) -> None:
    (TRIES / "record.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")


def make(side: str) -> None:
    TRIES.mkdir(parents=True, exist_ok=True)
    ref = (REFS / f"{side}.jpg").read_bytes()
    prompt = prompt_of(side)
    png, usage = generate(prompt, ref)
    rec = record()
    n = 1 + max((int(k.rsplit("-", 1)[1]) for k in rec if k.startswith(f"{side}-")), default=0)
    key = f"{side}-{n}"
    (TRIES / f"{key}.png").write_bytes(png)
    rec[key] = {
        "model": MODEL, "aspect": "1:1", "size": "2K", "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
        "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
        "sent": {"file": f"refs/{side}.jpg", "sha256": hashlib.sha256(ref).hexdigest()},
    }
    keep(rec)
    print("made:", key, len(png), usage.get("totalTokenCount"))


def pick(side: str, n: int) -> None:
    from PIL import Image

    key = f"{side}-{n}"
    image = Image.open(TRIES / f"{key}.png").convert("RGB").resize((STORED, STORED), Image.LANCZOS)
    path = OUT / f"{side}.jpg"
    image.save(path, "JPEG", quality=95, subsampling=0)
    rec = record()
    for k, entry in rec.items():
        if k.startswith(f"{side}-"):
            entry["picked"] = k == key
    keep(rec)
    print("picked:", key, "->", path.relative_to(ROOT), path.stat().st_size)


def main() -> None:
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "make" and args[1] in SIDES:
        make(args[1])
    elif len(args) == 3 and args[0] == "pick" and args[1] in SIDES:
        pick(args[1], int(args[2]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
