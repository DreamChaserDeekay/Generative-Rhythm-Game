"""Where a song is silent, from its audio alone (no song analysis): Mapperatorinator is not asked
for the silence after the music, and notes it puts in a silence are dropped.

The model maps window by window with the notes before as context; past the music's end (a file's
silent tail, and the zero padding its last window gets) it can carry a pattern on with nothing to
hear. Its own `end_time` stops the windows there; what still lands in a silence is dropped when
the .osu becomes a chart (charts.drop_silent)."""

from __future__ import annotations

from typing import Any

import numpy as np


def quiet_spans(pcm: np.ndarray, sample_rate: int, cfg: dict[str, Any]) -> list[tuple[float, float]]:
    """(start ms, end ms) of every stretch of `minMs` or more whose level stays under the song's
    loud level (the 95th percentile of its frames) by `belowLoudDb`, or under `floorDb` dBFS."""
    mono = pcm.mean(axis=1) if pcm.ndim == 2 else pcm
    size = max(1, int(sample_rate * float(cfg["frameMs"]) / 1000.0))
    n = len(mono) // size
    if n == 0:
        return []
    frames = mono[: n * size].astype(np.float64).reshape(n, size)
    level = 10.0 * np.log10(np.mean(frames**2, axis=1) + 1e-12)
    threshold = max(float(cfg["floorDb"]), float(np.percentile(level, 95)) - float(cfg["belowLoudDb"]))
    quiet = level < threshold
    frame_ms = 1000.0 * size / sample_rate
    spans: list[tuple[float, float]] = []
    start = None
    for i in range(n + 1):
        if i < n and quiet[i]:
            start = i if start is None else start
        elif start is not None:
            end_ms = len(mono) * 1000.0 / sample_rate if i == n else i * frame_ms
            if end_ms - start * frame_ms >= float(cfg["minMs"]):
                spans.append((round(start * frame_ms, 3), round(end_ms, 3)))
            start = None
    return spans


def music_end(spans: list[tuple[float, float]], duration_ms: float) -> float | None:
    """Where the music ends when the song ends in a silence (None: it plays to the end)."""
    if spans and spans[-1][1] >= duration_ms - 1.0:
        return spans[-1][0]
    return None
