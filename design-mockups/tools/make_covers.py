"""Makes the sample jackets of the mockup with an image model and records how each was made.

    GOOGLE_API_KEY=... python3 design-mockups/tools/make_covers.py

The songs' files carry no jacket the mockup may use (an embedded picture is someone else's), so the
jackets shown are generated here from prompts of our own: SAMPLE jackets, not the tracks' real art.
Writes _src/covers/<id>.png (as generated, not committed), public/covers/<id>.jpg (720 px) and _src/covers/record.json
(model, prompt in full, token counts). The key is read from the environment and never written.
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
RAW = ROOT / "_src" / "covers"
OUT = ROOT / "public" / "covers"
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"
TAIL = " No text, no letters, no numbers, no signs, no logos, no watermark."
# song id: (title it is shown with, prompt)
JACKETS = {
    "c7b45c868634e2eb": ("Fighting Stance", "Square album cover art. A boxer's taped fist frozen mid-punch, chalk dust bursting off the knuckles, shot from below against a pure black background, one hard crimson rim light from the left. Photorealistic, high contrast, razor-sharp detail."),
    "71aaa757a77f5ca7": ("Path of the Neutron", "Square album cover art. A cloud-chamber photograph of particle tracks: fine white spirals and straight streaks branching from one bright collision point, on a deep petrol-teal background with soft film grain. Scientific, elegant, minimal."),
    "ef26589e066cc2f6": ("Newer Wave", "Square album cover art. A calm sea at dusk seen through half-open horizontal window blinds, bands of peach and coral light falling across a dark room wall, the silhouette of one potted palm. Grainy 35mm film photograph, soft and nostalgic."),
    "048f03a2118b317b": ("Raving Energy (faster)", "Square album cover art. Hundreds of raised hands in a dark hall caught in a burst of white strobe light and falling yellow confetti, long-exposure light trails, seen from the stage. Euphoric, saturated yellow and black."),
    "d9169be3f95ad456": ("The Cannery", "Square album cover art. An endless row of dented bare tin cans riding a steel conveyor belt inside an old factory, warm tungsten work lamps, drifting steam, shallow depth of field, one can painted bright red. Cinematic photograph."),
    "053fa0e9dbb9a9ad": ("Chibi Ninja", "Square album cover art in crisp pixel art with a limited palette of indigo, magenta and cream. A tiny round ninja leaps between tiled rooftops in front of an enormous full moon, a few pixel stars. Clean hard pixels, no anti-aliasing."),
    "50be286d170f5a08": ("Juggernaut", "Square album cover art. A colossal armoured siege machine on tank treads emerging from a dust storm at dawn, tiny soldiers with plain banners in the foreground for scale, a low golden sun behind it. Epic matte painting in muted ochre and steel blue."),
    "2abb268a451c6b58": ("Funky Junky", "Square album cover art. A drum kit built from junkyard scrap, hubcap cymbals, oil-drum toms and a chrome bumper, set on cracked asphalt under hard midday sun. Saturated 1970s colour photograph in orange and turquoise."),
    "eb4d53bbf9a87461": ("Griphop", "Square album cover art. A violin leaning against stacked milk crates full of records in a bare concrete stairwell, lit by a harsh on-camera flash with deep shadows, slightly tilted framing. Gritty documentary photograph, desaturated with a touch of green."),
    "441d1b594a15b0ac": ("Exit the Premises", "Square album cover art. A long dark corridor with a glossy floor, at its end a single open door flooding the frame with white light, one lone silhouette walking out, a faint green glow on the walls. Symmetrical, minimal architectural photograph."),
}


def generate(prompt: str) -> tuple[bytes, dict]:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "1:1", "imageSize": "1K"}, "thinkingConfig": {"thinkingLevel": "MEDIUM"}},
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
    for sid, (title, prompt) in JACKETS.items():
        if only and sid not in only and title not in only:
            continue
        if not only and (RAW / f"{sid}.png").exists():
            continue
        full = prompt + TAIL
        try:
            png, usage = generate(full)
        except Exception as e:  # one jacket failing does not stop the others
            print("failed:", title, str(e)[:200])
            continue
        (RAW / f"{sid}.png").write_bytes(png)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAW / f"{sid}.png"), "-vf", "scale=720:720:flags=lanczos", "-q:v", "3", str(OUT / f"{sid}.jpg")], check=True)
        record[sid] = {"title": title, "model": MODEL, "prompt": full, "imageSize": "1K", "usage": usage, "made": "2026-11-10"}
        record_file.write_text(json.dumps(record, ensure_ascii=False, indent=1))
        print("made:", title, usage.get("totalTokenCount"))
    (OUT / "covers.json").write_text(json.dumps({sid: f"{sid}.jpg" for sid in JACKETS if (OUT / f"{sid}.jpg").exists()}))


if __name__ == "__main__":
    main()
