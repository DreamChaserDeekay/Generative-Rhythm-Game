"""Trial: the WIRE gear's lower panel (skin 10, shown as 화이트 라인), drafts 1 and 2 of the ideas put to the user ("1, 2
   뽑아봐"), who wants this skin "as close to the reference as can be":
     wire-a1  the reference's line drawing as lines of white light under black glass
     wire-a2  the same drawing as a white hologram floating over a black plate
   Image 1 is this game's own frame whose panel is the flat layout drawing (layout_wire.py); image 2 is the lower part of
   the user's own reference picture for this skin, enlarged and brightened (sending it is permitted by the user). The
   reference's small lettering and numbers are left out.
   python3 -I prompt_wire.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

HEAD = (
    "Two pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Dark note lanes run away "
    "from the camera, a glowing white judge line crosses them (with a small white burst on it), under it lies a strip of eight "
    "thin white outlines shaped as shallow trays over a white hairline, and under that, between the two thin white side rails, "
    "lies the gear's lower panel: a wide slab that runs down to the bottom edge of the image, widening toward the camera. In "
    "image 1 the panel is a FLAT LAYOUT DRAWING, a line drawing in white on near-black: a soft white light rises from the middle "
    "of its near edge; at the middle is THE MARK in thick white lines: an open ring (a circle whose upper right part is "
    "missing), inside it two round dots side by side, and under them an upright trapezoid (narrower at its top) drawn in "
    "outline; behind the mark a faint large dial (two thin rings with tick marks); three thin tilted oval orbit lines sweep "
    "across; a small lens (three concentric rings) at the right; a white chevron at each side, pointing inward; near the "
    "bottom at each side a cluster of nine small white dots in two rows; two small groups of upright grey bars; a few white "
    "bars lying slanted (two at the left, three at the lower right); and faint grey traces of a circuit board (thin "
    "right-angled lines ending in small rings, a few small outlined chips). The drawing shows exactly where each thing lies "
    "and how large it is.\n\n"
    "IMAGE 2 is the DESIGN REFERENCE: a small concept picture of this very panel, brightened and enlarged (so it is blurry), in "
    "the style the panel must have: line art in white light on black: the white ring mark, thin orbit lines, small bars, a "
    "white light rising from the bottom, faint circuitry. Match its design language and its cool, quiet, monochrome mood. Its "
    "small lettering and numbers (at the left and right of the mark) are NOT wanted: leave them out, and write no text at "
    "all.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the strip of trays, the white hairline and the two side rails stay at exactly the same places "
    "and sizes. Do not zoom in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint ONLY "
    "the panel: the area under the white hairline, between the inner edges of the two side rails, down to the bottom edge of "
    "the image. Keep every other pixel exactly as it is: the lanes, the note, the judge line and the burst on it, the strip of "
    "trays, the hairline, the rails, the dark background.\n\n"
)
TAIL = (
    "Clean, precise and quiet: no dirt, no scratches, no fingerprints. Everything stays inside the rails; nothing rises over "
    "the rails or above the strip of trays, and the panel runs on down past the bottom edge of the image (no front edge is "
    "seen). Nothing else is on the panel: no screens, no number boxes, no buttons, no knobs, no cables, no people, no hands.\n\n"
    "No text, letters or numbers anywhere, no logos, no watermark, and nothing over the lanes. Colours: black and white only "
    "(a cool, very slightly bluish white, and greys); no other colour."
)
VARIANTS = {
    "wire-a1": (
        HEAD
        + "The panel becomes a pane of BLACK GLASS with that drawing shining in it as LINES OF WHITE LIGHT, as a photorealistic 3D "
        "render at the finish of a commercial console game, seen exactly from this camera. Every line and shape of the layout "
        "drawing stays exactly at its place and at its size (the same footprint, the same angle), foreshortened by the camera "
        "exactly as in image 1: do not move, enlarge or shrink anything, do not stand anything upright, and add nothing.\n\n"
        "1. THE GLASS: one pane of deep black glass, smooth and glossy, with only soft, faint reflections; flat, with no frame "
        "and no seams.\n\n"
        "2. THE LINES OF LIGHT: every white line of the drawing is a line of clean white light just under the glass (like "
        "electroluminescent wire, or a light guide engraved in the glass): crisp, evenly bright, with a fine soft halo. THE "
        "MARK at the middle is the brightest and the thickest: its open ring, its two dots (each with a small dark centre, as "
        "drawn) and its trapezoid in outline, exactly the drawn shapes. The orbit lines are thin and fine. The faint things "
        "of the drawing (the large dial with its tick marks behind the mark, the lens at the right, the circuit traces with "
        "their small rings, the outlined chips) glow much dimmer, in a quiet grey-white.\n\n"
        "3. THE SMALL SHAPES: the slanted bars, the two clusters of dots, the upright bars and the two chevrons are evenly lit "
        "shapes of white light under the glass, flat, with crisp edges and a soft halo (the upright bars a dimmer grey).\n\n"
        "4. THE LIGHT FROM THE NEAR EDGE: a soft white light rises from the middle of the near edge and fades upward (as "
        "drawn), as if a lamp shone up from under the glass there. Where it is bright, a real circuit board shows faintly "
        "through the glass: fine traces and a few small parts, dark grey and subtle.\n\n"
        + TAIL
    ),
    "wire-a2": (
        HEAD
        + "The panel becomes a black projection plate with that drawing floating over it as a WHITE HOLOGRAM, as a photorealistic "
        "3D render at the finish of a commercial console game, seen exactly from this camera. Every thing of the layout "
        "drawing keeps its place and its size: seen from this camera it covers exactly its drawn footprint, foreshortened "
        "exactly as in image 1: do not move, enlarge or shrink anything, do not turn anything to face the camera, and add "
        "nothing.\n\n"
        "1. THE PLATE: a slab of polished black glass (a holographic projection table): smooth and glossy. Faint circuit traces "
        "with small rings and a few outlined chips lie under the glass (as drawn), dim grey.\n\n"
        "2. THE HOLOGRAM: THE MARK (its open ring, its two dots each with a small dark centre, its trapezoid in outline), the "
        "large dial behind it, the three orbit lines and the lens at the right float in the air a little above the plate, "
        "parallel to it, made of pure white light: slightly translucent, with very fine scan lines in them and a soft bloom "
        "round them, as a hologram has; the mark is the brightest and thickest, the dial and the lens fainter. The glossy "
        "plate mirrors them: a dim, soft reflection of each lies on the glass right under it.\n\n"
        "3. THE SMALL SOLID THINGS: the slanted white bars (two at the left, three at the lower right) are small solid blocks "
        "of frosted white acrylic lying on the plate, about as high as a finger is thick and lit from inside, each with a soft "
        "reflection in the glass. The two clusters of dots are small round white lamps set flush in the plate; the upright "
        "bars (dimmer, grey) and the two chevrons are flat white lights in the plate.\n\n"
        "4. THE PROJECTOR'S LIGHT: the soft white light rising from the middle of the near edge (as drawn) is the projector's "
        "beam: a bright, soft fan of white light with a hint of haze in it, fading upward toward the mark.\n\n"
        + TAIL
    ),
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    prompt = VARIANTS[key]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read()), ("image/png", open(S + 'refs/wire-console.png', 'rb').read())]
    png, usage = generate(prompt, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the panel a flat layout drawing)",
                            "refs/wire-console.png (the lower part of the user's reference picture for this skin, enlarged and brightened; not kept in the repository)"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
