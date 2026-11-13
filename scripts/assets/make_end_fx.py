"""Makes the pictures of a play's end with the image model: the lettering of the lamps that show their words (MAX
COMBO, PERFECT PLAY, FAILED), the seal of each clear lamp (shown without a word), the frame-by-frame sheets of the
shockwave that runs out from a seal as it is stamped and of the sparks where a hard clear's two halves close, and
the cracks that run over the lanes of a play that fails halfway. What comes back is kept in assets-src/end/_tries/
(not in the repository) with a record of its prompt; the one picked is stored as assets-src/end/<name>.jpg and built
into the game's pictures by build_end_fx.py.

    GOOGLE_API_KEY=... python scripts/assets/make_end_fx.py make <name> [...]      # e.g. make words-perfect seal-clear
    python scripts/assets/make_end_fx.py pick <name> <try number>
    python scripts/assets/make_end_fx.py names

Nothing is sent with the prompts: no picture of another game and no logo; everything is described in words. Each try
costs money: it runs only for the names given (several at once, a few at a time). Needs Pillow for `pick`.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets-src" / "end"
TRIES = OUT / "_tries"
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"
#: the picked pictures are stored with their longer side this long, as JPEG to keep the repository small
STORED = 2048
#: how many requests run at once (the model's quota is by the minute)
AT_ONCE = 4

# ---------- the lamps' words ----------

WORDS_HEAD = (
    "Game UI art for a commercial PC rhythm game: the lettering that appears in the middle of the screen when a song ends, at the "
    "finish level of a top commercial arcade rhythm game's result banners (crisp, luxurious, high-energy).\n\n"
)
WORDS_FORM = (
    "LETTERING: heavy, wide sans-serif capitals with sharp chamfered corners, slanted forward about 10 degrees, tightly spaced, all "
    "the same height on a perfectly even baseline. Each letter is a solid three-dimensional body with a crisp bevelled edge; its "
    "front face is bright and evenly lit (never dark, never hollow, never an outline only).\n\n"
)
WORDS_TAIL = (
    "\n\nBACKGROUND AND LAYOUT: pure black (#000000) everywhere. The words are centred, perfectly horizontal, seen flat from the "
    "front with no perspective, and fill about 80% of the picture's width with black margin on every side; nothing touches the "
    "picture's edges. Nothing else is in the picture: no frame, no plate, no ribbon, no underline, no ground, no reflection, no "
    "characters, no icons, no second line of text, no small print, no watermark."
)
WORDS = {
    "words-perfect": (
        "PERFECT PLAY", "P-E-R-F-E-C-T, a space, P-L-A-Y",
        "MATERIAL AND COLOUR: cut crystal lit from inside, icy cyan (#7cf7ff) with white-hot highlights, and fine prismatic "
        "glints (a thin spectrum of colours) along the bevels as on a cut diamond. A thin streak of white light crosses the whole "
        "word, a soft cyan glow surrounds it, and a few tiny four-point sparkles sit on its corners.",
    ),
    "words-maxcombo": (
        "MAX COMBO", "M-A-X, a space, C-O-M-B-O",
        "MATERIAL AND COLOUR: polished gold lit from inside, pale warm gold (#ffe7a3) with white highlights and a little amber "
        "depth in the bevels only. A thin streak of white light crosses the whole word, a soft golden glow surrounds it, and a few "
        "tiny four-point sparkles sit on its corners.",
    ),
    "words-failed": (
        "FAILED", "F-A-I-L-E-D",
        "MATERIAL AND COLOUR: red-hot signal red (#ff2e2e) with brighter orange-white light where it is broken. The letters are "
        "BROKEN: cracks run through every one of them, some chunks are split off and sit slightly displaced or tilted, a corner "
        "is missing here and there, and a few small shards and embers fall below the word. Heavy and defeated: no sparkles, no "
        "streak of light, only a dim red glow around it. The word must still read at a glance.",
    ),
}


def words_prompt(name: str) -> str:
    text, spelled, look = WORDS[name]
    return (
        f"{WORDS_HEAD}THE WORDS: exactly \"{text}\" on ONE line, all capitals, spelled {spelled}. Nothing else is written anywhere "
        f"in the picture.\n\n{WORDS_FORM}{look}{WORDS_TAIL}"
    )


# ---------- the clear lamps' seals ----------

SEAL_HEAD = (
    "Game UI art for a commercial PC rhythm game: a CLEAR SEAL, the emblem that is stamped onto the screen when the player clears a "
    "song, at the finish level of a top commercial arcade rhythm game. ONE emblem seen perfectly flat from the front, centred, "
    "filling about 70% of the square picture, on pure black (#000000): everything round the emblem, out to the four corners of the "
    "picture, is black.\n\n"
)
SEAL_TAIL = (
    "\n\nIt is made of polished crystal glass and metal lit from inside: bright faces with crisp bevels, a white rim light, thin "
    "engraved lines, and a soft glow of its own colour around it. Nothing on it is dark except the thin engraved lines and the "
    "gaps between its rings, which are black. Perfectly symmetric left to right and top to bottom. NO letters, NO numbers, NO text "
    "and NO signs of any alphabet anywhere on it. No ribbon, no laurel, no star, no crown, no wings, no gem, no characters, no "
    "hands, no ground, no reflection, no second emblem."
)
ROUND = (
    "SHAPE: a ROUND medal. From the outside in: a thin outer ring carrying fine, evenly spaced engraved tick marks all the way "
    "round; a black gap; a thick bevelled ring; a black gap; and in the very centre the emblem's mark: "
)
SQUARE = (
    "SHAPE: a SQUARE medal with sharp right-angled corners (not round, not a diamond: its edges are horizontal and vertical). From "
    "the outside in: a thin outer square frame carrying fine, evenly spaced engraved tick marks all the way round; a black gap; a "
    "thick bevelled square frame; a black gap; and in the very centre the emblem's mark: "
)
SEALS = {
    "seal-clear": ROUND + "a solid, slightly domed, glowing DISC (a filled circle).\n\nCOLOUR: azure blue (#3d9bff) with white highlights.",
    "seal-easy": ROUND + "a circle whose RIGHT HALF is solid and glowing and whose LEFT HALF is empty (black inside its thin outline), "
                 "split by a straight vertical line, like a half moon.\n\nCOLOUR: fresh light green (#b6e36f) with white highlights.",
    "seal-assist": ROUND + "a circle of which only the TOP-RIGHT QUARTER is solid and glowing (a pie slice from twelve o'clock to "
                   "three o'clock); the other three quarters are empty (black inside the circle's thin outline).\n\nCOLOUR: violet "
                   "(#8c7dff) with white highlights.",
    "seal-hard": SQUARE + "a solid, slightly domed, glowing SQUARE.\n\nCOLOUR: brilliant white and bright silver, with only a faint "
                 "cool blue in its shading.",
    "seal-exhard": SQUARE + "a smaller solid glowing SQUARE set inside one more thin square frame of its own, and a small bevelled stud "
                   "at each of the medal's four corners.\n\nCOLOUR: electric yellow (#f2f550) with white highlights and a little gold "
                   "in its shading.",
}

# ---------- the sheets: an animation frame by frame ----------

SHEET_HEAD = (
    "A sprite sheet for a game VFX artist: the frame-by-frame animation of ONE effect for a commercial PC rhythm game, at the "
    "finish level of a top commercial action game's hand-painted VFX flipbooks.\n\n"
    "LAYOUT: exactly 16 frames in a 4 x 4 grid of equal square cells, read left to right, top to bottom (frame 1 top-left, frame 16 "
    "bottom-right). Pure black background (#000000) everywhere. NO grid lines, NO borders, NO frame numbers, NO text. The effect is "
    "centred on the same point in every cell and stays inside its cell with black space around it; nothing touches a cell edge.\n\n"
)
SHEET_TAIL = (
    "\n\nEvery frame is a different drawing of the same event a moment later: shapes change, break up and travel outward, they are "
    "not one picture scaled up. Painterly, energetic, with sharp bright edges and soft glow. It is light only, on black, to be added "
    "onto the screen. No ground, no objects, no characters, no logos, no letters, no numbers."
)
BEATS = ["frames 1-2", "frames 3-5", "frames 6-10", "frames 11-14", "frames 15-16"]
SHEETS = {
    "ring": (
        "the SHOCKWAVE of a heavy seal being stamped down at the centre of the cell, seen flat from the front. The seal itself is NOT "
        "drawn: only the ring of force and light that runs out from where it lands. Every element is white and grey light only, with "
        "no colour at all, because the game colours it itself.",
        ["a small blinding round flash at the centre with a thin bright ring just leaving it;",
         "the ring is a thick, bright, perfectly circular shockwave running outward fast, with short radial streaks and specks of dust thrown ahead of it;",
         "the ring has grown to most of the cell and is thinner, it breaks into separate arcs, a second, fainter, thinner ring follows it inside, and the specks fly on outward;",
         "only thin broken arcs near the edge of the effect and a few specks are left, fading;",
         "almost nothing, the last faint arc; frame 16 is black."],
    ),
    "sparks": (
        "the CLASH of two heavy metal halves, one from above and one from below, slamming shut on each other along a HORIZONTAL seam "
        "through the centre of the cell. The halves themselves are NOT drawn: only the light and the sparks of the clash. White-hot "
        "at the core, cooling to gold and orange.",
        ["a blinding thin horizontal line of white light across the centre, about half as wide as the cell, with a hot star-shaped glint at its middle;",
         "the line flares and showers of white-hot sparks spray out sideways, to the left and to the right along the seam, as long thin streaks, a few of them thrown up and down;",
         "the line has faded to a thin glow, the sparks fly further on slightly falling, curved paths, some split in two, cooling from white to gold and orange;",
         "only a few fading sparks are left, falling;",
         "almost nothing, the last one or two dying sparks; frame 16 is black."],
    ),
}


def sheet_prompt(name: str) -> str:
    effect, beats = SHEETS[name]
    lines = "\n".join(f"- {b}: {t}" for b, t in zip(BEATS, beats))
    return f"{SHEET_HEAD}THE EFFECT: {effect}\n\nTHE ANIMATION, one continuous motion across the 16 frames:\n{lines}{SHEET_TAIL}"


# ---------- the cracks ----------

CRACKS = (
    "A texture for a game VFX artist: FRACTURE CRACKS, as when a thick sheet of dark glass is shattered by several blows. Only the "
    "cracks themselves are drawn, as lines of white and pale ice-blue light on pure black (#000000), seen straight from above, "
    "perfectly flat, with no perspective.\n\n"
    "Five or six points of impact are spread over the whole picture. From each a web of cracks runs out: long main cracks, straight "
    "for a stretch and then turning at a sharp angle, that cross the whole picture and join the cracks of the other impacts; thinner "
    "cracks branching off them; fine hairline cracks between; and close round each point of impact a small dense spider's web of "
    "ring-shaped and radial cracks. The main cracks are bold, with a white-hot core and a thin soft glow; the hairlines are very fine. "
    "The cracks cover the picture evenly from edge to edge and run off all four edges.\n\n"
    "Nothing else is in the picture: no surface, no glass texture, no reflections, no shards, no dust, no objects, no text."
)

#: name -> (the prompt, the aspect ratio asked for)
ALL: dict[str, tuple[str, str]] = {
    **{name: (words_prompt(name), "21:9") for name in WORDS},
    **{name: (SEAL_HEAD + shape + SEAL_TAIL, "1:1") for name, shape in SEALS.items()},
    **{name: (sheet_prompt(name), "1:1") for name in SHEETS},
    "cracks": (CRACKS, "9:16"),
}


def generate(prompt: str, aspect: str) -> tuple[bytes, dict]:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "2K"}, "thinkingConfig": {"thinkingLevel": "MEDIUM"}},
    }
    last = "no answer"
    for attempt in range(6):
        req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST")
        req.add_header("x-goog-api-key", os.environ["GOOGLE_API_KEY"])
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=420) as r:
                out = json.loads(r.read())
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read()[:200]!r}"
            if e.code not in (429, 500, 502, 503, 504):
                break
            # the model's quota is by the minute: wait it out
            time.sleep(25 * (attempt + 1))
            continue
        except OSError as e:
            last = repr(e)
            time.sleep(6 * (attempt + 1))
            continue
        for cand in out.get("candidates", []):
            for part in cand.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    return base64.b64decode(part["inlineData"]["data"]), out.get("usageMetadata", {})
        last = "no image in the answer: " + json.dumps(out)[:300]
    raise RuntimeError(last)


def record() -> dict:
    file = TRIES / "record.json"
    return json.loads(file.read_text(encoding="utf-8")) if file.exists() else {}


def make(names: list[str]) -> None:
    TRIES.mkdir(parents=True, exist_ok=True)
    rec = record()
    # each name's next try number, counted before anything runs (a name given twice makes two tries)
    jobs: list[tuple[str, str]] = []
    for name in names:
        n = 1 + sum(1 for k in rec if k.rsplit("-", 1)[0] == name) + sum(1 for j in jobs if j[0] == name)
        jobs.append((name, f"{name}-{n}"))

    def one(job: tuple[str, str]) -> tuple[str, dict | None, str]:
        name, key = job
        prompt, aspect = ALL[name]
        try:
            png, usage = generate(prompt, aspect)
        except Exception as e:  # one picture failing does not stop the others
            return key, None, str(e)[:300]
        (TRIES / f"{key}.png").write_bytes(png)
        return key, {"model": MODEL, "aspect": aspect, "size": "2K", "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"), "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage}, ""

    with ThreadPoolExecutor(AT_ONCE) as pool:
        for key, entry, error in pool.map(one, jobs):
            if entry is None:
                print("failed:", key, error)
                continue
            rec = record()
            rec[key] = entry
            (TRIES / "record.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
            print("made:", key, entry["bytes"], entry["usage"].get("totalTokenCount"))


def pick(name: str, n: int) -> None:
    from PIL import Image

    key = f"{name}-{n}"
    image = Image.open(TRIES / f"{key}.png").convert("RGB")
    scale = STORED / max(image.size)
    if scale < 1:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    image.save(OUT / f"{name}.jpg", quality=92, subsampling=0)
    rec = record()[key]
    picks_file = OUT / "picks.json"
    picks = json.loads(picks_file.read_text(encoding="utf-8")) if picks_file.exists() else {}
    picks[name] = {"try": n, "tries": sum(1 for k in record() if k.rsplit("-", 1)[0] == name), **rec, "stored": list(image.size)}
    picks_file.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("picked:", key, "->", f"{name}.jpg", image.size)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["names"]:
        print(" ".join(ALL))
    elif args[:1] == ["make"] and args[1:] and all(a in ALL for a in args[1:]):
        make(args[1:])
    elif args[:1] == ["pick"] and len(args) == 3 and args[1] in ALL:
        pick(args[1], int(args[2]))
    else:
        raise SystemExit(__doc__)
