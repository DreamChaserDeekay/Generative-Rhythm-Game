"""Trial (the user's fourth direction): the word Claude written by hand, as a flat piece of lettering to print on the Claude
   gear's paper behind the painted rays and the pelican (letter_on_paper.py). No official handwritten wordmark was found, so this
   is new lettering, black on white (its colour and strength are given when it is printed).
   python3 -I prompt_claude_lettering.py <try name>"""
import hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import generate, MODEL, S

PROMPT = (
    "The single word Claude, written by hand, once, with a broad round brush pen in solid black ink on a plain, pure white "
    "ground.\n\n"
    "Exactly six letters, spelled C-l-a-u-d-e: a capital C followed by lowercase l, a, u, d, e. Nothing else is written.\n\n"
    "Warm, friendly, confident handwriting, not calligraphy and not a typeface: upright, rounded letters, not joined or only "
    "loosely joined, slightly uneven in size and on a slightly uneven baseline; thick strokes of gently changing width with "
    "round ends and a little dry-brush texture where a stroke ends, like the hand-drawn illustrations of a thoughtful, friendly "
    "tech brand. Each letter is clear and easy to read.\n\n"
    "The word is large: it fills the width of the picture with a small even margin, and sits in the middle. Flat artwork: a pure "
    "white background with no paper texture, no shadow, no gradient, no underline, no flourish, no dots or splashes, no frame, "
    "no signature, no other marks."
)

if __name__ == "__main__":
    name = sys.argv[1]
    png, usage = generate(PROMPT, [], "21:9")
    open(S + f'inputs/claude/letter/try-{name}.png', 'wb').write(png)
    json.dump({"model": MODEL, "aspect": "21:9", "size": "2K", "prompt": PROMPT, "made": time.strftime("%Y-%m-%d %H:%M:%S %z"),
               "bytes": len(png), "sha256": hashlib.sha256(png).hexdigest(), "usage": usage, "pictures": []},
              open(S + f'inputs/claude/letter/try-{name}.json', 'w'), indent=1)
    print("made lettering", name, len(png), usage.get("totalTokenCount"))
