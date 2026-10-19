"""Meter (4/4 vs 3/4) and downbeat phase from per-beat cues and bar-long harmony."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Weight of the bar-long harmony change against the per-beat cues when placing the downbeat of a
# 4/4 bar (both as z-scores over the four phases).
BAR_CHANGE_WEIGHT = 1.0


@dataclass
class MeterResult:
    beats_per_bar: int
    first_downbeat_index: int  # index into the beat array


def beat_cues(beats: np.ndarray, onset_times: np.ndarray, onset_strength: np.ndarray, onset_bands: np.ndarray, chroma_novelty: np.ndarray) -> np.ndarray:
    """Per-beat downbeat evidence: low-band hits and harmonic change up, snare-like hits down."""
    n = len(beats)
    low = np.zeros(n)
    mid = np.zeros(n)
    if n == 0:
        return low
    period = float(np.median(np.diff(beats))) if n > 1 else 0.5
    tol = min(0.05, period / 6)
    idx = np.searchsorted(beats, onset_times)
    for i, t in enumerate(onset_times):
        for j in (idx[i] - 1, idx[i]):
            if 0 <= j < n and abs(beats[j] - t) <= tol:
                low[j] = max(low[j], onset_strength[i] * onset_bands[i, 0])
                mid[j] = max(mid[j], onset_strength[i] * onset_bands[i, 1])

    def norm(x: np.ndarray) -> np.ndarray:
        s = float(np.percentile(x, 95)) if np.any(x > 0) else 1.0
        return x / max(s, 1e-9)

    return norm(low) + 1.4 * norm(chroma_novelty) - 0.4 * norm(mid)


def bar_changes(beat_chroma: np.ndarray, beats_per_bar: int) -> np.ndarray:
    """For each downbeat phase k, the mean harmonic change between consecutive bars that start on
    beats k, k + m, ...: bars that each hold their own chord differ most from the next, bars
    shifted by half a bar straddle two chords and share one with the next."""
    m = beats_per_bar
    unit = beat_chroma / (np.linalg.norm(beat_chroma, axis=1, keepdims=True) + 1e-9)
    out = np.zeros(m)
    for k in range(m):
        bars = np.array([unit[i : i + m].mean(axis=0) for i in range(k, len(unit) - m + 1, m)])
        if len(bars) < 4:
            continue
        bars /= np.linalg.norm(bars, axis=1, keepdims=True) + 1e-9
        out[k] = float(np.mean(1.0 - np.sum(bars[1:] * bars[:-1], axis=1)))
    return out


def _z(x: np.ndarray) -> np.ndarray:
    return (x - x.mean()) / (x.std() + 1e-9)


def estimate_meter(cues: np.ndarray, beat_chroma: np.ndarray | None = None) -> MeterResult:
    """`beat_chroma` (one chroma vector per beat) lets the bar-long harmony place the downbeat of
    a 4/4 bar too: the per-beat cues alone often take beat 3 for beat 1."""
    best: tuple[float, int, int] | None = None
    contrasts: dict[int, tuple[float, int]] = {}
    for m in (4, 3):
        if len(cues) < m * 4:
            continue
        scores = np.array([np.mean(cues[k::m]) for k in range(m)])
        contrast = (float(np.max(scores)) - float(np.mean(scores))) / (float(np.std(cues)) + 1e-9)
        contrasts[m] = (contrast, int(np.argmax(scores)))
    if not contrasts:
        return MeterResult(4, 0)
    m = 4
    if 3 in contrasts and 4 in contrasts and contrasts[3][0] > 1.3 * contrasts[4][0]:
        m = 3
    elif 4 not in contrasts:
        m = 3
    best = (contrasts[m][0], m, contrasts[m][1])
    if m == 4 and beat_chroma is not None and len(cues) >= 32 and len(beat_chroma) == len(cues):
        scores = np.array([np.mean(cues[k::4]) for k in range(4)])
        total = _z(scores) + BAR_CHANGE_WEIGHT * _z(bar_changes(beat_chroma, 4))
        best = (best[0], 4, int(np.argmax(total)))
    return MeterResult(beats_per_bar=best[1], first_downbeat_index=best[2])
