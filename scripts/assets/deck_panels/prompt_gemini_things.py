"""Trial (the user's change to draft 3-A): a change to draft 3-A's finished render, not a new render, so that what the user
   chose stays (the metal's sheen, the spark, the wordmark, the crown): the four marbles go; the metal's colours become
   lighter; a banana is added near the near right corner; and, for the second folder, the logo moves left to the middle of
   what stays in view. Image 1 is draft 3-A's render, image 2 the layout drawing of the changed panel in the same frame
   (layout_gemini_things.py, synth.py).   python3 -I prompt_gemini_things.py <folder> <try name> [move]"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S
BASE = 'gemini-d1/try-1.png'

HEAD = (
    "Two pictures come with this request.\n\n"
    "IMAGE 1 is the FINISHED PICTURE you change: the lower part of a frame of our own rhythm game's play screen. Its lower panel "
    "(under the row of key caps, between the two side rails) is a slab of smooth polished metal coloured in a gradient, blue at "
    "the left, violet in the middle, pink at the right, and on it lie, from left to right: four glass marbles (blue, red, yellow, "
    "green); a four-pointed star emblem of glossy glass in blue, red, yellow and green; and the word Gemini in thick glossy black "
    "letters with a small gold crown on its capital G.\n\n"
    "IMAGE 2 is a FLAT LAYOUT DRAWING of the same frame as it must be after the change. It shows where things lie, how large they "
    "are, and how light the slab's colours must be: a paler slab; no marbles; the emblem and the crowned word; and a banana near "
    "the panel's near right corner.\n\n"
    "Make these changes to image 1, and NO others:\n\n"
    "A. THE FOUR MARBLES GO. Remove the four glass marbles left of the emblem completely, with their shadows and the pools of "
    "coloured light they throw, leaving bare, smooth metal where they were.\n\n"
    "B. THE METAL BECOMES PALER. Keep the slab the same smooth polished metal with the same clean sheen and the same gradient "
    "from left to right, but make its colours clearly lighter and softer, pastel, as light as image 2 shows them: a pale sky "
    "blue at the left, a pale lilac in the middle, a pale rose pink at the right. It must be this light over the WHOLE slab, also "
    "toward the camera: no deep violet, no dusky or dark area and no grey patch anywhere on it. It must still read as polished "
    "METAL, not as flat paint: the broad, soft, bright highlights that glide over the slab in image 1 stay.\n\n"
    "C. A BANANA IS ADDED. Near the panel's near right corner, exactly where image 2 has it and as large: one small ripe banana as "
    "a solid three-dimensional thing lying flat on the metal: smooth and glossy, a clean bright yellow, gently curved, with a "
    "short stem at one end and a small dark tip at the other, like a perfect little banana in a product render; a short, soft "
    "shadow under it. Only one banana; do not peel it, do not add a sticker or a face.\n\n"
)
MOVE = (
    "D. THE LOGO MOVES LEFT. Move the emblem and the word Gemini with its crown, all three together and unchanged in size, shape, "
    "material and colour, to the left, to exactly where image 2 has them (the emblem now lies where the marbles were). Bare "
    "metal where they were before.\n\n"
)
TAIL = (
    "Keep everything else of image 1 EXACTLY as it is: the framing, the camera, the zoom and the crop (your picture must overlay "
    "image 1 pixel for pixel); the lanes, the notes, the judge line and the flash on it, the row of key caps, the rails and the "
    "dark background; the emblem of glossy glass; the word Gemini in glossy black letters, every letter's shape; the gold crown "
    "with its four gems on the G{where}. The shadows stay short and tight, tinted by the metal: no grey haze and no dark halo "
    "round the word or round anything else. No other text, letters or numbers, no other logos, no watermark."
)

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    move = len(sys.argv) > 3 and sys.argv[3] == 'move'
    prompt = HEAD + (MOVE if move else '') + TAIL.format(where='' if move else ', all three unchanged in place and size')
    pictures = [("image/png", open(S + BASE, 'rb').read()), ("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read())]
    png, usage = generate(prompt, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [BASE + " (draft 3-A's render, the picture changed)", f"{key}/tmpl-crop.png (the layout drawing of the changed panel in this game's own frame)"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
