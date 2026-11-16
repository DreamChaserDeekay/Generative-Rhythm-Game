"""sheet_cameras.py <gear> <try> <title>: the four cameras of one try on one sheet (2 x 2 of 1280 x 720), each under its caption."""
import os, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
gear, i, title = sys.argv[1:4]
font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 38)
cams = [('SDVX', 'SDVX (기본)'), ('LOW', '강한 원근'), ('FLAT', '약한 원근'), ('PLANE', '평면')]
BAND, GAP = 58, 4
sheet = Image.new('RGB', (2 * 1280 + GAP, 2 * (720 + BAND) + GAP), (40, 40, 44))
d = ImageDraw.Draw(sheet)
for k, (cam, label) in enumerate(cams):
    t = Image.open(S + f'{gear}/shot-{i}-{cam}-0.png').convert('RGB')
    x, y = (k % 2) * (1280 + GAP), (k // 2) * (720 + BAND + GAP)
    d.rectangle([x, y, x + 1279, y + BAND - 1], fill=(0, 0, 0))
    d.text((x + 18, y + 8), f'{title} · {label}', font=font, fill=(255, 221, 87))
    sheet.paste(t, (x, y + BAND))
out = S + f'{gear}/{gear}-{i}-cameras.jpg'
sheet.save(out, quality=88); print(out, sheet.size)
