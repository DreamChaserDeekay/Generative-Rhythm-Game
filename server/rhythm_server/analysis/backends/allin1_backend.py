"""All-In-One music structure analysis (allin1): labelled sections, beats and downbeats.

allin1 writes intermediate files (demixed stems, spectrograms); they go to a temporary folder.
"""

from __future__ import annotations

import inspect
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

DEMIX_STEMS = ("bass", "drums", "other", "vocals")


def structure(pcm: np.ndarray, sr: int, options: dict[str, Any]) -> dict[str, Any]:
    # allin1 imports its plotting module (matplotlib) though nothing is plotted: no window toolkit
    os.environ.setdefault("MPLBACKEND", "Agg")
    import allin1

    _demix_in_this_process()
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


def _demix_in_this_process() -> None:
    """allin1 separates the song by starting `sys.executable -m demucs.separate`. In the desktop app
    sys.executable is the bundled server, which would start again instead of Demucs: the same
    separation (same model, arguments and files) runs in this process, which also saves loading
    PyTorch a second time."""
    module = sys.modules.get("allin1.analyze")
    if module is not None and callable(getattr(module, "demix", None)) and module.demix is not demix_here:
        module.demix = demix_here


def demix_here(paths: list[Path], demix_dir: Path, device: Any) -> list[Path]:
    """allin1.demix.demix, with Demucs called in this process: <demix_dir>/htdemucs/<name>/<stem>.wav."""
    from demucs.separate import main as separate

    demix_dir = Path(demix_dir)
    out: list[Path] = []
    todo: list[Path] = []
    for path in paths:
        stems = demix_dir / "htdemucs" / Path(path).stem
        out.append(stems)
        if not all((stems / f"{name}.wav").is_file() for name in DEMIX_STEMS):
            todo.append(Path(path))
    if todo:
        args = ["--out", demix_dir.as_posix(), "--name", "htdemucs", "--device", str(device), *[p.as_posix() for p in todo]]
        try:
            separate(args)
        except SystemExit as e:  # Demucs reports a failure by exiting
            if e.code:
                raise RuntimeError(f"Demucs separation failed (exit {e.code})") from None
    return out
