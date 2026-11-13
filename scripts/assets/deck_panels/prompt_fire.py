"""Trial (the user's direction): the FIRESTARTER gear's lower panel with the four members' silhouettes of the official concert
   picture at its middle and the title FIRESTARTER, a little larger, at the middle in front of them. Image 1 is this game's own
   frame whose panel is a flat layout drawing (the official picture's part and the title pasted where they lie); the pictures
   after it are official pictures of the release, as design references (the user allowed them for this skin).
   python3 -I prompt_fire.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S
from prompt_fire_draft5 import HEAD, KEEP, RENDER, CLOTH

REFS = (
    "IMAGE 2 is the DESIGN REFERENCE for the four performers: the official concert picture, in which they stand on a stage against "
    "an explosion of pink-white light. From left to right: a woman in a huge wide-brimmed hat with long hair, one hand raised with "
    "spread fingers beside the hat; a woman in a round cap and dark glasses, in loose trousers, with a skateboard held upright at "
    "her side; a woman with two pointed fox ears and short hair, a hand on her hip; a woman with long pale hair who raises one arm "
    "straight up. Reproduce these four figures faithfully (their outlines, their poses, their order, their proportions). Copy "
    "NOTHING else of image 2: NO audience, NO raised hands, NO light sticks, NO phone, NO city, NO scaffolding.\n"
    "IMAGE 3 is the DESIGN REFERENCE for the word FIRESTARTER: the single's cover, with the word in tall, narrow, high-contrast "
    "serif capitals whose letters touch and run into one another. Reproduce that lettering faithfully; copy nothing else of image "
    "3.\n\n"
)
FIGURES = (
    "the four performers of image 2 as SILHOUETTES: near-black figures with only a thin hot-pink line of light along their edges "
    "and the faintest hint of detail inside, standing side by side exactly where the layout drawing has them and exactly as large "
    "(the same places, the same heights, the same poses)"
)
TITLE = (
    "In front of the figures, at the middle, lying as a real object, the word FIRESTARTER in the letterforms of image 3, cut from "
    "thick polished chrome with a warm rose sheen, exactly where the layout drawing has it and exactly as large (it crosses the "
    "figures' legs: it is in front of them), with crisp bevelled edges, a soft shadow under it and a faint pink glow round it. "
)
END = (
    "The top edge of the panel under the key caps is a bevelled lip of mirror chrome. Everything stays inside the rails; nothing "
    "rises over the rails or above the key caps, and the panel runs on down past the bottom edge of the image (no front edge is "
    "seen). NO windows, NO display frames, NO dark plates, NO sockets, NO speakers, NO grilles, NO rivets.\n\n"
    "The only lettering anywhere is FIRESTARTER, spelled exactly so (F, I, R, E, S, T, A, R, T, E, R). No other text, no logos, no "
    "numbers, no watermark, and nothing over the lanes. "
)
STAGE = (
    "The panel becomes a stage floor of thick, perfectly clear glass over a glowing picture " + RENDER + ": the floor is lit from "
    "within and shows, exactly as the layout drawing has it, a great explosion of pink-white light at its middle (white-hot at its "
    "heart, hot pink round it) with thin straight beams fanning outward and a few dark petals drifting, deepening to crimson and "
    "then to black toward the two rails and the bottom edge. Against that light stand " + FIGURES + ". "
)

VARIANTS = {
    "fire-c1": {
        "references": ["refs/concert.jpg", "refs/cover.jpg"],
        "prompt": (
            HEAD.format(n="Three", drawing="a concert picture: an explosion of pink-white light, in front of it four performers standing side by side, and in front of them, large, the word FIRESTARTER.")
            + REFS + KEEP + STAGE + TITLE +
            "The glass's top surface carries a faint, soft reflection.\n\n"
            + END + "Colours: black, crimson, hot pink and pink-white for the light; mirror chrome with a rose sheen for the word."
        ),
    },
    "fire-c2": {
        "references": ["refs/concert.jpg", "refs/cover.jpg"],
        "prompt": (
            HEAD.format(n="Three", drawing="a concert picture: an explosion of pink-white light, in front of it four performers standing side by side, drawn tall and slender, and in front of them, large, the word FIRESTARTER.")
            + REFS + KEEP + STAGE +
            "The figures are tall and slender, exactly as tall as the layout drawing has them (taller than in image 2). "
            + TITLE +
            "The glass's top surface carries a faint, soft reflection.\n\n"
            + END + "Colours: black, crimson, hot pink and pink-white for the light; mirror chrome with a rose sheen for the word."
        ),
    },
    "fire-c3": {
        "references": ["refs/concert.jpg", "refs/cover.jpg"],
        "prompt": (
            HEAD.format(n="Three", drawing="crimson satin, and at its middle a patch of pink-white light with four performers standing side by side in it, and in front of them, large, the word FIRESTARTER.")
            + REFS + KEEP + CLOTH +
            "At the middle of the panel, lying on the cloth, is " + FIGURES.replace("the four performers of image 2 as SILHOUETTES: near-black figures", "ONE flat cut-out of black mirror glass a few millimetres thick: the four performers of image 2 as SILHOUETTES, near-black figures")
            + ". From under and behind the cut-out a strong pink-white light bursts out across the satin, as the explosion of light in "
            "image 2 does: white-hot right round the figures, hot pink further out, with thin straight rays running over the folds, "
            "fading into the red cloth well before the rails. The cut-out throws no shadow on that light: the figures read as dark "
            "shapes against it. " + TITLE +
            "A few small gold-orange embers lie glowing on the cloth.\n\n"
            + END + "Colours: crimson, ruby, burgundy and black; hot pink and pink-white for the light; mirror chrome with a rose "
            "sheen for the word; a few gold-orange embers."
        ),
    },
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    v = VARIANTS[key]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read())] + [("image/jpeg", open(S + r, 'rb').read()) for r in v["references"]]
    png, usage = generate(v["prompt"], pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": v["prompt"], "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the panel a flat layout drawing)"] + v["references"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
