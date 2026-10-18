"""STFT, mel spectrograms and harmonic/percussive separation with numpy/scipy only."""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from scipy.ndimage import median_filter

BLOCK_FRAMES = 2048


def frames_view(x: np.ndarray, n_fft: int, hop: int) -> np.ndarray:
    """Centered frames (frame i is centered on sample i*hop), as a strided view."""
    pad = n_fft // 2
    padded = np.pad(x, (pad, pad + n_fft))
    n_frames = 1 + len(x) // hop
    return sliding_window_view(padded, n_fft)[::hop][:n_frames]


def stft_magnitude(x: np.ndarray, n_fft: int, hop: int) -> np.ndarray:
    """|STFT| with a Hann window, shape (frames, n_fft//2 + 1), float32."""
    frames = frames_view(x, n_fft, hop)
    window = np.hanning(n_fft).astype(np.float32)
    out = np.empty((frames.shape[0], n_fft // 2 + 1), dtype=np.float32)
    for start in range(0, frames.shape[0], BLOCK_FRAMES):
        block = frames[start : start + BLOCK_FRAMES] * window
        out[start : start + len(block)] = np.abs(np.fft.rfft(block, axis=1))
    return out


def hz_to_mel(f: np.ndarray | float) -> np.ndarray:
    return 2595.0 * np.log10(1.0 + np.asarray(f, dtype=np.float64) / 700.0)


def mel_to_hz(m: np.ndarray | float) -> np.ndarray:
    return 700.0 * (10 ** (np.asarray(m, dtype=np.float64) / 2595.0) - 1.0)


def mel_filterbank(sr: int, n_fft: int, n_mels: int, fmin: float, fmax: float) -> tuple[np.ndarray, np.ndarray]:
    """Triangular mel filters (n_mels, bins) and their center frequencies."""
    bins = np.fft.rfftfreq(n_fft, 1.0 / sr)
    edges = mel_to_hz(np.linspace(hz_to_mel(fmin), hz_to_mel(fmax), n_mels + 2))
    fb = np.zeros((n_mels, len(bins)), dtype=np.float32)
    for m in range(n_mels):
        lo, center, hi = edges[m], edges[m + 1], edges[m + 2]
        rise = (bins - lo) / max(center - lo, 1e-9)
        fall = (hi - bins) / max(hi - center, 1e-9)
        fb[m] = np.maximum(0.0, np.minimum(rise, fall))
        area = fb[m].sum()
        if area > 0:
            fb[m] /= area
    return fb, edges[1:-1]


def mel_power(x: np.ndarray, sr: int, n_fft: int, hop: int, n_mels: int, fmin: float, fmax: float) -> tuple[np.ndarray, np.ndarray]:
    """Mel power spectrogram (frames, n_mels) computed block-wise to bound memory."""
    fb, centers = mel_filterbank(sr, n_fft, n_mels, fmin, fmax)
    frames = frames_view(x, n_fft, hop)
    window = np.hanning(n_fft).astype(np.float32)
    out = np.empty((frames.shape[0], n_mels), dtype=np.float32)
    for start in range(0, frames.shape[0], BLOCK_FRAMES):
        block = frames[start : start + BLOCK_FRAMES] * window
        power = np.abs(np.fft.rfft(block, axis=1)) ** 2
        out[start : start + len(block)] = power @ fb.T
    return out, centers


def median_along(x: np.ndarray, size: int, axis: int) -> np.ndarray:
    """`median_filter` of a 2-D array along one axis (`size` values, edges reflected): the same
    values, several times faster. Every row is padded with its own reflected edges (mirrored again
    and again when the row is shorter than the window, as "reflect" does) and all rows go through
    one 1-D filter, which scipy (1.15+) runs with its fast 1-D rank filter; no window that is kept
    reaches into the next row. Rows of two values are the exception: scipy's own 2-D filter reads
    past them, and its result changes from call to call."""
    rows = x if axis == 1 else x.T
    if rows.shape[1] == 0:  # np.pad cannot reflect an empty row
        return x.copy()
    half = size // 2
    padded = np.pad(rows, ((0, 0), (half, half)), mode="symmetric")  # scipy's "reflect"
    filtered = median_filter(padded.reshape(-1), size=size, mode="reflect").reshape(padded.shape)
    filtered = filtered[:, half : half + rows.shape[1]]
    return np.ascontiguousarray(filtered if axis == 1 else filtered.T)


def hpss(magnitude: np.ndarray, kernel: int = 17) -> tuple[np.ndarray, np.ndarray]:
    """Median-filter harmonic/percussive separation (Fitzgerald 2010), soft masks."""
    harmonic = median_along(magnitude, kernel, axis=0)
    percussive = median_along(magnitude, kernel, axis=1)
    h2, p2 = harmonic.astype(np.float32) ** 2, percussive.astype(np.float32) ** 2
    total = h2 + p2 + 1e-12
    return magnitude * (h2 / total), magnitude * (p2 / total)


def chroma_matrix(sr: int, n_fft: int, fmin: float = 55.0, fmax: float = 5000.0) -> np.ndarray:
    """Maps STFT bins to 12 pitch classes (12, bins)."""
    bins = np.fft.rfftfreq(n_fft, 1.0 / sr)
    m = np.zeros((12, len(bins)), dtype=np.float32)
    valid = (bins >= fmin) & (bins <= fmax)
    midi = 69 + 12 * np.log2(np.where(valid, bins, 1.0) / 440.0)
    pc = np.mod(np.round(midi), 12).astype(int)
    m[pc[valid], np.nonzero(valid)[0]] = 1.0
    return m
