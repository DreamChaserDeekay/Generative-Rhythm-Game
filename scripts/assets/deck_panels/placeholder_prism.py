"""The crystal gear's place-holder slab: the picture the game showed as the panel in the frame the image model repainted
   (prompt_prism.py). It is a part of the earlier flat trial (generate.py prism2d-1). This was typed on the command line when
   the panel was made, not kept as a file: the lines under the imports are those lines as they were run, with their two
   folders named as the other scripts name them. It also puts the slab in as the game's panel, as it did then.
   python3 placeholder_prism.py"""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S, R
a = Image.open(S + 'inputs/p2/prism2d-1.png').convert('RGB')
w, h = a.size
# the windowless, bright part of the flat crystal picture (rows 31 % to 80 %), as the placeholder slab
b = a.crop((0, round(h * 0.31), w, round(h * 0.80))).resize((2048, 869), Image.LANCZOS)
b.save(S + 'inputs/p3/placeholder.png')
b.save(R + 'client/public/media/panels/prism.webp', 'WEBP', quality=92, method=6)
print('placeholder', b.size, 'from', a.size)
