"""Trial (the user's direction): FIRESTARTER, the four members' silhouettes of the official concert picture at the middle of
   the lower panel, and the title FIRESTARTER a little larger at the middle in front of them. The flat layout drawings:
     c1  the concert scene over the whole panel (the picture's part over the audience), the title in front
     c2  as c1, the figures a quarter taller (the low cameras press the panel's picture: they stand less squat there)
     c3  the satin of the chosen draft, the scene a patch of light at its middle with the figures, the title in front
   Run with python3 -I: python3 -I layout_fire.py"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
D2, P = S + 'inputs/kda/dl2/', S
W, H = 2048, 876
TITLE_W = 950       # it was 760

Image.MAX_IMAGE_PIXELS = None
promo = Image.open(D2 + 'KDA_FIRESTARTER_Promo_01.jpg').convert('RGB')
cover = Image.open(D2 + 'KDA_FIRESTARTER_Cover_1.jpg')


def cut(im, box, lo, hi):
    c = im.convert('RGB').crop(box)
    a = np.asarray(c, dtype=np.float32)
    lum = a @ np.array([0.299, 0.587, 0.114])
    return Image.fromarray(np.dstack([a, np.clip((lum - lo) / (hi - lo), 0, 1) * 255]).astype(np.uint8), 'RGBA')


def title_on(base, bottom):
    t = cut(cover, (70, 490, 1020, 685), 70, 150)
    t = t.resize((TITLE_W, round(TITLE_W * t.height / t.width)), Image.LANCZOS)
    # a soft dark ground under it, so that the drawing shows it plainly in front
    pad = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(pad)
    x0, y0 = round(W / 2 - t.width / 2), bottom - t.height
    d.rounded_rectangle([x0 - 50, y0 - 24, x0 + t.width + 50, bottom + 24], radius=60, fill=(20, 0, 8, 150))
    base.alpha_composite(pad.filter(ImageFilter.GaussianBlur(26)))
    base.alpha_composite(t, (x0, y0))
    return (y0, bottom)


def scene(box):
    """The concert picture's part `box` (over the audience) as the panel's picture."""
    return promo.crop(box).resize((W, H), Image.LANCZOS).convert('RGBA')


# the members stand at about x 1776..4320, y 1440..3650 of the picture (7680 x 5296), their middle at x 3050
# c1: 6160 x 2632 of it (the panel's proportions), the members at its middle
c1 = scene((3050 - 3080 if 3050 - 3080 > 0 else 0, 980, 6160, 980 + 2632))
print('c1 title rows', title_on(c1, 836))
c1.convert('RGB').save(P + 'fire-c1/layout.png')
# c2: a quarter taller: fewer of the picture's rows over the same panel
c2 = scene((0, 1210, 6160, 1210 + round(2632 / 1.25)))
print('c2 title rows', title_on(c2, 836))
c2.convert('RGB').save(P + 'fire-c2/layout.png')
# c3: the satin, and at its middle a patch of the scene (its edge feathered away)
c3 = Image.open(P + 'fire/flat-a1.png').convert('RGBA').resize((W, H), Image.LANCZOS)
k = 0.29
patch = promo.crop((3050 - 2600, 1150, 3050 + 2600, 3700))
patch = patch.resize((round(patch.width * k), round(patch.height * k)), Image.LANCZOS).convert('RGBA')
mask = Image.new('L', patch.size, 0)
ImageDraw.Draw(mask).ellipse([90, 40, patch.width - 90, patch.height - 30], fill=255)
patch.putalpha(mask.filter(ImageFilter.GaussianBlur(70)))
c3.alpha_composite(patch, (round(W / 2 - patch.width / 2), 60))
print('c3 patch', patch.size, 'title rows', title_on(c3, 836))
c3.convert('RGB').save(P + 'fire-c3/layout.png')

sheet = Image.new('RGB', (W, 3 * H + 20), (20, 20, 20))
for i, n in enumerate(('c1', 'c2', 'c3')): sheet.paste(Image.open(P + f'fire-{n}/layout.png'), (0, i * (H + 10)))
sheet.resize((1024, sheet.height // 2), Image.LANCZOS).save(P + 'fire-c-layouts.jpg', quality=88)
