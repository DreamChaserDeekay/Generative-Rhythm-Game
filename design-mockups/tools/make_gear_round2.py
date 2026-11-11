"""Second round of concept pictures for PRISM: the gear's deck, the judgement and combo lettering, the HUD round the track and the long note.

    GOOGLE_API_KEY=... python3 design-mockups/tools/make_gear_round2.py [id ...]

The notes of the first round were approved and are left out. `screen` redraws a screenshot of the game as it is
(docs/screenshots/44-prism-7k.png, sent with the prompt) so the result compares with it part for part; the sheets are drawn
from the prompt alone. Concept pictures to choose a direction from, not game assets.
Writes _src/gear-concepts/r2-<id>.png (as generated, not committed), gear-concepts/r2-<id>.jpg (1600 px wide) and adds to
_src/gear-concepts/record.json (model, prompt in full, reference picture, token counts). The key is read from the
environment and never written.
"""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "_src" / "gear-concepts"
OUT = ROOT / "gear-concepts"
SHOT = ROOT.parent / "docs" / "screenshots" / "44-prism-7k.png"
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"
MADE = "2026-11-11"
TAIL = " Original design: it must not resemble any existing game's interface. No logos, no watermark, no characters, no people."

THEME = (
    "Theme PRISM: cut crystal and light. Everything is made of faceted clear crystal, bevelled optical glass and satin black anodised "
    "aluminium, lit from inside by white light that splits into thin rainbow dispersion at cut edges; colours are ice white, cobalt "
    "and azure blue with small spectral accents. One consistent visual language across the gear, the lettering and the panels: "
    "45-degree chamfered corners, facet lines, hairline light-guides, a hexagonal gem motif. "
)

# id: (reference picture or None, prompt)
PICTURES: dict[str, tuple[Path | None, str]] = {
    "screen": (
        SHOT,
        "This is a screenshot of our PC rhythm game. Redraw it as polished concept art in the same layout and camera, 16:9. "
        "KEEP exactly as they are: the lane layout, the falling glass bar notes, the blue judgment line and the position of every element. "
        "REDESIGN with far more character, all in one consistent crystal theme: "
        "(1) the control deck below the judgment line: now a rich sculpted crystal console, a large faceted gem set in a machined "
        "ring at the centre with light inside it, cut-crystal wings spreading to both sides with facet planes, inlaid hairline "
        "light-guides, small hexagonal gem studs, rainbow dispersion along the cut edges, engraved fine ornament; "
        "(2) the side rails: bevelled crystal rails with facets and a line of light, crystal end caps where they meet the deck; "
        "(3) the combo number and the word COMBO in the middle of the track: custom display lettering that looks cut from crystal, "
        "faceted bevelled glyphs with a bright edge and a thin spectral fringe; "
        "(4) the judgment text 'MAX 100%': the same crystal lettering family, sharper and smaller, with a small gem-cut underline; "
        "(5) the HUD around the track (song title plate top-left, SCORE / RATE / MAX COMBO / SPEED on the left, the gauge with its "
        "name and CLEAR mark on the right, the time): each set in a small chamfered glass plate with a hairline frame and a facet "
        "highlight, typography matching the crystal lettering, the gauge a column of cut crystal segments. "
        "Keep the texts the same words and numbers as in the screenshot, spelled correctly. " + THEME,
    ),
    "deck": (
        None,
        "A design sheet on a near-black background, 16:9: three different designs, stacked one above the other with generous spacing, "
        "of the 'gear bottom' of a PC rhythm game, the wide control deck that sits below the judgment line of a seven-lane note "
        "highway, each drawn as a wide trapezoid strip seen in perspective from above (wider at the bottom), with the ends of the two "
        "side rails joining it. Each must be unmistakably crystal, rich and sculpted, not a flat plate. "
        "Design A 'GEODE': a black anodised shell split open to show a bed of clear crystal points inside, lit from below, one large "
        "hexagonal gem in the centre. Design B 'CHANDELIER': a symmetrical console of cut-crystal wings with long facet planes fanning "
        "out from a central brilliant-cut gem in a machined ring, hairline light-guides, rainbow dispersion on the edges. "
        "Design C 'OPTICAL BENCH': a precision instrument, a row of triangular glass prisms and lenses on a black rail splitting a "
        "white beam into a spectrum that runs across the deck, engraved fine tick ornament. No text. " + THEME,
    ),
    "type": (
        None,
        "A typography and HUD design sheet on a near-black background, 16:9, for a PC rhythm game, laid out in a tidy grid. "
        "Left half, the in-track lettering in one custom display typeface that looks cut from crystal (faceted bevelled glyphs, "
        "bright edges, thin spectral fringe, italic and fast): the big combo number '128' with the small word 'COMBO' under it; the "
        "judgment texts 'MAX 100%', 'MAX 90%', 'MAX 50%', 'BREAK' (BREAK in cracked ruby red crystal); 'FEVER x3' as a rainbow "
        "dispersion badge; the digits '0123456789'. "
        "Right half, the HUD plates in the same family: a song title plate with a square jacket slot, the title 'Demo Groove' and a "
        "difficulty chip 'EXPERT 9'; a stats plate with 'SCORE 199,357', 'RATE 100.00%', 'MAX COMBO 62'; a 'SPEED 3.00' plate; a "
        "vertical gauge made of cut crystal segments with the name 'LUMEN', a 'CLEAR' mark and '61%'; a time readout '0:27'. "
        "Each plate is chamfered smoked glass with a hairline light frame and one facet highlight. All words spelled exactly as "
        "given. " + THEME,
    ),
    "long": (
        None,
        "A design sheet on a near-black background, 16:9: four different designs of a 'long hold note' for a PC rhythm game, side "
        "by side, each drawn vertically as it travels down a lane (head at the bottom, tail at the top), each shown twice: idle, "
        "and being held (lit from inside, brighter). The tap note of the game is a short wide bevelled bar of clear crystal glass "
        "with a bright leading edge; each long note starts with that same bar as its head. "
        "Design A 'TUBE': a clear glass tube narrower than the head with a thin thread of light inside, wedge-cut tail. "
        "Design B 'FULL PRISM': a long triangular glass prism as wide as the head, a ridge of light down its middle, facets "
        "either side, tail a second bar with a notch. Design C 'CRYSTAL SHAFT': a hexagonal crystal column as wide as the head "
        "with visible facet planes and internal reflections, pointed crystal tip as its tail. Design D 'LIGHT RIBBON': a flat "
        "wide band of frosted glass with two bright edge lines and a soft spectrum inside, tail a thin bright bar. "
        "No text. " + THEME,
    ),
}

# Third round: the second was too ornate. Quiet, minimal crystal; the rails and the combo plain.
MINIMAL = (
    "Art direction: MINIMAL and restrained, the taste of a high-end audio product or a camera lens, not fantasy. Mostly satin black "
    "anodised aluminium with very few, precise parts of clear cut glass. Large calm flat surfaces, a lot of empty space, two or "
    "three facets at most, one thin white line of light, at most one tiny hint of rainbow dispersion at a single edge. No wings, "
    "no gem clusters, no ornament, no engraving, no glow bloom, no lens flare, no sparkles. Colours: black, graphite, clear "
    "glass, white light, a little azure. It must look designed by an industrial designer, crisp and quiet. "
)
PICTURES["deck-min"] = (
    None,
    "A design sheet on a near-black background, 16:9: three different minimal designs, stacked one above the other with generous "
    "spacing, of the 'gear bottom' of a PC rhythm game, the wide control deck that sits below the judgment line of a seven-lane "
    "note highway, each drawn as a wide low trapezoid strip seen in perspective from above (wider at the bottom), with plain "
    "black metal side rails joining it at its upper corners. "
    "Design A 'SINGLE PRISM': a flat satin black plate with one long, low triangular bar of clear glass lying across its "
    "centre, a thin white line of light inside it, a faint spectrum where the light leaves one end. "
    "Design B 'INLAY': a flat satin black plate with a single wide chamfered window of clear smoked glass set flush in it, "
    "one diagonal facet line across the glass, a hairline of white light along the window's upper edge, a small hexagonal clear "
    "stud at the centre. "
    "Design C 'EDGE': a thick slab of clear glass with a polished 45-degree bevel along its upper edge that catches a line of "
    "light, sitting on a black base, nothing on its surface except one small engraved hexagon outline at the centre. No text. " + MINIMAL,
)
PICTURES["screen-min"] = (
    SHOT,
    "This is a screenshot of our PC rhythm game. Redraw it as clean concept art in the same layout and camera, 16:9. "
    "KEEP exactly as they are: the lane layout, the falling glass bar notes, the blue judgment line, the plain black metal side rails "
    "with their thin line of light, and the position of every element. Change only these, quietly: "
    "(1) the control deck below the judgment line: a flat satin black plate with one wide chamfered window of clear smoked glass set "
    "flush in it, one long low triangular bar of clear glass lying across its centre with a thin white line of light inside and a "
    "faint spectrum at one end, nothing else on it; "
    "(2) the combo number and the word COMBO: a clean, sharp italic sans-serif in plain white with a thin dark outline, no facets, no "
    "glass effect; (3) the judgment text 'MAX 100%': the same typeface, 'MAX' white and '100%' in a soft azure gradient, a hairline "
    "under it; (4) the HUD around the track (song title top-left, SCORE / RATE / MAX COMBO / SPEED on the left, the gauge on the "
    "right, the time): each on a small flat plate of smoked glass with chamfered corners and a hairline frame, labels in azure, "
    "values in white, the gauge a plain column of thin segments. The gauge's name reads 'FEVER' (not LUMEN). Keep all other texts "
    "the same words and numbers as in the screenshot, spelled correctly. " + MINIMAL,
)

# Fourth round: the minimal one lost the crystal. Crystal as the MATERIAL, built the way commercial rhythm-game gears are
# built (a body of layered panels with working-looking parts), with no glitter.
CRYSTAL = (
    "Material: the gear is carved from thick blocks of clear and lightly frosted crystal glass, like a solid acrylic or quartz "
    "trophy block, set in a slim satin graphite frame. You see the glass's thickness: polished bevels, crisp facet edges, the "
    "darker edge seen through the block, soft light carried inside the glass and gathered along its edges. Calm studio lighting. "
    "STRICTLY NO glitter: no sparkles, no star glints, no lens flare, no bloom, no rainbow streaks, no light rays, no smoke. "
    "At most a faint cool tint (ice blue) inside the glass. Colours: clear glass, frost white, graphite, a little azure light. "
)
BUILD = (
    "Construction, as commercial arcade-style rhythm game gears are built (do not copy any existing one): the gear is one designed "
    "object, not a decoration. Below the judgment line is a 'key deck': a row of key pads, exactly one per lane and aligned to the "
    "lanes (a wider pad for the wider far-left lane), each pad a block of crystal with a bevelled top like a real key cap; in "
    "front of the pads a slim centre name plate flanked by two small module panels with a few flush functional details (a "
    "slot, two small indicator windows, a seam). Angular chamfered panel cuts, layered plates, clean seams, a few tiny "
    "fasteners. The two side rails are slim glass light-guides in graphite channels that thicken into solid shoulder blocks "
    "where they meet the deck. Symmetrical, sturdy, engineered. "
)
PICTURES["deck-build"] = (
    None,
    "A design sheet on a near-black background, 16:9: three different designs, stacked one above the other with generous spacing, "
    "of the 'gear bottom' of a PC rhythm game with a seven-lane note highway plus one wider lane at the far left, each drawn as a "
    "wide low trapezoid seen in perspective from above (wider at the bottom), the lower ends of the two side rails joining it. "
    "Design A 'KEY BLOCKS': eight separate crystal key pads in a row filling the deck, thin graphite gaps between them, a slim "
    "centre plate in front. Design B 'MONOLITH': one long crystal slab whose top is cut into eight shallow bevelled key facets, "
    "graphite shoulder blocks at both ends, a centre plate inset in its front face. Design C 'CONSOLE': a graphite console with "
    "eight inset crystal key pads, a hexagonal crystal dial in a ring at the left end (over the wider lane), a frosted glass "
    "panel with two indicator windows at the right end. No text. " + BUILD + CRYSTAL,
)
PICTURES["screen-build"] = (
    SHOT,
    "This is a screenshot of our PC rhythm game. Redraw it as clean concept art in the same layout and camera, 16:9. "
    "KEEP exactly as they are: the lane layout, the falling glass bar notes, the blue judgment line, the top-left song information "
    "(do not restyle it at all) and the position of every element. Redesign the gear (the deck below the judgment line and the two "
    "side rails) as described below. Also restyle, plainly: the combo number and 'COMBO' in a clean sharp italic sans-serif, "
    "white, no glass effect; 'MAX 100%' in the same typeface, 'MAX' white and '100%' soft azure; the left score block (SCORE, "
    "RATE, MAX COMBO, SPEED) and the right gauge each on a flat plate of frosted crystal glass with chamfered corners that is "
    "attached to the gear's side rail like a mounted panel; the gauge's name reads 'FEVER' (not LUMEN). Keep all other texts the "
    "same words and numbers as in the screenshot, spelled correctly. " + BUILD + CRYSTAL,
)


def generate(prompt: str, ref: Path | None) -> tuple[bytes, dict]:
    parts: list[dict] = []
    if ref:
        parts.append({"inlineData": {"mimeType": "image/png", "data": base64.b64encode(ref.read_bytes()).decode()}})
    parts.append({"text": prompt})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "16:9", "imageSize": "2K"}, "thinkingConfig": {"thinkingLevel": "MEDIUM"}},
    }
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST")
    req.add_header("x-goog-api-key", os.environ["GOOGLE_API_KEY"])
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=300) as r:
        out = json.loads(r.read())
    for cand in out.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            if "inlineData" in part:
                return base64.b64decode(part["inlineData"]["data"]), out.get("usageMetadata", {})
    raise RuntimeError("no image in the answer: " + json.dumps(out)[:300])


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    record_file = RAW / "record.json"
    record = json.loads(record_file.read_text()) if record_file.exists() else {}
    only = set(sys.argv[1:])
    for pid, (ref, prompt) in PICTURES.items():
        name = f"r2-{pid}"
        if only and pid not in only:
            continue
        if not only and (RAW / f"{name}.png").exists():
            continue
        full = prompt + TAIL
        try:
            png, usage = generate(full, ref)
        except Exception as e:  # one picture failing does not stop the others
            print("failed:", name, str(e)[:300])
            continue
        (RAW / f"{name}.png").write_bytes(png)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAW / f"{name}.png"), "-vf", "scale=1600:-2:flags=lanczos", "-q:v", "3", str(OUT / f"{name}.jpg")], check=True)
        record[name] = {"concept": "PRISM", "kind": pid, "model": MODEL, "prompt": full, "reference": str(ref.relative_to(ROOT.parent)) if ref else None, "imageSize": "2K", "usage": usage, "made": MADE}
        record_file.write_text(json.dumps(record, ensure_ascii=False, indent=1))
        print("made:", name, usage.get("totalTokenCount"))


if __name__ == "__main__":
    main()
