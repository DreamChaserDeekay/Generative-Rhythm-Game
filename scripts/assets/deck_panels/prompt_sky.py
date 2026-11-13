"""Trial: a skin's lower panel as a 3D render with no readout windows, the whole panel in view; the user's reference
   picture for that skin goes along as the look reference, as the user asked. Image 1 is this game's own frame (the
   frame moved up so that the whole panel shows) with a flat placeholder.
   python3 -I prompt_sky.py <gear> <try number>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

KEEP = (
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, {keys} and the two side rails stay at exactly the same places and sizes. Do not zoom in, do not "
    "crop, do not widen, do not recompose, do not enlarge or shrink the panel, and do not move the picture toward image 2's "
    "composition. Repaint ONLY the panel: the area under {keys}, between the inner edges of the two side rails, down to "
    "the bottom edge of the image. Keep every other pixel exactly as it is: the lanes, the notes, the judge line and the flash on it, "
    "{keys}, the rails, the dark background.\n\n"
)
TAIL = "One soft key light from the top-left. No text, no letters, no numbers, no logos, no watermark, and nothing over the lanes."

GEARS = {
    "sky": {
        "reference": "inputs/ref-user/ref-02.png",
        "prompt": (
            "Two pictures come with this request.\n\n"
            "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
            "camera, a glowing sky-blue judge line crosses them, under it lies a narrow dark-blue strip with one short pale dash for each "
            "lane and a thin white line along its lower edge, and under that strip, between the two pale steel-blue side rails, lies the "
            "gear's lower panel: a wide slab that runs from the strip down to the bottom edge of the image, widening toward the camera. "
            "In image 1 that panel is only a FLAT placeholder drawing (a blurred blue sky).\n\n"
            "IMAGE 2 is a LOOK REFERENCE ONLY: a screenshot of the sky gear of another rhythm game. Take from it only the look of the "
            "panel at the bottom of its gear: a real daytime sky as a photograph shows it: deep clear azure at the top, towering bright "
            "white cumulus clouds lit by the sun with soft blue shadows, sunlight glowing low in it, and a few hairline curves of white "
            "light sweeping across like long-exposure trails, with a tiny sparkle where they meet the light. Do NOT copy anything else "
            "from image 2: not its layout, not its tall lane frame, not its stars, not its dashes, not its small readouts (the rings and "
            "the words over them), not its text, not the dotted meter at its right side.\n\n"
            + KEEP.format(keys="the dashed strip") +
            "The panel becomes ONE thick slab of clear glass lying flat like a console between the rails and seen exactly from this "
            "camera, as a photorealistic 3D render at the finish of a commercial console game, and sealed inside the glass is the sky of "
            "image 2: you look down through the glass into a real blue sky with white cumulus clouds at different depths under the "
            "surface (the nearer ones larger), sunlit, with soft blue shadows; a few hairline curves of white light sweep through it as "
            "in image 2. The glass's top surface carries a faint, soft reflection, and its top edge under the dashed strip is a bevelled "
            "lip catching the light. The slab stays inside the rails everywhere: nothing rises over the rails or above the strip, and it "
            "runs on down past the bottom edge of the image (no front edge is seen).\n\n"
            "The slab is sky all over: NO windows, NO display, NO dark plates, NO insets, NO frames, NO sockets (the game shows its "
            "numbers elsewhere). The flat placeholder of image 1 only shows where the panel is; paint the sky anew.\n\n"
            "Deliberately PLAIN and calm: NO wings, NO feathers, NO birds, NO round medallion or emblem, NO ornate frames, NO scrollwork, "
            "NO sun disc, NO lens flare rings, NO aeroplanes, NO rainbow. Deep blue lies right under the dashed strip and the first "
            "clouds begin a little below it: that upper part is what players see most, so the finest clouds and the curves of light "
            "are there; toward the bottom edge the clouds grow larger and calmer.\n\n"
            "Colours as in image 2: azure and cobalt blue, bright white clouds with pale blue shadows, a little warm sunlight low in it.\n\n"
            + TAIL
        ),
    },
}

if __name__ == "__main__":
    gear, n = sys.argv[1], sys.argv[2]
    g = GEARS[gear]
    frame, reference = open(S + f'{gear}/tmpl-crop.png', 'rb').read(), open(S + g["reference"], 'rb').read()
    png, usage = generate(g["prompt"], [("image/png", frame), ("image/png", reference)], "16:9")
    open(S + f'{gear}/try-{n}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "prompt": g["prompt"], "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{gear}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, a flat placeholder)",
                            g["reference"] + " (the user's reference picture for this skin, sent on the user's word)"], "crop": [160, 180, 1760, 1080]},
              open(S + f'{gear}/try-{n}.json', 'w'), indent=1)
    print("made", gear, n, len(png), usage.get("totalTokenCount"))
