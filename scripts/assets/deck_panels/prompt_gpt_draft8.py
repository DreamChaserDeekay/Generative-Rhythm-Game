"""Trial (the user's second direction): the GPT gear's lower panel in the white look: no memory sticks; the emblem at the
   very middle at the size of draft 7-2; of the limits only the weekly one, put together with the reset button, three ways
   (p6/layout-gpt3.py): e1 the ring gauge round the button, e2 the bar at the near edge with the button at its end, e5 the
   box opened like a book with the display inside its cover. Image 1 is this game's own frame whose panel is the flat
   layout drawing; image 2 is the emblem itself, image 3 the official app icon (how the emblem looks as a solid thing).
   python3 -I prompt_gpt_draft8.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

HEAD = (
    "Three pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
    "camera, a glowing teal judge line crosses them, under it lies a row of eight white rounded key caps on a green strip, and "
    "under that row, between the two pale side rails, lies the gear's lower panel: a wide slab that runs from the key caps down to "
    "the bottom edge of the image, widening toward the camera. In image 1 the panel is a FLAT LAYOUT DRAWING: a milk-white slab "
    "with soft pastel light at its sides, and drawn flat on it: {drawing} The drawing shows exactly where each thing lies and how "
    "large it is.\n\n"
    "IMAGE 2 is the DESIGN REFERENCE for the emblem: a knot of six interlocked rounded loops in one even line. Reproduce its shape "
    "faithfully: the same six loops, the same over-and-under weave, the same proportions. IMAGE 3 shows that emblem as a solid "
    "thing (an app icon): a smooth, glossy, rounded tube pressed softly into a pale surface. Take from it only how the tube's "
    "roundness and gloss look; copy nothing else of images 2 and 3.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps and the two side rails stay at exactly the same places and sizes. Do not zoom "
    "in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint ONLY the panel: the area under "
    "the row of key caps, between the inner edges of the two side rails, down to the bottom edge of the image. Keep every other "
    "pixel exactly as it is: the lanes, the notes, the judge line and the splash on it, the row of key caps, the rails, the dark "
    "background.\n\n"
    "The panel becomes one slab of milk-white frosted glass seen exactly from this camera, as a photorealistic 3D render at the "
    "finish of a commercial console game: smooth, softly glossy, like porcelain-white acrylic, lit from within near its two sides "
    "and its corners by soft pastel light (lilac at the far left, sky blue at the far right, pink at the near left, peach at the "
    "near right, as the layout drawing has it), the pastel colours melting into the white with no hard edge; the middle of the slab "
    "stays clean white.\n\n"
    "ON THE SLAB lie the things of the layout drawing, each as a SOLID THREE-DIMENSIONAL OBJECT. Each lies FLAT on the slab, "
    "exactly at the place and at the size the layout drawing gives it (the same footprint), foreshortened by the camera exactly as "
    "in image 1: do not stand anything upright, do not turn anything toward the viewer, do not move, enlarge or shrink anything, "
    "and do not add or leave out anything. Each throws a soft grey shadow toward the camera.\n\n"
)
EMBLEM = (
    "1. THE EMBLEM, at the very middle of the panel: the emblem of image 2 as a thick, rounded tube of gloss black (polished black "
    "enamel), as round as a finger, with soft white highlights running along its top and the pastel colours faintly mirrored in its "
    "sides; where one loop crosses over another, the upper tube visibly rides over the lower one; its footprint is exactly the "
    "layout drawing's emblem: the same place, the same size, the same six loops and weave. The emblem is NOT large: it is only "
    "about a fifth as wide as the panel, as round as it is drawn (as wide as it is deep on the slab), with clean white slab all "
    "round it. Do NOT enlarge it and do not widen it.\n\n"
)
DOME = (
    "a round push button with a high, glossy cherry-red dome (like an arcade or emergency button) seated in a polished chrome "
    "collar, with the word RESET in bold white sans-serif capitals across the top of the dome"
)
COPY = "Copy the characters exactly as they are drawn in image 1, in the same places and sizes; do not change, add or drop any character"
END = (
    "The top edge of the panel under the key caps is a thin bevelled lip. Everything stays inside the rails; nothing rises over "
    "the rails or above the key caps, and the panel runs on down past the bottom edge of the image (no front edge is seen). "
    "Nothing else lies on the slab: no other buttons, no knobs, no speakers, no grilles, no screws, no cables, no other screens, "
    "no circuit boards, no people, no hands.\n\n"
    "No other text, letters or numbers than those named above, no other logos, no watermark, and nothing over the lanes. Colours: "
    "white; soft pastel lilac, pink, peach and sky blue; gloss black; one cherry red for the button; one clear bright green for "
    "the gauge's light; polished chrome and satin silver. One soft key light from the top-left."
)

VARIANTS = {
    "gpt-e1": {
        "prompt": (
            HEAD.format(drawing="(a) at the very middle a black knot emblem; (b) at the right a red round button with the word "
            "RESET on it, inside a ring of which the greater part is green; (c) at the left the small black Korean words 주간 한도 남음 "
            "and under them the large green figure 64%.")
            + EMBLEM
            + "2. THE RESET BUTTON WITH ITS RING GAUGE, at the right: " + DOME + ", large. Round its collar runs a ring-shaped "
            "gauge, flat and flush: a channel of dark smoked glass, lit from within like an LED light ring in a clear bright green "
            "for exactly the part the layout drawing shows green (from the top of the ring clockwise for about two thirds of the "
            "way round), with round ends; the rest of the channel is unlit, dark grey. The button and its ring sit together on one "
            "low round base of satin silver-white aluminium with a fine polished bevel.\n\n"
            "3. THE READOUT, at the left, with NO display, NO screen and NO plate under it: lettering set straight into the white "
            "slab, flush with it. First the small Korean words 주간 한도 남음, engraved a little into the slab and filled with gloss "
            "black. Under them, large and bold, the figure 64% in the same clear green as the ring's light, as if cut into the "
            "frosted glass and softly lit from within. " + COPY + ".\n\n" + END
        ),
    },
    "gpt-e2": {
        "prompt": (
            HEAD.format(drawing="(a) at the very middle a black knot emblem; (b) under the emblem a long horizontal bar, dark, its "
            "left part green, and at the bar's right end a red round button with the word RESET on it; (c) under the bar the black "
            "Korean words 주간 한도 at the left, and 64% 남음 under the end of the green part.")
            + EMBLEM
            + "2. THE GAUGE BAR, under the emblem (toward the camera): one long straight gauge set flush into the slab, exactly as "
            "long and as thick as the layout drawing has it: a slot of dark smoked glass with round ends and a thin polished rim, "
            "lit from within like an LED light bar in a clear bright green for exactly the part the layout drawing shows green (its "
            "left two thirds, ending in a round end); the rest of the slot is unlit, dark grey.\n\n"
            "3. THE RESET BUTTON, at the right end of the bar and touching it, as the bar's end: " + DOME + ".\n\n"
            "4. THE WORDS, under the bar, with NO display, NO screen and NO plate under them: lettering set straight into the white "
            "slab, engraved a little and filled with gloss black: the Korean words 주간 한도 under the bar's left end, and, bolder, "
            "64% 남음 under the end of the green part. " + COPY + ".\n\n" + END
        ),
    },
    "gpt-e5": {
        "prompt": (
            HEAD.format(drawing="(a) at the very middle a black knot emblem; (b) at the right a small square case opened flat like "
            "a book: its left half a pale silver square that holds a dark display with two lines of white Korean words and a green "
            "bar, its right half a black square with a red round button with the word RESET on it, two hinges between the halves. "
            "The slab at the left of the emblem is empty.")
            + EMBLEM
            + "2. THE RESET BOX, at the right, opened flat like a book: two square halves of the same size lying side by side on the "
            "slab, each about as thick as a finger, joined by two short silver hinges between them. The LEFT half is the box's "
            "cover, lying open on its back: a square plate of brushed silver aluminium with rounded corners and a fine polished "
            "bevel; set flush into its inner face is a display of dark glass with rounded corners. The display's screen is lit and "
            "shows EXACTLY what the layout drawing shows: on its first line the Korean words 주간 한도 in white; on its second line, a "
            "little larger and bolder, 64% 남음 in white; under them one horizontal bar lit clear bright green to about two thirds, "
            "the rest of it dark grey. " + COPY + ", and write nothing else on the screen. The RIGHT half is the box itself: a "
            "square of matte black with rounded corners, and in its middle the reset button: " + DOME + ", large.\n\n"
            "The slab at the left of the emblem stays EMPTY: clean white glass with its pastel light, nothing on it.\n\n" + END
        ),
    },
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    v = VARIANTS[key]
    refs = ["refs/gpt-emblem.jpg", "refs/gpt-icon.jpg"]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read())] + [("image/jpeg", open(S + r, 'rb').read()) for r in refs]
    png, usage = generate(v["prompt"], pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": v["prompt"], "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the corner stickers off, the panel a flat layout drawing)"] + refs,
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
