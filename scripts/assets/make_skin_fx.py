"""Makes the skins' hit effects with the image model: for each hit one sheet of its animation frame by frame (16
frames in a 4 x 4 grid on black), the hit itself ("burst") and the light while a long note is held ("hold"). What
comes back is kept in assets-src/styles/skinfx/_tries/ (not in the repository) with a record of its prompt; the one
picked is stored as assets-src/styles/skinfx/<hit>_<kind>.jpg and built into the game's flipbooks by build_skin_fx.py.

    GOOGLE_API_KEY=... python scripts/assets/make_skin_fx.py make <hit> burst|hold [...]    # e.g. make grok burst
    python scripts/assets/make_skin_fx.py pick <hit> burst|hold <try number>

Nothing is sent with the prompts: no picture of another game, none of the pictures a player sent as a reference, and
no logo. The effects are described in words (a company's skin by its colours and manner; GROK's by "an X of two
crossing strokes"). Each try costs money: it runs only for the names given. Needs Pillow for `pick`.
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

# skin: (the effect, the animation's five beats: frames 1-2, 3-5, 6-10, 11-14, 15-16)
FX = {
    "default": (
        "a clean, punchy burst of pure light with a crackle of electric energy. Every element is white and grey light only, with no colour "
        "at all, because the game colours it itself.",
        ["a tiny white point snaps open into a blinding star-shaped flash with long sharp rays;",
         "the flash blows outward into a bright shockwave ring with short crackling arcs of energy on it and sharp glints shooting out in all directions;",
         "the ring keeps expanding and breaks into separate thin arcs, the glints fly further and stretch into fine streaks, small four-ray sparkles twinkle;",
         "only a few thin arcs and tiny fading sparkles are left, getting smaller and dimmer;",
         "almost nothing, the last one or two faint sparkles; frame 16 is black."],
    ),
    "crystal": (
        "a burst of cut crystal and prismatic light: ice-white and pale-blue shards of clear faceted glass, with thin rainbow dispersion "
        "(a fine spectrum of red, yellow, green, blue, violet) along their cut edges.",
        ["a tiny white glint snaps open into a blinding diamond-shaped flash with a thin rainbow halo;",
         "a crystal shatters outward from the centre: many sharp, faceted, translucent shards of different sizes shoot out in all directions, each facet catching white light, thin spectral streaks between them;",
         "the shards fly further, tumble and turn so that different facets flash, tiny rainbow glints sparkle among them, the centre is only a pale blue glow;",
         "only a few small shards and tiny prismatic sparkles are left, getting smaller and dimmer;",
         "almost nothing, the last one or two faint glints; frame 16 is black."],
    ),
    "sky": (
        "a soft, bright burst of white cloud, sunlight and white feathers in a clear sky-blue glow: white, pale cyan and sky blue.",
        ["a tiny white point snaps open into a bright sunburst with soft rays;",
         "a puff of white cloud bursts open into a ring of billowing cloud wisps, and several white feathers are thrown out from the centre in different directions, with a few sparkling glints;",
         "the cloud ring spreads and thins into separate drifting wisps, the feathers whirl outward, turning and curling as they fly, small sparkles twinkle;",
         "only two or three small feathers and thin wisps are left, drifting and fading into pale blue;",
         "almost nothing, the last faint wisp; frame 16 is black."],
    ),
    "gpt": (
        "a burst of liquid light in emerald-teal green (#10a37f) and white, like a drop hitting still water: white at its core, bright teal "
        "green around it.",
        ["a tiny white point snaps open into a bright round bloom of white and teal light;",
         "a crown-shaped splash of glowing teal liquid light leaps up and outward from the centre with round droplets flying off its tips, and a bright ripple ring opens around it;",
         "the splash collapses and tears into separate ribbons and beads of light, the round droplets fly further and stretch into short streaks, a second, thinner ripple ring follows the first;",
         "only thin broken ripple arcs and a few small round droplets are left, getting smaller and darker green;",
         "almost nothing, the last one or two faint droplets; frame 16 is black."],
    ),
    "gemini": (
        "a burst of four-pointed sparkle stars (each with four long, thin, tapering points and concave sides) in a smooth gradient of blue, "
        "violet and pink with white-hot cores.",
        ["a tiny white point snaps open into one large four-pointed sparkle star with long thin points, white with a blue-to-pink gradient glow;",
         "the large star flares to its biggest, turns a little and throws off many smaller four-pointed sparkles in blue, violet and pink that shoot outward in all directions, each leaving a short soft trail;",
         "the large star shrinks to a thin cross of light and fades while the small sparkles fly further, each one twinkling (growing and shrinking) at a different moment, with tiny dots of light among them;",
         "only a few small sparkles are left, twinkling out one by one;",
         "almost nothing, the last one faint sparkle; frame 16 is black."],
    ),
    "grok": (
        "a bold X mark made of two crossing diagonal strokes, one thick and one thin, in pure white and silver light, monochrome with no "
        "colour at all, that flashes, glints and bursts apart.",
        ["two fast diagonal slashes of white light cross each other with motion streaks and form a bold, sharp X, one stroke thick and one thin;",
         "the X flares blinding white, a bright star-shaped glint flashes at its crossing point and smaller glints sparkle along its edges and at its four tips;",
         "the X cracks and bursts apart: its strokes break into angular shards and splinters that shoot outward along the four diagonal directions, with sharp sparks and four-ray sparkles between them;",
         "only a few small shards and twinkling sparkles are left, flying outward, getting smaller and dimmer grey;",
         "almost nothing, the last one or two faint sparkles; frame 16 is black."],
    ),
    "claude": (
        "a hand-painted starburst in warm terracotta orange (#d97757) and cream, like a sunburst made of uneven tapered brush strokes with a "
        "dry-brush texture: cream-white at the centre, terracotta at the tips.",
        ["a small cream-white dab of paint snaps open into a bright asterisk-like burst of short tapered brush strokes;",
         "the strokes shoot outward as a full sunburst of a dozen uneven, tapered, textured brush strokes of different lengths, with small flecks and droplets of paint thrown out between them;",
         "the strokes detach from the centre and fly outward, thinning into dry-brush streaks, the flecks and droplets scatter further, the centre is only a warm glow;",
         "only a few thin streaks and small flecks are left, getting smaller and darker terracotta;",
         "almost nothing, the last one or two faint flecks; frame 16 is black."],
    ),
    "aqua": (
        "a holographic energy burst in aqua cyan (#22e0e6) with hot pink (#ff3f93) accents and a white core, the feel of a mecha's targeting "
        "display.",
        ["a tiny white point snaps open into a bright cyan plasma flash inside a thin hexagonal ring of light;",
         "the hexagonal ring snaps wide and breaks at its corners while the plasma flash blows outward into jagged cyan energy tongues, and sharp pink shards and small hexagonal fragments shoot out in all directions;",
         "the energy tongues tear into separate cyan wisps and arcs, the pink shards fly further and stretch into thin streaks, small hexagon fragments tumble and flicker like a hologram breaking up;",
         "only a few thin cyan arcs, small fragments and pink streaks are left, getting smaller and dimmer;",
         "almost nothing, the last one or two faint fragments; frame 16 is black."],
    ),
    "steel": (
        "a cold, hard burst of white-hot welding light and metal sparks in steel blue: a cross-shaped flare with four long rays, white at "
        "the core, icy steel blue (#58aaf0) around it.",
        ["a tiny white point snaps open into a blinding cross-shaped flare with four long thin rays and a hot round core;",
         "the cross flare is at its biggest and a shower of white-hot metal sparks sprays out from the centre in all directions as long thin streaks, with a thin, sharp shockwave ring opening around it;",
         "the flare shrinks to a small hot core, the sparks fly further on slightly curved paths, some split into two, cooling from white to steel blue, the ring thins and breaks into arcs;",
         "only a few fading sparks and thin broken arcs are left, getting shorter and darker blue;",
         "almost nothing, the last one or two dying sparks; frame 16 is black."],
    ),
    "rainbow": (
        "a joyful candy-coloured confetti pop: glossy confetti pieces, curled streamers, small stars and round dots in bright red, orange, "
        "yellow, green, sky blue, purple and pink, around a white pop flash.",
        ["a tiny white point snaps open into a bright white pop flash with short rays, a few coloured dots at its edge;",
         "confetti bursts out of the flash in all directions: glossy rectangular pieces, curled streamers, small five-pointed stars and round dots in every colour, the flash already shrinking;",
         "the pieces fly further, tumbling and turning so they show different sides, the streamers uncurl, small sparkles twinkle between them, the flash is gone;",
         "only a few small pieces, one streamer and a star are left, drifting outward and fading;",
         "almost nothing, the last one or two small pieces; frame 16 is black."],
    ),
    "noir": (
        "a digital glitch burst in pure red (#ff1a2b) and white on black: horizontal slices, blocky pixels and torn scanlines, like a "
        "corrupted video signal. Only red, white and black.",
        ["a thin white horizontal bar of light snaps open at the centre with a red ghost of itself shifted to one side;",
         "the bar tears into several horizontal slices that jump left and right out of line, and blocks of red and white pixels of different sizes burst outward from the centre with torn scanline fragments;",
         "the slices break up further into small rectangles, the pixel blocks fly outward and split into smaller pixels, some flicker as hollow outlines, with thin red scanlines between them;",
         "only a few small pixels and short red dashes are left, scattered wide, getting smaller and dimmer;",
         "almost nothing, the last one or two pixels; frame 16 is black."],
    ),
    "magenta": (
        "a razor-sharp burst of blade-like light in crimson (#f0145a) and hot pink with a white core: angular shards and splinters, the feel "
        "of a sword slash.",
        ["two thin white slashes of light cross at the centre as a sharp X-shaped flash with a crimson glow;",
         "the flash blows outward into long, angular, blade-like shards of crimson and pink light pointing away from the centre in all directions, with triangular splinters and a few white sparks between them;",
         "the shards detach and fly outward, spinning and narrowing, the splinters scatter further, thin curved pink slash arcs sweep around the centre, the core dims to crimson;",
         "only a few thin shards, small splinters and fading arcs are left, getting smaller and darker crimson;",
         "almost nothing, the last one or two faint splinters; frame 16 is black."],
    ),
    "wire": (
        "an elegant firework sketched in fine luminous white lines on black, as if drawn with a thin glowing pen: line art only, no filled "
        "shapes, pure white with a faint soft glow, monochrome.",
        ["a tiny line-drawn star of a few short pen strokes snaps open at the centre;",
         "it bursts into a ring of many fine radiating pen strokes of uneven length, like a dandelion or a firework, with a hand-drawn circle around it and tiny line-drawn four-point twinkles at some stroke ends;",
         "the strokes fly outward and curve a little like falling firework trails, the circle widens and breaks into short dashes, a second ring of finer strokes opens inside, small twinkles drift;",
         "only a few short fading strokes, dashes and tiny twinkles are left, scattered wide;",
         "almost nothing, the last one or two faint twinkles; frame 16 is black."],
    ),
    "astral": (
        "a burst of golden starlight and glittering stardust over a soft moon-blue glow: warm gold (#f2c14e) and white stars, pale blue "
        "haze, the feel of a night sky.",
        ["a tiny white point snaps open into one bright golden star with long thin rays;",
         "the star flares and throws out a spray of glittering gold stardust and many small four- and five-pointed stars in all directions, each with a short sparkling trail, inside a faint ring of moon-blue haze;",
         "the central star shrinks to a soft glow while the small stars fly further, twinkling at different moments, the stardust spreads into drifting swirls of glitter, the blue haze thins;",
         "only a few small twinkling stars and specks of glitter are left, drifting outward and fading;",
         "almost nothing, the last one or two faint twinkles; frame 16 is black."],
    ),
    "fire": (
        "a fiery impact burst, white-hot at its core, molten orange and deep red toward its edges. It is light and fire only.",
        ["a tiny white-hot point snaps open into a blinding star-shaped flash;",
         "the flash blows outward into an irregular ring of licking flame tongues and thick, tapered sparks shooting out in all directions, the core still white;",
         "the flame ring keeps expanding and tears apart into separate curling wisps of fire, the sparks fly further and stretch into thin streaks, glowing embers tumble, the core dims to orange;",
         "only thin wisps, a few drifting embers and fading streaks are left, getting smaller and darker red;",
         "almost nothing, the last two or three dying embers; frame 16 is black."],
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
    "fire": ("a small roaring flame, white-hot at its core, molten orange and deep red at its edges. It is light and fire only.",
             "a white-hot core stays in the centre",
             "tongues of orange flame lick outward in all directions with a different shape in every frame, and small glowing embers and short sparks fly off"),
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
    "rainbow": ("a small fizzing sparkle of candy colours: bright red, orange, yellow, green, sky blue, purple and pink around white.",
                "a bright white sparkling core stays in the centre",
                "tiny confetti pieces, round dots and small five-pointed stars in every colour pop out around it and tumble, at different places in every frame"),
    "noir": ("a small digital glitch in pure red (#ff1a2b) and white on black, like a corrupted video signal. Only red, white and black.",
             "a short bright white horizontal bar stays in the centre",
             "red and white horizontal slices jitter left and right above and below it, different in every frame, and small red pixel blocks flicker on and off around it"),
    "magenta": ("a small core of blade-like light in crimson (#f0145a) and hot pink with a white centre.",
                "a white-hot core with a crimson glow stays in the centre",
                "sharp, thin, blade-like spikes of crimson and pink light stab outward from it at different angles and lengths in every frame, with tiny triangular splinters flying off"),
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
    "rainbow": "rainbow",
    "noir": "noir",
    "magenta": "magenta",
    "wire": "wire",
    "astral": "astral",
}
BEATS = ["frames 1-2", "frames 3-5", "frames 6-10", "frames 11-14", "frames 15-16"]


def prompt_of(hit: str, kind: str) -> str:
    skin = HITS[hit]
    if kind == "burst":
        effect, beats = FX[skin]
        lines = "\n".join(f"- {b}: {t}" for b, t in zip(BEATS, beats))
        return f"{HEAD}THE EFFECT: {effect}\n\nTHE ANIMATION, one continuous motion across the 16 frames:\n{lines}{TAIL}"
    effect, stays, changes = HOLD[skin]
    return f"{HOLD_HEAD}THE EFFECT: {effect}\n\nTHE ANIMATION: in every frame {stays}, while {changes}.{HOLD_TAIL}"


def generate(prompt: str) -> tuple[bytes, dict]:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
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


def make(pairs: list[tuple[str, str]]) -> None:
    TRIES.mkdir(parents=True, exist_ok=True)
    for hit, kind in pairs:
        rec = record()
        n = 1 + sum(1 for k in rec if k.startswith(f"{hit}_{kind}-"))
        prompt = prompt_of(hit, kind)
        try:
            png, usage = generate(prompt)
        except Exception as e:  # one sheet failing does not stop the others
            print("failed:", hit, kind, str(e)[:300])
            continue
        key = f"{hit}_{kind}-{n}"
        (TRIES / f"{key}.png").write_bytes(png)
        rec = record()
        rec[key] = {"model": MODEL, "aspect": "1:1", "size": "2K", "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"), "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage}
        keep(rec)
        print("made:", key, len(png), usage.get("totalTokenCount"))


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
    if len(args) >= 3 and args[0] == "make" and len(args) % 2 == 1:
        pairs = list(zip(args[1::2], args[2::2]))
        for hit, kind in pairs:
            if hit not in HITS or kind not in ("burst", "hold"):
                sys.exit(f"unknown: {hit} {kind}")
        make(pairs)
    elif len(args) == 4 and args[0] == "pick" and args[1] in HITS and args[2] in ("burst", "hold"):
        pick(args[1], args[2], int(args[3]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
