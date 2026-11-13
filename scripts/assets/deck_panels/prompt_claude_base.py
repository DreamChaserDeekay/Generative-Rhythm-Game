"""Trial (the user's second direction): the Claude gear's lower panel: a sheet of ivory paper; the Claude spark near its far
   left corner as the sun, with short painted brush strokes round it (no shafts of light over the sheet); hand-drawn speed
   marks; the Claude Code mascot as a 3D toy figure running at the right (layout_claude_base.py). The pelican and its bicycle
   are printed on afterwards as they are (print_on_paper.py), between the speed marks and the mascot. Image 1 is this game's own
   frame whose panel is the flat layout drawing; image 2 is the spark, image 3 the mascot.
   python3 -I prompt_claude_base.py <folder> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

PROMPT = (
    "Three pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
    "camera, a glowing judge line crosses them, under it lies a row of eight key caps, and under that row, between the two side "
    "rails, lies the gear's lower panel: a wide slab that runs from the key caps down to the bottom edge of the image, widening "
    "toward the camera. In image 1 the panel is a FLAT LAYOUT DRAWING: a sheet of ivory paper, and drawn flat on it: (a) near the "
    "panel's far left corner (just under the key caps, at the left) an orange starburst emblem with a ring of short yellow and "
    "orange strokes round it; (b) left of the middle a few black speed lines and small round puffs; (c) at the right a small "
    "orange blocky creature with two black eyes. The wide blank space between (b) and (c) is empty on purpose. The drawing shows "
    "exactly where each thing lies and how large it is.\n\n"
    "IMAGE 2 is the DESIGN REFERENCE for the emblem: a hand-cut starburst of uneven rays (a spark). Reproduce its shape "
    "faithfully: the same number of rays, the same uneven lengths and widths, the same blunt ends. IMAGE 3 is the DESIGN "
    "REFERENCE for the creature, a pixel-art mascot: one wide orange block of a body with two tall black eyes, a stubby arm "
    "sticking out at each side, and four short legs. Copy nothing else of images 2 and 3.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps and the two side rails stay at exactly the same places and sizes. Do not zoom "
    "in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint ONLY the panel: the area under "
    "the row of key caps, between the inner edges of the two side rails, down to the bottom edge of the image. Keep every other "
    "pixel exactly as it is: the lanes, the notes, the judge line and the flash on it, the row of key caps, the rails, the dark "
    "background.\n\n"
    "The panel becomes ONE SHEET OF THICK IVORY PAPER seen exactly from this camera, as a photorealistic 3D render at the finish "
    "of a commercial console game: a warm off-white (close to #FAF9F5), matte, heavy cotton paper like watercolour paper or "
    "letterpress card, with a fine even grain and a few soft fibres. It is lit by soft, even daylight; only round the emblem a "
    "faint warm glow lies on the paper. There are NO beams, NO shafts and NO stripes of light across the sheet, and no dark band "
    "or vignette along any edge: apart from that faint glow the whole sheet is evenly lit. No gloss, no creases, no folds, no "
    "torn edges, no stains, no ruled lines.\n\n"
    "Everything on the sheet keeps exactly the place and the size the layout drawing gives it; do not move, enlarge or shrink "
    "anything, and add nothing.\n\n"
    "1. THE EMBLEM, near the panel's far left corner: the emblem of image 2 as ONE SOLID THREE-DIMENSIONAL OBJECT lying flat on "
    "the paper, foreshortened by the camera exactly as in image 1: cut from a slab of fired terracotta clay about as thick as a "
    "finger, with softly rounded edges, matte, in the warm clay orange of the layout drawing (close to #D97757), with a short "
    "soft shadow under its edges. Do not stand it upright and do not turn it toward the viewer. It is the sun of this picture.\n\n"
    "2. THE SUN'S RAYS, PAINTED: round the emblem, the ring of short strokes of the layout drawing, PAINTED ON THE PAPER in "
    "gouache: about a dozen separate dabs of a dry, flat brush, golden yellow and warm orange by turns, each one single short "
    "stroke pointing away from the emblem, with ragged bristle ends and streaks of bare paper showing through the paint, like "
    "the rays in a child's painting of a smiling sun. Clear paper between the strokes, and between the strokes and the emblem. "
    "They are flat paint on the paper, not light and not objects, and they are SHORT: none is longer than the layout drawing "
    "shows, and none runs on across the sheet.\n\n"
    "3. THE SPEED MARKS, DRAWN BY HAND: left of the middle, where the layout drawing has them: a few speed lines one above the "
    "other, and by the lowest of them two or three small puffs of dust, drawn on the paper by hand with a black brush pen in a "
    "loose, warm, slightly wobbly line (the friendly hand-drawn illustration style of a thoughtful tech brand: confident uneven "
    "strokes of changing width, round ends, a little dry-brush texture); the largest puff is filled flat with clay orange. They "
    "are the trail of something that has just sped off to the right. Flat ink on the paper, nothing three-dimensional.\n\n"
    "4. THE MASCOT, at the right: the creature of image 3 as ONE SOLID THREE-DIMENSIONAL TOY FIGURE: chunky and blocky with softly "
    "rounded edges, matte clay orange (close to #D97757) like a moulded vinyl or clay toy, two tall glossy black eyes set into its "
    "face, a stubby arm at each side, four short legs. It lies flat on the paper on its back, like a thick moulded figurine laid "
    "on the sheet, its head toward the key caps and its feet toward the camera, foreshortened by the camera exactly as in image 1 "
    "(do not stand it upright on the table and do not turn it toward the viewer). It is RUNNING to the right, cute and eager: its "
    "body leans a little to the right as in the layout drawing, its four legs are mid-stride (two stretched, two tucked up), its "
    "arms swing; a soft shadow lies under it. Keep its design: one wide block of a body, no mouth, no nose, no antennae, no "
    "tail, no extra limbs.\n\n"
    "The wide space between the speed marks and the mascot stays EMPTY paper (a drawing of a cyclist is printed there later): "
    "nothing lies on it and nothing is drawn or written on it.\n\n"
    "The top edge of the panel under the key caps is a thin bevelled lip. Everything stays inside the rails; nothing rises over "
    "the rails or above the key caps, and the panel runs on down past the bottom edge of the image (no front edge is seen). No "
    "text, no letters, no numbers, no other logos, no watermark, no people, no hands, and nothing over the lanes. Colours: ivory; "
    "warm clay orange for the emblem and the mascot; golden yellow and orange paint for the rays; black ink for the speed marks."
)

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    refs = ["refs/claude-spark.jpg", "refs/claude-clawd.jpg"]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read())] + [("image/jpeg", open(S + r, 'rb').read()) for r in refs]
    png, usage = generate(PROMPT, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": PROMPT, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the corner stickers off, the panel a flat layout drawing)"] + refs,
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
