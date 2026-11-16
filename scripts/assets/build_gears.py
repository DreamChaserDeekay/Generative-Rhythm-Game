"""Builds the gears' game pictures into client/public/media/gears/<gear>/ and lists them in
client/public/media/manifest.json as "<gear>/<part>" (the manifest's other entries are kept).

    python scripts/assets/build_gears.py

Three kinds of picture:

- each gear's deck, painted whole in the game camera's perspective (the generation in
  assets-src/gears/<gear>/deck.jpg, the deck's things standing up out of it) and laid flat on the deck
  here: each texel of the deck plane (plane px across the track, along it from the deck's top edge down
  as far as the generation shows it) sampled where the generation shows it, through the mapping in
  deck.json (deck plane px to the generation's px: the camera's homography of the template frame the
  generation was asked to repaint, times the alignment of the generation onto that frame). The renderer
  draws it on the cameras near the one it was painted from (deckArt.ts: deckPicture). Where a gear's
  lights shine from inside a part (the standard gear's speaker through its holes), a mask of where
  they may show is made from the laid-flat deck too (glow.png: the dark of the holes, softened, never
  past the part). The piano's treble clef medallion is cut from its laid-flat deck too, for the deck
  drawn in code (the plane camera's, and a row of lanes other than the one its picture was painted
  over);

- a material, made here from seeded noise (so it comes out the same on every run, and tiles without a
  seam: the noise is filtered in frequency space, which wraps): the standard gear's brushed graphite;
- the sky skin's painting (assets-src/gears/sky/plate.jpg: a picture of a sky and its clouds, painted
  straight on, with nothing of the game in it), sized here: the deck's code lays it under its strip
  of dashes and writes the readouts over it (deckArt.ts: skyPlate); and its feather (feather.jpg, on
  the magenta ground the objects are drawn on), keyed off its ground;
- the fire skin's crests (assets-src/gears/fire/crests.png: a strip of four square cells with its own
  alpha), as it is: its key caps carry them in turn (deckArt.ts: firePlate);
- objects, from the picked generations in assets-src/gears/<gear>/ (drawn top-down on a flat magenta
  ground, where they came from: assets-src/PROVENANCE.md): each is cut to the object and masked to its
  shape (a circle, the ground keyed out of its edge). The generation lit the objects' rims with the
  magenta ground: it is taken out of them (despill).

The renderer draws them (client/src/render/deckArt.ts: GEAR_PLATES, GEAR_FRAMES; the parts' manifest ids in
styleArt.ts: GEAR_PICTURES), each object at its picture's proportions.
Needs Pillow, numpy and scipy.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "gears"
MEDIA = ROOT / "client" / "public" / "media"
OUT = MEDIA / "gears"


# ---------- helpers ----------


def load(path: Path) -> np.ndarray:
    """RGB as float32 in 0..1."""
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255


def hexrgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255


def save_rgb(a: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "RGB").save(path, optimize=True)


def save_webp(a: np.ndarray, path: Path, quality: int = 90) -> None:
    """A photo-like picture (a deck) as lossy WebP, a fraction of its PNG."""
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "RGB").save(path, "WEBP", quality=quality, method=6)


def save_rgba(a: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").save(path, optimize=True)


def noise(h: int, w: int, seed: int, fy: float, fx: float) -> np.ndarray:
    """Gaussian noise low-passed with cut-offs `fy`, `fx` (cycles a px) in frequency space: it wraps at the edges. Zero mean, unit spread."""
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    out = np.real(np.fft.ifft2(f * np.exp(-((kx / fx) ** 2 + (ky / fy) ** 2))))
    return (out - out.mean()) / (out.std() + 1e-9)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------- materials ----------


def brushed(h: int, w: int, seed: int, base: str, depth: float, vertical: bool) -> np.ndarray:
    """Brushed metal: long streaks along the brushing, fine grain across it."""
    fy, fx = (0.002, 0.45) if vertical else (0.45, 0.002)
    streaks = noise(h, w, seed, fy, fx)
    fine = noise(h, w, seed + 1, fy * 4, fx * 4)
    v = 0.75 * streaks + 0.25 * fine
    c = hexrgb(base)
    return np.clip(c[None, None, :] * (1 + depth * v[..., None]), 0, 1)


# ---------- objects ----------


MAGENTA = np.array([1.0, 0.0, 1.0], dtype=np.float32)


def ground_mask(a: np.ndarray) -> np.ndarray:
    """Where the picture is not its magenta ground."""
    return np.linalg.norm(a - MAGENTA, axis=2) > 0.42


def object_box(a: np.ndarray) -> tuple[int, int, int, int]:
    """The object's box (top, bottom, left, right): the largest part off the ground."""
    fg = ndimage.binary_opening(ground_mask(a), iterations=3)
    labels, n = ndimage.label(fg)
    if n == 0:
        raise SystemExit("no object found")
    sizes = ndimage.sum(fg, labels, range(1, n + 1))
    keep = labels == (1 + int(np.argmax(sizes)))
    ys, xs = np.nonzero(keep)
    return int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1


def resize(a: np.ndarray, w: int, h: int) -> np.ndarray:
    im = Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8))
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def ellipse_alpha(w: int, h: int, inset: float = 0.006) -> np.ndarray:
    """An ellipse filling a `w` × `h` box, antialiased (4×4 samples a px)."""
    s = 4
    y, x = np.mgrid[0:h * s, 0:w * s].astype(np.float32)
    cx, cy = (w * s - 1) / 2, (h * s - 1) / 2
    inside = (((x - cx) / (cx * (1 - inset))) ** 2 + ((y - cy) / (cy * (1 - inset))) ** 2 <= 1).astype(np.float32)
    return inside.reshape(h, s, w, s).mean(axis=(1, 3))


def disc_alpha(size: int, inset: float = 0.006) -> np.ndarray:
    """A circle filling a square, antialiased (4×4 samples a px)."""
    s = size * 4
    y, x = np.mgrid[0:s, 0:s].astype(np.float32)
    c = (s - 1) / 2
    inside = ((x - c) ** 2 + (y - c) ** 2 <= (c * (1 - inset)) ** 2).astype(np.float32)
    return inside.reshape(size, 4, size, 4).mean(axis=(1, 3))


def keyed(crop: np.ndarray) -> np.ndarray:
    """RGBA off the magenta ground: alpha from how far a px is from the ground, and the ground taken back out of the edge px."""
    alpha = smoothstep(0.22, 0.6, np.linalg.norm(crop - MAGENTA, axis=2))[..., None]
    rgb = np.clip((crop - (1 - alpha) * MAGENTA) / np.maximum(alpha, 1e-3), 0, 1)
    return np.concatenate([np.where(alpha > 0.002, rgb, 0), alpha], axis=2)


def shrink(rgba: np.ndarray, w: int, h: int) -> np.ndarray:
    """RGBA resized with its colour weighted by alpha, so no ground colour bleeds into the edge."""
    pre = np.concatenate([rgba[..., :3] * rgba[..., 3:], rgba[..., 3:]], axis=2)
    im = Image.fromarray(np.clip(pre * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)
    out = np.asarray(im, dtype=np.float32) / 255
    out[..., :3] = np.clip(out[..., :3] / np.maximum(out[..., 3:], 1e-3), 0, 1)
    return out


def cut_disc(a: np.ndarray, size: int) -> np.ndarray:
    """A round object: keyed off its ground and trimmed to the circle of its box."""
    t, b, l, r = object_box(a)
    cy, cx = (t + b) / 2, (l + r) / 2
    rad = min(b - t, r - l) / 2 + 2
    crop = a[max(0, int(cy - rad)):int(cy + rad), max(0, int(cx - rad)):int(cx + rad)]
    out = shrink(keyed(crop), size, size)
    out[..., 3] = np.minimum(out[..., 3], disc_alpha(size, 0.004))
    return out


def cut_keyed(a: np.ndarray, size: int) -> np.ndarray:
    """The object off its magenta ground, edges keyed soft and the ground's tint taken out of them."""
    t, b, l, r = object_box(a)
    side = max(b - t, r - l) + 8
    cy, cx = (t + b) // 2, (l + r) // 2
    crop = a[max(0, cy - side // 2):cy + side // 2, max(0, cx - side // 2):cx + side // 2]
    d = np.linalg.norm(crop - MAGENTA, axis=2)
    alpha = smoothstep(0.35, 0.6, d)
    rgb = crop.copy()
    # the ground's purple out of the edge: blue and red no higher than the green allows
    rgb[..., 2] = np.minimum(rgb[..., 2], rgb[..., 1] * 0.9 + 0.08)
    rgb[..., 0] = np.where(alpha < 0.98, np.minimum(rgb[..., 0], rgb[..., 1] * 1.6 + 0.1), rgb[..., 0])
    rgba = np.concatenate([rgb, alpha[..., None]], axis=2)
    im = Image.fromarray(np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255


# ---------- the gears ----------


def deck_flat(src: Path, meta: dict, width_px: int = 2048, inset: float = 1.5) -> np.ndarray:
    """A gear's deck laid flat from its generation (see the module's doc): `width_px` texels across the
    deck (`meta["width"]` plane px, sampled `inset` plane px clear of the walls' foot), as many along it
    as `meta["room"]` plane px down from the deck's top edge (`meta["top"]` under the judge line) take;
    `meta["h"]`: row-major 3×3 homography from deck plane px (across from the track's middle, toward
    the camera from the judge line) to the generation's px."""
    img = load(src)
    h = np.array(meta["h"], dtype=np.float64).reshape(3, 3)
    width, top, room = meta["width"], meta["top"], meta["room"]
    k = width_px / width
    rows = int(round(room * k))
    u = (np.arange(width_px) + 0.5) / k
    v = (np.arange(rows) + 0.5) / k
    x = inset + u * (width - 2 * inset) / width - width / 2
    xx, yy = np.meshgrid(x, top + v)
    p = h @ np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)])
    sx, sy = p[0] / p[2] - 0.5, p[1] / p[2] - 0.5
    out = np.stack([ndimage.map_coordinates(img[..., c], [sy, sx], order=1, mode="nearest") for c in range(3)], axis=-1)
    return out.reshape(rows, width_px, 3)


# Where a deck's lights may shine from inside a part (deck picture px): the part as boxes (x0, y0, x1,
# y1), and what of it shines: its dark (a speaker's holes). The standard gear's speaker.
GLOW_WELLS = {
    "standard": {"boxes": [(1605, 135, 1940, 382)], "dark": 0.08},
}


def glow_mask(deck: np.ndarray, wells: dict) -> np.ndarray:
    """Where a deck's lights shine from inside its parts (0..1, the deck picture's size): the dark of
    each well (its holes), widened and softened a little; never past the part's boxes."""
    lum = deck @ np.array([0.299, 0.587, 0.114])
    h, w = lum.shape
    yy, xx = np.mgrid[0:h, 0:w]
    well = np.zeros(lum.shape, bool)
    for x0, y0, x1, y1 in wells["boxes"]:
        well |= (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    gaps = (lum < wells["dark"]) & well
    soft = np.clip(ndimage.gaussian_filter(ndimage.binary_dilation(gaps, iterations=2).astype(np.float64), 3) * 1.6, 0, 1)
    return soft * ndimage.gaussian_filter(ndimage.binary_erosion(well, iterations=1).astype(np.float64), 1.0)


def cut_white(a: np.ndarray, size: int, shade: str) -> np.ndarray:
    """A white object off its magenta ground (the sky skin's feather), its colours made again from its
    green: the ground has no green, so a px's green is the object's own, however much of the ground
    shows through its edge or lit its rim (the other objects' despill would turn white toward green).
    White where its green is full, toward `shade` where it is shaded."""
    t, b, l, r = object_box(a)
    side = max(b - t, r - l) + 8
    cy, cx = (t + b) // 2, (l + r) // 2
    crop = a[max(0, cy - side // 2):cy + side // 2, max(0, cx - side // 2):cx + side // 2]
    alpha = smoothstep(0.35, 0.6, np.linalg.norm(crop - MAGENTA, axis=2))
    green = np.clip(crop[..., 1] / np.maximum(alpha, 0.05), 0, 1)
    dark = np.clip((1 - green) / 0.12, 0, 1)[..., None]
    rgb = (1 - dark) * np.ones(3, dtype=np.float32) + dark * hexrgb(shade)
    rgba = np.concatenate([rgb, alpha[..., None]], axis=2).astype(np.float32)
    im = Image.fromarray(np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255


def despill(rgba: np.ndarray, reach: int = 12) -> np.ndarray:
    """The magenta ground's light taken out of an object's rim (`reach` px in from its edge): red and blue
    down to where green allows, as a keyer's despill; colours further in are kept."""
    edge = Image.fromarray(np.clip(rgba[..., 3] * 255 + 0.5, 0, 255).astype(np.uint8), "L").filter(ImageFilter.BoxBlur(reach))
    near = np.asarray(edge, dtype=np.float32) / 255 < 0.995
    out = rgba.copy()
    spill = np.clip(np.minimum(out[..., 0] - out[..., 1], out[..., 2] - out[..., 1]), 0, None) * near
    out[..., 0] -= spill
    out[..., 2] -= spill
    return out


# How much longer along the track the deck pictures are laid flat than they look (deckArt.ts:
# DECK_PICTURE_STRETCH, SDVX's on a 16:9 screen).
DECK_PICTURE_STRETCH = 1.2

# Where the piano's treble clef medallion lies on its laid-flat deck (deck picture px: x0, y0, x1, y1),
# on the scratch lane's cheek block.
PIANO_MEDALLION = (72, 109, 296, 387)


def cut_flat(deck: np.ndarray, box: tuple[int, int, int, int], width: int) -> np.ndarray:
    """A round thing lying on a laid-flat deck, as it looks: its box (deck picture px), its rows
    shortened by the deck pictures' stretch along the track, `width` px across, trimmed to the box's
    ellipse."""
    x0, y0, x1, y1 = box
    h = round(width * (y1 - y0) / (x1 - x0) / DECK_PICTURE_STRETCH)
    rgb = resize(deck[y0:y1, x0:x1], width, h)
    return np.concatenate([rgb, ellipse_alpha(width, h)[..., None]], axis=2)


# How much plain sky is added over the sky skin's painting (a share of its height, its top row run
# on): its clouds then stand as far down the deck as the skin's concept has them.
SKY_PLATE_PAD = 0.02


def entry(textures: dict, gear: str, part: str, file: str, size: tuple[int, int]) -> None:
    textures[f"{gear}/{part}"] = {"file": f"gears/{gear}/{file}", "bundle": "gear", "size": [int(size[0]), int(size[1])]}


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    textures: dict = {}
    report: dict = {}

    def material(gear: str, part: str, a: np.ndarray) -> None:
        save_rgb(a, OUT / gear / f"{part}.png")
        entry(textures, gear, part, f"{part}.png", (a.shape[1], a.shape[0]))

    def deck(gear: str) -> np.ndarray | None:
        src = SRC / gear / "deck.jpg"
        if not src.exists():
            return None
        a = deck_flat(src, json.loads((SRC / gear / "deck.json").read_text(encoding="utf-8")))
        save_webp(a, OUT / gear / "deck.webp")
        entry(textures, gear, "deck", "deck.webp", (a.shape[1], a.shape[0]))
        report[f"{gear}/deck"] = [a.shape[1], a.shape[0]]
        if gear in GLOW_WELLS:
            m = glow_mask(a, GLOW_WELLS[gear])
            Image.fromarray(np.clip(m * 255 + 0.5, 0, 255).astype(np.uint8), "L").save(OUT / gear / "glow.png", optimize=True)
            entry(textures, gear, "glow", "glow.png", (m.shape[1], m.shape[0]))
            report[f"{gear}/glow"] = [m.shape[1], m.shape[0]]
        return a

    decks = {gear: deck(gear) for gear in ("standard", "piano")}

    def sprite(gear: str, part: str, a: np.ndarray) -> None:
        a = despill(a)
        save_rgba(a, OUT / gear / f"{part}.png")
        entry(textures, gear, part, f"{part}.png", (a.shape[1], a.shape[0]))
        report[f"{gear}/{part}"] = [a.shape[1], a.shape[0]]

    # STANDARD: brushed graphite down its rails; a smoked glass jog dial on its deck
    material("standard", "graphite", brushed(1024, 256, 31, "#2a2c31", 0.05, vertical=True))
    sprite("standard", "jog", cut_disc(load(SRC / "standard" / "jog.jpg"), 512))

    # SKY: the painting of its deck's sky and clouds, a little plain sky added over it (the deck then
    # shows, on the usual cameras, the painting's upper half: the sky with a cumulus standing at each
    # end, the taller at the left as the skin's concept has it, the middle clear for the score; the
    # sea of cloud under them shows only where the screen shows the deck deep), and the feather that
    # lies over the score, off its magenta ground. Its strip of dashes, its readouts, its frame and
    # its HUD are drawn in code
    sky = load(SRC / "sky" / "plate.jpg")
    pad = round(sky.shape[0] * SKY_PLATE_PAD)
    sky = np.concatenate([np.repeat(sky[:1], pad, axis=0), sky], axis=0)
    a = resize(sky, 2048, round(2048 * sky.shape[0] / sky.shape[1]))
    save_webp(a, OUT / "sky" / "plate.webp")
    entry(textures, "sky", "plate", "plate.webp", (a.shape[1], a.shape[0]))
    report["sky/plate"] = [a.shape[1], a.shape[0]]
    # white on magenta: its colours made again from its green (cut_white), shaded toward a pale sky blue
    a = cut_white(load(SRC / "sky" / "feather.jpg"), 256, "#bcd7f3")
    save_rgba(a, OUT / "sky" / "feather.png")
    entry(textures, "sky", "feather", "feather.png", (a.shape[1], a.shape[0]))
    report["sky/feather"] = [a.shape[1], a.shape[0]]

    # FIRE: the crests its key caps carry, the group's four members' in their order from the left: one strip of four
    # square cells with its own alpha, as it is (assets-src/gears/fire/crests.png: cut from the skin's official crest
    # pictures and painted again in black chrome, scripts/assets/deck_panels). The rest of its deck is drawn in code,
    # over its panel (build_skin_panels.py)
    crests = Image.open(SRC / "fire" / "crests.png").convert("RGBA")
    (OUT / "fire").mkdir(parents=True, exist_ok=True)
    crests.save(OUT / "fire" / "crests.png", optimize=True)
    entry(textures, "fire", "crests", "crests.png", crests.size)
    report["fire/crests"] = list(crests.size)

    # PIANO: lacquer and ivory drawn in code; its treble clef medallion, cut from its laid-flat deck (its brass is its own colour: no ground to take out)
    piano = decks["piano"]
    if piano is not None:
        a = cut_flat(piano, PIANO_MEDALLION, 256)
        save_rgba(a, OUT / "piano" / "medallion.png")
        entry(textures, "piano", "medallion", "medallion.png", (a.shape[1], a.shape[0]))
        report["piano/medallion"] = [a.shape[1], a.shape[0]]

    print(json.dumps(report, indent=1))
    path = MEDIA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    kept = {k: t for k, t in manifest["textures"].items() if not t["file"].startswith("gears/")}
    manifest["textures"] = dict(sorted({**kept, **textures}.items()))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
