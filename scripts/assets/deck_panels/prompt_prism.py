"""Trial: the crystal gear's lower panel as a 3D render with no readout windows, the whole panel in view, and the user's
   reference picture (the crystal gear of another rhythm game) sent along as the material reference, as the user asked.
   Image 1 is this game's own frame (the frame moved up so that the whole panel shows) with a flat placeholder slab.
   python3 -I prompt_prism.py <out name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

FRAME = S + 'inputs/p3/tmpl-crop.png'          # this game's own frame, 1600 x 900 of the 1920 x 1080 screen
REFERENCE = S + 'inputs/ref-user/ref-01.png'   # the user's reference picture 1

PROMPT = (
    "Two pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
    "camera, a glowing blue judge line crosses them, under it lies a row of eight white crystal key caps, and under the key caps, "
    "between the two bright side rails, lies the gear's lower panel: a wide slab that runs from the key caps down to the bottom edge "
    "of the image, widening toward the camera. In image 1 that panel is only a FLAT placeholder drawing.\n\n"
    "IMAGE 2 is a MATERIAL REFERENCE ONLY: a screenshot of the crystal gear of another rhythm game. Take from it only the look of its "
    "crystal (the block of cut crystal at the bottom of its gear): large mirror-bright facets of clear icy glass, near-white where "
    "they catch the light, silver-blue and periwinkle between, deeper blue-violet where a facet turns away from the light, razor-sharp "
    "white edges where facets meet, and soft holographic reflections inside the stone. Do NOT copy anything else from image 2: not its "
    "layout, not its tall lane frame, not its stars, not its small rings and dots, not its chequered patch, not its text, and not its "
    "outline: there the crystal bursts out sideways in big shards like wings, and ours must not.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the key caps and the two side rails stay at exactly the same places and sizes. Do not zoom in, do not "
    "crop, do not widen, do not recompose, do not enlarge or shrink the panel, and do not move the picture toward image 2's "
    "composition. Repaint ONLY the panel: the area under the row of key caps, between the inner edges of the two side rails, down to "
    "the bottom edge of the image. Keep every other pixel exactly as it is: the lanes, the notes, the judge line and the flash on it, "
    "the key caps, the rails, the dark background.\n\n"
    "The panel becomes ONE thick slab of cut crystal lying flat like a console between the rails and seen exactly from this camera, "
    "as a photorealistic 3D render at the finish of a commercial console game, made of the crystal of image 2. You look down into the "
    "stone and see its inner planes and refractions; the facets meet in crisp ridges, some planes a little higher than their "
    "neighbours, catching the light with sharp specular edges and throwing soft, short shadows down and to the right; the slab's top "
    "edge under the key caps is a bevelled lip catching the light. The slab stays inside the rails everywhere: nothing sticks out "
    "over the rails or above the key caps, and it runs on down past the bottom edge of the image (no front edge is seen).\n\n"
    "The slab is crystal all over: NO windows, NO display, NO dark plates, NO insets, NO frames, NO sockets (the game shows its "
    "numbers elsewhere). The flat placeholder of image 1 only shows where the panel is; cut the slab's facets anew.\n\n"
    "Deliberately PLAIN and bold: NO wings, NO fans of crystal spikes, NO round medallion or emblem, NO gems set in metal rings, NO "
    "studs, NO filigree, NO metal ornament. A few LARGE facets cut at different angles, asymmetric. The part nearest the key caps is "
    "what players see most, so the finest cutting is there; toward the bottom edge the facets grow larger and calmer.\n\n"
    "Colours as in image 2's crystal: ice white, silver-blue, periwinkle and blue-violet, with hairline rainbow dispersion at a few "
    "edges.\n\n"
    "One soft key light from the top-left. No text, no letters, no numbers, no logos, no watermark, and nothing over the lanes."
)


if __name__ == "__main__":
    name = sys.argv[1]
    frame, reference = open(FRAME, 'rb').read(), open(REFERENCE, 'rb').read()
    png, usage = generate(PROMPT, [("image/png", frame), ("image/png", reference)], "16:9")
    open(S + f'inputs/p3/{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "prompt": PROMPT, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": ["inputs/p3/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, a flat placeholder slab)",
                            "inputs/ref-user/ref-01.png (the user's reference picture 1, sent on the user's word)"], "crop": [160, 180, 1760, 1080]},
              open(S + f'inputs/p3/{name}.json', 'w'), indent=1)
    print("made", name, len(png), usage.get("totalTokenCount"))
