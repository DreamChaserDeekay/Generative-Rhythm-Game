"""osu!mania beatmaps (.osu, file format v14): export and import.

Times in a .osu file are ms from the start of its audio file, the same timeline as our charts.
osu! has no scroll stops, so an exported stop only re-anchors the beat grid after it.
"""

from __future__ import annotations

import math
import re
from typing import Any

from ..generator.tempo import TempoMap
from .common import (
    FormatError,
    ParsedChart,
    ascii_text,
    drop_conflicts,
    lane_ids,
    measures,
    meter_from_lengths,
)

OSU_WIDTH = 512
CREATOR = "Generative Rhythm Game"
MODE_TAG = "grg-mode:"
# osu! reads object times as integers; timing points re-anchor the grid, so rounding them is harmless.


def _column_x(column: int, keys: int) -> int:
    return int(math.floor((column + 0.5) * OSU_WIDTH / keys))


def export_osu(chart: dict[str, Any], audio_name: str, preview_ms: float | None = None, offset_ms: float = 0.0) -> str:
    meta, timing = chart["meta"], chart["timing"]
    key_mode = meta["keyMode"]
    keys = len(meta["lanes"])
    tempo = TempoMap(timing)
    notes = chart["notes"]
    last_beat = max((n.get("endBeat", n["beat"]) for n in notes), default=0.0)

    # uninherited timing points: tempo changes, meter changes (osu! restarts the bar there) and
    # the end of every stop (the grid continues from there)
    points: dict[int, tuple[float, float, int]] = {}

    def add(beat: float, ms: float | None = None) -> None:
        t = tempo.beat_to_ms(beat) if ms is None else ms
        bars = [m for m in measures(timing.get("meter"), max(beat, 0.0)) if m[0] <= beat + 1e-9]
        meter = max(1, int(round(bars[-1][1]))) if bars else 4
        points[int(round(t + offset_ms))] = (tempo.beat_ms(beat), meter, t)

    for p in timing["tempoMap"]:
        add(float(p["beat"]))
    bars = measures(timing.get("meter"), last_beat)
    for (_, prev_len), (start, length) in zip(bars, bars[1:]):
        if length != prev_len:
            add(start)
    for s in timing.get("stops") or []:
        add(float(s["beat"]), tempo.beat_to_ms(float(s["beat"])) + float(s["durationMs"]))

    version = meta.get("chartName") or f"{key_mode} {meta['difficulty']}" + (f" Lv.{meta['level']}" if meta.get("level") else "")
    lines = [
        "osu file format v14",
        "",
        "[General]",
        f"AudioFilename: {audio_name}",
        "AudioLeadIn: 0",
        f"PreviewTime: {int(round(preview_ms + offset_ms)) if preview_ms is not None else -1}",
        "Countdown: 0",
        "SampleSet: Soft",
        "StackLeniency: 0.7",
        "Mode: 3",
        "LetterboxInBreaks: 0",
        f"SpecialStyle: {1 if key_mode == '7K+1S' else 0}",
        "WidescreenStoryboard: 0",
        "",
        "[Editor]",
        "DistanceSpacing: 1",
        "BeatDivisor: 4",
        "GridSize: 4",
        "TimelineZoom: 1",
        "",
        "[Metadata]",
        f"Title:{ascii_text(meta['title'])}",
        f"TitleUnicode:{meta['title']}",
        f"Artist:{ascii_text(meta.get('artist') or '', 'Unknown')}",
        f"ArtistUnicode:{meta.get('artist') or ''}",
        f"Creator:{CREATOR}",
        f"Version:{version}",
        "Source:",
        f"Tags:generative-rhythm-game {MODE_TAG}{key_mode}",
        "BeatmapID:0",
        "BeatmapSetID:-1",
        "",
        "[Difficulty]",
        "HPDrainRate:8",
        f"CircleSize:{keys}",
        "OverallDifficulty:8",
        "ApproachRate:5",
        "SliderMultiplier:1.4",
        "SliderTickRate:1",
        "",
        "[Events]",
        "//Background and Video events",
        "//Break Periods",
        "",
        "[TimingPoints]",
    ]
    for t in sorted(points):
        beat_len, meter, _ = points[t]
        lines.append(f"{t},{beat_len!r},{meter},2,0,60,1,0")
    lines += ["", "[HitObjects]"]
    for n in sorted(notes, key=lambda n: (n["t"], n["lane"])):
        x = _column_x(n["lane"], keys)
        t = int(round(n["t"] + offset_ms))
        if n["type"] == "hold":
            lines.append(f"{x},192,{t},128,0,{int(round(n['endT'] + offset_ms))}:0:0:0:0:")
        else:
            lines.append(f"{x},192,{t},1,0,0:0:0:0:")
    return "\n".join(lines) + "\n"


def _sections(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    current = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        m = re.fullmatch(r"\[(\w+)\]", line)
        if m:
            current = m.group(1)
            out.setdefault(current, [])
        elif current:
            out[current].append(line)
    return out


def _pairs(lines: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in lines:
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def _key_mode(keys: int, special_style: bool, tags: str) -> tuple[str, list[int]]:
    """Our key mode for an osu!mania column count and the lane of every column."""
    m = re.search(re.escape(MODE_TAG) + r"(\S+)", tags)
    if m:
        try:
            ids = lane_ids(m.group(1))
        except KeyError:
            ids = []
        if len(ids) == keys:
            return m.group(1), list(range(keys))
    if keys == 4:
        return "4K", list(range(4))
    if keys == 5:
        return "5K", list(range(5))
    if keys == 6:
        return "6K", list(range(6))
    if keys == 7:
        return "7K+1S", list(range(1, 8))  # seven keys on 7K+1S, scratch unused
    if keys == 8:
        return ("7K+1S", list(range(8))) if special_style else ("8K", list(range(8)))
    raise FormatError(f"osu!mania {keys}K는 지원하지 않습니다 (4·5·6·7·8키만)")


def parse_osu(text: str, source_name: str = "") -> ParsedChart:
    if not text.lstrip("﻿").startswith("osu file format"):
        raise FormatError("osu! 비트맵 파일이 아닙니다")
    sec = _sections(text.lstrip("﻿"))
    general, metadata, difficulty = _pairs(sec.get("General", [])), _pairs(sec.get("Metadata", [])), _pairs(sec.get("Difficulty", []))
    if general.get("Mode", "0") != "3":
        raise FormatError("osu!mania(모드 3) 비트맵만 가져올 수 있습니다")
    keys = int(round(float(difficulty.get("CircleSize", "4"))))
    key_mode, column_lane = _key_mode(keys, general.get("SpecialStyle", "0") == "1", metadata.get("Tags", ""))

    # uninherited timing points only (inherited ones change the scroll speed, which we do not use)
    reds: list[tuple[float, float, int]] = []
    for line in sec.get("TimingPoints", []):
        f = line.split(",")
        if len(f) < 2:
            continue
        beat_len = float(f[1])
        uninherited = f[6].strip() != "0" if len(f) > 6 else True
        if uninherited and beat_len > 0:
            reds.append((float(f[0]), beat_len, int(f[2]) if len(f) > 2 and f[2].strip() else 4))
    if not reds:
        raise FormatError("타이밍 포인트가 없습니다")
    reds.sort()
    offset = reds[0][0]
    tempo_map: list[dict[str, Any]] = []
    lengths: list[float] = []
    beat = 0.0
    for i, (t, beat_len, meter) in enumerate(reds):
        if i > 0:
            prev_t, prev_len, _ = reds[i - 1]
            beat += (t - prev_t) / prev_len
        bpm = round(60000.0 / beat_len, 6)
        if tempo_map and abs(tempo_map[-1]["beat"] - beat) < 1e-9:
            tempo_map[-1]["bpm"] = bpm
        elif not tempo_map or tempo_map[-1]["bpm"] != bpm:
            tempo_map.append({"beat": round(beat, 6), "bpm": bpm})
        # bars restart at every red line; the bar before it may be cut short
        seg_end = beat + (reds[i + 1][0] - t) / beat_len if i + 1 < len(reds) else None
        start = beat
        while seg_end is None or start < seg_end - 1e-6:
            length = float(max(1, meter)) if seg_end is None else min(float(max(1, meter)), seg_end - start)
            lengths.append(length)
            start += length
            if seg_end is None:
                break
    timing = {"offsetMs": offset, "tempoMap": tempo_map, "meter": meter_from_lengths(lengths)}
    tempo = TempoMap(timing)

    notes: list[dict[str, Any]] = []
    for line in sec.get("HitObjects", []):
        f = line.split(",")
        if len(f) < 4:
            continue
        x, t, kind = float(f[0]), float(f[2]), int(f[3])
        column = min(keys - 1, max(0, int(math.floor(x * keys / OSU_WIDTH))))
        lane = column_lane[column]
        if kind & 128 and len(f) > 5:
            end = float(f[5].split(":")[0])
            notes.append({"t": t, "beat": tempo.ms_to_beat(t), "lane": lane, "type": "hold", "endT": end, "endBeat": tempo.ms_to_beat(end)})
        elif kind & 1:
            notes.append({"t": t, "beat": tempo.ms_to_beat(t), "lane": lane, "type": "tap"})
    notes, dropped = drop_conflicts(notes)
    preview = float(general.get("PreviewTime", "-1"))
    parsed = ParsedChart(
        format="osu",
        key_mode=key_mode,
        title=metadata.get("TitleUnicode") or metadata.get("Title") or "Untitled",
        artist=metadata.get("ArtistUnicode") or metadata.get("Artist") or "",
        chart_name=metadata.get("Version", ""),
        timing=timing,
        notes=notes,
        audio_file=general.get("AudioFilename") or None,
        preview_ms=preview if preview >= 0 else None,
        source_name=source_name,
        dropped=dropped,
    )
    return parsed
