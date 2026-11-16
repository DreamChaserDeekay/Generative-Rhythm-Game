"""The two working canvases: each side's crop of the illustration at twice the picture's size, flat green above its top edge.
   python3 -I canvas.py <work dir>   (reads <work dir>/src/Ahri_KDAFIRESTARTERSkin_HD.jpg, writes <work dir>/work/<piece>-canvas.png)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from geom import layout, art_on_canvas
S = sys.argv[1]
hd = Image.open(S + '/src/Ahri_KDAFIRESTARTERSkin_HD.jpg').convert('RGB')
for name in ('1-left', '2-right'):
    L = layout(name)
    print(name, L)
    c = art_on_canvas(name, hd)
    c.save(f'{S}/work/{name}-canvas.png')
    c.resize((c.width // 2, c.height // 2), Image.LANCZOS).save(f'{S}/work/{name}-canvas-view.jpg', quality=88)
