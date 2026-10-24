"""Multi-band spectral-flux onset detection with sub-frame peak interpolation."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import maximum_filter1d, uniform_filter1d

# Band split (Hz) between low / mid / high onset functions.
LOW_MAX_HZ = 200.0
MID_MAX_HZ = 3000.0
FLUX_LAG = 2
FREQ_MAX_FILTER = 5
# Summed log-mel flux of a clearly audible hit is ~10-40; steady tones stay far below this floor.
FLUX_FLOOR = 3.0
# A weak onset shortly after a stronger one in the same band is treated as its decay/sweep.
MASK_WINDOW_S = 0.12
MASK_RATIO = 0.35
# How surely an onset starts a new sound rather than a sounding one changing (its low end arriving
# late, a swell, beating partials): a logistic model fitted on BMS keysounds, each onset labelled by
# whether a keysound starts there (docs/PATTERN_DESIGN.md 19). logit = bias + sum(weight * feature).
# The onset's strength itself is left out: it hardly adds (AUC 0.870 with it, 0.866 without) and
# the generator already weighs candidates by it.
ATTACK_WEIGHTS = {
    "rise": 0.16,  # dB its strongest band gets louder from 20 ms before the onset to just after it
    "harmonic": 0.617,  # log(harmonic rise + 0.01)
    "drums": 4.267,  # drums stem share
    "close": -2.467,  # 1 at the previous onset, 0 from ATTACK_CLOSE_S after it
    "closeRatio": 1.779,  # close * log(strength / previous onset's strength), clipped to +-2
    "low": -1.176,  # its strongest band is the low one
}
ATTACK_BIAS = 1.371
ATTACK_CLOSE_S = 0.1
ATTACK_RISE_S = 0.02
# An onset's spectrum (onset_spectra) is read this many frames after it, once its attack is up.
SPECTRUM_LAG_FRAMES = 2


@dataclass
class OnsetData:
    times: np.ndarray  # seconds
    strength: np.ndarray  # 0..1
    bands: np.ndarray  # (n, 3) relative low/mid/high contribution, rows sum to 1
    odf: np.ndarray  # total onset detection function per frame (normalized)
    odf_bands: np.ndarray  # (frames, 3), each band normalized
    frame_rate: float
    time_offset: float  # seconds added to frame index / frame_rate


def _robust_normalize(x: np.ndarray, floor: float) -> np.ndarray:
    """Scale by the 99.5th percentile, but never below `floor` so near-silent or steady audio
    (whose flux is tiny everywhere) is not blown up into fake onsets."""
    scale = float(np.percentile(x, 99.5)) if x.size else 0.0
    return np.clip(x / max(scale, floor), 0.0, 1.5).astype(np.float32)


def onset_functions(mel_power: np.ndarray, mel_centers: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """SuperFlux-style onset strength: rectified log-mel increase vs. a max-filtered lagged frame."""
    log_mel = np.log1p(1000.0 * mel_power / (np.max(mel_power) + 1e-12)).astype(np.float32)
    ref = maximum_filter1d(log_mel, size=FREQ_MAX_FILTER, axis=1)
    diff = np.zeros_like(log_mel)
    diff[FLUX_LAG:] = np.maximum(0.0, log_mel[FLUX_LAG:] - ref[:-FLUX_LAG])
    groups = [mel_centers < LOW_MAX_HZ, (mel_centers >= LOW_MAX_HZ) & (mel_centers < MID_MAX_HZ), mel_centers >= MID_MAX_HZ]
    raw_bands = np.stack([diff[:, g].sum(axis=1) for g in groups], axis=1)
    n_bands = len(mel_centers)
    total = _robust_normalize(diff.sum(axis=1), FLUX_FLOOR)
    bands = np.stack(
        [_robust_normalize(raw_bands[:, i], FLUX_FLOOR * max(1, int(np.count_nonzero(g))) / n_bands) for i, g in enumerate(groups)],
        axis=1,
    )
    return total, bands


def pick_peaks(
    odf: np.ndarray,
    frame_rate: float,
    delta: float = 0.07,
    threshold: float = 0.06,
    pre_max_s: float = 0.03,
    post_max_s: float = 0.03,
    avg_s: float = 0.1,
    wait_s: float = 0.03,
) -> np.ndarray:
    """Peak frame positions (float, parabolically interpolated) of an onset function."""
    if odf.size < 3:
        return np.zeros(0)
    w_max = max(1, int(round((pre_max_s + post_max_s) * frame_rate))) | 1
    local_max = maximum_filter1d(odf, size=w_max, mode="nearest")
    w_avg = max(1, int(round(2 * avg_s * frame_rate))) | 1
    local_avg = uniform_filter1d(odf, size=w_avg, mode="nearest")
    candidates = np.nonzero((odf >= local_max) & (odf >= local_avg + delta) & (odf >= threshold))[0]
    wait = int(round(wait_s * frame_rate))
    peaks: list[float] = []
    last = -10**9
    for i in candidates:
        if i - last < wait:
            if peaks and odf[i] > odf[int(round(peaks[-1]))]:
                peaks[-1] = float(i)
                last = i
            continue
        peaks.append(float(i))
        last = i
    out = np.array(peaks)
    # parabolic interpolation around each peak
    for k, p in enumerate(out):
        i = int(p)
        if 0 < i < len(odf) - 1:
            a, b, c = odf[i - 1], odf[i], odf[i + 1]
            denom = a - 2 * b + c
            if abs(denom) > 1e-12:
                out[k] = i + float(np.clip(0.5 * (a - c) / denom, -0.5, 0.5))
    return out


def _masked(times: np.ndarray, strength: np.ndarray, bands: np.ndarray) -> np.ndarray:
    """Flags weak onsets that follow a much stronger onset with the same dominant band."""
    masked = np.zeros(len(times), dtype=bool)
    dominant = np.argmax(bands, axis=1) if len(times) else np.zeros(0, dtype=int)
    for i in range(len(times)):
        j = i - 1
        while j >= 0 and times[i] - times[j] <= MASK_WINDOW_S:
            if not masked[j] and dominant[j] == dominant[i] and strength[i] < MASK_RATIO * strength[j]:
                masked[i] = True
                break
            j -= 1
    return masked


def onset_spectra(mel_power: np.ndarray, onsets: OnsetData) -> np.ndarray:
    """Each onset's log10 mel spectrum SPECTRUM_LAG_FRAMES after it (onsets, mels): what it sounds
    like."""
    last = len(mel_power) - 1
    frames = np.clip(np.round((onsets.times - onsets.time_offset) * onsets.frame_rate).astype(int), 0, last)
    floor = 1e-10 * float(mel_power.max()) + 1e-20
    return np.log10(mel_power[np.minimum(last, frames + SPECTRUM_LAG_FRAMES)].astype(np.float64) + floor)


def band_levels(mel_power: np.ndarray, mel_centers: np.ndarray) -> np.ndarray:
    """Per-frame level (dB under the loudest frame) of the low / mid / high onset bands, smoothed
    over three frames (frames, 3)."""
    groups = [mel_centers < LOW_MAX_HZ, (mel_centers >= LOW_MAX_HZ) & (mel_centers < MID_MAX_HZ), mel_centers >= MID_MAX_HZ]
    band = np.stack([mel_power[:, g].sum(axis=1, dtype=np.float64) for g in groups], axis=1)
    db = 10.0 * np.log10(band / (float(band.max()) + 1e-20) + 1e-10)
    return uniform_filter1d(db, size=3, axis=0, mode="nearest")


def attack_confidence(
    times: np.ndarray,
    strength: np.ndarray,
    bands: np.ndarray,
    harmonic_rise: np.ndarray,
    drums: np.ndarray,
    levels: np.ndarray,
    frame_rate: float,
    time_offset: float,
) -> np.ndarray:
    """0..1 per onset (times sorted): how surely a new sound starts there (ATTACK_WEIGHTS)."""
    if not len(times):
        return np.zeros(0)
    f = np.clip(np.round((times - time_offset) * frame_rate).astype(int), 0, len(levels) - 1)
    top = np.minimum(len(levels) - 1, f + 2)
    before = np.maximum(0, f - int(round(ATTACK_RISE_S * frame_rate)))
    dom = np.argmax(bands, axis=1)
    rise = np.clip(levels[top, dom] - levels[before, dom], -10.0, 20.0)
    gap = np.concatenate([[np.inf], np.diff(times)])
    close = np.clip(1.0 - gap / ATTACK_CLOSE_S, 0.0, 1.0)
    previous = np.concatenate([[1.0], strength[:-1]])
    ratio = np.clip(np.log(np.maximum(strength, 1e-3) / np.maximum(previous, 1e-3)), -2.0, 2.0)
    w = ATTACK_WEIGHTS
    logit = (
        ATTACK_BIAS
        + w["rise"] * rise
        + w["harmonic"] * np.log(np.maximum(harmonic_rise, 0.0) + 0.01)
        + w["drums"] * drums
        + w["close"] * close
        + w["closeRatio"] * close * ratio
        + w["low"] * (dom == 0)
    )
    return 1.0 / (1.0 + np.exp(-logit))


def detect_onsets(mel_power: np.ndarray, mel_centers: np.ndarray, frame_rate: float, bias_s: float) -> OnsetData:
    """Onsets from the total flux, plus band-only onsets (e.g. hi-hats under a pad) merged in."""
    odf, odf_bands = onset_functions(mel_power, mel_centers)
    peaks = list(pick_peaks(odf, frame_rate))
    merge_frames = 0.025 * frame_rate
    # Low/mid band functions see sweeps and decays (stricter); hi-hats need the high band (looser).
    for b, (delta, threshold) in enumerate(((0.14, 0.18), (0.14, 0.18), (0.08, 0.1))):
        for p in pick_peaks(odf_bands[:, b], frame_rate, delta=delta, threshold=threshold):
            if not peaks or np.min(np.abs(np.asarray(peaks) - p)) > merge_frames:
                peaks.append(float(p))
    peaks_arr = np.sort(np.asarray(peaks, dtype=np.float64))

    idx = np.clip(np.round(peaks_arr).astype(int), 0, len(odf) - 1)
    lo = np.clip(idx - 1, 0, len(odf) - 1)
    hi = np.clip(idx + 1, 0, len(odf) - 1)
    band_vals = np.maximum(np.maximum(odf_bands[idx], odf_bands[lo]), odf_bands[hi])
    band_sum = band_vals.sum(axis=1, keepdims=True)
    bands = np.where(band_sum > 0, band_vals / np.maximum(band_sum, 1e-12), 1.0 / 3.0)
    strength = np.maximum(odf[idx], band_vals.max(axis=1) * 0.8)
    strength = np.clip(strength / max(float(np.percentile(strength, 98)) if strength.size else 1.0, 1e-6), 0.0, 1.0)

    # Lagged flux peaks sit between the lagged and current frame centers.
    time_offset = -0.5 * (FLUX_LAG - 1) / frame_rate + bias_s
    times = peaks_arr / frame_rate + time_offset
    keep = (times >= 0) & ~_masked(times, strength, bands)
    return OnsetData(
        times=times[keep],
        strength=strength[keep].astype(np.float32),
        bands=bands[keep].astype(np.float32),
        odf=odf,
        odf_bands=odf_bands,
        frame_rate=frame_rate,
        time_offset=time_offset,
    )
