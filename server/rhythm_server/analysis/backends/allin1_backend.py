"""All-In-One music structure analysis (allin1): labelled sections, beats and downbeats.

allin1 writes intermediate files (demixed stems, spectrograms); they go to a temporary folder.
"""

from __future__ import annotations

import inspect
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf


def structure(pcm: np.ndarray, sr: int, options: dict[str, Any]) -> dict[str, Any]:
    import allin1

    with tempfile.TemporaryDirectory(prefix="grg-allin1-") as tmp:
        path = Path(tmp) / "audio.wav"
        sf.write(path, np.ascontiguousarray(pcm, dtype=np.float32), sr, subtype="FLOAT")
        wanted = {
            "model": options.get("model", "harmonix-all"),
            "device": options.get("device", "cpu"),
            "demix_dir": str(Path(tmp) / "demix"),
            "spec_dir": str(Path(tmp) / "spec"),
            "keep_byproducts": False,
            "multiprocess": False,
        }
        accepted = inspect.signature(allin1.analyze).parameters
        result = allin1.analyze(str(path), **{k: v for k, v in wanted.items() if k in accepted})
    if isinstance(result, list):
        result = result[0]
    segments = [(float(s.start), float(s.end), str(s.label)) for s in result.segments]
    return {
        "bpm": float(result.bpm) if result.bpm else None,
        "beats": [float(b) for b in result.beats],
        "downbeats": [float(b) for b in result.downbeats],
        "segments": segments,
    }
