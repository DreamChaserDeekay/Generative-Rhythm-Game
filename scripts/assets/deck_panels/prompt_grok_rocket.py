"""Trial (the user's second and third directions on the GROK gear's panel; the third: the Bot against the left corner, the
   icon against the right corner, the gear's ground a little darker): the Grok Bot as a large flat print at the lower left, with
   the very feel of the picture the user sent; the Starship and the Doge a little larger, the SpaceX logo on the hull, more
   of a fast-moving look; the Grok icon in the colour of Mars at the upper right, about as large as the Bot
   (layout_grok.py: the two prints are drawn there, exactly; here only the rocket and its rider are made solid, over
   them). Image 1 is this game's own frame whose panel is the flat layout drawing (laid in by synth.py); image 2 is the
   rocket and its rider of draft 1-A (a crop of that render), image 3 the SpaceX logo.
   Image 2 is now the rocket and its rider of draft 2 (a crop of grok-c2/try-3.png), which the user saw and left as it is.
   python3 -I prompt_grok_rocket.py <folder> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

PROMPT = (
    "Three pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Note lanes run away from the "
    "camera, a glowing white judge line crosses them (with a white burst on it), under it lies a row of eight black key caps "
    "outlined in white, and under that row, between the two thin white side rails, lies the gear's lower panel: a wide slab that "
    "runs from the key caps down to the bottom edge of the image, widening toward the camera. In image 1 the panel is a FLAT "
    "LAYOUT DRAWING: a near-black slab with two large flat GRAPHICS printed on it, (a) in its lower left CORNER a big pearl-white "
    "ball with two black slanted eyes, cut off by the panel's left side and by the bottom edge of the image, so that only its "
    "upper right part shows, and (b) in its upper right CORNER a big emblem in the rust-orange colours of the planet Mars, a "
    "ring cut by a long diagonal blade; and, between the two, (c) a steel rocket seen from above, its nose pointing to the upper right, toward the emblem, with a "
    "tan dog sitting on it, a word on its hull, a short flame out of its tail and a few thin speed lines behind it. The drawing shows exactly "
    "where each thing lies and how large it is.\n\n"
    "IMAGE 2 is the DESIGN REFERENCE for the rocket and its rider, a crop of the previous render of this scene: a miniature of "
    "SpaceX's Starship in polished stainless steel with the word SPACEX on its hull, and riding it a Shiba Inu dog, the DOGE of "
    "the famous internet meme, looking back over its shoulder with its well-known sideways glance. Reproduce THIS dog and THIS "
    "rocket as exactly as you can: the same character, the same pose, the same face and expression, the same fur blown back, "
    "the same steel, flaps and black heat-shield tiles, the same lettering at the same place, the same size compared with one "
    "another. Take only the rocket and the dog from image 2 (not the orange shape or the rail behind them). Image 1 says where "
    "they are and how large.\n\n"
    "IMAGE 3 is the DESIGN REFERENCE for the lettering on the rocket: the SpaceX logo, the word SPACEX in wide, bold capitals "
    "whose X is drawn with one long, thin swoosh that sweeps up to the right. Reproduce it faithfully.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps and the two side rails stay at exactly the same places and sizes. Do not zoom "
    "in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint ONLY the panel: the area under "
    "the row of key caps, between the inner edges of the two side rails, down to the bottom edge of the image. Keep every other "
    "pixel exactly as it is: the lanes, the notes, the judge line and the burst on it, the row of key caps, the rails, the dark "
    "background.\n\n"
    "The panel becomes one slab of MATTE BLACK METAL seen exactly from this camera, as a photorealistic 3D render at the finish "
    "of a commercial console game: bead-blasted, anodised black aluminium that swallows the light. It is DARK: almost black, "
    "clearly darker than charcoal grey, with an extremely fine, even grain, no gloss, and only a very faint, broad sheen. It "
    "stays that dark everywhere, from its far edge to its near edge: no grey haze, no bright patch, no light band. Plain and "
    "calm: no pattern, no seams, no screws, no lines, no vents, no scratches.\n\n"
    "THE TWO PRINTED GRAPHICS, (a) the white ball and (b) the Mars-coloured emblem, are part of the slab's surface: completely "
    "flat prints, like silk-screen printing on the metal, with no relief, no thickness, no gloss of their own and no shadow of "
    "their own. KEEP THEM EXACTLY AS IMAGE 1 SHOWS THEM: the same shapes, the same places and sizes, the same colours and the "
    "same soft shading, the ball's two black eyes exactly as drawn (two thick slanted strokes with round ends), the ball cut "
    "off by the panel's edges exactly as drawn. Do not turn them into solid objects, do not redraw or restyle them, do not move "
    "or resize them, do not add a face, a mouth, a highlight or an outline.\n\n"
    "THE ROCKET AND ITS RIDER are the only solid, three-dimensional things, and they are OVER the prints (where they overlap a "
    "print, they hide it and throw their soft shadow on it):\n\n"
    "1. THE ROCKET: the Starship of image 2, flying low along the slab, a hair above it and parallel to it, exactly along the "
    "drawn rocket and exactly as LARGE as it is drawn (it is big: about a third of the panel's width), not larger: its tail to "
    "the RIGHT of the white ball, with a wide gap of bare black metal between the ball and the engine bells, its nose pointing "
    "to the upper right and ending just under the lower left of the Mars-coloured emblem, as if it were about to fly into "
    "that ring. The rocket does not cover the emblem and does not cover the ball. Polished stainless steel with fine weld seams, two small forward flaps and two "
    "larger aft flaps covered with small black heat-shield tiles, a cluster of engine bells at its tail.\n\n"
    "2. THE WORD ON ITS HULL: the SpaceX logo of image 3, the word SPACEX with its long swoosh, painted along the rocket's hull "
    "on the side that faces the camera, between the dog and the nose, in dark navy on the bright steel, as large as the hull "
    "allows and clearly legible. Spell it exactly: S, P, A, C, E, X.\n\n"
    "3. THE DOG: the Doge of image 2, riding the rocket astride, just behind the lettering, its front paws holding the hull, "
    "looking back over its shoulder toward the camera with the same sideways glance and calm, smug little smile; as big "
    "compared with the rocket as in image 2.\n\n"
    "4. SPEED: they are flying FAST, and the picture shows it. A fierce rocket flame streams back from the engine bells toward "
    "the lower left over the bare black metal, exactly along the drawn flame and NOT LONGER than it (about a third of the "
    "rocket's length; it ends before it reaches the white ball): "
    "white-hot and pale blue at the engines with a row of shock diamonds, turning violet and then orange, fraying into "
    "glowing wisps; a stream of sparks races back with it, each spark drawn out into a short streak. Thin, straight streaks "
    "of white light trail back from the tips of the flaps and from the dog's ears, all parallel to the flight path. The dog's "
    "ears, cheek fur and tail are blown straight back by the wind. The rocket and the dog themselves stay sharp; only the far "
    "end of the flame, the sparks and the streaks are blurred by the motion. IMPORTANT: the flame, the sparks and the streaks "
    "stay on the black metal, between the ball and the rocket; NOTHING crosses the white ball: the ball stays completely "
    "clear.\n\n"
    "5. LIGHT: the flame is the brightest thing in the picture and it glows: it lays a soft pool of blue-violet and orange light "
    "on the matte black metal under and round it and a faint warm tint on the rim of the white ball next to it, and warm rim light on the "
    "rocket's tail and on the dog's back. The rocket and the dog throw a soft shadow on the slab and on the prints under "
    "them.\n\n"
    "The top edge of the panel under the key caps is a thin bevelled lip. Everything stays inside the rails; nothing rises over "
    "the rails or above the key caps, and the panel runs on down past the bottom edge of the image (no front edge is seen). "
    "Nothing else is on the slab: no other logo, no silver lettering, no buttons, no knobs, no screens, no stars, no planets, "
    "no people, no hands.\n\n"
    "No other text, letters or numbers than the word SPACEX on the rocket, no watermark, and nothing over the lanes. Colours: "
    "black and charcoal; the ball's pearl white; the emblem's Mars rust-orange; steel; the dog's tan and cream; the flame's pale "
    "blue, violet and orange with its glow."
)

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    refs = [("refs/grok-doge-ship-2.png", "image/png"), ("refs/spacex-logo.png", "image/png")]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read())] + [(m, open(S + r, 'rb').read()) for r, m in refs]
    png, usage = generate(PROMPT, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": PROMPT, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the panel a flat layout drawing laid in by synth.py: the Bot print drawn from the user's picture, the Mars-coloured mark, a place-holder rocket)"] + [r for r, _ in refs],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
