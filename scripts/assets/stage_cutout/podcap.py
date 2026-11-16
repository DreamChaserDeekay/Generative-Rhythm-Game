"""Asks the image model to paint the top of the pod that floats over the standing woman at the upper left, which the illustration's
top edge cuts: a low dome, as her pods are in the pictures that show them whole.
   python3 -I podcap.py <work dir> 2-right <try>

The user, 2026-11-13, of the first cut-out's pod, whose top the model had drawn on as a long claw: "카이사 어깨 장치가 너무 크게
그려졌는데, 카이사 어깨 장치 다른 이미지들 확인해보고 다시 그려줘".

Given: work/2-right-pod.png (the figure on green with that claw cut away, the pod ending flat at the illustration's top edge, cut
to a square round the pod: compose.py --cut --crop pod) and two pictures of her pods whole: the other pod of the same illustration
(cut from src/Ahri_KDAFIRESTARTERSkin_HD.jpg) and the skin's in-game model (src/KaiSa_KDAFIRESTARTER_Base.png: the wiki's
"Kai'Sa KDAFIRESTARTER (Base).png", enlarged on grey).
Writes work/2-right-try-p<n>.png: register.py <work dir> 2-right p<n> pod, then compose.py ... --mend p<n>@pod <box>."""
import hashlib, io, json, os, sys, time
S = sys.argv[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import cutout

Image.MAX_IMAGE_PIXELS = None
#: the other pod, whole, in the illustration (px of the HD picture)
SIDE_POD = (5350, 600, 6150, 1600)

PROMPT = (
    "Three pictures come with this request.\n\n"
    "IMAGE 1 is the picture you edit: a cut-out, on flat pure green (#00FF00), of a painted character: a silver-haired woman in a dark "
    "red dress, and above her at the left one of her two floating shoulder pods: a shell of silver and dark violet metal with a "
    "glowing pink crystal set in it, its claws hanging down. The pod is CUT STRAIGHT ACROSS ITS TOP by a flat horizontal cut: the top "
    "of its shell is missing.\n\n"
    "IMAGE 2 is the other pod of the same painting, whole: the same kind of object seen from another side. Its shell is a rounded "
    "dome that closes smoothly, with one small pointed crest on it.\n"
    "IMAGE 3 is the same character's 3D game model: her two shoulder pods are compact, low, rounded shells with the crystal on top, "
    "hardly taller than they are wide.\n\n"
    "MEND ONLY THE POD'S TOP in image 1: paint the missing top of its shell above the straight cut, in exactly the painting's style, "
    "colours and light, as the same object as in images 2 and 3. The dark violet and silver shell closes over the crystal in a LOW, "
    "ROUNDED DOME: its outline runs on smoothly from the pod's two sides and meets over its middle; at most one small pointed crest "
    "on it, as in image 2. Keep it compact and low: the dome is much lower than the pod is wide, and it ends well below the "
    "picture's top edge, with green above it. NO long horn, NO tall claw, NO blade rising from it, no second crystal, nothing else "
    "new.\n\n"
    "EVERYTHING ELSE STAYS EXACTLY AS IT IS, pixel for pixel: the pod below the cut with its crystal and its claws, the woman, her "
    "hair, every colour, and the flat green round them. Do not move, scale, redraw, relight or sharpen anything. The same framing "
    "and the same proportions as image 1. No text, no watermark."
)


def png(image):
    out = io.BytesIO(); image.save(out, 'PNG'); return out.getvalue()


name, n = sys.argv[2], sys.argv[3]
figure = open(f'{S}/work/{name}-pod.png', 'rb').read()
side = png(Image.open(f'{S}/src/Ahri_KDAFIRESTARTERSkin_HD.jpg').convert('RGB').crop(SIDE_POD))
model = Image.open(f'{S}/src/KaiSa_KDAFIRESTARTER_Base.png').convert('RGBA')
ground = Image.new('RGBA', model.size, (58, 58, 66, 255)); ground.alpha_composite(model)
model = png(ground.convert('RGB').resize((model.width * 3, model.height * 3), Image.LANCZOS))
out, usage = cutout.generate(PROMPT, [("image/png", figure), ("image/png", side), ("image/png", model)], "1:1")
stem = f'{S}/work/{name}-try-p{n}'
open(stem + '.png', 'wb').write(out)
json.dump({'model': cutout.MODEL, 'aspect': '1:1', 'size': '2K', 'piece': name, 'prompt': PROMPT, 'made': time.strftime('%Y-%m-%d %H:%M:%S %z', time.gmtime()),
           'bytes': len(out), 'sha256': hashlib.sha256(out).hexdigest(), 'usage': usage,
           'pictures': [f'{name}-pod.png (the figure on green, the pod cut flat at the illustration\'s top edge; sha256 {hashlib.sha256(figure).hexdigest()})',
                        f'the other pod, whole: px {SIDE_POD} of Ahri_KDAFIRESTARTERSkin_HD.jpg (sha256 {hashlib.sha256(side).hexdigest()})',
                        f'the in-game model: KaiSa_KDAFIRESTARTER_Base.png on grey, three times its size (sha256 {hashlib.sha256(model).hexdigest()})']},
          open(stem + '.json', 'w'), indent=1, ensure_ascii=False)
print('made', stem, len(out), usage.get('totalTokenCount'))
