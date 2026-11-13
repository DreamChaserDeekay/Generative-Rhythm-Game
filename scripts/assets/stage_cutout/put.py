"""Writes the composed pictures into the game: <piece>-final.png -> client/public/stage/fire/<piece>.webp.
   python3 -I put.py <work dir> <repository> [piece ...]"""
import os, sys
from PIL import Image
S, R = sys.argv[1], sys.argv[2]
for name in sys.argv[3:] or ['1-left', '2-right']:
    im = Image.open(f'{S}/work/{name}-final.png').convert('RGBA')
    out = f'{R}/client/public/stage/fire/{name}.webp'
    im.save(out, 'WEBP', quality=92, method=6, alpha_quality=100, exact=False)
    print(name, im.size, os.path.getsize(out) // 1024, 'KB')
