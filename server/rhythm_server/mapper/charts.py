"""Charts by Mapperatorinator: the request a chart makes (columns, star rating, the song's timing as
an .osu file), and the .osu it gives back as one of our charts (docs/MAPPERATORINATOR.md).

Key modes: Mapperatorinator makes osu!mania charts of 1 to 18 columns. Every lane but the FX ones
is a column, in our lane order: 4K, 5K, 6K, 8K as they are, 7K+1S as 8 columns whose first is the
scratch, 4K+FX and 6K+FX as 4K and 6K with their FX lanes left empty.

Difficulty: a tier aims at the middle of its level range (or the level asked for), turned into an
osu! star rating by mapper.json starsForLevel; the chart's level is then our own estimate of the
notes it got, as for every chart.
"""

from __future__ import annotations

import bisect
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from ..analysis.stems import STEM_NAMES
from ..config import key_modes
from ..difficulty.consistency import chart_consistency
from ..difficulty.estimator import estimate
from ..difficulty.patterns import pattern_summary
from ..formats.common import drop_conflicts, measures, normalize_notes, structural_problems
from ..formats.osu import OSU_WIDTH, _pairs, _sections, parse_osu
from ..generator.core import keysound_meta, mark_sound_ends
from ..generator.effects import camera_effects
from ..generator.lanes import lane_infos
from ..generator.params import resolve_params
from ..generator.tempo import TempoMap

# the request and conversion's form; part of every chart id (a new one makes charts anew)
MAPPER_VERSION = "1"
# a note within this of an analysed onset follows that onset's stem (keysounds)
SRC_TOLERANCE_MS = 45.0
# holds shorter than this are taps
MIN_HOLD_MS = 60.0


def columns(key_mode: str) -> list[int]:
    """Our lane of each column Mapperatorinator is asked for (every lane but FX ones)."""
    return [l.index for l in lane_infos(key_mode) if l.kind != "side"]


def target_level(key_mode: str, difficulty: str, level: int | None) -> int:
    params = resolve_params(key_mode, difficulty, level, {})
    if level is not None:
        return int(level)
    lo, hi = params.levels
    return int(round((lo + hi) / 2))


def stars_for(level: float, table: list[list[float]]) -> float:
    """The star rating for a level: piecewise linear through mapper.json starsForLevel."""
    pts = sorted((float(a), float(b)) for a, b in table)
    if level <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if level <= x1:
            return round(y0 + (y1 - y0) * (level - x0) / (x1 - x0), 2)
    return pts[-1][1]


def chart_id(analysis: dict[str, Any], key_mode: str, difficulty: str, level: int, seed: int, cfg: dict[str, Any]) -> str:
    payload = {
        "audioHash": analysis.get("audioHash", ""),
        "analyzer": analysis.get("analyzer"),
        "overrides": analysis.get("overrides", {}),
        "keyMode": key_mode,
        "difficulty": difficulty,
        "level": level,
        "seed": seed,
        "mapper": f"{cfg.get('model', 'v32')}-{MAPPER_VERSION}",
        "appTiming": bool(cfg.get("useAppTiming", True)),
        "holdNoteRatio": cfg.get("holdNoteRatio"),
        "temperature": cfg.get("temperature"),
        "stars": cfg.get("starsForLevel"),
    }
    return "c" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:20]


def timing_osu(timing: dict[str, Any], keycount: int, audio_name: str, title: str = "", artist: str = "") -> str:
    """An osu!mania file with the song's timing points only (red lines at every tempo and meter
    change), for Mapperatorinator's timing context."""
    tempo = TempoMap(timing)
    points = sorted(timing["tempoMap"], key=lambda p: p["beat"])
    last_beat = max([float(p["beat"]) for p in points] + [0.0]) + 1.0
    bars = measures(timing.get("meter"), max(last_beat, 4.0))
    meter_at: list[tuple[float, float]] = []
    for start, length in bars:
        if not meter_at or abs(meter_at[-1][1] - length) > 1e-6:
            meter_at.append((start, length))
    beats = sorted({float(p["beat"]) for p in points} | {b for b, _ in meter_at} | {0.0})

    def bpm_at(beat: float) -> float:
        k = bisect.bisect_right([float(p["beat"]) for p in points], beat + 1e-9) - 1
        return float(points[max(0, k)]["bpm"])

    def meter_of(beat: float) -> int:
        k = bisect.bisect_right([b for b, _ in meter_at], beat + 1e-9) - 1
        return max(1, int(round(meter_at[k][1]))) if k >= 0 else 4

    lines = [
        "osu file format v14", "", "[General]", f"AudioFilename: {audio_name}", "AudioLeadIn: 0", "PreviewTime: -1", "Mode: 3",
        "SpecialStyle: 0", "", "[Metadata]", f"Title:{title or 'Untitled'}", f"Artist:{artist}", "Creator:Generative Rhythm",
        "Version:timing", "", "[Difficulty]", "HPDrainRate:8", f"CircleSize:{keycount}", "OverallDifficulty:8",
        "ApproachRate:5", "SliderMultiplier:1.4", "SliderTickRate:1", "", "[TimingPoints]",
    ]
    for beat in beats:
        t = tempo.beat_to_ms(beat)
        lines.append(f"{t:.3f},{60000.0 / bpm_at(beat):.9f},{meter_of(beat)},1,0,60,1,0")
    lines += ["", "[HitObjects]", ""]
    return "\n".join(lines)


def notes_from_osu(text: str, lanes: list[int]) -> list[dict[str, Any]]:
    """Notes of an osu!mania file on our lanes (column i on lanes[i]): times in ms, holds shorter
    than MIN_HOLD_MS as taps."""
    sec = _sections(text.lstrip("﻿"))
    keys = int(round(float(_pairs(sec.get("Difficulty", [])).get("CircleSize", str(len(lanes))))))
    notes: list[dict[str, Any]] = []
    for line in sec.get("HitObjects", []):
        f = line.split(",")
        if len(f) < 4:
            continue
        x, t, kind = float(f[0]), float(f[2]), int(f[3])
        column = min(keys - 1, max(0, int(math.floor(x * keys / OSU_WIDTH))))
        if column >= len(lanes):
            continue
        lane = lanes[column]
        if kind & 128 and len(f) > 5:
            end = float(f[5].split(":")[0])
            if end - t >= MIN_HOLD_MS:
                notes.append({"t": t, "lane": lane, "type": "hold", "endT": end})
                continue
        if kind & (1 | 128):
            notes.append({"t": t, "lane": lane, "type": "tap"})
    notes, _ = drop_conflicts(notes)
    return notes


def attach_sources(notes: list[dict[str, Any]], onsets: list[dict[str, Any]]) -> None:
    """The stem of the analysed onset nearest each note (within SRC_TOLERANCE_MS): what the stem
    keysound mode plays for it."""
    marks = sorted((float(o["t"]), o.get("source")) for o in onsets if o.get("source") in STEM_NAMES)
    times = [t for t, _ in marks]
    for n in notes:
        k = bisect.bisect_left(times, n["t"])
        best = None
        for j in (k - 1, k):
            if 0 <= j < len(times) and abs(times[j] - n["t"]) <= SRC_TOLERANCE_MS:
                if best is None or abs(times[j] - n["t"]) < abs(times[best] - n["t"]):
                    best = j
        if best is not None:
            n["src"] = marks[best][1]


def predicted_meta(
    analysis: dict[str, Any], key_mode: str, difficulty: str, level: int, seed: int, cid: str, cfg: dict[str, Any], meta: dict[str, Any]
) -> dict[str, Any]:
    """What the song select shows for a tier before its chart is made (it is made when opened):
    the level it aims at."""
    return {
        "chartId": cid, "audioHash": analysis.get("audioHash", ""), "songId": meta.get("songId"), "title": meta.get("title", "Untitled"),
        "artist": meta.get("artist", ""), "keyMode": key_mode, "lanes": [l["id"] for l in key_modes()[key_mode]["lanes"]],
        "difficulty": difficulty, "level": level, "noteCount": 0, "predicted": True,
        "generator": {"name": "mapperatorinator", "model": cfg.get("model", "v32"), "seed": seed, "stars": stars_for(level, cfg["starsForLevel"])},
    }


def make_chart(
    analysis: dict[str, Any], key_mode: str, difficulty: str, level: int, seed: int, cid: str, cfg: dict[str, Any], meta: dict[str, Any],
    osu_text: str, info: dict[str, Any], target_level: int | None = None,
) -> dict[str, Any]:
    """One of our charts from the .osu Mapperatorinator made (`target_level`: the level asked for,
    None for a tier's default chart)."""
    params = resolve_params(key_mode, difficulty, level, {})
    lanes = lane_infos(key_mode)
    timing = analysis["timing"] if cfg.get("useAppTiming", True) else parse_osu(osu_text).timing
    tempo = TempoMap(timing)
    notes = notes_from_osu(osu_text, columns(key_mode))
    if not notes:
        raise ValueError("Mapperatorinator가 만든 채보에 노트가 없습니다")
    attach_sources(notes, analysis.get("onsets", []))
    notes = normalize_notes(notes, tempo)
    problems = structural_problems(notes, len(lanes))
    if problems:
        raise ValueError("채보 구조 오류: " + "; ".join(problems[:5]))
    mark_sound_ends(notes, analysis)
    duration = float(analysis["durationMs"])
    last = max(n.get("endT", n["t"]) for n in notes)
    est = estimate(notes, key_mode, len(lanes), max(duration, last + 1.0), params.min_jack_ms, params.level_table, params.level_factor)
    beat0_ms = float(timing["offsetMs"])
    sections = [
        {k: s[k] for k in ("startBeat", "endBeat", "label", "group", "energy", "loopBars", "confidence") if s.get(k) is not None}
        for s in analysis.get("sections", [])
        if s.get("endT", s["t"] + 1) > beat0_ms - 1
    ]
    return {
        "formatVersion": 1,
        "meta": {
            "chartId": cid,
            "audioHash": analysis.get("audioHash", ""),
            "songId": meta.get("songId"),
            "title": meta.get("title", "Untitled"),
            "artist": meta.get("artist", ""),
            "keyMode": key_mode,
            "lanes": [l["id"] for l in key_modes()[key_mode]["lanes"]],
            "difficulty": difficulty,
            "level": est["level"],
            "rating": est["rating"],
            "durationMs": duration,
            "noteCount": len(notes),
            "nps": est["nps"],
            "effectiveNps": est["effectiveNps"],
            "densityLimited": False,
            "skillset": est["skillset"],
            "handLoad": est["handLoad"],
            "patterns": pattern_summary(notes, key_mode),
            "keysound": keysound_meta(notes),
            "repeatConsistency": None,
            "consistency": chart_consistency(notes, analysis.get("sections", []), key_mode, tempo.beats_per_bar),
            "generator": {
                "name": "mapperatorinator",
                "version": f"mapperatorinator-{cfg.get('model', 'v32')}-{MAPPER_VERSION}",
                "model": cfg.get("model", "v32"),
                "analyzer": f"{analysis['analyzer']['name']}-{analysis['analyzer']['version']}",
                "seed": seed,
                # what the client asks for again for a new pattern of the same chart
                "params": {"difficulty": difficulty, "targetLevel": target_level},
                "targetLevel": level,
                "stars": stars_for(level, cfg["starsForLevel"]),
                "keycount": len(columns(key_mode)),
                "timing": "app" if cfg.get("useAppTiming", True) else "model",
                "seconds": info.get("seconds"),
                "device": info.get("device"),
                "precision": info.get("precision"),
            },
        },
        "timing": timing,
        "sections": sections,
        "effects": camera_effects(analysis.get("sections", []), tempo, notes, lanes, analysis.get("onsets", []), []),
        "notes": notes,
    }


def request_for(
    key_mode: str, level: int, seed: int, cfg: dict[str, Any], audio: Path, out: Path, beatmap: Path | None, meta: dict[str, Any]
) -> dict[str, Any]:
    return {
        "audio": str(audio), "out": str(out), "beatmap": str(beatmap) if beatmap else None, "model": cfg.get("model", "v32"),
        "keycount": len(columns(key_mode)), "difficulty": stars_for(level, cfg["starsForLevel"]), "seed": int(seed),
        "holdNoteRatio": cfg.get("holdNoteRatio"), "temperature": cfg.get("temperature"),
        "precision": cfg.get("precision", "auto"), "device": "cpu" if cfg.get("_cpu") else "auto",
        "title": meta.get("title"), "artist": meta.get("artist"),
    }
