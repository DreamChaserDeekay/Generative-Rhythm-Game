"""Song structure: section boundaries (self-similarity novelty), energy and repetition groups."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import uniform_filter1d

KERNEL_BEATS = 32
MIN_SECTION_BARS = 4
GROUP_SIMILARITY = 0.8
BOUNDARY_STD = 0.5


@dataclass
class Section:
    start_beat: int  # index into beats
    end_beat: int  # exclusive
    energy: float  # 0..1
    group: str
    label: str


def beat_sync(features: np.ndarray, frame_rate: float, beats: np.ndarray) -> np.ndarray:
    """Average frame features between consecutive beats -> (n_beats, d)."""
    n = len(beats)
    out = np.zeros((n, features.shape[1]), dtype=np.float64)
    frames = np.clip(np.round(beats * frame_rate).astype(int), 0, len(features) - 1)
    for i in range(n):
        a = frames[i]
        b = frames[i + 1] if i + 1 < n else min(len(features), a + max(1, int(np.median(np.diff(frames))) if n > 1 else 1))
        out[i] = features[a:max(b, a + 1)].mean(axis=0)
    return out


def novelty_curve(feat: np.ndarray, kernel_beats: int = KERNEL_BEATS) -> np.ndarray:
    """Foote checkerboard novelty along the diagonal of the cosine self-similarity matrix."""
    n = len(feat)
    if n < 4:
        return np.zeros(n)
    z = feat - feat.mean(axis=0)
    z /= np.linalg.norm(z, axis=1, keepdims=True) + 1e-9
    ssm = z @ z.T
    half = max(2, min(kernel_beats // 2, n // 4))
    ax = np.arange(-half, half) + 0.5
    gauss = np.exp(-0.5 * (ax / (half * 0.5)) ** 2)
    kernel = np.outer(gauss, gauss) * np.sign(np.outer(ax, ax))
    nov = np.zeros(n)
    padded = np.pad(ssm, half, mode="edge")
    for i in range(n):
        block = padded[i : i + 2 * half, i : i + 2 * half]
        nov[i] = float(np.sum(block * kernel))
    nov = np.maximum(nov, 0)
    return nov / (np.max(nov) + 1e-9)


def find_sections(
    feat: np.ndarray,
    beat_energy: np.ndarray,
    first_downbeat: int,
    beats_per_bar: int,
) -> list[Section]:
    n = len(feat)
    if n == 0:
        return []
    nov = novelty_curve(feat)
    bar = beats_per_bar
    min_len = MIN_SECTION_BARS * bar
    # candidate boundaries on bar lines, strongest novelty first
    bar_starts = [i for i in range(first_downbeat % bar, n, bar)]
    smooth = uniform_filter1d(nov, size=3)
    threshold = float(np.mean(smooth) + BOUNDARY_STD * np.std(smooth))
    cands = sorted((i for i in bar_starts if smooth[i] >= threshold), key=lambda i: -smooth[i])
    bounds = [0, n]
    for i in cands:
        if all(abs(i - b) >= min_len for b in bounds):
            bounds.append(i)
    bounds.sort()

    raw = []
    for a, b in zip(bounds, bounds[1:]):
        # median: the silent tail after the last note must not drag the closing section down
        raw.append((a, b, float(np.median(beat_energy[a:b])), feat[a:b].mean(axis=0)))
    energies = np.array([r[2] for r in raw])
    e_min, e_max = float(np.min(energies)), float(np.max(energies))
    norm_e = (energies - e_min) / (e_max - e_min) if e_max - e_min > 1e-9 else np.full(len(raw), 0.5)

    # repetition groups by mean feature similarity
    vecs = np.array([r[3] for r in raw])
    vecs = vecs - vecs.mean(axis=0)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9
    groups: list[int] = []
    reps: list[int] = []
    for i, v in enumerate(vecs):
        match = next((g for g, r in enumerate(reps) if float(v @ vecs[r]) >= GROUP_SIMILARITY), None)
        if match is None:
            reps.append(i)
            match = len(reps) - 1
        groups.append(match)

    group_energy = {g: float(np.mean([norm_e[i] for i in range(len(raw)) if groups[i] == g])) for g in set(groups)}
    chorus = max(group_energy, key=lambda g: group_energy[g]) if len(group_energy) > 1 else None
    sections = []
    for i, (a, b, _, _) in enumerate(raw):
        g = groups[i]
        if i == 0 and norm_e[i] < 0.4 and len(raw) > 2:
            label = "intro"
        elif i == len(raw) - 1 and norm_e[i] < 0.4 and len(raw) > 2:
            label = "outro"
        elif g == chorus:
            label = "chorus"
        elif groups.count(g) >= 2:
            label = "verse"
        else:
            label = "bridge"
        sections.append(Section(start_beat=a, end_beat=b, energy=float(norm_e[i]), group=chr(ord("A") + g % 26), label=label))
    return sections
