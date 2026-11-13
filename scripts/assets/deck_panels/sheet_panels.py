"""sheet_panels.py <out> <folder>:<try>:<caption> ...: the flat panel pictures of several drafts under one another, each under its caption."""
import os, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 40)
out, items = sys.argv[1], [a.split(':', 2) for a in sys.argv[2:]]
W, H, B = 2048, 876, 64
sheet = Image.new('RGB', (W, (H + B) * len(items)), (0, 0, 0)); d = ImageDraw.Draw(sheet)
for i, (g, n, t) in enumerate(items):
    y = i * (H + B); d.text((20, y + 10), t, font=F, fill=(255, 221, 87)); sheet.paste(Image.open(S + g + '/flat-' + n + '.png').convert('RGB'), (0, y + B))
sheet.save(S + out, quality=90); print(S + out, sheet.size)
