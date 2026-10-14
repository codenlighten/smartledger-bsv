#!/bin/bash
# Install a published version from the registry into a throwaway directory and run one probe
# against it.  See README.md.
#   usage: bash run.sh <probe> <package> <version>
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PROBE="${1:?probe name required, e.g. ltp-forgery}"
PKG="${2:?package name required, e.g. @smartledger/bsv}"
VER="${3:?version required, e.g. 9.31.0}"

SCRIPT="$HERE/$PROBE.js"
[ -f "$SCRIPT" ] || { echo "no such probe: $PROBE"; ls "$HERE"/*.js | xargs -n1 basename; exit 1; }

DIR="${PROBE_INSTALL_ROOT:-/tmp/published-version-probes}/$(echo "$PKG" | tr '/@' '__')-$VER"
if [ ! -d "$DIR/node_modules/$PKG" ]; then
  mkdir -p "$DIR"
  ( cd "$DIR" && npm init -y >/dev/null 2>&1 &&
    npm install --ignore-scripts --no-audit --no-fund "$PKG@$VER" >/dev/null 2>&1 ) ||
    { echo "install failed: $PKG@$VER"; exit 1; }
fi

nice -n 19 node "$SCRIPT" "$DIR" "$PKG"
