"""basic-pitch polyphonic note transcription (Spotify, Apache-2.0)."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf


def notes(pcm: np.ndarray, sr: int, options: dict[str, Any]) -> list[tuple[float, float, float, float]]:
    """(start s, end s, MIDI pitch, amplitude) of every transcribed note."""
    from basic_pitch.inference import predict

    mono = pcm.mean(axis=1) if pcm.ndim == 2 else pcm
    with tempfile.TemporaryDirectory(prefix="grg-bp-") as tmp:
        path = Path(tmp) / "audio.wav"
        sf.write(path, np.ascontiguousarray(mono, dtype=np.float32), sr, subtype="FLOAT")
        _, _, events = predict(str(path), minimum_note_length=float(options.get("minNoteMs", 120)))
    out = []
    for event in events:
        start, end, pitch, amplitude = (float(v) for v in event[:4])
        if end > start:
            out.append((start, end, pitch, amplitude))
    out.sort()
    return out
