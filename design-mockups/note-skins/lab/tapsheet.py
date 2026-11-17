# The taps of every style at play size, labelled:  python3 tapsheet.py <dir> <out.png>
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
STYLES = ['flat', 'prism', 'sky', 'fire', 'aqua', 'steel', 'noir', 'wire', 'astral', 'gpt', 'gemini', 'grok', 'claude']
src, dst = Path(sys.argv[1]), sys.argv[2]
ims = [(s, Image.open(src / f'taps-{s}.png')) for s in STYLES if (src / f'taps-{s}.png').exists()]
w, h = ims[0][1].size
w, h = w // 2, h // 2
cols = 4
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 24)), (12, 12, 16))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
for i, (name, im) in enumerate(ims):
    x, y = (i % cols) * w, (i // cols) * (h + 24)
    sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y + 24))
    d.text((x + 8, y + 3), name, fill=(235, 235, 235), font=font)
sheet.save(dst)
