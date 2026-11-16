# paths.sh: read by the shell scripts of this folder (. "$(dirname "$0")/paths.sh").
#   S   the work folder: the environment variable PANEL_WORK (the draft folders and refs/ lie in it, the rest in $S/inputs)
#   R   the repository's root: three levels above this folder
#   D   this folder: the scripts call one another from here
: "${PANEL_WORK:?PANEL_WORK is not set: export PANEL_WORK=<the work folder> (see scripts/assets/deck_panels/README.md)}"
D=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
R=$(cd "$D/../../.." && pwd)
S=$(cd "$PANEL_WORK" 2>/dev/null && pwd) || { echo "PANEL_WORK is not a folder: $PANEL_WORK"; exit 1; }
