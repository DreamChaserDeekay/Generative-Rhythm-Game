# PyInstaller spec: one folder with the analysis server, the shared config and the built client.
# GRG_EDITION=ml builds the ML edition (README: 데스크톱 앱, docs/ARCHITECTURE.md): PyTorch (CPU), Demucs, beat_this
# and basic-pitch (its ONNX model) come along and the analysis uses them; their model weights are
# downloaded on first use. Otherwise (the default edition) they are left out and the desktop app
# runs the core analysis.
import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).parent
EDITION = os.environ.get("GRG_EDITION", "core")
datas = [(str(ROOT / "config"), "config"), (str(ROOT / "client" / "dist"), "client_dist")]
binaries = []
hiddenimports = collect_submodules("rhythm_server") + collect_submodules("uvicorn")
# soundfile is a single module (its contrib hook covers it); libsndfile ships in _soundfile_data
packages = ["av", "_soundfile_data"]
excludes = ["tensorflow", "allin1", "tkinter", "matplotlib", "pytest", "IPython"]
if EDITION == "ml":
    # torch, torchaudio, onnxruntime, numba and scikit-learn have their own hooks; these carry data
    # files (model configs, the ONNX model, librosa's lazy-loader stubs, resampy's filters) or are
    # imported lazily
    packages += ["demucs", "beat_this", "basic_pitch", "librosa", "resampy", "soxr", "sphn", "lameenc", "julius",
                 "rotary_embedding_torch", "einops", "mir_eval", "pretty_midi", "huggingface_hub", "safetensors"]
else:
    excludes += ["torch", "torchaudio", "demucs", "beat_this", "basic_pitch", "onnxruntime", "librosa"]
for package in packages:
    d, b, h = collect_all(package)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    [str(ROOT / "packaging" / "server_entry.py")],
    pathex=[str(ROOT / "server")],
    datas=datas,
    binaries=binaries,
    hiddenimports=hiddenimports,
    excludes=excludes,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="rhythm-server", console=True)
coll = COLLECT(exe, a.binaries, a.datas, name="rhythm-server")
