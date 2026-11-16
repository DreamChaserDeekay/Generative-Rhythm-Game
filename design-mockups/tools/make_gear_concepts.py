"""Makes the concept pictures for the gear / note / hit-effect redesign and records how each was made.

    GOOGLE_API_KEY=... python3 design-mockups/tools/make_gear_concepts.py [id ...]

Three concepts, two pictures each: `<concept>-screen` (the play screen) and `<concept>-parts` (the parts laid out).
These are concept pictures to choose a direction from, not game assets: the game's art is made after the choice.
Writes _src/gear-concepts/<id>.png (as generated, not committed), gear-concepts/<id>.jpg (1600 px wide) and
_src/gear-concepts/record.json (model, prompt in full, token counts). The key is read from the environment and never written.
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
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"
MADE = "2026-11-11"
TAIL = " Original design: it must not resemble any existing game. No text, no letters, no numbers, no logos, no watermark, no characters, no people."

SCREEN = (
    "Concept art of the play screen of an original PC rhythm game, 16:9, seen as the player sees it. "
    "A note highway in perspective runs from a vanishing point near the top centre down to the bottom of the screen, "
    "divided into eight lanes: one wider turntable lane at the far left and seven key lanes. "
    "Rectangular notes slide down the lanes toward a bright horizontal judgment line near the bottom. Show: about ten short tap notes "
    "at different distances in two alternating colours plus one accent colour in the centre lane; one long hold note with a distinct "
    "head cap, a dimmer body and a differently shaped tail cap, currently being held so its body glows where it meets the line; "
    "one wide translucent band (a 'side note') lying flat under the left half of the highway, clearly beneath the key notes; "
    "one differently shaped turntable note in the far-left lane; a hit effect bursting on one lane exactly at the judgment line; "
    "a soft light beam rising from one pressed lane behind the notes. Below the judgment line sits the control deck of the 'gear' "
    "(the frame of the highway) and two side rails run along the highway's edges. The floor of the highway is dark and plain so "
    "the notes are the brightest things on screen. Background outside the highway: near-black. "
)
PARTS = (
    "A clean design sheet on a near-black background, 16:9, orthographic front view, parts laid out in a tidy grid with generous "
    "spacing, for an original PC rhythm game. Row one: three tap notes (colour A, colour B, centre accent colour), one turntable "
    "note of a clearly different shape, each a wide short bar seen from the front-top. Row two: one long hold note laid horizontally "
    "showing head cap, body and a differently shaped tail cap, once idle and once glowing as held; one wide translucent 'side note' "
    "band with edge lines. Row three: a six-frame sequence of the hit effect from first bright frame to fade-out; one segment of "
    "the judgment line; one light beam for a pressed lane. Row four: a wide strip of the control deck below the judgment line and a "
    "short piece of the side rail. "
)

CONCEPTS = {
    "prism": (
        "PRISM",
        "Style: cut optical glass and light. Notes are thick bevelled bars of clear crystal glass with a saturated inner colour "
        "(ice white, cobalt blue, amber accent) and a razor-bright leading edge on the side that touches the judgment line. "
        "The long note body is a hollow glass tube with a thin thread of light inside that brightens and flows when held; its head is "
        "a full glass bar, its tail a slimmer wedge-cut cap. The side note is a sheet of frosted glass with two luminous edge lines "
        "in violet. The turntable note is a faceted ruby-red hexagonal prism. The hit effect is a short burst of spectral "
        "light: a white flash, then thin rainbow-dispersion shards fanning sideways along the judgment line, gone in six frames. "
        "The gear is satin black anodised aluminium with chamfered edges; the side rails are clear glass light-guides carrying a thin "
        "line of white light; the control deck is a slab of smoked glass over machined metal with a small round lens in the middle. "
        "Judgment line: a thin white-hot line with a faint spectral fringe. Mood: precise, elegant, laboratory optics.",
    ),
    "press": (
        "PRESS",
        "Style: bold print-shop graphics, risograph and letterpress, matte and flat, no gloss, no glow blur. Notes are solid matte "
        "slabs of opaque ink colour (warm paper white, fluorescent coral, sunflower yellow accent) with a hard offset shadow in dark "
        "navy and a thick clean edge on the side that touches the judgment line. The long note body is a paper ribbon with a row of "
        "halftone dots that fills solid when held; its head is a full slab, its tail a slab with a notched swallow-tail cut. "
        "The side note is a wide band of diagonal hatching in teal ink printed under the notes. The turntable note is a thick "
        "bright disc-segment shape in fluorescent green with a centre hole. The hit effect is a stamped impact: one hard-edged "
        "starburst in two flat colours with halftone-dot spray, snapping out and shrinking in six frames, no soft glow. "
        "The gear is heavy cast-iron printing-press machinery painted deep navy with brass type-slug details; side rails are steel "
        "ruler strips with tick marks (ticks only, no numerals); the control deck is a composing tray with rollers and a round "
        "ink plate. Judgment line: a fat solid coral bar with a crisp registration cross at each end. Highway floor: dark navy "
        "uncoated paper with faint grain. Mood: tactile, graphic, playful, very high contrast.",
    ),
    "signal": (
        "SIGNAL",
        "Style: laboratory test instruments and modular synthesisers, phosphor light on dark glass. Notes are flat bars of glowing "
        "phosphor (pale mint white, electric cyan, hot orange accent) with a hard bright core line on the side that touches the "
        "judgment line and a short afterglow trail behind. The long note body is a pair of thin parallel traces with a sine wave "
        "running between them that grows in amplitude when held; its head is a full bar, its tail a bracket-shaped end marker. "
        "The side note is a wide band of faint scan-lines in magenta with bright edge traces, under the notes. The turntable note "
        "is a thick double chevron in signal red. The hit effect is an oscilloscope event: a sharp vertical spike and one "
        "thin expanding ring that flatten back into the line in six frames, with a few square pixels of noise. "
        "The gear is a cream-grey powder-coated instrument chassis with ventilation slots, hex bolts and rubber feet; side rails "
        "are engraved measurement graticules (tick marks only); the control deck is a patch panel with round knobs, jack sockets, "
        "a few coloured patch cables and one small round scope screen. Judgment line: a steady green-white scope trace with a "
        "faint graticule behind it. Highway floor: very dark green-black glass with a barely visible grid. "
        "Mood: analog warmth, technical, calm.",
    ),
}


def generate(prompt: str) -> tuple[bytes, dict]:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
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
    for cid, (name, style) in CONCEPTS.items():
        for kind, lead in (("screen", SCREEN), ("parts", PARTS)):
            pid = f"{cid}-{kind}"
            if only and pid not in only and cid not in only:
                continue
            if not only and (RAW / f"{pid}.png").exists():
                continue
            full = lead + style + TAIL
            try:
                png, usage = generate(full)
            except Exception as e:  # one picture failing does not stop the others
                print("failed:", pid, str(e)[:300])
                continue
            (RAW / f"{pid}.png").write_bytes(png)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAW / f"{pid}.png"), "-vf", "scale=1600:-2:flags=lanczos", "-q:v", "3", str(OUT / f"{pid}.jpg")], check=True)
            record[pid] = {"concept": name, "kind": kind, "model": MODEL, "prompt": full, "imageSize": "2K", "usage": usage, "made": MADE}
            record_file.write_text(json.dumps(record, ensure_ascii=False, indent=1))
            print("made:", pid, usage.get("totalTokenCount"))


if __name__ == "__main__":
    main()
