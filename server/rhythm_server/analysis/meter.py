"""Meter (4/4 vs 3/4) and downbeat phase from per-beat cues and bar-long harmony."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Weight of the bar-long harmony change against the per-beat cues when placing the downbeat of a
# 4/4 bar (both as z-scores over the four phases).
BAR_CHANGE_WEIGHT = 1.0
# 3/4 also needs bars of three to change chords this many times more than bars of four at their
# best phases: the beat cues alone took 4% of 4/4 songs for 3/4.
THREE_BAR_CHANGE_MARGIN = 1.1
# With the drums' flux at every beat, the downbeat of a 4/4 bar is where these cues peak, each the
# mean over the phase's downbeats as a log ratio to its mean over the four phases (a cue that hardly
# varies, like the kicks of four-on-the-floor, stays small), weighed by a conditional logit fitted
# on BMS charts' bar lines (docs/PATTERN_DESIGN.md 48): the kicks hit the downbeat and the snares
# and claps the beats between; the harmony changes into it and from bar to bar (bar_changes); a
# fill or a pickup leads into it (the strongest onset on the beat before). The onsets' low-band
# share, which the per-beat cues weigh, is no kick: a bass line fills it on every beat.
DOWNBEAT_WEIGHTS = {"kicks": 6.14, "snares": -0.95, "novelty": 3.01, "barChange": 7.46, "pickup": 1.75}


@dataclass
class MeterResult:
    beats_per_bar: int
    first_downbeat_index: int  # index into the beat array


@dataclass
class BeatAccents:
    """At every beat: the kicks' and the snares' flux (the percussive flux below and above the
    backbeat band) and the strongest onset."""

    kicks: np.ndarray
    snares: np.ndarray
    onsets: np.ndarray


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


def beat_peaks(beats: np.ndarray, envelope: np.ndarray, frame_rate: float) -> np.ndarray:
    """An envelope's peak at every beat (a frame either side)."""
    frames = np.round(beats * frame_rate).astype(int)
    return np.array([envelope[max(0, i - 1) : i + 2].max() if 0 <= i < len(envelope) else 0.0 for i in frames])


def beat_onsets(beats: np.ndarray, onset_times: np.ndarray, onset_strength: np.ndarray) -> np.ndarray:
    """The strongest onset at every beat (within a sixth of a beat, at most 50 ms)."""
    n = len(beats)
    out = np.zeros(n)
    if n == 0 or len(onset_times) == 0:
        return out
    period = float(np.median(np.diff(beats))) if n > 1 else 0.5
    tol = min(0.05, period / 6)
    idx = np.searchsorted(beats, onset_times)
    for j in (idx - 1, idx):
        inside = (j >= 0) & (j < n)
        near = np.zeros(len(onset_times), dtype=bool)
        near[inside] = np.abs(beats[j[inside]] - onset_times[inside]) <= tol
        np.maximum.at(out, j[near], onset_strength[near])
    return out


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


def _log_ratio(x: np.ndarray) -> np.ndarray:
    return np.log((x + 1e-6) / (x.mean() + 1e-6))


def estimate_meter(cues: np.ndarray, beat_chroma: np.ndarray | None = None, accents: BeatAccents | None = None) -> MeterResult:
    """`beat_chroma` (one chroma vector per beat) lets the bar-long harmony settle 3/4 against 4/4
    and place the downbeat of a 4/4 bar too: the per-beat cues alone often take beat 3 for beat 1.
    With `accents` too, DOWNBEAT_WEIGHTS place it."""
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
    harmony = beat_chroma is not None and len(cues) >= 32 and len(beat_chroma) == len(cues)
    m = 4
    if 3 in contrasts and 4 in contrasts and contrasts[3][0] > 1.3 * contrasts[4][0]:
        m = 3
        if harmony and float(np.max(bar_changes(beat_chroma, 3))) < THREE_BAR_CHANGE_MARGIN * float(np.max(bar_changes(beat_chroma, 4))):
            m = 4
    elif 4 not in contrasts:
        m = 3
    best = (contrasts[m][0], m, contrasts[m][1])
    if m == 4 and harmony:
        def per_phase(x: np.ndarray) -> np.ndarray:
            return np.array([np.mean(x[k::4]) for k in range(4)])

        if accents is not None and len(accents.kicks) == len(cues):
            unit = beat_chroma / (np.linalg.norm(beat_chroma, axis=1, keepdims=True) + 1e-9)
            novelty = np.concatenate([[0.0], 1.0 - np.sum(unit[1:] * unit[:-1], axis=1)])
            phases = {
                "kicks": per_phase(accents.kicks),
                "snares": per_phase(accents.snares),
                "novelty": per_phase(novelty),
                "barChange": bar_changes(beat_chroma, 4),
                "pickup": np.roll(per_phase(accents.onsets), 1),  # the beat before each downbeat
            }
            total = sum(w * _log_ratio(phases[name]) for name, w in DOWNBEAT_WEIGHTS.items())
        else:
            total = _z(per_phase(cues)) + BAR_CHANGE_WEIGHT * _z(bar_changes(beat_chroma, 4))
        best = (best[0], 4, int(np.argmax(total)))
    return MeterResult(beats_per_bar=best[1], first_downbeat_index=best[2])
