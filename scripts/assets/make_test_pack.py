"""Writes asset packs drawn in code (docs/CUSTOM_ASSETS.md), for trying the player's packs without an image model:

    python scripts/assets/make_test_pack.py <skins folder>

  <folder>/시험 팩/      note.png (a bevelled bar on #FF00FF, as an image model is asked for), long.png (an upright rail
                         with chevrons, on #FF00FF), panel.png (a 3:2 picture, as ChatGPT gives: cropped to the panel),
                         hit.png (a coloured star of light on black), pack.json
  <folder>/broken/       a note on a background that is not one colour, a square panel, a hit on grey: each part says why
  <folder>/sheet-only/   hit_sheet.png: a 4 x 4 sheet whose third frame is its brightest, and a note already see-through

Needs Pillow and numpy.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

MAGENTA = (255, 0, 255)


def note(path: Path, background=MAGENTA, noisy=False) -> None:
    im = Image.new("RGB", (1536, 512), background)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = 120, 180, 1416, 340
    d.rounded_rectangle([x0, y0, x1, y1], radius=28, fill=(150, 150, 150))
    d.rounded_rectangle([x0 + 10, y0 + 10, x1 - 10, y1 - 40], radius=22, fill=(185, 185, 185))
    d.rectangle([x0 + 24, y1 - 22, x1 - 24, y1 - 12], fill=(255, 255, 255))
    # a mark in its middle and a notch at each end
    d.ellipse([768 - 34, 220, 768 + 34, 288], fill=(235, 235, 235))
    for x in (x0 + 60, x1 - 60):
        d.rectangle([x - 8, y0 + 24, x + 8, y1 - 50], fill=(110, 110, 110))
    if noisy:
        a = np.asarray(im).astype(np.int16)
        a[:, :300] = (40, 200, 90)
        im = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    im.save(path)


def long_rail(path: Path) -> None:
    im = Image.new("RGB", (512, 1536), MAGENTA)
    d = ImageDraw.Draw(im)
    x0, x1 = 176, 336
    d.rounded_rectangle([x0, 60, x1, 1476], radius=20, fill=(160, 160, 160))
    d.rectangle([x0 + 14, 80, x0 + 22, 1456], fill=(240, 240, 240))
    d.rectangle([x1 - 22, 80, x1 - 14, 1456], fill=(240, 240, 240))
    for y in range(200, 1400, 160):
        d.line([(x0 + 40, y), (256, y + 50), (x1 - 40, y)], fill=(225, 225, 225), width=14)
    im.save(path)


def panel(path: Path, size=(1536, 1024)) -> None:
    w, h = size
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    base = np.stack([20 + 30 * y / h, 30 + 20 * x / w, 60 + 50 * (1 - y / h)], axis=2)
    rings = (np.sin(np.hypot(x - w / 2, y - h * 0.45) / 18) > 0.85) * 60
    base[..., 1] += rings
    base[..., 2] += rings * 1.4
    im = Image.fromarray(base.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.rectangle([0, h * 0.18, w, h * 0.18 + 10], fill=(255, 120, 200))
    d.ellipse([w / 2 - 90, h * 0.45 - 90, w / 2 + 90, h * 0.45 + 90], outline=(255, 230, 120), width=12)
    im.save(path)


def star(size: int, colour: tuple[float, float, float], points: int = 8) -> np.ndarray:
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    c = (size - 1) / 2
    r = np.hypot(x - c, y - c) / (size / 2)
    t = np.arctan2(y - c, x - c)
    rays = np.clip(np.cos(t * points / 2) ** 40, 0, 1) * np.clip(1 - r, 0, 1) ** 1.5
    core = np.exp(-(r / 0.12) ** 2)
    ring = np.exp(-((r - 0.55) / 0.04) ** 2) * 0.7
    light = np.clip(rays + core + ring, 0, 1)
    rgb = np.stack([light * colour[0], light * colour[1], light * colour[2]], axis=2)
    rgb = rgb + core[..., None] * 0.6
    return np.clip(rgb, 0, 1)


def hit(path: Path, background=(0, 0, 0)) -> None:
    rgb = star(900, (1.0, 0.55, 0.2))
    im = np.zeros((1024, 1024, 3), np.float32) + np.array(background, np.float32) / 255
    im[62:962, 62:962] = np.clip(im[62:962, 62:962] + rgb, 0, 1)
    Image.fromarray((im * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)).save(path)


def sheet(path: Path) -> None:
    cell = 256
    out = np.zeros((cell * 4, cell * 4, 3), np.float32)
    for i in range(12):
        k = 0.5 + 0.5 * min(i, 2) / 2 if i <= 2 else max(0.0, 1 - (i - 2) / 9)
        s = star(cell, (0.4, 0.8, 1.0), 6) * k
        out[(i // 4) * cell : (i // 4 + 1) * cell, (i % 4) * cell : (i % 4 + 1) * cell] = s
    Image.fromarray((out * 255).astype(np.uint8)).save(path)


def see_through_note(path: Path) -> None:
    im = Image.new("RGBA", (1200, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([40, 60, 1160, 240], radius=40, fill=(210, 210, 210, 255))
    d.rectangle([80, 210, 1120, 226], fill=(255, 255, 255, 255))
    im.save(path)


def main() -> None:
    root = Path(sys.argv[1])
    a = root / "시험 팩"
    a.mkdir(parents=True, exist_ok=True)
    note(a / "note.png")
    long_rail(a / "long.png")
    panel(a / "panel.png")
    hit(a / "hit.png")
    (a / "pack.json").write_text(json.dumps({"name": "시험 팩", "author": "코드"}, ensure_ascii=False), encoding="utf-8")
    b = root / "broken"
    b.mkdir(parents=True, exist_ok=True)
    note(b / "note.png", noisy=True)
    panel(b / "panel.png", (1024, 1024))
    hit(b / "hit.jpg", background=(120, 120, 120))
    c = root / "sheet-only"
    c.mkdir(parents=True, exist_ok=True)
    sheet(c / "hit_sheet.png")
    see_through_note(c / "note.webp")
    print("wrote", a, b, c)


if __name__ == "__main__":
    main()
