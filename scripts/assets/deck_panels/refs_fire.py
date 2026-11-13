"""Trial: the reference pictures for the FIRESTARTER drafts, sized for sending (run with python3 -I): refs_fire.py"""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import S
D1, D2, O = S + 'inputs/kda/dl/', S + 'inputs/kda/dl2/', S + 'refs/'
def save(im, name, width=None):
    im = im.convert('RGB')
    if width and im.width != width: im = im.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
    im.save(O + name, 'JPEG', quality=92); print(name, im.size)
logo = Image.open(D2 + 'KDA_Logo_2.png').convert('RGBA')
ground = Image.new('RGBA', (logo.width + 80, logo.height + 80), (52, 8, 20, 255))
ground.alpha_composite(logo, (40, 40))
save(ground, 'logo.jpg', 1160)
save(Image.open(D2 + 'KDA_FIRESTARTER_Cover_1.jpg'), 'cover.jpg')
save(Image.open(D2 + 'KDA_FIRESTARTER_Crest_icon.png'), 'crests.jpg')
save(Image.open(D2 + 'KDA_FIRESTARTER_Cover_Alternative_Version.jpg'), 'stage.jpg', 1024)
save(Image.open(D2 + 'KDA_FIRESTARTER_Promo_01.jpg'), 'concert.jpg', 1280)
