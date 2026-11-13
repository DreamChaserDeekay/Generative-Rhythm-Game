"""Asks the image model for a cut-out of a pair of the group illustration's characters on flat green, the parts its top edge cut
completed above it.   python3 -I cutout.py <work dir> <1-left|2-right> <try>

The prompts here are those of the two tries whose cut-outs the game's pictures were made of (the left pair's second, the right
pair's first). The other tries' prompts, whole, are in the records (assets-src/stage/fire/<piece>.json)."""
import base64, hashlib, io, json, os, sys, time, urllib.request, urllib.error

S = sys.argv[1]
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"

HEAD = (
    "The picture that comes with this request is a crop of a painted illustration laid on a taller canvas: the band of flat pure green "
    "(#00FF00) above the illustration is empty canvas.\n\n"
    "Make it a clean CUT-OUT of two of its characters on flat pure green, as a compositing artist prepares a character layer.\n\n"
)
KEEP = {
    '1-left': (
        "KEEP, exactly as painted (same place, same size, same pose, same faces, same colours, same brushwork: do not redraw, "
        "restyle, relight, sharpen, move or scale anything that is kept):\n"
        "1. The fox-eared woman at the top (a dark bob with orange tips, a silver top): all of her. Her head and BOTH pointed "
        "fox ears, her hair, her body, both arms and hands with their long nails, her legs in dark trousers, and ALL of her "
        "big fox TAILS: the large feathery tails in crimson, magenta and pink, with their glowing orange tips, that fan out "
        "behind her toward the upper left, every one of them.\n"
        "2. The blonde woman with the orange sunglasses and the red suit, in front of her: all of her. Her head, her hair with "
        "its silver hair clip, the sunglasses, the earrings, the red jacket with its silver collar and spiked shoulders, both "
        "arms, the red gloves with their long silver claws, her crossed legs.\n"
        "Add NOTHING to the two that is not in the picture: no horns, no whips, no tendrils, no new ornaments, no new limbs.\n"
        "Keep the LIGHT on them as it is painted: the warm orange and yellow fire light on their skin, their hair, the metal "
        "and the clothes stays exactly as it is (the orange reflections on the silver top too). Do not neutralise, darken or "
        "recolour them.\n"
        "\n"
        "REPLACE WITH FLAT PURE GREEN (#00FF00), completely: everything else. The room and its lights, the pale glow and the "
        "haze, smoke, embers and sparks, every separate flame and fire wisp in the air (the yellow flame curls in the air "
        "beside the fox-eared woman and over her raised hand), the silver pyramid and the seat the two sit on, and the other "
        "figure at the right edge (the silver-haired woman in the dark red dress, with the metal pods that float by her). None "
        "of that may remain, not even faintly. Where a kept woman is hidden behind something that is removed, leave green "
        "there: do not invent what was hidden.\n"
        "\n"
        "COMPLETE what the illustration's top edge cut off: the tips of the fox ears and the upper parts of the fox tails were "
        "cut by the illustration's top edge. Paint their missing parts up into the green band, in exactly the illustration's "
        "style, so that the ears end in their points and every tail ends in its own curled, feathery tip. Keep the completed "
        "tails compact: they curl over and end soon, none of them rising higher than the middle of the green band, and none "
        "touching the canvas's top or right edge. Add nothing else.\n"
        "\n"
    ),
    '2-right': (
        "KEEP, exactly as painted (same place, same size, same pose, same faces, same colours, same brushwork: do not redraw, "
        "restyle, relight, sharpen, move or scale anything that is kept):\n"
        "1. The silver-haired woman in the dark red dress who stands in the upper middle (her hair in a bun, her head leaning "
        "to one side): all of her. Her head, her hair, her dress with its silver ornaments, her arms and her pale sleeve, her "
        "legs, AND HER TWO FLOATING SHOULDER PODS: the two large claw-shaped pods of silver and dark metal with a glowing "
        "pink-violet crystal in them, one hovering over her at the upper left and one beside her head at the right. The pods "
        "are part of her and must stay whole.\n"
        "2. The woman crouching at the lower right in the wide pale hat, with pale pink hair and a mask over her eyes, a blade "
        "in her hand: all of her. Her hat, her hair, her mask, her body, her arms and gloves, the blade she holds and the "
        "weapon on her back, her legs.\n"
        "\n"
        "REPLACE WITH FLAT PURE GREEN (#00FF00), completely: everything else. The room and its lights, the pale glow and the "
        "haze, smoke, embers and sparks, every flame (also the pink and orange flames round the crouching woman), and the two "
        "other figures at the left (the blonde woman in the red suit with the orange sunglasses, and the fox-eared woman above "
        "her, with her hand and her flames). None of that may remain, not even faintly. Where a kept woman is hidden behind "
        "something that is removed, leave green there: do not invent what was hidden.\n"
        "\n"
        "COMPLETE what the illustration's top edge cut off: the pod at the upper left is cut by the illustration's top edge. "
        "Paint its missing top up into the green band, in exactly the illustration's style: it is the same kind of pod as the "
        "one beside her head, a closed claw of silver and dark metal that ends in a point. Add nothing else.\n"
        "\n"
    ),
}
TAIL = (
    "THE RESULT: the same framing and the same proportions as the picture given, the two women exactly where they are in it, on one "
    "perfectly flat, uniform pure green (#00FF00): no gradient, no shadow, no glow, no outline and no haze round them, and no green "
    "light on them. Crisp, clean edges, also round the hair, the fur and the claws. No text, no watermark."
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
            last = f"HTTP {e.code}: {e.read()[:300]!r}"
            if e.code not in (429, 500, 502, 503, 504): break
            time.sleep(25 * (attempt + 1)); continue
        except OSError as e:
            last = repr(e); time.sleep(6 * (attempt + 1)); continue
        for cand in out.get("candidates", []):
            for part in cand.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    return base64.b64decode(part["inlineData"]["data"]), out.get("usageMetadata", {})
        last = "no image in the answer: " + json.dumps(out)[:400]
    raise RuntimeError(last)


if __name__ == "__main__":
    name, n = sys.argv[2], sys.argv[3]
    canvas = open(f'{S}/work/{name}-canvas.png', 'rb').read()
    prompt = HEAD + KEEP[name] + TAIL
    png, usage = generate(prompt, [("image/png", canvas)], "4:5")
    out = f'{S}/work/{name}-try-{n}'
    open(out + '.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "4:5", "size": "2K", "piece": name, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z", time.gmtime()),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{name}-canvas.png (the group illustration's crop for this side on its working canvas, green above its top edge; sha256 {hashlib.sha256(canvas).hexdigest()})"]},
              open(out + '.json', 'w'), indent=1, ensure_ascii=False)
    print("made", out, len(png), usage.get("totalTokenCount"))
