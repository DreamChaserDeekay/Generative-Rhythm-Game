"""Makes the sky skin's pictures with the image model (the gears' other pictures were made the same
way: assets-src/PROVENANCE.md) and keeps what comes back in assets-src/gears/sky/_tries/ (not in the
repository); the one picked is copied to assets-src/gears/sky/<name>.jpg by hand and built into the
game's media by build_gears.py.

    GOOGLE_API_KEY=... python scripts/assets/make_sky_pictures.py plate

Everything is described in words: no picture of another game, and none of the pictures a player sent
as a reference, is sent to the model. Each try costs money: it runs only for the names given.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRIES = ROOT / "assets-src" / "gears" / "sky" / "_tries"
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"

# name: (aspect ratio, size, prompt)
PICTURES: dict[str, tuple[str, str, str]] = {
    # the deck's sky: a flat painting the gear's code lays under its strip of dashes and writes the readouts on
    "plate": (
        "21:9",
        "2K",
        """A wide, flat 2D background painting of a clear daytime sky with white cumulus clouds, in the clean manner of a modern anime background painting: matte, soft cel shading, simple shapes, no photographic detail, no noise, no grain.

It is used as a flat texture inside a game's interface, so it must be a straight-on, undistorted picture: no horizon line, no ground, no sea, no sun, no lens flare, no rays of light, no stars, no birds, no aircraft, no text.

Composition, exactly:
- The top fifth of the picture is plain clear sky, a deep clear blue (#2f7fd6), nothing in it.
- Going down, the sky's blue eases lighter: a mid blue (#4d9ee6) across the middle of the picture, a pale sky blue (#8ccbf4) by two thirds of the way down.
- Two large white cumulus clouds rise from the lower-left and lower-right corners. The left one fills the left quarter of the width; its highest billow, at the far left edge, reaches up to about 30% of the way down from the top. The right one fills the right quarter of the width; its highest billow, at the far right edge, reaches up to about 40% of the way down from the top. Both slope down toward the middle of the picture. Their tops are round and billowing, a bright clean white; their folds and undersides are shaded in a pale blue (#b9d8f2).
- The middle half of the width is completely clear sky from the top of the picture down to 60% of its height: no cloud, no wisp, nothing there at all (white text is written there by the game).
- Two or three small, distant clouds with flat bases sit low beside the two big ones, never in the middle.
- Two or three very thin, faint white wind trails cross the whole width in long, gentle arcs, hairline thin, behind the clouds.
- The bottom third of the picture is a continuous sea of white cloud seen from the side, its top edge billowing and joining the two big clouds; below its top edge it falls evenly into soft pale-blue shade toward the bottom edge of the picture.

Colours: only these blues and white, the shading a pale blue; no yellow, no orange, no pink, no purple, no grey storm cloud. Calm, even light from the upper left. Edges crisp yet soft. No vignette, no frame, no border, no watermark, no text, no letters, no numbers.""",
    ),
}


def generate(prompt: str, aspect: str, size: str) -> tuple[bytes, dict]:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": size}, "thinkingConfig": {"thinkingLevel": "MEDIUM"}},
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
    TRIES.mkdir(parents=True, exist_ok=True)
    record_file = TRIES / "record.json"
    record = json.loads(record_file.read_text()) if record_file.exists() else {}
    for name in sys.argv[1:]:
        aspect, size, prompt = PICTURES[name]
        n = 1 + sum(1 for k in record if k.startswith(name + "-"))
        try:
            png, usage = generate(prompt, aspect, size)
        except Exception as e:  # one picture failing does not stop the others
            print("failed:", name, str(e)[:300])
            continue
        key = f"{name}-{n}"
        (TRIES / f"{key}.png").write_bytes(png)
        record[key] = {"model": MODEL, "aspect": aspect, "size": size, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"), "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest()[:16], "usage": usage}
        record_file.write_text(json.dumps(record, ensure_ascii=False, indent=1))
        print("made:", key, len(png), usage.get("totalTokenCount"))


if __name__ == "__main__":
    main()
