"""Trial: the STEEL gear's lower panel (skin 6), drafts 3 and 4 of the ideas put to the user ("3, 4 뽑아봐. 글자는 비워두고."),
   who wants this skin "as close to the reference as can be":
     steel-a3  the reference's console as a 3D render (a face and a darker shelf of dark blue-grey brushed metal, an engraved
               rule, a blue light window at the shelf's right corner, three embossed circles), its two number capsules as LED
               level meters (green, blue)
     steel-a4  the same body read as a hi-fi amplifier: the two capsules dark glass with one small lamp each, and a machined
               aluminium knob in place of the embossed circles
   Image 1 is this game's own frame whose panel is the flat layout drawing (layout_steel.py); image 2 is the lower part
   of the user's own reference picture for this skin, enlarged (sending it is permitted by the user). The reference's
   lettering and numbers are left out.
   python3 -I prompt_steel.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

HEAD = (
    "Two pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
    "camera, a glowing pale-blue judge line crosses them (with a white burst on it), under it lies a row of eight flush, dark "
    "matte key caps, each embossed with a small plus or cross (one of them is lit blue), under that row a narrow dark band with "
    "a slot that glows blue at its middle, and under that band, between the two thin slate-grey side rails, lies the gear's "
    "lower panel: a wide slab that runs down to the bottom edge of the image, widening toward the camera. In image 1 the panel "
    "is a FLAT LAYOUT DRAWING of a machine's front. Its far part is a plain blue-grey face with a soft blue light in its right "
    "half. Then comes a step across the whole width: a thin light edge with a dark line under it. Its near part is a darker "
    "shelf, and drawn on the shelf are: a thin dark rule that runs from the left and ends in two dots and a dash; at the right "
    "corner, right under the step, a window cut at a slant that glows blue; two long capsule-shaped windows side by side, at "
    "the left and in the middle, {capsules}; and at the right, near the bottom, {right}. The drawing shows exactly where each "
    "thing lies and how large it is.\n\n"
    "IMAGE 2 is the DESIGN REFERENCE: a small concept picture of this very machine (it is enlarged, so it is blurry), in the "
    "style the panel must have: precision hardware in dark blue-grey brushed metal, like the front of a high-end audio "
    "amplifier or a workstation: calm, plain and dark, with one cool blue light. Match its materials, its colours and its mood. "
    "Its lettering (the italic word at the right) and its numbers (in the two capsules) are NOT wanted: leave them out, and "
    "write no text at all. Its row of keys with plus and cross marks and the lit slot under them are in image 1 already: do "
    "not paint them again on the panel.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps, the band with the slot and the two side rails stay at exactly the same "
    "places and sizes. Do not zoom in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint "
    "ONLY the panel: the area under the dark band with the glowing slot, between the inner edges of the two side rails, down to "
    "the bottom edge of the image. Keep every other pixel exactly as it is: the lanes, the note, the judge line and the burst "
    "on it, the row of key caps, the band with the slot, the rails, the dark background.\n\n"
    "The panel becomes that machine's front as a photorealistic 3D render at the finish of a commercial console game, seen "
    "exactly from this camera. Every thing of the layout drawing stays exactly at its place and at its size (the same "
    "footprint, the same angle), foreshortened by the camera exactly as in image 1: do not move, enlarge or shrink anything, do "
    "not stand anything upright, and add nothing.\n\n"
    "1. THE FACE, the far part: one plate of dark blue-grey anodised aluminium (gunmetal) with a fine, straight hairline "
    "brushing that runs across it from left to right; satin, not glossy. It is completely plain: no lettering, no logo, no "
    "marks, no screws, no seams. A soft cool-blue light lies on its right half, strongest along its near edge at the right, "
    "where the shelf's light window shines up onto it (as drawn), and fades to nothing toward the left.\n\n"
    "2. THE STEP: the face ends in a crisp, straight, chamfered edge that catches a thin line of light; under it the body steps "
    "down about a finger's thickness to the shelf, and that small drop lies in shadow (the drawn dark line). The step runs "
    "straight across the whole width.\n\n"
    "3. THE SHELF, the near part: a plate of the same brushed metal, a shade darker than the face and set lower. A fine "
    "straight rule is engraved into it (as drawn: from the left to about two thirds of the width): a sharp groove, dark inside, "
    "with a thin lit lower edge, ending in two small drilled dots and one short milled dash.\n\n"
    "4. THE LIGHT WINDOW, at the shelf's right corner right under the step (as drawn, its left edge cut at a slant): a pane of "
    "smoked dark-blue glass set flush into the metal and lit from inside by a cool blue lamp: brightest at the middle of its "
    "near edge, falling off softly to deep navy toward its corners. Its light spills softly onto the shelf under it and onto "
    "the face above it.\n\n"
)
TAIL = (
    "Each raised thing throws a soft shadow. Clean, precise and new: no dirt, no scratches, no wear, no fingerprints. The top "
    "edge of the panel under the band is a thin bevelled lip. Everything stays inside the rails; nothing rises over the rails "
    "or above the key caps, and the panel runs on down past the bottom edge of the image (no front edge is seen). Nothing else "
    "is on the panel: no screens, no number boxes, no sliders, no switches, no cables, no screws, no stickers, no people, no "
    "hands.\n\n"
    "No text, letters or numbers anywhere, no logos, no watermark, and nothing over the lanes. Colours: dark blue-grey gunmetal "
    "(close to #2B333F on the face and #1A1F27 on the shelf); one cool blue light (close to #46AAF0); {colours}"
)
VARIANTS = {
    "steel-a3": (
        HEAD.format(capsules="each holding a row of upright bars (green in the left one, blue in the right one)",
                    right="three circles (one above, two below)")
        + "5. THE TWO LEVEL METERS, on the shelf at the left and in the middle (the two drawn capsules): each is a long "
        "capsule-shaped window (a stadium shape with fully round ends) of black glass, set flush into the metal inside a thin "
        "bevelled metal rim. Behind the glass of each stands a row of upright LED bars, as on the level meter of a studio "
        "amplifier: in the left capsule 13 bars, the first 9 from the left lit bright green and the last 4 unlit (very dark "
        "green); in the right capsule 16 bars, the first 12 from the left lit bright blue and the last 4 unlit (very dark "
        "blue). The lit bars glow softly through the glass and lay a faint sheen of their colour on the rim. No numbers, no "
        "letters, no scale marks.\n\n"
        "6. THE THREE CIRCLES, at the shelf's right, near the bottom (as drawn: one above, two below, just touching): three "
        "shallow round dimples pressed into the metal, tone on tone, the same brushed metal inside, each with a fine chamfered "
        "rim that catches a thin crescent of light. Subtle: an embossed mark without any letter.\n\n"
        + TAIL.format(colours="the meters' green (close to #54EC5C) and blue (close to #4896FF).")
    ),
    "steel-a4": (
        HEAD.format(capsules="each dark with one small round lamp at its left end (green in the left one, blue in the right one)",
                    right="a round silver knob with a ring of short tick marks round it")
        + "5. THE TWO INDICATOR WINDOWS, on the shelf at the left and in the middle (the two drawn capsules): each is a long "
        "capsule-shaped window (a stadium shape with fully round ends) of black glass, set flush into the metal inside a thin "
        "bevelled metal rim. Each is dark and empty but for ONE small round lamp at its left end (as drawn): bright green in "
        "the left window, bright blue in the right one; each lamp glows softly and lays a faint sheen of its colour on the "
        "glass round it. A soft, thin reflection runs along the upper part of each glass. No numbers, no letters, no bars.\n\n"
        "6. THE KNOB, at the shelf's right, near the bottom (as drawn): the volume knob of a high-end amplifier: a low, solid "
        "cylinder of machined, clear-anodised silver aluminium lying on the shelf, about as high as two fingers are thick. Its "
        "side is finely knurled; its flat top is spin-brushed in fine concentric circles, so that it shows the fan-shaped "
        "highlights of turned metal, with a narrow polished chamfer round it and one short engraved index line, filled white, "
        "that points to the upper left (as drawn). Round the knob a ring of thirteen short tick marks is engraved into the "
        "shelf (as drawn), without any numbers. The knob throws a soft shadow on the shelf, and the blue light of the window "
        "above it glints on its side.\n\n"
        + TAIL.format(colours="the two small lamps, green (close to #54EC5C) and blue (close to #4896FF); the knob is silver aluminium.")
    ),
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    prompt = VARIANTS[key]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read()), ("image/png", open(S + 'refs/steel-console.png', 'rb').read())]
    png, usage = generate(prompt, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the panel a flat layout drawing)",
                            "refs/steel-console.png (the lower part of the user's reference picture for this skin, enlarged; not kept in the repository)"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
