"""BMS (.bms / .bme / .bml): export and import.

Our beat is a quarter note and BMS measure 000 starts at the chart's (audio's) time 0. When the
first downbeat of a chart comes later than 0ms, the export adds a lead-in measure of exactly that
length (channel 02), so every later measure lines up with our bars.
"""

from __future__ import annotations

import random
import re
from collections import defaultdict
from typing import Any

from ..config import DEFAULT_SYSTEM, difficulty_config
from ..generator.tempo import TempoMap
from .common import (
    FormatError,
    ParsedChart,
    base36,
    choke_slices,
    drop_conflicts,
    measures,
    meter_from_lengths,
)

# BMS key columns: 0 = scratch, 1-7 = keys (player 1 side)
P1_KEYS = {"16": 0, "11": 1, "12": 2, "13": 3, "14": 4, "15": 5, "18": 6, "19": 7}
P1_LN = {"56": 0, "51": 1, "52": 2, "53": 3, "54": 4, "55": 5, "58": 6, "59": 7}
KEY_CHANNEL = {c: ch for ch, c in P1_KEYS.items()}
LN_CHANNEL = {c: ch for ch, c in P1_LN.items()}
# our lane index -> BMS column, for the key modes BMS players know
LANE_COLUMNS = {"7K+1S": [0, 1, 2, 3, 4, 5, 6, 7], "5K": [1, 2, 3, 4, 5]}
DIFFICULTY_LEVEL = {"EASY": 1, "NORMAL": 2, "HARD": 3, "EXPERT": 4, "MASTER": 5}
DIFFICULTY_NAMES = {1: "BEGINNER", 2: "NORMAL", 3: "HYPER", 4: "ANOTHER", 5: "INSANE"}


def bms_difficulty(meta: dict[str, Any]) -> int:
    """#DIFFICULTY: the tier's bmsDifficulty on DJMAX / EZ2ON, from the five-step name otherwise."""
    system = meta.get("difficultySystem")
    if system and system != DEFAULT_SYSTEM:
        tier = difficulty_config().get("systems", {}).get(system, {}).get("tiers", {}).get(meta.get("difficulty", ""), {})
        if "bmsDifficulty" in tier:
            return int(tier["bmsDifficulty"])
    return DIFFICULTY_LEVEL.get(meta.get("difficulty", ""), 3)
RESOLUTIONS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 192, 384, 768, 960, 1536, 1920, 3840]
POSITION_TOLERANCE_MS = 0.5
STOP_UNITS_PER_BEAT = 48  # #STOP values count 1/192 of a 4/4 measure
LEAD_IN_MIN_MS = 1.0


def _num(x: float) -> str:
    text = f"{x:.6f}".rstrip("0").rstrip(".")
    return text if text not in ("", "-0") else "0"


def bms_total(note_count: int) -> float:
    """#TOTAL players assume when a chart has none (gauge gain over the whole chart, in %)."""
    return round(7.605 * note_count / (0.01 * note_count + 6.5), 2)


# ---------------------------------------------------------------- export


def export_bms(chart: dict[str, Any], audio_name: str) -> tuple[str, str]:
    """BMS text and the file extension (.bme for 7 keys)."""
    meta, timing = chart["meta"], chart["timing"]
    key_mode = meta["keyMode"]
    if key_mode not in LANE_COLUMNS:
        raise FormatError(f"BMS로는 {key_mode}를 내보낼 수 없습니다 (5K·7K+1S만, 다른 모드는 osu!mania를 쓰세요)")
    columns = LANE_COLUMNS[key_mode]
    tempo = TempoMap(timing)
    ms0 = tempo.beat_ms(0.0)
    offset = float(timing["offsetMs"])
    lead = offset / ms0 if offset >= LEAD_IN_MIN_MS else 0.0
    notes = chart["notes"]
    sounds: list[str] = list(chart.get("sounds") or [])
    if len(sounds) + 2 > 36 * 36 - 1:
        raise FormatError("키음이 너무 많아 BMS로 쓸 수 없습니다 (bmson을 쓰세요)")
    last_beat = max([n.get("endBeat", n["beat"]) for n in notes] + [e["beat"] for e in chart.get("bgm") or []] + [0.0])
    bars = measures(timing.get("meter"), last_beat)
    shift = 1 if lead > 0 else 0

    def place(beat: float) -> tuple[int, float, float]:
        """(BMS measure, fraction, measure length in beats) of one of our beats."""
        if lead > 0 and beat < 0:
            return 0, max(0.0, (beat + lead) / lead), lead
        beat = max(0.0, beat)
        k = max(i for i, (start, _) in enumerate(bars) if start <= beat + 1e-9)
        start, length = bars[k]
        return k + shift, min(max(0.0, (beat - start) / length), 1.0 - 1e-12), length

    objects: dict[tuple[int, str], list[tuple[float, str]]] = defaultdict(list)
    lengths: dict[int, float] = {}
    header = [
        "*---------------------- HEADER FIELD",
        "",
        "#PLAYER 1",
        f"#GENRE {meta.get('genre') or 'Generative'}",
        f"#TITLE {meta['title']}",
        *([f"#SUBTITLE {meta['chartName']}"] if meta.get("chartName") else []),
        f"#ARTIST {meta.get('artist') or ''}",
        f"#BPM {_num(60000.0 / ms0)}",
        f"#PLAYLEVEL {meta.get('level') or 1}",
        "#RANK 2",
        f"#TOTAL {_num(bms_total(len(notes) + sum(1 for n in notes if n['type'] == 'hold')))}",
        f"#DIFFICULTY {bms_difficulty(meta)}",
        "#LNTYPE 1",
        "",
    ]
    if sounds:
        for i, name in enumerate(sounds):
            header.append(f"#WAV{base36(i + 1)} {name}")
        silent = base36(len(sounds) + 1)
        for e in chart.get("bgm") or []:
            m, f, _ = place(float(e["beat"]))
            objects[(m, "01")].append((f, base36(int(e["snd"]) + 1)))
    else:
        header.append(f"#WAV01 {audio_name}")
        silent = "02"
        m, f, _ = place(tempo.ms_to_beat(0.0))
        objects[(m, "01")].append((f, "01"))
    for n in notes:
        column = columns[n["lane"]]
        oid = base36(int(n["snd"]) + 1) if n.get("snd") is not None and sounds else silent
        m, f, _ = place(float(n["beat"]))
        if n["type"] == "hold":
            objects[(m, LN_CHANNEL[column])].append((f, oid))
            m2, f2, _ = place(float(n["endBeat"]))
            objects[(m2, LN_CHANNEL[column])].append((f2, oid))
        else:
            objects[(m, KEY_CHANNEL[column])].append((f, oid))

    bpm_defs: dict[float, str] = {}
    for p in sorted(timing["tempoMap"], key=lambda p: p["beat"])[1:]:
        bpm = float(p["bpm"])
        oid = bpm_defs.setdefault(bpm, base36(len(bpm_defs) + 1))
        m, f, _ = place(float(p["beat"]))
        objects[(m, "08")].append((f, oid))
    stop_defs: dict[float, str] = {}
    for s in timing.get("stops") or []:
        units = round(float(s["durationMs"]) / tempo.beat_ms(float(s["beat"])) * STOP_UNITS_PER_BEAT, 4)
        oid = stop_defs.setdefault(units, base36(len(stop_defs) + 1))
        m, f, _ = place(float(s["beat"]))
        objects[(m, "09")].append((f, oid))
    header += [f"#BPM{oid} {_num(bpm)}" for bpm, oid in bpm_defs.items()]
    header += [f"#STOP{oid} {_num(units)}" for units, oid in stop_defs.items()]

    if lead > 0:
        lengths[0] = lead
    for k, (_, length) in enumerate(bars):
        if abs(length - 4.0) > 1e-9:
            lengths[k + shift] = length
    max_ms_per_beat = max(60000.0 / float(p["bpm"]) for p in timing["tempoMap"])

    body = ["", "*---------------------- MAIN DATA FIELD", ""]
    last_measure = max([m for m, _ in objects] + list(lengths) + [0])
    for m in range(last_measure + 1):
        if m in lengths:
            body.append(f"#{m:03d}02:{_num(lengths[m] / 4.0)}")
        measure_beats = lengths.get(m, 4.0)
        for channel in sorted({ch for mm, ch in objects if mm == m}):
            items = sorted(objects[(m, channel)])
            for line in _channel_lines(items, measure_beats * max_ms_per_beat, many=channel == "01"):
                body.append(f"#{m:03d}{channel}:{line}")
    ext = ".bme" if key_mode == "7K+1S" else ".bms"
    return "\n".join(header + body) + "\n", ext


def _resolution(fractions: list[float], measure_ms: float) -> int:
    for d in RESOLUTIONS:
        if all(abs(f * d - round(f * d)) / d * measure_ms <= POSITION_TOLERANCE_MS for f in fractions):
            return d
    return RESOLUTIONS[-1]


def _channel_lines(items: list[tuple[float, str]], measure_ms: float, many: bool) -> list[str]:
    """Object strings for one channel of one measure. BGM (`many`) may need several lines when
    sounds start at the same position; anything else must fit on one."""
    d = _resolution([f for f, _ in items], measure_ms)
    rows: list[list[str]] = []
    for f, oid in items:
        slot = min(d - 1, int(round(f * d)))
        for row in rows:
            if row[slot] == "00":
                row[slot] = oid
                break
        else:
            if rows and not many:
                raise FormatError("같은 위치에 노트가 겹쳐 BMS로 쓸 수 없습니다")
            row = ["00"] * d
            row[slot] = oid
            rows.append(row)
    return ["".join(row) for row in rows]


# ---------------------------------------------------------------- import


def decode_text(data: bytes) -> str:
    """BMS files are usually Shift_JIS, sometimes EUC-KR (cp949) or UTF-8."""
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    candidates = {}
    for enc in ("cp932", "cp949"):
        try:
            candidates[enc] = data.decode(enc)
        except UnicodeDecodeError:
            continue
    if len(candidates) == 1:
        return next(iter(candidates.values()))
    if len(candidates) == 2:
        return candidates["cp949"] if _korean_score(candidates["cp949"]) > _japanese_score(candidates["cp932"]) else candidates["cp932"]
    return data.decode("latin-1")


def _korean_score(text: str) -> int:
    """Shift_JIS bytes read as cp949 land on the rare extended Hangul syllables (not in EUC-KR)."""
    score = 0
    for ch in text:
        if 0xAC00 <= ord(ch) <= 0xD7A3:
            try:
                ch.encode("euc_kr")
                score += 1
            except UnicodeEncodeError:
                score -= 2
    return score


def _japanese_score(text: str) -> int:
    """EUC-KR bytes read as Shift_JIS turn into half-width katakana."""
    score = 0
    for ch in text:
        code = ord(ch)
        if 0xFF61 <= code <= 0xFF9F:
            score -= 2
        elif 0x3040 <= code <= 0x30FF or 0x4E00 <= code <= 0x9FFF:
            score += 1
    return score


def resolve_control_flow(lines: list[str], rng: random.Random) -> list[str]:
    """#RANDOM / #IF / #ELSEIF / #ELSE / #ENDIF / #ENDRANDOM, with one draw per #RANDOM."""
    out: list[str] = []
    randoms: list[int] = []
    frames: list[list[bool]] = []  # [parent active, a branch was taken, this branch active]

    def active() -> bool:
        return all(f[2] for f in frames)

    for line in lines:
        head = line.split(None, 1)
        word = head[0].upper() if head else ""
        arg = head[1].strip() if len(head) > 1 else ""
        if word in ("#RANDOM", "#SETRANDOM"):
            n = max(1, int(float(arg))) if re.fullmatch(r"\d+(\.\d+)?", arg) else 1
            randoms.append(rng.randint(1, n) if word == "#RANDOM" else n)
        elif word == "#ENDRANDOM":
            if randoms:
                randoms.pop()
        elif word == "#IF":
            parent = active()
            hit = parent and bool(randoms) and arg.isdigit() and int(arg) == randoms[-1]
            frames.append([parent, hit, hit])
        elif word == "#ELSEIF" and frames:
            f = frames[-1]
            hit = f[0] and not f[1] and bool(randoms) and arg.isdigit() and int(arg) == randoms[-1]
            f[1] = f[1] or hit
            f[2] = hit
        elif word == "#ELSE" and frames:
            f = frames[-1]
            f[2] = f[0] and not f[1]
            f[1] = True
        elif word in ("#ENDIF", "#END") and frames:
            frames.pop()
        elif active():
            out.append(line)
    return out


def parse_bms(data: bytes, source_name: str = "", seed: int = 0) -> ParsedChart:
    if source_name.lower().endswith(".pms"):
        raise FormatError("PMS(팝픈 9키) 채보는 지원하지 않습니다")
    lines = [l.strip() for l in decode_text(data).splitlines()]
    lines = resolve_control_flow([l for l in lines if l.startswith("#")], random.Random(seed))

    head: dict[str, str] = {}
    wav: dict[str, str] = {}
    bpm_defs: dict[str, float] = {}
    stop_defs: dict[str, float] = {}
    lnobj: set[str] = set()
    data_lines: list[tuple[int, str, str]] = []
    for line in lines:
        m = re.match(r"#(\d{3})([0-9A-Za-z]{2}):(.*)$", line)
        if m:
            data_lines.append((int(m.group(1)), m.group(2).upper(), m.group(3).strip()))
            continue
        m = re.match(r"#(WAV|BPM|EXBPM|STOP)([0-9A-Za-z]{2})\s+(.+)$", line, re.IGNORECASE)
        if m:
            kind, oid, value = m.group(1).upper(), m.group(2).upper(), m.group(3).strip()
            if kind == "WAV":
                wav[oid] = value
            elif kind in ("BPM", "EXBPM"):
                try:
                    bpm_defs[oid] = float(value)
                except ValueError:
                    pass
            else:
                try:
                    stop_defs[oid] = float(value)
                except ValueError:
                    pass
            continue
        m = re.match(r"#(\w+)\s*(.*)$", line)
        if m:
            key, value = m.group(1).upper(), m.group(2).strip()
            if key == "LNOBJ":
                lnobj.add(value.upper()[:2])
            else:
                head.setdefault(key, value)

    try:
        init_bpm = float(head.get("BPM", "130"))
    except ValueError:
        init_bpm = 130.0
    if init_bpm <= 0:
        raise FormatError("#BPM이 올바르지 않습니다")

    # measure lengths and objects
    ratio: dict[int, float] = {}
    channels: dict[str, list[tuple[int, float, str]]] = defaultdict(list)
    for measure, channel, payload in data_lines:
        if channel == "02":
            try:
                ratio[measure] = float(payload)
            except ValueError:
                pass
            continue
        payload = payload.replace(" ", "")
        n = len(payload) // 2
        for i in range(n):
            oid = payload[2 * i : 2 * i + 2].upper()
            if oid != "00":
                channels[channel].append((measure, i / n, oid))
    last_measure = max([m for m, _, _ in data_lines] + [0])
    starts: list[float] = []
    lengths: list[float] = []
    beat = 0.0
    for m in range(last_measure + 2):
        starts.append(beat)
        lengths.append(4.0 * ratio.get(m, 1.0))
        beat += lengths[-1]

    def beat_of(measure: int, fraction: float) -> float:
        return starts[measure] + fraction * lengths[measure]

    tempo_points: dict[float, float] = {0.0: init_bpm}
    for measure, fraction, oid in channels.get("03", []):
        tempo_points[beat_of(measure, fraction)] = float(int(oid, 16))
    for measure, fraction, oid in channels.get("08", []):
        if oid in bpm_defs and bpm_defs[oid] > 0:
            tempo_points[beat_of(measure, fraction)] = bpm_defs[oid]
    tempo_map = []
    for b in sorted(tempo_points):
        if tempo_points[b] > 0 and (not tempo_map or tempo_map[-1]["bpm"] != tempo_points[b]):
            tempo_map.append({"beat": round(b, 9), "bpm": tempo_points[b]})
    timing: dict[str, Any] = {"offsetMs": 0.0, "tempoMap": tempo_map, "meter": meter_from_lengths(lengths[: last_measure + 1])}
    plain = TempoMap(timing)
    stops = []
    for measure, fraction, oid in channels.get("09", []):
        if oid in stop_defs and stop_defs[oid] > 0:
            b = beat_of(measure, fraction)
            stops.append({"beat": round(b, 9), "durationMs": stop_defs[oid] / STOP_UNITS_PER_BEAT * plain.beat_ms(b)})
    if stops:
        timing["stops"] = sorted(stops, key=lambda s: s["beat"])
    tempo = TempoMap(timing)

    if any(objs for ch, objs in channels.items() if ch[0] in "26" and ch[1] in "123456789"):
        raise FormatError("더블 플레이(DP) 채보는 지원하지 않습니다")

    sound_index: dict[str, int] = {}
    sounds: list[str] = []

    def snd(oid: str) -> int | None:
        if oid not in wav:
            return None
        if oid not in sound_index:
            sound_index[oid] = len(sounds)
            sounds.append(wav[oid])
        return sound_index[oid]

    by_column: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for ch, column in P1_KEYS.items():
        for measure, fraction, oid in channels.get(ch, []):
            by_column[column].append((beat_of(measure, fraction), oid))
    raw: list[dict[str, Any]] = []
    for column, objs in by_column.items():
        objs.sort()
        for b, oid in objs:
            if oid in lnobj and raw and any(r["column"] == column for r in raw):
                prev = max((r for r in raw if r["column"] == column), key=lambda r: r["beat"])
                if prev["type"] == "tap":
                    prev.update(type="hold", endBeat=b)
                continue
            raw.append({"beat": b, "column": column, "type": "tap", "oid": oid})
    for ch, column in P1_LN.items():
        objs = sorted((beat_of(m, f), oid) for m, f, oid in channels.get(ch, []))
        for (b0, oid), (b1, _) in zip(objs[0::2], objs[1::2]):
            raw.append({"beat": b0, "column": column, "type": "hold", "endBeat": b1, "oid": oid})
    if not raw:
        raise FormatError("플레이할 노트가 없습니다")

    used = {r["column"] for r in raw}
    if used & {6, 7}:
        key_mode, lane_of = "7K+1S", {c: c for c in range(8)}
    elif 0 in used:
        key_mode, lane_of = "7K+1S", {c: c for c in range(8)}  # 5 keys + scratch on the 7K+1S lanes
    else:
        key_mode, lane_of = "5K", {c: c - 1 for c in range(1, 6)}

    notes: list[dict[str, Any]] = []
    for r in raw:
        note: dict[str, Any] = {"beat": r["beat"], "t": tempo.beat_to_ms(r["beat"]), "lane": lane_of[r["column"]], "type": r["type"]}
        if r["type"] == "hold":
            note["endBeat"] = r["endBeat"]
            note["endT"] = tempo.beat_to_ms(r["endBeat"])
        s = snd(r["oid"])
        if s is not None:
            note["snd"] = s
        notes.append(note)
    notes, dropped = drop_conflicts(notes)
    bgm = []
    for measure, fraction, oid in channels.get("01", []):
        s = snd(oid)
        if s is not None:
            b = beat_of(measure, fraction)
            bgm.append({"beat": b, "t": tempo.beat_to_ms(b), "snd": s})
    bgm.sort(key=lambda e: (e["t"], e["snd"]))
    choke_slices(bgm, notes)

    try:
        level = int(float(head.get("DIFFICULTY", "0")))
    except ValueError:
        level = 0
    playlevel = head.get("PLAYLEVEL", "")
    # its name: the subtitle, else its difficulty's (the level it gives goes beside it: sourceLevel), else that level
    chart_name = head.get("SUBTITLE", "") or DIFFICULTY_NAMES.get(level, "") or (f"Lv.{playlevel}" if playlevel else "")
    return ParsedChart(
        format="bms",
        key_mode=key_mode,
        title=head.get("TITLE", "") or "Untitled",
        artist=head.get("ARTIST", ""),
        chart_name=chart_name.strip(),
        timing=timing,
        notes=notes,
        bgm=bgm,
        sounds=sounds,
        genre=head.get("GENRE", ""),
        level_hint=head.get("PLAYLEVEL", ""),
        images=[name for name in (head.get("STAGEFILE", ""), head.get("BANNER", "")) if name],
        source_name=source_name,
        dropped=dropped,
    )
