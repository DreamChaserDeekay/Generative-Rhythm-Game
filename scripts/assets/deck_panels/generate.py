"""The call to the image model (generate): the prompt_*.py scripts take it from here, with MODEL and S. Under it, the trial
   this file was first written for (its picture, cut, became the crystal gear's place-holder slab: placeholder_prism.py):
   Trial: the crystal gear's lower panel, flat (2D). Only this project's own layout guide goes with the prompt: the
   reference picture is described in words (sending it was not permitted in this session).
   python3 generate.py <out name>"""
import base64, hashlib, io, json, os, sys, time, urllib.request, urllib.error
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S

MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"

#: the two readout windows, shares of the picture (left, top, right, bottom): the score's, the speed's
SCORE = (0.105, 0.05, 0.615, 0.275)
SPEED = (0.675, 0.075, 0.895, 0.25)


def cut(d, box, w, h, c=0.22):
    """An emerald cut: a rectangle with its corners cut off."""
    l, t, r, b = box[0] * w, box[1] * h, box[2] * w, box[3] * h
    k = (b - t) * c
    d.polygon([(l + k, t), (r - k, t), (r, t + k), (r, b - k), (r - k, b), (l + k, b), (l, b - k), (l, t + k)], fill=(0, 0, 0))


def guide() -> bytes:
    w, h = 2016, 864
    image = Image.new("RGB", (w, h), (112, 112, 112))
    d = ImageDraw.Draw(image)
    cut(d, SCORE, w, h)
    cut(d, SPEED, w, h)
    out = io.BytesIO(); image.save(out, "PNG"); return out.getvalue()


CRYSTAL = (
    "THE MATERIAL: one solid block of CUT CRYSTAL, like a big piece of optical glass or a rough-cut gemstone seen in a studio render: "
    "one mass cut into a few LARGE planar facets at hard, irregular angles (big triangles and trapezoids, not small sparkly ones); "
    "razor-sharp bright edges where facets meet; translucent ice-white, pale periwinkle blue and pale blue-violet glass with soft "
    "holographic gradients and refractions inside it, so that you look down into the stone and see its inner planes; some facets "
    "mirror-bright and nearly white, some clear and pale, a few darker blue. Cool, clean and luminous."
)
PROMPT = (
    "One picture comes with this request: a LAYOUT GUIDE only (never copy its grey): its two black shapes are where two READOUT WINDOWS "
    "go. Your picture has the same proportions as the guide.\n\n"
    "PAINT: the surface of the lower panel of our own rhythm game's gear (the wide control deck that lies under the note lanes), made "
    "of cut crystal, as production game art at the finish level of a top commercial rhythm game. It is used as a flat texture laid on "
    "the deck, so it must be a strictly top-down, orthographic, undistorted picture that fills the whole 21:9 frame edge to edge: no "
    "perspective, no horizon, no camera angle, no vignette, no frame or border round the picture, no background behind the crystal "
    "(the crystal covers everything).\n\n" + CRYSTAL + "\n\n"
    "DESIGN, exactly:\n"
    "- The whole panel is ONE slab of that cut crystal. Its beauty is only in its facets, its sharp edges and the light inside it. It "
    "is deliberately PLAIN and bold: NO wings, NO fans of crystal spikes, NO round medallion or emblem, NO rosette, NO gems set in metal "
    "rings, NO studs, NO filigree, NO metal ornament, NO symmetry. A few large facets cut at different angles, asymmetric, with a "
    "handful of long diagonal cut lines running across the slab.\n"
    "- READOUT WINDOWS (the two black shapes of the guide): the larger one (left of centre, in the upper part) is the SCORE window and "
    "the smaller one (at the right) is the SPEED window. In your picture each is ONE flat, polished facet of the same crystal, of deep "
    "sapphire-blue glass (#141f52), dark and even, exactly at the guide's place and size, with the same cut corners, edged by one thin "
    "bright bevel line like a cut facet's edge. The game writes white numbers on them, so the inside of both must stay completely empty "
    "and even: no text, no digits, no icons, no reflections, no gradients, no facet lines crossing them.\n"
    "- The TOP EDGE of the picture is where the panel meets a row of white crystal key caps; players see the upper third of the picture "
    "most, so the finest cutting is there, around the two windows. The lower two thirds are the same slab continuing toward the player "
    "with larger, calmer facets, growing gradually darker and plainer toward the bottom edge; the bottom tenth is almost plain.\n"
    "- Colours: ice white, pale blue, pale lavender-blue, with deeper blue in the shadowed facets; hairline rainbow dispersion only "
    "where a few facets meet. Bright but not blown out: the two dark windows must stand out clearly against it.\n"
    "- Keep the outer 3 % at the left and right edges calm (the game's rails cover them).\n\n"
    "No text, no letters, no numbers, no labels, no logos, no watermark, no stars, no people. Crisp, clean, high-resolution; even, soft "
    "lighting from the top edge; no strong cast shadows."
)


def generate(prompt, pictures, aspect):
    parts = [{"inlineData": {"mimeType": m, "data": base64.b64encode(p).decode()}} for m, p in pictures]
    parts.append({"text": prompt})
    body = {"contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "2K"}, "thinkingConfig": {"thinkingLevel": "MEDIUM"}}}
    last = "no answer"
    for attempt in range(6):
        req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST")
        req.add_header("x-goog-api-key", os.environ["GOOGLE_API_KEY"]); req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=420) as r:
                out = json.loads(r.read())
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read()[:200]!r}"
            if e.code not in (429, 500, 502, 503, 504): break
            time.sleep(25 * (attempt + 1)); continue
        except OSError as e:
            last = repr(e); time.sleep(6 * (attempt + 1)); continue
        for cand in out.get("candidates", []):
            for part in cand.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    return base64.b64decode(part["inlineData"]["data"]), out.get("usageMetadata", {})
        last = "no image in the answer: " + json.dumps(out)[:300]
    raise RuntimeError(last)


if __name__ == "__main__":
    name = sys.argv[1]
    g = guide(); open(S + 'inputs/p2/guide2d.png', 'wb').write(g)
    if name == 'guide': sys.exit(0)
    png, usage = generate(PROMPT, [("image/png", g)], "21:9")
    open(S + f'inputs/p2/{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "21:9", "size": "2K", "prompt": PROMPT, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"), "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": ["inputs/p2/guide2d.png (this project's own layout guide)"]}, open(S + f'inputs/p2/{name}.json', 'w'), indent=1)
    print("made", name, len(png), usage.get("totalTokenCount"))
