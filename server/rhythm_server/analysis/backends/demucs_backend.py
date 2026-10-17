"""Demucs stem separation (drums / bass / vocals / other).

Uses `demucs.api.Separator` when available (Demucs 4.1+) and the `get_model` + `apply_model`
pair otherwise (4.0.x). Extra stems of 6-stem models (guitar, piano) are folded into "other",
and "other" also takes the small residual so the stems always add up to the input.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy.signal import resample_poly

STEMS = ("drums", "bass", "vocals", "other")


def separate(pcm: np.ndarray, sr: int, options: dict[str, Any]) -> dict[str, np.ndarray]:
    import torch

    model_name = str(options.get("model", "htdemucs"))
    device = str(options.get("device", "cpu"))
    shifts = int(options.get("shifts", 1))
    overlap = float(options.get("overlap", 0.25))
    stereo = pcm if pcm.ndim == 2 else np.stack([pcm, pcm], axis=1)
    wav = torch.from_numpy(np.ascontiguousarray(stereo.T, dtype=np.float32))
    try:
        from demucs.api import Separator
    except ImportError:
        Separator = None
    with torch.no_grad():
        if Separator is not None:
            separator = Separator(model=model_name, device=device, shifts=shifts, overlap=overlap, progress=False)
            _, parts = separator.separate_tensor(wav, sr)
            model_sr = int(separator.samplerate)
            raw = {str(k): v.detach().cpu().numpy().T for k, v in parts.items()}
        else:
            from demucs.apply import apply_model
            from demucs.pretrained import get_model

            model = get_model(model_name)
            model.eval()
            ref = wav.mean(0)
            mean, std = ref.mean(), ref.std() + 1e-8
            sources = apply_model(model, ((wav - mean) / std)[None], device=device, shifts=shifts, split=True, overlap=overlap, progress=False)[0]
            sources = sources * std + mean
            model_sr = int(model.samplerate)
            raw = {name: sources[i].cpu().numpy().T for i, name in enumerate(model.sources)}
    return _normalise(raw, stereo, model_sr, sr)


def _normalise(raw: dict[str, np.ndarray], mix: np.ndarray, model_sr: int, sr: int) -> dict[str, np.ndarray]:
    n = len(mix)
    out = {name: np.zeros((n, 2), dtype=np.float64) for name in STEMS}
    for name, y in raw.items():
        y = np.asarray(y, dtype=np.float64)
        if y.ndim == 1:
            y = np.stack([y, y], axis=1)
        if model_sr != sr:
            y = resample_poly(y, sr, model_sr, axis=0)
        y = y[:n]
        if len(y) < n:
            y = np.pad(y, ((0, n - len(y)), (0, 0)))
        out[name if name in out else "other"] += y[:, :2]
    out["other"] += mix.astype(np.float64) - sum(out.values())
    return {name: y.astype(np.float32) for name, y in out.items()}
