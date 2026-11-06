#!/usr/bin/env bash
# Builds the desktop app: the client, the analysis server bundled with PyInstaller, then the
# Electron package for this OS (Windows: NSIS installer, macOS: dmg, Linux: AppImage).
#   packaging/build_desktop.sh          installer / image in desktop/dist
#   packaging/build_desktop.sh --dir    unpacked app folder only (quicker, for testing)
# GRG_PYTHON selects the Python with the server installed (default: server/.venv).
# GRG_EDITION=ml builds the ML edition (PyTorch CPU, Demucs, beat_this, basic-pitch ONNX; on Windows
# the bundled server is 784 MB, the installer 347 MB) as GenerativeRhythm-ML-Setup-<version>.exe; the default edition has the core
# analysis only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -x "$ROOT/server/.venv/bin/python" ]]; then DEFAULT_PY="$ROOT/server/.venv/bin/python"; else DEFAULT_PY="$ROOT/server/.venv/Scripts/python.exe"; fi
PY="${GRG_PYTHON:-$DEFAULT_PY}"
EDITION="${GRG_EDITION:-core}"
BUILDER_EXTRA=()

echo "== client"
(cd "$ROOT/client" && npm ci && npm run build)
echo "== analysis server (PyInstaller)"
if [[ "$EDITION" == ml ]]; then
  "$PY" -m pip install -q -r "$ROOT/packaging/ml_torch.txt" --index-url https://download.pytorch.org/whl/cpu
  "$PY" -m pip install -q -e "$ROOT/server[build,ml]"
  if "$PY" -c 'import sys; sys.exit(sys.version_info < (3, 12))'; then
    "$PY" -m pip install -q --no-deps "basic-pitch>=0.4"  # its ONNX model; see server/pyproject.toml
  fi
  BUILDER_EXTRA=(-c.nsis.artifactName='GenerativeRhythm-ML-Setup-${version}.${ext}')
else
  "$PY" -m pip install -q -e "$ROOT/server[build]"
fi
(cd "$ROOT/server" && GRG_EDITION="$EDITION" "$PY" -m PyInstaller ../packaging/rhythm-server.spec --noconfirm --distpath dist --workpath build)
echo "== desktop app (Electron)"
(cd "$ROOT/desktop" && npm ci && npx electron-builder "${BUILDER_EXTRA[@]}" "$@")
echo "done: $ROOT/desktop/dist"
