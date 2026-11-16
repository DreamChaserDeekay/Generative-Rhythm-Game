"""Trial: where the X logo goes on the GROK gear's panel (the user's fifth direction: "behind the Doge and the Starship,
   the Twitter (X) logo, in 3D, large"). Makes, from the finished flat picture of draft 4 (<source folder>/flat-1.png):
     <out>/layout.png   the finished picture as it is (laid into the game's frame by synth.py: image 1 for the model)
     <out>-g/layout.png the same with the logo drawn flat on the bare metal only, so that it lies under the rocket, the dog,
                        the flame and the streaks (the guide: image 2)
     <out>/x.png        the logo's place alone (RGBA, the panel's size)
   The logo is the official mark's own shape (inputs/grok/dl/commons-X_logo_2023.svg), at the middle of the panel's depth, its
   middle under the dog. An emblem: not drawn deeper than it is.
   Run with python3 -I: python3 -I layout_grok_x.py <source folder> <out folder> [<middle x> [<height>]]"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
src, out = sys.argv[1], sys.argv[2]
CX, TALL_PX = (int(sys.argv[3]) if len(sys.argv) > 3 else 1075), (int(sys.argv[4]) if len(sys.argv) > 4 else 660)
W, H = 2048, 876
flat = Image.open(S + f'{src}/flat-1.png').convert('RGB'); a = np.asarray(flat).astype(np.float32)
mark = Image.open(S + 'inputs/grok/png/commons-X_logo_2023.png').convert('RGBA'); mark = mark.crop(mark.getbbox())
mark = mark.resize((round(TALL_PX * mark.width / mark.height), TALL_PX), Image.LANCZOS)
x, y = round(CX - mark.width / 2), round(H / 2 - mark.height / 2)
layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); tint = Image.new('RGBA', mark.size, (150, 154, 162, 0)); tint.putalpha(mark.getchannel('A')); layer.alpha_composite(tint, (x, y))
m = np.asarray(layer)[..., 3].astype(np.float32) / 255
# the bare metal: dark, even, uncoloured (what is not a thing, a print, a flame or its streaks)
lum = a.mean(2); soft = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(30)), dtype=np.float32)
bare = (np.abs(lum - soft) < 9) & (lum < 110) & ((a.max(2) - a.min(2)) < 20)
bare = np.asarray(Image.fromarray((bare * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(2)), dtype=np.float32) / 255
w = (m * bare)[..., None]
guide = a * (1 - w) + np.array([150, 154, 162], np.float32) * w
for name, pic in ((out, a), (out + '-g', guide)):
    os.makedirs(S + name, exist_ok=True)
    Image.fromarray(np.clip(pic, 0, 255).astype(np.uint8), 'RGB').save(S + f'{name}/layout.png')
layer.save(S + f'{out}/x.png')
json.dump({'x': {'box': [x, y, x + mark.width, y + mark.height], 'middle': [CX, H // 2]}, 'from': f'{src}/flat-1.png'}, open(S + f'{out}/parts.json', 'w'), indent=1)
Image.fromarray(np.clip(guide, 0, 255).astype(np.uint8), 'RGB').resize((1366, 584), Image.LANCZOS).save(S + f'{out}-g/layout-view.jpg', quality=90)
print(out, 'the logo:', [x, y, x + mark.width, y + mark.height], '| bare metal under it: %.0f %%' % (bare[m > 0.5].mean() * 100))
