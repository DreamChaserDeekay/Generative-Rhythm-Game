"""Per-onset pitch estimate and note sustain from the harmonic spectrogram."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Melody register searched for the strongest newly-sounding partial (bass is below it).
MELODY_MIN_HZ = 200.0
MELODY_MAX_HZ = 2000.0
MAX_SUSTAIN_S = 8.0
SUSTAIN_DROP = 0.3  # note ends when its partials fall below 30% (~ -10 dB)
MIN_SUSTAIN_S = 0.2
RENEW_RATIO = 0.5  # a later onset re-attacks the note when its partials jump by 50%


@dataclass
class NoteInfo:
    pitch: np.ndarray  # MIDI float per onset, NaN when unpitched
    sustain_end: np.ndarray  # seconds per onset (== onset time when no sustain)
    harmonic_ratio: np.ndarray  # share of harmonic energy at the onset (0..1)


def _peak_pitch(rise: np.ndarray, freqs: np.ndarray) -> tuple[float, float]:
    """Pitch (MIDI) of the strongest rising partial in the melody register, folded down to its
    fundamental when a sub-harmonic also rose; returns (midi, confidence)."""
    lo = int(np.searchsorted(freqs, MELODY_MIN_HZ))
    hi = min(len(rise) - 1, int(np.searchsorted(freqs, MELODY_MAX_HZ)))
    if hi <= lo + 2:
        return float("nan"), 0.0
    band = rise[lo:hi]
    k = int(np.argmax(band)) + lo
    peak = float(rise[k])
    conf = peak / (float(np.median(band)) + 1e-9)
    y0, y1, y2 = (float(np.log(rise[j] + 1e-12)) for j in (k - 1, k, k + 1))
    denom = y0 - 2 * y1 + y2
    offset = float(np.clip(0.5 * (y0 - y2) / denom, -0.5, 0.5)) if abs(denom) > 1e-12 else 0.0
    bin_hz = freqs[1] - freqs[0]
    f = (k + offset) * bin_hz
    for div in (3, 2):
        kl = int(round(f / div / bin_hz))
        if f / div >= MELODY_MIN_HZ * 0.6 and kl > 0 and float(np.max(rise[kl - 1 : kl + 2])) > 0.25 * peak:
            f /= div
            break
    return 69 + 12 * float(np.log2(f / 440.0)), conf


def _tracked_bins(rise: np.ndarray, freqs: np.ndarray, midi: float) -> np.ndarray:
    bin_hz = freqs[1] - freqs[0]
    if np.isfinite(midi):
        f0 = 440.0 * 2 ** ((midi - 69) / 12)
        bins = []
        for h in (1, 2, 3):
            k = int(round(f0 * h / bin_hz))
            bins.extend(b for b in (k - 1, k, k + 1) if 0 <= b < len(rise))
        if bins:
            return np.unique(np.asarray(bins))
    lo = int(np.searchsorted(freqs, MELODY_MIN_HZ))
    return lo + np.argsort(rise[lo:])[-8:]


def analyze_notes(
    onset_times: np.ndarray,
    harmonic: np.ndarray,
    percussive: np.ndarray,
    freqs: np.ndarray,
    frame_rate: float,
) -> NoteInfo:
    n_frames = harmonic.shape[0]
    pitch = np.full(len(onset_times), np.nan)
    sustain = onset_times.copy()
    h_ratio = np.zeros(len(onset_times))
    h_energy = harmonic.sum(axis=1)
    p_energy = percussive.sum(axis=1)
    for i, t in enumerate(onset_times):
        f = int(round(t * frame_rate))
        before = max(0, f - 2)
        after = min(n_frames - 1, f + 2)
        if after <= before:
            continue
        h_ratio[i] = h_energy[after] / (h_energy[after] + p_energy[after] + 1e-12)
        rise = np.maximum(0.0, harmonic[after] - harmonic[before])
        if np.max(rise) <= 1e-9:
            continue
        midi, conf = _peak_pitch(rise, freqs)
        if np.isfinite(midi) and conf > 4.0:
            pitch[i] = midi
        # Track this note's own partials (harmonics of its pitch, else the strongest rises above the
        # bass register) until they decay or a later onset clearly re-attacks them.
        top = _tracked_bins(rise, freqs, pitch[i])
        level0 = float(harmonic[after, top].sum())
        if level0 <= 1e-9:
            continue
        end_frame = min(n_frames - 1, int((t + MAX_SUSTAIN_S) * frame_rate))
        levels = harmonic[after : end_frame + 1][:, top].sum(axis=1)
        below = np.nonzero(levels < SUSTAIN_DROP * level0)[0]
        stop = int(below[0]) if len(below) else len(levels)
        for j in range(i + 1, len(onset_times)):
            fj = int(round(onset_times[j] * frame_rate))
            if fj - after >= stop:
                break
            if fj - after < 2:
                continue
            current = float(harmonic[max(0, fj - 2), top].sum())
            renew = harmonic[min(n_frames - 1, fj + 2), top] - harmonic[max(0, fj - 2), top]
            if float(np.sum(np.maximum(renew, 0.0))) > RENEW_RATIO * max(current, 1e-9):
                stop = fj - after
                break
        end = (after + stop - 1) / frame_rate
        if end - t >= MIN_SUSTAIN_S:
            sustain[i] = end
    return NoteInfo(pitch=pitch, sustain_end=sustain, harmonic_ratio=h_ratio)
