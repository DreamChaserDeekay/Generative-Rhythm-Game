#!/usr/bin/env bash
# Builds the desktop app: the client, the analysis server bundled with PyInstaller, then the
# Electron package for this OS (Windows: NSIS installer, macOS: dmg, Linux: AppImage).
#   packaging/build_desktop.sh          installer / image in desktop/dist
#   packaging/build_desktop.sh --dir    unpacked app folder only (quicker, for testing)
# GRG_PYTHON selects the Python with the server installed (default: server/.venv).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -x "$ROOT/server/.venv/bin/python" ]]; then DEFAULT_PY="$ROOT/server/.venv/bin/python"; else DEFAULT_PY="$ROOT/server/.venv/Scripts/python.exe"; fi
PY="${GRG_PYTHON:-$DEFAULT_PY}"

echo "== client"
(cd "$ROOT/client" && npm ci && npm run build)
echo "== analysis server (PyInstaller)"
"$PY" -m pip install -q -e "$ROOT/server[build]"
(cd "$ROOT/server" && "$PY" -m PyInstaller ../packaging/rhythm-server.spec --noconfirm --distpath dist --workpath build)
echo "== desktop app (Electron)"
(cd "$ROOT/desktop" && npm ci && npx electron-builder "$@")
echo "done: $ROOT/desktop/dist"
