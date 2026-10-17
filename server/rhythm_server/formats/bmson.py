"""bmson (JSON BMS, version 1.0.0): export and import.

Positions are pulses (`resolution` per quarter note) from the chart start, which is the audio's
time 0. Notes in a sound channel with `c: true` continue the channel's sound instead of
restarting it (sliced stems); each such note plays its slice until the channel's next note.
"""

from __future__ import annotations

import json
from typing import Any

from ..generator.tempo import TempoMap
from .bms import LEAD_IN_MIN_MS
from .common import FormatError, ParsedChart, choke_slices, drop_conflicts, measures, meter_from_lengths

RESOLUTION = 960
# our lane index -> bmson x, per key mode (x 8 is the scratch in beat-* modes)
LANE_X = {"7K+1S": [8, 1, 2, 3, 4, 5, 6, 7], "5K": [1, 2, 3, 4, 5]}
MODE_HINT = {"7K+1S": "beat-7k", "5K": "beat-5k"}


def export_bmson(chart: dict[str, Any], audio_name: str) -> dict[str, Any]:
    meta, timing = chart["meta"], chart["timing"]
    key_mode = meta["keyMode"]
    if key_mode not in LANE_X:
        raise FormatError(f"bmson으로는 {key_mode}를 내보낼 수 없습니다 (5K·7K+1S만, 다른 모드는 osu!mania를 쓰세요)")
    lane_x = LANE_X[key_mode]
    tempo = TempoMap(timing)
    ms0 = tempo.beat_ms(0.0)
    offset = float(timing["offsetMs"])
    lead = offset / ms0 if offset >= LEAD_IN_MIN_MS else 0.0

    def y(beat: float) -> int:
        return max(0, int(round((beat + lead) * RESOLUTION)))

    notes = chart["notes"]
    sounds: list[str] = list(chart.get("sounds") or [])
    channels: dict[str, list[dict[str, Any]]] = {}

    def put(name: str, note: dict[str, Any]) -> None:
        channels.setdefault(name, []).append(note)

    if sounds:
        for e in chart.get("bgm") or []:
            put(sounds[int(e["snd"])], {"x": 0, "y": y(float(e["beat"])), "l": 0, "c": bool(e.get("so"))})
    else:
        put(audio_name, {"x": 0, "y": y(tempo.ms_to_beat(0.0)), "l": 0, "c": False})
    for n in notes:
        name = sounds[int(n["snd"])] if sounds and n.get("snd") is not None else ""
        length = y(float(n["endBeat"])) - y(float(n["beat"])) if n["type"] == "hold" else 0
        put(name, {"x": lane_x[n["lane"]], "y": y(float(n["beat"])), "l": length, "c": bool(n.get("so"))})

    last_beat = max([n.get("endBeat", n["beat"]) for n in notes] + [0.0])
    lines = [{"y": 0}] if lead > 0 else []
    lines += [{"y": y(start)} for start, _ in measures(timing.get("meter"), last_beat + 4.0)]
    bpm_events = [{"y": y(float(p["beat"])), "bpm": float(p["bpm"])} for p in sorted(timing["tempoMap"], key=lambda p: p["beat"])[1:]]
    stop_events = [
        {"y": y(float(s["beat"])), "duration": int(round(float(s["durationMs"]) / tempo.beat_ms(float(s["beat"])) * RESOLUTION))}
        for s in timing.get("stops") or []
    ]
    return {
        "version": "1.0.0",
        "info": {
            "title": meta["title"],
            "subtitle": meta.get("chartName", ""),
            "artist": meta.get("artist") or "",
            "subartists": [],
            "genre": meta.get("genre") or "Generative",
            "mode_hint": MODE_HINT[key_mode],
            "chart_name": meta.get("chartName") or meta.get("difficulty", ""),
            "level": int(meta.get("level") or 1),
            "init_bpm": 60000.0 / ms0,
            "judge_rank": 100,
            "total": 100,
            "back_image": "",
            "eyecatch_image": "",
            "title_image": "",
            "banner_image": "",
            "preview_music": "",
            "resolution": RESOLUTION,
            "ln_type": 1,
        },
        "lines": lines,
        "bpm_events": bpm_events,
        "stop_events": stop_events,
        "sound_channels": [{"name": name, "notes": sorted(ns, key=lambda n: (n["y"], n["x"]))} for name, ns in channels.items()],
        "bga": {"bga_header": [], "bga_events": [], "layer_events": [], "poor_events": []},
    }


def _layout(mode_hint: str, xs: set[int]) -> tuple[str, dict[int, int]]:
    hint = (mode_hint or "beat-7k").lower()
    if hint == "beat-7k":
        return "7K+1S", {8: 0, **{x: x for x in range(1, 8)}}
    if hint == "beat-5k":
        if 8 in xs:
            return "7K+1S", {8: 0, **{x: x for x in range(1, 6)}}
        return "5K", {x: x - 1 for x in range(1, 6)}
    if hint == "popn-5k":
        return "5K", {x: x - 1 for x in range(1, 6)}
    raise FormatError(f"bmson 모드 {mode_hint}는 지원하지 않습니다 (beat-5k·beat-7k·popn-5k만)")


def parse_bmson(data: bytes, source_name: str = "") -> ParsedChart:
    try:
        doc = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise FormatError(f"bmson을 읽지 못했습니다: {e}") from e
    if not isinstance(doc, dict) or "sound_channels" not in doc:
        raise FormatError("bmson 1.0.0 형식이 아닙니다 (이전 0.21 형식은 지원하지 않습니다)")
    info = doc.get("info") or {}
    res = float(info.get("resolution") or 240)
    init_bpm = float(info.get("init_bpm") or 130.0)
    if res <= 0 or init_bpm <= 0:
        raise FormatError("resolution 또는 init_bpm이 올바르지 않습니다")

    tempo_map = [{"beat": 0.0, "bpm": init_bpm}]
    for e in sorted(doc.get("bpm_events") or [], key=lambda e: e["y"]):
        beat, bpm = float(e["y"]) / res, float(e["bpm"])
        if bpm <= 0:
            continue
        if abs(tempo_map[-1]["beat"] - beat) < 1e-9:
            tempo_map[-1]["bpm"] = bpm
        elif tempo_map[-1]["bpm"] != bpm:
            tempo_map.append({"beat": beat, "bpm": bpm})
    line_beats = sorted({float(l["y"]) / res for l in doc.get("lines") or []})
    if line_beats and line_beats[0] > 1e-9:
        line_beats = [0.0, *line_beats]
    lengths = [b - a for a, b in zip(line_beats, line_beats[1:]) if b - a > 1e-9]
    timing: dict[str, Any] = {"offsetMs": 0.0, "tempoMap": tempo_map, "meter": meter_from_lengths(lengths)}
    plain = TempoMap(timing)
    stops = [
        {"beat": float(e["y"]) / res, "durationMs": float(e["duration"]) / res * plain.beat_ms(float(e["y"]) / res)}
        for e in doc.get("stop_events") or []
        if float(e.get("duration", 0)) > 0
    ]
    if stops:
        timing["stops"] = sorted(stops, key=lambda s: s["beat"])
    tempo = TempoMap(timing)

    xs = {int(n.get("x") or 0) for ch in doc["sound_channels"] for n in ch.get("notes") or []}
    key_mode, lane_of = _layout(str(info.get("mode_hint", "beat-7k")), xs)
    sounds: list[str] = []
    notes: list[dict[str, Any]] = []
    bgm: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()
    for channel in doc["sound_channels"]:
        name = str(channel.get("name") or "")
        snd = None
        if name:
            snd = len(sounds)
            sounds.append(name)
        restart_t = 0.0
        for n in sorted(channel.get("notes") or [], key=lambda n: n["y"]):
            beat = float(n["y"]) / res
            t = tempo.beat_to_ms(beat)
            if not n.get("c"):
                restart_t = t
            event: dict[str, Any] = {"beat": beat, "t": t}
            if snd is not None:
                event["snd"] = snd
                if n.get("c") and t - restart_t > 0:
                    event["so"] = round(t - restart_t, 3)
            x = int(n.get("x") or 0)
            if x == 0:
                if snd is not None:
                    bgm.append(event)
                continue
            if x not in lane_of:
                continue
            key = (x, int(n["y"]))
            if key in seen:  # a second channel layered on the same note plays as background
                if snd is not None:
                    bgm.append(event)
                continue
            seen.add(key)
            event.update(lane=lane_of[x], type="tap")
            if float(n.get("l") or 0) > 0:
                end_beat = (float(n["y"]) + float(n["l"])) / res
                event.update(type="hold", endBeat=end_beat, endT=tempo.beat_to_ms(end_beat))
            notes.append(event)
    if not notes:
        raise FormatError("플레이할 노트가 없습니다")
    notes, dropped = drop_conflicts(notes)
    bgm.sort(key=lambda e: (e["t"], e.get("snd", -1)))
    choke_slices(bgm, notes)
    return ParsedChart(
        format="bmson",
        key_mode=key_mode,
        title=str(info.get("title") or "Untitled"),
        artist=str(info.get("artist") or ""),
        chart_name=str(info.get("chart_name") or info.get("subtitle") or ""),
        timing=timing,
        notes=notes,
        bgm=bgm,
        sounds=sounds,
        genre=str(info.get("genre") or ""),
        level_hint=str(info.get("level") or ""),
        source_name=source_name,
        dropped=dropped,
    )
