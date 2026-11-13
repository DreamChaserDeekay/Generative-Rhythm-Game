"""Trial: the ASTRAL gear's lower panel (skin 11, shown as 별밤), drafts 1, 3 and 4 of the ideas put to the user ("1, 3, 4
   뽑아봐"), who wants this skin "as close to the reference as can be":
     astral-a1  the reference's night sky glowing in a pane of navy glass
     astral-a3  the same on the still water of a lake at night
     astral-a4  the same as a stained-glass window lit from behind
   Image 1 is this game's own frame whose panel is the flat layout drawing (layout_astral.py); image 2 is the lower part
   of the user's own reference picture for this skin, enlarged (sending it is permitted by the user). The reference's SCORE
   and COMBO lettering and numbers are left out.
   python3 -I prompt_astral.py <variant> <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

FRAME = (
    "Two pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: the lower part of a frame of our own rhythm game's play screen. Dark note lanes run away "
    "from the camera, a glowing pale-blue judge line crosses them (with a golden-white burst on it), under it lies a row of "
    "eight navy key caps with cut corners in a pale rim, each with a small gold four-pointed star (one of them is lit gold), "
    "and under that row, between the two navy side rails with a moon-blue line, lies the gear's lower panel: a wide slab that "
    "runs down to the bottom edge of the image, widening toward the camera. "
)
DRAWN = (
    "a night sky in deep navy with a blue light at its middle and in its two near corners; at the middle a large white "
    "four-pointed star with long points; behind it a pair of pale blue wings (at each side a fan of long feathers, and shorter, "
    "paler ones over their roots); round them a thin tilted oval orbit line with two small rings on it; above the star a row "
    "of five moon phases (crescent, half, full, half, crescent) and under it a second, dimmer row (its middle one a ring); "
    "at each side edge a cluster of three pale blue-white five-petalled flowers with four long, narrow, pale lavender leaves "
    "fanning toward the middle; in each near corner three larger, dim blue flowers; small four-pointed sparkles and tiny stars "
    "scattered over the sky"
)
REFERENCE = (
    "IMAGE 2 is the DESIGN REFERENCE: a small concept picture of this very panel (it is enlarged, so it is blurry), in the "
    "style the panel must have: a dreamy night sky in deep navy and luminous pale blue: the white star with its wings, the "
    "orbit, the moon phases, pale flowers with feathery leaves, soft blue glows. Match its design language, its colours and "
    "its gentle, magical mood. Its lettering and numbers (SCORE and COMBO, at the left and right of the star) are NOT wanted: "
    "leave them out, and write no text at all. Its row of navy key caps with gold stars is in image 1 already: do not paint "
    "key caps on the panel.\n\n"
    "Keep image 1's framing EXACTLY: the same camera, the same zoom, the same crop; your picture must overlay image 1 pixel for "
    "pixel, so the judge line, the row of key caps and the two side rails stay at exactly the same places and sizes. Do not "
    "zoom in, do not crop, do not widen, do not recompose, do not enlarge or shrink the panel. Repaint ONLY the panel: the area "
    "under the row of key caps, between the inner edges of the two side rails, down to the bottom edge of the image. Keep "
    "every other pixel exactly as it is: the lanes, the note, the judge line and the burst on it, the row of key caps, the "
    "rails, the dark background.\n\n"
)
PLACE = (
    "Every thing of the layout drawing stays exactly at its place and at its size (the same footprint, the same angle), "
    "foreshortened by the camera exactly as in image 1: do not move, enlarge or shrink anything, do not stand anything "
    "upright, and add nothing.\n\n"
)
TAIL = (
    "Clean, delicate and precise. Everything stays inside the rails; nothing rises over the rails or above the row of key "
    "caps, and the panel runs on down past the bottom edge of the image (no front edge is seen). Nothing else is on the "
    "panel: no screens, no number boxes, no buttons, no knobs, no people, no hands, no animals.\n\n"
    "No text, letters or numbers anywhere, no logos, no watermark, and nothing over the lanes. Colours: deep navy and royal "
    "blue; pale moon blue and lavender-white; pure white for the star and the moons. No gold and no other colour on the panel."
)
VARIANTS = {
    "astral-a1": (
        FRAME + "In image 1 the panel is a FLAT LAYOUT DRAWING: " + DRAWN + ". Behind everything is a faint large circle with "
        "tick marks (a star chart). The drawing shows exactly where each thing lies and how large it is.\n\n" + REFERENCE
        + "The panel becomes a pane of deep NAVY GLASS in which that night sky glows, as a photorealistic 3D render at the finish "
        "of a commercial console game, seen exactly from this camera. " + PLACE
        + "1. THE GLASS: one thick pane of deep navy-blue glass, smooth and glossy, with faint, soft reflections. It is lit softly "
        "from underneath: a blue glow at its middle and in the two near corners (as drawn), fading into the dark navy.\n\n"
        "2. THE STAR, at the middle: the four-pointed star is an inlay of milky white light in the glass, like opal glass lit "
        "from behind: the brightest thing on the panel, with crisp, long points (exactly the drawn shape) and a soft halo.\n\n"
        "3. THE WINGS, behind the star: fine inlays of pale blue, softly glowing glass: every feather one slender piece with a "
        "lighter rim and a fine line along its middle; the shorter feathers over the roots are paler, almost white. Exactly "
        "the drawn fans.\n\n"
        "4. THE ORBIT, THE MOONS, THE CHART: the orbit is a fine line of pale blue light in the glass with its two small rings; "
        "the moon phases are small inlays of white light (the row above the star bright, the row under it dimmer, its middle "
        "one a ring); the large circle with its tick marks is a faint engraved line that glows only dimly.\n\n"
        "5. THE FLOWERS: at each side edge the three pale flowers are small blossoms of frosted, milky blue-white glass lying "
        "on the pane, raised a little and softly translucent, each with a pale blue heart; their four long leaves are slender "
        "leaves of frosted lavender-white glass. In the two near corners the larger dim blue flowers glow from under the "
        "glass, deep and soft, like flowers seen under water.\n\n"
        "6. THE SPARKLES AND TINY STARS: pin-points and small four-pointed glints of white light in the glass, as drawn.\n\n"
        + TAIL
    ),
    "astral-a3": (
        FRAME + "In image 1 the panel is a FLAT LAYOUT DRAWING: " + DRAWN + ". Behind everything is a faint large circle with "
        "tick marks. The drawing shows exactly where each thing lies and how large it is.\n\n" + REFERENCE
        + "The panel becomes the STILL WATER OF A LAKE AT NIGHT with that night sky lying on it, as a photorealistic 3D render at "
        "the finish of a commercial console game, seen exactly from this camera. " + PLACE
        + "1. THE WATER: dark, deep navy water, calm as glass, with only very gentle, long ripples. Deep blue light glows up from "
        "under the water at its middle and in the two near corners (as drawn).\n\n"
        "2. THE STAR, at the middle: the four-pointed star lies on the surface as a shape of pure white light (not a solid "
        "thing): the brightest thing on the panel, with crisp, long points (exactly the drawn shape). Its light spreads softly "
        "over the water round it, and a few fine rings of ripples go out from it (the faint large circle of the drawing is "
        "the widest of them).\n\n"
        "3. THE WINGS, behind the star: real feathers floating on the water, pale blue and blue-white: every long feather with "
        "a fine shaft and soft barbs, slightly translucent, lying flat on the surface with a soft reflection under it; the "
        "shorter feathers over the roots are paler, almost white. Arranged exactly as the drawn fans.\n\n"
        "4. THE ORBIT: a thin line of pale light lying on the water along the drawn tilted oval, like a ring of moonlight; its "
        "two small rings are two small rings of light floating on the surface.\n\n"
        "5. THE MOONS: the moon phases are small moons mirrored in the water: the row above the star bright, the row under it "
        "dimmer (its middle one a ring), each softened a little by the ripples.\n\n"
        "6. THE FLOWERS: at each side edge the three pale blue-white flowers are real blossoms floating on the water (five "
        "round petals, a pale blue heart), and their four long, narrow, lavender-white leaves float beside them (as drawn), "
        "each with a soft reflection; one or two single petals drift close by. In the two near corners the larger dim blue "
        "flowers lie UNDER the water: they glow softly blue and are blurred by the depth.\n\n"
        "7. THE SPARKLES AND TINY STARS: stars mirrored in the water: small bright four-pointed glints and pin-points of light, "
        "as drawn.\n\n"
        + TAIL
    ),
    "astral-a4": (
        FRAME + "In image 1 the panel is a FLAT LAYOUT DRAWING OF A STAINED-GLASS WINDOW: " + DRAWN + "; and black lines divide "
        "it as a window's lead lines do: a round medallion round the star, rays going out from the medallion to the edges, a "
        "large ring, a rim along the panel's edges, the orbit drawn as a black line, and a black outline round the star, every "
        "feather, the full moon, every flower and every leaf. The drawing shows exactly where each piece lies and how large "
        "it is.\n\n" + REFERENCE
        + "The panel becomes that STAINED-GLASS WINDOW, lying flat and lit from behind, as a photorealistic 3D render at the "
        "finish of a commercial console game, seen exactly from this camera. " + PLACE
        + "1. THE LEAD: every black line of the drawing is a strip of dark lead came that holds the pieces of glass: slightly "
        "raised, matte, grey-black with a soft sheen, with small solder joints where lines meet. Exactly the drawn lines: the "
        "medallion, the rays, the large ring, the rim, the orbit, and the outlines of the star, the feathers, the flowers and "
        "the leaves.\n\n"
        "2. THE GLASS: every field between the lead lines is one piece of hand-made coloured glass lit from behind, with the "
        "slight streaks, tiny bubbles and waviness of real stained glass. The sky pieces are deep navy and royal blue, lighter "
        "and more luminous near the middle and bluest in the two near corners (as drawn).\n\n"
        "3. THE STAR, at the middle: one piece of milky white opalescent glass, the brightest piece of the window, exactly the "
        "drawn shape with its long points. THE WINGS: every feather one piece of pale blue opalescent glass, the shorter ones "
        "over the roots blue-white.\n\n"
        "4. THE MOONS AND THE ORBIT'S RINGS: small roundels and pieces of white glass (the row under the star dimmer; its "
        "middle one a clear ring).\n\n"
        "5. THE FLOWERS: at each side edge the three flowers are made of pieces of milky blue-white glass (five petals each, a "
        "pale blue heart), their long leaves of pale lavender glass; in the two near corners the larger flowers are of "
        "saturated cobalt-blue glass.\n\n"
        "6. THE SPARKLES AND TINY STARS: small stars painted and fired onto the navy glass in silvery white, as drawn.\n\n"
        + TAIL
    ),
}

if __name__ == "__main__":
    key, name = sys.argv[1], sys.argv[2]
    prompt = VARIANTS[key]
    pictures = [("image/png", open(S + f'{key}/tmpl-crop.png', 'rb').read()), ("image/png", open(S + 'refs/astral-console.png', 'rb').read())]
    png, usage = generate(prompt, pictures, "16:9")
    open(S + f'{key}/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "16:9", "size": "2K", "variant": key, "prompt": prompt, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage,
               "pictures": [f"{key}/tmpl-crop.png (this game's own frame, the judge line at 43 % of the screen so that the whole panel shows, the panel a flat layout drawing)",
                            "refs/astral-console.png (the lower part of the user's reference picture for this skin, enlarged; not kept in the repository)"],
               "crop": [160, 180, 1760, 1080]}, open(S + f'{key}/try-{name}.json', 'w'), indent=1)
    print("made", key, name, len(png), usage.get("totalTokenCount"))
