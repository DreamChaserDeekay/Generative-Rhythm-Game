"""Trial (the user's change of mind): the Gemini gear's lower panel: on a white slab, from left to right, Google's four dots
   as glass marbles rolling in, the four-colour spark, and the wordmark Gemini with a gold crown on its G, the logo and the
   crown as solid things, on smooth metal in a blue-violet-pink gradient (layout_gemini_base.py). Image 1 is this game's own frame whose panel is the flat layout drawing;
   image 2 is the spark, image 3 the official logo.   python3 -I prompt_gemini_base.py <folder> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

PROMPT = (
    "Three pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
    "camera, a glowing judge line crosses them, under it lies a row of eight key caps, and under that row, between the two side "
    "rails, lies the gear's lower panel: a wide slab that runs from the key caps down to the bottom edge of the image, widening "
    "toward the camera. In image 1 the panel is a FLAT LAYOUT DRAWING: a slab coloured in one smooth gradient, blue at its left, "
    "violet in its middle and pink at its right, and drawn flat on it, from left to right: "
    "four round dots (blue, red, yellow, green); a four-pointed star emblem in a gradient of blue, red, yellow and green; and the "
    "word Gemini in thick black letters, with a small gold crown sitting on its capital G. The drawing shows exactly where each "
    "thing lies and how large it is.\n\n"
    "IMAGE 2 is the DESIGN REFERENCE for the emblem: a four-pointed star with deeply curved sides and softly rounded points, its "
    "colours flowing into one another: red at its top point, yellow at its left point, green at its bottom point, and a clear "
    "blue over its middle and its right point. Reproduce its shape and its colours faithfully.\n\n"
    "IMAGE 3 is the DESIGN REFERENCE for the wordmark: a logo, the star followed by the word Gemini in a clean, bold, geometric "
    "sans-serif. Reproduce the shapes of its six letters faithfully.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps and the two side rails stay at exactly the same places and sizes. Do not zoom "
    "in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint ONLY the panel: the area under "
    "the row of key caps, between the inner edges of the two side rails, down to the bottom edge of the image. Keep every other "
    "pixel exactly as it is: the lanes, the notes, the judge line and the flash on it, the row of key caps, the rails, the dark "
    "background.\n\n"
    "The panel becomes one slab of SMOOTH METAL seen exactly from this camera, as a photorealistic 3D render at the finish of a "
    "commercial console game: polished anodised aluminium with a satin-mirror sheen, like the back of a premium phone, its "
    "colour one seamless gradient exactly as in the layout drawing: a soft cornflower blue at the left edge, flowing through a "
    "clear violet in the middle to a rose pink at the right edge. It is perfectly smooth: no brushed lines, no scratches, no "
    "grain, no pattern, no seams. Broad, soft, clean highlights of the studio light glide over it and its colours stay clear "
    "and bright everywhere: no grey area, no dark band, no vignette and no black reflection anywhere on the slab.\n\n"
    "ON THE SLAB lie the things of the layout drawing, each as a SOLID THREE-DIMENSIONAL OBJECT lying FLAT on the slab, exactly at "
    "the place and at the size the layout drawing gives it, foreshortened by the camera exactly as in image 1: do not stand "
    "anything upright, do not turn anything toward the viewer, do not move, enlarge or shrink anything, and add nothing. Each "
    "throws only a short, tight, soft shadow right at its near edge, tinted by the metal's own colour. There is NO grey haze, no "
    "dark patch, no halo and no plate on the slab behind or round the wordmark or round anything else: the coloured metal "
    "runs clean and bright right up to every object.\n\n"
    "1. THE FOUR MARBLES, at the left: four glossy glass marbles of the same size, one clear blue, one red, one yellow, one green, "
    "in that order from left to right, at the places of the layout drawing's four dots (a loose, bouncing row, as if they were "
    "rolling in toward the emblem). Each is a solid ball of clear coloured glass with a bright highlight, and throws a soft pool "
    "of its own colour onto the metal.\n\n"
    "2. THE EMBLEM, right of the marbles: the star of image 2 as one solid thing: a thick, softly pillowed tablet of glossy glass "
    "in exactly that shape, the four colours flowing into one another inside it as in image 2 (red at the top point, yellow at "
    "the left point, green at the bottom point, blue over the middle and the right point), with soft highlights along its curved "
    "edges and a faint glow of its colours on the slab round it.\n\n"
    "3. THE WORDMARK, right of the emblem: the word Gemini (a capital G, then lowercase e, m, i, n, i: exactly these six letters) "
    "as thick, chunky three-dimensional letters lying flat on the slab, raised about as high as a finger is thick, with softly "
    "rounded edges, of glossy black enamel (deep polished black with soft white highlights along the edges and faint reflections "
    "of the coloured things near them). The letters have exactly the shapes and the places of the layout drawing.\n\n"
    "4. THE CROWN, on the capital G: a small royal crown as a solid three-dimensional thing of polished gold, exactly where the "
    "layout drawing has it and as large, tilted jauntily to the left as drawn: a band set with four small round gems (blue, red, "
    "yellow, green, from left to right) and five points rising from it, each tipped with a small gold ball. It lies flat on the "
    "slab like the letters, its band overlapping the top of the G, so that the G wears it like a king. Rich, warm gold with "
    "bright highlights and a soft shadow.\n\n"
    "The top edge of the panel under the key caps is a thin bevelled lip. Everything stays inside the rails; nothing rises over "
    "the rails or above the key caps, and the panel runs on down past the bottom edge of the image (no front edge is seen). "
    "Nothing else lies on the slab. No other text, letters or numbers than the word Gemini, no other logos, no watermark, no "
    "people, no hands, and nothing over the lanes. Colours: the slab's blue, violet and pink; the four colours blue (close to "
    "#4285F4), red (#EA4335), yellow (#FBBC04) and green (#34A853); gloss black for the letters; gold for the crown."
)

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read()), ("image/jpeg", open(S + 'refs/gemini-spark.jpg', 'rb').read()),
                ("image/png", open(S + 'refs/gemini-logo.png', 'rb').read())]
    png, usage = generate(PROMPT, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": PROMPT, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen, the corner stickers off, the panel a flat layout drawing laid in by synth.py)", "refs/gemini-spark.jpg", "refs/gemini-logo.png"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
