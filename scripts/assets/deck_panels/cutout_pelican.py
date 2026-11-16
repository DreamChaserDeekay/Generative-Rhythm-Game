"""cutout_pelican.py <pelican svg> <out svg>: the drawing without its scenery (the sky, its own sun, the clouds, the sea, the boat, the
   beach, the path, the motion lines): the bird, the bicycle and the shadow under them stay, cut to their box.
   Reads a downloaded file: run with python3 -I."""
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
head = re.search(r'<svg\b[^>]*>', src).group(0)
defs = re.search(r'<defs>.*?</defs>', src, re.S).group(0)
# the sections, each opened by its comment
parts = re.split(r'(?=^\s*<!-- )', src[src.index('</defs>') + len('</defs>'):], flags=re.M)
drop = ('Sky, sun, clouds', 'Sea', 'Sailboat', 'Beach and path', 'Motion lines')
kept, gone = [], []
for p in parts:
    m = re.match(r'\s*<!-- (.*?) -->', p)
    name = m.group(1) if m else ''
    (gone if name in drop else kept).append((name, p))
print('dropped:', [n for n, _ in gone]); print('kept:', [n for n, _ in kept])
assert len(gone) == len(drop)
body = ''.join(p for _, p in kept)
box = (148, 54, 524, 486)   # the bird, the bicycle and the shadow: x, y, width, height of the 800 x 600 drawing
out = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box[0]} {box[1]} {box[2]} {box[3]}" width="{box[2]}" height="{box[3]}">\n  ' + defs + body
if '</svg>' not in body: out += '\n</svg>'
open(sys.argv[2], 'w', encoding='utf-8').write(out); print('written', sys.argv[2], len(out))
