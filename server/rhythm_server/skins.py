"""The player's own asset packs (docs/CUSTOM_ASSETS.md): pictures a player made with an image model of their choice,
put in a folder of the data folder, cleaned up here into the game's own picture layouts.

    <data>/skins/<pack>/note.png    a tap note (any of .png .webp .jpg .jpeg)
                        long.png    a long note's body, upright (optional: made from the tap without it)
                        panel.png   the gear's lower panel, drawn over the layout template (TEMPLATES)
                        hit.png     one frame of a hit effect, light on black: the game makes its animation
                        hit_sheet.png  (advanced) a 4 x 4 flipbook of the hit, played as it is
                        hold.png    (optional) the light while a long note is held; made from hit.png without it
                        pack.json   (optional) {"name": ..., "author": ..., "hitColor": "own" | "lane"}

Only those names are read, straight from the pack's folder (no link, no sub-folder): a picture is decoded by Pillow
after its size is checked (MAX_BYTES, MAX_PIXELS) and nothing in a pack is run. Each part is built into
<data>/cache/skins/<pack>/ once, in the size of the game's own picture for it (never larger), and built again when
its file changes; the pack's own files are never written. A part that cannot be used says why (Korean, shown in the
settings) and the game draws the part the player picked before.

The pictures each part is built into stand in for the game's own (client/src/render/skinArt.ts: packOverrides):
the tap and long note for the default note's ("notes/flat", "longs/solid": tint pictures, red how much of the lane
colour shows, green how far toward white), the panel for the default gear's ("standard/panel"), the hit for the
default flash's ("basic/hitBurst", "basic/hitHold"). So a pack adds no texture and no draw call to a play.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

#: bump when a build changes, so every cached part is built again
VERSION = 1
EXTENSIONS = (".png", ".webp", ".jpg", ".jpeg")
FORMATS = {"PNG", "WEBP", "JPEG"}
MAX_BYTES = 20 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_PACKS = 64
#: what a pack's folder may hold that is read, by part: the stems of its pictures
SOURCES = ("note", "long", "panel", "hit", "hit_sheet", "hold")

# the game's layouts (client/src/render/styleArt.ts)
NOTE_W, NOTE_H, NOTE_ROW, NOTE_TOP = 1024, 224, 256, 16
LONG_W, LONG_TILE, LONG_END = 128, 256, 44
PANEL_W, PANEL_H = 2048, 876
BURST_CELL, HOLD_CELL = 384, 256
#: a hit is over this long after it (docs/GEAR_NOTE_FX.md: 0.27 s), its first frame its brightest
BURST_SECONDS = 0.27
BURST_FRAMES = 10
HOLD_FRAMES, HOLD_FPS = 16, 24
#: the references of the game's own notes were drawn for a lane 0.72 grey: that value is all of the lane colour
NOTE_GAIN = 1 / 0.72
NEAR_PEAK = 0.95

#: the built files a pack's parts are served as
FILES = {
    "note": "note.png",
    "long": "long.png",
    "panel": "panel.webp",
    "hitBurst": "hit_burst.webp",
    "hitHold": "hit_hold.webp",
}


class PartError(Exception):
    """A picture that cannot be used, and why (shown to the player)."""


# ---------- reading ----------


def _entries(folder: Path) -> dict[str, Path]:
    """The pictures and pack.json directly in a folder, by lower-case name; links and folders are not read."""
    out: dict[str, Path] = {}
    try:
        with os.scandir(folder) as it:
            for e in it:
                if e.is_symlink() or not e.is_file(follow_symlinks=False):
                    continue
                out[e.name.lower()] = Path(e.path)
    except OSError:
        pass
    return out


def _source(entries: dict[str, Path], stem: str) -> Path | None:
    for ext in EXTENSIONS:
        p = entries.get(stem + ext)
        if p is not None:
            return p
    return None


def load_picture(path: Path) -> np.ndarray:
    """A picture as RGBA floats 0..1, after checking it is a picture of a size that may be decoded."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    size = path.stat().st_size
    if size > MAX_BYTES:
        raise PartError(f"파일이 너무 큽니다 ({size / 1048576:.0f} MB, 20 MB까지).")
    try:
        with Image.open(path) as im:
            if im.format not in FORMATS:
                raise PartError("PNG · WebP · JPEG 그림만 읽습니다.")
            w, h = im.size
            if w * h > MAX_PIXELS:
                raise PartError(f"그림이 너무 큽니다 ({w}×{h}).")
            if getattr(im, "n_frames", 1) > 1:
                im.seek(0)
            im = ImageOps.exif_transpose(im)
            rgba = np.asarray(im.convert("RGBA"), dtype=np.float32) / 255
    except PartError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError):
        raise PartError("그림 파일로 읽지 못했습니다.") from None
    except (OSError, ValueError, SyntaxError):
        raise PartError("그림 파일이 깨져 있습니다.") from None
    return rgba


# ---------- picture helpers ----------


def luma(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def _resize_channel(c: np.ndarray, w: int, h: int) -> np.ndarray:
    from PIL import Image

    return np.asarray(Image.fromarray(np.ascontiguousarray(c, dtype=np.float32), "F").resize((w, h), Image.LANCZOS), np.float32)


def resize(rgba: np.ndarray, w: int, h: int) -> np.ndarray:
    """RGBA floats resized without dark fringes: colours are filtered weighted by their alpha."""
    a = rgba[..., 3]
    pre = [rgba[..., c] * a for c in range(3)] + [a]
    out = np.stack([_resize_channel(c, w, h) for c in pre], axis=2)
    out = np.clip(out, 0, 1)
    oa = out[..., 3:4]
    colour = np.where(oa > 1e-3, np.clip(out[..., :3] / np.maximum(oa, 1e-3), 0, 1), 0)
    return np.concatenate([colour, oa], axis=2).astype(np.float32)


def resize_rgb(rgb: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.clip(np.stack([_resize_channel(rgb[..., c], w, h) for c in range(rgb.shape[2])], axis=2), 0, 1)


def bbox(mask: np.ndarray) -> tuple[slice, slice] | None:
    rows = np.flatnonzero(mask.any(axis=1))
    cols = np.flatnonzero(mask.any(axis=0))
    if len(rows) == 0 or len(cols) == 0:
        return None
    return slice(int(rows[0]), int(rows[-1]) + 1), slice(int(cols[0]), int(cols[-1]) + 1)


def border(a: np.ndarray, share: float = 0.02) -> np.ndarray:
    """The pixels of a picture's edges, `share` of its size deep (at least two)."""
    h, w = a.shape[:2]
    dy, dx = max(2, round(h * share)), max(2, round(w * share))
    return np.concatenate([a[:dy].reshape(-1, a.shape[2]), a[-dy:].reshape(-1, a.shape[2]), a[:, :dx].reshape(-1, a.shape[2]), a[:, -dx:].reshape(-1, a.shape[2])])


@dataclass
class Keyed:
    rgba: np.ndarray
    how: str
    warnings: list[str] = field(default_factory=list)


def remove_background(rgba: np.ndarray) -> Keyed:
    """The picture with its background taken out: a picture already see-through is kept as it is; otherwise its edges
    must be one flat colour (the prompts ask for pure magenta, #FF00FF), keyed out by its distance from that colour,
    and the half-covered edge pixels have the key's colour taken out of them again."""
    alpha = rgba[..., 3]
    edge = border(rgba)
    if float((alpha < 0.5).mean()) > 0.02 and float((edge[:, 3] < 0.2).mean()) > 0.6:
        return Keyed(rgba, "transparent")
    rgb = edge[:, :3]
    key = np.median(rgb, axis=0)
    near = np.linalg.norm(rgb - key, axis=1) / math.sqrt(3)
    if float((near < 0.12).mean()) < 0.85:
        raise PartError("배경을 지우지 못했습니다: 그림 가장자리가 한 가지 색이 아닙니다. 순수한 마젠타(#FF00FF) 한 색 배경으로 다시 만들어 주세요.")
    warnings = []
    if float(np.abs(key - np.array([1.0, 0.0, 1.0])).max()) > 0.2:
        warnings.append(f"배경이 마젠타가 아니라 #{''.join(f'{round(float(c) * 255):02x}' for c in key)}이어서 그 색을 지웠습니다.")
    dist = np.linalg.norm(rgba[..., :3] - key, axis=2) / math.sqrt(3)
    t0, t1 = 0.10, 0.28
    a = np.clip((dist - t0) / (t1 - t0), 0, 1) * alpha
    # the edge pixels: C = a F + (1 - a) K, so F = (C - (1 - a) K) / a
    safe = np.maximum(a, 1e-3)[..., None]
    fg = np.clip((rgba[..., :3] - (1 - a[..., None]) * key) / safe, 0, 1)
    fg = np.where(a[..., None] > 0.98, rgba[..., :3], fg)
    return Keyed(np.concatenate([fg, a[..., None]], axis=2).astype(np.float32), "key", warnings)


def tint(v: np.ndarray, alpha: np.ndarray, lift: float, white: float, power: float = 1.3) -> np.ndarray:
    """A tint picture (styleArt.ts, build_styles.py's tint): red = v x NOTE_GAIN, the brightest lifted toward white."""
    r = np.clip(v * NOTE_GAIN, 0, 1)
    g = np.clip((v - lift) / (1 - lift), 0, 1) ** power * white
    return np.stack([r, g, np.zeros_like(r), alpha], axis=2).astype(np.float32)


def evened(v: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """The grey of a note brought to the game's: its middle grey (over what it covers) to 0.72, all of the lane colour."""
    solid = alpha > 0.5
    if not solid.any():
        return v
    middle = float(np.median(v[solid]))
    scale = float(np.clip(0.72 / max(middle, 1e-3), 0.8, 1.8))
    return np.clip(v * scale, 0, 1)


def saturation(rgba: np.ndarray) -> float:
    rgb, a = rgba[..., :3], rgba[..., 3]
    s = rgb.max(axis=2) - rgb.min(axis=2)
    w = a * luma(rgb)
    return float((s * w).sum() / max(float(w.sum()), 1e-6))


def seamless_rows(a: np.ndarray, length: int, overlap: int) -> np.ndarray:
    """`length` rows of `a` that repeat without a seam: its last `overlap` rows are blended into its first."""
    body = a[: length + overlap].copy()
    t = np.linspace(0, 1, overlap, dtype=np.float32)[:, None, None]
    body[:overlap] = body[:overlap] * t + body[length : length + overlap] * (1 - t)
    return body[:length]


def to_png(rgba: np.ndarray, path: Path) -> None:
    from PIL import Image

    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(np.rint(rgba * 255), 0, 255).astype(np.uint8), "RGBA").save(path, optimize=True)


def to_webp(rgb: np.ndarray, path: Path, quality: int = 90) -> None:
    from PIL import Image

    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(np.rint(rgb * 255), 0, 255).astype(np.uint8), "RGB").save(path, "WEBP", quality=quality, method=4)


# ---------- the parts ----------


@dataclass
class Tap:
    """A tap note cut out and brought to the game's size: its grey and how much it covers, NOTE_W x NOTE_H."""

    v: np.ndarray
    alpha: np.ndarray
    warnings: list[str]


def cut_tap(rgba: np.ndarray) -> Tap:
    keyed = remove_background(rgba)
    box = bbox(keyed.rgba[..., 3] > 0.05)
    if box is None:
        raise PartError("그림에서 노트를 찾지 못했습니다(비어 있음).")
    part = keyed.rgba[box]
    h, w = part.shape[:2]
    if w < 256 or h < 32:
        raise PartError(f"노트가 너무 작습니다 ({w}×{h}, 폭 256 이상).")
    aspect = w / h
    if not 2.5 <= aspect <= 10:
        raise PartError(f"노트의 비율이 맞지 않습니다: 가로로 긴 막대(약 4:1)여야 하는데 {aspect:.1f}:1입니다.")
    warnings = list(keyed.warnings)
    if saturation(part) > 0.25:
        warnings.append("노트의 색은 쓰지 않고 밝기만 씁니다(레인 색이 입혀짐). 회색 · 흰색으로 그리면 그린 대로 보입니다.")
    part = resize(part, NOTE_W, NOTE_H)
    alpha = part[..., 3]
    v = evened(luma(part[..., :3]), alpha)
    return Tap(v, alpha, warnings)


def build_note(tap: Tap) -> np.ndarray:
    """media/notes/<note>.png's layout: the tap NOTE_W x NOTE_H at NOTE_TOP of a picture NOTE_ROW deep."""
    out = np.zeros((NOTE_ROW, NOTE_W, 4), np.float32)
    out[NOTE_TOP : NOTE_TOP + NOTE_H] = tint(tap.v, tap.alpha, lift=0.74, white=0.8)
    return out


LONG_LOOKS = ((0.74, 0.75), (0.6, 0.9))


def long_from_tap(tap: Tap) -> np.ndarray:
    """A long note made from the tap: its body the tap's cross-section, along its length; its end the tap's far half."""
    rows = slice(NOTE_H * 3 // 8, NOTE_H * 5 // 8)
    v_row = tap.v[rows].mean(axis=0, keepdims=True)
    a_row = tap.alpha[rows].min(axis=0, keepdims=True)
    v = _resize_channel(v_row, LONG_W, 1)
    a = np.clip(_resize_channel(a_row, LONG_W, 1), 0, 1)
    body_v, body_a = np.repeat(v, LONG_TILE, axis=0), np.repeat(a, LONG_TILE, axis=0)
    half = slice(0, NOTE_H // 2)
    end = resize(np.stack([tap.v[half]] * 3 + [tap.alpha[half]], axis=2), LONG_W, LONG_END)
    out = np.zeros((256, 512, 4), np.float32)
    for i, (lift, white) in enumerate(LONG_LOOKS):
        out[:, i * LONG_W : (i + 1) * LONG_W] = tint(body_v, body_a, lift, white)
        out[:LONG_END, 256 + i * LONG_W : 256 + (i + 1) * LONG_W] = tint(end[..., 0], end[..., 3], lift, white)
    return out


def build_long(rgba: np.ndarray) -> tuple[np.ndarray, list[str]]:
    """A long note from its own picture: an upright rail (a lying one is turned up), LONG_W wide; its middle a tile that
    repeats without a seam, its end the rail's top."""
    keyed = remove_background(rgba)
    box = bbox(keyed.rgba[..., 3] > 0.05)
    if box is None:
        raise PartError("그림에서 롱노트를 찾지 못했습니다(비어 있음).")
    part = keyed.rgba[box]
    warnings = list(keyed.warnings)
    if part.shape[1] > part.shape[0] * 1.5:
        part = np.ascontiguousarray(np.rot90(part, -1))
        warnings.append("가로로 누운 그림이라 세워서 썼습니다.")
    h, w = part.shape[:2]
    if w < 48:
        raise PartError(f"롱노트가 너무 가늡니다 ({w} px 폭, 48 이상).")
    rows = round(h * LONG_W / w)
    blend = LONG_W // 8
    if rows < LONG_W + blend + 2 * LONG_END:
        raise PartError(f"롱노트가 너무 짧습니다: 폭의 2배 이상 세로로 길어야 하는데 {h / w:.1f}배입니다.")
    part = resize(part, LONG_W, rows)
    if saturation(part) > 0.25:
        warnings.append("롱노트의 색은 쓰지 않고 밝기만 씁니다(레인 색이 입혀짐).")
    alpha = part[..., 3]
    v = evened(luma(part[..., :3]), alpha)
    out = np.zeros((256, 512, 4), np.float32)
    y0 = rows // 2 - LONG_W // 2
    for i, (lift, white) in enumerate(LONG_LOOKS):
        t = tint(v, alpha, lift, white)
        body = seamless_rows(t[y0 : y0 + LONG_W + blend], LONG_W, blend)
        out[:, i * LONG_W : (i + 1) * LONG_W] = resize(body, LONG_W, LONG_TILE)
        out[:LONG_END, 256 + i * LONG_W : 256 + (i + 1) * LONG_W] = t[:LONG_END]
    return out, warnings


def build_panel(rgba: np.ndarray) -> tuple[np.ndarray, list[str]]:
    """The panel, PANEL_W x PANEL_H: what is see-through laid on black, cropped about its middle to the panel's proportions."""
    rgb = rgba[..., :3] * rgba[..., 3:4]
    h, w = rgb.shape[:2]
    target = PANEL_W / PANEL_H
    aspect = w / h
    warnings: list[str] = []
    if abs(math.log(aspect / target)) > math.log(1.6):
        raise PartError(f"받침 그림의 비율이 맞지 않습니다: 밑그림처럼 약 21:9(2.34:1)여야 하는데 {aspect:.2f}:1입니다.")
    if aspect < target / 1.02:
        keep = round(w / target)
        top = (h - keep) // 2
        rgb = rgb[top : top + keep]
        warnings.append("밑그림보다 세로로 길어서 위아래를 잘랐습니다.")
    elif aspect > target * 1.02:
        keep = round(h * target)
        left = (w - keep) // 2
        rgb = rgb[:, left : left + keep]
        warnings.append("밑그림보다 가로로 길어서 양옆을 잘랐습니다.")
    if rgb.shape[1] < 768:
        raise PartError(f"받침 그림이 너무 작습니다 ({rgb.shape[1]} px 폭, 768 이상).")
    if rgb.shape[1] < 1536:
        warnings.append("받침 그림이 작아서 흐릿하게 보일 수 있습니다(폭 2048 권장).")
    return resize_rgb(rgb, PANEL_W, PANEL_H), warnings


# ---------- hits ----------


def light_of(rgba: np.ndarray) -> np.ndarray:
    """A hit's picture as light on black: what is see-through laid on black, the black's own noise cleared."""
    rgb = rgba[..., :3] * rgba[..., 3:4]
    return np.clip((rgb - 0.03) / 0.97, 0, 1)


def cut_light(rgba: np.ndarray) -> tuple[np.ndarray, bool]:
    """The light of a hit's picture, cut out square about its middle (its edges faded), and whether it is white light
    (no colour of its own: the game gives it the lane's)."""
    rgb = light_of(rgba)
    edge = border(np.concatenate([rgb, np.ones_like(rgb[..., :1])], axis=2), 0.03)[:, :3]
    if float(luma(edge).mean()) > 0.08:
        raise PartError("타격 효과의 배경이 검정이 아닙니다: 순수한 검정(#000000) 배경으로 다시 만들어 주세요(효과는 빛으로 더해져 검정이 곧 투명입니다).")
    box = bbox(luma(rgb) > 0.04)
    if box is None:
        raise PartError("타격 효과 그림이 비어 있습니다.")
    ys, xs = box
    size = max(ys.stop - ys.start, xs.stop - xs.start)
    if size < 96:
        raise PartError(f"타격 효과가 너무 작습니다 ({size} px, 96 이상).")
    cy, cx = (ys.start + ys.stop) / 2, (xs.start + xs.stop) / 2
    half = size / 2 * 1.04
    h, w = rgb.shape[:2]
    out = np.zeros((math.ceil(2 * half), math.ceil(2 * half), 3), np.float32)
    y0, x0 = round(cy - half), round(cx - half)
    sy, sx = slice(max(0, y0), min(h, y0 + out.shape[0])), slice(max(0, x0), min(w, x0 + out.shape[1]))
    out[sy.start - y0 : sy.stop - y0, sx.start - x0 : sx.stop - x0] = rgb[sy, sx]
    # a round fade at the edges, so no frame ends in a straight cut
    n = out.shape[0]
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.hypot(yy - (n - 1) / 2, xx - (n - 1) / 2) / (n / 2)
    out *= np.clip((1.0 - r) / 0.12, 0, 1)[..., None]
    return out, light_saturation(out) < 0.08


def light_saturation(rgb: np.ndarray) -> float:
    return saturation(np.concatenate([rgb, np.ones_like(rgb[..., :1])], axis=2))


def place(cell: int, light: np.ndarray, scale: float, angle: float, gain: float, thin: float = 1.0) -> np.ndarray:
    """One frame: `light` turned `angle` degrees, `scale` of the cell across, at `gain`, its dim parts thinned (`thin` > 1)."""
    from PIL import Image

    size = max(2, round(cell * scale))
    chans = []
    for c in range(3):
        im = Image.fromarray(light[..., c], "F").resize((size, size), Image.LANCZOS)
        if angle:
            im = im.rotate(angle, resample=Image.BICUBIC)
        chans.append(np.asarray(im, np.float32))
    sprite = np.clip(np.stack(chans, axis=2), 0, 1)
    if thin != 1.0:
        lum = luma(sprite)
        sprite = sprite * (np.clip(lum, 1e-4, 1) ** (thin - 1))[..., None]
    frame = np.zeros((cell, cell, 3), np.float32)
    o = (cell - size) // 2
    if o >= 0:
        frame[o : o + size, o : o + size] = sprite
    else:
        frame[:] = sprite[-o : -o + cell, -o : -o + cell]
    return np.clip(frame * gain, 0, 1)


def sheet(frames: list[np.ndarray], cell: int) -> np.ndarray:
    out = np.zeros((cell * 4, cell * 4, 3), np.float32)
    for i, f in enumerate(frames[:16]):
        out[(i // 4) * cell : (i // 4 + 1) * cell, (i % 4) * cell : (i % 4 + 1) * cell] = f
    return out


def burst_frames(light: np.ndarray) -> list[np.ndarray]:
    """A hit played once from one picture: whole and at its brightest in its first frame, then it spreads (to 1.35 of
    its size), turns a little and fades, its dim parts going first."""
    frames = []
    for i in range(BURST_FRAMES):
        t = i / (BURST_FRAMES - 1)
        grow = 1 - (1 - t) ** 2
        gain = 1.0 if i == 0 else (1 - t) ** 1.4
        frames.append(place(BURST_CELL, light, 0.7 * (1 + 0.35 * grow), 8 * grow, gain, thin=1 + 1.5 * t))
    return frames


def hold_frames(light: np.ndarray) -> list[np.ndarray]:
    """The light while a long note is held, from one picture: a loop that breathes and sways, its last frame running on into its first."""
    frames = []
    for k in range(HOLD_FRAMES):
        p = 2 * math.pi * k / HOLD_FRAMES
        frames.append(place(HOLD_CELL, light, 0.62 * (1 + 0.07 * math.sin(p)), 6 * math.sin(p), 0.8 + 0.15 * math.sin(p + 0.6)))
    return frames


def frame_light(frames: list[np.ndarray]) -> list[float]:
    return [float(luma(f).mean()) for f in frames]


def start_frame(light: list[float]) -> int:
    top = max(light)
    return 0 if top <= 0 else next(i for i, x in enumerate(light) if x >= NEAR_PEAK * top)


def frame_tone(frame: np.ndarray) -> str:
    """The colour of a frame's light (flipbook_light.py's frame_tone): weighted by its light and how coloured it is."""
    lum = luma(frame)
    spread = frame.max(axis=2) - frame.min(axis=2)
    weight = lum * spread
    if float(weight.sum()) <= 0:
        return "#ffffff"
    mean = (frame * weight[..., None]).sum(axis=(0, 1)) / float(weight.sum())
    mean = mean / max(float(mean.max()), 1e-6)
    return "#" + "".join(f"{int(round(float(np.clip(c, 0, 1)) * 255)):02x}" for c in mean)


def cells_of(rgba: np.ndarray) -> list[np.ndarray]:
    """The 16 frames of a 4 x 4 sheet, BURST_CELL square each."""
    h, w = rgba.shape[:2]
    if abs(math.log(w / h)) > math.log(1.1):
        raise PartError(f"4×4 시트는 정사각형이어야 합니다 ({w}×{h}).")
    if w < 512:
        raise PartError(f"4×4 시트가 너무 작습니다 ({w} px, 512 이상).")
    rgb = resize_rgb(light_of(rgba), BURST_CELL * 4, BURST_CELL * 4)
    return [rgb[(i // 4) * BURST_CELL : (i // 4 + 1) * BURST_CELL, (i % 4) * BURST_CELL : (i % 4 + 1) * BURST_CELL] for i in range(16)]


def burst_entry(frames: list[np.ndarray], fps: float, peak: int, plain: bool) -> dict:
    entry: dict[str, Any] = {
        "size": [BURST_CELL * 4, BURST_CELL * 4],
        "flipbook": {"cols": 4, "rows": 4, "frames": len(frames), "fps": round(fps, 2), "loop": False, "peak": peak},
        "anchorY": 0.5,
        "span": 1.0,
    }
    if plain:
        entry["plain"] = True
        entry["tone"] = frame_tone(frames[peak])
    return entry


def build_sheet(rgba: np.ndarray) -> tuple[list[np.ndarray], int, float, list[str]]:
    """A 4 x 4 sheet played as it is: its frames up to its last lit one, from the first about as bright as its brightest,
    as many a second as end it BURST_SECONDS after that."""
    cells = cells_of(rgba)
    light = frame_light(cells)
    top = max(light)
    if top <= 0.002:
        raise PartError("4×4 시트가 비어 있습니다.")
    last = max(i for i, x in enumerate(light) if x > 0.02 * top)
    frames = cells[: last + 1]
    if len(frames) < 3:
        raise PartError("4×4 시트에 그림이 있는 칸이 셋보다 적습니다.")
    peak = start_frame(light[: last + 1])
    fps = float(np.clip((len(frames) - peak) / BURST_SECONDS, 12, 60))
    warnings = []
    if peak > 0:
        warnings.append(f"{peak + 1}번째 칸이 가장 밝아서 그 칸부터 틉니다.")
    return frames, peak, fps, warnings


# ---------- packs ----------


@dataclass
class Built:
    """What a part of a pack is: its built files (the game's ids and manifest entries), or why it cannot be used."""

    status: str  # "ok" | "error" | "missing"
    message: str = ""
    warnings: list[str] = field(default_factory=list)
    textures: dict[str, dict] = field(default_factory=dict)

    def json(self) -> dict:
        return {"status": self.status, "message": self.message, "warnings": self.warnings}


def _stamp(path: Path | None) -> str:
    if path is None:
        return "-"
    st = path.stat()
    return f"{path.name}:{st.st_size}:{st.st_mtime_ns}"


def _digest(*parts: str) -> str:
    return hashlib.sha256("|".join([str(VERSION), *parts]).encode("utf-8")).hexdigest()[:16]


class Packs:
    """The packs of a data folder: listed on each call, their parts built once into the cache."""

    def __init__(self, data: Path) -> None:
        self.root = data / "skins"
        self.cache = data / "cache" / "skins"
        self._lock = threading.Lock()

    def ensure_root(self) -> None:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            readme = self.root / "읽어보기.txt"
            if not readme.exists():
                readme.write_text(
                    "이 폴더에 에셋 팩 폴더를 넣으세요. 예: skins\\내 팩\\note.png\n"
                    "이름 규칙: note · long · panel · hit · hit_sheet · hold (.png .webp .jpg), 선택: pack.json\n"
                    "게임의 설정 → 기어 · 노트에서 '프롬프트 복사'로 그림을 만들 프롬프트를 받을 수 있습니다.\n",
                    encoding="utf-8",
                )
        except OSError:
            pass

    def folders(self) -> dict[str, Path]:
        """The packs' folders by name: folders directly in skins/, not links, not hidden."""
        out: dict[str, Path] = {}
        try:
            with os.scandir(self.root) as it:
                for e in sorted(it, key=lambda e: e.name.lower()):
                    if e.name.startswith(".") or e.is_symlink() or not e.is_dir(follow_symlinks=False):
                        continue
                    out[e.name] = Path(e.path)
                    if len(out) >= MAX_PACKS:
                        break
        except OSError:
            pass
        return out

    def list(self) -> list[dict]:
        self.ensure_root()
        with self._lock:
            folders = self.folders()
            self._forget_gone({_safe(name) for name in folders})
            return [self._pack(name, folder) for name, folder in folders.items()]

    def _forget_gone(self, kept: set[str]) -> None:
        """Takes out of the cache what was built for packs whose folder is gone (only the cache's own folders)."""
        import shutil

        try:
            with os.scandir(self.cache) as it:
                gone = [Path(e.path) for e in it if e.name not in kept and not e.is_symlink() and e.is_dir(follow_symlinks=False)]
        except OSError:
            return
        for path in gone:
            shutil.rmtree(path, ignore_errors=True)

    def file(self, pack: str, name: str) -> Path | None:
        """A built file of a pack, where the pack is one of the folders and the name one of FILES'."""
        if name not in FILES.values() or pack not in self.folders():
            return None
        path = self.cache / _safe(pack) / name
        return path if path.is_file() else None

    # a pack: its info and each part, from the cache where its sources have not changed
    def _pack(self, name: str, folder: Path) -> dict:
        entries = _entries(folder)
        info = _pack_info(entries.get("pack.json"))
        out_dir = self.cache / _safe(name)
        meta_file = out_dir / "meta.json"
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            meta = {}
        sources = {stem: _source(entries, stem) for stem in SOURCES}
        info_key = json.dumps(info["options"], sort_keys=True)
        keys = {
            "note": _digest("note", _stamp(sources["note"]), _stamp(sources["long"])),
            "panel": _digest("panel", _stamp(sources["panel"])),
            "hit": _digest("hit", _stamp(sources["hit"]), _stamp(sources["hit_sheet"]), _stamp(sources["hold"]), info_key),
        }
        parts: dict[str, dict] = {}
        changed = False
        builders = {"note": self._note, "panel": self._panel, "hit": self._hit}
        for part, key in keys.items():
            kept = meta.get(part)
            if isinstance(kept, dict) and kept.get("key") == key and all((out_dir / FILES[t]).is_file() for t in kept.get("textures", {})):
                parts[part] = kept
                continue
            built = builders[part](sources, out_dir, info["options"])
            parts[part] = {"key": key, **built.json(), "textures": built.textures}
            changed = True
        if changed:
            try:
                out_dir.mkdir(parents=True, exist_ok=True)
                meta_file.write_text(json.dumps(parts, ensure_ascii=False), encoding="utf-8")
            except OSError:
                pass
        for part in parts.values():
            for tex in part.get("textures", {}).values():
                tex["version"] = part["key"]
        return {"id": name, "name": info["name"] or name, "author": info["author"], "problems": info["problems"], "parts": parts}

    def _note(self, sources: dict[str, Path | None], out: Path, _options: dict) -> Built:
        if sources["note"] is None:
            if sources["long"] is not None:
                return Built("error", "롱노트(long)만 있습니다: 단노트 그림(note)이 함께 있어야 합니다.")
            return Built("missing")
        try:
            tap = cut_tap(load_picture(sources["note"]))
            warnings = list(tap.warnings)
            to_png(build_note(tap), out / FILES["note"])
            if sources["long"] is not None:
                try:
                    long, more = build_long(load_picture(sources["long"]))
                    warnings += more
                except PartError as e:
                    long = long_from_tap(tap)
                    warnings.append(f"롱노트 그림을 쓰지 못해 단노트로 만들었습니다: {e}")
            else:
                long = long_from_tap(tap)
            to_png(long, out / FILES["long"])
        except PartError as e:
            return Built("error", str(e))
        return Built(
            "ok",
            warnings=warnings,
            textures={"note": {"size": [NOTE_W, NOTE_ROW]}, "long": {"size": [512, 256]}},
        )

    def _panel(self, sources: dict[str, Path | None], out: Path, _options: dict) -> Built:
        if sources["panel"] is None:
            return Built("missing")
        try:
            rgb, warnings = build_panel(load_picture(sources["panel"]))
            to_webp(rgb, out / FILES["panel"])
        except PartError as e:
            return Built("error", str(e))
        return Built("ok", warnings=warnings, textures={"panel": {"size": [PANEL_W, PANEL_H]}})

    def _hit(self, sources: dict[str, Path | None], out: Path, options: dict) -> Built:
        if sources["hit"] is None and sources["hit_sheet"] is None:
            return Built("missing")
        warnings: list[str] = []
        try:
            light: np.ndarray | None = None
            if sources["hit_sheet"] is not None:
                frames, peak, fps, warnings = build_sheet(load_picture(sources["hit_sheet"]))
                grey = light_saturation(sheet(frames, BURST_CELL)) < 0.08
                if sources["hit"] is not None:
                    light, _ = cut_light(load_picture(sources["hit"]))
            else:
                assert sources["hit"] is not None
                light, grey = cut_light(load_picture(sources["hit"]))
                frames, peak, fps = burst_frames(light), 0, (BURST_FRAMES - 1) / BURST_SECONDS
            colour = options.get("hitColor")
            plain = colour == "own" or (colour != "lane" and not grey)
            if not plain:
                warnings.append("흰빛 효과라 레인 색이 입혀집니다(pack.json의 \"hitColor\": \"own\"이면 그림 색 그대로).")
            if sources["hold"] is not None:
                hold_light, _ = cut_light(load_picture(sources["hold"]))
            else:
                # without a hold picture: the hit's own picture, or a sheet's brightest frame
                hold_light = light if light is not None else frames[peak]
            to_webp(sheet(frames, BURST_CELL), out / FILES["hitBurst"], quality=92)
            to_webp(sheet(hold_frames(hold_light), HOLD_CELL), out / FILES["hitHold"], quality=92)
        except PartError as e:
            return Built("error", str(e))
        burst = burst_entry(frames, fps, peak, plain)
        hold: dict[str, Any] = {
            "size": [HOLD_CELL * 4, HOLD_CELL * 4],
            "flipbook": {"cols": 4, "rows": 4, "frames": HOLD_FRAMES, "fps": HOLD_FPS, "loop": True},
            "anchorY": 0.5,
            "span": 0.8,
            "cored": True,
            **({"plain": True} if plain else {}),
        }
        return Built("ok", warnings=warnings, textures={"hitBurst": burst, "hitHold": hold})


def _safe(name: str) -> str:
    """A pack's name as a folder name of the cache: its own where it is plain, else a digest of it."""
    if name.isascii() and name.replace("-", "").replace("_", "").isalnum() and len(name) <= 48:
        return name
    return "p-" + hashlib.sha256(name.encode("utf-8")).hexdigest()[:20]


def _pack_info(path: Path | None) -> dict:
    """pack.json's name, author and options; what is not one of them, or not of its kind, is left out."""
    info: dict[str, Any] = {"name": "", "author": "", "options": {}, "problems": []}
    if path is None:
        return info
    try:
        if path.stat().st_size > 64 * 1024:
            raise ValueError
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(raw, dict):
            raise ValueError
    except (OSError, ValueError):
        info["problems"].append("pack.json을 읽지 못했습니다(JSON 형식인지 확인해 주세요).")
        return info
    for key in ("name", "author"):
        v = raw.get(key)
        if isinstance(v, str):
            info[key] = " ".join(v.split())[:40]
    if raw.get("hitColor") in ("own", "lane"):
        info["options"]["hitColor"] = raw["hitColor"]
    return info


# ---------- layout templates ----------


def template(kind: str) -> bytes:
    """The layout template a player sends with a prompt (docs/CUSTOM_ASSETS.md), as PNG bytes.

    panel: the panel's proportions (2048 x 876): its far edge (a cyan line) is where it meets the row of keys; above the
    dashed amber line lies what the default camera shows (the far 45 %); the faint middle line is the track's middle.
    note: a tap's proportions on magenta: its two ends and its middle (light) keep their look, the rest (darker) is
    stretched to the lane."""
    import io

    from PIL import Image, ImageDraw

    if kind == "panel":
        im = Image.new("RGB", (PANEL_W, PANEL_H), (42, 45, 52))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, PANEL_W - 1, 10], fill=(57, 212, 255))
        y = round(PANEL_H * 0.45)
        for x in range(0, PANEL_W, 48):
            d.rectangle([x, y - 3, x + 28, y + 3], fill=(255, 190, 60))
        d.rectangle([PANEL_W // 2 - 2, 10, PANEL_W // 2 + 2, PANEL_H - 1], fill=(70, 74, 84))
        d.rectangle([0, 0, PANEL_W - 1, PANEL_H - 1], outline=(110, 116, 128), width=4)
    elif kind == "note":
        im = Image.new("RGB", (1024, 256), (255, 0, 255))
        d = ImageDraw.Draw(im)
        top, bottom = 16, 16 + NOTE_H - 1
        d.rectangle([0, top, 1023, bottom], fill=(120, 120, 120))
        for x0, x1 in ((0, 212), (332, 692), (812, 1023)):
            d.rectangle([x0, top, x1, bottom], fill=(200, 200, 200))
        d.rectangle([0, bottom - 6, 1023, bottom], fill=(255, 255, 255))
    else:
        raise KeyError(kind)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()
