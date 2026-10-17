# PyInstaller spec: one folder with the analysis server, the shared config and the built client.
# The optional ML backends (PyTorch etc.) are left out; the desktop app runs the core analysis.
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).parent
datas = [(str(ROOT / "config"), "config"), (str(ROOT / "client" / "dist"), "client_dist")]
binaries = []
hiddenimports = collect_submodules("rhythm_server") + collect_submodules("uvicorn")
# soundfile is a single module (its contrib hook covers it); libsndfile ships in _soundfile_data
for package in ("av", "_soundfile_data"):
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
    excludes=["torch", "torchaudio", "demucs", "tensorflow", "beat_this", "basic_pitch", "allin1", "tkinter", "matplotlib", "pytest"],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="rhythm-server", console=True)
coll = COLLECT(exe, a.binaries, a.datas, name="rhythm-server")
