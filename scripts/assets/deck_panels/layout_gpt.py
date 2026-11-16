"""Trial: the flat layout drawing for the GPT gear's lower panel, the user's change to draft 8-1: the words and the figure
   taken away; the reset button with its ring gauge at 70 % of its size, at the panel's near right corner; the emblem as it
   was (400 px, the very middle).   Run with python3 -I: python3 -I layout_gpt.py [<folder> [<x> <y>]]"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
from gpt_parts import W, H, slab, put, emblem, ringbutton
A, P = S + 'inputs/ai/', S
name = sys.argv[1] if len(sys.argv) > 1 else 'gpt-f1'
D = round(220 * 0.7)                       # the dome: 220 px in draft 8-1
b = ringbutton(D, 0.64, 'RESET')
# the near right corner: clear of the corner sticker (it hides what lies right of about x 1930 at the near edge)
at = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else (1750, 690)
f = slab(); parts = {'emblem': put(f, emblem(A, 400), (W // 2, H // 2)), 'button': put(f, b, at, 0.45), 'dome': D, 'across': b.width}
os.makedirs(P + name, exist_ok=True)
f.convert('RGB').save(P + name + '/layout.png'); json.dump(parts, open(P + name + '/parts.json', 'w'), indent=1); print(name, parts)
