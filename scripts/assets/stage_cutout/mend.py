"""Asks the image model to mend one place of a cut-out it is given (the figure on flat green): the part of a character that another
figure, now removed, hid.   python3 -I mend.py <work dir> <piece> <the cut-out's try> <try of the mending>

Writes <piece>-try-m<n>.png: register.py and compose.py read it by that name (register.py <work dir> <piece> m<n> cut-<try>)."""
import hashlib, json, os, sys, time
S = sys.argv[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cutout

PROMPT = {
    '2-right': (
        "The picture is a cut-out of two painted characters on flat pure green (#00FF00): a silver-haired woman in a dark red dress "
        "standing in the upper middle (two metal pods float by her), and a woman in a wide pale hat crouching at the lower right.\n\n"
        "The standing woman is not whole. Another figure stood in front of her and was removed, and where it stood a NOTCH is cut out "
        "of her at her lower left: under her waist her body ends in a straight horizontal cut, and beside it a straight diagonal cut "
        "runs down along her thigh. Green fills the notch.\n\n"
        "MEND ONLY THAT. Paint the part of her the notch removed, in exactly the painting's style, colours and light: her dark red "
        "dress continues from her waist down over her hip, and her thigh continues down to her legs below, so that her body runs "
        "unbroken from her waist to her legs with a natural outline at her left side, and no straight cut is left. Her pale sleeve, "
        "which ends at the cut, continues a little and ends naturally. Keep it plain: no new ornaments, no new objects, no hand.\n\n"
        "EVERYTHING ELSE STAYS EXACTLY AS IT IS, pixel for pixel: the two women, their faces, their hair, the two pods, the hat, the "
        "blade, every colour, and the flat green round them. Do not move, scale, redraw, relight or sharpen anything. The same framing "
        "and the same proportions as the picture given. No text, no watermark."
    ),
}

name, base, n = sys.argv[2], sys.argv[3], sys.argv[4]
picture = open(f'{S}/work/{name}-cut-{base}.png', 'rb').read()
prompt = PROMPT[name]
out, usage = cutout.generate(prompt, [("image/png", picture)], "4:5")
stem = f'{S}/work/{name}-try-m{n}'
open(stem + '.png', 'wb').write(out)
json.dump({'model': cutout.MODEL, 'prompt': prompt, 'made': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'bytes': len(out), 'sha256': hashlib.sha256(out).hexdigest(),
           'usage': usage, 'pictures': [{'file': f'{name}-cut-{base}.png', 'sha256': hashlib.sha256(picture).hexdigest()}]}, open(stem + '.json', 'w'), indent=1)
print('made', stem, len(out))
