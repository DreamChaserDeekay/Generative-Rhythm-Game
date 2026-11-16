"""Trial (the user's direction): the FIRESTARTER gear's lower panel, the K/DA logo as a three-dimensional object at the very
   middle of crimson satin (draft A's cloth); the members' crests are on the key caps (drawn by the game). Image 1 is this
   game's own frame whose panel is a flat layout drawing with the official logo pasted where it lies; the pictures after it
   are official pictures of the release, as design references (the user allowed them for this skin).
   python3 -I prompt_fire_draft5.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

HEAD = (
    "{n} pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
    "camera, a glowing red judge line crosses them, under it lies a row of eight mirror-chrome key caps, each with a small dark "
    "emblem in its middle and a thin red line along its lower edge, and under that row, between the two chrome side rails, lies the "
    "gear's lower panel: a wide slab that runs from the key caps down to the bottom edge of the image, widening toward the camera. "
    "Two illustrated figures stand outside the rails, at the left and at the right: they are no part of the panel. In image 1 the "
    "panel is a FLAT LAYOUT DRAWING: {drawing} The drawing shows exactly where each thing lies and how large it is.\n\n"
)
KEEP = (
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps and the two side rails stay at exactly the same places and sizes. Do not zoom "
    "in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel, and do not move the picture toward the "
    "other images' compositions. Repaint ONLY the panel: the area under the row of key caps, between the inner edges of the two "
    "side rails, down to the bottom edge of the image. Keep every other pixel exactly as it is: the lanes, the notes, the judge "
    "line and the flash on it, the row of key caps with their emblems, the rails, the two figures outside the rails, the dark "
    "background.\n\n"
)
RENDER = "seen exactly from this camera, as a photorealistic 3D render at the finish of a commercial console game"
CLOTH = (
    "The panel becomes a bed of heavy crimson satin " + RENDER + ": the cloth lies in deep, soft, diagonal folds (as the layout "
    "drawing has it: ridges bright ruby with a silky sheen, valleys burgundy going to black) and fills the whole panel from the key "
    "caps to the bottom edge and from rail to rail. NO glass over it. "
)
LOGO = (
    "At the very middle of the panel lies the logo K/DA of image 2 as ONE SOLID THREE-DIMENSIONAL OBJECT, the hero of the picture: "
    "the wordmark cast in thick mirror chrome, every stroke a heavy bar as tall as it is wide, so that it rises clearly off the "
    "cloth like a metal sculpture, with crisp bevelled edges. Its footprint on the cloth is exactly the layout drawing's logo: "
    "the same place (the middle of the panel, left to right and top to bottom), the same width, the same letter shapes and "
    "slants. It lies on the cloth and is foreshortened by the camera exactly as in image 1: do not stand it upright, do not turn "
    "it toward the viewer, do not move, enlarge or shrink it. Because the camera looks down along the panel, you see its polished "
    "top faces and the side walls that face the camera. The chrome mirrors the red cloth and one bright studio light (white-hot "
    "highlights along the bevels, deep burgundy reflections in the walls); a hot-pink light glows out from under it onto the "
    "satin; it throws a soft dark shadow on the cloth toward the camera, and the satin sinks and gathers a little under its "
    "weight. "
)
EDGE = (
    "The top edge of the panel under the key caps is a bevelled lip of mirror chrome. The cloth stays inside the rails everywhere; "
    "nothing rises over the rails or above the key caps, and the panel runs on down past the bottom edge of the image (no front "
    "edge is seen). NO windows, NO display, NO dark plates, NO sockets, NO speakers, NO grilles, NO rivets, NO frame round the "
    "logo.\n\n"
)

VARIANTS = {
    "fire-a5": {
        "references": ["refs/logo.jpg"],
        "prompt": (
            HEAD.format(n="Two", drawing="crimson satin, and drawn flat on it, large, at its very middle, the logo K/DA.") +
            "IMAGE 2 is the DESIGN REFERENCE for the logo K/DA: a wordmark of sharp slanted strokes in mirror chrome with a hot-pink "
            "underside. Reproduce its design faithfully; copy nothing else of image 2.\n\n"
            + KEEP + CLOTH + LOGO +
            "A few small gold-orange embers lie glowing on the cloth around it, none on the logo.\n\n"
            + EDGE +
            "The only lettering anywhere is K/DA. No other text, no numbers, no watermark, and nothing over the lanes. Colours: "
            "crimson, ruby, burgundy and black; mirror chrome; hot pink under the logo; a few gold-orange embers. One soft key light "
            "from the top-left."
        ),
    },
    "fire-a6": {
        "references": ["refs/logo.jpg", "refs/cover.jpg"],
        "prompt": (
            HEAD.format(n="Three", drawing="crimson satin, and drawn flat on it, large, at its very middle, the logo K/DA, and small under it the word FIRESTARTER.") +
            "IMAGE 2 is the DESIGN REFERENCE for the logo K/DA: a wordmark of sharp slanted strokes in mirror chrome with a hot-pink "
            "underside. IMAGE 3 is the DESIGN REFERENCE for the word FIRESTARTER: the single's cover, with the word in tall, narrow, "
            "high-contrast serif capitals whose letters touch and run into one another. Reproduce both designs faithfully; copy "
            "nothing else of images 2 and 3.\n\n"
            + KEEP + CLOTH + LOGO +
            "Under it, exactly where the layout drawing has it and exactly as small, lies the word FIRESTARTER in the letterforms "
            "of image 3, cut from polished chrome with a warm rose sheen, only a few millimetres thick, flat on the cloth, with a "
            "soft shadow: plainly the smaller, quieter thing beside the logo. A few small gold-orange embers lie glowing on the cloth "
            "around them, none on the logo.\n\n"
            + EDGE +
            "The only lettering anywhere is K/DA and FIRESTARTER, spelled exactly so (F, I, R, E, S, T, A, R, T, E, R). No other "
            "text, no numbers, no watermark, and nothing over the lanes. Colours: crimson, ruby, burgundy and black; mirror chrome; "
            "hot pink under the logo; a few gold-orange embers. One soft key light from the top-left."
        ),
    },
}

# the user's revision of draft 5-3: the logo at 85 % of its size, the title as large as it was, a little more cloth between them
_a6 = VARIANTS["fire-a6"]
VARIANTS["fire-a7"] = {
    "references": _a6["references"],
    "prompt": _a6["prompt"].replace(
        "plainly the smaller, quieter thing beside the logo.",
        "plainly the smaller, quieter thing beside the logo. Between the logo and the word lies a clear band of bare cloth, as "
        "wide as the layout drawing has it: the logo's side walls, its pink glow and its shadow end well above the word and do "
        "not touch it."),
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    v = VARIANTS[key]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read())] + [("image/jpeg", open(S + r, 'rb').read()) for r in v["references"]]
    png, usage = generate(v["prompt"], pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": v["prompt"], "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the panel a flat layout drawing)"] + v["references"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
