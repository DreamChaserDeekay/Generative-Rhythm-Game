"""Cuts one frame of a hit effect (light on black) into the still layers the game moves on every frame of the screen
(client/src/render/layerFx.ts), lays them out as its atlas, and measures how a hit's frames went (its light, its white
middle, how far it spread) for the manifest's "layers". Used for the game's own skins (scripts/assets/build_skin_fx.py,
from the sheets the image model drew) and for the player's packs (skins.py: from their hit picture or sheet).

The layers add up to the frame (laid one over another as light over light, "screen", as the game lays them):

    core    the white-hot middle (white light near the middle)
    shape   the strokes, rays, shards: the pieces that are large or long, with the colour of the strokes laid under the
            core, so that the middle is not a hole when the white has gone
    sparks  the small round specks (small pieces that are not long)
    glow    the whole frame in the strokes' colour, smoothed: a halo with no holes
    order   the order the light goes in, 0 first .. 1 last (erosion maps): R the body's (without one, the core's: its
            edge first, its middle last), G the shape's, B the specks'
    body    (with `body`) the middle of a shape that is one solid piece there, where the strokes meet: it parts into
            spokes along the strokes, so that they reach in to the middle as they thin. Without one, this cell holds
            the late specks: the small specks of a later frame (late_sparks), which come in as the shape goes

The shape thins from its edges in (each pixel's distance from the edge against the stroke's width there), a little
later out than in, unevenly round the middle (strokes at different angles break at different moments) and along the
brush's grain. The specks go one by one, each at a moment of its own (seeded: the same every build).

Needs numpy, scipy and Pillow.
"""

from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage

#: the atlas's grid and its cells (layerFx.ts: CORE, SHAPE, SPARKS, GLOW, ORDER, BODY)
COLS, ROWS = 3, 2
CELLS = ["core", "shape", "sparks", "glow", "order", "body"]
#: a hit's light as the game moves its layers: its share left every LIGHT_STEP_MS (layerFx.ts: LIGHT_STEP_MS)
LIGHT_STEP_MS = 20
LIGHT_STEPS = 17
#: how much farther out the middle of a hit's light may go as it ends (layerFx.ts reads "grow")
GROW = (1.0, 1.8)
#: where the late specks are taken from: this share of the way through a hit's frames
LATE_AT = 0.55
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def smoothstep(lo: float, hi: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def ranked(raw: np.ndarray, where: np.ndarray) -> np.ndarray:
    """`raw` turned into its rank among the pixels `where` (0.02 .. 1: the threshold sweeps them evenly), 0 elsewhere,
    spread a pixel past them (the layers' soft edges take their neighbours' order)."""
    o = np.zeros(raw.shape, np.float32)
    idx = np.nonzero(where)
    vals = raw[idx]
    if vals.size:
        o[idx] = 0.02 + 0.98 * (np.argsort(np.argsort(vals)) + 1) / vals.size
    return ndimage.grey_dilation(o, size=3)


def split(c: np.ndarray, body: bool = False, seed: int = 7) -> dict[str, np.ndarray]:
    """The layers of a frame (RGB, 0..1, square)."""
    n = c.shape[0]
    ys, xs = np.mgrid[0:n, 0:n]
    rad = np.hypot(xs - (n - 1) / 2, ys - (n - 1) / 2) / (n / 2)
    ang = np.arctan2(ys - (n - 1) / 2, xs - (n - 1) / 2)

    # the core: white light (the least of its channels high) near the middle
    core_m = smoothstep(0.35, 0.65, c.min(axis=2)) * smoothstep(0.62, 0.38, rad)
    # its fringe too, whole: left half in the shape, it would stay as a pale ring round a dark middle once the white has
    # shrunk (the core goes from its edge in, in its own order)
    core_m = np.clip(ndimage.gaussian_filter(core_m, 1.0) * 2.0, 0, 1)
    core = c * core_m[..., None]
    rest = c - core

    # pieces: large or long ones are the shape, small round ones the specks
    solid = rest.max(axis=2) > 0.22
    lab, count = ndimage.label(solid)
    index = np.arange(1, count + 1)
    sizes = ndimage.sum(solid, lab, index=index)
    boxes = ndimage.find_objects(lab)
    long_ = np.array([max(b[0].stop - b[0].start, b[1].stop - b[1].start) > 0.07 * n for b in boxes], bool) if count else np.zeros(0, bool)
    small = np.zeros(count + 1, bool)
    small[1:] = (sizes < 0.0025 * n * n) & ~long_
    spark_m = ndimage.gaussian_filter(np.clip(ndimage.grey_dilation(small[lab].astype(np.float32), size=3), 0, 1), 0.8)
    hard_shape = (lab > 0) & ~small[lab]
    shape_m = ndimage.gaussian_filter(np.clip(ndimage.grey_dilation(hard_shape.astype(np.float32), size=3), 0, 1), 0.8)
    shape_m = np.clip(shape_m - spark_m, 0, 1)
    sparks = rest * spark_m[..., None]
    shape = rest * shape_m[..., None]

    # with a body: under the white middle the strokes' own colour (screen: the white over it is white), so that the
    # middle is the strokes' colour, not a hole, when the white has gone; without one the middle goes dark with it
    fill = np.zeros_like(c)
    if body:
        strong = shape.max(axis=2) > 0.5
        under = np.median(shape[strong], axis=0) if strong.sum() > 20 else np.full(3, 0.5)
        fill = core_m[..., None] * under[None, None, :]
        shape = shape + fill
    # (without a body, a halo round the shape with none in the middle: what is left there when the white has gone is
    # dark, as the sheets' middles go; with one, warm in the middle as well)
    halo = c * (1 - core_m[..., None]) + fill
    if not body:
        halo = halo * smoothstep(0.15, 0.45, rad)[..., None]
    glow = ndimage.gaussian_filter(halo, sigma=(n * 0.05, n * 0.05, 0)) * 0.9

    vv = rest.max(axis=2)
    grain = vv - ndimage.gaussian_filter(vv, 2.0)
    grain = (grain - grain.min()) / max(1e-6, float(np.ptp(grain)))
    rng = np.random.default_rng(seed)
    angn = sum(np.sin(k * ang + rng.uniform(0, 2 * np.pi)) for k in (3, 5, 7, 11))
    angn = (angn - angn.min()) / max(1e-6, float(np.ptp(angn)))

    body_l = np.zeros_like(c)
    body_order = np.zeros(c.shape[:2], np.float32)
    inner = 0.0
    if body:
        # the middle out to where the strokes part: the radius up to which a ring round it is still mostly lit
        lit = hard_shape | (core_m > 0.3)
        cw = core_m.ravel()
        by_r = np.argsort(rad.ravel())
        cum = np.cumsum(cw[by_r])
        r_core = float(rad.ravel()[by_r][np.searchsorted(cum, 0.9 * cum[-1])]) if cum[-1] > 0 else 0.1
        bins = np.linspace(0, 1, 101)
        which = np.digitize(rad, bins)
        fill_at = np.array([lit[which == k].mean() if (which == k).any() else 0 for k in range(1, 101)])
        k = int(np.searchsorted(bins, r_core))
        while k < 100 and fill_at[k] > 0.8:
            k += 1
        inner = max(r_core, float(bins[k])) + 0.04
        wb = smoothstep(inner + 0.06, inner - 0.06, rad)
        body_l = shape * wb[..., None]
        shape = shape * (1 - wb)[..., None]
        hard_shape = hard_shape & (rad > inner - 0.06)
        # spokes along the strokes as they leave the body, as wide all along
        ring = (rad > inner) & (rad < inner + 0.2)
        nb = 360
        ai = ((ang + np.pi) / (2 * np.pi) * nb).astype(int) % nb
        prof = np.bincount(ai[ring], weights=shape.max(axis=2)[ring], minlength=nb) / np.maximum(np.bincount(ai[ring], minlength=nb), 1)
        prof = ndimage.gaussian_filter1d(prof, 2.0, mode="wrap")
        prof = (prof - prof.min()) / max(1e-6, float(np.ptp(prof)))
        peaks = [k for k in range(nb) if prof[k] > 0.35 and prof[k] >= prof[k - 1] and prof[k] >= prof[(k + 1) % nb]]
        across = np.full(rad.shape, 9.0, np.float32)
        for k in peaks:
            th = (k + 0.5) / nb * 2 * np.pi - np.pi
            d = np.angle(np.exp(1j * (ang - th)))
            across = np.minimum(across, np.where(np.abs(d) < np.pi / 2, rad * np.abs(np.sin(d)), 9.0))
        spokes = np.exp(-((across / 0.025) ** 2))
        body_order = ndimage.gaussian_filter(ranked(0.7 * spokes + 0.3 * np.clip(rad / inner, 0, 1) + 0.05 * grain, wb > 0.02), 1.0)

    # the shape thins evenly along a stroke: its distance from the edge against the stroke's width there
    dt = ndimage.distance_transform_edt(hard_shape)
    local = ndimage.grey_dilation(dt, size=15)
    thick = np.where(hard_shape, dt / np.maximum(local, 1e-3), 0)
    outward = np.clip((rad - inner) / 0.5, 0, 1)
    shape_order = ndimage.gaussian_filter(ranked(0.45 * thick + 0.35 * outward + 0.12 * angn + 0.08 * grain, hard_shape), 1.0)
    per = np.concatenate([[0], rng.uniform(0.15, 1.0, count)])
    spark_order = ndimage.grey_dilation(np.where(small[lab], per[lab], 0).astype(np.float32), size=5)
    if not body:
        # the core shrinks to its brightest light, toward its middle: its edge and its dimmer light first
        body_order = ndimage.gaussian_filter(ranked(c.min(axis=2) * 0.6 + (1 - np.clip(rad / 0.62, 0, 1)) * 0.4, core_m > 0.02), 1.0)
    order = np.stack([body_order, shape_order, spark_order], axis=2).astype(np.float32)
    return {"core": core, "shape": shape, "sparks": sparks, "glow": glow, "order": order, "body": body_l}


def specks(c: np.ndarray) -> np.ndarray:
    """The small round specks of a frame (as split() finds them), on black."""
    n = c.shape[0]
    solid = c.max(axis=2) > 0.22
    lab, count = ndimage.label(solid)
    if not count:
        return np.zeros_like(c)
    sizes = ndimage.sum(solid, lab, index=np.arange(1, count + 1))
    boxes = ndimage.find_objects(lab)
    long_ = np.array([max(b[0].stop - b[0].start, b[1].stop - b[1].start) > 0.07 * n for b in boxes], bool)
    small = np.zeros(count + 1, bool)
    small[1:] = (sizes < 0.0025 * n * n) & ~long_
    m = ndimage.gaussian_filter(np.clip(ndimage.grey_dilation(small[lab].astype(np.float32), size=3), 0, 1), 0.8)
    return c * m[..., None]


def white_middle(c: np.ndarray) -> float:
    """How much white light a frame has near its middle (what the core layer holds of it)."""
    n = c.shape[0]
    ys, xs = np.mgrid[0:n, 0:n]
    rad = np.hypot(xs - (n - 1) / 2, ys - (n - 1) / 2) / (n / 2)
    return float((smoothstep(0.35, 0.65, c.min(axis=2)) * smoothstep(0.35, 0.15, rad) * c.max(axis=2)).sum())


def lit(layer: np.ndarray) -> float:
    return float(layer.max(axis=2).sum())


def edge(cell: int, soft: float = 0.08) -> np.ndarray:
    """1 inside a cell, falling to 0 at its edges over `soft` of its size."""
    d = (np.minimum(np.arange(cell), np.arange(cell)[::-1]) + 0.5) / cell
    side = smoothstep(0, soft, d)
    return np.outer(side, side).astype(np.float32)[..., None]


def atlas(layers: dict[str, np.ndarray], cell: int, grey: bool = False) -> Image.Image:
    """The layers in a COLS x ROWS grid of `cell` px each (white light where `grey`: the game colours it; the order
    is not light and keeps its channels). Every cell is black at its edges: a layer grown past its cell's edge would
    end in a straight line (the glow reaches them), and the game's smaller copies of the picture (mipmaps) mix each
    cell's edge with its neighbour's."""
    out = np.zeros((ROWS * cell, COLS * cell, 3), np.float32)
    for i, key in enumerate(CELLS):
        layer = np.clip(layers[key], 0, 1)
        if layer.shape[0] != cell:
            im = Image.fromarray(np.uint8(np.rint(layer * 255)), "RGB").resize((cell, cell), Image.LANCZOS)
            layer = np.asarray(im, np.float32) / 255
        layer = layer * edge(cell)
        if grey and key != "order":
            layer = np.repeat(layer.max(axis=2, keepdims=True), 3, axis=2)
        r, col = divmod(i, COLS)
        out[r * cell:(r + 1) * cell, col * cell:(col + 1) * cell] = layer
    return Image.fromarray(np.uint8(np.clip(np.rint(out * 255), 0, 255)), "RGB")


# ---------- how a hit's frames went ----------


def luma_sum(frame: np.ndarray) -> float:
    return float((frame @ LUMA).sum())


def light_curve(light: list[float], start: int, count: int, seconds: float) -> list[float]:
    """The share of a hit's light left every LIGHT_STEP_MS, as a sheet of `count` frames was played: from frame `start`,
    at count / `seconds` frames a second, each frame mixed with the next, its last ones fading out (the game's drawHit).
    Never rising again: the layers thin but do not grow back."""
    fps = count / seconds
    top = light[start] or 1.0
    out = []
    for k in range(LIGHT_STEPS):
        f = start + k * LIGHT_STEP_MS / 1000 * fps
        if f >= count - 1:
            out.append(0.0)
            continue
        i = int(f)
        x = light[i] + (light[i + 1] - light[i]) * (f - i)
        out.append(round(float(np.clip(x / top * min(1, (1 - f / count) / 0.3), 0, 1.5)), 3))
    out[-1] = 0.0
    for k in range(1, LIGHT_STEPS):
        out[k] = min(out[k], out[k - 1])
    return out


def reach(frame: np.ndarray, share: float = 0.9) -> float:
    """The radius about the frame's middle that holds `share` of its light, per half frame."""
    n = frame.shape[0]
    v = frame.max(axis=2)
    ys, xs = np.mgrid[0:n, 0:n]
    r = np.hypot(xs - (n - 1) / 2, ys - (n - 1) / 2).ravel()
    order = np.argsort(r)
    total = np.cumsum(v.ravel()[order])
    if total[-1] <= 0:
        return 0
    return float(r[order][np.searchsorted(total, share * total[-1])] / (n / 2))


def measure_burst(frames: list[np.ndarray], start: int, light: list[float], seconds: float) -> dict:
    """How a hit's frames went, played from `start` over `seconds` (`light`: each frame's light, as measured where it is
    played): the manifest's "light" (the shape's: the frames' light without their specks; a sheet that breaks into
    sparkles, they are the late specks'), "core" (its white middle's), "grow" (how far out the middle of its light went
    while a third of it was left, against where it started) and "reach" (where it started)."""
    count = len(frames)
    curve = light_curve([luma_sum(f) - luma_sum(specks(f)) for f in frames], start, count, seconds)
    core = light_curve([white_middle(f) for f in frames], start, count, seconds)
    r0 = reach(frames[start], 0.5)
    late = [reach(f, 0.5) for f, x in zip(frames, light) if x >= 0.3 * light[start]]
    grow = round(float(np.clip(max(late) / max(r0, 1e-3), *GROW)), 2)
    return {"light": curve, "core": core, "grow": grow, "reach": round(r0, 3)}


def late_frame(start: int, count: int) -> int:
    """The frame the late specks are taken from."""
    return start + round(LATE_AT * (count - 1 - start))
