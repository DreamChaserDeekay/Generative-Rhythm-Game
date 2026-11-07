#!/usr/bin/env bash
# NATTEN 0.14.6 from source, CPU only, for the structure edition (allin1 1.1.0 needs NATTEN's 0.14
# functions; NATTEN has no Windows wheels). Run from the repository root in Git Bash, inside an
# MSVC developer environment (ilammy/msvc-dev-cmd), with PyTorch already installed. Worked out in
# .github/workflows/allin1-windows-experiment.yml (docs/PATTERN_DESIGN.md 88).
set -euo pipefail

work="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/natten-build"
mkdir -p "$work"
# Git Bash puts its own Unix `link` ahead of MSVC's linker: MSVC's tool folder goes first
if command -v cl >/dev/null 2>&1; then
  export PATH="$(dirname "$(command -v cl)"):$PATH"
fi
# the MSVC environment is already set up: torch's extension builder must not set it up again
export DISTUTILS_USE_SDK=1
export NATTEN_N_WORKERS="${NATTEN_N_WORKERS:-4}"

# the source archive straight from PyPI (pip download would run setup.py without torch)
python - "$work" <<'PY'
import json, sys, urllib.request
meta = json.load(urllib.request.urlopen("https://pypi.org/pypi/natten/0.14.6/json"))
url = next(u["url"] for u in meta["urls"] if u["packagetype"] == "sdist")
urllib.request.urlretrieve(url, sys.argv[1] + "/natten-0.14.6.tar.gz")
PY
tar -xzf "$work/natten-0.14.6.tar.gz" -C "$work"
src="$work/natten-0.14.6"
# the archive ships a stale egg-info whose file list has absolute Linux paths (setuptools refuses them)
rm -rf "$src/src/natten.egg-info"
# NATTEN 0.14.6's CPU dispatch macros are GCC statement expressions, ({ ... }), which MSVC does not
# have; they are only used as statements, so do { ... } while (0) is the same code
h="$src/src/natten/csrc/cpu/natten_cpu_commons.h"
sed -i -E 's/^\(\{([[:space:]]*\\)$/do {\1/; s/^\}\)[[:space:]]*$/} while (0)/' "$h"
left=$(grep -cE '^\(\{|^\}\)' "$h" || true)
[ "$left" = 0 ] || { echo "statement expressions left in $h: $left"; exit 1; }

log="$work/natten_build.log"
status=0
python -m pip install --no-build-isolation -v "$src" > "$log" 2>&1 || status=$?
echo "NATTEN build: pip exit $status, log $(wc -l < "$log") lines"
if [ "$status" != 0 ]; then
  # the compiler's own messages (the traceback after them only says the build failed)
  grep -nE "error C[0-9]{4}|fatal error|error LNK|: error|FAILED:" "$log" | head -n 60 || true
  tail -n 30 "$log"
  exit "$status"
fi
python -c "import natten; from natten.functional import natten1dqkrpb, natten1dav; print('natten', natten.__version__)"
