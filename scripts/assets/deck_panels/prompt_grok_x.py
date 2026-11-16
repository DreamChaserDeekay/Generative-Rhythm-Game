"""Trial (the user's fifth direction on the GROK gear's panel): "behind the Doge and the Starship, the Twitter (X) logo, in
   3D, large". The finished picture of draft 4 is changed by the image model: image 1 is that picture in this game's own
   frame (layout_grok_x.py, synth.py), image 2 the same with the logo drawn flat under the rocket (the guide: place
   and size), image 3 the logo. The metal of the logo is not given by the user: two are made, silver (as the rocket's
   steel) and black (gloss on the matte slab).
   python3 -I prompt_grok_x.py <folder> <try name> <silver|black>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

METAL = {
    "silver": (
        "of SILVER STEEL: satin-brushed top faces and polished, bright bevelled edges, like the stainless steel of the rocket; it "
        "stands out clearly from the black slab"
    ),
    "black": (
        "of GLOSSY BLACK METAL (black chrome): a deep, mirror-like black on the matte black slab, tone on tone; it is told from the "
        "slab by its gloss, by the crisp bright highlights along its bevelled edges and by the soft reflections on its top faces"
    ),
}
PROMPT = (
    "Three pictures come with this request.\n\n"
    "IMAGE 1 is the FINISHED PICTURE you change: the lower part of a frame of our own rhythm game's play screen. Note lanes run "
    "away from the camera, a glowing white judge line crosses them, under it lies a row of eight black key caps outlined in "
    "white, and under that row, between the two thin white side rails, lies the gear's lower panel: a wide slab of matte black "
    "metal that runs down to the bottom edge of the image. On the slab: a big flat white ball with two black eyes printed in "
    "its lower left corner; a flat rust-orange emblem printed in its upper right corner; and, at the middle, a steel rocket "
    "flying to the upper right with a Shiba Inu dog riding it, the word SPACEX on its hull, a flame out of its tail and thin "
    "speed streaks behind it.\n\n"
    "IMAGE 2 is a GUIDE: the same picture with ONE thing added as a flat grey drawing: a large X-shaped mark on the slab, "
    "UNDER the rocket, the dog and the flame. It shows exactly where the new thing lies and how large it is. The guide is "
    "rough: where the grey mark has holes or ragged edges beside the rocket, ignore them; the mark is whole and runs on under "
    "the rocket.\n\n"
    "IMAGE 3 is the DESIGN REFERENCE for that mark: the X logo: two diagonal strokes that cross: a slim solid bar from the upper "
    "right to the lower left, and a broad bar from the upper left to the lower right that is HOLLOW (only its outline, a thin "
    "frame). Reproduce this shape faithfully.\n\n"
    "CHANGE ONLY THIS: add the X logo of image 3 to the slab as a large, solid THREE-DIMENSIONAL emblem, exactly at the place "
    "and at the size of image 2's grey mark: the logo cut from thick plate {metal}. It is set into the matte black slab and "
    "lies flat on it, raised about as high as two fingers are thick, with crisp bevelled edges, seen from this camera and "
    "foreshortened by it exactly as the guide's mark is; it throws a soft shadow on the slab.\n\n"
    "It lies BEHIND the rocket: the rocket, the dog, the flame, the sparks and the streaks are in front of it (above it) and "
    "hide the parts of it they pass over; the rocket and the dog throw their soft shadow onto it, and the flame's blue-white "
    "light glints on the bevels near it.\n\n"
    "KEEP EVERYTHING ELSE EXACTLY AS IMAGE 1 HAS IT: the framing (the same camera, zoom and crop: your picture must overlay "
    "image 1 pixel for pixel), the lanes, the judge line, the key caps, the rails; the white ball print with its two black "
    "eyes and the orange emblem print (flat prints: same shapes, places, sizes and colours); the rocket (the same place, size "
    "and angle), the dog (the same pose and face), the SPACEX lettering, the flame, the sparks and the streaks; and the "
    "darkness of the slab. Do not move, resize, redraw or restyle any of them, and add nothing else: no other logo, no text, "
    "no other objects, no watermark."
)

if __name__ == "__main__":
    key, name, metal = sys.argv[1], sys.argv[2], sys.argv[3]
    prompt = PROMPT.format(metal=METAL[metal])
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read()), ("image/png", open(S + f'{key}-g/tmpl-crop.png', 'rb').read()),
                ("image/png", open(S + 'refs/x-logo.png', 'rb').read())]
    png, usage = generate(prompt, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "metal": metal, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (draft 4's finished picture in this game's own frame)", f"{key}-g/tmpl-crop.png (the same with the logo drawn flat under the rocket)", "refs/x-logo.png"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, metal, len(png), usage.get("totalTokenCount"))
