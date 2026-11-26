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

# 2026-11-26: flat lettering with a neon rim, as the UI's slanted plates, neon lines and HUD type (the 3D gold bevels and
# gems before it clashed with them; their prompts stay in git history and in picks.json until picked over)
WORDS_HEAD = (
    "Clean modern rhythm-game UI banner typography for a PC rhythm game: the words shown in the middle of the screen when a song "
    "ends. Flat 2D orthographic front view, no perspective.\n\n"
)
WORDS_FORM = (
    "LETTERING: ultra-sharp geometric bold sans-serif capitals with crisp chamfered corners, slanted forward 10 degrees, tightly "
    "and evenly spaced, all the same height on a perfectly even baseline. The letters are FLAT: no thick extruded 3D sides, no "
    "chrome bevels, no gem facets. Each has a crisp, evenly lit luminous inner fill, a thin razor-bright neon rim line tracing its "
    "outline, and a subtle texture of fine horizontal scan streaks inside the fill. A soft, tight glow of the rim colour hugs the "
    "letters. No heavy lens-flare blobs.\n\n"
)
WORDS_TAIL = (
    "\n\nBACKGROUND AND LAYOUT: pure black (#000000) everywhere. The words are centred, perfectly horizontal, and fill about 80% "
    "of the picture's width with clean black margin on every side; nothing touches the edges. Nothing else: no box, no plate, no "
    "emblem, no ribbon, no ground, no reflection, no icons, no second line of text, no small print, no watermark."
)
WORDS = {
    "words-perfect": (
        "PERFECT PLAY", "P-E-R-F-E-C-T, a space, P-L-A-Y",
        "COLOUR: cyan-white fill (#e6ffff), bright cyan rim line (#4ef2ff), cyan glow. Exactly three tiny four-point sparkles, "
        "each on a corner of a letter (top-left of the first P, top-right of the Y, one corner between); no others.",
    ),
    "words-maxcombo": (
        "MAX COMBO", "M-A-X, a space, C-O-M-B-O",
        "COLOUR: champagne-white fill (#fff8e0), amber-gold rim line (#ffc845), warm gold glow. A thin straight underline in the "
        "rim colour runs under the whole word, and ONE thin streak of white light (a speed line) cuts across it at a shallow angle. "
        "No sparkles.",
    ),
    "words-failed": (
        "FAILED", "F-A-I-L-E-D",
        "COLOUR: crimson fill (#ff6666), red rim line (#ff1f38), dim red glow. The word is CUT TWICE by two straight cuts slanted "
        "10 degrees like the letters, so it is in three pieces, each shifted slightly against the next along the cuts (thin black "
        "gaps). No sparkles, no streaks, no shards, no embers. It still reads at a glance.",
    ),
    # a play that earns no lamp (autoplay, the end of a practice): calm, nothing won
    "words-autoplay": (
        "AUTO PLAY", "A-U-T-O, a space, P-L-A-Y",
        "COLOUR: silver-white fill (#e8eef7), pale silver rim line, soft cool white glow. Calm: no sparkles, no streaks.",
    ),
    "words-practice": (
        "PRACTICE END", "P-R-A-C-T-I-C-E, a space, E-N-D",
        "COLOUR: mint-white fill (#e4fff5), mint rim line (#6be6bc), soft mint glow. Calm: no sparkles, no streaks.",
    ),
}


def words_prompt(name: str) -> str:
    text, spelled, look = WORDS[name]
    return (
        f"{WORDS_HEAD}THE WORDS: exactly \"{text}\" on ONE line, all capitals, spelled {spelled}. Nothing else is written anywhere "
        f"in the picture.\n\n{WORDS_FORM}{look}{WORDS_TAIL}"
    )


# ---------- the clear lamps' seals ----------

# 2026-11-26: flat vector emblems with a segmented ring (the crystal and metal medals before them: see WORDS_HEAD's note)
SEAL_HEAD = (
    "Rhythm-game clear-lamp emblem, a UI icon for a PC rhythm game: the seal stamped onto the screen when a song is cleared. Flat "
    "2D vector-precision graphic, seen straight from the front: ONE emblem centred, filling about 70% of the square canvas, on pure "
    "black (#000000) out to all four corners.\n\n"
    "STYLE: no 3D gemstone bevels, no chrome dome gradients, no metal texture. An outer thin SEGMENTED calibration ring (a circle "
    "broken into evenly spaced segments) with fine radial tick marks all the way round; inside it a sharp core with a neon rim, "
    "glowing hairlines and strict geometric symmetry. Lit parts are flat glowing colour with a soft glow of the same colour; "
    "everything else is black.\n\n"
)
SEAL_TAIL = (
    "\n\nNO letters, NO numbers, NO text, no signs of any alphabet. No ribbon, laurel, star, crown, wings, gem, characters, ground, "
    "reflection or second emblem."
)
SEALS = {
    "seal-assist": "THE CORE: a neon-outlined circle whose TOP-RIGHT QUARTER only is filled with glowing colour (a pie slice from "
                   "twelve to three o'clock); the other three quarters are black inside the outline. COLOUR: violet (#8c7dff).",
    "seal-easy": "THE CORE: a neon-outlined circle whose RIGHT HALF is filled with glowing colour, split from the empty left half by a "
                 "straight vertical line. COLOUR: lime mint (#b6e36f).",
    "seal-clear": "THE CORE: a neon-outlined circle completely filled with glowing colour. COLOUR: sky blue (#3d9bff).",
    "seal-hard": "THE CORE: a regular OCTAGON ring with a thick neon outline, filled with glowing colour, and on its left and right "
                 "sides a short horizontal wing groove notched into the segmented ring. COLOUR: white and pale silver (#eef6ff).",
    "seal-exhard": "THE CORE: a DOUBLE octagonal frame (two concentric neon octagons with a black gap) around a glowing filled "
                   "octagon, and four chevrons (V shapes) at its four diagonal corners, each pointing inward at the centre. Not a "
                   "square frame. COLOUR: gold (#ffe84a).",
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

# ---------- the cracks, frame by frame (2026-11-26: they run up the track from where the play broke) ----------

CRACKS_SHEET = (
    "A sprite sheet for a game VFX artist: glass cracking frame by frame, for a PC rhythm game's track. Flat orthographic 2D, "
    "seen straight from the front, on pure black (#000000).\n\n"
    "LAYOUT: exactly 6 frames in a 3 x 2 grid of equal cells (3 across, 2 down). Each cell is a tall portrait rectangle twice as "
    "high as it is wide. Read left to right, top to bottom (frame 1 top-left, frame 6 bottom-right). NO grid lines, NO borders, NO "
    "frame numbers, NO text. Every cell shows the same area a moment later. The point of impact sits ON the bottom edge of every "
    "cell, in its middle, at the same place in every cell; nothing at all is drawn below it. The cracks fan out upward and "
    "sideways from it only, like the upper half of a spider web.\n\n"
    "THE ANIMATION:\n"
    "- frame 1: one sharp, bright impact node with short razor-thin ice-white cracks reaching about 25% of the way up;\n"
    "- frames 2-3: angular cracks race upward and branch, reaching about 55% and then 80% of the way up;\n"
    "- frames 4-5: the cracks reach the cell's left, right and top edges, with hairline fractures between them and a faint "
    "pale-cyan and crimson glow along their edges;\n"
    "- frame 6: the complete fracture web over the whole cell above the point of impact.\n"
    "Each frame keeps every crack of the one before unchanged, in the same place, and adds new ones: frame 4 contains every crack "
    "of frame 3 unchanged plus new ones, and so on to frame 6. The cracks only grow.\n\n"
    "Thin luminous fracture lines only, white-hot cores with a thin soft glow. No glass surface, no shading, no shards, no dust, no "
    "reflections, no objects, no text."
)

# ---------- the burst where the combo meets the lamp (MAX COMBO, PERFECT PLAY; 2026-11-26) ----------

COMBO_BURST = (
    "A sprite sheet for a game VFX artist: ONE impact burst for a PC rhythm game, frame by frame. Flat 2D geometric light on pure "
    "black (#000000).\n\n"
    "LAYOUT: exactly 10 frames in a 5 x 2 grid of equal cells (5 across, 2 down), read left to right, top to bottom. NO grid lines, "
    "NO borders, NO numbers, NO text. The burst is centred on the same point in every cell and stays inside its cell with black "
    "around it; nothing touches a cell edge.\n\n"
    "THE ANIMATION:\n"
    "- frame 1: a compact white-gold four-point star flare at the centre;\n"
    "- frames 2-4: a diamond-shaped shockwave expands from it, with sharp light shards and thin radial needles;\n"
    "- frames 5-7: the outer diamond breaks into four-point glints and short arc streaks flying outward;\n"
    "- frames 8-9: only micro sparkles drifting outward, fading;\n"
    "- frame 10: almost dark, one or two last faint specks.\n\n"
    "COLOUR: pale gold-white, core #fff3c4, edges #ffc44d. Crisp edges, soft glow. No smoky clouds, no fire, no objects, no letters."
)

# ---------- the light of a lane coming on (the start) ----------

LANE_LIGHT = (
    "A texture for a game VFX artist: a COLUMN OF LIGHT rising from the floor, as when one lane of a rhythm game's track lights up. "
    "Seen straight from the front, perfectly flat, with no perspective, on pure black (#000000).\n\n"
    "At the very BOTTOM edge of the picture lies a bright, white-hot horizontal band of light that spans the picture's whole width. "
    "From it the light rises upward and fills the whole width of the picture, out to the left and right edges (a wide column, not a "
    "thin beam): it is made of many fine vertical streaks and rays of different lengths and brightness, softly glowing between them, "
    "with a few small bright motes drifting up among them. The light is brightest at the bottom and fades smoothly upward, and the "
    "top quarter of the picture is black.\n\n"
    "White and grey light only, with no colour at all, because the game colours it itself. Nothing else is in the picture: no floor, "
    "no objects, no figures, no frame, no text."
)

#: name -> (the prompt, the aspect ratio asked for)
ALL: dict[str, tuple[str, str]] = {
    **{name: (words_prompt(name), "21:9") for name in WORDS},
    **{name: (SEAL_HEAD + core + SEAL_TAIL, "1:1") for name, core in SEALS.items()},
    **{name: (sheet_prompt(name), "1:1") for name in SHEETS},
    "cracks": (CRACKS, "9:16"),
    # 3 x 2 cells of 1:2 (portrait) make a 3:4 picture
    "cracks-sheet": (CRACKS_SHEET, "3:4"),
    # 5 x 2 cells: the model makes no 5:2 picture, 21:9 gives cells of 0.93 (the build squares them)
    "combo-burst": (COMBO_BURST, "21:9"),
    "lane-light": (LANE_LIGHT, "9:16"),
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
