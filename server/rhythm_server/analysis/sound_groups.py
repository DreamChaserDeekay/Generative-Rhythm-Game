"""Same-sound groups: the onsets of one sound rise alike in the harmonic spectrum.

A keysound chart plays the same sample again and again, and in the mixed audio its onsets agree on
how the harmonic spectrum rises at the attack (GROUP_LAG frames after the onset against as many
before) far more surely than on a pitch estimate, which in a mix often follows a chord or a held
sound instead of the onset's own sound (docs/PATTERN_DESIGN.md 46). The onsets of a song are grouped
by average linkage on the cosine distance of their square-rooted rise spectra, cut at GROUP_COSINE
(checked against the keysound names of BMS charts, docs/PATTERN_DESIGN.md 58).
"""

from __future__ import annotations

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage

GROUP_LAG = 2
GROUP_COSINE = 0.7
# Linkage needs memory quadratic in the onsets (4000 onsets: two 64 MB distance lists; 99% of BMS
# songs have fewer than 3000): a longer song groups an even spread of this many onsets and gives
# every other onset the group of its most alike grouped onset (a group of its own when none reaches
# GROUP_COSINE).
MAX_LINKED = 4000
LINK_BLOCK = 256
ASSIGN_CHUNK = 1024


def rise_spectra(harmonic: np.ndarray, frame_rate: float, times: np.ndarray) -> np.ndarray:
    """Unit-length square-rooted rise of the harmonic spectrum at every onset (zeros where nothing rises)."""
    n = harmonic.shape[0]
    frames = np.round(np.asarray(times, dtype=np.float64) * frame_rate).astype(int)
    after = harmonic[np.clip(frames + GROUP_LAG, 0, n - 1)].astype(np.float64)
    before = harmonic[np.clip(frames - GROUP_LAG, 0, n - 1)].astype(np.float64)
    x = np.sqrt(np.maximum(after - before, 0.0))
    norm = np.linalg.norm(x, axis=1, keepdims=True)
    return np.where(norm > 0.0, x / np.maximum(norm, 1e-12), 0.0)


def _link(x: np.ndarray) -> np.ndarray:
    n = len(x)
    if n < 2:
        return np.zeros(n, dtype=int)
    silent = ~np.any(x > 0.0, axis=1)
    # condensed cosine distances, a block of rows at a time (onsets where nothing rises are alike to none)
    dist = np.empty(n * (n - 1) // 2)
    start = 0
    for first in range(0, n - 1, LINK_BLOCK):
        sims = x[first : first + LINK_BLOCK] @ x.T
        for row, i in enumerate(range(first, min(first + LINK_BLOCK, n - 1))):
            d = np.clip(1.0 - sims[row, i + 1 :], 0.0, 1.0)
            d[silent[i + 1 :] | silent[i]] = 1.0
            dist[start : start + len(d)] = d
            start += len(d)
    return fcluster(linkage(dist, "average"), 1.0 - GROUP_COSINE, "distance") - 1


def sound_groups(harmonic: np.ndarray, frame_rate: float, times: np.ndarray) -> np.ndarray:
    """Group of every onset (0, 1, ...): the onsets of a group sound alike at their attack."""
    x = rise_spectra(harmonic, frame_rate, times)
    if len(x) <= MAX_LINKED:
        return _link(x)
    linked = np.unique(np.linspace(0, len(x) - 1, MAX_LINKED).round().astype(int))
    groups = np.full(len(x), -1)
    groups[linked] = _link(x[linked])
    rest = np.setdiff1d(np.arange(len(x)), linked)
    fresh = int(groups.max()) + 1
    for start in range(0, len(rest), ASSIGN_CHUNK):
        idx = rest[start : start + ASSIGN_CHUNK]
        sims = x[idx] @ x[linked].T
        best = np.argmax(sims, axis=1)
        for row, (i, b) in enumerate(zip(idx, best)):
            if sims[row, b] >= GROUP_COSINE:
                groups[i] = groups[linked[b]]
            else:
                groups[i] = fresh
                fresh += 1
    return groups
