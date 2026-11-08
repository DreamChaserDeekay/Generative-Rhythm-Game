#!/usr/bin/env bash
# The files electron-builder downloads from GitHub's release downloads, put in its caches before the
# installer build: its Windows tools (7-Zip to unpack them, winCodeSign for rcedit, NSIS and its
# resources) and Electron's zip with the release's SHASUMS256.txt. electron-builder takes a tool
# archive it finds at <builder cache>/<release>/<file>, and @electron/get takes Electron's zip at
# <electron cache>/<sha256 of the release URL>/<file>. @electron/get downloads SHASUMS256.txt for
# every zip, cached or not, unless electron-builder finds it seeded at
# <electron cache>/SHASUMS256.txt-<version>, so that is put there too. One of those downloads that
# fails stops the build: on 2026-11-08 GitHub's release downloads answered 502/503/504 or hung up
# on most requests for hours, which failed the installers five times. Here each file is tried every
# 10 seconds, 60 times, and checked against its checksum.
#   packaging/fetch_builder_tools.sh [builder cache] [electron cache]
#   (defaults: the caches electron-builder and @electron/get use on this machine)
# The tools' versions and checksums are app-builder-lib 26.17's (toolsets/7zip.js and windows.js,
# no `toolsets` setting); Electron's version is the one in desktop/node_modules. An electron-builder
# that asks for other files downloads them itself.
set -euo pipefail

desktop="$(cd "$(dirname "$0")/../desktop" && pwd)"
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) windows=1 ;;
  *) windows=0 ;;
esac
if [ $# -ge 1 ]; then
  cache="$1"
elif [ $windows = 1 ]; then
  cache="$(cygpath -u "$LOCALAPPDATA")/electron-builder/Cache"
else
  cache="${XDG_CACHE_HOME:-$HOME/.cache}/electron-builder"
fi
if [ $# -ge 2 ]; then
  ecache="$2"
elif [ $windows = 1 ]; then
  ecache="$(cygpath -u "$LOCALAPPDATA")/electron/Cache"
else
  ecache="${XDG_CACHE_HOME:-$HOME/.cache}/electron"
fi

# get <url> <file> <sha256> [seconds per try]: the file in place and checked, or a note that it is not
get() {
  local url=$1 out=$2 sha=$3 max=${4:-180} name
  name=$(basename "$out")
  mkdir -p "$(dirname "$out")"
  if [ -f "$out" ] && echo "$sha  $out" | sha256sum -c --status; then
    echo "$name: already in the cache"
    return 0
  fi
  for try in $(seq 1 60); do
    if curl -sSfL --max-time "$max" -o "$out.part" "$url" 2>/dev/null \
        && echo "$sha  $out.part" | sha256sum -c --status; then
      mv -f "$out.part" "$out"
      echo "$name: fetched on try $try"
      return 0
    fi
    rm -f "$out.part"
    sleep 10
  done
  echo "$name: not fetched after 60 tries (electron-builder will try once more itself)"
  return 1
}

tools=https://github.com/electron-userland/electron-builder-binaries/releases/download
tool() { get "$tools/$1/$2" "$cache/$1/$2" "$3" || true; }
if [ $windows = 1 ]; then
  tool 7zip@1.0.0 7zip-win-x64.tar.gz be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3
else
  tool 7zip@1.0.0 7zip-linux-x64.tar.gz d151bb44b2a9d9bfc52813ce4cac042916394a0ab8a56bd5d221a5dc9ef8d5d7
fi
tool winCodeSign-2.6.0 winCodeSign-2.6.0.7z cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4
tool nsis-3.0.4.1 nsis-3.0.4.1.7z 9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa
tool nsis-resources-3.4.1 nsis-resources-3.4.1.7z 593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103

# Electron: the release's checksums first (the zip is checked against them), then the zip
version=$(cd "$desktop" && node -p "require('electron/package.json').version")
zip="electron-v$version-$([ $windows = 1 ] && echo win32 || echo linux)-x64.zip"
release="https://github.com/electron/electron/releases/download/v$version"
sums="$ecache/SHASUMS256.txt-$version"
sha_of() { awk -v f="*$zip" '{ sub(/\r$/, "") } $2 == f { print $1; exit }' "$1" 2>/dev/null || true; }
mkdir -p "$ecache"
if [ -n "$(sha_of "$sums")" ]; then
  echo "SHASUMS256.txt-$version: already in the cache"
else
  for try in $(seq 1 60); do
    if curl -sSfL --max-time 60 -o "$sums.part" "$release/SHASUMS256.txt" 2>/dev/null \
        && [ -n "$(sha_of "$sums.part")" ]; then
      mv -f "$sums.part" "$sums"
      echo "SHASUMS256.txt-$version: fetched on try $try"
      break
    fi
    rm -f "$sums.part"
    sleep 10
  done
fi
sha=$(sha_of "$sums")
if [ -z "$sha" ]; then
  echo "SHASUMS256.txt-$version: not fetched after 60 tries (electron-builder will try once more itself)"
  exit 0
fi
get "$release/$zip" "$ecache/$(printf '%s' "$release" | sha256sum | cut -d' ' -f1)/$zip" "$sha" 600 || true
