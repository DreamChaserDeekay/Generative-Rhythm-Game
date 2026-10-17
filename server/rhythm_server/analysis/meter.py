"""Meter (4/4 vs 3/4) and downbeat phase from per-beat cues."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


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


def estimate_meter(cues: np.ndarray) -> MeterResult:
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
    return MeterResult(beats_per_bar=best[1], first_downbeat_index=best[2])
