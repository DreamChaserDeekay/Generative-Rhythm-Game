"""BS-RoFormer SW stem separation (bass, drums, other, vocals, guitar, piano; docs/PATTERN_DESIGN.md 97).

The model (bs_roformer.py, MIT) runs the BS-RoFormer SW checkpoint, downloaded on first use from
`options["url"]` into the model cache (GRG_MODEL_DIR, else PyTorch's hub checkpoints folder) and
checked against `options["sha256"]`. The weights are loaded with `weights_only=True` (tensors only,
no pickled code). Their licence is non-commercial (config/analysis.json `licenses`). The output is
the Demucs backend's: four stems that add up to the input, plus guitar and piano on their own.

Options: `model` (BSRoformer arguments), `instruments` (the checkpoint's stem order), `chunk` and
`overlap` (samples per pass at 44.1 kHz, passes over each sample), `device` ("auto": CUDA when
there is one, in float16 there), `bf16` (bfloat16 on the CPU: 1.4x as fast where the CPU has
bfloat16 instructions, the same stems to 54 dB).
"""

from __future__ import annotations

import hashlib
import os
import tempfile
import threading
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
from scipy.signal import resample_poly

from .demucs_backend import _normalise

MODEL_SR = 44100
_lock = threading.Lock()
_cache: dict[str, Any] = {}


def model_dir() -> Path:
    env = os.environ.get("GRG_MODEL_DIR")
    if env:
        return Path(env)
    import torch

    return Path(torch.hub.get_dir()) / "checkpoints"


def weights(options: dict[str, Any]) -> Path:
    """The checkpoint on disk, downloaded and checked the first time."""
    path = model_dir() / str(options["file"])
    want = str(options["sha256"]).lower()
    if path.is_file():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".part")
    digest = hashlib.sha256()
    try:
        with os.fdopen(fd, "wb") as out, urllib.request.urlopen(str(options["url"]), timeout=60) as resp:
            while True:
                block = resp.read(1 << 20)
                if not block:
                    break
                digest.update(block)
                out.write(block)
        if digest.hexdigest() != want:
            raise ValueError(f"{path.name}: sha256 {digest.hexdigest()} is not {want}")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return path


def _device(options: dict[str, Any]) -> str:
    import torch

    device = str(options.get("device", "auto"))
    if device == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return device


def load(options: dict[str, Any]) -> Any:
    """The model on its device, made once per process."""
    import torch

    from .bs_roformer import BSRoformer

    device = _device(options)
    key = f"{options['file']}@{device}"
    with _lock:
        model = _cache.get(key)
        if model is None:
            kwargs = dict(options["model"])
            kwargs["freqs_per_bands"] = tuple(kwargs["freqs_per_bands"])
            model = BSRoformer(**kwargs)
            state = torch.load(weights(options), map_location="cpu", weights_only=True)
            model.load_state_dict(state.get("state_dict", state) if isinstance(state, dict) else state)
            model.eval().to(device)
            _cache[key] = model
    return model


def separate(pcm: np.ndarray, sr: int, options: dict[str, Any]) -> dict[str, np.ndarray]:
    import torch

    from .bs_roformer import demix

    model = load(options)
    device = _device(options)
    stereo = pcm if pcm.ndim == 2 else np.stack([pcm, pcm], axis=1)
    mix = stereo.astype(np.float32)
    if sr != MODEL_SR:
        mix = resample_poly(mix, MODEL_SR, sr, axis=0).astype(np.float32)
    x = torch.from_numpy(np.ascontiguousarray(mix.T)).to(device)
    # half precision on a GPU (as the checkpoint's training did), bfloat16 on a CPU only when asked
    half = device.startswith("cuda") or (device == "cpu" and bool(options.get("bf16", False)))
    kind = "cuda" if device.startswith("cuda") else "cpu"
    with torch.autocast(kind, dtype=torch.float16 if kind == "cuda" else torch.bfloat16, enabled=half):
        est = demix(model, x, int(options["chunk"]), int(options["overlap"]))
    names = list(options["instruments"])
    raw = {name: est[i].float().cpu().numpy().T for i, name in enumerate(names)}
    return _normalise(raw, stereo, MODEL_SR, sr)
