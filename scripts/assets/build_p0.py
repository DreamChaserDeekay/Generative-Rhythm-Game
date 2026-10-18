"""Builds the P0 game textures and flipbooks from assets-src/ into client/public/media/.

    python scripts/assets/build_p0.py

Inputs are the untouched generations in assets-src/ (where each came from: assets-src/PROVENANCE.md)
and the values in scripts/assets/p0_recipe.json. The skins/ and fx/ folders of the output and the
"textures" part of manifest.json are rewritten from scratch, so they can always be regenerated.
Needs Pillow, numpy, scipy and ffmpeg (on PATH).

Every texture is greyscale: the game multiplies it by the skin colour. Notes and long note bodies
carry their shape in an alpha channel; the light textures (judgement line, rails, key beam, hit
effects) are drawn additively, so black is transparent and they need none.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src"
RECIPE = Path(__file__).with_name("p0_recipe.json")


def gray(path: Path) -> np.ndarray:
    """Luminance as float32 in 0..1."""
    return np.asarray(Image.open(path).convert("L"), dtype=np.float32) / 255


def to_image(a: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(np.rint(a * 255), 0, 255).astype(np.uint8), "L")


def resize(a: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.asarray(to_image(a).resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def resize_wrapped(a: np.ndarray, w: int, h: int, rows: bool = False, cols: bool = False) -> np.ndarray:
    """Resizes a tiling image: wraps it around before filtering so its edges still meet afterwards."""
    py = a.shape[0] // 8 if rows else 0
    px = a.shape[1] // 8 if cols else 0
    sy, sx = h / a.shape[0], w / a.shape[1]
    big = resize(np.pad(a, ((py, py), (px, px)), mode="wrap"), round((a.shape[1] + 2 * px) * sx), round((a.shape[0] + 2 * py) * sy))
    oy, ox = round(py * sy), round(px * sx)
    return big[oy:oy + h, ox:ox + w]


def span(profile: np.ndarray, threshold: float, margin: float) -> slice:
    """Where `profile` is above `threshold` × its maximum, widened by `margin` of that length."""
    on = np.where(profile > profile.max() * threshold)[0]
    pad = round((on[-1] - on[0] + 1) * margin)
    return slice(max(0, on[0] - pad), min(len(profile), on[-1] + 1 + pad))


def tile_rows(a: np.ndarray, overlap: int) -> np.ndarray:
    """Crossfades the last `overlap` rows into the first ones, so the image repeats vertically without a seam."""
    keep = a.shape[0] - overlap
    out = a[:keep].copy()
    w = ((np.arange(overlap) + 0.5) / overlap)[:, None]
    out[:overlap] = a[keep:] * (1 - w) + a[:overlap] * w
    return out


def largest_blob(mask: np.ndarray) -> np.ndarray:
    labels, n = ndimage.label(mask)
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    return labels == int(np.argmax(sizes)) + 1


def note_bar(path: Path, cfg: dict[str, Any], lift: float) -> tuple[np.ndarray, np.ndarray]:
    """The note cut out of its black background: luminance and shape mask."""
    a = gray(path)
    shape = ndimage.binary_fill_holes(largest_blob(a > cfg["alphaThreshold"]))
    ys, xs = np.where(shape)
    box = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    bar, mask = a[box], shape[box].astype(np.float32)
    if lift:
        # a clear top face reads hollow once tinted: lift the inside of the bar, keep its edges and glints
        inside = ndimage.binary_fill_holes(bar > cfg["liftThreshold"])
        bar = np.where(inside, np.maximum(bar, lift + (1 - lift) * bar * 0.6), bar)
    return bar, mask


def nine_slice(a: np.ndarray, w: int, h: int, cap_ratio: float) -> np.ndarray:
    """Scales to height `h` and fits the width by stretching only the middle: the ends (h × cap_ratio) keep their shape."""
    sw = max(1, round(a.shape[1] * h / a.shape[0]))
    scaled = resize(a, sw, h)
    cap = min(round(h * cap_ratio), (sw - 2) // 2, (w - 2) // 2)
    middle = resize(scaled[:, cap:sw - cap], w - 2 * cap, h)
    return np.concatenate([scaled[:, :cap], middle, scaled[:, sw - cap:]], axis=1)


def add_streaks(lum: np.ndarray, mask: np.ndarray, strength: float) -> np.ndarray:
    """Three faint diagonal streaks across the bar: tells a scratch note apart from a tap note."""
    h, w = lum.shape
    img = Image.new("L", (w, h))
    draw = ImageDraw.Draw(img)
    for k in (-1, 0, 1):
        cx = w / 2 + k * w * 0.16
        draw.line([(cx - h * 0.35, h * 0.85), (cx + h * 0.35, h * 0.15)], fill=255, width=max(2, h // 22))
    lines = np.asarray(img.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255
    inside = np.clip((lum - 40 / 255) / (120 / 255), 0, 1) * mask
    return np.clip(lum + lines * strength * inside, 0, 1)


def bleed(lum: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Copies the nearest opaque value into transparent pixels, so texture filtering does not darken the edges."""
    clear = alpha < 0.5
    if not clear.any() or clear.all():
        return lum
    _, (iy, ix) = ndimage.distance_transform_edt(clear, return_indices=True)
    return np.where(clear, lum[iy, ix], lum)


def save_gray(path: Path, lum: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    to_image(lum).save(path, optimize=True)


def save_gray_alpha(path: Path, lum: np.ndarray, alpha: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.merge("LA", (to_image(bleed(lum, alpha)), to_image(alpha))).save(path, optimize=True)


def notes(src: Path, cfg: dict[str, Any], lift: float) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    bar, mask = note_bar(src, cfg, lift)
    out = {}
    for kind in ("tap", "side", "scratch"):
        w, h = cfg[kind]
        lum = nine_slice(bar, w, h, cfg["capRatio"])
        alpha = np.clip(nine_slice(mask, w, h, cfg["capRatio"]), 0, 1)
        if kind == "scratch":
            lum = add_streaks(lum, alpha, cfg["scratchStreaks"])
        out[kind] = (lum, alpha)
    return out


def long_body(src: Path, cfg: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, float]:
    """The band, seamless along its length; alpha follows brightness so its dim middle stays see-through."""
    a = gray(src)
    a = tile_rows(a[:, span(a.mean(0), cfg["columnThreshold"], cfg["margin"])], cfg["seamRows"])
    w, h = cfg["size"]
    lum = resize_wrapped(a, w, h, rows=True)
    return lum, np.clip(lum * cfg["alphaGain"], 0, 1), a.shape[0] / a.shape[1]


def judge_line(src: Path, cfg: dict[str, Any]) -> np.ndarray:
    a = gray(src)
    w, h = cfg["size"]
    return resize(a[span(a.mean(1), cfg["rowThreshold"], cfg["margin"]), :], w, h)


def rail(src: Path, cfg: dict[str, Any]) -> tuple[np.ndarray, float]:
    a = gray(src)
    a = tile_rows(a[:, span(a.mean(0), cfg["columnThreshold"], cfg["margin"])], cfg["seamRows"])
    w, h = cfg["size"]
    return resize_wrapped(a, w, h, rows=True), a.shape[0] / a.shape[1]


def floor(src: Path, cfg: dict[str, Any]) -> tuple[np.ndarray, float]:
    """Seamless both ways, pattern softened to `contrast` around a mean of `mean` (the game multiplies by 1 / mean)."""
    a = tile_rows(tile_rows(gray(src), cfg["seam"]).T, cfg["seam"]).T
    w, h = cfg["size"]
    f = resize_wrapped(a, w, h, rows=True, cols=True)
    out = np.clip(cfg["mean"] * (1 + cfg["contrast"] * (f / max(float(f.mean()), 1e-3) - 1)), 0, 1)
    return out, 1 / float(np.rint(out * 255).mean() / 255)


def key_beam(src: Path, cfg: dict[str, Any]) -> np.ndarray:
    a = gray(src)
    w, h = cfg["size"]
    return resize(a[:, span(a.mean(0), cfg["columnThreshold"], cfg["margin"])], w, h)


def video_fps(path: Path) -> float:
    rate = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    num, _, den = rate.partition("/")
    return float(num) / float(den or 1)


def video_frames(path: Path) -> list[np.ndarray]:
    """Every frame, cropped to the centred square."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vf", "crop=ih:ih:(iw-ih)/2:0", str(Path(tmp) / "f_%04d.png")], check=True)
        return [gray(p) for p in sorted(Path(tmp).glob("f_*.png"))]


def edge_mask(size: int) -> np.ndarray:
    """1 in the middle of a cell, 0 at its border: an additive sprite must not show its square."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    r = np.hypot(x - (size - 1) / 2, y - (size - 1) / 2) / size
    t = np.clip((0.5 - r) / (0.5 - 0.40), 0, 1)
    return t * t * (3 - 2 * t)


def flipbook(src: Path, cfg: dict[str, Any], frames: int, grid: int) -> np.ndarray:
    """`frames` frames of the video in a grid × grid sheet (row by row from the top left)."""
    fps = video_fps(src)
    fr = video_frames(src)
    if cfg.get("loop"):
        # consecutive frames; the last quarter fades into the frames just before the first one
        s = round(cfg["from"] * fps)
        seq = [fr[s + i] for i in range(frames)]
        blend = frames // 4
        for k in range(blend):
            w = (k + 1) / blend
            seq[frames - blend + k] = (1 - w) * fr[s + frames - blend + k] + w * fr[s - blend + k]
    else:
        idx = np.linspace(round(cfg["from"] * fps), round(cfg["to"] * fps), frames).round().astype(int)
        seq = [fr[i] for i in (idx[::-1] if cfg.get("reverse") else idx)]
    cell = cfg["cell"]
    mask = edge_mask(cell)
    black = cfg["black"] / 255
    sheet = np.zeros((cell * grid, cell * grid), np.float32)
    for n, f in enumerate(seq):
        v = np.clip((resize(f, cell, cell) - black) / (1 - black), 0, 1) * mask
        r, c = divmod(n, grid)
        sheet[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = v
    return sheet


def main() -> None:
    recipe = json.loads(RECIPE.read_text(encoding="utf-8"))
    build, look = recipe["build"], recipe["manifest"]
    out = ROOT / recipe["out"]
    for sub in ("skins", "fx"):
        shutil.rmtree(out / sub, ignore_errors=True)
    textures: dict[str, dict[str, Any]] = {}

    def add(key: str, file: str, bundle: str, size: tuple[int, int], **params: Any) -> None:
        textures[key] = {"file": file, "bundle": bundle, "size": [int(size[0]), int(size[1])], **params}

    for name, s in recipe["sets"].items():
        base = f"skins/{name}"
        for kind, (lum, alpha) in notes(SRC / s["tap"], build["note"], s["noteLift"]).items():
            file = f"{base}/note_{kind}.png"
            save_gray_alpha(out / file, lum, alpha)
            add(f"{name}/{'note' if kind == 'tap' else kind}", file, "notes", build["note"][kind], **look["note"])
        lum, alpha, aspect = long_body(SRC / s["body"], build["body"])
        save_gray_alpha(out / f"{base}/long_body.png", lum, alpha)
        add(f"{name}/longBody", f"{base}/long_body.png", "notes", build["body"]["size"], tileAspect=round(aspect, 2), **look["longBody"])
        save_gray(out / f"{base}/judge_line.png", judge_line(SRC / s["judge"], build["judge"]))
        add(f"{name}/judgeLine", f"{base}/judge_line.png", "gear", build["judge"]["size"], **look["judgeLine"])
        lum, aspect = rail(SRC / s["rail"], build["rail"])
        save_gray(out / f"{base}/rail.png", lum)
        add(f"{name}/rails", f"{base}/rail.png", "gear", build["rail"]["size"], tileAspect=round(aspect, 2), **look["rails"])
        lum, gain = floor(SRC / s["floor"], build["floor"])
        save_gray(out / f"{base}/floor.png", lum)
        add(f"{name}/floor", f"{base}/floor.png", "gear", build["floor"]["size"], gain=round(gain, 3), **look["floor"])
        print(name, "ok")

    beam = build["keyBeam"]
    save_gray(out / "fx/key_beam.png", key_beam(SRC / beam["src"], beam))
    add("fx/keyBeam", "fx/key_beam.png", "gear", beam["size"], **look["keyBeam"])
    keys = {"hit_burst_ring": "fx/hitBurstRing", "hit_burst_glow": "fx/hitBurstGlow", "hit_hold": "fx/hitHold"}
    for name, cfg in build["flipbooks"].items():
        sheet = flipbook(SRC / cfg["src"], cfg, build["frames"], build["grid"])
        save_gray(out / f"fx/{name}.png", sheet)
        params = dict(look["flipbooks"][name])
        fps = params.pop("fps")
        book = {"cols": build["grid"], "rows": build["grid"], "frames": build["frames"], "fps": fps, "loop": bool(cfg.get("loop"))}
        add(keys[name], f"fx/{name}.png", "effects", sheet.shape[::-1], flipbook=book, **params)
        print(name, "ok")

    path = out / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    manifest.update({"version": 1, "textures": dict(sorted(textures.items())), "effects": look["effects"]})
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum((out / t["file"]).stat().st_size for t in textures.values())
    print(f"{len(textures)} textures, {total / 1e6:.2f} MB -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
