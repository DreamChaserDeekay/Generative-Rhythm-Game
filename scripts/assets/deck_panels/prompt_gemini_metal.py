"""Trial (the user's direction on the Gemini gear's panel): "the gear has no feel of metal at all: bring out a smooth metal
   with a slight gloss". Only the GROUND is made here, as a flat texture: image 1 is the drawn ground (reground_gemini.py: the
   pale blue > lavender > pink the user settled, with the slanted bands of light), and the model repaints it as a photograph
   of a sheet of smooth anodised metal. The things that lie on it (the spark, the crowned wordmark, the banana) are not
   generated again: reground_gemini.py lays draft 4-A's own pixels on this ground.
   python3 -I prompt_gemini_metal.py <folder> <try name> [<finish>]     finish: satin (default) or gloss"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

FINISH = {
    "satin": (
        "pastel ANODISED ALUMINIUM with a satin-smooth finish and a slight gloss, like the lid of a premium pastel-coloured laptop "
        "or the back of an anodised phone: smooth to the touch, softly reflective, not a mirror"
    ),
    "gloss": (
        "pastel-tinted POLISHED METAL with a smooth semi-gloss finish, like a polished, pastel-anodised aluminium panel of a "
        "premium hi-fi device: smooth, clearly reflective, the lights mirrored in it softly but distinctly; still not a chrome mirror"
    ),
}
PROMPT = (
    "One picture comes with this request. IMAGE 1 is a flat COLOUR PLAN of a surface: very pale pastel colours that run from pale "
    "sky blue at the left through pale lavender in the middle to pale pink at the right, crossed by a few soft slanted bands of "
    "lighter colour.\n\n"
    "Repaint image 1 as a straight-on, orthographic, top-down studio photograph of ONE flat sheet of smooth metal that fills the "
    "whole picture edge to edge: {finish}.\n\n"
    "KEEP from image 1: its colours and their lightness at every place (it is PALE: do not make it darker, greyer or more "
    "saturated), the run of blue, lavender and pink from left to right, and the places and the slant of the lighter bands. The "
    "picture must look the same along its whole height: the top of the picture is not brighter, darker or differently coloured "
    "than the bottom.\n\n"
    "MAKE IT METAL: the lighter slanted bands are the reflections of long studio strip lights in the metal. Each has a brighter, "
    "cleaner core and soft edges and runs unbroken from the top edge of the picture to the bottom edge, as wide and as bright at "
    "the top as at the bottom. Between the reflections lies the metal's own colour, a touch deeper. Over all of it the smooth, "
    "directional sheen of real metal and an extremely fine, even metallic grain (the micro-sparkle of bead-blasted anodised "
    "aluminium) that is visible only close up. Photorealistic, like a product photograph of a material sample.\n\n"
    "It is a texture: no objects, no text, no letters, no logos, no scratches, no dents, no seams, no screws, no holes, no edges "
    "or corners of the sheet, no border, no frame, no vignette, no dark corners, no horizon, no perspective, no cast shadows, no "
    "hot spot of light."
)

if __name__ == "__main__":
    folder, name = sys.argv[1], sys.argv[2]
    finish = sys.argv[3] if len(sys.argv) > 3 else "satin"
    prompt = PROMPT.format(finish=FINISH[finish])
    png, usage = generate(prompt, [("image/png", open(S + f'{folder}/ground-1.png', 'rb').read())], "21:9")
    open(S + f'{folder}/metal-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "21:9", "size": "2K", "finish": finish, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{folder}/ground-1.png (the drawn ground: this project's own picture)"]},
              open(S + f'{folder}/metal-{name}.json', 'w'), indent=1)
    print("made metal", folder, name, finish, len(png), usage.get("totalTokenCount"))
