# PyInstaller spec: one folder with the analysis server, the shared config and the built client.
# One edition: the core analysis (numpy, scipy) and Mapperatorinator's worker and source; the ML
# analysis backends (PyTorch, Demucs, beat_this, basic-pitch, allin1) are not bundled.
import importlib.util
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).parent
datas = [(str(ROOT / "config"), "config"), (str(ROOT / "client" / "dist"), "client_dist")]
binaries = []
hiddenimports = collect_submodules("rhythm_server") + collect_submodules("uvicorn")
# soundfile is a single module (its contrib hook covers it); libsndfile ships in _soundfile_data
packages = ["av", "_soundfile_data"]
excludes = ["tensorflow", "allin1", "tkinter", "matplotlib", "pytest", "IPython"]
excludes += ["torch", "torchaudio", "demucs", "beat_this", "basic_pitch", "onnxruntime", "librosa"]
# Mapperatorinator (docs/MAPPERATORINATOR.md): the worker that runs in its own Python (a file, not
# a frozen module) and its source and slider's at the pinned commits (packaging/vendor, fetched by
# the workflow; without them the app downloads them from GitHub when it sets the runtime up)
datas.append((str(ROOT / "server" / "rhythm_server" / "mapper" / "worker.py"), "rhythm_server/mapper"))
for name in ("mapperatorinator", "slider"):
    vendor = ROOT / "packaging" / "vendor" / name
    if vendor.is_dir():
        datas.append((str(vendor), f"vendor/{name}"))
    else:
        print(f"rhythm-server.spec: packaging/vendor/{name} is missing, left out")
for package in packages:
    if importlib.util.find_spec(package) is None:
        print(f"rhythm-server.spec: {package} is not installed, left out")
        continue
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
