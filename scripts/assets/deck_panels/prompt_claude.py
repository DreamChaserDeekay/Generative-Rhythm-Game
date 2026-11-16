"""Trial (the user's third direction, on draft 2-B): a change to the finished render of draft 2-B, not a new render, so that
   what the user chose stays as it is (the paper, the mascot, the puffs of dust): the sun moves into the panel's far left
   corner, large, only a quarter of it on the sheet, its painted strokes only there; the black speed lines go.
   Image 1 is draft 2-B's render (before the pelican is printed on), image 2 the layout drawing of the changed panel in the
   same frame (layout_claude.py, synth.py), image 3 the spark.   python3 -I prompt_claude.py <folder> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S
BASE = 'claude-b1/try-1.png'

PROMPT = (
    "Three pictures come with this request.\n\n"
    "IMAGE 1 is the FINISHED PICTURE you change: the lower part of a frame of our own rhythm game's play screen. Its lower panel "
    "(under the row of key caps, between the two side rails) is a sheet of ivory paper with these things on it: near its far left "
    "corner a starburst emblem of terracotta clay with a ring of short yellow and orange brush strokes painted round it; left of "
    "the middle six black speed lines one above the other and, under them, a few small puffs of dust; at the right a terracotta "
    "toy creature with two black eyes.\n\n"
    "IMAGE 2 is a FLAT LAYOUT DRAWING of the same frame as it must be after the change. It shows where things lie and how large "
    "they are: the emblem very large and set into the panel's far left corner so that only a quarter of it is on the sheet, six "
    "short strokes round that quarter, no black lines; the puffs and the creature where they already are.\n\n"
    "IMAGE 3 is the design reference for the emblem (a hand-cut starburst of uneven rays).\n\n"
    "Make these three changes to image 1, and NO others:\n\n"
    "A. THE EMBLEM MOVES INTO THE CORNER AND GROWS. Take the emblem and its ring of strokes away from where they are now, "
    "leaving bare ivory paper with its grain there. Put the emblem, the same object of the same fired terracotta clay, into the "
    "panel's far left corner exactly as image 2 shows: much larger, its middle exactly at the corner where the left rail meets "
    "the row of key caps, so that ONLY ITS LOWER RIGHT QUARTER lies on the sheet, the rest being cut off by the edge under the "
    "key caps and by the left rail: a quarter of the starburst, a fan of thick clay rays of uneven length reaching out from the "
    "corner, as far as in image 2. It lies flat on the paper, foreshortened as the sheet is, about as thick as two fingers, with "
    "softly rounded edges, matte, with a short soft shadow under its edges.\n\n"
    "B. THE PAINTED RAYS, ONLY AT THAT CORNER. Round the quarter emblem, beyond the tips of its rays, paint the short strokes of "
    "image 2: about six separate dabs of a dry, flat brush in golden yellow and warm orange gouache by turns, in the same manner "
    "as the strokes of image 1 (ragged bristle ends, streaks of bare paper showing through), each pointing away from the corner, "
    "with clear paper between them. No such strokes anywhere else on the sheet. A faint warm glow lies on the paper at that "
    "corner only. No beams, shafts or stripes of light.\n\n"
    "C. THE BLACK LINES GO. Remove all six black straight speed lines completely, leaving bare ivory paper with its grain where "
    "they were. KEEP the small puffs of dust under them exactly as they are.\n\n"
    "Keep everything else of image 1 EXACTLY as it is: the framing, the camera, the zoom and the crop (your picture must overlay "
    "image 1 pixel for pixel); the lanes, the notes, the judge line and the flash on it, the row of key caps, the rails and the "
    "dark background; the paper with its grain and its even light; the toy creature at the right with its shadow, unchanged in "
    "place, size, shape and colour; the puffs of dust; and the wide empty space between the puffs and the creature, which stays "
    "empty (a drawing is printed there later). No text, no letters, no numbers, no other logos, no watermark."
)

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    pictures = [("image/png", open(S + BASE, 'rb').read()), ("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read()),
                ("image/jpeg", open(S + 'refs/claude-spark.jpg', 'rb').read())]
    png, usage = generate(PROMPT, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": PROMPT, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [BASE + " (draft 2-B's render, the picture changed)", f"{key}/tmpl-crop.png (the layout drawing of the changed panel in this game's own frame)", "refs/claude-spark.jpg"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
