#!/bin/bash
# shoot_each.sh <folder>:<try> ...: each folder's flat picture on the four cameras, one after another
. "$(dirname "$0")/paths.sh"
for a in "$@"; do $D/shoot.sh ${a%%:*} ${a##*:} || exit 1; done
