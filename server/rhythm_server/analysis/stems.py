"""Source separation without ML: drums / bass / vocals (lead melody) / other.

Percussive and harmonic parts come from median-filter HPSS. The harmonic part is split further
by tracking the predominant bass line and the predominant melody (harmonic summation over
candidate pitches) and masking their partials; for stereo audio the melody mask is weighted by
how centred each bin is, since lead vocals usually sit in the middle. Whatever is left is
"other". The four masks sum to one, so the stems add back up to the mix.

This is an approximation meant to work everywhere; an ML separator (Demucs) replaces it when it
is installed (see analysis/backends).
"""

from __future__ import annotations

import os
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from typing import Callable, Iterator, TypeVar

import numpy as np
from scipy.ndimage import maximum_filter1d, median_filter

from .spectral import frames_view, median_along

STEM_NAMES = ("drums", "bass", "vocals", "other")

N_FFT = 4096
HOP = 1024
HPSS_KERNEL = 17
LOWPASS_HZ = (120.0, 250.0)  # harmonic energy below this is bass (cosine crossover)
BASS_RANGE_HZ = (40.0, 250.0)
BASS_HARMONICS = 6
BASS_LIMIT_HZ = 1500.0
MELODY_RANGE_HZ = (150.0, 1100.0)
MELODY_HARMONICS = 8
MELODY_LIMIT_HZ = 8000.0
STEPS_PER_SEMITONE = 3
HARMONIC_DECAY = 0.8
# Partial masks: flat within the first value (bins) of the partial, gone by the second (a Hann
# window spreads a sinusoid over about ±2 bins). The bass comb stays narrow so it does not
# swallow kick-drum bodies sitting a few bins below its fundamental.
MELODY_COMB = (1.0, 2.5)
BASS_COMB = (0.5, 1.5)
# Share of the band's energy explained by the tracked comb: below the first value there is no
# clear line (chords, noise), above the second the line owns its partials completely.
BASS_GATE = (0.15, 0.4)
MELODY_GATE = (0.2, 0.45)
# Overtone energy relative to the fundamental: a kick drum body is close to a pure sine (≈0), a
# bass instrument has clear overtones. Below the first value the line is not treated as bass.
BASS_HARMONICITY = (0.06, 0.18)
# Low harmonic energy that is not on the bass line's partials goes to the drums for this long
# after a low attack (kick / tom bodies are nearly pure, gliding sines).
LOW_DRUM_HZ = 180.0
LOW_DRUM_DECAY_S = 0.35
LOW_ATTACK_RATIO = 1.8
F0_SMOOTH_FRAMES = 5
# Onset shares compare each stem's attack with its own typical attack (95th percentile), but a
# stem whose typical attack is tiny next to the loudest stem is not blown up beyond this ratio.
SHARE_FLOOR = 0.02
# Melody presence of an onset: a vocals attack this far (relative to the stem's 95th percentile)
# counts fully; a pitch step of the melody line (frames on each side, semitones) without an attack
# counts MELODY_STEP_PRESENCE. A drum hit under a held note lifts the vocals stem too (its noise
# lands on the note's partials), but no more than the other stems: both cues count in full only
# where the vocals take their share of the onset (MELODY_ATTACK_SHARE, MELODY_STEP_SHARE).
# Measured on the synthetic songs: lead onsets rank above the others with an AUC of 0.77-0.90
# (the vocals share alone 0.71-0.84), and a snare roll under a sung note stays under 0.2.
MELODY_ATTACK_FULL = 0.6
MELODY_STEP_FRAMES = 3
MELODY_STEP_SEMITONES = 0.6
MELODY_STEP_PRESENCE = 0.5
MELODY_ATTACK_SHARE = 0.3
MELODY_STEP_SHARE = 0.2
BLOCK_S = 15.0
CONTEXT_S = 1.0
CROSSFADE_S = 0.25
# Blocks separated at once (each needs up to about 120 MB while it runs). One CPU is left for
# the game: the stems of a song are separated in the background while another may be played.
SEPARATE_WORKERS = 4

Progress = Callable[[float, str], None]
T = TypeVar("T")


@dataclass
class StemActivity:
    """Per-frame activity of each stem on the analysis STFT (frames at `HOP`)."""

    rise: np.ndarray  # (frames, 4) onset strength per stem
    energy: np.ndarray  # (frames, 4)
    melody_hz: np.ndarray  # predominant melody pitch, NaN where there is none
    bass_hz: np.ndarray


def _candidates(fmin: float, fmax: float) -> np.ndarray:
    m0 = 69 + 12 * np.log2(fmin / 440.0)
    m1 = 69 + 12 * np.log2(fmax / 440.0)
    midi = np.arange(m0, m1 + 1e-9, 1.0 / STEPS_PER_SEMITONE)
    return 440.0 * 2 ** ((midi - 69) / 12)


def predominant_f0(
    mag: np.ndarray,
    freqs: np.ndarray,
    frange: tuple[float, float],
    harmonics: int,
    limit_hz: float,
    need_overtones: bool = False,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Strongest harmonic series per frame (harmonic summation), the share of the band's energy
    its partials hold (0..1), and its overtone/fundamental energy ratio. `mag` is a magnitude
    spectrogram (frames, bins). With `need_overtones`, near-pure sines (drum bodies) score low."""
    bin_hz = float(freqs[1] - freqs[0])
    n_bins = mag.shape[1]
    peak = maximum_filter1d(mag, size=3, axis=1)
    cands = _candidates(*frange)
    fundamental = np.zeros((mag.shape[0], len(cands)), dtype=np.float32)
    overtones = np.zeros_like(fundamental)
    for h in range(1, harmonics + 1):
        idx = np.round(cands * h / bin_hz).astype(int)
        ok = (idx < n_bins) & (cands * h <= limit_hz)
        if np.any(ok):
            target = fundamental if h == 1 else overtones
            target[:, ok] += (HARMONIC_DECAY ** (h - 1)) * peak[:, idx[ok]]
    salience = fundamental + overtones
    if need_overtones:
        salience *= overtones / (overtones + 0.15 * fundamental + 1e-9)
    best = np.argmax(salience, axis=1)
    f0 = cands[best]
    if len(f0) >= F0_SMOOTH_FRAMES:
        f0 = 2 ** median_filter(np.log2(f0), size=F0_SMOOTH_FRAMES, mode="nearest")
    # energy share of the comb inside the band it can reach
    lo = int(np.searchsorted(freqs, frange[0] * 0.9))
    hi = min(n_bins, int(np.searchsorted(freqs, limit_hz)))
    band = np.sum(mag[:, lo:hi].astype(np.float64) ** 2, axis=1) + 1e-12
    comb = comb_mask(f0, np.ones(len(f0)), freqs, harmonics, limit_hz, BASS_COMB if need_overtones else MELODY_COMB)
    held = np.sum((mag[:, lo:hi].astype(np.float64) * comb[:, lo:hi]) ** 2, axis=1)
    rows = np.arange(len(f0))
    fund = peak[rows, np.clip(np.round(f0 / bin_hz).astype(int), 0, n_bins - 1)].astype(np.float64) ** 2
    over = np.zeros(len(f0))
    for h in range(2, harmonics + 1):
        k = np.round(f0 * h / bin_hz).astype(int)
        ok = (k < n_bins) & (f0 * h <= limit_hz)
        over[ok] += peak[rows[ok], k[ok]].astype(np.float64) ** 2
    return f0, np.clip(held / band, 0.0, 1.0), over / (fund + 1e-12)


def comb_mask(
    f0: np.ndarray, weight: np.ndarray, freqs: np.ndarray, harmonics: int, limit_hz: float, shape: tuple[float, float] = MELODY_COMB
) -> np.ndarray:
    """Flat-topped peaks on the partials of `f0`, scaled per frame by `weight`."""
    n_frames, n_bins = len(f0), len(freqs)
    bin_hz = float(freqs[1] - freqs[0])
    inner, outer = shape
    mask = np.zeros((n_frames, n_bins), dtype=np.float32)
    rows = np.arange(n_frames)
    reach = int(np.ceil(outer))
    for h in range(1, harmonics + 1):
        center = f0 * h / bin_hz
        ok = (f0 * h <= limit_hz) & np.isfinite(center)
        base = np.round(np.where(ok, center, 0)).astype(int)
        for d in range(-reach, reach + 1):
            k = base + d
            valid = ok & (k >= 0) & (k < n_bins)
            value = np.clip((outer - np.abs(k - center)) / (outer - inner), 0.0, 1.0) * weight
            np.maximum.at(mask, (rows[valid], k[valid]), value[valid].astype(np.float32))
    return mask


def _gate(share: np.ndarray, gate: tuple[float, float]) -> np.ndarray:
    return np.clip((share - gate[0]) / (gate[1] - gate[0]), 0.0, 1.0)


def _lowpass(freqs: np.ndarray) -> np.ndarray:
    lo, hi = LOWPASS_HZ
    x = np.clip((freqs - lo) / (hi - lo), 0.0, 1.0)
    return (0.5 + 0.5 * np.cos(np.pi * x)).astype(np.float32)


def low_drum_mask(low_mag: np.ndarray, bass: np.ndarray, freqs: np.ndarray, frame_rate: float) -> np.ndarray:
    """Mask (frames, bins) giving the low bins that are not on the bass line's partials to the
    drums for LOW_DRUM_DECAY_S after each sharp low attack. `low_mag` is the full low-band
    magnitude (harmonic + percussive), where attacks are easiest to see."""
    k = int(np.searchsorted(freqs, LOW_DRUM_HZ))
    mask = np.zeros_like(bass, dtype=np.float32)
    if k == 0 or len(low_mag) < 3:
        return mask
    low = low_mag[:, :k].astype(np.float64).sum(axis=1)
    span = max(1, int(round(LOW_DRUM_DECAY_S * frame_rate)))
    floor = 0.05 * (float(low.max()) + 1e-12)
    attacks = np.nonzero((low[1:] > LOW_ATTACK_RATIO * low[:-1] + 1e-12) & (low[1:] > floor))[0] + 1
    recent = np.zeros(len(low), dtype=np.float32)
    for a in attacks:
        recent[a - 1 : a + span] = 1.0
    mask[:, :k] = recent[:, None] * (1.0 - bass[:, :k])
    return mask


def harmonic_masks(
    harmonic: np.ndarray,
    freqs: np.ndarray,
    frame_rate: float,
    centre: np.ndarray | None = None,
    low_mag: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Split a harmonic magnitude spectrogram into drum-body / bass / vocals / other masks (they
    sum to one). Returns (drum_body, bass, vocals, other, (melody_hz, bass_hz) as (frames, 2))."""
    bass_f0, bass_share, bass_harm = predominant_f0(
        harmonic, freqs, BASS_RANGE_HZ, BASS_HARMONICS, BASS_LIMIT_HZ, need_overtones=True
    )
    bass_weight = _gate(bass_share, BASS_GATE) * _gate(bass_harm, BASS_HARMONICITY)
    bass = comb_mask(bass_f0, bass_weight, freqs, BASS_HARMONICS, BASS_LIMIT_HZ, BASS_COMB)
    # Off the bass partials, low energy right after a low attack is a drum body; held low sound
    # without a clear series (sub bass) still counts as bass below the crossover.
    body = low_drum_mask(low_mag if low_mag is not None else harmonic, bass, freqs, frame_rate)
    bass = np.maximum(bass, _lowpass(freqs)[None, :] * (1.0 - body))
    body = body * (1.0 - bass)
    rest = harmonic * (1.0 - bass - body)
    mel_f0, mel_share, _ = predominant_f0(rest, freqs, MELODY_RANGE_HZ, MELODY_HARMONICS, MELODY_LIMIT_HZ)
    mel_weight = _gate(mel_share, MELODY_GATE)
    vocals = comb_mask(mel_f0, mel_weight, freqs, MELODY_HARMONICS, MELODY_LIMIT_HZ) * (1.0 - bass - body)
    if centre is not None:
        vocals *= np.sqrt(np.clip(centre, 0.0, 1.0))
    other = np.clip(1.0 - body - bass - vocals, 0.0, 1.0)
    pitches = np.stack([np.where(mel_weight > 0, mel_f0, np.nan), np.where(bass_weight > 0, bass_f0, np.nan)], axis=1)
    return body.astype(np.float32), bass.astype(np.float32), vocals.astype(np.float32), other.astype(np.float32), pitches


def activity_from_spectra(specs: list[np.ndarray] | tuple[np.ndarray, ...], ref: float) -> tuple[np.ndarray, np.ndarray]:
    """Onset strength (log spectral flux) and energy per frame for each stem spectrogram."""
    n_frames = specs[0].shape[0]
    rise = np.zeros((n_frames, len(specs)))
    energy = np.zeros((n_frames, len(specs)))
    for s, spec in enumerate(specs):
        energy[:, s] = np.sum(spec.astype(np.float64) ** 2, axis=1)
        comp = np.log1p(100.0 * spec / (ref + 1e-9))
        if n_frames > 1:
            rise[1:, s] = np.sum(np.maximum(0.0, comp[1:] - comp[:-1]), axis=1)
    return rise, energy


def stem_activity(mag: np.ndarray, harmonic: np.ndarray, percussive: np.ndarray, freqs: np.ndarray, frame_rate: float) -> StemActivity:
    """Approximate stems on the analysis STFT (mono). `harmonic`/`percussive` may cover only the
    lower bins; everything above them counts as drums (hats, cymbals)."""
    n_frames, n_bins = mag.shape
    k = harmonic.shape[1]
    harm = harmonic.astype(np.float32)
    body_m, bass_m, vocal_m, other_m, pitches = harmonic_masks(harm, freqs[:k], frame_rate, low_mag=mag[:, :k])
    drums = np.empty((n_frames, n_bins), dtype=np.float32)
    drums[:, :k] = percussive + harm * body_m
    drums[:, k:] = mag[:, k:]
    rise, energy = activity_from_spectra((drums, harm * bass_m, harm * vocal_m, harm * other_m), float(np.max(mag)))
    return StemActivity(rise=rise, energy=energy, melody_hz=pitches[:, 0], bass_hz=pitches[:, 1])


def tag_onsets(times: np.ndarray, activity: StemActivity, frame_rate: float) -> tuple[np.ndarray, np.ndarray]:
    """Dominant stem (index into STEM_NAMES) and the four stem shares for each onset time (s)."""
    n_frames = activity.rise.shape[0]
    # Each stem's onset strength relative to its own typical level, so the broadband drums do not
    # drown a clear melody attack.
    p95 = np.percentile(activity.rise, 95, axis=0)
    scale = np.maximum(p95, SHARE_FLOOR * float(p95.max())) + 1e-9
    rel = activity.rise / scale
    shares = np.zeros((len(times), 4))
    for i, t in enumerate(times):
        f = int(round(t * frame_rate))
        a, b = max(1, f - 1), min(n_frames, f + 2)
        if b <= a:
            continue
        peak = rel[a:b].max(axis=0)
        total = float(peak.sum())
        if total > 1e-9:
            shares[i] = peak / total
    return np.argmax(shares, axis=1), shares


def melody_presence(times: np.ndarray, activity: StemActivity, frame_rate: float, shares: np.ndarray) -> np.ndarray:
    """How clearly each onset (s) starts a note of the main melody (0..1): the vocals stem's own
    attack against its typical attack, or a new note of the predominant melody line (a pitch step
    or the line coming in) without one, as in legato singing; `shares` are the onsets' stem shares
    (`tag_onsets`). The shares alone say this poorly: a drum hit leaks into every stem, so every
    onset gets some of each."""
    n_frames = activity.rise.shape[0]
    vocals = STEM_NAMES.index("vocals")
    p95 = np.percentile(activity.rise, 95, axis=0) if n_frames else np.zeros(len(STEM_NAMES))
    scale = max(float(p95[vocals]), SHARE_FLOOR * float(p95.max())) + 1e-9
    attack = activity.rise[:, vocals] / scale
    with np.errstate(divide="ignore", invalid="ignore"):
        midi = 69.0 + 12.0 * np.log2(activity.melody_hz / 440.0)
    out = np.zeros(len(times))
    for i, t in enumerate(times):
        f = int(round(t * frame_rate))
        a, b = max(1, f - 1), min(n_frames, f + 2)
        if b <= a:
            continue
        share = float(shares[i, vocals])
        value = min(1.0, float(attack[a:b].max()) / MELODY_ATTACK_FULL) * min(1.0, share / MELODY_ATTACK_SHARE)
        before = midi[max(0, f - MELODY_STEP_FRAMES) : f]
        after = midi[f + 1 : f + 1 + MELODY_STEP_FRAMES]
        before, after = before[np.isfinite(before)], after[np.isfinite(after)]
        if len(after) >= 2 and (len(before) == 0 or abs(float(np.median(after)) - float(np.median(before))) >= MELODY_STEP_SEMITONES):
            value = max(value, MELODY_STEP_PRESENCE * min(1.0, share / MELODY_STEP_SHARE))
        out[i] = value
    return out


# ---------- full-quality separation (audio stems) ----------


def _stft(x: np.ndarray) -> np.ndarray:
    window = np.hanning(N_FFT).astype(np.float32)
    return np.fft.rfft(frames_view(x.astype(np.float32), N_FFT, HOP) * window, axis=1)


def _istft(spec: np.ndarray, length: int) -> np.ndarray:
    window = np.hanning(N_FFT)
    frames = np.fft.irfft(spec, n=N_FFT, axis=1) * window
    pad = N_FFT // 2
    # overlap-add in hop-sized chunks: each chunk sums its frames in frame order, as adding the
    # frames one by one does, so the result is the same to the bit
    parts = N_FFT // HOP
    n_frames = len(frames)
    chunks = frames.reshape(n_frames, parts, HOP)
    w2 = (window**2).reshape(parts, HOP)
    out = np.zeros((n_frames + parts - 1, HOP))
    norm = np.zeros((n_frames + parts - 1, HOP))
    for r in reversed(range(parts)):
        out[r : r + n_frames] += chunks[:, r]
        norm[r : r + n_frames] += w2[r]
    out = out.reshape(-1)
    out /= np.maximum(norm.reshape(-1), 1e-8)
    return out[pad : pad + length]


def _drum_share(mid: np.ndarray) -> np.ndarray:
    """Median-filter HPSS: the percussive share of each bin's energy."""
    h2 = median_along(mid, HPSS_KERNEL, axis=0).astype(np.float64) ** 2
    p2 = median_along(mid, HPSS_KERNEL, axis=1).astype(np.float64) ** 2
    total = h2 + p2 + 1e-12
    return np.divide(p2, total, out=total).astype(np.float32)


def _centre(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """How centred each bin is in the stereo image (1 when both channels carry it equally)."""
    pl, pr = np.abs(left) ** 2, np.abs(right) ** 2
    return (2.0 * np.abs(left * np.conj(right)) / (pl + pr + 1e-12)).astype(np.float32)


def _block_masks(left: np.ndarray, right: np.ndarray, sr: int) -> dict[str, np.ndarray]:
    """Drums / bass / vocals masks on a block's stereo STFT (whatever is left is "other")."""
    mid = np.abs(left + right) * 0.5
    drums = _drum_share(mid)
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / sr)
    body_m, bass_m, vocal_m, _, _ = harmonic_masks(mid * (1.0 - drums), freqs, sr / HOP, _centre(left, right), low_mag=mid)
    harmonic_share = 1.0 - drums
    return {"drums": drums + harmonic_share * body_m, "bass": harmonic_share * bass_m, "vocals": harmonic_share * vocal_m}


def _separate_block(seg: np.ndarray, sr: int, keep: slice, weight: np.ndarray) -> dict[str, np.ndarray]:
    """Drums / bass / vocals of the stereo `seg` over `keep`, scaled by `weight`."""
    left, right = _stft(seg[:, 0]), _stft(seg[:, 1])
    masks = _block_masks(left, right, sr)
    n = len(seg)
    parts = {}
    for name in STEM_NAMES[:3]:
        m = masks.pop(name)
        parts[name] = np.stack([_istft(left * m, n), _istft(right * m, n)], axis=1)[keep] * weight[:, None]
    return parts


def _in_order(job: Callable[[int], T], count: int, workers: int) -> Iterator[T]:
    """job(0) .. job(count - 1) in order, with up to `workers` of them running or waiting to be
    taken at any time."""
    if workers <= 1:
        yield from map(job, range(count))
        return
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="stems") as pool:
        running: deque[Future[T]] = deque()
        for i in range(count):
            running.append(pool.submit(job, i))
            if len(running) == workers:
                yield running.popleft().result()
        while running:
            yield running.popleft().result()


def separate(pcm: np.ndarray, sr: int, progress: Progress | None = None) -> dict[str, np.ndarray]:
    """Separate stereo PCM (n, 2) into the four stems (float32, same shape; they sum to `pcm`).
    Up to SEPARATE_WORKERS blocks are separated at once (fewer than the CPUs) and added up in
    order, so every sample is summed exactly as when the blocks ran one after another."""
    report = progress or (lambda _p, _m: None)
    if pcm.ndim == 1:
        pcm = np.stack([pcm, pcm], axis=1)
    n = len(pcm)
    block = int(BLOCK_S * sr)
    ctx = int(CONTEXT_S * sr)
    fade = int(CROSSFADE_S * sr)
    starts = list(range(0, max(1, n - fade), block - fade)) if n > block else [0]
    spans: list[tuple[int, int]] = []
    for start in starts:
        spans.append((start, min(n, start + block)))
        if spans[-1][1] >= n:
            break

    def weighted_block(bi: int) -> dict[str, np.ndarray]:
        """Block `bi`'s drums / bass / vocals over its span, faded in and out."""
        start, end = spans[bi]
        a, b = max(0, start - ctx), min(n, end + ctx)
        weight = np.ones(end - start)
        if bi > 0:
            weight[:fade] = np.linspace(0.0, 1.0, fade, endpoint=False)
        if bi < len(spans) - 1 and end < n:
            weight[-fade:] = np.minimum(weight[-fade:], np.linspace(1.0, 0.0, fade, endpoint=False))
        return _separate_block(pcm[a:b], sr, slice(start - a, end - a), weight)

    stems = {name: np.empty((n, 2), dtype=np.float32) for name in STEM_NAMES}
    # float64 sums so far over the start of the next block, where the previous block fades out
    carried = {name: np.zeros((0, 2)) for name in STEM_NAMES[:3]}
    workers = min(SEPARATE_WORKERS, (os.cpu_count() or 1) - 1, len(spans))
    for bi, parts in enumerate(_in_order(weighted_block, len(spans), workers)):
        start, end = spans[bi]
        final = spans[bi + 1][0] if bi + 1 < len(spans) else n  # no later block reaches before this
        mix = np.zeros((final - start, 2))  # drums + bass + vocals
        for name in STEM_NAMES[:3]:
            total = np.zeros((end - start, 2))
            total[: len(carried[name])] = carried[name]
            total += parts.pop(name)
            stems[name][start:final] = total[: final - start]
            carried[name] = total[final - start :].copy()
            mix += total[: final - start]
        stems["other"][start:final] = np.subtract(pcm[start:final], mix, out=mix)
        report((bi + 1) / len(spans), "스템 분리")
    return stems
