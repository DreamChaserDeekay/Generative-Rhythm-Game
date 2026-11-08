#!/usr/bin/env bash
# electron-builder's Windows tools (7-Zip to unpack them, winCodeSign for rcedit, NSIS and its
# resources) put in its archive cache before the installer build. electron-builder takes an
# archive it finds at <cache>/<release>/<file> instead of downloading it, and a download of its own
# that fails stops the build. On 2026-11-08 GitHub's release downloads answered 504 to most requests for
# over an hour, which failed the structure edition's installer three times. Here each file is
# tried every 10 seconds for up to 10 minutes and checked against electron-builder's checksum.
#   packaging/fetch_builder_tools.sh [cache dir]   (default: electron-builder's cache on Windows)
# The versions and checksums are app-builder-lib 26.17's (toolsets/7zip.js and windows.js, no
# `toolsets` setting). An electron-builder that asks for other files downloads them itself.
set -euo pipefail

if [ $# -ge 1 ]; then
  cache="$1"
elif [ -n "${LOCALAPPDATA:-}" ]; then
  cache="$(cygpath -u "$LOCALAPPDATA")/electron-builder/Cache"
else
  cache="$HOME/.cache/electron-builder"
fi
base=https://github.com/electron-userland/electron-builder-binaries/releases/download

fetch() {
  local release=$1 file=$2 sha=$3
  local out="$cache/$release/$file"
  mkdir -p "$cache/$release"
  if [ -f "$out" ] && echo "$sha  $out" | sha256sum -c --status; then
    echo "$file: already in the cache"
    return 0
  fi
  for try in $(seq 1 60); do
    if curl -sSfL --max-time 180 -o "$out.part" "$base/$release/$file" 2>/dev/null \
        && echo "$sha  $out.part" | sha256sum -c --status; then
      mv -f "$out.part" "$out"
      echo "$file: fetched on try $try"
      return 0
    fi
    rm -f "$out.part"
    sleep 10
  done
  echo "$file: not fetched after 60 tries (electron-builder will try once more itself)"
}

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) fetch 7zip@1.0.0 7zip-win-x64.tar.gz be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3 ;;
  *) fetch 7zip@1.0.0 7zip-linux-x64.tar.gz d151bb44b2a9d9bfc52813ce4cac042916394a0ab8a56bd5d221a5dc9ef8d5d7 ;;
esac
fetch winCodeSign-2.6.0 winCodeSign-2.6.0.7z cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4
fetch nsis-3.0.4.1 nsis-3.0.4.1.7z 9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa
fetch nsis-resources-3.4.1 nsis-resources-3.4.1.7z 593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103
