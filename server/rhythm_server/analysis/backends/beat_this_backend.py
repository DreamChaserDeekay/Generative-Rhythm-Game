"""beat_this beat and downbeat tracking (CPJKU, MIT code and weights)."""

from __future__ import annotations

from typing import Any

import numpy as np


def track(pcm: np.ndarray, sr: int, options: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    """Beat and downbeat times in seconds."""
    from beat_this.inference import Audio2Beats

    tracker = Audio2Beats(checkpoint_path=str(options.get("checkpoint", "final0")), device=str(options.get("device", "cpu")), dbn=False)
    mono = pcm.mean(axis=1) if pcm.ndim == 2 else pcm
    beats, downbeats = tracker(np.ascontiguousarray(mono, dtype=np.float32), sr)
    return _as_seconds(beats), _as_seconds(downbeats)


def _as_seconds(x: Any) -> np.ndarray:
    if hasattr(x, "detach"):
        x = x.detach().cpu().numpy()
    return np.sort(np.asarray(x, dtype=np.float64).ravel())
