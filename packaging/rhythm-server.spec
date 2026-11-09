# PyInstaller spec: one folder with the analysis server, the shared config and the built client.
# GRG_EDITION=ml builds the ML edition (README: 데스크톱 앱, docs/ARCHITECTURE.md): PyTorch (CPU), BS-RoFormer
# (ONNX Runtime DirectML on a GPU), Demucs, beat_this and basic-pitch (its ONNX model) come along and the
# analysis uses them; their model weights are downloaded on first use. GRG_EDITION=structure is the ML edition with allin1 (song structure) on
# PyTorch 2.1 (packaging/structure_constraints.txt, docs/PATTERN_DESIGN.md 90). Otherwise (the
# default edition) they are left out and the desktop app runs the core analysis.
import importlib.util
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
if EDITION in ("ml", "structure"):
    # torch, torchaudio, onnxruntime, numba and scikit-learn have their own hooks; these carry data
    # files (model configs, the ONNX model, librosa's lazy-loader stubs, resampy's filters) or are
    # imported lazily
    packages += ["demucs", "beat_this", "basic_pitch", "librosa", "resampy", "soxr", "sphn", "lameenc", "julius",
                 "rotary_embedding_torch", "einops", "mir_eval", "pretty_midi", "huggingface_hub", "safetensors",
                 # BS-RoFormer's ONNX export (onnx) and ONNX Runtime's DirectML build with its DirectML.dll
                 "onnx", "onnxruntime"]
else:
    excludes += ["torch", "torchaudio", "demucs", "beat_this", "basic_pitch", "onnxruntime", "librosa"]
if EDITION == "structure":
    # allin1 and what it imports: NATTEN (built from source, packaging/build_natten.sh), madmom (its
    # signal processing and DBN decoder only), its configs (Hydra, OmegaConf) and matplotlib (allin1
    # imports its plotting module; the adapter sets the Agg backend)
    packages += ["allin1", "natten", "madmom", "omegaconf", "hydra"]
    excludes = [e for e in excludes if e not in ("allin1", "matplotlib")]
for package in packages:
    if importlib.util.find_spec(package) is None:
        print(f"rhythm-server.spec: {package} is not installed, left out")
        continue
    d, b, h = collect_all(package)
    if package == "madmom":
        # madmom's pre-trained models are CC BY-NC-SA; allin1 runs its own models, so they stay out
        d = [(src, dest) for src, dest in d if not dest.replace("\\", "/").startswith("madmom/models")]
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
