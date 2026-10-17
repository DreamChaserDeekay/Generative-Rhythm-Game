"""Shared pieces of the chart file formats: lane layouts, structural checks, chart assembly."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from ..config import DEFAULT_SYSTEM, difficulty_config, difficulty_system, key_modes, level_table_for
from ..difficulty.estimator import estimate
from ..generator.tempo import TempoMap

FORMAT_VERSION = 1
TIME_EPS = 1e-3
# Jack threshold used by the skill profile of charts we did not generate (no preset applies).
IMPORTED_MIN_JACK_MS = 60.0
BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


class FormatError(ValueError):
    """A chart file we cannot read or a chart that cannot be written in the requested format."""


@dataclass
class ParsedChart:
    """A chart read from a file, already on our timeline (ms from the chart's audio start)."""

    format: str
    key_mode: str
    title: str
    artist: str
    chart_name: str
    timing: dict[str, Any]
    notes: list[dict[str, Any]]
    bgm: list[dict[str, Any]] = field(default_factory=list)
    sounds: list[str] = field(default_factory=list)
    audio_file: str | None = None
    genre: str = ""
    level_hint: str = ""
    preview_ms: float | None = None
    source_name: str = ""
    # notes removed because they overlapped others in the file
    dropped: int = 0
    warnings: list[str] = field(default_factory=list)


def difficulty_label(meta: dict[str, Any], with_level: bool = True) -> str:
    """"HARD Lv.9", "DJMAX MX Lv.12", "DJMAX SC 8" (as the client shows it); without the level
    "HARD", "DJMAX MX"."""
    system = meta.get("difficultySystem")
    head = ""
    if system and system != DEFAULT_SYSTEM:
        head = str(difficulty_config().get("systems", {}).get(system, {}).get("label", system)) + " "
    level = int(meta.get("level") or 0)
    tail = (f" {level}" if meta.get("levelScale") else f" Lv.{level}") if level > 0 and with_level else ""
    return f"{head}{meta.get('difficulty', '')}{tail}"


def lane_ids(key_mode: str) -> list[str]:
    return [lane["id"] for lane in key_modes()[key_mode]["lanes"]]


def base36(n: int) -> str:
    if not 1 <= n <= 36 * 36 - 1:
        raise FormatError(f"BMS object id out of range: {n}")
    return BASE36[n // 36] + BASE36[n % 36]


def from_base36(s: str) -> int:
    s = s.upper()
    return BASE36.index(s[0]) * 36 + BASE36.index(s[1])


def ascii_text(text: str, fallback: str = "Untitled") -> str:
    """Romanisation-free ASCII fallback (osu! wants ASCII in Title/Artist)."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().strip()
    return plain or fallback


def safe_filename(text: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", text).strip(" .")
    return cleaned[:120] or "chart"


def structural_problems(notes: list[dict[str, Any]], n_lanes: int) -> list[str]:
    """Rules every playable chart obeys, whoever made it: lanes in range, no duplicates, positive
    hold lengths and nothing inside a hold on its own lane. (Generated charts also pass the
    stricter playability linter; edited and imported ones only need these.)"""
    problems: list[str] = []
    by_lane: dict[int, list[dict[str, Any]]] = {}
    for n in notes:
        lane = n.get("lane")
        if not isinstance(lane, int) or not 0 <= lane < n_lanes:
            problems.append(f"레인 범위를 벗어난 노트 ({n.get('t')}ms, 레인 {lane})")
            continue
        if n.get("type") not in ("tap", "hold"):
            problems.append(f"알 수 없는 노트 종류 ({n.get('t')}ms)")
            continue
        if n["type"] == "hold" and not float(n.get("endT", 0)) > float(n["t"]) + TIME_EPS:
            problems.append(f"길이가 0인 롱노트 ({n['t']}ms)")
        by_lane.setdefault(lane, []).append(n)
    for lane, ns in by_lane.items():
        ns.sort(key=lambda n: n["t"])
        for a, b in zip(ns, ns[1:]):
            if abs(a["t"] - b["t"]) < TIME_EPS:
                problems.append(f"같은 레인·같은 시각의 노트 (레인 {lane}, {a['t']}ms)")
            elif a["type"] == "hold" and b["t"] <= a["endT"] + TIME_EPS:
                problems.append(f"롱노트 안에 겹친 노트 (레인 {lane}, {b['t']}ms)")
    return problems


def measures(meter: list[dict[str, Any]] | None, until_beat: float) -> list[tuple[float, float]]:
    """(start beat, length in beats) of every measure from beat 0 through `until_beat`."""
    entries = sorted(meter or [{"measure": 0, "beatsPerMeasure": 4}], key=lambda m: m["measure"])
    out: list[tuple[float, float]] = []
    beat, measure, i, length = 0.0, 0, 0, 4.0
    while beat <= until_beat + 1e-9:
        while i < len(entries) and entries[i]["measure"] <= measure:
            length = float(entries[i]["beatsPerMeasure"])
            i += 1
        if length <= 0:
            raise FormatError("마디 길이가 0 이하입니다")
        out.append((beat, length))
        beat += length
        measure += 1
    return out


def meter_from_lengths(lengths: list[float]) -> list[dict[str, Any]]:
    """Chart meter entries (only where the measure length changes) from per-measure beat lengths."""
    out: list[dict[str, Any]] = []
    for m, length in enumerate(lengths):
        length = round(float(length), 6)
        if not out or out[-1]["beatsPerMeasure"] != length:
            out.append({"measure": m, "beatsPerMeasure": int(length) if length.is_integer() else length})
    return out or [{"measure": 0, "beatsPerMeasure": 4}]


def drop_conflicts(notes: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Imported files sometimes stack notes or put notes inside long notes; keep the first."""
    kept: list[dict[str, Any]] = []
    last_end: dict[int, float] = {}
    dropped = 0
    for n in sorted(notes, key=lambda n: (n["t"], n["lane"], 0 if n["type"] == "hold" else 1)):
        lane = n["lane"]
        if lane in last_end and n["t"] <= last_end[lane] + TIME_EPS:
            dropped += 1
            continue
        if n["type"] == "hold" and not n["endT"] > n["t"] + TIME_EPS:
            n = {k: v for k, v in n.items() if k not in ("endT", "endBeat")} | {"type": "tap"}
        kept.append(n)
        last_end[lane] = n.get("endT", n["t"]) if n["type"] == "hold" else n["t"]
    return kept, dropped


CHOKE_MIN_GAP_MS = 0.5


def choke_slices(bgm: list[dict[str, Any]], notes: list[dict[str, Any]]) -> None:
    """Sets `sl` (ms) on keysound events: a sound plays until the same sound starts again (BMS:
    the same #WAV id; bmson: the same channel, which also ends each slice of a sliced stem)."""
    by_snd: dict[int, list[dict[str, Any]]] = {}
    for e in [*bgm, *notes]:
        if e.get("snd") is not None:
            by_snd.setdefault(int(e["snd"]), []).append(e)
    for events in by_snd.values():
        events.sort(key=lambda e: e["t"])
        for a, b in zip(events, events[1:]):
            gap = b["t"] - a["t"]
            if gap >= CHOKE_MIN_GAP_MS:
                a["sl"] = round(gap, 3)


def content_chart_id(payload: dict[str, Any]) -> str:
    return "c" + hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:20]


def normalize_notes(notes: list[dict[str, Any]], tempo: TempoMap) -> list[dict[str, Any]]:
    """Sorted notes with beats derived from times (and times rounded), keeping keysound fields."""
    out = []
    for n in notes:
        t = round(float(n["t"]), 3)
        note: dict[str, Any] = {"beat": round(tempo.ms_to_beat(t), 6), "t": t, "lane": int(n["lane"]), "type": n["type"]}
        if n["type"] == "hold":
            end = round(float(n["endT"]), 3)
            note["endBeat"] = round(tempo.ms_to_beat(end), 6)
            note["endT"] = end
        for key in ("src", "snd", "so", "sl"):
            if n.get(key) is not None:
                note[key] = n[key]
        out.append(note)
    out.sort(key=lambda n: (n["t"], n["lane"]))
    return out


def assemble_chart(
    *,
    key_mode: str,
    timing: dict[str, Any],
    notes: list[dict[str, Any]],
    title: str,
    artist: str,
    song_id: str | None,
    audio_hash: str,
    difficulty: str,
    source: dict[str, Any],
    duration_ms: float | None = None,
    chart_name: str = "",
    sections: list[dict[str, Any]] | None = None,
    effects: list[dict[str, Any]] | None = None,
    extra_meta: dict[str, Any] | None = None,
    sounds: list[str] | None = None,
    bgm: list[dict[str, Any]] | None = None,
    system: str = DEFAULT_SYSTEM,
    level_scale: str | None = None,
) -> dict[str, Any]:
    """A chart we did not generate (edited or imported): validated, rated with our estimator and
    identified by its content, so the same notes always get the same chartId. An edited chart is
    rated on the level scale of the difficulty system it came from."""
    lanes = lane_ids(key_mode)
    tempo = TempoMap(timing)
    notes = normalize_notes(notes, tempo)
    if not notes:
        raise FormatError("노트가 하나도 없습니다")
    problems = structural_problems(notes, len(lanes))
    if problems:
        raise FormatError("채보 구조 오류: " + "; ".join(problems[:5]))
    last = max(n.get("endT", n["t"]) for n in notes)
    duration = float(duration_ms) if duration_ms else last + 2000.0
    table, factor = level_table_for(difficulty_system(system), difficulty, key_mode)
    est = estimate(notes, key_mode, len(lanes), max(duration, last + 1.0), IMPORTED_MIN_JACK_MS, table, factor)
    timing = {k: v for k, v in timing.items() if k in ("offsetMs", "tempoMap", "meter", "stops") and v is not None}
    payload = {"audioHash": audio_hash, "keyMode": key_mode, "timing": timing, "notes": notes, "bgm": bgm or [], "sounds": sounds or []}
    meta: dict[str, Any] = {
        "chartId": content_chart_id(payload),
        "audioHash": audio_hash,
        "songId": song_id,
        "title": title,
        "artist": artist,
        "keyMode": key_mode,
        "lanes": lanes,
        "difficulty": difficulty,
        **({"difficultySystem": system} if system != DEFAULT_SYSTEM else {}),
        **({"levelScale": level_scale} if level_scale else {}),
        "level": est["level"],
        "rating": est["rating"],
        "durationMs": duration,
        "noteCount": len(notes),
        "nps": est["nps"],
        "effectiveNps": est["effectiveNps"],
        "densityLimited": False,
        "skillset": est["skillset"],
        "handLoad": est["handLoad"],
        "keysound": None,
        "repeatConsistency": None,
        "source": source,
    }
    if chart_name:
        meta["chartName"] = chart_name
    if extra_meta:
        meta.update(extra_meta)
    chart: dict[str, Any] = {
        "formatVersion": FORMAT_VERSION,
        "meta": meta,
        "timing": timing,
        "sections": sections or [],
        "effects": effects or [],
        "notes": notes,
    }
    if sounds:
        chart["sounds"] = sounds
        chart["bgm"] = bgm or []
    return chart
