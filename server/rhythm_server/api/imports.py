"""Importing chart packages (osu!mania, BMS, bmson) into the library."""

from __future__ import annotations

import re
import shutil
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import numpy as np

from ..config import SAMPLE_RATE
from ..formats import FormatError, ParsedChart, assemble_chart
from ..formats.images import MAX_IMAGE_BYTES, ImageIndex, image_kind, image_stem
from ..formats.keysounds import SoundIndex, build_sprite, decode_sounds, full_mix, normalizing_gain
from ..formats.package import ChartGroup, scan_package
from .jobs import AnalysisQueue
from .library import Library

# imported charts get our difficulty name from the level we rate them at
DIFFICULTY_BY_LEVEL = ((6, "NORMAL"), (9, "HARD"), (12, "EXPERT"))
DECODE_WORKERS = 4
# "Song [ANOTHER]", "Song (7KEYS HYPER)" … → "Song" for the song entry shared by all difficulties
DIFFICULTY_SUFFIX = re.compile(
    r"\s*[\[\(（【<-]\s*[^\]\)）】>]*\b(BEGINNER|NORMAL|HYPER|ANOTHER|INSANE|LEGGENDARIA|EASY|HARD|LIGHT|EX|SP|[57]KEYS?)\b[^\]\)）】>]*[\]\)）】>]?\s*$",
    re.IGNORECASE,
)


def difficulty_for_level(level: int) -> str:
    for top, name in DIFFICULTY_BY_LEVEL:
        if level <= top:
            return name
    return "MASTER"


def song_title(title: str) -> str:
    return DIFFICULTY_SUFFIX.sub("", title).strip() or title


def source_level(hint: str) -> str | None:
    """The level the file gives its chart (BMS #PLAYLEVEL, bmson's level), as it writes it."""
    text = hint.strip()
    return text[:12] if text and text not in ("0", "?") else None


def _assemble(parsed: ParsedChart, song: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    level = source_level(parsed.level_hint)
    if level is not None:
        extra = {**(extra or {}), "sourceLevel": level}
    chart = assemble_chart(
        key_mode=parsed.key_mode,
        timing=parsed.timing,
        notes=parsed.notes,
        title=song["title"],
        artist=song["artist"],
        song_id=song["id"],
        audio_hash=song["audioHash"],
        difficulty="NORMAL",
        source={"kind": "imported", "format": parsed.format, "file": parsed.source_name},
        duration_ms=song["durationMs"],
        chart_name=parsed.chart_name or Path(parsed.source_name).stem,
        extra_meta=extra,
        sounds=parsed.sounds or None,
        bgm=parsed.bgm or None,
    )
    chart["meta"]["difficulty"] = difficulty_for_level(int(chart["meta"]["level"]))
    return chart


def _audio_group(library: Library, queue: AnalysisQueue, group: ChartGroup) -> dict[str, Any]:
    assert group.audio is not None
    tmp = library.tmp_path(group.audio.suffix.lower())
    shutil.copyfile(group.audio, tmp)
    song, created = library.add_song_file(tmp, group.audio.name)
    if created:
        song = library.update_song(song["id"], title=group.title, artist=group.artist)
    if created or song["status"] == "error":
        queue.submit(song["id"])
        song = library.get_song(song["id"])
    return song


def _keysound_group(library: Library, queue: AnalysisQueue, group: ChartGroup, root: Path, warnings: list[str]) -> tuple[dict[str, Any], float]:
    song_id = group.digest[:16]
    info = library.keysounds_info(song_id) if library.has_song(song_id) else None
    if info is not None:
        return library.get_song(song_id), float(info.get("gain", 1.0))
    names = list(dict.fromkeys(name for c in group.charts for name in c.sounds))
    index = SoundIndex(root)
    chunks = [names[i::DECODE_WORKERS] for i in range(DECODE_WORKERS)]
    samples: dict[str, np.ndarray] = {}
    missing: list[str] = []
    with ThreadPoolExecutor(DECODE_WORKERS) as pool:
        for got, lost in pool.map(lambda part: decode_sounds(part, index, group.base), chunks):
            samples.update(got)
            missing += lost
    if missing:
        warnings.append(f"{group.base or '(최상위 폴더)'}: 키음 {len(missing)}개를 찾지 못했습니다 (예: {', '.join(missing[:3])})")
    if not samples:
        raise FormatError(f"{group.base or '(최상위 폴더)'}: 키음 파일을 하나도 찾지 못했습니다")
    main = max(group.charts, key=lambda c: len(c.notes) + len(c.bgm))
    mix = full_mix(main.bgm, main.notes, main.sounds, samples)
    gain = normalizing_gain(mix)
    song, created = library.add_rendered_song(song_id, mix * gain, song_title(main.title), main.artist, f"sha256:{group.digest}")
    sprite, sprite_index = build_sprite(samples)
    library.save_keysounds(song_id, sprite, sprite_index, gain)
    if created:
        queue.submit(song_id)
        song = library.get_song(song_id)
    return song, gain


def _covers(library: Library, root: Path, done: list[tuple[ChartGroup, dict[str, Any]]], fetch: Callable[[set[str]], None] | None) -> None:
    """A song without a cover takes the first picture its charts name that the package has: BMS
    #STAGEFILE, else #BANNER; the osu! background."""
    bare = [(group, song) for group, song in done if not song["hasCover"]]
    wanted = {image_stem(f"{group.base}/{name}" if group.base else name) for group, _ in bare for c in group.charts for name in c.images}
    if not wanted:
        return
    if fetch is not None:
        fetch(wanted)
    index = ImageIndex(root)
    for group, song in bare:
        for name in (name for c in group.charts for name in c.images):
            path = index.find(name, group.base)
            data = path.read_bytes() if path is not None and path.stat().st_size <= MAX_IMAGE_BYTES else b""
            kind = image_kind(data)
            if kind is not None:
                library.save_cover(song["id"], data, kind)
                song.update(library.get_song(song["id"]))
                break


def import_package(library: Library, queue: AnalysisQueue, root: Path, fetch_images: Callable[[set[str]], None] | None = None) -> dict[str, Any]:
    """`fetch_images` brings the pictures the charts name out of the package's archives (their
    image_stem from `root`) before the covers are looked for."""
    groups, warnings = scan_package(root)
    if not groups:
        raise FormatError("가져올 채보가 없습니다" + (": " + "; ".join(warnings[:3]) if warnings else ""))
    songs: list[dict[str, Any]] = []
    charts: list[dict[str, Any]] = []
    done: list[tuple[ChartGroup, dict[str, Any]]] = []
    for group in groups:
        try:
            if group.kind == "audio":
                song, extra = _audio_group(library, queue, group), None
            else:
                song, gain = _keysound_group(library, queue, group, root, warnings)
                extra = {"keysoundGain": round(gain, 6)}
        except FormatError as e:
            warnings.append(str(e))
            continue
        except Exception as e:
            warnings.append(f"{group.base or group.title}: 가져오지 못했습니다 ({e})")
            continue
        songs.append(song)
        done.append((group, song))
        for parsed in group.charts:
            try:
                chart = _assemble(parsed, song, {**(extra or {}), **({"genre": parsed.genre} if parsed.genre else {})})
            except FormatError as e:
                warnings.append(f"{parsed.source_name}: {e}")
                continue
            library.save_chart(chart, song["id"])
            m = chart["meta"]
            charts.append({"chartId": m["chartId"], "songId": song["id"], "keyMode": m["keyMode"], "level": m["level"], "name": m.get("chartName", ""), "noteCount": m["noteCount"]})
    if not charts:
        raise FormatError("채보를 하나도 가져오지 못했습니다: " + "; ".join(warnings[:3]))
    try:
        _covers(library, root, done, fetch_images)
    except Exception as e:  # a picture that cannot be read leaves the disc
        warnings.append(f"커버 그림을 읽지 못했습니다 ({e})")
    return {"songs": songs, "charts": charts, "warnings": warnings, "sampleRate": SAMPLE_RATE}
