"""Tempo estimation and beat-grid fitting.

1. Autocorrelation of the onset function with a perceptual prior proposes a beat level; the comb
   fit below chooses among it, its double and half, and the slower levels a syncopated kick can
   make it stand for (3:4, 2:3).
2. The backbeat settles the octave: snares and claps fall on beats 2 and 4, so when the drums'
   mid and high band hits fall on one grid position in four, the grid runs at twice the beat (busy
   hi-hats pull the onset functions to the faster level).
3. A smoothed comb template is fitted to all onsets to find BPM (to ~0.001) and phase.
   A constant grid fitted to the whole song is far steadier than per-beat tracking. A shuffle's
   swung eighths can carry as many onsets as its beats; the drums tell them apart (the phase moves
   by a triplet when they hit there far more).
4. Local phase drift is measured in windows; if the grid drifts, the song is split into
   constant-tempo segments that are fitted separately (piecewise tempo map).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

BPM_MIN = 60.0
BPM_MAX = 240.0
NORMAL_RANGE = (70.0, 200.0)
PRIOR_CENTER_BPM = 135.0
PRIOR_SIGMA_OCTAVES = 0.85
PHASE_BINS = 512
KERNEL_SIGMA_S = 0.012
# Comb template: (position within the beat, weight).
COMB = ((0.0, 1.0), (0.5, 0.45), (0.25, 0.2), (0.75, 0.2))
DRIFT_LIMIT_S = 0.012
WINDOW_BEATS = 16
LOCAL_WINDOW_BEATS = 24
LOCAL_TEMPO_TOLERANCE = 0.012
LOCAL_SEARCH = 0.25
# Levels the autocorrelation peak may stand for: its double and half, and the slower levels a
# syncopated kick (dotted eighths) pulls it away from. Faster 4:3 and 3:2 levels are left out: a
# shuffle's triplets fit them better than the song's beat.
LEVEL_RATIOS = (1.0, 2.0, 0.5, 0.75, 2.0 / 3.0)
# Backbeat test: percussive flux above this frequency (snares, claps; a hi-hat sits mostly above
# the analysed range), measured on each grid position; the grid is halved when one position in
# four averages BACKBEAT_RATIO times the one opposite it and stands out from the song's flux.
BACKBEAT_MIN_HZ = 200.0
BACKBEAT_RATIO = 1.6
BACKBEAT_ACTIVE = 2.0  # the strongest position's mean against the median flux
# The fitted phase moves by a third of a beat when the drums (all of the percussive flux) hit the
# grid shifted so this many times harder than the fitted one.
TRIPLET_SHIFT_RATIO = 1.5


@dataclass
class TempoSegment:
    start: float  # seconds, time of the segment's first beat
    bpm: float
    beats: int  # number of beats in the segment (last segment extends to the end)


@dataclass
class GridFit:
    bpm: float
    phase: float  # seconds, time of a beat (in [0, period))
    score: float  # aligned weight fraction (0..1)


@dataclass
class DrumFlux:
    """Onset flux of the percussive spectrogram (drum_flux): `high` above BACKBEAT_MIN_HZ (snares,
    claps), `full` over all of it (kicks too), and their frame rate."""

    high: np.ndarray
    full: np.ndarray
    frame_rate: float


@dataclass
class TempoResult:
    beats: np.ndarray  # beat times in seconds
    segments: list[TempoSegment] = field(default_factory=list)
    constant: bool = True
    confidence: float = 0.0

    @property
    def bpm(self) -> float:
        return self.segments[0].bpm if self.segments else 120.0


def _prior(bpm: np.ndarray | float) -> np.ndarray:
    return np.exp(-0.5 * (np.log2(np.asarray(bpm) / PRIOR_CENTER_BPM) / PRIOR_SIGMA_OCTAVES) ** 2)


def beat_level_bpm(odf: np.ndarray, frame_rate: float) -> float:
    """Most plausible beat-level tempo from the onset-function autocorrelation."""
    x = odf.astype(np.float64) - float(np.mean(odf))
    n = len(x)
    size = 1 << int(np.ceil(np.log2(2 * n)))
    spec = np.fft.rfft(x, size)
    acf = np.fft.irfft(spec * np.conj(spec), size)[:n]
    acf /= acf[0] + 1e-12
    lags = np.arange(n)
    lo = int(np.floor(60.0 * frame_rate / BPM_MAX))
    hi = min(n - 1, int(np.ceil(60.0 * frame_rate / BPM_MIN)))
    if hi <= lo + 2:
        return 120.0
    cand = lags[lo : hi + 1]
    score = acf[cand].copy()
    double = np.clip(cand * 2, 0, n - 1)
    score += 0.5 * acf[double]
    score = np.maximum(score, 0) * _prior(60.0 * frame_rate / cand)
    i = int(np.argmax(score))
    lag = float(cand[i])
    if 0 < i < len(score) - 1:
        a, b, c = score[i - 1], score[i], score[i + 1]
        denom = a - 2 * b + c
        if abs(denom) > 1e-12:
            lag += float(np.clip(0.5 * (a - c) / denom, -0.5, 0.5))
    return 60.0 * frame_rate / lag


def _kernel(period: float) -> np.ndarray:
    """Comb template sampled at phase offsets m / PHASE_BINS."""
    u = np.arange(PHASE_BINS) / PHASE_BINS
    sigma = KERNEL_SIGMA_S / period
    k = np.zeros(PHASE_BINS)
    for pos, weight in COMB:
        d = np.abs(u - pos)
        d = np.minimum(d, 1 - d)
        k += weight * np.exp(-0.5 * (d / sigma) ** 2)
    return k


def _phase_scores(times: np.ndarray, weights: np.ndarray, period: float) -> np.ndarray:
    """Alignment score for every phase bin (circular correlation of onsets with the comb)."""
    u = np.mod(times / period, 1.0)
    hist = np.bincount(np.minimum((u * PHASE_BINS).astype(int), PHASE_BINS - 1), weights=weights, minlength=PHASE_BINS)
    # score[p] = sum_q hist[q] * K(q - p): circular cross-correlation
    return np.real(np.fft.ifft(np.fft.fft(hist) * np.conj(np.fft.fft(_kernel(period)))))


def _best_phase(times: np.ndarray, weights: np.ndarray, period: float) -> tuple[float, float]:
    """Phase (s) of the best-aligned grid; bin p stands for a grid point at (p + 0.5) / PHASE_BINS."""
    scores = _phase_scores(times, weights, period)
    i = int(np.argmax(scores))
    a, b, c = scores[(i - 1) % PHASE_BINS], scores[i], scores[(i + 1) % PHASE_BINS]
    denom = a - 2 * b + c
    off = float(np.clip(0.5 * (a - c) / denom, -0.5, 0.5)) if abs(denom) > 1e-12 else 0.0
    phase = ((i + 0.5 + off) / PHASE_BINS) % 1.0 * period
    return phase, float(b)


def fit_grid(times: np.ndarray, weights: np.ndarray, bpm_guess: float, search: float = 0.03) -> GridFit:
    """Best (bpm, phase) near `bpm_guess` by coarse-to-fine search over the comb alignment."""
    total = float(np.sum(weights)) + 1e-12
    norm = sum(w for _, w in COMB)

    def evaluate(bpms: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        scores = np.empty(len(bpms))
        phases = np.empty(len(bpms))
        for k, bpm in enumerate(bpms):
            phases[k], scores[k] = _best_phase(times, weights, 60.0 / bpm)
        return scores, phases

    lo, hi = bpm_guess * (1 - search), bpm_guess * (1 + search)
    bpms = np.arange(lo, hi, max(0.02, bpm_guess * search / 100))
    scores, _ = evaluate(bpms)
    best = float(bpms[int(np.argmax(scores))])
    coarse = max(0.02, bpm_guess * search / 100)
    for step, span in ((coarse / 10, coarse * 2), (coarse / 100, coarse / 5)):
        bpms = np.arange(best - span, best + span + step / 2, step)
        scores, phases = evaluate(bpms)
        k = int(np.argmax(scores))
        best = float(bpms[k])
        if 0 < k < len(bpms) - 1:
            a, b, c = scores[k - 1], scores[k], scores[k + 1]
            denom = a - 2 * b + c
            if abs(denom) > 1e-12:
                best += float(np.clip(0.5 * (a - c) / denom, -0.5, 0.5)) * step
    phase, score = _best_phase(times, weights, 60.0 / best)
    return GridFit(bpm=best, phase=phase, score=score / (total * norm))


def drum_flux(percussive: np.ndarray, freqs: np.ndarray, reference: float, frame_rate: float) -> DrumFlux:
    """Onset flux of a percussive magnitude spectrogram (frames, bins); `reference` is the song's
    peak magnitude."""
    level = np.log1p(100.0 * percussive.astype(np.float64) / max(reference, 1e-12))
    rise = np.zeros_like(level)
    if len(level) > 1:
        rise[1:] = np.maximum(0.0, np.diff(level, axis=0))
    return DrumFlux(high=rise[:, freqs >= BACKBEAT_MIN_HZ].sum(axis=1), full=rise.sum(axis=1), frame_rate=frame_rate)


def _grid_hits(env: np.ndarray, rate: float, bpm: float, phase: float, duration: float) -> np.ndarray:
    """The flux's peak at every grid position (a frame either side)."""
    period = 60.0 / bpm
    frames = np.round(_beats_from_grid(0.0, duration, period, phase % period) * rate).astype(int)
    return np.array([env[max(0, i - 1) : i + 2].max() for i in frames if 0 <= i < len(env)])


def backbeat_ratio(drums: DrumFlux, bpm: float, phase: float, duration: float) -> tuple[float, bool]:
    """How much more the strongest of four grid positions holds than the one opposite it (about 1
    when snares fall on two of them, beats 2 and 4), and whether those hits stand out at all."""
    hits = _grid_hits(drums.high, drums.frame_rate, bpm, phase, duration)
    if len(hits) < 8:
        return 1.0, False
    means = np.array([hits[p::4].mean() for p in range(4)])
    p = int(np.argmax(means))
    active = bool(means[p] >= BACKBEAT_ACTIVE * max(float(np.median(drums.high)), 1e-12))
    return float(means[p] / max(means[(p + 2) % 4], 1e-12)), active


def _halve_on_backbeat(times: np.ndarray, weights: np.ndarray, bpm: float, drums: DrumFlux, duration: float) -> float:
    """Half the grid's tempo when its snares fall on one position in four, not two."""
    if bpm / 2 < NORMAL_RANGE[0]:
        return bpm
    fit = fit_grid(times, weights, bpm, search=0.002)
    ratio, active = backbeat_ratio(drums, fit.bpm, fit.phase, duration)
    return bpm / 2 if active and ratio >= BACKBEAT_RATIO else bpm


def _triplet_phase(drums: DrumFlux, bpm: float, phase: float, duration: float) -> float:
    """The phase moved by a third of a beat when the drums hit there far harder (a shuffle whose
    swung eighths the comb fit took for the beat)."""
    period = 60.0 / bpm

    def accent(p: float) -> float:
        hits = _grid_hits(drums.full, drums.frame_rate, bpm, p, duration)
        return float(np.mean(hits)) if len(hits) else 0.0

    base = accent(phase)
    best, shift = max((accent(phase + k * period / 3), k) for k in (1, 2))
    return (phase + shift * period / 3) % period if best >= TRIPLET_SHIFT_RATIO * max(base, 1e-12) else phase


def _choose_level(times: np.ndarray, weights: np.ndarray, odf: np.ndarray, frame_rate: float) -> float:
    base = beat_level_bpm(odf, frame_rate)
    options = [base * r for r in LEVEL_RATIOS if BPM_MIN <= base * r <= BPM_MAX]
    best_bpm, best_score = base, -1.0
    base_fit = fit_grid(times, weights, base, search=0.04).score
    for bpm in options:
        fit = fit_grid(times, weights, bpm, search=0.04)
        # Alignment rises for faster grids; only switch level when it is clearly better.
        score = fit.score * float(_prior(fit.bpm))
        if bpm != base and fit.score < base_fit * 1.15:
            score *= 0.5
        if score > best_score:
            best_bpm, best_score = fit.bpm, score
    while best_bpm < NORMAL_RANGE[0]:
        best_bpm *= 2
    while best_bpm >= NORMAL_RANGE[1]:
        best_bpm /= 2
    return best_bpm


def _local_offsets(times: np.ndarray, weights: np.ndarray, period: float, phase: float, duration: float) -> tuple[np.ndarray, np.ndarray]:
    """Weighted median residual (s) to the nearest half-beat, per window of WINDOW_BEATS."""
    window = WINDOW_BEATS * period
    centers, offsets = [], []
    t0 = 0.0
    while t0 < duration:
        sel = (times >= t0) & (times < t0 + window)
        if np.count_nonzero(sel) >= 6:
            pos = (times[sel] - phase) / (period / 2)
            resid = (pos - np.round(pos)) * (period / 2)
            near = np.abs(resid) < period / 8
            if np.count_nonzero(near) >= 4:
                r, w = resid[near], weights[sel][near]
                order = np.argsort(r)
                cw = np.cumsum(w[order])
                offsets.append(float(r[order][np.searchsorted(cw, cw[-1] / 2)]))
                centers.append(t0 + window / 2)
        t0 += window / 2
    return np.asarray(centers), np.asarray(offsets)


def _beats_from_grid(start: float, end: float, period: float, phase: float) -> np.ndarray:
    k0 = int(np.ceil((start - phase) / period - 1e-9))
    k1 = int(np.floor((end - phase) / period + 1e-9))
    return phase + period * np.arange(k0, k1 + 1)


def estimate_tempo(
    times: np.ndarray,
    strengths: np.ndarray,
    low_fraction: np.ndarray,
    odf: np.ndarray,
    frame_rate: float,
    duration: float,
    bpm_override: float | None = None,
    bpm_hint: float | None = None,
    drums: DrumFlux | None = None,
) -> TempoResult:
    """`bpm_hint` (e.g. from an ML beat tracker) picks the beat level instead of the
    autocorrelation; the grid is still fitted to the onsets. `drums` lets the snares settle the
    level the autocorrelation chose and the drums the phase of a shuffle."""
    if len(times) < 8:
        bpm = bpm_override or 120.0
        period = 60.0 / bpm
        return TempoResult(beats=np.arange(0.0, duration, period), segments=[TempoSegment(0.0, bpm, int(duration / period) + 1)], confidence=0.0)

    # Kicks and bass carry the beat; weight them up so off-beat hi-hats do not steal the phase.
    weights = strengths.astype(np.float64) * (1.0 + 1.2 * low_fraction.astype(np.float64))
    bpm0 = bpm_override if bpm_override else (bpm_hint if bpm_hint else _choose_level(times, weights, odf, frame_rate))
    if drums is not None and not bpm_override and not bpm_hint:
        bpm0 = _halve_on_backbeat(times, weights, bpm0, drums, duration)
    fit = fit_grid(times, weights, bpm0, search=0.002 if bpm_override else 0.01)
    if bpm_override:
        fit = GridFit(bpm=bpm_override, phase=_best_phase(times, weights, 60.0 / bpm_override)[0], score=fit.score)
    period = 60.0 / fit.bpm

    centers, offsets = _local_offsets(times, weights, period, fit.phase, duration)
    drift = float(np.ptp(offsets)) if len(offsets) >= 3 else 0.0
    local = [] if bpm_override else _local_tempos(times, weights, fit.bpm, duration)
    deviating = _sustained_deviation(local, fit.bpm)
    if bpm_override or (not deviating and drift <= 2 * DRIFT_LIMIT_S):
        # Remove any residual constant offset (median of local offsets) from the phase.
        phase = fit.phase + (float(np.median(offsets)) if len(offsets) else 0.0)
        if drums is not None:
            phase = _triplet_phase(drums, fit.bpm, phase, duration)
        beats = _beats_from_grid(0.0, duration, period, phase % period)
        return TempoResult(
            beats=beats,
            segments=[TempoSegment(float(beats[0]) if len(beats) else 0.0, fit.bpm, len(beats))],
            constant=True,
            confidence=float(min(1.0, fit.score * 2)),
        )
    return _piecewise(times, weights, fit.bpm, duration, fit.score, local)


def _sustained_deviation(local: list[tuple[float, float]], bpm: float) -> bool:
    """True when at least two consecutive windows agree on a tempo different from `bpm`."""
    for (_, a), (_, b) in zip(local, local[1:]):
        if (
            abs(a - bpm) / bpm > LOCAL_TEMPO_TOLERANCE
            and abs(b - bpm) / bpm > LOCAL_TEMPO_TOLERANCE
            and abs(a - b) / bpm <= LOCAL_TEMPO_TOLERANCE
        ):
            return True
    return False


def _local_tempos(times: np.ndarray, weights: np.ndarray, bpm_global: float, duration: float) -> list[tuple[float, float]]:
    """(window center, local bpm) over overlapping windows, folded to the global beat level.
    Fits stuck at the edge of the search range are ignored (no real optimum found)."""
    window = LOCAL_WINDOW_BEATS * 60.0 / bpm_global
    hop = window / 3
    out: list[tuple[float, float]] = []
    t0 = 0.0
    while t0 + window * 0.5 < duration:
        sel = (times >= t0) & (times < t0 + window)
        if np.count_nonzero(sel) >= 12:
            bpm = fit_grid(times[sel], weights[sel], bpm_global, search=LOCAL_SEARCH).bpm
            if abs(abs(bpm - bpm_global) / bpm_global - LOCAL_SEARCH) < 0.01:
                t0 += hop
                continue
            while bpm > bpm_global * 1.4:
                bpm /= 2
            while bpm < bpm_global / 1.4:
                bpm *= 2
            out.append((t0 + window / 2, bpm))
        t0 += hop
    return out


def _piecewise(
    times: np.ndarray,
    weights: np.ndarray,
    bpm_global: float,
    duration: float,
    global_score: float,
    locals_: list[tuple[float, float]],
) -> TempoResult:
    """Group windows of similar local tempo into segments, fit each, and stitch the beats."""
    if not locals_:
        period = 60.0 / bpm_global
        beats = np.arange(0.0, duration, period)
        return TempoResult(beats=beats, segments=[TempoSegment(0.0, bpm_global, len(beats))], constant=True, confidence=global_score)

    # group consecutive windows with similar tempo
    groups: list[list[tuple[float, float]]] = [[locals_[0]]]
    for c, b in locals_[1:]:
        ref = np.median([x[1] for x in groups[-1]])
        if abs(b - ref) / ref < 0.01:
            groups[-1].append((c, b))
        else:
            groups.append([(c, b)])
    bounds = [0.0]
    for g_prev, g_next in zip(groups, groups[1:]):
        bounds.append((g_prev[-1][0] + g_next[0][0]) / 2)
    bounds.append(duration)

    # First pass: one grid per group, fitted on the onsets inside its rough bounds.
    grids: list[GridFit] = []
    for (start, end), group in zip(zip(bounds, bounds[1:]), groups):
        sel = (times >= start) & (times < end)
        guess = float(np.median([b for _, b in group]))
        grids.append(fit_grid(times[sel], weights[sel], guess, search=0.02) if np.count_nonzero(sel) >= 8 else GridFit(guess, 0.0, 0.0))
    # Refine each boundary to the split that best explains nearby onsets, then refit.
    window = LOCAL_WINDOW_BEATS * 60.0 / bpm_global
    for k in range(1, len(bounds) - 1):
        bounds[k] = _refine_boundary(times, weights, grids[k - 1], grids[k], bounds[k] - window, bounds[k] + window)
    margin = 0.5
    for k, (start, end) in enumerate(zip(bounds, bounds[1:])):
        sel = (times >= start + (margin if k > 0 else 0.0)) & (times < end - (margin if k < len(grids) - 1 else 0.0))
        if np.count_nonzero(sel) >= 8:
            grids[k] = fit_grid(times[sel], weights[sel], grids[k].bpm, search=0.005)

    beats: list[float] = []
    segments: list[TempoSegment] = []
    for (start, end), f in zip(zip(bounds, bounds[1:]), grids):
        period = 60.0 / f.bpm
        seg_beats = _beats_from_grid(start, end, period, f.phase % period)
        if beats and len(seg_beats):
            # drop beats that would crowd the previous segment's last beat
            seg_beats = seg_beats[seg_beats > beats[-1] + period * 0.5]
        if len(seg_beats) == 0:
            continue
        segments.append(TempoSegment(float(seg_beats[0]), f.bpm, len(seg_beats)))
        beats.extend(seg_beats.tolist())
    return TempoResult(beats=np.asarray(beats), segments=segments, constant=len(segments) == 1, confidence=global_score)


def _grid_cost(times: np.ndarray, weights: np.ndarray, fit: GridFit) -> np.ndarray:
    """Per-onset misfit to a grid's eighth-note positions (seconds, capped)."""
    period = 60.0 / fit.bpm
    pos = (times - fit.phase) / (period / 2)
    resid = np.abs(pos - np.round(pos)) * (period / 2)
    return weights * np.minimum(resid, period / 8)


def _refine_boundary(times: np.ndarray, weights: np.ndarray, a: GridFit, b: GridFit, lo: float, hi: float) -> float:
    sel = (times >= lo) & (times <= hi)
    ts = times[sel]
    if len(ts) < 2:
        return (lo + hi) / 2
    cost_a = _grid_cost(ts, weights[sel], a)
    cost_b = _grid_cost(ts, weights[sel], b)
    # total(k) = sum(cost_a[:k]) + sum(cost_b[k:])
    total = np.concatenate([[0.0], np.cumsum(cost_a)]) + np.concatenate([np.cumsum(cost_b[::-1])[::-1], [0.0]])
    k = int(np.argmin(total))
    if k == 0:
        return float(ts[0]) - 1e-3
    if k == len(ts):
        return float(ts[-1]) + 1e-3
    return float((ts[k - 1] + ts[k]) / 2)
