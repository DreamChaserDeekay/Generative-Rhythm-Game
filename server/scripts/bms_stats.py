#!/usr/bin/env python3
"""Pattern statistics of BMS charts, to tune the generator against human-made charts.

    python bms_stats.py CHART_FOLDER [-o bms_stats.json] [--rows bms_rows.jsonl.gz] [--jobs N]

Reads every .bms / .bme / .bml / .pms / .bmson under the folder (also inside .zip files) and writes
counts and distributions per key mode and level bucket. Nothing of a chart goes into the output: no
titles, artists, sound names or note lists, only numbers summed over many charts, and with --rows one
row of numbers per chart. Standard library only, so it runs on the machine that holds the charts and
the charts never leave it. `chart_features` also measures our own generated charts the same way
(server/scripts/compare_bms.py).

Conventions (as in difficulty/patterns.py and guides.py): lane 0 is the scratch, keys are 1..K from
the left; a fast move is closer than FAST_MS; keys left of the middle are the left hand, right of it
the right hand, and the middle key of an odd key count (7K key 4, 5K key 3, 9K button 5) belongs to
either hand.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import random
import re
import sys
import time
import zipfile
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from fractions import Fraction
from typing import Any, Iterable

CHART_EXT = (".bms", ".bme", ".bml", ".pms", ".bmson")
FAST_MS = 260.0  # moves closer than this are fast (patterns.FAST_MS)
RUN_MS = 400.0  # single notes closer than this form a run (patterns.RUN_MS)
GAP_BINS_MS = (100.0, 150.0, 200.0, 260.0, 400.0, 600.0)  # time to the previous note, for the move tables
BAR_NOTES = 10  # key notes from which a bar is held to the hands' share band (BMS-Generator)
BAR_BAND = (0.3, 0.7)
GRID = (1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48)  # beat subdivisions a note position is read on
LN_BINS = (0.5, 1.0, 2.0, 4.0)  # long-note length bins, in beats
VERSION = 1

# key layouts: hand of keys 1..K (L / R / T = the middle key, either hand); the scratch is left
LAYOUTS = {"7K+1S": "LLLTRRR", "5K+1S": "LLTRR", "9K": "LLLLTRRRR"}

# BMS channels -> lane (0 = scratch, 1..7 = keys) for beat charts; PMS uses its own buttons
BEAT_CHANNELS = {"16": 0, "11": 1, "12": 2, "13": 3, "14": 4, "15": 5, "18": 6, "19": 7}
PMS_CHANNELS = {"11": 1, "12": 2, "13": 3, "14": 4, "15": 5, "22": 6, "23": 7, "24": 8, "25": 9}

# keysound families, read from the sound's file name (tokens of letters); first match wins
FAMILIES = (
    ("kick", ("kick", "kik", "bassdrum"), ("bd", "kk")),
    ("snare", ("snare", "snr", "clap", "rimshot"), ("sd", "sn", "cp", "rim")),
    ("hihat", ("hihat", "hat"), ("hh", "oh", "ch", "ohh", "chh")),
    ("cymbal", ("crash", "ride", "cymbal", "china", "splash"), ("cy", "cym")),
    ("tom", ("tom",), ()),
    ("perc", ("perc", "shaker", "tamb", "conga", "bongo", "cowbell", "clave"), ()),
    ("bass", ("bass",), ("bs", "ba", "sb")),
    ("piano", ("piano", "rhodes", "keys"), ("pf", "pno", "ep", "pi")),
    ("guitar", ("guitar", "gtr"), ("gt", "gu", "eg", "ag")),
    ("synth", ("synth", "lead", "saw", "square", "arp", "pluck", "bell"), ("syn", "ld", "sq")),
    ("pad", ("pad", "string", "strings", "choir", "brass", "organ"), ("str", "st", "org")),
    ("vocal", ("vocal", "voice", "vox", "chorus"), ("vo", "vc")),
    ("fx", ("sweep", "noise", "riser", "impact"), ("fx", "se", "sfx")),
)


class ChartError(ValueError):
    """A file we do not measure (and why)."""


# ---------------------------------------------------------------- reading


def decode_text(data: bytes) -> str:
    """BMS files are usually Shift_JIS, sometimes EUC-KR (cp949) or UTF-8 (formats/bms.py)."""
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    for enc in ("cp932", "cp949"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def resolve_control_flow(lines: list[str], rng: random.Random) -> list[str]:
    """#RANDOM / #IF / #ELSEIF / #ELSE / #ENDIF / #ENDRANDOM, one draw per #RANDOM."""
    out: list[str] = []
    randoms: list[int] = []
    frames: list[list[bool]] = []  # [parent active, a branch was taken, this branch active]
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
            parent = all(f[2] for f in frames)
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
        elif all(f[2] for f in frames):
            out.append(line)
    return out


class Timeline:
    """Beats -> ms over tempo changes and stops (objects on a stop's beat play before it)."""

    def __init__(self, init_bpm: float, changes: Iterable[tuple[float, float]], stops: Iterable[tuple[float, float]]):
        points: list[tuple[float, float]] = []
        for b, bpm in [(0.0, init_bpm), *sorted(changes)]:
            if bpm <= 0:
                continue
            if points and abs(points[-1][0] - b) < 1e-9:
                points[-1] = (b, bpm)
            else:
                points.append((b, bpm))
        self.beats: list[float] = []
        self.ms: list[float] = []
        self.mpb: list[float] = []
        t = 0.0
        for i, (b, bpm) in enumerate(points):
            if i:
                t += (b - points[i - 1][0]) * self.mpb[-1]
            self.beats.append(b)
            self.ms.append(t)
            self.mpb.append(60000.0 / bpm)
        self.stop_beats: list[float] = []
        self.stop_acc: list[float] = []
        acc = 0.0
        for b, length in sorted(stops):
            if length <= 0:
                continue
            acc += length * self.ms_per_beat(b)
            self.stop_beats.append(b)
            self.stop_acc.append(acc)

    def ms_per_beat(self, beat: float) -> float:
        return self.mpb[max(0, bisect_right(self.beats, beat) - 1)]

    def to_ms(self, beat: float) -> float:
        i = max(0, bisect_right(self.beats, beat) - 1)
        t = self.ms[i] + (beat - self.beats[i]) * self.mpb[i]
        j = bisect_left(self.stop_beats, beat - 1e-9)
        return t + (self.stop_acc[j - 1] if j else 0.0)


class Chart:
    """One chart on a common footing: notes as (beat, t ms, lane, end beat or None, end ms, sound,
    beat from the start of its bar)."""

    def __init__(self, mode: str, level: int | None, difficulty: int | None, bpm: float):
        self.mode = mode
        self.level = level
        self.difficulty = difficulty
        self.bpm = bpm
        self.notes: list[tuple[Fraction, float, int, Fraction | None, float | None, str, Fraction]] = []
        self.bgm: list[str] = []  # sound names of the background objects (for the keysound families)
        self.beats_per_bar: list[float] = []  # bar lengths in beats, from the start


def _level(text: str) -> int | None:
    m = re.search(r"\d+", text or "")
    return int(m.group()) if m else None


def _exact(text: str) -> Fraction:
    try:
        return Fraction(text.strip())
    except (ValueError, ZeroDivisionError):
        return Fraction(1)


def parse_bms(data: bytes, name: str, seed: int = 0) -> Chart:
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
            else:
                try:
                    (stop_defs if kind == "STOP" else bpm_defs)[oid] = float(value)
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
        raise ChartError("bad bpm")

    ratio: dict[int, Fraction] = {}
    channels: dict[str, list[tuple[int, int, int, str]]] = defaultdict(list)  # (measure, i, n, id)
    for measure, channel, payload in data_lines:
        if channel == "02":
            ratio[measure] = _exact(payload)
            continue
        payload = payload.replace(" ", "")
        n = len(payload) // 2
        for i in range(n):
            oid = payload[2 * i : 2 * i + 2].upper()
            if oid != "00":
                channels[channel].append((measure, i, n, oid))
    last = max([m for m, _, _ in data_lines] + [0])
    starts: list[Fraction] = []
    lengths: list[Fraction] = []
    pos = Fraction(0)
    for m in range(last + 2):
        starts.append(pos)
        lengths.append(4 * ratio.get(m, Fraction(1)))
        pos += lengths[-1]

    def beat_of(measure: int, i: int, n: int) -> Fraction:
        return starts[measure] + Fraction(i, n) * lengths[measure]

    def in_bar(measure: int, i: int, n: int) -> Fraction:
        return Fraction(i, n) * lengths[measure]

    changes = [(float(beat_of(m, i, n)), float(int(oid, 16))) for m, i, n, oid in channels.get("03", []) if re.fullmatch(r"[0-9A-F]{2}", oid)]
    changes += [(float(beat_of(m, i, n)), bpm_defs[oid]) for m, i, n, oid in channels.get("08", []) if bpm_defs.get(oid, 0) > 0]
    stops = [(float(beat_of(m, i, n)), stop_defs[oid] / 48.0) for m, i, n, oid in channels.get("09", []) if stop_defs.get(oid, 0) > 0]
    timeline = Timeline(init_bpm, changes, stops)

    used = {ch for ch, objs in channels.items() if objs}
    pms = name.lower().endswith(".pms") or ({"22", "23", "24", "25"} & used and not {"16", "18", "19"} & used and not {"21", "26", "27", "28", "29"} & used)
    if pms:
        mode, layout = "9K", PMS_CHANNELS
    elif any(ch[0] in "26" and ch[1] in "123456789" for ch in used):
        raise ChartError("double play")
    else:
        mode = "7K+1S" if {"18", "19", "58", "59"} & used else "5K+1S"
        layout = BEAT_CHANNELS
    ln_layout = {str(int(ch[0]) + 4) + ch[1]: lane for ch, lane in layout.items()}

    chart = Chart(mode, _level(head.get("PLAYLEVEL", "")), _level(head.get("DIFFICULTY", "")), init_bpm)
    chart.beats_per_bar = [float(x) for x in lengths[: last + 1]]
    raw: list[list[Any]] = []  # [beat, lane, end beat, sound, beat in its bar]
    by_lane: dict[int, list[tuple[Fraction, str, Fraction]]] = defaultdict(list)
    for ch, lane in layout.items():
        for m, i, n, oid in channels.get(ch, []):
            by_lane[lane].append((beat_of(m, i, n), oid, in_bar(m, i, n)))
    for lane, objs in by_lane.items():
        objs.sort()
        prev: list[Any] | None = None
        for b, oid, pos in objs:
            if oid in lnobj and prev is not None:
                if prev[2] is None and b > prev[0]:
                    prev[2] = b  # #LNOBJ ends the previous note of the lane as a long note
                continue
            prev = [b, lane, None, wav.get(oid, ""), pos]
            raw.append(prev)
    for ch, lane in ln_layout.items():
        objs = sorted((beat_of(m, i, n), oid, in_bar(m, i, n)) for m, i, n, oid in channels.get(ch, []))
        for (b0, oid, pos), (b1, _, _) in zip(objs[0::2], objs[1::2]):
            if b1 > b0:
                raw.append([b0, lane, b1, wav.get(oid, ""), pos])
    if not raw:
        raise ChartError("no notes")
    for b, lane, end, sound, pos in raw:
        chart.notes.append((b, timeline.to_ms(float(b)), lane, end, timeline.to_ms(float(end)) if end is not None else None, sound, pos))
    chart.bgm = [wav.get(oid, "") for _, _, _, oid in channels.get("01", [])]
    chart.notes = drop_conflicts(chart.notes)
    return chart


def parse_bmson(data: bytes, name: str) -> Chart:
    try:
        doc = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ChartError("bad bmson") from e
    if not isinstance(doc, dict) or "sound_channels" not in doc:
        raise ChartError("old bmson")
    info = doc.get("info") or {}
    res = float(info.get("resolution") or 240)
    init_bpm = float(info.get("init_bpm") or 130.0)
    if res <= 0 or init_bpm <= 0:
        raise ChartError("bad bmson timing")
    hint = str(info.get("mode_hint") or "beat-7k")
    if hint.startswith("beat-7k"):
        mode, lanes = "7K+1S", {8: 0, **{x: x for x in range(1, 8)}}
    elif hint.startswith("beat-5k"):
        mode, lanes = "5K+1S", {8: 0, **{x: x for x in range(1, 6)}}
    elif hint.startswith("popn-9k"):
        mode, lanes = "9K", {x: x for x in range(1, 10)}
    else:
        raise ChartError(f"mode {hint}")
    changes = [(float(e["y"]) / res, float(e["bpm"])) for e in doc.get("bpm_events") or []]
    stops = [(float(e["y"]) / res, float(e.get("duration", 0)) / res) for e in doc.get("stop_events") or []]
    timeline = Timeline(init_bpm, changes, stops)
    chart = Chart(mode, _level(str(info.get("level", ""))), None, init_bpm)
    lines = sorted({int(l["y"]) for l in doc.get("lines") or []})
    if not lines or lines[0] > 0:
        lines = [0, *lines]
    chart.beats_per_bar = [(b - a) / res for a, b in zip(lines, lines[1:]) if b > a]
    seen: set[tuple[int, int]] = set()
    for channel in doc["sound_channels"]:
        sound = str(channel.get("name") or "")
        for n in channel.get("notes") or []:
            x = int(n.get("x") or 0)
            if x == 0 or x not in lanes:
                chart.bgm.append(sound)
                continue
            key = (x, int(n["y"]))
            if key in seen:
                continue
            seen.add(key)
            y = int(n["y"])
            b = Fraction(y, int(res)) if float(res).is_integer() else Fraction(y / res)
            length = float(n.get("l") or 0)
            end = b + Fraction(length) / Fraction(res) if length > 0 else None
            bar_y = lines[max(0, bisect_right(lines, y) - 1)]
            pos = Fraction(y - bar_y, int(res)) if float(res).is_integer() else Fraction((y - bar_y) / res)
            chart.notes.append((b, timeline.to_ms(float(b)), lanes[x], end, timeline.to_ms(float(end)) if end is not None else None, sound, pos))
    if not chart.notes:
        raise ChartError("no notes")
    chart.notes = drop_conflicts(chart.notes)
    return chart


def drop_conflicts(notes: list[tuple]) -> list[tuple]:
    """Stacked notes and notes inside a long note of their lane: keep the first (common.py)."""
    kept: list[tuple] = []
    last_end: dict[int, float] = {}
    for n in sorted(notes, key=lambda n: (n[1], n[2], 0 if n[3] is not None else 1)):
        lane = n[2]
        if lane in last_end and n[1] <= last_end[lane] + 1e-3:
            continue
        kept.append(n)
        last_end[lane] = n[4] if n[4] is not None else n[1]
    return kept


def parse_chart(data: bytes, name: str) -> Chart:
    return parse_bmson(data, name) if name.lower().endswith(".bmson") else parse_bms(data, name)


# ---------------------------------------------------------------- measuring


def family(sound: str) -> str:
    """Keysound family from the file name ("other" when nothing matches)."""
    tokens = re.findall(r"[a-z]+", os.path.splitext(os.path.basename(sound.replace("\\", "/")))[0].lower())
    for fam, prefixes, exact in FAMILIES:
        for tok in tokens:
            if tok in exact or any(tok.startswith(p) for p in prefixes):
                return fam
    return "other"


def _gap_bin(ms: float) -> str:
    for edge in GAP_BINS_MS:
        if ms <= edge:
            return f"<={edge:g}"
    return f">{GAP_BINS_MS[-1]:g}"


def _grid(beat: Fraction | float) -> int:
    """The coarsest subdivision of the beat a position sits on (0 = none of GRID)."""
    frac = beat - math.floor(beat)
    if not isinstance(frac, Fraction):
        frac = Fraction(frac).limit_denominator(192)
    for d in GRID:
        if (frac * d).denominator == 1:
            return d
    return 0


def _hist_add(h: dict, key: Any, n: float = 1) -> None:
    key = str(key)
    h[key] = h.get(key, 0) + n


def chart_features(notes: list[tuple], mode: str, beats_per_bar: list[float] | None = None, bgm: list[str] | None = None) -> tuple[dict[str, float], dict[str, dict]]:
    """Per-chart numbers (row) and histograms (summed per group). `notes` are (beat, t, lane, end
    beat, end t, sound[, beat in its bar]) with lane 0 = scratch and keys 1..K of LAYOUTS[mode];
    the rhythm grid is read from the bar line (from the beat when that is missing)."""
    hands = LAYOUTS[mode]
    k_count = len(hands)
    hand = {k + 1: h for k, h in enumerate(hands)}
    keys = sorted((n for n in notes if 1 <= n[2] <= k_count), key=lambda n: (n[1], n[2]))
    scratch = [n for n in notes if n[2] == 0]
    hist: dict[str, dict] = defaultdict(dict)
    row: dict[str, float] = {"notes": len(keys), "scratch": len(scratch)}
    if len(keys) < 20:
        raise ChartError("too few notes")
    # instants (key notes at one time)
    instants: list[tuple[float, Fraction | float, list[int], Fraction | float]] = []  # (t, beat, keys, beat in bar)
    for n in keys:
        if instants and abs(n[1] - instants[-1][0]) <= 1.0:
            instants[-1][2].append(n[2])
        else:
            instants.append((n[1], n[0], [n[2]], n[6] if len(n) > 6 else n[0]))
    first, end = keys[0][1], max(n[4] if n[4] is not None else n[1] for n in keys)
    dur = max(1.0, (end - first) / 1000.0)
    row["seconds"] = round(dur, 2)
    row["nps"] = round(len(keys) / dur, 3)
    times = [n[1] for n in keys]
    peak, j = 0, 0
    for i, t in enumerate(times):
        while times[j] < t - 2000.0:
            j += 1
        peak = max(peak, i - j + 1)
    row["peakNps"] = round(peak / 2.0, 2)
    lns = [n for n in keys if n[3] is not None]
    row["ln"] = round(len(lns) / len(keys), 4)
    for n in lns:
        length = float(n[3] - n[0])
        _hist_add(hist["lnBeats"], next((f"<{e:g}" for e in LN_BINS if length < e), f">={LN_BINS[-1]:g}"))
    row["scratchShare"] = round(len(scratch) / (len(keys) + len(scratch)), 4)
    for lane in (n[2] for n in notes):
        _hist_add(hist["lane"], lane)

    # chords and rhythm
    sizes = Counter(len(ls) for _, _, ls, _ in instants)
    for s, c in sizes.items():
        _hist_add(hist["chordSize"], min(s, 7), c)
    row["chord"] = round(sum(c for s, c in sizes.items() if s >= 2) / len(instants), 4)
    grid = Counter(_grid(pos) for _, _, _, pos in instants)
    for d, c in grid.items():
        _hist_add(hist["grid"], d, c)
    total = len(instants)
    row["onBeat"] = round(grid.get(1, 0) / total, 4)
    row["eighth"] = round(grid.get(2, 0) / total, 4)
    row["sixteenth"] = round(grid.get(4, 0) / total, 4)
    row["triplet"] = round(sum(grid.get(d, 0) for d in (3, 6, 12, 24)) / total, 4)
    row["fine"] = round(sum(grid.get(d, 0) for d in (8, 16, 32, 48, 0)) / total, 4)
    for (ta, ba, _, _), (tb, bb, _, _) in zip(instants, instants[1:]):
        gap = bb - ba
        g = gap if isinstance(gap, Fraction) else Fraction(gap).limit_denominator(48)
        _hist_add(hist["gapBeats"], str(g.limit_denominator(48)) if g <= 4 else ">4")

    # chord shapes
    pairs = adjacent = symmetric = one_gap = 0
    for _, _, ls, _ in instants:
        ls = sorted(ls)
        if len(ls) == 2:
            a, b = ls
            pairs += 1
            _hist_add(hist["pair"], f"{a}-{b}")
            same = hand[a] == hand[b] != "T"
            adjacent += same and b - a == 1
            one_gap += same and b - a > 1
            symmetric += a + b == k_count + 1
        elif len(ls) >= 3:
            _hist_add(hist["shape"], "-".join(map(str, ls)))
    row["adjacent2"] = round(adjacent / pairs, 4) if pairs else -1
    row["symmetric2"] = round(symmetric / pairs, 4) if pairs else -1
    row["oneHandGap2"] = round(one_gap / pairs, 4) if pairs else -1

    # moves between single notes, jacks, runs
    jack = jack_streaks = 0
    streak: dict[int, int] = {}
    prev_t: float | None = None
    for t, _, ls, _ in instants:
        close = prev_t is not None and t - prev_t <= FAST_MS
        streak = {lane: (streak.get(lane, 0) + 1 if close else 1) for lane in ls}
        jack += sum(1 for lane in ls if streak[lane] >= 2)
        jack_streaks += sum(1 for lane in ls if streak[lane] == 3)
        prev_t = t
    row["jack"] = round(jack / len(keys), 4)
    row["jackStreaks"] = round(1000.0 * jack_streaks / len(keys), 2)
    run: list[tuple[float, int]] = []
    runs: list[list[tuple[float, int]]] = []
    prev_t = None
    for t, _, ls, _ in instants + [(float("inf"), 0, [0, 0], 0)]:
        if len(ls) == 1 and run and prev_t is not None and t - prev_t <= RUN_MS:
            run.append((t, ls[0]))
        else:
            if len(run) >= 2:
                runs.append(run)
            run = [(t, ls[0])] if len(ls) == 1 else []
        prev_t = t
    fast = stairs = trills = hand_runs = hand_runs_x = anchors = doubles = 0
    for r in runs:
        lanes = [l for _, l in r]
        for (ta, a), (tb, b) in zip(r, r[1:]):
            gb = _gap_bin(tb - ta)
            _hist_add(hist["move:" + gb], b - a)
            ha, hb = hand[a], hand[b]
            _hist_add(hist["handMove"], f"{gb}:{'T' if 'T' in (ha, hb) else ('same' if ha == hb else 'cross')}")
        fast += len(lanes)
        i = 0
        while i < len(lanes) - 2:  # stairs: one key at a time, the same way, three notes or more
            step = lanes[i + 1] - lanes[i]
            j = i + 1
            while abs(step) == 1 and j + 1 < len(lanes) and lanes[j + 1] - lanes[j] == step:
                j += 1
            if abs(step) == 1 and j - i + 1 >= 3:
                stairs += j - i + 1
                i = j
            else:
                i += 1
        i = 0
        while i < len(lanes) - 3:  # trills: two keys in turn, four notes or more
            j = i + 1
            while lanes[i] != lanes[i + 1] and j + 1 < len(lanes) and lanes[j + 1] == lanes[j - 1]:
                j += 1
            if j - i + 1 >= 4:
                trills += j - i + 1
                i = j
            else:
                i += 1
        side, length = None, 0
        for idx, k in enumerate(lanes):  # the third and later note in a row on one hand (T ends a run)
            h = hand[k]
            length = 0 if h == "T" else length + 1 if h == side else 1
            side = h
            if length >= 3:
                hand_runs += 1
                stair = idx >= 2 and abs(k - lanes[idx - 1]) == 1 and k - lanes[idx - 1] == lanes[idx - 1] - lanes[idx - 2]
                hand_runs_x += not stair
        i = 0
        while i < len(lanes) - 2:  # anchors: a key on every other note, four hits or more
            j = i
            while j + 2 < len(lanes) and lanes[j + 2] == lanes[i] and lanes[j + 1] != lanes[i] and (j == i or lanes[j + 1] != lanes[j - 1]):
                j += 2
            if (j - i) // 2 + 1 >= 4:
                anchors += 1
                i = j + 1
            else:
                i += 1
        doubles += sum(1 for i in range(len(lanes) - 3) if lanes[i] == lanes[i + 1] != lanes[i + 2] == lanes[i + 3] and hand[lanes[i]] != hand[lanes[i + 2]])
    row["runNotes"] = round(fast / len(keys), 4)
    row["stairs"] = round(stairs / fast, 4) if fast else 0.0
    row["trills"] = round(trills / fast, 4) if fast else 0.0
    row["handRuns"] = round(hand_runs / fast, 4) if fast else 0.0
    row["handRunsNoStair"] = round(hand_runs_x / fast, 4) if fast else 0.0
    row["anchors"] = round(1000.0 * anchors / len(keys), 2)
    row["doubles"] = round(1000.0 * doubles / len(keys), 2)

    # hands per bar, and density over 4-bar windows
    bar_of = _bar_index(beats_per_bar)
    bars: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for n in keys:
        b = bar_of(float(n[0]))
        h = hand[n[2]]
        bars[b][0] += 1.0 if h == "L" else 0.5 if h == "T" else 0.0
        bars[b][1] += 1.0 if h == "R" else 0.5 if h == "T" else 0.0
    full = [v for v in bars.values() if sum(v) >= BAR_NOTES]
    row["offBars"] = round(sum(1 for l, r in full if not BAR_BAND[0] <= l / (l + r) <= BAR_BAND[1]) / len(full), 4) if full else -1
    left = sum(v[0] for v in bars.values())
    row["leftShare"] = round(left / max(1e-9, sum(sum(v) for v in bars.values())), 4)
    if bars:
        last_bar = max(bars)
        windows = [sum(sum(bars.get(b, (0, 0))) for b in range(w, w + 4)) for w in range(0, last_bar + 1, 4)]
        mean = sum(windows) / len(windows)
        row["densityCv"] = round(math.sqrt(sum((x - mean) ** 2 for x in windows) / len(windows)) / mean, 4) if mean > 0 else 0.0

    # which sounds become notes (keysound file names), and on which lanes
    for n in notes:
        fam = family(n[5]) if n[5] else "none"
        _hist_add(hist["noteFamily"], fam)
        _hist_add(hist["familyLane"], f"{fam}:{n[2]}")
    for sound in bgm or []:
        _hist_add(hist["bgmFamily"], family(sound) if sound else "none")
    return row, dict(hist)


def _bar_index(beats_per_bar: list[float] | None):
    if not beats_per_bar:
        return lambda beat: int(beat // 4.0)
    starts = [0.0]
    for length in beats_per_bar:
        starts.append(starts[-1] + length)

    def bar(beat: float) -> int:
        i = bisect_right(starts, beat + 1e-9) - 1
        if i < len(beats_per_bar):
            return i
        return len(beats_per_bar) + int((beat - starts[-1]) // 4.0)

    return bar


def level_bucket(level: int | None) -> str:
    """#PLAYLEVEL in steps of three (BMS normal levels go to 12; insane charts often write more)."""
    if level is None or level <= 0:
        return "?"
    for lo, hi in ((1, 3), (4, 6), (7, 9), (10, 12)):
        if lo <= level <= hi:
            return f"{lo}-{hi}"
    return "13+"


NPS_BINS = (3.0, 5.0, 7.0, 9.0, 12.0, 16.0)


def nps_bucket(nps: float) -> str:
    """Notes per second in bins, to compare charts of the same density whatever their level."""
    lo = 0.0
    for hi in NPS_BINS:
        if nps < hi:
            return f"{lo:g}-{hi:g}"
        lo = hi
    return f"{NPS_BINS[-1]:g}+"


# ---------------------------------------------------------------- the run over a folder


def iter_files(root: str) -> Iterable[tuple[str, str | None]]:
    """(path, member): chart files under `root`, and charts inside .zip files there."""
    for folder, _, files in os.walk(root):
        for f in files:
            path = os.path.join(folder, f)
            low = f.lower()
            if low.endswith(CHART_EXT):
                yield path, None
            elif low.endswith(".zip"):
                try:
                    with zipfile.ZipFile(path) as z:
                        for member in z.namelist():
                            if member.lower().endswith(CHART_EXT):
                                yield path, member
                except (zipfile.BadZipFile, OSError):
                    continue


def measure_file(item: tuple[str, str | None]) -> tuple[str, Any]:
    """('ok', (group, row, hist, fingerprint)) or ('skip', reason)."""
    path, member = item
    try:
        if member is None:
            with open(path, "rb") as f:
                data = f.read()
            name = path
        else:
            with zipfile.ZipFile(path) as z:
                data = z.read(member)
            name = member
        chart = parse_chart(data, name)
        row, hist = chart_features(chart.notes, chart.mode, chart.beats_per_bar, chart.bgm)
    except ChartError as e:
        return "skip", str(e).split(":")[0]
    except Exception as e:  # a broken file must not stop a run over thousands
        return "skip", "error " + type(e).__name__
    row.update(mode=chart.mode, level=chart.level if chart.level is not None else -1, difficulty=chart.difficulty or 0, bpm=round(chart.bpm, 2))
    fingerprint = hashlib.sha1(json.dumps([(round(n[1]), n[2]) for n in chart.notes]).encode()).hexdigest()[:16]
    return "ok", (groups_of(chart.mode, chart.level, row["nps"]), row, hist, fingerprint)


def groups_of(mode: str, level: int | None, nps: float) -> list[str]:
    """The groups a chart counts in: by its level, and by its density."""
    return [f"{mode}|lv {level_bucket(level)}", f"{mode}|nps {nps_bucket(nps)}"]


SCALARS = (
    "notes", "scratch", "seconds", "nps", "peakNps", "ln", "scratchShare", "chord", "onBeat", "eighth", "sixteenth",
    "triplet", "fine", "adjacent2", "symmetric2", "oneHandGap2", "jack", "jackStreaks", "runNotes", "stairs", "trills",
    "handRuns", "handRunsNoStair", "anchors", "doubles", "offBars", "leftShare", "densityCv", "bpm",
)


class Aggregate:
    """Sums per group: chart count, scalar sums / squares / counts, and summed histograms."""

    def __init__(self) -> None:
        self.groups: dict[str, dict[str, Any]] = {}

    def add(self, group: str, row: dict[str, float], hist: dict[str, dict]) -> None:
        g = self.groups.setdefault(group, {"charts": 0, "sum": {}, "sq": {}, "n": {}, "hist": {}, "levels": {}})
        g["charts"] += 1
        _hist_add(g["levels"], row.get("level", -1))
        for k in SCALARS:
            v = row.get(k)
            if v is None or v == -1:
                continue
            g["sum"][k] = g["sum"].get(k, 0.0) + v
            g["sq"][k] = g["sq"].get(k, 0.0) + v * v
            g["n"][k] = g["n"].get(k, 0) + 1
        for name, h in hist.items():
            target = g["hist"].setdefault(name, {})
            for key, c in h.items():
                target[key] = target.get(key, 0) + c

    def summary(self) -> dict[str, Any]:
        out = {}
        for group, g in sorted(self.groups.items()):
            mean = {k: round(g["sum"][k] / g["n"][k], 4) for k in g["sum"]}
            sd = {k: round(math.sqrt(max(0.0, g["sq"][k] / g["n"][k] - (g["sum"][k] / g["n"][k]) ** 2)), 4) for k in g["sum"]}
            out[group] = {"charts": g["charts"], "levels": g["levels"], "mean": mean, "sd": sd, "hist": g["hist"]}
        return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("folder")
    ap.add_argument("-o", "--out", default="bms_stats.json")
    ap.add_argument("--rows", help="also write one row of numbers per chart (.jsonl or .jsonl.gz)")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--limit", type=int, default=0, help="measure only the first N files (a quick check)")
    args = ap.parse_args()
    items = list(iter_files(args.folder))
    if args.limit:
        items = items[: args.limit]
    print(f"{len(items)} chart files under {args.folder}", flush=True)
    agg = Aggregate()
    skipped: Counter = Counter()
    seen: set[str] = set()
    rows_out = None
    if args.rows:
        rows_out = gzip.open(args.rows, "wt", encoding="utf-8") if args.rows.endswith(".gz") else open(args.rows, "w", encoding="utf-8")
    t0 = time.time()
    results: Iterable[tuple[str, Any]]
    if args.jobs > 1:
        import multiprocessing

        pool = multiprocessing.Pool(args.jobs)
        results = pool.imap_unordered(measure_file, items, chunksize=32)
    else:
        pool = None
        results = map(measure_file, items)
    done = 0
    for status, payload in results:
        done += 1
        if status == "skip":
            skipped[payload] += 1
        else:
            groups, row, hist, fingerprint = payload
            if fingerprint in seen:
                skipped["duplicate"] += 1
            else:
                seen.add(fingerprint)
                for group in groups:
                    agg.add(group, row, hist)
                if rows_out is not None:
                    rows_out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        if done % 2000 == 0:
            print(f"  {done}/{len(items)} ({time.time() - t0:.0f}s)", flush=True)
    if pool is not None:
        pool.close()
        pool.join()
    if rows_out is not None:
        rows_out.close()
    report = {
        "version": VERSION,
        "files": len(items),
        "charts": len(seen),
        "skipped": dict(skipped),
        "settings": {"fastMs": FAST_MS, "runMs": RUN_MS, "gapBinsMs": GAP_BINS_MS, "barNotes": BAR_NOTES, "barBand": BAR_BAND, "npsBins": NPS_BINS},
        "groups": agg.summary(),
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(seen)} charts measured, skipped {dict(skipped)}; wrote {args.out} in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    sys.exit(main())
