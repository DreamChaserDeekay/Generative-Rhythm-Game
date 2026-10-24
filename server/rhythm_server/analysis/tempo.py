"""Tempo estimation and beat-grid fitting.

1. Autocorrelation of the onset function with a perceptual prior proposes a beat level; the comb
   fit below chooses among it, its double and half, and the slower levels a syncopated kick can
   make it stand for (3:4, 2:3).
2. The backbeat settles the octave: snares and claps fall on beats 2 and 4, so when the drums'
   mid and high band hits fall on one grid position in four, the grid runs at twice the beat (busy
   hi-hats pull the onset functions to the faster level). A level above 200 BPM stands only when
   the kicks and snares hit the half-beats of half that tempo about as hard as its beats. A model
   fitted on BMS charts moves the level to half or twice it only when sure of it.
3. A smoothed comb template is fitted to all onsets to find BPM (to ~0.001) and phase.
   A constant grid fitted to the whole song is far steadier than per-beat tracking. A shuffle's
   swung eighths can carry as many onsets as its beats; the drums tell them apart (the phase moves
   by a triplet, or at last by a sixteenth, when they hit there far more). The comb weights low
   onsets up, so an off-beat bass
   can pull it onto the off-beats; the drums, the mid-band onsets, the harmony's changes and how
   clearly the harmony and the onsets' sound change from bar to bar move it back by half a beat.
4. Local phase drift is measured in windows; if the grid drifts, the song is split into
   constant-tempo segments that are fitted separately (piecewise tempo map), kept only when their
   beats explain the onsets clearly better than the one grid.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .meter import bar_changes, beat_timbre, timbre_changes
from .structure import beat_sync

BPM_MIN = 60.0
BPM_MAX = 300.0
# The beat level is folded into this range. Human BMS charts of the same music run up to about
# 260 BPM (docs/PATTERN_DESIGN.md 18); folding at 200 halved every faster song.
NORMAL_RANGE = (70.0, 260.0)
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
# Levels the autocorrelation peak may stand for: its double and half, the slower levels a
# syncopated kick (dotted eighths) pulls it away from, and 3:2 for a song whose 3+3+2 accents put
# the peak on a dotted quarter (in BMS the commonest tempo error: 2/3 of the tempo, or half of it).
LEVEL_RATIOS = (1.0, 2.0, 0.5, 0.75, 2.0 / 3.0, 1.5)
# The 3:2 level only when its straight eighths fill the peak level's 1/3 and 2/3 positions about
# evenly (the lesser at least this share of the greater): a shuffle's swung eighths fill only the
# 2/3 position (0.1-0.16) and fit that level just as well. A 4:3 level never won (BMS).
EVEN_THIRDS = 0.4
THIRDS_TOL_BEATS = 0.06
# Backbeat test: percussive flux above this frequency (snares, claps; a hi-hat sits mostly above
# the analysed range), measured on each grid position; the grid is halved when one position in
# four averages BACKBEAT_RATIO times the one opposite it and stands out from the song's flux.
BACKBEAT_MIN_HZ = 200.0
BACKBEAT_RATIO = 1.6
BACKBEAT_ACTIVE = 2.0  # the strongest position's mean against the median flux
# A level above FAST_LEVEL_BPM stands only when the drums say so: at a real fast tempo the kicks
# or the snares hit the half-beats of half that tempo about as hard as its beats (FAST_LEVEL_RATIO
# of it: kicks on every beat, or a backbeat landing there); a slow song read at twice its tempo
# (busy hi-hats) has both on its own beats.
FAST_LEVEL_BPM = 200.0
FAST_LEVEL_RATIO = 0.85
# The tempo octave: the level found stands unless half or twice it scores OCTAVE_MARGIN more on
# these cues, each measured on a grid fitted at that level (a conditional logit fitted on BMS
# charts' tempos, docs/PATTERN_DESIGN.md 49): the comb fit (log; it rises for faster grids), the
# perceptual prior (log), the onset function's autocorrelation at the beat and the backbeat ratio
# (log; snares on one grid position in four mean the grid runs at twice the beat). The rules above
# left a tenth of the one-BPM BMS songs at half or twice the chart's tempo; without the margin the
# model, fitted on fast BMS songs, read the slow synthetic pop and hip-hop songs at twice their
# tempo.
OCTAVE_WEIGHTS = {"comb": 4.19, "prior": 5.58, "acf": 3.56, "backbeat": -1.00}
OCTAVE_MARGIN = 2.5
OCTAVE_RANGE = (30.0, 520.0)
# A level the margin kept still goes to twice its tempo when this logistic model is DOUBLE_MIN_P
# sure of it: the kicks' and the snares' flux on its half-beats against its beats (log ratios; at
# half a fast song's tempo they hit the half-beats, its real beats, about as hard) and how much
# higher twice the level scores on OCTAVE_WEIGHTS. Fitted on the BMS songs the margin kept
# (docs/PATTERN_DESIGN.md 54): 33 of the 75 left at half their chart's tempo (drum and bass at
# 174, songs of 175-215 BPM) moved up, 3 of 1727 slow songs read right moved too.
DOUBLE_WEIGHTS = {"kickHalf": 1.07, "snareHalf": 0.90, "scoreGain": 0.92}
DOUBLE_BIAS = -0.35
DOUBLE_MIN_P = 0.5
# The fitted phase moves by a third of a beat when the drums (all of the percussive flux) hit the
# grid shifted so this many times harder than the fitted one.
TRIPLET_SHIFT_RATIO = 1.5
# After the half-beat step it moves by a quarter of a beat (syncopated kicks and claps held the comb
# fit a sixteenth off) when the drums hit the grid shifted so this many times harder: no BMS song
# read on the beat had a quarter-shifted grid more than 1.11 times harder, 8 of the 18 a sixteenth
# off moved onto the beat (docs/PATTERN_DESIGN.md 55).
QUARTER_SHIFT_RATIO = 1.2
# It moves by half a beat when the cues below say the half-beat grid is the beat (the comb fit
# weights low onsets up, so an off-beat bass can pull it there): a logistic model of the log ratios
# (half-beat grid over fitted grid) of how hard each hits there, fitted on BMS charts' beats
# (docs/PATTERN_DESIGN.md 48, 51, 53): the drums above and below BACKBEAT_MIN_HZ (snares and
# claps, kicks), the mid-band onsets (snares, chords; within HALF_SHIFT_TOL_S of a grid point), the
# harmony's change into each beat (chords change on the beat) and how sharply its bar-to-bar change
# stands out at the best downbeat phase (the largest of meter.bar_changes over their mean: bars of
# the off-beat grid straddle the chord changes), and the same sharpness of the onsets' sound
# changing from bar to bar (meter.timbre_changes: instruments come in and drop out on downbeats).
# The drums alone settle it when all of their
# flux prefers one grid by a log ratio over HALF_SHIFT_DRUMS_LOG (BMS: 22 of the 24 songs past it
# towards the half-beats needed the move, 394 of the 401 past it the other way did not), so an
# off-beat bass's mid-band partials do not outvote a clear kick and clap.
HALF_SHIFT_WEIGHTS = {"drumHigh": 3.42, "drumLow": 2.15, "onsetMid": 3.41, "harmony": 3.36, "barHarmony": 6.02, "barTimbre": 5.52}
HALF_SHIFT_BIAS = 0.04
HALF_SHIFT_DRUMS_LOG = 0.4
HALF_SHIFT_TOL_S = 0.025
# A piecewise tempo map stands only when it explains the onsets clearly better than the one grid:
# in more than PIECEWISE_WINDOW_SHARE of the windows of WINDOW_BEATS beats its beats and half-beats
# (within PIECEWISE_HIT_S) hold PIECEWISE_GAIN more of the onset weight. A drifting phase or two
# windows of a different local tempo split a third of the one-BPM BMS songs; most of the splits
# moved the beats off the chart's.
PIECEWISE_GAIN = 0.2
PIECEWISE_WINDOW_SHARE = 0.15
PIECEWISE_HIT_S = 0.025


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


def _drums_on_half_beats(times: np.ndarray, weights: np.ndarray, drums: DrumFlux, bpm: float, duration: float) -> bool:
    """Whether the kicks (below BACKBEAT_MIN_HZ) or the snares (above) hit the half-beats of a
    `bpm` grid about as hard as its beats (so the beat is at twice `bpm`)."""
    fit = fit_grid(times, weights, bpm, search=0.002)
    half = 30.0 / fit.bpm
    low = np.maximum(drums.full - drums.high, 0.0)
    for env in (low, drums.high):
        on = _grid_hits(env, drums.frame_rate, fit.bpm, fit.phase, duration)
        off = _grid_hits(env, drums.frame_rate, fit.bpm, fit.phase + half, duration)
        if len(on) >= 8 and float(np.mean(off)) >= FAST_LEVEL_RATIO * max(float(np.mean(on)), 1e-12):
            return True
    return False


def _halve_on_backbeat(times: np.ndarray, weights: np.ndarray, bpm: float, drums: DrumFlux, duration: float) -> float:
    """Half the grid's tempo when its snares fall on one position in four, not two, or when it is
    above FAST_LEVEL_BPM and the drums keep to half of it."""
    if bpm / 2 < NORMAL_RANGE[0]:
        return bpm
    if bpm > FAST_LEVEL_BPM and not _drums_on_half_beats(times, weights, drums, bpm / 2, duration):
        return bpm / 2
    fit = fit_grid(times, weights, bpm, search=0.002)
    ratio, active = backbeat_ratio(drums, fit.bpm, fit.phase, duration)
    return bpm / 2 if active and ratio >= BACKBEAT_RATIO else bpm


def _octave_score(times: np.ndarray, weights: np.ndarray, drums: DrumFlux, odf: np.ndarray, frame_rate: float, bpm: float, duration: float) -> tuple[GridFit, float]:
    """A grid fitted at `bpm` and its OCTAVE_WEIGHTS score."""
    fit = fit_grid(times, weights, bpm, search=0.004)
    x = odf - float(np.mean(odf))
    lag = int(round(60.0 / fit.bpm * frame_rate))
    acf = float(np.dot(x[:-lag], x[lag:]) / (np.dot(x, x) + 1e-12)) if 0 < lag < len(x) // 2 else 0.0
    ratio, _ = backbeat_ratio(drums, fit.bpm, fit.phase, duration)
    cues = {
        "comb": float(np.log(fit.score + 1e-9)),
        "prior": float(np.log(_prior(fit.bpm) + 1e-12)),
        "acf": acf,
        "backbeat": float(np.log(max(ratio, 1e-9))),
    }
    return fit, sum(w * cues[name] for name, w in OCTAVE_WEIGHTS.items())


def _half_beat_drums(drums: DrumFlux, grid: GridFit, duration: float) -> dict[str, float]:
    """Log ratios of the kicks' and the snares' flux on the grid's half-beats to its beats."""
    half = 30.0 / grid.bpm
    low = np.maximum(drums.full - drums.high, 0.0)
    out = {}
    for name, env in (("kickHalf", low), ("snareHalf", drums.high)):
        on = _grid_hits(env, drums.frame_rate, grid.bpm, grid.phase, duration)
        off = _grid_hits(env, drums.frame_rate, grid.bpm, grid.phase + half, duration)
        out[name] = _log_ratio(float(np.mean(off)) if len(off) else 0.0, float(np.mean(on)) if len(on) else 0.0)
    return out


def _choose_octave(times: np.ndarray, weights: np.ndarray, drums: DrumFlux, odf: np.ndarray, frame_rate: float, fit: GridFit, duration: float) -> GridFit:
    """The grid at the level found, or at half or twice it when that scores OCTAVE_MARGIN more, or
    at twice it when DOUBLE_WEIGHTS are sure of it."""
    best, best_score = fit, -np.inf
    scored: dict[float, tuple[GridFit, float]] = {}
    for f in (1.0, 0.5, 2.0):
        if not OCTAVE_RANGE[0] <= fit.bpm * f <= OCTAVE_RANGE[1]:
            continue
        grid, score = _octave_score(times, weights, drums, odf, frame_rate, fit.bpm * f, duration)
        scored[f] = (grid, score)
        if f == 1.0:
            best_score = score + OCTAVE_MARGIN
        elif score > best_score:
            best, best_score = grid, score
    if best is fit and drums is not None and 1.0 in scored and 2.0 in scored:
        cues = _half_beat_drums(drums, scored[1.0][0], duration)
        cues["scoreGain"] = scored[2.0][1] - scored[1.0][1]
        logit = DOUBLE_BIAS + sum(w * cues[name] for name, w in DOUBLE_WEIGHTS.items())
        if 1.0 / (1.0 + np.exp(-logit)) >= DOUBLE_MIN_P:
            best = scored[2.0][0]
    return best


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


def _quarter_phase(drums: DrumFlux, bpm: float, phase: float, duration: float) -> float:
    """The phase moved by a quarter of a beat when the drums hit there QUARTER_SHIFT_RATIO times
    harder (a grid a sixteenth off the beat)."""
    period = 60.0 / bpm

    def accent(p: float) -> float:
        hits = _grid_hits(drums.full, drums.frame_rate, bpm, p, duration)
        return float(np.mean(hits)) if len(hits) else 0.0

    base = accent(phase)
    best, shift = max((accent(phase + k * period / 4), k) for k in (1, 3))
    return (phase + shift * period / 4) % period if best >= QUARTER_SHIFT_RATIO * max(base, 1e-12) else phase


def _log_ratio(a: float, b: float) -> float:
    return float(np.log((a + 1e-9) / (b + 1e-9)))


def _half_phase(
    times: np.ndarray,
    mid_weights: np.ndarray,
    drums: DrumFlux,
    bpm: float,
    phase: float,
    duration: float,
    chroma: np.ndarray | None = None,
    chroma_rate: float = 0.0,
    strengths: np.ndarray | None = None,
    spectra: np.ndarray | None = None,
) -> float:
    """The phase moved by half a beat when the cues hit there harder (HALF_SHIFT_WEIGHTS; an
    off-beat bass pulled the comb fit, whose weights favour low onsets, off the beat). `spectra`
    (each onset's, with `strengths`) lets the onsets' sound speak."""
    period = 60.0 / bpm
    low = np.maximum(drums.full - drums.high, 0.0)

    def grid_mean(env: np.ndarray, rate: float, p: float) -> float:
        hits = _grid_hits(env, rate, bpm, p, duration)
        return float(np.mean(hits)) if len(hits) else 0.0

    def mid_sum(p: float) -> float:
        u = np.mod(times - p, period)
        return float(np.sum(mid_weights[np.minimum(u, period - u) <= HALF_SHIFT_TOL_S]))

    def harmony(p: float) -> float:
        grid = _beats_from_grid(0.0, duration, period, p % period)
        if chroma is None or len(grid) < 8:
            return 0.0
        unit = beat_sync(chroma, chroma_rate, grid)
        unit /= np.linalg.norm(unit, axis=1, keepdims=True) + 1e-9
        return float(np.mean(1.0 - np.sum(unit[1:] * unit[:-1], axis=1)))

    def bar_harmony(p: float) -> float:
        grid = _beats_from_grid(0.0, duration, period, p % period)
        if chroma is None or len(grid) < 48:
            return 1.0
        changes = bar_changes(beat_sync(chroma, chroma_rate, grid), 4)
        return float(np.max(changes) / (np.mean(changes) + 1e-9))

    def bar_timbre(p: float) -> float:
        grid = _beats_from_grid(0.0, duration, period, p % period)
        if spectra is None or strengths is None or len(grid) < 48:
            return 1.0
        changes = timbre_changes(beat_timbre(grid, times, strengths, spectra))[0] + 1e-6
        return float(np.max(changes) / (np.mean(changes) + 1e-9))

    cues = {
        "drumFull": lambda p: grid_mean(drums.full, drums.frame_rate, p),
        "drumHigh": lambda p: grid_mean(drums.high, drums.frame_rate, p),
        "drumLow": lambda p: grid_mean(low, drums.frame_rate, p),
        "onsetMid": mid_sum,
        "harmony": harmony,
        "barHarmony": bar_harmony,
        "barTimbre": bar_timbre,
    }
    off = phase + period / 2
    drums_say = _log_ratio(cues["drumFull"](off), cues["drumFull"](phase))
    if abs(drums_say) > HALF_SHIFT_DRUMS_LOG:
        score = drums_say
    else:
        score = HALF_SHIFT_BIAS + sum(w * _log_ratio(cues[name](off), cues[name](phase)) for name, w in HALF_SHIFT_WEIGHTS.items())
    return off % period if score > 0 else phase


def _even_thirds(times: np.ndarray, weights: np.ndarray, fit: GridFit) -> bool:
    """Whether the onsets fill the 1/3 and 2/3 positions of this grid about evenly (EVEN_THIRDS)."""
    u = np.mod((times - fit.phase) / (60.0 / fit.bpm), 1.0)
    a = float(weights[np.abs(u - 1.0 / 3.0) < THIRDS_TOL_BEATS].sum())
    b = float(weights[np.abs(u - 2.0 / 3.0) < THIRDS_TOL_BEATS].sum())
    return min(a, b) >= EVEN_THIRDS * max(a, b, 1e-12)


def _choose_level(times: np.ndarray, weights: np.ndarray, odf: np.ndarray, frame_rate: float) -> float:
    base = beat_level_bpm(odf, frame_rate)
    options = [base * r for r in LEVEL_RATIOS if BPM_MIN <= base * r <= BPM_MAX]
    best_bpm, best_score = base, -1.0
    base_grid = fit_grid(times, weights, base, search=0.04)
    base_fit = base_grid.score
    if not _even_thirds(times, weights, base_grid):
        options = [bpm for bpm in options if abs(bpm / base - 1.5) > 1e-6]
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
    mid_fraction: np.ndarray | None = None,
    chroma: np.ndarray | None = None,
    chroma_rate: float = 0.0,
    onset_spectra: np.ndarray | None = None,
) -> TempoResult:
    """`bpm_hint` (e.g. from an ML beat tracker) picks the beat level instead of the
    autocorrelation; the grid is still fitted to the onsets. `drums` lets the snares settle the
    level the autocorrelation chose (and vouch for a hint above FAST_LEVEL_BPM) and the drums the
    phase of a shuffle, and with `mid_fraction` (each onset's mid-band share), `chroma` (frames of
    pitch-class energy at `chroma_rate`) and `onset_spectra` (onsets.onset_spectra) a phase on the
    off-beats."""
    if len(times) < 8:
        bpm = bpm_override or 120.0
        period = 60.0 / bpm
        return TempoResult(beats=np.arange(0.0, duration, period), segments=[TempoSegment(0.0, bpm, int(duration / period) + 1)], confidence=0.0)

    # Kicks and bass carry the beat; weight them up so off-beat hi-hats do not steal the phase.
    weights = strengths.astype(np.float64) * (1.0 + 1.2 * low_fraction.astype(np.float64))
    bpm0 = bpm_override if bpm_override else (bpm_hint if bpm_hint else _choose_level(times, weights, odf, frame_rate))
    if drums is not None and not bpm_override and not bpm_hint:
        bpm0 = _halve_on_backbeat(times, weights, bpm0, drums, duration)
    elif not bpm_override and bpm0 > FAST_LEVEL_BPM and (drums is None or not _drums_on_half_beats(times, weights, drums, bpm0 / 2, duration)):
        bpm0 /= 2  # a fast level (an ML beat tracker's too) needs the drums' word
    fit = fit_grid(times, weights, bpm0, search=0.002 if bpm_override else 0.01)
    if bpm_override:
        fit = GridFit(bpm=bpm_override, phase=_best_phase(times, weights, 60.0 / bpm_override)[0], score=fit.score)
    elif drums is not None and not bpm_hint:
        fit = _choose_octave(times, weights, drums, odf, frame_rate, fit, duration)
    period = 60.0 / fit.bpm

    centers, offsets = _local_offsets(times, weights, period, fit.phase, duration)
    drift = float(np.ptp(offsets)) if len(offsets) >= 3 else 0.0
    local = [] if bpm_override else _local_tempos(times, weights, fit.bpm, duration)
    deviating = _sustained_deviation(local, fit.bpm)
    # Remove any residual constant offset (median of local offsets) from the phase.
    phase = fit.phase + (float(np.median(offsets)) if len(offsets) else 0.0)
    if not bpm_override and (deviating or drift > 2 * DRIFT_LIMIT_S):
        piecewise = _piecewise(times, weights, fit.bpm, duration, fit.score, local)
        plain = _beats_from_grid(0.0, duration, period, phase % period)
        if _windows_gained(times, weights, piecewise.beats, plain, period, duration) > PIECEWISE_WINDOW_SHARE:
            return piecewise
    if drums is not None:
        phase = _triplet_phase(drums, fit.bpm, phase, duration)
        if mid_fraction is not None and not bpm_override and duration >= 16 * period:
            phase = _half_phase(times, strengths * mid_fraction, drums, fit.bpm, phase, duration, chroma, chroma_rate, strengths, onset_spectra)
        phase = _quarter_phase(drums, fit.bpm, phase, duration)
    beats = _beats_from_grid(0.0, duration, period, phase % period)
    return TempoResult(
        beats=beats,
        segments=[TempoSegment(float(beats[0]) if len(beats) else 0.0, fit.bpm, len(beats))],
        constant=True,
        confidence=float(min(1.0, fit.score * 2)),
    )


def _explained(times: np.ndarray, weights: np.ndarray, beats: np.ndarray) -> float:
    """Share of the onset weight within PIECEWISE_HIT_S of the beats or the half-beats."""
    if len(beats) < 2 or not len(times):
        return 0.0
    marks = np.sort(np.concatenate([beats, beats[:-1] + np.diff(beats) / 2]))
    i = np.clip(np.searchsorted(marks, times), 1, len(marks) - 1)
    gap = np.minimum(np.abs(times - marks[i - 1]), np.abs(times - marks[i]))
    return float(np.sum(weights[gap <= PIECEWISE_HIT_S]) / max(float(np.sum(weights)), 1e-12))


def _windows_gained(times: np.ndarray, weights: np.ndarray, beats: np.ndarray, plain: np.ndarray, period: float, duration: float) -> float:
    """Share of the windows of WINDOW_BEATS beats where `beats` explain PIECEWISE_GAIN more of the
    onset weight than the one grid `plain`."""
    window = WINDOW_BEATS * period
    gains = []
    for t0 in np.arange(0.0, duration, window):
        sel = (times >= t0) & (times < t0 + window)
        if np.count_nonzero(sel) < 12:
            continue
        lo, hi = t0 - period, t0 + window + period
        split = _explained(times[sel], weights[sel], beats[(beats >= lo) & (beats < hi)])
        gains.append(split - _explained(times[sel], weights[sel], plain[(plain >= lo) & (plain < hi)]))
    return float(np.mean(np.asarray(gains) > PIECEWISE_GAIN)) if gains else 0.0


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
