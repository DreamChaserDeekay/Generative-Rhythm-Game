"""Where the two pieces of the group's illustration stand in their pictures (the same places as in the two pictures the game had
before, the pieces with their backgrounds of 2026-11-11), and the working canvases made of them at twice that size."""
from PIL import Image

HD = (7000, 4136)
BOX = 1126                      # a picture's height (px)
PER = 1024 / 0.95               # px of a picture to the illustration's height, the right piece
K = 2                           # the working canvases are this many times the pictures
ASPECT = 0.8                    # 4:5, an aspect the image model takes: the canvases are that wide

PIECES = {
    # name: the illustration from x0 to x1 (shares of its width), its size next to the right piece's, its top edge that many px down
    # the picture, the clear room at its inner side (px), whether the gear is at its left
    '1-left': dict(x0=0.262, x1=0.68, size=0.93, top=429, clear=158, inner_left=False, width=867),
    '2-right': dict(x0=0.58, x1=0.99, size=1.0, top=322, clear=143, inner_left=True, width=891),
}


def layout(name):
    """The piece's working canvas: its size, where the illustration's crop lies in it (px of the canvas), the crop in the HD
    illustration (px), and where the picture itself lies in the canvas (the canvas is a little wider: 4:5)."""
    p = PIECES[name]
    per = PER * p['size']
    y1 = min(1.0, (BOX - p['top']) / per)
    w = round((p['x1'] - p['x0']) * HD[0] * per / HD[1])
    h = round(y1 * per)
    cw, ch = round(BOX * K * ASPECT), BOX * K
    extra = cw - p['width'] * K              # canvas columns beyond the picture, at its outer side
    # the picture in the canvas
    px = 0 if p['inner_left'] else extra
    # the illustration's crop in the picture: after the clear room where the gear is at the left
    ix = px + (p['clear'] * K if p['inner_left'] else 0)
    iy = p['top'] * K
    scale = (w * K) / ((p['x1'] - p['x0']) * HD[0])          # canvas px to an HD px
    return dict(canvas=(cw, ch), picture=(px, 0, px + p['width'] * K, ch), art=(ix, iy, ix + w * K, iy + h * K), scale=scale, y1=y1,
                hd=(p['x0'] * HD[0], 0.0, p['x1'] * HD[0], y1 * HD[1]), extra=extra, inner_left=p['inner_left'])


def art_on_canvas(name, hd_image, fill=(0, 255, 0)):
    """The canvas with the illustration in its place: all of it that the canvas has room for (also beyond the piece's own crop, at
    its outer side and toward the other pair), the rest `fill`."""
    L = layout(name)
    cw, ch = L['canvas']
    s = L['scale']
    ax0, ay0 = L['art'][0], L['art'][1]
    # the canvas's whole width and its rows from the illustration's top edge down, in HD px
    hx0 = L['hd'][0] - ax0 / s
    hx1 = hx0 + cw / s
    hy1 = (ch - ay0) / s
    crop = hd_image.crop((round(max(0, hx0)), 0, round(min(HD[0], hx1)), round(min(HD[1], hy1))))
    tw = round(crop.width * s)
    th = round(crop.height * s)
    crop = crop.resize((tw, th), Image.LANCZOS)
    canvas = Image.new('RGB', (cw, ch), fill)
    canvas.paste(crop, (round((max(0, hx0) - hx0) * s), ay0))
    return canvas
