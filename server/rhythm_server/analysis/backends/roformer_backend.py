"""BS-RoFormer SW stem separation (bass, drums, other, vocals, guitar, piano; docs/PATTERN_DESIGN.md 97).

The model (bs_roformer.py, MIT) runs the BS-RoFormer SW checkpoint, downloaded on first use from
`options["url"]` into the model cache (GRG_MODEL_DIR, else PyTorch's hub checkpoints folder) and
checked against `options["sha256"]`. The weights are loaded with `weights_only=True` (tensors only,
no pickled code). Their licence is non-commercial (config/analysis.json `licenses`). The output is
the Demucs backend's: four stems that add up to the input, plus guitar and piano on their own.

Options: `model` (BSRoformer arguments), `instruments` (the checkpoint's stem order), `chunk` and
`overlap` (samples per pass at 44.1 kHz, passes over each sample), `device` ("auto": PyTorch's CUDA
in float16 when there is one, else the ONNX export in ONNX Runtime's DirectML on a DirectX 12 GPU,
else the CPU), `dmlChunk` (the samples per pass there: the attention of a pass is held whole on the
GPU), `bf16` (bfloat16 on the CPU: 1.4x as fast where the CPU has bfloat16 instructions, the same
stems to 54 dB).
"""

from __future__ import annotations

import functools
import hashlib
import importlib.util
import logging
import os
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
from scipy.signal import resample_poly

from .demucs_backend import _normalise

MODEL_SR = 44100
ONNX_TAG = "masks-v1"  # the exported network's form; a new tag exports it again
log = logging.getLogger(__name__)
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


def usable(options: dict[str, Any]) -> bool:
    """Whether to separate with this model here (analysis.backends.detect): with `device` "auto"
    only on a GPU, unless `cpu` is set. On a CPU it takes about 5 s per second of music (a 4-minute
    song in some 20 minutes on 4 cores), where Demucs (the fallback) takes a tenth of that."""
    if str(options.get("device", "auto")) != "auto" or options.get("cpu", False):
        return True
    return _accelerator(options) is not None


def _device(options: dict[str, Any]) -> str:
    """Where the model runs: "cuda" (PyTorch on an NVIDIA GPU), "dml" (the ONNX model in ONNX
    Runtime's DirectML on a DirectX 12 GPU: the desktop editions carry the CPU build of PyTorch),
    or "cpu". `device` "auto" takes the first that is there."""
    device = str(options.get("device", "auto"))
    if device != "auto":
        return device
    return _accelerator(options) or "cpu"


def _accelerator(options: dict[str, Any]) -> str | None:
    if _cuda():
        return "cuda"
    if options.get("directml", True) and _has_dml() and gpu(int(options.get("minGpuMB", 2048))) is not None:
        return "dml"
    return None


@functools.lru_cache(maxsize=None)
def _cuda() -> bool:
    """Whether PyTorch can use an NVIDIA GPU. A CPU build (the desktop editions) has no CUDA
    library beside its own, which is seen without importing PyTorch (seconds on Windows; `detect`
    runs for the song list)."""
    if "torch" not in sys.modules:
        spec = importlib.util.find_spec("torch")
        if spec is None:
            return False
        libs = [Path(loc) / "lib" for loc in (spec.submodule_search_locations or [])]
        if libs and all(lib.is_dir() and not any(lib.glob("*torch_cuda*")) for lib in libs):
            return False
    try:
        import torch
    except ImportError:
        return False
    return bool(torch.cuda.is_available())


@functools.lru_cache(maxsize=None)
def _has_dml() -> bool:
    try:
        import onnxruntime as ort
    except ImportError:
        return False
    return "DmlExecutionProvider" in ort.get_available_providers()


@functools.lru_cache(maxsize=None)
def gpu(min_mb: int = 2048) -> tuple[int, str, int] | None:
    """The DirectX adapter with the most memory of its own, as (index, name, MB), when it is a
    hardware one with at least `min_mb` (DXGI, Windows only). ONNX Runtime's DirectML lists itself
    on any Windows machine and would otherwise run on the CPU's software adapter or a small
    integrated GPU; its `device_id` is this index."""
    if sys.platform != "win32":
        return None
    try:
        adapters = _dxgi_adapters()
    except Exception as e:
        log.info("DirectX adapters could not be listed: %s", e)
        return None
    log.info("DirectX adapters (index, name, MB, software): %s", adapters)
    best = max((a for a in adapters if not a[3] and a[2] >= min_mb), key=lambda a: a[2], default=None)
    return None if best is None else best[:3]


def _dxgi_adapters() -> list[tuple[int, str, int, bool]]:
    """(index, name, dedicated video MB, software) of each adapter, in DXGI's order."""
    import ctypes

    class GUID(ctypes.Structure):
        _fields_ = [("Data1", ctypes.c_uint32), ("Data2", ctypes.c_uint16), ("Data3", ctypes.c_uint16), ("Data4", ctypes.c_ubyte * 8)]

    class DESC1(ctypes.Structure):
        _fields_ = [
            ("Description", ctypes.c_wchar * 128), ("VendorId", ctypes.c_uint), ("DeviceId", ctypes.c_uint),
            ("SubSysId", ctypes.c_uint), ("Revision", ctypes.c_uint), ("DedicatedVideoMemory", ctypes.c_size_t),
            ("DedicatedSystemMemory", ctypes.c_size_t), ("SharedSystemMemory", ctypes.c_size_t),
            ("LuidLow", ctypes.c_uint32), ("LuidHigh", ctypes.c_int32), ("Flags", ctypes.c_uint32),
        ]

    def method(obj: ctypes.c_void_p, index: int, argtypes: tuple[Any, ...] = (), *args: Any) -> int:
        """Calls a COM method by its place in the object's table (the first pointer in it)."""
        vtable = ctypes.cast(obj, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        proto = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, *argtypes)
        return int(proto(vtable[index])(obj, *args))

    iid = GUID(0x770AAE78, 0xF26F, 0x4DBA, (ctypes.c_ubyte * 8)(0xA8, 0x29, 0x25, 0x3C, 0x83, 0xD1, 0xB3, 0x87))  # IDXGIFactory1
    factory = ctypes.c_void_p()
    if ctypes.windll.dxgi.CreateDXGIFactory1(ctypes.byref(iid), ctypes.byref(factory)) != 0 or not factory:
        return []
    out = []
    try:
        for i in range(16):
            adapter = ctypes.c_void_p()
            if method(factory, 12, (ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p)), i, ctypes.byref(adapter)) != 0 or not adapter:  # EnumAdapters1
                break
            try:
                desc = DESC1()
                if method(adapter, 10, (ctypes.POINTER(DESC1),), ctypes.byref(desc)) == 0:  # GetDesc1
                    out.append((i, desc.Description, int(desc.DedicatedVideoMemory) >> 20, bool(desc.Flags & 2)))  # DXGI_ADAPTER_FLAG_SOFTWARE
            finally:
                method(adapter, 2)  # Release
    finally:
        method(factory, 2)
    return out


def _kwargs(options: dict[str, Any]) -> dict[str, Any]:
    kwargs = dict(options["model"])
    kwargs["freqs_per_bands"] = tuple(kwargs["freqs_per_bands"])
    return kwargs


def load(options: dict[str, Any], device: str = "cpu") -> Any:
    """The PyTorch model on a device, made once per process."""
    import torch

    from .bs_roformer import BSRoformer

    key = f"{options['file']}@{device}"
    with _lock:
        model = _cache.get(key)
        if model is None:
            model = BSRoformer(**_kwargs(options))
            state = torch.load(weights(options), map_location="cpu", weights_only=True)
            model.load_state_dict(state.get("state_dict", state) if isinstance(state, dict) else state)
            model.eval().to(device)
            _cache[key] = model
    return model


def _shell(options: dict[str, Any]) -> Any:
    """The model's STFT and inverse STFT without its weights (on PyTorch's meta device, which keeps
    no tensors), around the ONNX network."""
    import torch

    from .bs_roformer import BSRoformer

    key = f"{options['file']}@shell"
    with _lock:
        model = _cache.get(key)
        if model is None:
            with torch.device("meta"):
                model = BSRoformer(**_kwargs(options))
            _cache[key] = model
    return model


def onnx_model(options: dict[str, Any]) -> Path:
    """The network as ONNX (its STFT stays outside; the frames axis is free), exported from the
    checkpoint on first use next to it (about 10 s and as large as the checkpoint)."""
    import torch

    ckpt = weights(options)
    path = ckpt.with_name(f"{ckpt.stem}.{ONNX_TAG}.onnx")
    if path.is_file():
        return path
    model = load(options, "cpu")
    for mod in model.modules():
        if hasattr(mod, "cache_if_possible"):
            mod.cache_if_possible = False  # the rotary embedding's cache is a Python branch: off, so the export keeps the frames axis free

    class Masks(torch.nn.Module):
        def __init__(self, m: Any):
            super().__init__()
            self.m = m

        def forward(self, x: Any) -> Any:
            return self.m.masks(x)

    width = 2 * model.audio_channels * (int(options["model"]["stft_n_fft"]) // 2 + 1)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".part")
    os.close(fd)
    try:
        with torch.no_grad():
            torch.onnx.export(
                Masks(model).eval(), (torch.zeros(1, 64, width),), tmp, input_names=["x"], output_names=["mask"],
                opset_version=17, dynamic_axes={"x": {1: "frames"}, "mask": {2: "frames"}}, **_exporter_kwargs(),
            )
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
        with _lock:
            _cache.pop(f"{options['file']}@cpu", None)  # the weights now live in the ONNX file
    return path


def _exporter_kwargs() -> dict[str, Any]:
    import inspect

    import torch

    # PyTorch 2.5+ takes `dynamo` (False: the TorchScript exporter, which keeps the dynamic axes);
    # 2.1 (the structure edition) has only that exporter
    return {"dynamo": False} if "dynamo" in inspect.signature(torch.onnx.export).parameters else {}


def session(options: dict[str, Any]) -> Any:
    """The ONNX model in ONNX Runtime, on the GPU through DirectML (the CPU where it is missing),
    made once per process."""
    import onnxruntime as ort

    path = onnx_model(options)
    dml = _has_dml() and bool(options.get("directml", True))
    key = f"{path}@{'dml' if dml else 'cpu'}"
    with _lock:
        sess = _cache.get(key)
        if sess is None:
            so = ort.SessionOptions()
            so.enable_mem_pattern = False  # what the DirectML provider asks for
            so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            providers: list[Any] = ["CPUExecutionProvider"]
            if dml:
                found = gpu(int(options.get("minGpuMB", 2048)))
                providers.insert(0, ("DmlExecutionProvider", {"device_id": found[0] if found else 0}))
                log.info("BS-RoFormer on DirectML: %s", found)
            sess = ort.InferenceSession(str(path), so, providers=providers)
            _cache[key] = sess
    return sess


def separate(pcm: np.ndarray, sr: int, options: dict[str, Any]) -> dict[str, np.ndarray]:
    import torch

    from .bs_roformer import demix

    device = _device(options)
    stereo = pcm if pcm.ndim == 2 else np.stack([pcm, pcm], axis=1)
    mix = stereo.astype(np.float32)
    if sr != MODEL_SR:
        mix = resample_poly(mix, MODEL_SR, sr, axis=0).astype(np.float32)
    names = list(options["instruments"])
    if device == "dml":
        sess = session(options)
        shell = _shell(options)

        def run(parts: Any) -> Any:
            spec, x = shell.spectrum(parts)
            mask = torch.from_numpy(sess.run(None, {"x": x.numpy()})[0])
            return shell.stems(spec, mask, parts.shape[-1])

        est = demix(run, len(names), torch.from_numpy(np.ascontiguousarray(mix.T)), int(options.get("dmlChunk", options["chunk"])), int(options["overlap"]))
    else:
        model = load(options, device)
        x = torch.from_numpy(np.ascontiguousarray(mix.T)).to(device)
        # half precision on an NVIDIA GPU (as the checkpoint's training did), bfloat16 on a CPU only when asked
        half = device.startswith("cuda") or (device == "cpu" and bool(options.get("bf16", False)))
        kind = "cuda" if device.startswith("cuda") else "cpu"
        with torch.autocast(kind, dtype=torch.float16 if kind == "cuda" else torch.bfloat16, enabled=half):
            est = demix(model, len(names), x, int(options["chunk"]), int(options["overlap"]))
    raw = {name: est[i].float().cpu().numpy().T for i, name in enumerate(names)}
    return _normalise(raw, stereo, MODEL_SR, sr)


def self_test() -> dict[str, Any]:
    """The GPU path end to end on a tiny random model (`rhythm-server selftest`, the desktop smoke
    test): its ONNX export, ONNX Runtime with DirectML where it is listed (else, or when it fails,
    the CPU), against PyTorch on the CPU. Also lists the DirectX adapters."""
    import onnxruntime as ort
    import torch

    from .bs_roformer import BSRoformer

    tiny = dict(dim=16, depth=1, stereo=True, num_stems=6, time_transformer_depth=1, freq_transformer_depth=1, dim_head=8, heads=2,
                freqs_per_bands=[32, 32, 64, 129], stft_n_fft=512, stft_hop_length=128, stft_win_length=512)
    report: dict[str, Any] = {"providers": ort.get_available_providers()}
    if sys.platform == "win32":
        try:
            report["adapters"] = _dxgi_adapters()
        except Exception as e:
            report["adapters"] = f"{type(e).__name__}: {e}"
        report["gpu"] = gpu.__wrapped__(2048)
    before = os.environ.get("GRG_MODEL_DIR")
    with tempfile.TemporaryDirectory(prefix="grg-selftest-") as tmp:
        try:
            os.environ["GRG_MODEL_DIR"] = tmp
            torch.manual_seed(0)
            ckpt = Path(tmp) / "src.ckpt"
            torch.save(BSRoformer(**tiny).state_dict(), ckpt)
            opts = {"file": "tiny.ckpt", "url": ckpt.as_uri(), "sha256": hashlib.sha256(ckpt.read_bytes()).hexdigest(), "model": tiny,
                    "instruments": ["bass", "drums", "other", "vocals", "guitar", "piano"], "chunk": 128 * 48, "overlap": 2}
            pcm = (np.random.default_rng(1).standard_normal((44100 * 2, 2)) * 0.1).astype(np.float32)
            ref = separate(pcm, 44100, dict(opts, device="cpu"))
            runs = [("dml", True), ("cpu", False)] if _has_dml() else [("cpu", False)]
            for name, dml in runs:
                try:
                    out = separate(pcm, 44100, dict(opts, device="dml", directml=dml))
                    report[f"ort-{name}"] = round(max(float(np.abs(out[k] - ref[k]).max()) for k in ref), 7)
                except Exception as e:
                    report[f"ort-{name}"] = f"{type(e).__name__}: {e}"
        finally:
            if before is None:
                os.environ.pop("GRG_MODEL_DIR", None)
            else:
                os.environ["GRG_MODEL_DIR"] = before
            with _lock:
                for key in [k for k in _cache if "tiny" in k]:
                    del _cache[key]
    report["ok"] = isinstance(report.get("ort-cpu"), float) and report["ort-cpu"] < 1e-3
    return report
