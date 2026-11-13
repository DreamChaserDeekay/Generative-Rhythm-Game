"""Trial: the NOIR gear's lower panel (skin 8), drafts 2 and 3 of the ideas put to the user ("2, 3 시안 뽑아보고 가운데 숫자
   자리는 1로 진행해줘": the middle left empty), who wants this skin "as close to the reference as can be":
     noir-a2  the reference's black and red graphics built as real, layered parts (a matte black plate, low dark-red plates
              for the bands, neon lines for the orbits, lit acrylic blocks, domed red lamps for the dot clusters)
     noir-a3  the same graphics shown on an LED dot-matrix board (128 x 55 round LEDs)
   Image 1 is this game's own frame whose panel is the flat layout drawing (layout_noir.py); image 2 is the lower part of
   the user's own reference picture for this skin, enlarged (sending it is permitted by the user). The reference's SCORE and
   COMBO lettering and numbers are left out.
   python3 -I prompt_noir.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

FRAME = (
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Dark note lanes run away "
    "from the camera, a glowing red judge line crosses them, under it lies a strip of eight thin dark slots with slanted ends "
    "(outlined in grey) over a red hairline, and under that, between the two thin side rails (hairlines with small ticks), "
    "lies the gear's lower panel: a wide slab that runs down to the bottom edge of the image, widening toward the camera. "
)
KEEP = (
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the strip of slots, the red hairline and the two side rails stay at exactly the same places and "
    "sizes. Do not zoom in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint ONLY the "
    "panel: the area under the red hairline, between the inner edges of the two side rails, down to the bottom edge of the "
    "image. Keep every other pixel exactly as it is: the lanes, the notes, the judge line and its glow, the strip of slots, the "
    "red hairline, the rails, the dark background.\n\n"
)
TAIL = (
    "Everything stays inside the rails; nothing rises over the rails or above the strip of slots, and the panel runs on down "
    "past the bottom edge of the image (no front edge is seen). Nothing else is on the panel: no screens, no number boxes, no "
    "cards, no buttons, no knobs, no cables, no people, no hands.\n\n"
    "No text, letters or numbers anywhere, no logos, no watermark, and nothing over the lanes. Colours: black; red (close to "
    "#F61222) and a dark wine red (close to #3A060B); white."
)
VARIANTS = {
    "noir-a2": (
        "Two pictures come with this request.\n\n"
        + FRAME
        + "In image 1 the panel is a FLAT LAYOUT DRAWING, black and red graphics as flat as a poster: a black field with a faint "
        "dark-red light at its middle, crossed by three broad dark-red slanting bands; thin red orbit lines (two large slanted "
        "ovals, a small flat oval loop at the right, a thin circle at the left); at each side a red block and a white bar that "
        "overlap; at the upper left a diamond of sixteen small dark-red dots and a faint grid of tiny white dots; near the "
        "bottom at each side a cluster of eight large glowing red dots in two rows; at the near edge three white slanting "
        "stripes at the left and three narrower red ones right of the middle; three red chevrons and two small pixel marks at "
        "the right; a tiny toothed ring at the bottom middle; and two thin upright white hairlines, one near each side. The "
        "middle of the panel is empty. The drawing shows exactly where each thing lies and how large it is.\n\n"
        "IMAGE 2 is the DESIGN REFERENCE: a small concept picture of this very panel (it is enlarged, so it is blurry), in the "
        "style the panel must have: black and red cyber graphics, sharp, flat shapes, glowing red on black, with a little "
        "white. Match its design language, its colours and its dark, tense mood. Its two rows of lettering and numbers at the "
        "middle (SCORE, COMBO) are NOT wanted: leave them out, keep the middle empty, and write no text at all.\n\n"
        + KEEP
        + "The panel becomes a real, physical console BUILT IN LAYERS out of those graphics, as a photorealistic 3D render at the "
        "finish of a commercial console game, seen exactly from this camera. Every thing of the layout drawing stays exactly "
        "at its place, at its size and in its colour (the same footprint, the same angle), foreshortened by the camera exactly "
        "as in image 1: do not move, enlarge, shrink or recolour anything, do not stand anything upright, and add nothing.\n\n"
        "1. THE BASE: one plate of matte black anodised metal with a very fine, even grain; calm and dark. A faint dark-red "
        "glow lies on it round its middle (as drawn).\n\n"
        "2. THE BANDS: the three broad slanting bands of the drawing are low plates of deep wine-red anodised metal, almost "
        "black, lying on the base and raised by about a finger's thickness, with crisp chamfered edges that catch a thin line "
        "of red light; where two bands cross, one lies over the other. They throw soft shadows on the base.\n\n"
        "3. THE ORBIT LINES: thin tubes of red neon light lying on the surface and following exactly the drawn curves (the two "
        "large slanted ovals, the small flat loop at the right, the thin circle at the left, which is dimmer): each glows "
        "bright red and lays a soft red halo on the black metal and on the wine-red plates it crosses.\n\n"
        "4. THE BLOCKS, at each side (as drawn: a red block and a white bar that overlap): solid bars of frosted acrylic, raised "
        "higher than the bands (about two fingers thick) and lit from inside: the red one glows saturated red, the white one "
        "bright white; the white bar lies on top of the red block where they overlap. Each lays a soft glow of its colour on "
        "the plate beside it.\n\n"
        "5. THE DOTS: the two clusters of eight large red dots near the bottom (as drawn, in two rows) are round, domed red "
        "lamps set into the base, like cabochon lenses: each glows bright red from inside, with one small highlight, and the "
        "cluster lays a red glow on the metal round it. The diamond of sixteen smaller dots at the upper left is made of small "
        "round studs of dark-red glass, unlit, glinting only faintly. The faint grid of tiny dots at the upper left is "
        "pin-point white lights set in the base.\n\n"
        "6. THE STRIPES, at the near edge (as drawn): the three white slanting stripes at the left are raised slats of white "
        "acrylic, softly lit; the three narrower red ones right of the middle are slats lit red.\n\n"
        "7. THE SMALL MARKS (as drawn): the three chevrons are small arrow-shaped red lights; the two pixel marks are made of "
        "tiny square white lights; the toothed ring at the bottom middle is a small ring lit white; the two upright hairlines "
        "are fine straight grooves filled with white, running from the far edge to the near edge.\n\n"
        "8. THE MIDDLE of the panel stays EMPTY: only the black base and the wine-red bands.\n\n"
        "Dark, sharp and precise: no dirt, no scratches, no wear.\n\n"
        + TAIL
    ),
    "noir-a3": (
        "Two pictures come with this request.\n\n"
        + FRAME
        + "In image 1 the panel is a FLAT LAYOUT DRAWING OF AN LED DOT-MATRIX DISPLAY: a regular grid of small round dots, 128 "
        "across and 55 deep, on black. Most dots are unlit (faint dark dots). The lit ones draw black-and-red graphics: three "
        "broad slanting bands of dim red dots; orbit lines one dot wide in bright red (two large slanted ovals, a small flat "
        "loop at the right, a ring at the left); at each side a block of bright red dots and a bar of white dots that overlap; "
        "at the upper left a small diamond of red dots and a few single grey-white dots; near the bottom at each side a cluster "
        "of eight round blobs of bright red dots in two rows; at the near edge three slanting stripes of white dots at the left "
        "and three narrower red ones right of the middle; three red chevrons and two small marks of white dots at the right; a "
        "small ring of white dots at the bottom middle; and two upright lines of grey-white dots, one near each side. The "
        "middle of the panel is empty (unlit dots and the dim bands only). The drawing shows exactly which dots are lit and in "
        "which colour.\n\n"
        "IMAGE 2 is the DESIGN REFERENCE for the colours and the mood only: a small concept picture of this panel (enlarged, "
        "blurry): black with glowing red and a little white, dark and tense. Its graphics are smooth; here everything is shown "
        "by LED dots instead. Its lettering and numbers (SCORE, COMBO) are NOT wanted: write no text at all.\n\n"
        + KEEP
        + "The panel becomes that LED DOT-MATRIX DISPLAY BOARD as a real thing (like a stadium scoreboard or an LED sign lying "
        "flat), as a photorealistic 3D render at the finish of a commercial console game, seen exactly from this camera: a "
        "matte black board carrying a perfectly regular grid of small round LEDs, exactly the grid of dots drawn, foreshortened "
        "by the camera exactly as in image 1 (the rows of dots get smaller and closer toward the far edge and stay parallel to "
        "the judge line).\n\n"
        "1. EVERY DOT OF THE DRAWING IS ONE LED: it stays at its place in the grid and keeps its colour and its brightness: "
        "bright red, dim red (the broad bands: LEDs glowing at low power), white, grey-white, or unlit. Do not move, add or "
        "remove dots, do not change which dots are lit, and do not merge the dots into solid shapes or smooth lines: "
        "everything is made of separate round dots with black board between them.\n\n"
        "2. THE LIT LEDS: each is a tiny round lens glowing from inside, brightest at its centre, with a small soft halo. "
        "Where many are lit together (the blocks, the bars, the blobs of the clusters, the stripes) their light lays a faint "
        "glow of their colour on the black board between and round them. The bright red is saturated and intense; the dim red "
        "of the bands is a deep, quiet wine red; the white is clean and bright.\n\n"
        "3. THE UNLIT LEDS: tiny dark, glassy lenses in the black board, barely seen, each with a pin-point reflection, so that "
        "the regular grid shows faintly everywhere, also in the empty middle.\n\n"
        "4. THE BOARD: matte black, flat and clean, with no frame, no seams and no screws.\n\n"
        "Dark, sharp and precise.\n\n"
        + TAIL
    ),
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    prompt = VARIANTS[key]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read()), ("image/png", open(S + 'refs/noir-console.png', 'rb').read())]
    png, usage = generate(prompt, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the panel a flat layout drawing)",
                            "refs/noir-console.png (the lower part of the user's reference picture for this skin, enlarged; not kept in the repository)"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
