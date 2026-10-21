"""Pictures of chart packages (BMS #STAGEFILE / #BANNER, the osu! background) and song covers."""

from __future__ import annotations

from pathlib import Path

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp")
MEDIA_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".bmp": "image/bmp", ".webp": "image/webp"}
MAX_IMAGE_BYTES = 20 * 1024 * 1024


def image_kind(data: bytes) -> str | None:
    """The extension of a picture by its first bytes (whatever its name says), or None."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data.startswith(b"BM") and len(data) > 26:
        return ".bmp"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def image_stem(path: str) -> str:
    """A picture's path as charts name it, matched whatever its case and extension: BMS often
    names a .bmp that ships as a .png."""
    rel = path.replace("\\", "/").lower().lstrip("./")
    return rel.rsplit(".", 1)[0] if "." in rel.rsplit("/", 1)[-1] else rel


class ImageIndex:
    """The pictures under a package's folder by `image_stem` of their path."""

    def __init__(self, root: Path):
        self.stems: dict[str, Path] = {}
        for p in sorted(root.rglob("*")):
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
                self.stems.setdefault(image_stem(p.relative_to(root).as_posix()), p)

    def find(self, name: str, base: str) -> Path | None:
        return self.stems.get(image_stem(f"{base}/{name}" if base else name))

