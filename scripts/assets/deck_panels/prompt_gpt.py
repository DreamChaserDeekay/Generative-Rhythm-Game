"""Trial (the user's change to draft 8-1): the GPT gear's lower panel in the white look: the emblem at the very middle, and,
   small, near the panel's near right corner, the reset button inside its ring gauge; no lettering on the slab
   (layout_gpt.py). The pictures as in prompt_gpt_draft8.py.   python3 -I prompt_gpt.py <folder> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S
from prompt_gpt_draft8 import HEAD, EMBLEM, DOME, END

PROMPT = (
    HEAD.format(drawing="(a) at the very middle a black knot emblem; (b) near the panel's near right corner, small, a red round "
    "button with the word RESET on it, inside a ring of which the greater part is green. The rest of the slab is empty.")
    + EMBLEM
    + "2. THE RESET BUTTON WITH ITS RING GAUGE, small, near the panel's near right corner (toward the camera and toward the right "
    "rail), exactly where the layout drawing has it and exactly as small: " + DOME + ". Round its collar runs a ring-shaped gauge, "
    "flat and flush: a channel of dark smoked glass, lit from within like an LED light ring in a clear bright green for exactly "
    "the part the layout drawing shows green (from the top of the ring clockwise for about two thirds of the way round), with "
    "round ends; the rest of the channel is unlit, dark grey. The button and its ring sit together on one low round base of satin "
    "silver-white aluminium with a fine polished bevel. Do NOT enlarge it and do not move it toward the middle of the panel.\n\n"
    "The rest of the slab stays EMPTY: clean white glass with its pastel light; nothing at the left of the emblem, and no "
    "lettering on the slab itself (the only word in the picture is RESET, on the button).\n\n" + END
)

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    refs = ["refs/gpt-emblem.jpg", "refs/gpt-icon.jpg"]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read())] + [("image/jpeg", open(S + r, 'rb').read()) for r in refs]
    png, usage = generate(PROMPT, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": PROMPT, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the corner stickers off, the panel a flat layout drawing)"] + refs,
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
