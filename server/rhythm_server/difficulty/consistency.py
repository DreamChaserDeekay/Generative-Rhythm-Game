"""Section consistency of a chart (docs/PATTERN_DESIGN.md 13): whether the same music gets the same
notes. Works on any chart and any section table (the analysed one in the chart, or a song's true
structure in tests):

- loopRhythm: inside a section, bar b against bar b + loop length — share of note times they share
  (Jaccard of the note times inside the bar). 1 = the loop repeats with the same rhythm.
- loopLane: at the note times both bars have, share with the same lanes.
- repeatSelect / repeatLane: a later occurrence of a repetition group against its first occurrence
  (note times from the section start, same measures as above). repeatLaneMirror also accepts an
  occurrence that is the first one mirrored.
- barVariety: distinct bars (note times and lanes) per bar of a section. Near 1 / loop length when
  the section repeats its loop, 1 when every bar is new.
- laneEntropy: how unpredictable the next key lane of a single-note run is from the previous one
  (conditional entropy over log2 of the key count). Shapes and repeats lower it; scattered notes
  push it toward 1.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Any

from ..config import key_modes

GRID = 48  # positions per beat used to match note times (covers 16ths, triplets and 32nds)


def _mirror_map(key_mode: str) -> dict[int, int]:
    lanes = key_modes()[key_mode]["lanes"]
    keys = [i for i, l in enumerate(lanes) if l["kind"] == "key"]
    specials = [i for i, l in enumerate(lanes) if l["kind"] != "key"]
    out = {lane: keys[len(keys) - 1 - n] for n, lane in enumerate(keys)}
    out.update({lane: specials[len(specials) - 1 - n] for n, lane in enumerate(specials)})
    return out


def section_spans(sections: list[dict[str, Any]], end_beat: float) -> list[dict[str, Any]]:
    """Sections ordered by start, each with its end beat (the next start, or `end_beat`)."""
    ordered = sorted(sections, key=lambda s: float(s["startBeat"]))
    out = []
    for k, s in enumerate(ordered):
        end = float(ordered[k + 1]["startBeat"]) if k + 1 < len(ordered) else max(end_beat, float(s["startBeat"]))
        if "endBeat" in s and s["endBeat"] is not None:
            end = min(end, float(s["endBeat"]))
        out.append({**s, "startBeat": float(s["startBeat"]), "endBeat": end})
    return out


def _events(notes: list[dict[str, Any]]) -> dict[int, frozenset[int]]:
    """Grid position -> lanes pressed there."""
    out: dict[int, set[int]] = {}
    for n in notes:
        out.setdefault(int(round(float(n["beat"]) * GRID)), set()).add(int(n["lane"]))
    return {k: frozenset(v) for k, v in out.items()}


def _window(events: dict[int, frozenset[int]], start: float, length: float) -> dict[int, frozenset[int]]:
    """Events in [start, start + length) keyed by their offset from `start`."""
    a, b = int(round(start * GRID)), int(round((start + length) * GRID))
    return {k - a: v for k, v in events.items() if a <= k < b}


def _compare(x: dict[int, frozenset[int]], y: dict[int, frozenset[int]], mirror: dict[int, int] | None = None) -> tuple[float | None, int, int, int]:
    """(Jaccard of the times or None when both are empty, shared times, same-lane times, mirror-lane times)."""
    if not x and not y:
        return None, 0, 0, 0
    shared = x.keys() & y.keys()
    union = len(x.keys() | y.keys())
    same = sum(1 for k in shared if x[k] == y[k])
    mirrored = 0
    if mirror is not None:
        mirrored = sum(1 for k in shared if frozenset(mirror.get(l, l) for l in x[k]) == y[k])
    return len(shared) / union, len(shared), same, mirrored


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None


def chart_consistency(
    notes: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    key_mode: str,
    beats_per_bar: int = 4,
    default_loop_bars: int = 2,
) -> dict[str, Any]:
    """The measures above for `notes` over `sections` (rows with startBeat, group and optionally
    endBeat and loopBars)."""
    empty = {k: None for k in ("loopRhythm", "loopLane", "repeatSelect", "repeatLane", "repeatLaneMirror", "barVariety", "laneEntropy")}
    if not notes or not sections:
        return empty
    events = _events(notes)
    mirror = _mirror_map(key_mode)
    last_beat = max(float(n.get("endBeat", n["beat"])) for n in notes) + 1
    spans = section_spans(sections, last_beat)
    bpb = beats_per_bar

    loop_j: list[float] = []
    loop_shared = loop_same = 0
    variety_num = variety_den = 0
    for s in spans:
        bars = int((s["endBeat"] - s["startBeat"] + 1e-6) // bpb)
        loop = int(s.get("loopBars") or default_loop_bars)
        windows = [_window(events, s["startBeat"] + b * bpb, bpb) for b in range(bars)]
        for b in range(bars - loop):
            j, shared, same, _ = _compare(windows[b], windows[b + loop])
            if j is None:
                continue
            loop_j.append(j)
            loop_shared += shared
            loop_same += same
        played = [tuple(sorted(w.items())) for w in windows if w]
        if played:
            variety_num += len(set(played))
            variety_den += len(played)

    rep_j: list[float] = []
    rep_shared = rep_same = rep_best = 0
    first: dict[str, dict[str, Any]] = {}
    for s in spans:
        g = s.get("group")
        if not g:
            continue
        if g not in first:
            first[g] = s
            continue
        ref = first[g]
        length = min(s["endBeat"] - s["startBeat"], ref["endBeat"] - ref["startBeat"])
        a = _window(events, ref["startBeat"], length)
        b = _window(events, s["startBeat"], length)
        j, shared, same, mirrored = _compare(a, b, mirror)
        if j is None:
            continue
        rep_j.append(j)
        rep_shared += shared
        rep_same += same
        rep_best += max(same, mirrored)

    return {
        "loopRhythm": _mean(loop_j),
        "loopLane": round(loop_same / loop_shared, 3) if loop_shared else None,
        "repeatSelect": _mean(rep_j),
        "repeatLane": round(rep_same / rep_shared, 3) if rep_shared else None,
        "repeatLaneMirror": round(rep_best / rep_shared, 3) if rep_shared else None,
        "barVariety": round(variety_num / variety_den, 3) if variety_den else None,
        "laneEntropy": lane_entropy(notes, key_mode),
    }


def lane_entropy(notes: list[dict[str, Any]], key_mode: str, max_gap_beats: float = 1.0) -> float | None:
    """Conditional entropy of the next key lane given the previous one over single-note moves at
    most `max_gap_beats` apart, divided by log2 of the key count."""
    lanes = key_modes()[key_mode]["lanes"]
    keys = {i for i, l in enumerate(lanes) if l["kind"] == "key"}
    by_beat: dict[int, list[int]] = {}
    for n in notes:
        if int(n["lane"]) in keys:
            by_beat.setdefault(int(round(float(n["beat"]) * GRID)), []).append(int(n["lane"]))
    singles = sorted((b, v[0]) for b, v in by_beat.items() if len(v) == 1)
    pairs: Counter[tuple[int, int]] = Counter()
    for (b0, l0), (b1, l1) in zip(singles, singles[1:]):
        if b1 - b0 <= max_gap_beats * GRID:
            pairs[(l0, l1)] += 1
    total = sum(pairs.values())
    if total < 8 or len(keys) < 2:
        return None
    from_counts: Counter[int] = Counter()
    for (a, _), c in pairs.items():
        from_counts[a] += c
    h = -sum(c / total * math.log2(c / from_counts[a]) for (a, _), c in pairs.items())
    return round(h / math.log2(len(keys)), 3)


def structure_accuracy(found: list[dict[str, Any]], truth: list[dict[str, Any]], beats_per_bar: int = 4, total_bars: int | None = None) -> dict[str, Any]:
    """How well analysed sections match the true ones, bar by bar: boundary precision / recall / F
    within one bar (the song start excluded), pairwise F of the repetition groups (two bars in the
    same group in both), label accuracy, and loop length accuracy where the label is right."""
    bpb = beats_per_bar
    t_bounds = [int(round(float(s["startBeat"]) / bpb)) for s in truth]
    f_bounds = [int(round(float(s["startBeat"]) / bpb)) for s in found]
    n = total_bars or (t_bounds[-1] + int(truth[-1].get("bars", 4)))
    t_in = [b for b in t_bounds if b > 0]
    f_in = [b for b in f_bounds if b > 0]
    hit_t = sum(1 for b in t_in if any(abs(b - x) <= 1 for x in f_in))
    hit_f = sum(1 for b in f_in if any(abs(b - x) <= 1 for x in t_in))
    precision = hit_f / len(f_in) if f_in else 0.0
    recall = hit_t / len(t_in) if t_in else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    def per_bar(rows: list[dict[str, Any]], bounds: list[int], key: str) -> list[Any]:
        out: list[Any] = [None] * n
        for k, (row, b) in enumerate(zip(rows, bounds)):
            end = bounds[k + 1] if k + 1 < len(bounds) else n
            for i in range(max(0, b), min(n, end)):
                out[i] = row.get(key)
        return out

    tg, fg = per_bar(truth, t_bounds, "group"), per_bar(found, f_bounds, "group")
    tl, fl = per_bar(truth, t_bounds, "label"), per_bar(found, f_bounds, "label")
    tp_pairs = t_pairs = f_pairs = 0
    for i in range(n):
        for j in range(i + 1, n):
            same_t = tg[i] is not None and tg[i] == tg[j]
            same_f = fg[i] is not None and fg[i] == fg[j]
            t_pairs += same_t
            f_pairs += same_f
            tp_pairs += same_t and same_f
    gp = tp_pairs / f_pairs if f_pairs else 0.0
    gr = tp_pairs / t_pairs if t_pairs else 0.0
    tloop, floop = per_bar(truth, t_bounds, "loopBars"), per_bar(found, f_bounds, "loopBars")
    labelled = [i for i in range(n) if tl[i] == fl[i]]
    return {
        "boundaryPrecision": round(precision, 3),
        "boundaryRecall": round(recall, 3),
        "boundaryF": round(f1, 3),
        "groupF": round(2 * gp * gr / (gp + gr), 3) if gp + gr else 0.0,
        "labelAccuracy": round(sum(1 for i in range(n) if tl[i] == fl[i]) / n, 3),
        "loopAccuracy": round(sum(1 for i in labelled if tloop[i] == floop[i]) / len(labelled), 3) if labelled else None,
    }
