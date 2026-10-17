"""Difficulty estimation.

A strain model in the spirit of osu!mania: every press adds to a per-lane (finger) strain, a
per-hand strain and an overall strain, all decaying exponentially. The hand term makes one-hand
trills and runs harder than the same density split between both hands. Peaks over 400 ms
sections are combined with a decaying weight. The result is calibrated against uniform streams
so it reads as an "effective NPS", which maps onto the level table in config/difficulty.json
(defined for 4K and scaled by the key mode factor).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np

from ..config import difficulty_config, key_modes

INDIVIDUAL_DECAY = 0.125
HAND_DECAY = 0.2
OVERALL_DECAY = 0.30
HAND_WEIGHT = 0.6
SECTION_MS = 400.0
PEAK_WEIGHT = 0.9
HOLD_FACTOR = 1.25
HANDS = {"L": 0, "R": 1, "T": 2}


def _strain(times: np.ndarray, lanes_: np.ndarray, holding: np.ndarray, hands: tuple[int, ...]) -> tuple[float, np.ndarray]:
    """Strain value, plus the strain each hand contributed (L, R, thumb)."""
    if len(times) == 0:
        return 0.0, np.zeros(3)
    n_lanes = len(hands)
    individual = np.zeros(n_lanes)
    last_lane = np.full(n_lanes, times[0])
    hand = np.zeros(3)
    last_hand = np.full(3, times[0])
    load = np.zeros(3)
    overall = 0.0
    last = times[0]
    peaks: dict[int, float] = {}
    for t, lane, held in zip(times, lanes_, holding):
        overall *= OVERALL_DECAY ** ((t - last) / 1000.0)
        last = t
        individual[lane] *= INDIVIDUAL_DECAY ** ((t - last_lane[lane]) / 1000.0)
        last_lane[lane] = t
        h = hands[lane]
        hand[h] *= HAND_DECAY ** ((t - last_hand[h]) / 1000.0)
        last_hand[h] = t
        factor = HOLD_FACTOR if held else 1.0
        individual[lane] += 2.0 * factor
        hand[h] += 1.0 * factor
        overall += 1.0 * factor
        load[h] += hand[h]
        section = int(t // SECTION_MS)
        value = individual[lane] + HAND_WEIGHT * hand[h] + overall
        if value > peaks.get(section, 0.0):
            peaks[section] = value
    ordered = sorted(peaks.values(), reverse=True)
    weights = PEAK_WEIGHT ** np.arange(len(ordered))
    return float(np.dot(ordered, weights) / (1.0 / (1.0 - PEAK_WEIGHT))), load


@lru_cache(maxsize=None)
def _calibration(hands: tuple[int, ...]) -> tuple[np.ndarray, np.ndarray]:
    """Strain value of uniform streams walking across the lanes, for NPS 0.5..30."""
    n_lanes = len(hands)
    rates = np.concatenate([np.arange(0.5, 4, 0.5), np.arange(4, 31, 1.0)])
    values = []
    walk = list(range(n_lanes)) + list(range(n_lanes - 2, 0, -1)) if n_lanes > 1 else [0]
    for r in rates:
        n = int(r * 60)
        times = np.arange(n) * 1000.0 / r
        lanes_ = np.array([walk[i % len(walk)] for i in range(n)])
        values.append(_strain(times, lanes_, np.zeros(n, dtype=bool), hands)[0])
    return np.array(values), rates


def lane_hands(key_mode: str) -> tuple[int, ...]:
    return tuple(HANDS.get(l["hand"], 0) for l in key_modes()[key_mode]["lanes"])


def _prepare(notes: list[dict[str, Any]]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    ordered = sorted(notes, key=lambda n: (n["t"], n["lane"]))
    times = np.array([n["t"] for n in ordered], dtype=np.float64)
    lanes_ = np.array([n["lane"] for n in ordered], dtype=np.int64)
    holding = np.zeros(len(ordered), dtype=bool)
    for n in ordered:
        if n["type"] == "hold":
            # presses on other lanes while this long note is held
            holding |= (times > n["t"]) & (times < n["endT"]) & (lanes_ != n["lane"])
    return times, lanes_, holding


def effective_nps(notes: list[dict[str, Any]], hands: tuple[int, ...]) -> tuple[float, dict[str, float]]:
    """Effective NPS and the share of the strain carried by each hand."""
    if not notes:
        return 0.0, {"L": 0.5, "R": 0.5}
    value, load = _strain(*_prepare(notes), hands)
    cal_v, cal_r = _calibration(hands)
    left, right = load[0] + 0.5 * load[2], load[1] + 0.5 * load[2]
    total = max(1e-9, left + right)
    return float(np.interp(value, cal_v, cal_r)), {"L": round(left / total, 3), "R": round(right / total, 3)}


def level_for(eff_nps: float, key_mode: str) -> tuple[int, float]:
    cfg = difficulty_config()
    table = np.asarray(cfg["levelEffectiveNps"], dtype=np.float64)
    x = eff_nps / float(cfg["keyModeNpsFactor"].get(key_mode, 1.0))
    level = int(np.clip(np.searchsorted(table, x, side="right"), 1, len(table)))
    # fractional rating for display: position between this level's threshold and the next
    rating = float(np.interp(x, table, np.arange(1, len(table) + 1)))
    if x > table[-1]:
        rating = len(table) + (x - table[-1]) / max(1e-6, table[-1] - table[-2])
    return level, round(max(1.0, rating), 2)


def nps_stats(notes: list[dict[str, Any]], duration_ms: float, bin_ms: float = 2000.0) -> dict[str, Any]:
    if not notes:
        return {"avg": 0.0, "peak": 0.0, "graph": [], "binMs": bin_ms}
    times = np.sort(np.array([n["t"] for n in notes]))
    span = max(1.0, (times[-1] - times[0]) / 1000.0)
    j = 0
    peak = 0
    for i in range(len(times)):
        while times[i] - times[j] >= 1000.0:
            j += 1
        peak = max(peak, i - j + 1)
    bins = np.bincount((times // bin_ms).astype(int), minlength=int(duration_ms // bin_ms) + 1)
    return {
        "avg": round(len(times) / span, 2),
        "peak": float(peak),
        "graph": [round(float(c) / (bin_ms / 1000.0), 2) for c in bins],
        "binMs": bin_ms,
    }


STREAM_GAP_MS = 200.0
STREAM_RUN = 4


def skillset(notes: list[dict[str, Any]], min_jack_ms: float) -> dict[str, float]:
    """0..1 indicators of what a chart asks for (shown as bars next to the level)."""
    if not notes:
        return {k: 0.0 for k in ("stream", "chord", "jack", "longNote", "technical", "stamina")}
    ordered = sorted(notes, key=lambda n: (n["t"], n["lane"]))
    n = len(ordered)
    by_time: dict[float, int] = {}
    for x in ordered:
        by_time[round(x["t"], 3)] = by_time.get(round(x["t"], 3), 0) + 1

    # Stream: single notes inside runs of at least STREAM_RUN fast notes that change lanes.
    singles = [x for x in ordered if by_time[round(x["t"], 3)] == 1]
    in_runs = 0
    run = 1
    for a, b in zip(singles, singles[1:]):
        if b["t"] - a["t"] <= STREAM_GAP_MS and a["lane"] != b["lane"]:
            run += 1
        else:
            in_runs += run if run >= STREAM_RUN else 0
            run = 1
    in_runs += run if run >= STREAM_RUN else 0

    # Chord: extra notes stacked on an instant (a triple counts more than a pair).
    chord_extra = sum(c - 1 for c in by_time.values() if c >= 2)

    last_lane: dict[int, float] = {}
    jack = 0
    for x in ordered:
        if x["lane"] in last_lane and x["t"] - last_lane[x["lane"]] <= max(250.0, 1.6 * min_jack_ms):
            jack += 1
        last_lane[x["lane"]] = x.get("endT", x["t"]) if x["type"] == "hold" else x["t"]

    # Long notes: their share of the notes and how much of the song some hold is down.
    holds = sorted((x["t"], x["endT"]) for x in ordered if x["type"] == "hold")
    covered = 0.0
    cur_s, cur_e = None, None
    for s, e in holds:
        if cur_e is None or s > cur_e:
            if cur_e is not None:
                covered += cur_e - cur_s
            cur_s, cur_e = s, e
        else:
            cur_e = max(cur_e, e)
    if cur_e is not None:
        covered += cur_e - cur_s
    span = max(1.0, ordered[-1]["t"] - ordered[0]["t"])
    ln = 0.5 * min(1.0, 3.0 * len(holds) / n) + 0.5 * min(1.0, covered / span)

    # Technical: off-8th rhythms plus how varied the gaps between instants are.
    offgrid = sum(1 for x in ordered if abs(x["beat"] * 2 - round(x["beat"] * 2)) > 1e-6)
    instants = np.array(sorted(by_time.keys()))
    entropy = 0.0
    if len(instants) > 8:
        ioi = np.diff(instants)
        ioi = ioi[ioi < 1000.0]
        if len(ioi) > 4:
            hist = np.bincount(np.clip((ioi / 25.0).astype(int), 0, 39), minlength=40).astype(np.float64)
            p = hist[hist > 0] / hist.sum()
            entropy = float(-(p * np.log(p)).sum() / np.log(40))
    technical = 0.6 * min(1.0, 1.5 * offgrid / n) + 0.4 * min(1.0, 1.6 * entropy)

    times = np.array([x["t"] for x in ordered])
    windows = np.arange(times[0], times[-1] + 1, 4000.0)
    counts = np.array([np.count_nonzero((times >= w) & (times < w + 4000.0)) for w in windows])
    stamina = float(np.mean(counts >= 0.7 * counts.max())) if len(counts) else 0.0
    return {
        "stream": round(min(1.0, 1.2 * in_runs / n), 3),
        "chord": round(min(1.0, 2.0 * chord_extra / n), 3),
        "jack": round(min(1.0, 3.0 * jack / n), 3),
        "longNote": round(ln, 3),
        "technical": round(technical, 3),
        "stamina": round(stamina, 3),
    }


def estimate(notes: list[dict[str, Any]], key_mode: str, n_lanes: int, duration_ms: float, min_jack_ms: float) -> dict[str, Any]:
    hands = lane_hands(key_mode)
    if len(hands) != n_lanes:
        raise ValueError(f"{key_mode} has {len(hands)} lanes, not {n_lanes}")
    eff, hand_load = effective_nps(notes, hands)
    level, rating = level_for(eff, key_mode)
    return {
        "level": level,
        "rating": rating,
        "effectiveNps": round(eff, 2),
        "nps": nps_stats(notes, duration_ms),
        "skillset": skillset(notes, min_jack_ms),
        "handLoad": hand_load,
    }
