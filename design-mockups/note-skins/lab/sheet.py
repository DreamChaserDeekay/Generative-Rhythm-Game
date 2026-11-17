# Lays the lab's per-style shots into one labelled sheet:  python3 sheet.py <dir> <out.png> [scale]
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
STYLES = ['flat', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral']
src, dst = Path(sys.argv[1]), sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
ims = [(s, Image.open(src / f'sheet-{s}-SDVX.png')) for s in STYLES if (src / f'sheet-{s}-SDVX.png').exists()]
w, h = (int(ims[0][1].width * scale), int(ims[0][1].height * scale))
cols = 6
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 22)), (12, 12, 16))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
except OSError:
    font = ImageFont.load_default()
for i, (name, im) in enumerate(ims):
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y + 22))
    d.text((x + 6, y + 3), f'{name}   tap | long | held | missed', fill=(230, 230, 230), font=font)
sheet.save(dst)
