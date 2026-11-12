"""Makes the skins' deck panels with the image model: for each gear one painting of its deck's lower part, flat and
seen from straight above, 21:9: a wide dark display in its top middle (the game writes the score and the speed on
it), a decorated wing at each side of it, an emblem under it, and the rest of the panel below. What comes back is
kept in assets-src/gears/panels/_tries/ (not in the repository) with a record of its prompt; the one picked is stored
as assets-src/gears/panels/<gear>.jpg and built into the game's media by build_skin_panels.py.

    GOOGLE_API_KEY=... python scripts/assets/make_skin_panels.py make <refs dir> <gear> [...]
    python scripts/assets/make_skin_panels.py pick <gear> <try number>

Two pictures go with each prompt, both this project's own: image 1 is the gear's deck as the game draws it in code,
flat (<refs dir>/flat-<gear>.png: client/src/render/deckArt.ts paintDeck at stretch 1 for 7K+1S, 3 px to a unit), for
its colours, materials and motifs; image 2 is a layout guide drawn here (guide()): where the display, the wings and
the emblem go. No picture of another game, none of the pictures a player sent as a reference, and no logo is sent.
Each try costs money: it runs only for the gears named. Needs Pillow.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets-src" / "gears" / "panels"
TRIES = OUT / "_tries"
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"
#: the pictures are stored this wide, as JPEG to keep the repository small
STORED = 2048

#: the layout the prompts speak of, as shares of the picture: the display (left, top, right, bottom), how far down
#: the wings reach, and the emblem's radius (of the height) and its gap under the display
BAY = (0.24, 0.0, 0.76, 0.35)
WINGS_TO = 0.41
EMBLEM = (0.2, 0.045)


def guide() -> bytes:
    """The layout guide (PNG): the display black, the wings hatched, the emblem a white disc, the rest plain grey."""
    w, h = 2016, 864
    hatch = Image.new("RGB", (w, h), (150, 150, 150))
    d = ImageDraw.Draw(hatch)
    for k in range(-h, w + h, 36):
        d.line([(k, h), (k + h, 0)], fill=(205, 205, 205), width=6)
    image = Image.new("RGB", (w, h), (96, 96, 96))
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    for x0, x1 in ((0.03, BAY[0]), (BAY[2], 0.97)):
        md.rectangle((int(x0 * w), 0, int(x1 * w), int(WINGS_TO * h)), fill=255)
    image.paste(hatch, (0, 0), mask)
    d = ImageDraw.Draw(image)
    d.rectangle((int(BAY[0] * w), 0, int(BAY[2] * w), int(BAY[3] * h)), fill=(0, 0, 0))
    r = int(EMBLEM[0] * h)
    cx, cy = w // 2, int(BAY[3] * h) + int(EMBLEM[1] * h) + r
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(235, 235, 235))
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


HEAD = (
    "Image 1 is the current, plain version of one part of our own PC rhythm game's interface: the 'gear deck', the wide control panel "
    "that lies under the note lanes, drawn flat from straight above. Use image 1 ONLY for its colour palette, materials and motifs. "
    "Ignore its layout: the row of key caps along its top edge and its display windows are NOT part of the new picture.\n\n"
    "Paint a new, far richer and more detailed version of this panel's surface as production game art, at the finish level of the "
    "interface art of a top commercial rhythm game. It is used as a flat texture, so it must be a strictly top-down, orthographic, "
    "undistorted picture that fills the whole 21:9 frame edge to edge: no perspective, no horizon, no camera angle, no vignette, no "
    "frame or border round the picture, no background behind the panel. Mirror-symmetrical about the vertical centre line.\n\n"
    "Image 2 is a LAYOUT GUIDE only (never copy its greys or its hatching): its black rectangle is where the DISPLAY BAY goes, its "
    "two hatched areas are the WINGS, its white disc is where the EMBLEM goes, and the plain grey area is the LOWER BODY. Your "
    "picture has the same proportions as image 2 and follows its layout exactly.\n\n"
)
LAYOUT = (
    "\n\nCOMPOSITION, exactly (the game depends on it):\n"
    "- The TOP EDGE of the picture is where the panel meets the row of keys; players see the upper half of the picture most, so the "
    "finest design is there.\n"
    "- DISPLAY BAY (the black rectangle of image 2): in the top centre, one wide display set into the panel, exactly as wide as "
    "the black rectangle (from 24 % to 76 % of the picture's width, a little over half of it) and reaching from the top edge down "
    "to 35 % of the height, no deeper. {bay} The game writes its score and speed on it, so its inside must stay completely empty and even: "
    "no text, no digits, no icons, no ornament, no reflections, no gradients, only a thin frame round it.\n"
    "- WINGS (the hatched areas of image 2): left and right of the display bay, from the top edge down to about 41 % of the height, "
    "the two wings (each about a fifth of the width) carry the richest decoration: {wings}\n"
    "- EMBLEM (the white disc of image 2): one large emblem centred directly under the display bay, its top almost touching the "
    "bay's lower frame, about 40 % of the picture's height across.\n"
    "- LOWER BODY (the plain grey area of image 2): the rest of the lower part of the picture is the same panel continuing toward the player, with larger and calmer forms: "
    "{body} It grows gradually darker and plainer toward the bottom edge, and the bottom tenth is almost plain.\n"
    "- Keep ornaments out of the outer 3 % at the left and right edges (the game's rails cover them).\n"
)
TAIL = (
    "\nNo text, no letters, no numbers, no labels, no logos, no brand marks, no watermark, no people, no characters. Crisp, clean, "
    "high-resolution; even, soft lighting from the top edge; no strong cast shadows."
)

# gear: (the concept, the wings, the lower body)
PLATES = {
    "standard": (
        "CONCEPT: a modern professional DJ controller in dark graphite: anodised anthracite metal (#111216 to #2c2e35) with fine machined "
        "lines, crisp bevels and chamfers, satin and brushed finishes, thin cyan (#37e2ff) light lines as the only colour, restrained "
        "and precise.",
        "rows of fine machined grooves, a small perforated speaker grille, two knurled metal knobs with a cyan index line, tiny hex "
        "screws, a thin cyan light guide tracing the wing's edge.",
        "a large jog-wheel ring machined into the metal in the centre under the display bay with a thin cyan light ring, long vent "
        "slots to both sides, chamfered panel seams.",
    ),
    "prism": (
        "CONCEPT: cut crystal and light: faceted clear crystal planes in ice white, pale lavender and pale blue, deep sapphire-blue "
        "gem insets with silver bezels, thin silver edges, fine rainbow dispersion (a hairline spectrum) where facets meet, the feel of "
        "jewellery.",
        "fans of long crystal facets radiating from the bay, a brilliant-cut sapphire gem in a silver ring on each wing, small "
        "hexagonal crystal studs, hairline light guides with rainbow glints.",
        "a large brilliant-cut crystal medallion in the centre under the display bay, wide facet planes spreading from it like a "
        "chandelier, a few small gem studs.",
    ),
    "sky": (
        "CONCEPT: a clear daytime sky as an anime film's background art paints it: deep clear blue at the top easing to pale sky blue, "
        "soft, fluffy, billowing white cumulus clouds with real volume, thin white wind trails, white feathers; only blues and white.",
        "a tall, billowing cumulus cloud rising on each wing with soft pale-blue shading, one or two white feathers drifting beside it, "
        "tiny sparkles of sunlight, hairline white wind trails crossing in long gentle arcs.",
        "a continuous sea of soft cumulus seen from the side, its top edge billowing up into the two clouds of the wings, with a few "
        "feathers floating over it; below its top edge it falls evenly into soft pale blue.",
    ),
    "fire": (
        "CONCEPT: a rock tour's stage gear: glossy deep-red lacquer (#c8102e) with black angular inlays, mirror chrome trim, the "
        "attitude of a muscle car and a tour poster; red, black, chrome and a little white-hot orange.",
        "sharp black inlays cut like blades into the red lacquer, chrome edge trim with rivets, a chrome-ringed speaker cone with a "
        "black grille on each wing, short hazard stripes, thin orange heat lines.",
        "a large chrome emblem shaped like a stylised flame in a black shield in the centre under the display bay, long black vents "
        "raked back like exhausts to both sides, reflections sliding across the red lacquer.",
    ),
    "gpt": (
        "CONCEPT: a calm, friendly chat assistant's interface made physical: a flat surface in emerald-teal green (#10a37f) with soft "
        "rounded white shapes, generous spacing, tiny minimal line icons; flat design with gentle depth, no gloss.",
        "soft rounded white pill and bubble shapes of different lengths stacked like lines of a conversation, rows of three small "
        "round dots, thin white outline rings, a few tiny abstract line icons (a plus, an arrow, a spark).",
        "one large ornament of interlaced rounded loops (an abstract knot of six soft petals, drawn in thin white lines) in the centre "
        "under the display bay, wide soft rounded bands to both sides in slightly darker and lighter teal.",
    ),
    "gemini": (
        "CONCEPT: a deep night-dark surface (#131314) lit by a soft aurora of blue (#4285f4), violet (#9b72cb) and pink (#d96570): "
        "smooth gradients, four-pointed sparkle stars (four long thin points, concave sides), fine starfield, elegant and airy.",
        "ribbons of blue-violet-pink gradient light sweeping up each wing, several four-pointed sparkle stars of different sizes, "
        "hairline arcs, a fine dust of tiny stars.",
        "one large four-pointed sparkle star with a soft gradient glow in the centre under the display bay, wide aurora ribbons "
        "flowing out to both sides, sparse tiny stars.",
    ),
    "grok": (
        "CONCEPT: deep space in pure black and white: a black void with a fine starfield, thin white technical lines, orbits and "
        "trajectories, the feel of an observatory's chart; monochrome, no colour at all.",
        "thin white orbit ellipses and trajectory lines crossing each wing, small bracket marks, tick scales, a few bright stars with "
        "fine cross flares, dotted constellation lines.",
        "a large black-hole motif in the centre under the display bay: a black disc with a thin bright ring and a fine accretion "
        "ring drawn in white lines, long diagonal slash lines and sparse stars to both sides.",
    ),
    "claude": (
        "CONCEPT: warm cream paper (#f4efe6) with hand-drawn ink in terracotta (#d97757): the feel of a thoughtful notebook: soft paper "
        "grain, loose pen doodles, gentle and literary; cream, terracotta and a little warm brown.",
        "hand-drawn terracotta doodles on each wing: a sunburst of uneven pen strokes, a loose spiral scribble with a trailing line, "
        "small stars and dashes, a pressed-paper stamp ring, faint ruled lines.",
        "one large hand-drawn sunburst of a dozen uneven tapered brush strokes in terracotta in the centre under the display bay, "
        "long loose pen flourishes to both sides, a few scattered ink dots, the paper's grain showing.",
    ),
    "aqua": (
        "CONCEPT: a white mecha's console: glossy white armour panels with 45-degree cut corners over dark teal glass (#06262b), "
        "aqua-cyan (#22e0e6) light lines, small hot-pink (#ff3f93) accents; clean science-fiction hardware.",
        "white armour plates with cut corners and panel seams on each wing, a row of slanted aqua vent slits, small pink hazard "
        "chevrons, hex bolts, thin aqua light guides.",
        "a large circular reactor emblem in the centre under the display bay: a white ring cut by three arrow-like notches around "
        "an aqua glowing core, white shoulder plates to both sides over dark teal glass, a few pink accent lines.",
    ),
    "steel": (
        "CONCEPT: professional studio hardware in dark slate and gunmetal: brushed and bead-blasted metal panels, countersunk screws, "
        "embossed plus and cross marks, a cool steel-blue (#58aaf0) light glowing from recessed slots; calm, heavy, industrial.",
        "a milled panel on each wing with a recessed slot glowing steel blue, two knurled knobs, a small grid of embossed plus marks, "
        "countersunk screws, fine brushed grain.",
        "a wide recessed plate in the centre under the display bay with a large embossed cross mark and a thin blue light slot, long "
        "ventilation louvres to both sides, heavy chamfered edges.",
    ),
    "rainbow": (
        "CONCEPT: a cheerful toy console of glossy white plastic and cut paper with candy colours: red, orange, yellow, green, sky blue, "
        "purple and pink capsules, sprinkles and round buttons, soft pastel shadows; bright, sweet, playful.",
        "candy-coloured capsule shapes lying at playful angles on each wing, round glossy buttons in different colours, tiny sprinkle "
        "dots and small five-pointed stars, soft paper-cut layers.",
        "a navy-blue half dome with a rainbow capsule inside it in the centre under the display bay, big soft rounded white shapes "
        "and long pastel candy stripes to both sides, a scatter of sprinkles.",
    ),
    "noir": (
        "CONCEPT: flat graphic design in black and pure red (#ff1a2b) with a little white: bold diagonal red bands, halftone dot "
        "clusters, glitch blocks and thin technical lines, the feel of a cyberpunk poster. Only black, red and white, completely flat.",
        "bold diagonal red bands cutting across each wing, clusters of halftone dots, small glitch blocks of red and white rectangles, "
        "rows of chevron arrows, thin white corner brackets.",
        "wide dark-red diagonal bands and a long thin red curve sweeping through the lower body, one large glitch-block ornament in "
        "the centre under the display bay, sparse dot clusters and thin lines.",
    ),
    "magenta": (
        "CONCEPT: a black war machine with crimson light: matt black angular armour, razor-thin crimson (#f0145a) and hot-pink light "
        "lines, polished silver bars, pointed hexagonal panels; aggressive and sharp.",
        "pointed hexagonal armour panels outlined in crimson light on each wing, slanted crimson hazard bars, a small crimson lamp, "
        "silver bars, sharp chamfers.",
        "a large pointed emblem like a blade's guard in silver and crimson in the centre under the display bay, long angular armour "
        "plates swept back to both sides with thin crimson light seams.",
    ),
    "wire": (
        "CONCEPT: line art in thin white lines on near-black (#0b0b0d): a draughtsman's technical drawing: orbits, circles, tray "
        "outlines, dotted grids and tick scales, with one soft white glow; monochrome, elegant, airy.",
        "thin white line drawings on each wing: concentric arcs and an orbit ellipse, a small dotted grid, tick scales, tiny "
        "line-drawn four-point stars, short dashed lines.",
        "a large open ring with two small dots drawn in thin white lines in the centre under the display bay over a soft white glow, "
        "long orbit ellipses sweeping out to both sides, a sparse dotted grid.",
    ),
    "astral": (
        "CONCEPT: a night sky as an old star atlas: deep navy (#0a1230 to #16245a) with gold (#f2c14e) filigree lines, constellations, "
        "moon phases and small sparkling stars; rich, calm and precious.",
        "gold constellation lines with star points on each wing, a small row of moon phases, a gold compass-like ring with tick marks, "
        "tiny sparkling stars, fine gold filigree corners.",
        "a large winged four-pointed star emblem in gold and white in the centre under the display bay, wide thin gold orbit arcs of "
        "a star chart sweeping to both sides, a dusting of small stars.",
    ),
}


#: the display bay of each: a dark, even ground the read-outs are written on in light type
BAYS = {
    'standard': 'It is a pane of dark smoked glass, near black (#0b0c10).',
    'prism': 'It is a plate of deep sapphire-blue glass (#16245a), dark and even.',
    'sky': 'It is a pane of clear dark-blue glass (#123a6e) through which a darker, calm sky shows, even in tone.',
    'fire': 'It is a pane of black glass (#0b0b0d) in a chrome frame.',
    'gpt': 'It is a flat plate of dark green-black (#0d1f1a), even and matt.',
    'gemini': 'It is a pane of black glass (#0b0b0c), even and matt.',
    'grok': 'It is pure black (#000000), even and matt.',
    'claude': 'It is a sheet of dark warm-brown ink-coloured paper (#2a211c), even and matt.',
    'aqua': 'It is a pane of very dark teal glass (#04191d), even and matt.',
    'steel': 'It is a pane of near-black glass (#0c0f13), even and matt.',
    'rainbow': 'It is a plate of deep navy blue (#15155c), even and matt.',
    'noir': 'It is pure black (#000000), even and matt.',
    'magenta': 'It is a pane of black glass (#08080a), even and matt.',
    'wire': 'It is near-black (#070708), even and matt, outlined by one thin white line.',
    'astral': 'It is a pane of very dark navy (#070d24), even and matt.',
}


def prompt_of(gear: str) -> str:
    concept, wings, body = PLATES[gear]
    return HEAD + concept + LAYOUT.format(wings=wings, body=body, bay=BAYS[gear]) + TAIL


def generate(prompt: str, pictures: list[bytes]) -> tuple[bytes, dict]:
    parts: list[dict] = [{"inlineData": {"mimeType": "image/png", "data": base64.b64encode(p).decode()}} for p in pictures]
    parts.append({"text": prompt})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "21:9", "imageSize": "2K"}, "thinkingConfig": {"thinkingLevel": "MEDIUM"}},
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


def make(refs: Path, gears: list[str]) -> None:
    TRIES.mkdir(parents=True, exist_ok=True)
    layout = guide()
    (TRIES / "guide.png").write_bytes(layout)
    for gear in gears:
        n = 1 + sum(1 for k in record() if k.startswith(f"{gear}-"))
        prompt = prompt_of(gear)
        flat = (refs / f"flat-{gear}.png").read_bytes()
        try:
            png, usage = generate(prompt, [flat, layout])
        except Exception as e:  # one picture failing does not stop the others
            print("failed:", gear, str(e)[:300])
            continue
        key = f"{gear}-{n}"
        (TRIES / f"{key}.png").write_bytes(png)
        rec = record()
        rec[key] = {"model": MODEL, "aspect": "21:9", "size": "2K", "pictures": [f"flat-{gear}.png (the deck as the game draws it in code)", "guide.png (the layout)"], "flat_sha256": hashlib.sha256(flat).hexdigest(), "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"), "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage}
        keep(rec)
        print("made:", key, len(png), usage.get("totalTokenCount"))


def pick(gear: str, n: int) -> None:
    key = f"{gear}-{n}"
    image = Image.open(TRIES / f"{key}.png").convert("RGB")
    image = image.resize((STORED, round(STORED * image.height / image.width)), Image.LANCZOS)
    path = OUT / f"{gear}.jpg"
    image.save(path, "JPEG", quality=93, subsampling=0)
    rec = record()
    for k, entry in rec.items():
        if k.startswith(f"{gear}-"):
            entry["picked"] = k == key
    keep(rec)
    print("picked:", key, "->", path.relative_to(ROOT), path.stat().st_size)


def main() -> None:
    args = sys.argv[1:]
    if len(args) >= 3 and args[0] == "make" and all(g in PLATES for g in args[2:]):
        make(Path(args[1]), args[2:])
    elif len(args) == 3 and args[0] == "pick" and args[1] in PLATES:
        pick(args[1], int(args[2]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
