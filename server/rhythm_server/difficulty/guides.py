"""Measures for the community pattern guides (docs/PATTERN_DESIGN.md 14): what pattern makers ask of
a chart, as numbers. Works on any chart; the arc needs a section table and the scale measures need
the pitch of the notes (`pitch_of`, from the analysis onsets).

- arc (기승전결: build up, then the hard part). repeatGrowth: a repetition group's last occurrence
  against its first, in notes per beat (1 = no build-up), averaged over the groups that repeat.
  halfRatio: the second half of the song against the first, intro and outro left out. peakAt: where
  the densest 8 bars sit (0 = start, 1 = end).
- scale (음계: low notes left, high notes right). contour: share of the pitch steps between
  neighbouring single notes that move the lane the same way. pitchOrder: rank agreement (Kendall
  tau) of pitch and lane among the single notes of every 2 bars.
- hands (재미·손배치). unmotivatedJacks: fast repeats of a single note's lane by a single note of a
  different sound (억지 연타), per 100 key notes. fingerLoad: the busiest finger's share of a dense 2-bar window (95th percentile). anchors:
  one lane struck every other note four or more times in a fast run (축연타), per 1000 key notes;
  anchorMax the longest. handStreaks: share of the fast single notes inside a run of six or more on
  one hand. doubles: 재봉틀, two hits on a key then two on the other hand's key (RR LL), per 1000 key
  notes.
- balance (손 분배). lopsided: share of the busy 2-bar windows with 80% or more of the notes on one
  hand. shapeLeft: the left hand's share of the stair and trill notes (0.5 = both hands alike).
- pivots (5B): two-note chords that alternate left key + middle key and middle key + right key, as a
  share of the two-note chords (key modes with a shared middle key).
"""

from __future__ import annotations

from typing import Any, Callable

import numpy as np

from ..config import key_modes
from .consistency import section_spans
from .patterns import RUN_MS

FAST_MS = 260.0  # moves closer than this are fast (same threshold as the pattern profile)
WINDOW_BEATS = 8.0  # two bars of 4/4: the window of the balance and finger measures
PEAK_BEATS = 32.0  # eight bars: the window of the arc's peak
BUSY_NOTES = 8  # key notes from which a window counts for the hand balance
DENSE_NOTES = 12  # key notes from which a window counts for the finger load
LOPSIDED = 0.8  # one hand's share from which a window is lopsided
ANCHOR_HITS = 4  # hits of one lane, every other note, that make an anchor
STREAK = 6  # fast single notes in a row on one hand that make a streak
PIVOT_MS = 600.0  # two-note chords closer than this answer each other
SAME_PITCH = 0.5  # semitones


PitchOf = Callable[[float], float | None]


def _layout(key_mode: str) -> tuple[dict[int, int], list[str], list[tuple[str, int]], int | None]:
    """Key index per lane, hand and finger per key index, and the shared middle key (or None)."""
    lanes = key_modes()[key_mode]["lanes"]
    keys = [i for i, lane in enumerate(lanes) if lane["kind"] == "key"]
    hands = [lanes[i]["hand"] for i in keys]
    fingers = [(lanes[i]["hand"], int(lanes[i]["finger"])) for i in keys]
    center = next((k for k, h in enumerate(hands) if h == "T"), None)
    return {lane: k for k, lane in enumerate(keys)}, hands, fingers, center


def _round(x: float | None, digits: int = 3) -> float | None:
    return None if x is None else round(float(x), digits)


def _events(notes: list[dict[str, Any]], index: dict[int, int]) -> list[tuple[float, float, list[dict[str, Any]]]]:
    """(time, beat, key notes) per instant, in time order."""
    by_t: dict[float, list[dict[str, Any]]] = {}
    for n in notes:
        if int(n["lane"]) in index:
            by_t.setdefault(round(float(n["t"]), 1), []).append(n)
    return [(t, float(v[0]["beat"]), sorted(v, key=lambda n: index[int(n["lane"])])) for t, v in sorted(by_t.items())]


def arc(notes: list[dict[str, Any]], sections: list[dict[str, Any]] | None, end_beat: float | None = None) -> dict[str, float | None]:
    beats = np.sort(np.array([float(n["beat"]) for n in notes]))
    out: dict[str, float | None] = {"repeatGrowth": None, "halfRatio": None, "peakAt": None}
    if len(beats) < 2:
        return out

    def density(a: float, b: float) -> float:
        if b <= a:
            return 0.0
        return float(np.searchsorted(beats, b, "left") - np.searchsorted(beats, a, "left")) / (b - a)

    spans = section_spans(sections, end_beat if end_beat is not None else float(beats[-1]) + 1.0) if sections else []
    groups: dict[str, list[dict[str, Any]]] = {}
    for s in spans:
        if s.get("group"):
            groups.setdefault(str(s["group"]), []).append(s)
    growth = []
    for occ in groups.values():
        if len(occ) < 2:
            continue
        first = density(occ[0]["startBeat"], occ[0]["endBeat"])
        if first > 0:
            growth.append(density(occ[-1]["startBeat"], occ[-1]["endBeat"]) / first)
    out["repeatGrowth"] = _round(float(np.mean(growth))) if growth else None

    body = [s for s in spans if s.get("label") not in ("intro", "outro")]
    a, b = (body[0]["startBeat"], body[-1]["endBeat"]) if body else (float(beats[0]), float(beats[-1]))
    mid = (a + b) / 2
    first_half = density(a, mid)
    out["halfRatio"] = _round(density(mid, b) / first_half) if first_half > 0 else None

    start, end = float(beats[0]), float(beats[-1])
    if end - start > PEAK_BEATS:
        starts = np.arange(start, end - PEAK_BEATS + 1e-9, 1.0)
        counts = np.searchsorted(beats, starts + PEAK_BEATS, "left") - np.searchsorted(beats, starts, "left")
        best = float(starts[int(np.argmax(counts))]) + PEAK_BEATS / 2
        out["peakAt"] = _round((best - start) / (end - start))
    return out


def scale(notes: list[dict[str, Any]], key_mode: str, pitch_of: PitchOf) -> dict[str, float | None]:
    index, _, _, _ = _layout(key_mode)
    singles = []
    for t, beat, ns in _events(notes, index):
        # drum notes follow their own rule (kick low side, hats high side), not the scale
        if len(ns) == 1 and ns[0].get("src") != "drums":
            p = pitch_of(t)
            if p is not None:
                singles.append((t, beat, index[int(ns[0]["lane"])], p))
    agree = steps = 0
    for (ta, _, la, pa), (tb, _, lb, pb) in zip(singles, singles[1:]):
        if tb - ta > RUN_MS or abs(pb - pa) < 1.0:
            continue
        steps += 1
        agree += (lb - la) * (pb - pa) > 0
    taus = []
    if singles:
        start = singles[0][1]
        windows: dict[int, list[tuple[int, float]]] = {}
        for _, beat, lane, p in singles:
            windows.setdefault(int((beat - start) // WINDOW_BEATS), []).append((lane, p))
        for w in windows.values():
            conc = disc = 0
            for i in range(len(w)):
                for j in range(i + 1, len(w)):
                    dl, dp = w[i][0] - w[j][0], w[i][1] - w[j][1]
                    if dl == 0 or abs(dp) < SAME_PITCH:
                        continue
                    conc += dl * dp > 0
                    disc += dl * dp < 0
            if conc + disc >= 3:
                taus.append((conc - disc) / (conc + disc))
    return {
        "contour": _round(agree / steps) if steps else None,
        "pitchOrder": _round(float(np.mean(taus))) if taus else None,
    }


def _different_sound(a: dict[str, Any], b: dict[str, Any], pitch_of: PitchOf | None) -> bool | None:
    if pitch_of is not None:
        pa, pb = pitch_of(float(a["t"])), pitch_of(float(b["t"]))
        if pa is not None and pb is not None:
            return abs(pa - pb) >= SAME_PITCH
    if a.get("src") and b.get("src"):
        return a["src"] != b["src"]
    return None


def _fast_runs(events: list[tuple[float, float, list[dict[str, Any]]]], index: dict[int, int]) -> list[list[tuple[float, int]]]:
    """Stretches of single key notes, each closer than FAST_MS to the previous instant."""
    runs: list[list[tuple[float, int]]] = []
    current: list[tuple[float, int]] = []
    prev_t: float | None = None
    for t, _, ns in events:
        close = prev_t is not None and t - prev_t <= FAST_MS
        if len(ns) == 1 and current and close:
            current.append((t, index[int(ns[0]["lane"])]))
        else:
            if len(current) >= 2:
                runs.append(current)
            current = [(t, index[int(ns[0]["lane"])])] if len(ns) == 1 else []
        prev_t = t
    if len(current) >= 2:
        runs.append(current)
    return runs


def _anchors(lanes: list[int]) -> list[int]:
    """Hit counts of every anchor in a run: a lane on every other note while the notes between keep
    moving (two between notes in a row on one lane make a trill, or two trills sharing a lane)."""
    out = []
    i = 0
    while i < len(lanes) - 2:
        j = i
        while j + 2 < len(lanes) and lanes[j + 2] == lanes[i] and lanes[j + 1] != lanes[i] and (j == i or lanes[j + 1] != lanes[j - 1]):
            j += 2
        hits = (j - i) // 2 + 1
        if hits >= ANCHOR_HITS:
            out.append(hits)
            i = j + 1
        else:
            i += 1
    return out


def hands(notes: list[dict[str, Any]], key_mode: str, pitch_of: PitchOf | None = None) -> dict[str, float | None]:
    index, hand, finger, _ = _layout(key_mode)
    events = _events(notes, index)
    total = sum(len(ns) for _, _, ns in events)
    out: dict[str, float | None] = {"unmotivatedJacks": None, "fingerLoad": None, "anchors": None, "anchorMax": 0, "handStreaks": None, "doubles": None}
    if total == 0:
        return out
    jacks = 0
    for (ta, _, na), (tb, _, nb) in zip(events, events[1:]):
        # single notes only: chords next to each other share lanes on few keys whatever the sounds
        if tb - ta <= FAST_MS and len(na) == 1 and len(nb) == 1 and na[0]["lane"] == nb[0]["lane"]:
            jacks += bool(_different_sound(na[0], nb[0], pitch_of))
    out["unmotivatedJacks"] = _round(100.0 * jacks / total, 2)

    start = events[0][1]
    windows: dict[int, list[int]] = {}
    for _, beat, ns in events:
        windows.setdefault(int((beat - start) // WINDOW_BEATS), []).extend(index[int(n["lane"])] for n in ns)
    loads = []
    for keys in windows.values():
        if len(keys) >= DENSE_NOTES:
            counts: dict[tuple[str, int], int] = {}
            for k in keys:
                counts[finger[k]] = counts.get(finger[k], 0) + 1
            loads.append(max(counts.values()) / len(keys))
    out["fingerLoad"] = _round(float(np.percentile(loads, 95))) if loads else None

    anchors: list[int] = []
    fast = streaked = doubles = 0
    for run in _fast_runs(events, index):
        lanes = [k for _, k in run]
        anchors += _anchors(lanes)
        doubles += sum(
            1 for i in range(len(lanes) - 3)
            if lanes[i] == lanes[i + 1] != lanes[i + 2] == lanes[i + 3] and hand[lanes[i]] != hand[lanes[i + 2]]
        )
        fast += len(lanes)
        # streaks on one hand; the shared middle key belongs to either hand
        side, length = None, 0
        for k in lanes + [-1]:
            h = hand[k] if k >= 0 else None
            if h == "T":
                length += 1
                continue
            if h is not None and h == side:
                length += 1
                continue
            if length >= STREAK:
                streaked += length
            side, length = h, 1
    out["anchors"] = _round(1000.0 * len(anchors) / total, 2)
    out["anchorMax"] = max(anchors) if anchors else 0
    out["handStreaks"] = _round(streaked / fast) if fast else None
    out["doubles"] = _round(1000.0 * doubles / total, 2)
    return out


def _shape_spans(lanes: list[int]) -> list[tuple[int, int]]:
    """(start, end) index spans of the stairs (monotone one-key steps, three notes or more) and
    trills (two keys alternating, four notes or more) of a run."""
    spans = []
    i = 0
    while i < len(lanes) - 2:
        step = lanes[i + 1] - lanes[i]
        j = i + 1
        if abs(step) == 1:
            while j + 1 < len(lanes) and lanes[j + 1] - lanes[j] == step:
                j += 1
            if j - i + 1 >= 3:
                spans.append((i, j))
                i = j
                continue
        if step != 0:
            j = i + 1
            while j + 1 < len(lanes) and lanes[j + 1] == lanes[j - 1]:
                j += 1
            if j - i + 1 >= 4:
                spans.append((i, j))
                i = j
                continue
        i += 1
    return spans


def balance(notes: list[dict[str, Any]], key_mode: str) -> dict[str, float | None]:
    index, hand, _, _ = _layout(key_mode)
    events = _events(notes, index)
    out: dict[str, float | None] = {"lopsided": None, "shapeLeft": None}
    if not events:
        return out
    start = events[0][1]
    windows: dict[int, list[float]] = {}
    for _, beat, ns in events:
        w = windows.setdefault(int((beat - start) // WINDOW_BEATS), [0.0, 0.0])
        for n in ns:
            h = hand[index[int(n["lane"])]]
            if h == "T":
                w[0] += 0.5
                w[1] += 0.5
            else:
                w[0 if h == "L" else 1] += 1.0
    busy = [w for w in windows.values() if sum(w) >= BUSY_NOTES]
    if busy:
        out["lopsided"] = _round(sum(1 for w in busy if max(w) / sum(w) >= LOPSIDED) / len(busy))
    left = right = 0.0
    by_t = [(t, [index[int(n["lane"])] for n in ns]) for t, _, ns in events]
    run: list[int] = []
    prev_t: float | None = None
    for t, keys in by_t + [(float("inf"), [])]:
        if len(keys) == 1 and run and prev_t is not None and t - prev_t <= RUN_MS:
            run.append(keys[0])
        else:
            for a, b in _shape_spans(run):
                for k in run[a : b + 1]:
                    h = hand[k]
                    left += 1.0 if h == "L" else 0.5 if h == "T" else 0.0
                    right += 1.0 if h == "R" else 0.5 if h == "T" else 0.0
            run = [keys[0]] if len(keys) == 1 else []
        prev_t = t
    if left + right > 0:
        out["shapeLeft"] = _round(left / (left + right))
    return out


def pivots(notes: list[dict[str, Any]], key_mode: str) -> float | None:
    index, _, _, center = _layout(key_mode)
    if center is None:
        return None
    pairs = [(t, tuple(index[int(n["lane"])] for n in ns)) for t, _, ns in _events(notes, index) if len(ns) == 2]
    if not pairs:
        return None
    pivot = [False] * len(pairs)
    for i in range(len(pairs) - 1):
        (ta, a), (tb, b) = pairs[i], pairs[i + 1]
        if tb - ta > PIVOT_MS or center not in a or center not in b:
            continue
        oa = a[0] if a[1] == center else a[1]
        ob = b[0] if b[1] == center else b[1]
        if (oa - center) * (ob - center) < 0:
            pivot[i] = pivot[i + 1] = True
    return _round(sum(pivot) / len(pairs))


def guide_profile(
    notes: list[dict[str, Any]],
    key_mode: str,
    sections: list[dict[str, Any]] | None = None,
    pitch_of: PitchOf | None = None,
    end_beat: float | None = None,
) -> dict[str, Any]:
    """All the guide measures of one chart (module docstring)."""
    out: dict[str, Any] = {}
    out.update(arc(notes, sections, end_beat))
    if pitch_of is not None:
        out.update(scale(notes, key_mode, pitch_of))
    out.update(hands(notes, key_mode, pitch_of))
    out.update(balance(notes, key_mode))
    out["pivots"] = pivots(notes, key_mode)
    return out


def onset_pitches(analysis: dict[str, Any], tolerance_ms: float = 50.0) -> PitchOf:
    """`pitch_of` from an analysis: the pitch of the nearest pitched onset within `tolerance_ms`."""
    pitched = sorted((float(o["t"]), float(o["pitch"])) for o in analysis.get("onsets", []) if o.get("pitch") is not None)
    times = np.array([t for t, _ in pitched])
    values = [p for _, p in pitched]

    def pitch_of(t: float) -> float | None:
        if not values:
            return None
        i = int(np.searchsorted(times, t))
        best = min((j for j in (i - 1, i) if 0 <= j < len(values)), key=lambda j: abs(times[j] - t))
        return values[best] if abs(times[best] - t) <= tolerance_ms else None

    return pitch_of
