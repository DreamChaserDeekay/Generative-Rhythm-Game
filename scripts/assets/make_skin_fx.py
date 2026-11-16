"""Makes the skins' hit effects with the image model: for each hit one sheet of its animation frame by frame (16
frames in a 4 x 4 grid on black), the hit itself ("burst") and the light while a long note is held ("hold"). What
comes back is kept in assets-src/styles/skinfx/_tries/ (not in the repository) with a record of its prompt; the one
picked is stored as assets-src/styles/skinfx/<hit>_<kind>.jpg and built into the game's flipbooks by build_skin_fx.py.

    GOOGLE_API_KEY=... python scripts/assets/make_skin_fx.py make [--redraw [--from DIR]] <hit> burst|hold [...]
    python scripts/assets/make_skin_fx.py pick <hit> burst|hold <try number>

A hit is at its brightest in its first frame (the frame the player sees as the key goes down) and only fades from
there: the first sheets (2026-11-11) opened from a tiny point over three or four frames, and showed a tenth to a
half of their light when the note was hit. With --redraw a hit that has a sheet (assets-src/styles/skinfx/
<hit>_burst.jpg, or DIR's) is drawn again from it: that sheet is sent with the prompt as the look to keep, the
game's own picture, made here (how the sheets of 2026-11-16 were made from the first ones).
Nothing else is sent: no picture of another game, none of the pictures a player sent as a reference, and no logo.
The effects are described in words (a company's skin by its colours and manner; GROK's by "an X of two crossing
strokes"). Each try costs money: it runs only for the names given. Needs Pillow.
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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets-src" / "styles" / "skinfx"
TRIES = OUT / "_tries"
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"
#: the sheets are stored this wide (the build's frames are a quarter of it), as JPEG to keep the repository small
STORED = 1536

# ---------- the hit: played once ----------

HEAD = (
    "A sprite sheet for a game VFX artist: the frame-by-frame animation of ONE hit impact effect for a commercial PC rhythm game, "
    "at the finish level of a top commercial action game's hand-painted VFX flipbooks.\n\n"
    "LAYOUT: exactly 16 frames in a 4 x 4 grid of equal square cells, read left to right, top to bottom (frame 1 top-left, frame 16 "
    "bottom-right). Pure black background (#000000) everywhere. NO grid lines, NO borders, NO frame numbers, NO text. The effect is "
    "centred on the same point in every cell and stays inside its cell with black space around it; nothing touches a cell edge.\n\n"
)
TAIL = (
    "\n\nEvery frame is a different drawing of the same event a moment later: shapes change, break up and travel outward, they are not one "
    "picture scaled up. Painterly, energetic, asymmetric, with sharp bright edges and soft glow. It is light only, on black, to be added "
    "onto the screen. No ground, no objects, no characters, no logos, no letters, no numbers."
)
#: the hit is at its brightest in its first frame (see the top of this file)
BRIGHTEST_FIRST = (
    "\n\nBRIGHTNESS, the most important rule: this effect answers a key press, so it must be at its strongest the instant the key goes down. "
    "FRAME 1 IS THE BRIGHTEST AND FULLEST FRAME OF THE WHOLE SHEET: it holds more light than any other frame, with the largest white-hot "
    "core, and the effect is already at its full size in it. There is NO build-up: no tiny first frame, no small point that grows. From "
    "frame 2 on every frame holds less light than the frame before it, and the fade uses ALL 16 frames: about half of frame 1's light is "
    "left in frame 5, about a fifth in frame 9, and frames 12 to 16 still show the last small pieces, fewer and fainter in each. No frame "
    "is empty: frame 16 holds the last faint trace."
)
#: sent with a hit's sheet when it is drawn again
KEEP_LOOK = (
    "The attached picture is the current sprite sheet of this effect. Keep its look exactly: the same colours, the same kinds of shapes and "
    "strokes, the same level of detail, the same size of the effect in its cell. Only its timing is wrong: it starts with a tiny point "
    "and takes three or four frames to grow to its brightest. Draw the sheet again with the timing described below.\n\n"
)

# skin: (the effect, the animation's five beats: frame 1, frames 2-4, 5-10, 11-14, 15-16)
FX = {
    "default": (
        "a clean, punchy burst of pure light with a crackle of electric energy. Every element is white and grey light only, with no colour "
        "at all, because the game colours it itself.",
        ["the impact: a blinding star-shaped flash with long sharp rays at its full size, with a bright shockwave ring already open around it and short crackling arcs of energy on the ring;",
         "the star flash shrinks and dims fast while the ring blows outward and sharp glints shoot out in all directions;",
         "the ring keeps expanding and breaks into separate thin arcs, the glints fly further and stretch into fine streaks, small four-ray sparkles twinkle;",
         "only a few thin arcs and tiny fading sparkles are left, getting smaller and dimmer;",
         "almost nothing, the last one or two faint sparkles; frame 16 is black."],
    ),
    "crystal": (
        "a burst of cut crystal and prismatic light: ice-white and pale-blue shards of clear faceted glass, with thin rainbow dispersion "
        "(a fine spectrum of red, yellow, green, blue, violet) along their cut edges.",
        ["the impact: a blinding diamond-shaped flash with a thin rainbow halo at its full size, and the crystal already shattering: sharp, faceted, translucent shards of different sizes bursting out of it in all directions, each facet catching white light;",
         "the flash dims fast while the shards shoot outward, thin spectral streaks between them;",
         "the shards fly further, tumble and turn so that different facets flash, tiny rainbow glints sparkle among them, the centre is only a pale blue glow;",
         "only a few small shards and tiny prismatic sparkles are left, getting smaller and dimmer;",
         "almost nothing, the last one or two faint glints; frame 16 is black."],
    ),
    "sky": (
        "a soft, bright burst of white cloud, sunlight and white feathers in a clear sky-blue glow: white, pale cyan and sky blue.",
        ["the impact: a bright sunburst with soft rays at its full size, inside a puff of white cloud that is already bursting open into a ring of billowing wisps, with several white feathers thrown out from the centre in different directions;",
         "the sunburst fades fast while the cloud ring spreads and the feathers whirl outward with a few sparkling glints;",
         "the cloud ring thins into separate drifting wisps, the feathers whirl further, turning and curling as they fly, small sparkles twinkle;",
         "only two or three small feathers and thin wisps are left, drifting and fading into pale blue;",
         "almost nothing, the last faint wisp; frame 16 is black."],
    ),
    "gpt": (
        "a burst of liquid light in emerald-teal green (#10a37f) and white, like a drop hitting still water: white at its core, bright teal "
        "green around it.",
        ["the impact: a bright round bloom of white and teal light at its full size, with a crown-shaped splash of glowing teal liquid light already leaping up and outward from it and a bright ripple ring open around it;",
         "the bloom dims fast while the crown splash rises higher with round droplets flying off its tips and the ripple ring widens;",
         "the splash collapses and tears into separate ribbons and beads of light, the round droplets fly further and stretch into short streaks, a second, thinner ripple ring follows the first;",
         "only thin broken ripple arcs and a few small round droplets are left, getting smaller and darker green;",
         "almost nothing, the last one or two faint droplets; frame 16 is black."],
    ),
    "gemini": (
        "a burst of four-pointed sparkle stars (each with four long, thin, tapering points and concave sides) in a smooth gradient of blue, "
        "violet and pink with white-hot cores.",
        ["the impact: one large four-pointed sparkle star with long thin points at its biggest and brightest, white with a blue-to-pink gradient glow, with many smaller four-pointed sparkles in blue, violet and pink already thrown off around it;",
         "the large star shrinks fast and turns a little while the smaller sparkles shoot outward in all directions, each leaving a short soft trail;",
         "the large star is only a thin cross of light and fades while the small sparkles fly further, each one twinkling (growing and shrinking) at a different moment, with tiny dots of light among them;",
         "only a few small sparkles are left, twinkling out one by one;",
         "almost nothing, the last one faint sparkle; frame 16 is black."],
    ),
    "grok": (
        "a bold X mark made of two crossing diagonal strokes, one thick and one thin, in pure white and silver light, monochrome with no "
        "colour at all, that flashes, glints and bursts apart.",
        ["the impact: a bold, sharp X of two crossing diagonal slashes of white light, one stroke thick and one thin, at its full size and blinding white, with a bright star-shaped glint at its crossing point and smaller glints along its edges and at its four tips;",
         "the X dims a little and cracks: its strokes start to break into angular shards, with motion streaks along the four diagonal directions;",
         "the X bursts apart: the shards and splinters shoot outward along the four diagonal directions, with sharp sparks and four-ray sparkles between them;",
         "only a few small shards and twinkling sparkles are left, flying outward, getting smaller and dimmer grey;",
         "almost nothing, the last one or two faint sparkles; frame 16 is black."],
    ),
    "claude": (
        "a hand-painted starburst in warm terracotta orange (#d97757) and cream, like a sunburst made of uneven tapered brush strokes with a "
        "dry-brush texture: cream-white at the centre, terracotta at the tips.",
        ["the impact: a full sunburst of a dozen uneven, tapered, textured brush strokes of different lengths at its full size, cream-white and brightest at the centre, with small flecks and droplets of paint thrown out between the strokes;",
         "the centre dims fast while the strokes shoot further outward and begin to detach from it;",
         "the strokes fly outward, thinning into dry-brush streaks, the flecks and droplets scatter further, the centre is only a warm glow;",
         "only a few thin streaks and small flecks are left, getting smaller and darker terracotta;",
         "almost nothing, the last one or two faint flecks; frame 16 is black."],
    ),
    "aqua": (
        "a holographic energy burst in aqua cyan (#22e0e6) with hot pink (#ff3f93) accents and a white core, the feel of a mecha's targeting "
        "display.",
        ["the impact: a bright cyan plasma flash at its full size inside a thin hexagonal ring of light that is already snapping wide and breaking at its corners, with jagged cyan energy tongues and sharp pink shards bursting out of it;",
         "the flash dims fast while the energy tongues blow outward and the pink shards and small hexagonal fragments shoot out in all directions;",
         "the energy tongues tear into separate cyan wisps and arcs, the pink shards fly further and stretch into thin streaks, small hexagon fragments tumble and flicker like a hologram breaking up;",
         "only a few thin cyan arcs, small fragments and pink streaks are left, getting smaller and dimmer;",
         "almost nothing, the last one or two faint fragments; frame 16 is black."],
    ),
    "steel": (
        "a cold, hard burst of white-hot welding light and metal sparks in steel blue: a cross-shaped flare with four long rays, white at "
        "the core, icy steel blue (#58aaf0) around it.",
        ["the impact: a blinding cross-shaped flare with four long thin rays and a hot round core at its biggest, with a shower of white-hot metal sparks already spraying out from the centre in all directions as long thin streaks and a thin, sharp shockwave ring around it;",
         "the flare shrinks fast while the sparks fly outward and the ring widens;",
         "the flare is only a small hot core, the sparks fly further on slightly curved paths, some split into two, cooling from white to steel blue, the ring thins and breaks into arcs;",
         "only a few fading sparks and thin broken arcs are left, getting shorter and darker blue;",
         "almost nothing, the last one or two dying sparks; frame 16 is black."],
    ),
    "noir": (
        "a digital glitch burst in pure red (#ff1a2b) and white on black: horizontal slices, blocky pixels and torn scanlines, like a "
        "corrupted video signal. Only red, white and black.",
        ["the impact: a thick white horizontal bar of light at its full width with a red ghost of itself shifted to one side, already tearing into several horizontal slices that jump left and right out of line, with blocks of red and white pixels of different sizes bursting out of it;",
         "the bar dims fast while the slices jump further apart and the pixel blocks burst outward from the centre with torn scanline fragments;",
         "the slices break up further into small rectangles, the pixel blocks fly outward and split into smaller pixels, some flicker as hollow outlines, with thin red scanlines between them;",
         "only a few small pixels and short red dashes are left, scattered wide, getting smaller and dimmer;",
         "almost nothing, the last one or two pixels; frame 16 is black."],
    ),
    "wire": (
        "an elegant firework sketched in fine luminous white lines on black, as if drawn with a thin glowing pen: line art only, no filled "
        "shapes, pure white with a faint soft glow, monochrome.",
        ["the impact: a full ring of many fine radiating pen strokes of uneven length, like a dandelion or a firework at its biggest, drawn with its brightest and thickest lines, with a hand-drawn circle around it and tiny line-drawn four-point twinkles at some stroke ends;",
         "the lines thin a little while the strokes fly outward and the circle widens;",
         "the strokes curve a little like falling firework trails, the circle breaks into short dashes, a second ring of finer strokes opens inside, small twinkles drift;",
         "only a few short fading strokes, dashes and tiny twinkles are left, scattered wide;",
         "almost nothing, the last one or two faint twinkles; frame 16 is black."],
    ),
    "astral": (
        "a burst of golden starlight and glittering stardust over a soft moon-blue glow: warm gold (#f2c14e) and white stars, pale blue "
        "haze, the feel of a night sky.",
        ["the impact: one bright golden star with long thin rays at its biggest and brightest, with a spray of glittering gold stardust and many small four- and five-pointed stars already thrown out around it, inside a faint ring of moon-blue haze;",
         "the central star shrinks fast while the small stars shoot outward in all directions, each with a short sparkling trail;",
         "the central star is only a soft glow while the small stars fly further, twinkling at different moments, the stardust spreads into drifting swirls of glitter, the blue haze thins;",
         "only a few small twinkling stars and specks of glitter are left, drifting outward and fading;",
         "almost nothing, the last one or two faint twinkles; frame 16 is black."],
    ),
    # a firework, not a fire: the user's word on the first one (flame tongues in molten orange) was "it should feel like
    # fireworks, and it looks like lava"
    "fire": (
        "a FIREWORK shell bursting in a black night sky, as a firework looks in a short-exposure photograph: it is made ONLY of thin "
        "straight streaks of light and tiny points of light. Crimson red and hot magenta-pink streaks with brilliant white-gold heads, "
        "and gold glitter. There is NO flame, NO fire tongue, NO fireball, NO blob, NO cloud, NO smoke and NO lava anywhere: every "
        "element is a fine line or a small sparkling dot, bright and crisp enough to read when the picture is shown small.",
        ["the shell has just burst: a small blinding white-gold star at the centre and sixty or more thin straight streaks already shot out radially in every direction, filling a round chrysanthemum at its full size, each streak with a brilliant white-gold bead at its head and a fine tapering crimson or hot-pink tail behind it, streaks of different lengths;",
         "the white core shrinks to a small glint and is gone while the streaks reach their full length;",
         "the tails fade from the centre outward, so the middle of the burst is empty and black and the firework is a hollow sphere of bright heads; the heads slow down, begin to droop very slightly, and start to crackle, each breaking into a cluster of tiny twinkling gold and white glitter sparks;",
         "only the crackling glitter is left, in a broken ring: tiny gold and white four-ray twinkles and pin-point sparks that blink on and off at different places in every frame, fewer and dimmer in each frame, a few of them falling a little;",
         "almost nothing, the last two or three faint twinkles; frame 16 is black."],
    ),
}

# ---------- the light while a note is held: a loop ----------

HOLD_HEAD = (
    "A sprite sheet for a game VFX artist: the frame-by-frame animation of ONE small looping effect for a commercial PC rhythm game, at "
    "the finish level of a top commercial action game's hand-painted VFX flipbooks: the light that burns steadily at the spot where a "
    "long note is being held down.\n\n"
    "LAYOUT: exactly 16 frames in a 4 x 4 grid of equal square cells, read left to right, top to bottom. Pure black background "
    "(#000000) everywhere. NO grid lines, NO borders, NO frame numbers, NO text. The effect is centred on the same point in every cell, "
    "about the same size and the same brightness in every frame (it fills about half of the cell's width), and stays inside its cell "
    "with plenty of black space around it; nothing touches a cell edge.\n\n"
)
HOLD_TAIL = (
    "\n\nIt is a seamless loop: there is no start and no end, no frame is empty and none is much bigger or brighter than the others; frame "
    "16 flows back into frame 1. Every frame is a different drawing of the same steady effect a moment later: the flickering parts "
    "change shape and place from frame to frame, they are not one picture turned or scaled. Painterly, energetic, with sharp bright "
    "edges and soft glow. It is light only, on black, to be added onto the screen. No ground, no objects, no characters, no logos, no "
    "letters, no numbers."
)

# skin: (the effect, what stays, what changes)
HOLD = {
    "default": ("a steady crackle of pure energy. Every element is white and grey light only, with no colour at all, because the game colours it itself.",
                "a small white-hot round core with a soft bloom stays in the centre",
                "short crackling electric arcs dance around the core, jumping to new places every frame, and tiny sharp sparks and four-ray glints pop off it in all directions"),
    "crystal": ("a small point of prismatic light in ice white and pale blue with thin rainbow dispersion (red, yellow, green, blue, violet).",
                "a small bright diamond-shaped white core with a pale blue glow stays in the centre",
                "thin rainbow glints and tiny faceted shards of crystal light flick out from the core at different angles every frame, and small spectral sparkles twinkle around it"),
    "sky": ("a small ball of warm sunlight in white, pale cyan and sky blue.",
            "a soft, bright, round white core with a sky-blue glow stays in the centre",
            "small wisps of white cloud curl and drift around the core, short soft sun rays turn slowly, and one or two tiny white feathers and sparkles float up and away in every frame"),
    "fire": ("the burning tip of a hand-held SPARKLER firework seen up close: a spray of thin sparks, made ONLY of fine straight lines and "
             "tiny points of light, white-gold at the centre and crimson red and hot magenta-pink toward the ends. There is NO flame, NO "
             "fire tongue, NO fireball, NO blob, NO smoke and NO lava anywhere.",
             "a small brilliant white-gold core stays in the centre",
             "dozens of hair-thin straight sparks spray out from it in all directions, many of them forking at their ends into two or three tiny branches as a sparkler's sparks do, with different directions and lengths in every frame, and tiny gold glitter points twinkle on and off around it"),
    "gpt": ("a bead of liquid light in emerald-teal green (#10a37f) and white, seen from above.",
            "a bright round white bead with a teal glow stays in the centre",
            "thin ripple rings pulse outward from the bead one after another, and small round droplets of teal light hop around it at different places in every frame"),
    "gemini": ("a four-pointed sparkle star (four long thin tapering points, concave sides) with a white core and a smooth blue, violet and pink gradient glow.",
               "the sparkle star stays in the centre",
               "its four points lengthen and shorten so that it twinkles, a faint second star turned 45 degrees pulses behind it, and tiny four-pointed sparkles in blue, violet and pink appear and vanish around it"),
    "grok": ("a small bold X-shaped spark made of two crossing diagonal strokes, one thick and one thin, in pure white and silver light, monochrome with no colour at all.",
             "the X stays in the centre",
             "its strokes flicker in length and brightness, a sharp star-shaped glint flashes at its crossing point, and tiny angular shards and four-ray sparkles jump off its four tips at different places in every frame"),
    "claude": ("a small hand-painted starburst in warm terracotta orange (#d97757) and cream, made of uneven tapered brush strokes with a dry-brush texture.",
               "a cream-white dab stays in the centre",
               "about ten short brush strokes radiate from it and pulse in and out unevenly, each a different length in every frame, with small flecks of paint hopping between them"),
    "aqua": ("a small holographic core of energy in aqua cyan (#22e0e6) with hot pink (#ff3f93) accents.",
             "a bright white-cyan plasma core stays in the centre inside a thin hexagonal ring of light",
             "the hexagonal ring turns step by step and flickers like a hologram, jagged little cyan energy tongues flare off the core, and short pink sparks shoot off at different angles in every frame"),
    "steel": ("a white-hot welding point in icy steel blue (#58aaf0).",
              "a small blinding white core with a cross-shaped flare of four thin rays stays in the centre",
              "the rays flicker in length, and a steady spray of small white and steel-blue metal sparks flies off in all directions as thin streaks, different in every frame"),
    "noir": ("a small digital glitch in pure red (#ff1a2b) and white on black, like a corrupted video signal. Only red, white and black.",
             "a short bright white horizontal bar stays in the centre",
             "red and white horizontal slices jitter left and right above and below it, different in every frame, and small red pixel blocks flicker on and off around it"),
    "wire": ("a small star sketched in fine luminous white lines on black, as if drawn with a thin glowing pen: line art only, no filled shapes, pure white, monochrome.",
             "a small line-drawn star stays in the centre",
             "its pen strokes are redrawn at slightly different lengths and angles in every frame so that it shimmers, a thin hand-drawn circle wobbles around it, and tiny line-drawn four-point twinkles appear and vanish near it"),
    "astral": ("a small golden star over a soft moon-blue glow: warm gold (#f2c14e) and white, pale blue haze.",
               "a bright golden star with four long thin rays stays in the centre",
               "its rays lengthen and shorten so that it twinkles, glittering gold stardust swirls slowly around it, and tiny stars appear and vanish at different places in every frame"),
}

#: hit (its name in the manifest and in build_skin_fx.py) -> the skin whose words above describe it
HITS = {
    "basic": "default",
    "prism": "crystal",
    "sky": "sky",
    "fire": "fire",
    "gpt": "gpt",
    "gemini": "gemini",
    "grok": "grok",
    "claude": "claude",
    "aqua": "aqua",
    "steel": "steel",
    "noir": "noir",
    "wire": "wire",
    "astral": "astral",
}
BEATS = ["frame 1", "frames 2-4", "frames 5-10", "frames 11-14", "frames 15-16"]


def prompt_of(hit: str, kind: str, redraw: bool = False) -> str:
    """The prompt of a hit's sheet; `redraw`: its sheet goes with it, as the look to keep."""
    skin = HITS[hit]
    if kind == "burst":
        effect, beats = FX[skin]
        # (the first sheets ended on a black frame: the last of sixteen is now the faintest, so all of them play)
        lines = "\n".join(f"- {b}: {t.replace('frame 16 is black', 'frame 16 is the faintest')}" for b, t in zip(BEATS, beats))
        return f"{KEEP_LOOK if redraw else ''}{HEAD}THE EFFECT: {effect}\n\nTHE ANIMATION, one continuous motion across the 16 frames:\n{lines}{BRIGHTEST_FIRST}{TAIL}"
    effect, stays, changes = HOLD[skin]
    return f"{HOLD_HEAD}THE EFFECT: {effect}\n\nTHE ANIMATION: in every frame {stays}, while {changes}.{HOLD_TAIL}"


def generate(prompt: str, picture: bytes | None = None) -> tuple[bytes, dict]:
    """The model's picture for `prompt`, and what it used; `picture` (a JPEG) is sent before the words."""
    parts: list[dict] = [{"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(picture).decode()}}] if picture else []
    body = {
        "contents": [{"role": "user", "parts": [*parts, {"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "1:1", "imageSize": "2K"}, "thinkingConfig": {"thinkingLevel": "MEDIUM"}},
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


def keep(rec: dict) -> None:
    (TRIES / "record.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")


def frame_light(png: Path) -> list[float]:
    """How much light each of a try's 16 frames holds, as shares of its brightest frame's (flipbook_light.py)."""
    from PIL import Image

    from flipbook_light import frame_light as measure

    light = measure(Image.open(png), 4, 4, 16)
    top = max(light) or 1
    return [round(x / top, 3) for x in light]


def make(pairs: list[tuple[str, str]], redraw: Path | None = None) -> None:
    """`redraw`: the folder of the sheets to draw the bursts again from (each sent as the look to keep)."""
    TRIES.mkdir(parents=True, exist_ok=True)
    for hit, kind in pairs:
        rec = record()
        n = 1 + max((int(k.rsplit("-", 1)[1]) for k in rec if k.startswith(f"{hit}_{kind}-")), default=0)
        like = (redraw or OUT) / f"{hit}_{kind}.jpg"
        again = redraw is not None and kind == "burst" and like.exists()
        prompt = prompt_of(hit, kind, again)
        try:
            png, usage = generate(prompt, like.read_bytes() if again else None)
        except Exception as e:  # one sheet failing does not stop the others
            print("failed:", hit, kind, str(e)[:300])
            continue
        key = f"{hit}_{kind}-{n}"
        (TRIES / f"{key}.png").write_bytes(png)
        rec = record()
        rec[key] = {"model": MODEL, "aspect": "1:1", "size": "2K", "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"), "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage}
        if again:
            rec[key]["sent"] = {"file": like.name, "sha256": hashlib.sha256(like.read_bytes()).hexdigest()}
        if kind == "burst":
            rec[key]["light"] = frame_light(TRIES / f"{key}.png")
        keep(rec)
        print("made:", key, len(png), usage.get("totalTokenCount"), " ".join(f"{x * 100:.0f}" for x in rec[key].get("light", [])))


def pick(hit: str, kind: str, n: int) -> None:
    from PIL import Image

    key = f"{hit}_{kind}-{n}"
    image = Image.open(TRIES / f"{key}.png").convert("RGB").resize((STORED, STORED), Image.LANCZOS)
    path = OUT / f"{hit}_{kind}.jpg"
    image.save(path, "JPEG", quality=92, subsampling=0)
    rec = record()
    for k, entry in rec.items():
        if k.startswith(f"{hit}_{kind}-"):
            entry["picked"] = k == key
    keep(rec)
    print("picked:", key, "->", path.relative_to(ROOT), path.stat().st_size)


def main() -> None:
    args = sys.argv[1:]
    # --redraw [--from DIR]: a burst that has a sheet (in DIR, else the one in use) is drawn again from it, the sheet
    # sent as the look to keep
    redraw: Path | None = None
    if "--redraw" in args:
        args.remove("--redraw")
        redraw = OUT
        if "--from" in args:
            redraw = Path(args.pop(args.index("--from") + 1))
            args.remove("--from")
    if len(args) >= 3 and args[0] == "make" and len(args) % 2 == 1:
        pairs = list(zip(args[1::2], args[2::2]))
        for hit, kind in pairs:
            if hit not in HITS or kind not in ("burst", "hold"):
                sys.exit(f"unknown: {hit} {kind}")
        make(pairs, redraw)
    elif len(args) == 4 and args[0] == "pick" and args[1] in HITS and args[2] in ("burst", "hold"):
        pick(args[1], args[2], int(args[3]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
