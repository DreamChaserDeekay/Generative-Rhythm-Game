"""Difficulty estimation.

A strain model in the spirit of osu!mania: every press adds to a per-lane (finger) strain and an
overall strain, both decaying exponentially. Peaks over 400 ms sections are combined with a
decaying weight. The result is calibrated against uniform streams so it reads as an "effective
NPS", which maps onto the level table in config/difficulty.json (defined for 4K and scaled by
the key mode factor).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np

from ..config import difficulty_config

INDIVIDUAL_DECAY = 0.125
OVERALL_DECAY = 0.30
SECTION_MS = 400.0
PEAK_WEIGHT = 0.9
HOLD_FACTOR = 1.25


def _strain_value(times: np.ndarray, lanes_: np.ndarray, holding: np.ndarray, n_lanes: int) -> float:
    if len(times) == 0:
        return 0.0
    individual = np.zeros(n_lanes)
    last_lane = np.full(n_lanes, times[0])
    overall = 0.0
    last = times[0]
    peaks: dict[int, float] = {}
    for t, lane, held in zip(times, lanes_, holding):
        overall *= OVERALL_DECAY ** ((t - last) / 1000.0)
        last = t
        individual[lane] *= INDIVIDUAL_DECAY ** ((t - last_lane[lane]) / 1000.0)
        last_lane[lane] = t
        factor = HOLD_FACTOR if held else 1.0
        individual[lane] += 2.0 * factor
        overall += 1.0 * factor
        section = int(t // SECTION_MS)
        value = individual[lane] + overall
        if value > peaks.get(section, 0.0):
            peaks[section] = value
    ordered = sorted(peaks.values(), reverse=True)
    weights = PEAK_WEIGHT ** np.arange(len(ordered))
    return float(np.dot(ordered, weights) / (1.0 / (1.0 - PEAK_WEIGHT)))


@lru_cache(maxsize=None)
def _calibration(n_lanes: int) -> tuple[np.ndarray, np.ndarray]:
    """Strain value of uniform streams walking across the lanes, for NPS 0.5..30."""
    rates = np.concatenate([np.arange(0.5, 4, 0.5), np.arange(4, 31, 1.0)])
    values = []
    walk = list(range(n_lanes)) + list(range(n_lanes - 2, 0, -1)) if n_lanes > 1 else [0]
    for r in rates:
        n = int(r * 60)
        times = np.arange(n) * 1000.0 / r
        lanes_ = np.array([walk[i % len(walk)] for i in range(n)])
        values.append(_strain_value(times, lanes_, np.zeros(n, dtype=bool), n_lanes))
    return np.array(values), rates


def effective_nps(notes: list[dict[str, Any]], n_lanes: int) -> float:
    if not notes:
        return 0.0
    ordered = sorted(notes, key=lambda n: (n["t"], n["lane"]))
    times = np.array([n["t"] for n in ordered], dtype=np.float64)
    lanes_ = np.array([n["lane"] for n in ordered], dtype=np.int64)
    holds = [(n["t"], n["endT"], n["lane"]) for n in ordered if n["type"] == "hold"]
    holding = np.zeros(len(ordered), dtype=bool)
    if holds:
        for i, n in enumerate(ordered):
            holding[i] = any(s < n["t"] < e and lane != n["lane"] for s, e, lane in holds)
    value = _strain_value(times, lanes_, holding, n_lanes)
    cal_v, cal_r = _calibration(n_lanes)
    return float(np.interp(value, cal_v, cal_r))


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


def skillset(notes: list[dict[str, Any]], min_jack_ms: float) -> dict[str, float]:
    if not notes:
        return {k: 0.0 for k in ("stream", "chord", "jack", "longNote", "technical", "stamina")}
    ordered = sorted(notes, key=lambda n: (n["t"], n["lane"]))
    n = len(ordered)
    by_time: dict[float, int] = {}
    for x in ordered:
        by_time[round(x["t"], 3)] = by_time.get(round(x["t"], 3), 0) + 1
    chord_notes = sum(c for c in by_time.values() if c >= 2)
    singles = [x for x in ordered if by_time[round(x["t"], 3)] == 1]
    stream = sum(1 for a, b in zip(singles, singles[1:]) if b["t"] - a["t"] <= 200 and a["lane"] != b["lane"])
    last_lane: dict[int, float] = {}
    jack = 0
    for x in ordered:
        if x["lane"] in last_lane and x["t"] - last_lane[x["lane"]] <= max(250.0, 1.6 * min_jack_ms):
            jack += 1
        last_lane[x["lane"]] = x.get("endT", x["t"]) if x["type"] == "hold" else x["t"]
    ln = sum(1 for x in ordered if x["type"] == "hold")
    technical = sum(1 for x in ordered if abs(x["beat"] * 2 - round(x["beat"] * 2)) > 1e-6)
    times = np.array([x["t"] for x in ordered])
    windows = np.arange(times[0], times[-1] + 1, 4000.0)
    counts = np.array([np.count_nonzero((times >= w) & (times < w + 4000.0)) for w in windows])
    stamina = float(np.mean(counts >= 0.7 * counts.max())) if len(counts) else 0.0
    return {
        "stream": round(min(1.0, 1.5 * stream / n), 3),
        "chord": round(min(1.0, 1.5 * chord_notes / n), 3),
        "jack": round(min(1.0, 3.0 * jack / n), 3),
        "longNote": round(min(1.0, 3.0 * ln / n), 3),
        "technical": round(min(1.0, 1.5 * technical / n), 3),
        "stamina": round(stamina, 3),
    }


def estimate(notes: list[dict[str, Any]], key_mode: str, n_lanes: int, duration_ms: float, min_jack_ms: float) -> dict[str, Any]:
    eff = effective_nps(notes, n_lanes)
    level, rating = level_for(eff, key_mode)
    return {
        "level": level,
        "rating": rating,
        "effectiveNps": round(eff, 2),
        "nps": nps_stats(notes, duration_ms),
        "skillset": skillset(notes, min_jack_ms),
    }
