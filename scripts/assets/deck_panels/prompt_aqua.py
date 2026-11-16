"""Trial: the AQUA gear's lower panel (skin 5), drafts 1 and 3 of the ideas put to the user, who wants this skin "as close
   to the reference as can be":
     aqua-a1  the reference's console as it is, as a 3D render (dark teal glass, the white ring mark round a glowing core,
              aqua vents, white armour, hot-pink marks)
     aqua-a2  the same console with its glass as water (ripples going out from the mark, drops)
   Image 1 is this game's own frame whose panel is the flat layout drawing (layout_aqua.py); image 2 is the lower part
   of the user's own reference picture for this skin, enlarged (sending it is permitted by the user).
   python3 -I prompt_aqua.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

HEAD = (
    "Two pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
    "camera, a glowing aqua judge line crosses them, under it lies a row of eight glossy key caps (white ones and aqua-blue "
    "ones), and under that row, between the two white side rails (each with an aqua line inside and a pink line outside), lies "
    "the gear's lower panel: a wide slab that runs from the key caps down to the bottom edge of the image, widening toward the "
    "camera. In image 1 the panel is a FLAT LAYOUT DRAWING of a console: a dark teal pane with thin rings round its middle; at "
    "the middle a white ring-shaped mark, three curved arrows chasing one another round a pale disc, in an aqua glow; at each "
    "side five slanting aqua stripes (a vent) over a long white bar (a blade); white armour plates in the two far corners, "
    "right under the key caps; hot-pink triangles at the outer edges and pink hatch stripes in the two near corners. The "
    "drawing shows exactly where each thing lies and how large it is.\n\n"
    "IMAGE 2 is the DESIGN REFERENCE: a small concept picture of this very console (it is enlarged, so it is blurry), in the "
    "style the panel must have: the cockpit console of a clean white machine with aqua lights and hot-pink accents: gloss-white "
    "armour with cut corners, a dark teal glass pane with a soft aqua glow at its middle, the machine's mark (a white ring with "
    "three small arrow heads round a glowing pale core), aqua vent stripes, pink trims. Match its design language, its colours "
    "and its mark. Its two rows of number boxes (MAX COMBO, SCORE) are NOT wanted: leave them out, and write no text at all.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps and the two side rails stay at exactly the same places and sizes. Do not zoom "
    "in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint ONLY the panel: the area under "
    "the row of key caps, between the inner edges of the two side rails, down to the bottom edge of the image. Keep every other "
    "pixel exactly as it is: the lanes, the notes, the judge line and the splash on it, the row of key caps, the rails, the dark "
    "background.\n\n"
    "The panel becomes that console as a photorealistic 3D render at the finish of a commercial console game, seen exactly from "
    "this camera. Every thing of the layout drawing stays exactly at its place and at its size (the same footprint, the same "
    "angle), foreshortened by the camera exactly as in image 1: do not move, enlarge or shrink anything, do not stand anything "
    "upright, and add nothing.\n\n"
)
TAIL = (
    "{n3}. THE VENTS, at each side: the five slanting stripes of the drawing are five louvre slats cut into the console, each "
    "glowing aqua from inside, the outermost the brightest and the others fainter toward the middle.\n\n"
    "{n4}. THE BLADES, under each vent: a long, slim blade of gloss-white armour (as drawn, its inner end cut at a slant), raised "
    "a little, with a fine line of aqua light along its upper edge.\n\n"
    "{n5}. THE ARMOUR, in the two far corners right under the key caps: plates of gloss-white ceramic armour with cut corners (as "
    "drawn), about as thick as a finger, with a few fine panel lines, two or three small flush bolts each, and a thin line of "
    "aqua light along their inner edge. The narrow white strips at the two near sides are the same armour.\n\n"
    "{n6}. THE PINK: the triangles at the outer edges and the hatch stripes in the two near corners (as drawn) are inlays of "
    "glossy hot-pink enamel, flush with the surface; the thin aqua lines beside the hatch stripes are fine lines of light.\n\n"
    "Each raised thing throws a soft shadow. Clean, bright, crisp and new: no dirt, no scratches, no wear. The top edge of the "
    "panel under the key caps is a thin bevelled lip. Everything stays inside the rails; nothing rises over the rails or above "
    "the key caps, and the panel runs on down past the bottom edge of the image (no front edge is seen). Nothing else is on the "
    "panel: no screens, no number boxes, no buttons, no knobs, no cables, no people, no hands.\n\n"
    "No text, letters or numbers anywhere, no logos, no watermark, and nothing over the lanes. Colours: gloss white; deep teal; "
    "aqua light (close to #22E0E6); hot pink (close to #FF3F93)."
)
VARIANTS = {
    "aqua-a1": (
        HEAD
        + "1. THE GLASS: the console's field is one pane of deep, dark teal glass, smooth and glossy, lit from underneath at its "
        "middle by a soft aqua glow that fades toward the edges. Fine concentric rings are etched into it round the middle (as "
        "drawn), catching the light faintly.\n\n"
        "2. THE MARK, at the middle: the machine's mark of image 2 as a solid thing: a thick ring of gloss-white ceramic armour "
        "split into three arcs that chase one another, each ending in a small arrow head (as drawn), lying flat on the glass "
        "and raised about as high as a finger is thick, with softly rounded edges and soft highlights. Inside the ring, set a "
        "little deeper, a round lens of pale aqua glass that glows from within: the machine's core, bright, soft and clean. A "
        "halo of aqua light lies on the glass round the mark.\n\n"
        + TAIL.format(n3=3, n4=4, n5=5, n6=6)
    ),
    "aqua-a2": (
        HEAD
        + "1. THE WATER: in this version the console's field is not glass but WATER: a shallow pool of clear aqua water over a "
        "deep teal bed, held between the white armour, lit from underneath at its middle so that it glows aqua there and "
        "deepens to dark teal toward the edges. Its surface is alive: round ripples go out from the mark in rings (the drawn "
        "rings), each a soft swell that catches a bright line of light, widening and fading toward the edges; a few small "
        "round drops and tiny bubbles lie on the surface (about where the drawing has its small pale dots). Real, clear, "
        "calm water, with soft reflections of the white armour in it.\n\n"
        "2. THE MARK, at the middle: the machine's mark of image 2 as a solid thing: a thick ring of gloss-white ceramic armour "
        "split into three arcs that chase one another, each ending in a small arrow head (as drawn), floating flat at the "
        "middle of the pool, just above the surface, and mirrored softly in the water under it; the ripples start from it. "
        "Inside the ring, a round lens of pale aqua glass that glows from within: the machine's core, bright, soft and clean. "
        "A halo of aqua light lies on the water round the mark.\n\n"
        + TAIL.format(n3=3, n4=4, n5=5, n6=6)
    ),
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    prompt = VARIANTS[key]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read()), ("image/png", open(S + 'refs/aqua-console.png', 'rb').read())]
    png, usage = generate(prompt, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the panel a flat layout drawing)",
                            "refs/aqua-console.png (the lower part of the user's reference picture for this skin, enlarged; not kept in the repository)"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
