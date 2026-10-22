"""Reading an uploaded chart package (a folder, a .zip or an .osz) into groups of charts.

osu! difficulties that share an audio file become one song; BMS/bmson charts in one folder share
their keysounds and become one song whose audio is rendered from them.
"""

from __future__ import annotations

import hashlib
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from .bms import decode_text, parse_bms
from .bmson import parse_bmson
from .common import FormatError, ParsedChart
from .images import IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, image_stem
from .keysounds import SOUND_EXTENSIONS, SoundIndex
from .osu import parse_osu

CHART_EXTENSIONS = {".osu": "osu", ".bms": "bms", ".bme": "bms", ".bml": "bms", ".pms": "bms", ".bmson": "bmson"}
ARCHIVE_EXTENSIONS = (".zip", ".osz")
# a folder's pictures come only when a chart names them (the client sends those)
IMPORT_EXTENSIONS = frozenset(CHART_EXTENSIONS) | frozenset(SOUND_EXTENSIONS) | frozenset(IMAGE_EXTENSIONS) | frozenset(ARCHIVE_EXTENSIONS)
UNPACKED_EXTENSIONS = frozenset(CHART_EXTENSIONS) | frozenset(SOUND_EXTENSIONS)
MAX_ARCHIVE_BYTES = 4 * 1024**3
MAX_FILES = 20_000


@dataclass
class ChartGroup:
    kind: str  # "audio" (osu!: charts on one audio file) or "keysound" (BMS/bmson)
    base: str  # folder of the charts, relative to the package root
    charts: list[ParsedChart] = field(default_factory=list)
    audio: Path | None = None
    digest: str = ""

    @property
    def title(self) -> str:
        return self.charts[0].title if self.charts else "Untitled"

    @property
    def artist(self) -> str:
        return self.charts[0].artist if self.charts else ""


def safe_relpath(name: str) -> str | None:
    """A relative POSIX path with no way out of the destination folder (or None)."""
    parts = [p for p in PurePosixPath(name.replace("\\", "/")).parts if p not in ("", ".", "/")]
    if not parts or any(p == ".." or ":" in p for p in parts):
        return None
    return "/".join(parts)


def _member_name(info: zipfile.ZipInfo) -> str:
    """Zip names without the UTF-8 flag are stored in the creator's code page (cp932 for most
    BMS packages); decode them the way the chart files are decoded."""
    if info.flag_bits & 0x800:
        return info.filename
    try:
        raw = info.filename.encode("cp437")
    except UnicodeEncodeError:
        return info.filename
    return decode_text(raw)


def extract_archive(path: Path, dest: Path) -> list[str]:
    """Extract the chart and sound files of a .zip/.osz (its pictures wait for extract_images);
    returns warnings."""
    warnings: list[str] = []
    with zipfile.ZipFile(path) as zf:
        members = [m for m in zf.infolist() if not m.is_dir()]
        if len(members) > MAX_FILES:
            raise FormatError(f"압축 파일 안의 파일이 너무 많습니다 (최대 {MAX_FILES}개)")
        if sum(m.file_size for m in members) > MAX_ARCHIVE_BYTES:
            raise FormatError("압축을 풀면 너무 큽니다 (최대 4GB)")
        for m in members:
            rel = safe_relpath(_member_name(m))
            if rel is None:
                warnings.append(f"건너뛴 경로: {m.filename}")
                continue
            if PurePosixPath(rel).suffix.lower() not in UNPACKED_EXTENSIONS:
                continue
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(m) as src, open(target, "wb") as out:
                while chunk := src.read(1 << 20):
                    out.write(chunk)
    return warnings


def extract_images(path: Path, dest: Path, root: Path, wanted: set[str]) -> None:
    """Extract the pictures of a .zip/.osz (unpacked into `dest` under the package's `root`) that
    its charts name: `wanted` holds their image_stem from the root. The rest (a BMS's video
    frames) stays packed."""
    prefix = dest.relative_to(root).as_posix()
    with zipfile.ZipFile(path) as zf:
        for m in zf.infolist():
            rel = safe_relpath(_member_name(m))
            if m.is_dir() or rel is None or PurePosixPath(rel).suffix.lower() not in IMAGE_EXTENSIONS or m.file_size > MAX_IMAGE_BYTES:
                continue
            if image_stem(rel if prefix in ("", ".") else f"{prefix}/{rel}") not in wanted:
                continue
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(m) as src, open(target, "wb") as out:
                out.write(src.read(MAX_IMAGE_BYTES))


def scan_package(root: Path) -> tuple[list[ChartGroup], list[str]]:
    """Parse every chart file under `root` and group them into songs."""
    warnings: list[str] = []
    sounds = SoundIndex(root)
    groups: dict[tuple[str, str], ChartGroup] = {}
    hashes: dict[tuple[str, str], hashlib._Hash] = {}
    for path in sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in CHART_EXTENSIONS):
        rel = path.relative_to(root).as_posix()
        base = path.parent.relative_to(root).as_posix()
        base = "" if base == "." else base
        data = path.read_bytes()
        fmt = CHART_EXTENSIONS[path.suffix.lower()]
        try:
            if fmt == "osu":
                parsed = parse_osu(data.decode("utf-8-sig", errors="replace"), path.name)
            elif fmt == "bms":
                parsed = parse_bms(data, path.name, seed=int(hashlib.sha256(data).hexdigest()[:8], 16))
            else:
                parsed = parse_bmson(data, path.name)
        except FormatError as e:
            warnings.append(f"{rel}: {e}")
            continue
        except Exception as e:  # malformed files must not abort the rest of the package
            warnings.append(f"{rel}: 읽지 못했습니다 ({e})")
            continue
        if parsed.dropped:
            warnings.append(f"{rel}: 겹친 노트 {parsed.dropped}개를 뺐습니다")
        if fmt == "osu":
            audio = sounds.find(parsed.audio_file or "", base) if parsed.audio_file else None
            if audio is None:
                warnings.append(f"{rel}: 음원 파일({parsed.audio_file})이 없습니다")
                continue
            key = ("audio", audio.relative_to(root).as_posix().lower())
            group = groups.setdefault(key, ChartGroup(kind="audio", base=base, audio=audio))
        else:
            key = ("keysound", base.lower())
            group = groups.setdefault(key, ChartGroup(kind="keysound", base=base))
        group.charts.append(parsed)
        h = hashes.setdefault(key, hashlib.sha256())
        h.update(rel.lower().encode() + b"\0" + data)
    for key, group in groups.items():
        group.digest = hashes[key].hexdigest()
    return list(groups.values()), warnings
