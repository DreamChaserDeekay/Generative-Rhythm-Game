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
# With the drums' flux at every beat, bars of three win when this logistic model, fitted on BMS
# charts' bar lengths (docs/PATTERN_DESIGN.md 52), is THREE_FOUR_MIN_P sure of them: the per-beat
# cues and the bar-long harmony change peak at one phase of three rather than four (log ratios of
# estimate_meter's contrasts and of the largest bar_changes), so do the kicks, the snares and the
# onsets (phase_peak of three minus four), and the harmony comes back after 6 and 12 beats rather
# than 8 and 16 (harmony_return). A 4/4 song read in threes has its bar lines everywhere, so it
# takes a clear case: no BMS 4/4 song came above 0.59.
THREE_FOUR_WEIGHTS = {"contrast": 1.96, "barChange": 3.68, "kicks": 7.36, "snares": 5.76, "onsets": 7.85, "harmony6": 30.29, "harmony12": 15.22}
THREE_FOUR_BIAS = -2.05
THREE_FOUR_MIN_P = 0.8
# With the drums' flux at every beat, the downbeat of a 4/4 bar is where these cues peak, each the
# mean over the phase's downbeats as a log ratio to its mean over the four phases (a cue that hardly
# varies, like the kicks of four-on-the-floor, stays small), weighed by a conditional logit fitted
# on BMS charts' bar lines (docs/PATTERN_DESIGN.md 48, 50, 52): the kicks hit the downbeat and the
# snares and claps the beats between; the harmony changes into it and from bar to bar
# (bar_changes); a fill or a pickup leads into it (the strongest onset on the beat before); the
# loudness changes from bar to bar (energy_changes); the sound of the onsets changes from bar to bar
# and into it (timbre_changes). The onsets' low-band share, which the per-beat cues weigh, is no
# kick: a bass line fills it on every beat.
DOWNBEAT_WEIGHTS = {
    "kicks": 4.78, "snares": -0.97, "novelty": 2.77, "barChange": 5.03, "pickup": 0.95, "energyChange": 3.78,
    "timbreBarChange": 2.01, "timbreNovelty": 3.35,
}
# The energy change's log ratio counts at least this much change: in a song that loops one bar
# (the synthetic pop and rock songs) the bars hardly differ, and the ratios of those slivers put
# the downbeat anywhere. The same for the timbre changes (in the song's mean square of the timbre).
ENERGY_CHANGE_FLOOR = 0.005
TIMBRE_CHANGE_FLOOR = 0.01
# The timbre changes leave out this many beats at either end of the onsets: a song's first and last
# sounds (a fade in, a pickup, the ring out) are no bar changes.
TIMBRE_EDGE_BEATS = 8


@dataclass
class MeterResult:
    beats_per_bar: int
    first_downbeat_index: int  # index into the beat array


@dataclass
class BeatAccents:
    """At every beat: the kicks' and the snares' flux (the percussive flux below and above the
    backbeat band), the strongest onset and, if known, the sound of its onsets (beat_timbre)."""

    kicks: np.ndarray
    snares: np.ndarray
    onsets: np.ndarray
    timbre: np.ndarray | None = None


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


def beat_timbre(beats: np.ndarray, onset_times: np.ndarray, onset_strength: np.ndarray, onset_spectra: np.ndarray) -> np.ndarray:
    """The onsets' strength-weighted mean spectrum (onsets.onset_spectra) over each beat's span, from
    a sixth of a beat (at most 50 ms) before the beat to as much before the next (beats, bands); NaN
    where no onset falls."""
    n = len(beats)
    out = np.full((n, onset_spectra.shape[1]), np.nan)
    if n == 0 or len(onset_times) == 0:
        return out
    period = float(np.median(np.diff(beats))) if n > 1 else 0.5
    tol = min(0.05, period / 6)
    idx = np.searchsorted(beats - tol, onset_times) - 1
    ok = (idx >= 0) & (idx < n)
    total = np.zeros(out.shape)
    weight = np.zeros(n)
    np.add.at(total, idx[ok], onset_spectra[ok] * onset_strength[ok, None])
    np.add.at(weight, idx[ok], onset_strength[ok])
    has = weight > 0
    out[has] = total[has] / weight[has, None]
    return out


def timbre_changes(timbre: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For each downbeat phase k, how much the sound of the onsets (beat_timbre) changes from bar to
    bar for bars that start on beats k, k + 4, ... (the mean squared change between consecutive
    bars' means), and into the beats k, k + 4, ... from the beat before, both over the song's mean
    square. A beat without onsets keeps the last one's sound; TIMBRE_EDGE_BEATS at either end of the
    onsets are left out."""
    bar_out, beat_out = np.zeros(4), np.zeros(4)
    has = ~np.isnan(timbre[:, 0]) if timbre.size else np.zeros(0, dtype=bool)
    sounding = np.flatnonzero(has)
    if not len(sounding):
        return bar_out, beat_out
    filled = timbre.copy()
    last = np.nanmean(timbre, axis=0)
    for i in range(len(filled)):
        if has[i]:
            last = filled[i]
        else:
            filled[i] = last
    filled -= filled.mean(axis=0)
    scale = float(np.mean(np.sum(filled**2, axis=1))) + 1e-9
    lo, hi = int(sounding[0]) + TIMBRE_EDGE_BEATS, int(sounding[-1]) + 1 - TIMBRE_EDGE_BEATS
    for k in range(4):
        start = lo + (k - lo) % 4
        bars = np.array([filled[i : i + 4].mean(axis=0) for i in range(start, hi - 3, 4)])
        if len(bars) >= 5:
            bar_out[k] = float(np.mean(np.sum((bars[1:] - bars[:-1]) ** 2, axis=1))) / scale
        idx = np.arange(start, hi, 4)
        idx = idx[idx > max(0, lo)]  # the change from inside the span
        if len(idx):
            beat_out[k] = float(np.mean(np.sum((filled[idx] - filled[idx - 1]) ** 2, axis=1))) / scale
    return bar_out, beat_out


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


def energy_changes(onsets: np.ndarray) -> np.ndarray:
    """For each downbeat phase k, how much the onset energy changes from bar to bar for bars that
    start on beats k, k + 4, ...: 1 - cosine between consecutive bars' (mean onset, song mean)
    pairs, so a bar louder or quieter than the last counts by how far apart they are against the
    song's level. Bars shifted off the downbeat straddle the changes."""
    level = np.full(len(onsets), float(np.mean(onsets)) + 1e-6)
    pairs = np.stack([onsets, level], axis=1)
    out = np.zeros(4)
    for k in range(4):
        bars = np.array([pairs[i : i + 4].mean(axis=0) for i in range(k, len(pairs) - 3, 4)])
        if len(bars) < 5:
            continue
        cos = np.sum(bars[1:] * bars[:-1], axis=1) / (np.linalg.norm(bars[1:], axis=1) * np.linalg.norm(bars[:-1], axis=1) + 1e-9)
        out[k] = float(np.mean(1.0 - cos))
    return out


def phase_peak(x: np.ndarray, beats_per_bar: int) -> float:
    """How much x peaks at one phase of the bar: log of the largest per-phase mean over their mean."""
    means = np.array([np.mean(x[k::beats_per_bar]) for k in range(beats_per_bar)]) + 1e-9
    return float(np.log(means.max() / means.mean()))


def harmony_return(beat_chroma: np.ndarray, lag: int) -> float:
    """Mean cosine between the chroma of beats `lag` apart: how surely the harmony comes back."""
    if len(beat_chroma) <= lag:
        return 0.0
    a, b = beat_chroma[:-lag], beat_chroma[lag:]
    return float(np.mean(np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-9)))


def three_four_probability(contrasts: dict[int, tuple[float, int]], beat_chroma: np.ndarray, accents: BeatAccents) -> float:
    """THREE_FOUR_WEIGHTS' probability that the bars hold three beats rather than four."""
    cues = {
        "contrast": np.log((contrasts[3][0] + 0.05) / (contrasts[4][0] + 0.05)),
        "barChange": np.log((float(np.max(bar_changes(beat_chroma, 3))) + 1e-6) / (float(np.max(bar_changes(beat_chroma, 4))) + 1e-6)),
        "kicks": phase_peak(accents.kicks, 3) - phase_peak(accents.kicks, 4),
        "snares": phase_peak(accents.snares, 3) - phase_peak(accents.snares, 4),
        "onsets": phase_peak(accents.onsets, 3) - phase_peak(accents.onsets, 4),
        "harmony6": harmony_return(beat_chroma, 6) - harmony_return(beat_chroma, 8),
        "harmony12": harmony_return(beat_chroma, 12) - harmony_return(beat_chroma, 16),
    }
    logit = THREE_FOUR_BIAS + sum(w * float(cues[name]) for name, w in THREE_FOUR_WEIGHTS.items())
    return float(1.0 / (1.0 + np.exp(-logit)))


def _z(x: np.ndarray) -> np.ndarray:
    return (x - x.mean()) / (x.std() + 1e-9)


def _log_ratio(x: np.ndarray, floor: float = 1e-6) -> np.ndarray:
    return np.log((x + floor) / (x.mean() + floor))


def estimate_meter(cues: np.ndarray, beat_chroma: np.ndarray | None = None, accents: BeatAccents | None = None) -> MeterResult:
    """`beat_chroma` (one chroma vector per beat) lets the bar-long harmony settle 3/4 against 4/4
    and place the downbeat of a 4/4 bar too: the per-beat cues alone often take beat 3 for beat 1.
    With `accents` too, THREE_FOUR_WEIGHTS settle the meter and DOWNBEAT_WEIGHTS place the 4/4
    downbeat."""
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
    drums = harmony and accents is not None and len(accents.kicks) == len(cues)
    m = 4
    if drums and 3 in contrasts and 4 in contrasts:
        if three_four_probability(contrasts, beat_chroma, accents) >= THREE_FOUR_MIN_P:
            m = 3
    elif 3 in contrasts and 4 in contrasts and contrasts[3][0] > 1.3 * contrasts[4][0]:
        m = 3
        if harmony and float(np.max(bar_changes(beat_chroma, 3))) < THREE_BAR_CHANGE_MARGIN * float(np.max(bar_changes(beat_chroma, 4))):
            m = 4
    elif 4 not in contrasts:
        m = 3
    best = (contrasts[m][0], m, contrasts[m][1])
    if m == 4 and harmony:
        def per_phase(x: np.ndarray) -> np.ndarray:
            return np.array([np.mean(x[k::4]) for k in range(4)])

        if drums:
            unit = beat_chroma / (np.linalg.norm(beat_chroma, axis=1, keepdims=True) + 1e-9)
            novelty = np.concatenate([[0.0], 1.0 - np.sum(unit[1:] * unit[:-1], axis=1)])
            phases = {
                "kicks": per_phase(accents.kicks),
                "snares": per_phase(accents.snares),
                "novelty": per_phase(novelty),
                "barChange": bar_changes(beat_chroma, 4),
                "pickup": np.roll(per_phase(accents.onsets), 1),  # the beat before each downbeat
                "energyChange": energy_changes(accents.onsets),
            }
            if accents.timbre is not None and len(accents.timbre) == len(cues):
                phases["timbreBarChange"], phases["timbreNovelty"] = timbre_changes(accents.timbre)
            else:  # flat: no say
                phases["timbreBarChange"] = phases["timbreNovelty"] = np.ones(4)
            floors = {"energyChange": ENERGY_CHANGE_FLOOR, "timbreBarChange": TIMBRE_CHANGE_FLOOR, "timbreNovelty": TIMBRE_CHANGE_FLOOR}
            total = sum(w * _log_ratio(phases[name], floors.get(name, 1e-6)) for name, w in DOWNBEAT_WEIGHTS.items())
        else:
            total = _z(per_phase(cues)) + BAR_CHANGE_WEIGHT * _z(bar_changes(beat_chroma, 4))
        best = (best[0], 4, int(np.argmax(total)))
    return MeterResult(beats_per_bar=best[1], first_downbeat_index=best[2])
