"""Trial: the STANDARD gear's lower panel (the house skin, 기본; no reference picture), drafts 1 and 2 of the ideas put to
   the user ("1, 2 뽑아봐"):
     standard-a1  the panel as it is now, only its display's field (empty since the numbers are written beside the gear)
                  made a plain graphite plate with one cyan light strip
     standard-a2  a plain slab of matte graphite with one cyan light strip
   Image 1 is this game's own frame whose panel is the layout (layout_standard.py): for standard-a1 the game's own present
   panel picture with a flat place-holder in its display, for standard-a2 a flat drawing. No other picture is given.
   python3 -I prompt_standard.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

FRAME = (
    "One picture comes with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Dark note lanes run away "
    "from the camera, a glowing cyan judge line crosses them (with a white burst on it), under it lies a row of eight low, dark "
    "matte key caps (one of them is lit cyan), and under that row, between the two dark side rails with a thin cyan line, lies "
    "the gear's lower panel: a wide slab that runs down to the bottom edge of the image, widening toward the camera. "
)
KEEP = (
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps and the two side rails stay at exactly the same places and sizes. Do not "
    "zoom in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. "
)
TAIL = (
    "No text, letters or numbers anywhere, no logos, no watermark, and nothing over the lanes. Colours: graphite greys only; "
    "the one light is cyan (close to #39D4FF)."
)
VARIANTS = {
    "standard-a1": (
        FRAME
        + "In image 1 the panel is ALREADY A FINISHED RENDER of a machine's console in matte graphite metal with cyan light trims: "
        "two speaker grilles and four small knobs in its far corners, vent slats, a large round dial with a cyan ring at its "
        "middle, two long dark slots. All of that is finished and must stay EXACTLY as it is. ONLY ONE PART of the panel is a "
        "flat place-holder drawing: the wide field inside the bevelled frame at the middle of the panel's far part, right "
        "under the key caps (a display used to be there). In image 1 that field is a plain, flat grey rectangle with one "
        "short, straight cyan line across its middle.\n\n"
        + KEEP
        + "Repaint ONLY that field inside the bevelled frame. Keep every other pixel exactly as it is: the bevelled frame round "
        "the field, all the rest of the panel, the lanes, the note, the judge line and the burst on it, the row of key caps, "
        "the rails, the dark background.\n\n"
        "The field becomes a plate of the console's own metal, set into the bevelled frame a little below its rim, as a "
        "photorealistic 3D render in exactly the style, the light and the finish of the rest of the console: matte dark "
        "graphite aluminium with a fine, straight hairline brushing that runs from left to right, a soft sheen, a little "
        "lighter toward its far edge, and a soft shadow along the frame's inner edge so that the plate reads as recessed. At "
        "its middle, exactly where the cyan line is drawn and exactly as long and as thick, runs ONE slim light strip: a "
        "narrow slot with round ends recessed into the plate, glowing cyan like the console's other light trims, evenly "
        "bright along its whole length, with a soft cyan glow on the metal just above and below it. Nothing else is on the "
        "plate: no display, no glass, no screws, no buttons, no other lines.\n\n"
        + TAIL
    ),
    "standard-a2": (
        FRAME
        + "In image 1 the panel is a FLAT LAYOUT DRAWING: a plain dark-grey slab with one thin, straight cyan line across its "
        "middle, close to the bottom edge. The drawing shows exactly where that line lies and how long and thick it is.\n\n"
        + KEEP
        + "Repaint ONLY the panel: the area under the row of key caps, between the inner edges of the two side rails, down to the "
        "bottom edge of the image. Keep every other pixel exactly as it is: the lanes, the note, the judge line and the burst "
        "on it, the row of key caps, the rails, the dark background.\n\n"
        "The panel becomes ONE PLAIN SLAB OF MATTE GRAPHITE METAL with a single light strip: the top of a minimal, precise "
        "machine, as a photorealistic 3D render at the finish of a commercial console game, seen exactly from this camera.\n\n"
        "1. THE SLAB: bead-blasted, anodised dark graphite aluminium (close to #33363D): perfectly plain and calm, with an "
        "extremely fine, even grain and no gloss, only a soft, broad sheen from the studio light, a little lighter toward its "
        "far edge. Its far edge, under the key caps, is a thin, crisp chamfer that catches a line of light. There are no "
        "seams, no screws, no vents, no grilles, no knobs, no dials, no patterns: nothing but the metal.\n\n"
        "2. THE LIGHT STRIP: exactly where the cyan line is drawn, and exactly as long and as thick: one slim slot with round "
        "ends recessed into the slab, glowing cyan from inside, evenly bright along its whole length. It lays a soft cyan glow "
        "on the metal on both sides of it. Do not move it, lengthen it, double it or add other lights.\n\n"
        "The panel runs on down past the bottom edge of the image (no front edge is seen); nothing rises over the rails or "
        "above the row of key caps. Clean, precise and new: no dirt, no scratches, no fingerprints.\n\n"
        + TAIL
    ),
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    prompt = VARIANTS[key]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read())]
    png, usage = generate(prompt, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows; the panel: " +
                            ("the game's own present panel picture with a flat place-holder in its display)" if key == "standard-a1" else "a flat layout drawing)")],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
