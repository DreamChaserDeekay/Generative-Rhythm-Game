"""Makes the sky skin's pictures with the image model (the gears' other pictures were made the same
way: assets-src/PROVENANCE.md) and keeps what comes back in assets-src/gears/sky/_tries/ (not in the
repository); the one picked is copied to assets-src/gears/sky/<name>.jpg by hand and built into the
game's media by build_gears.py.

    GOOGLE_API_KEY=... python scripts/assets/make_sky_pictures.py plate feather

No picture of another game, and none of the pictures a player sent as a reference, is sent to the
model. The deck's painting is asked for with a swatch of this skin's own concept picture (the clouds
of design-mockups/gear-concepts/r2-skin-sky-c3.jpg, itself made with the same model from words), so
its clouds are painted as the concept's are; the swatch is cut here (swatch()). Each try costs money:
it runs only for the names given.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TRIES = ROOT / "assets-src" / "gears" / "sky" / "_tries"
CONCEPT = ROOT / "design-mockups" / "gear-concepts" / "r2-skin-sky-c3.jpg"
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"

# The concept's two clouds on its deck, clear of its readouts (px of the 1600 px wide concept: left, top, right, bottom).
SWATCH_BOXES = ((410, 752, 640, 850), (1040, 780, 1200, 850))


def swatch() -> bytes:
    """The concept's clouds as one small picture (PNG): the two crops side by side, twice their size."""
    concept = Image.open(CONCEPT).convert("RGB")
    crops = [concept.crop(box) for box in SWATCH_BOXES]
    tall = max(c.height for c in crops)
    crops = [c.resize((round(c.width * tall / c.height) * 2, tall * 2), Image.LANCZOS) for c in crops]
    sheet = Image.new("RGB", (sum(c.width for c in crops) + 16, tall * 2), (58, 130, 208))
    x = 0
    for c in crops:
        sheet.paste(c, (x, 0))
        x += c.width + 16
    out = io.BytesIO()
    sheet.save(out, "PNG")
    return out.getvalue()


# name: (aspect ratio, size, whether the concept's swatch goes with it, prompt)
PICTURES: dict[str, tuple[str, str, bool, str]] = {
    # the deck's sky: a painting the gear's code lays under its strip of dashes and writes the readouts on
    "plate": (
        "21:9",
        "2K",
        True,
        """Image 1 is a small swatch that shows the look wanted: soft, fluffy, billowing cumulus clouds painted as an anime film's background art paints them, and the blue of the sky behind them. Take nothing from it but that look: how the clouds are painted (their soft volume, the many small round billows piled on one another, their feathered edges, their pale blue shading) and the sky's blue. Its framing and its composition do not matter.

Paint a wide background painting of a clear daytime sky with white cumulus clouds in that same manner. The clouds have real volume: each is built of many soft, rounded billows heaped on one another, big ones and small ones, their sunlit tops a clean bright white, their folds and undersides shaded softly in pale blue and blue-grey, their edges soft and feathered, with small wisps drifting off them. Soft brushwork, as in a hand-painted anime film background. They are not flat shapes: no outlines, no hard-edged cel shading, no vector look, no cartoon clouds.

It is used as a flat texture inside a game's interface, so it must be a straight-on, undistorted picture: no horizon line, no ground, no sea, no sun, no lens flare, no rays of light, no stars, no birds, no aircraft, no text.

Composition, exactly:
- The top fifth of the picture is plain clear sky, a deep clear blue (#2f7fd6), nothing in it.
- Going down, the sky's blue eases lighter: a mid blue (#4a98e2) across the middle of the picture, a pale sky blue (#86c6f2) by two thirds of the way down.
- A large cumulus rises from the lower-left corner. It fills the left 30% of the width; its highest billow, at the far left edge, reaches up to about 20% of the way down from the top; from there it comes down toward the middle of the picture in big soft steps and ends by a third of the width.
- A second cumulus, a little lower, rises from the lower-right corner. It fills the right quarter of the width; its highest billow, at the far right edge, reaches up to about 30% of the way down from the top; it comes down toward the middle in the same way.
- The middle 40% of the width is completely clear sky from the top of the picture down to 60% of its height: no cloud, no wisp, nothing there at all (the game writes white text there).
- One or two small soft tufts of cloud sit low beside the two big ones, below the half-way line, never in the middle.
- Two or three very thin, faint white wind trails cross the whole width in long, gentle arcs, hairline thin, behind the clouds.
- The bottom third of the picture is a continuous sea of the same soft cumulus seen from the side, its top edge billowing and joining the two big clouds; below its top edge it falls evenly into soft pale-blue shade toward the bottom edge of the picture.

Colours: only these blues and white, the shading pale blue and blue-grey; no yellow, no orange, no pink, no purple, no dark storm cloud. Calm, even daylight from the upper left. No vignette, no frame, no border, no watermark, no text, no letters, no numbers.""",
    ),
    # the mark over the score: one white feather on a flat ground the build keys out
    "feather": (
        "1:1",
        "1K",
        False,
        """One single white bird's feather, seen flat from directly above, centred, on a perfectly flat, uniform, pure magenta (#ff00ff) background.

The feather leans to the right, about 30 degrees from upright, its tip at the upper right. Its vane is full and softly curved, widest a little above its middle, tapering to a soft point at the tip; one clear split opens in its right edge about two thirds of the way up, and a smaller one lower on its left edge. A fine quill runs up through the vane as a thin pale-blue line and comes out below it as a short, bare, slightly curved shaft pointing to the lower left.

A clean, elegant illustration, as a game's interface icon is drawn: the feather a clean white, with only the faintest pale-blue (#cfe6fb) shading along the quill and toward the vane's lower edge; smooth, crisp edges.

No outline round it, no shadow on the background, no glow, no gradient or texture in the background, nothing else in the picture: no second feather, no down, no text, no letters, no frame. The feather, shaft and all, fills about 70% of the picture's height; the flat magenta shows all round it.""",
    ),
}


def generate(prompt: str, aspect: str, size: str, picture: bytes | None) -> tuple[bytes, dict]:
    # the swatch first, where one goes with the prompt (the prompt calls it image 1)
    parts: list[dict] = [{"inlineData": {"mimeType": "image/png", "data": base64.b64encode(picture).decode()}}] if picture else []
    parts.append({"text": prompt})
    body = {
        "contents": [{"role": "user", "parts": parts}],
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
        aspect, size, with_swatch, prompt = PICTURES[name]
        n = 1 + sum(1 for k in record if k.startswith(name + "-"))
        picture = swatch() if with_swatch else None
        if picture:
            (TRIES / "swatch.png").write_bytes(picture)
        try:
            png, usage = generate(prompt, aspect, size, picture)
        except Exception as e:  # one picture failing does not stop the others
            print("failed:", name, str(e)[:300])
            continue
        key = f"{name}-{n}"
        (TRIES / f"{key}.png").write_bytes(png)
        record[key] = {"model": MODEL, "aspect": aspect, "size": size, "swatch": bool(picture), "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"), "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest()[:16], "usage": usage}
        record_file.write_text(json.dumps(record, ensure_ascii=False, indent=1))
        print("made:", key, len(png), usage.get("totalTokenCount"))


if __name__ == "__main__":
    main()
