"""The calibration picture for the crystal panel: a grid of magenta dots over the whole 2048 x 869 picture.
   python3 prism_dots.py <out.webp>"""
import sys
from PIL import Image, ImageDraw
W, H = 2048, 869
US = [0.08 + 0.07 * i for i in range(13)]
VS = [0.03 + 0.06 * i for i in range(16)] + [0.975]
im = Image.new('RGB', (W, H), (58, 58, 62)); d = ImageDraw.Draw(im)
for v in VS:
    for u in US:
        x, y = u * W, v * H
        d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=(255, 0, 255))
im.save(sys.argv[1], 'WEBP', lossless=True)
print('calibration picture', im.size, len(US), 'x', len(VS))
