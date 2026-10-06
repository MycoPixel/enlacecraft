#!/usr/bin/env bash
# Freezes the NMRGraph prediction server inside a pinned Linux container,
# then copies the result into resources/nmrgraph_server/ for
# electron-builder to bundle.
#
# WHY A CONTAINER
# ---------------
# PyInstaller does not bundle glibc, so the build machine's glibc becomes
# every end user's minimum - and it fails silently at build time. The 1.7.1
# release was frozen with the system Python 3.14 on a glibc-2.44 host, so
# the bundle demanded GLIBC_2.44 and refused to start on essentially every
# real user's Linux. Freezing inside ubuntu:20.04 (glibc 2.31) with
# conda-forge's Python drops that floor all the way to 2.17.
#
# This script verifies that rather than trusting it (see verify_glibc_floor
# in freeze_lib.sh). That check is the whole point - it turns "works on the
# build machine, broken on every user's" into a hard failure.
#
# Run from the repo root:
#     ./python/freeze_in_container.sh
#
# Output: resources/nmrgraph_server/ -- matches package.json's
# build.extraResources entry, so `npm run dist:linux` picks it up.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# shellcheck source=python/freeze_lib.sh
. python/freeze_lib.sh

IMAGE="enlacecraft-nmrgraph-build"
DOCKERFILE="python/Dockerfile.nmrgraph"
SRC="python/NMRGraph"
OUT="resources/nmrgraph_server"
BUNDLE="nmrgraph_server"
PORT=18098

require_docker

if [ ! -f "$SRC/packaging/nmrgraph_server.spec" ]; then
    echo "ERROR: $SRC/packaging/nmrgraph_server.spec not found." >&2
    echo "       If you cloned without submodules, run:" >&2
    echo "         git submodule update --init --recursive" >&2
    exit 1
fi

echo "==> Building the pinned build container"
docker build -f "$DOCKERFILE" -t "$IMAGE" .

freeze_in_container "$IMAGE" "$SRC" "$BUNDLE" packaging/nmrgraph_server.spec

echo "==> Copying model checkpoints alongside the executable"
# The spec deliberately excludes these (see src/paths.py) - frozen mode
# resolves data/models/ relative to the executable, not the cwd.
mkdir -p "$SRC/dist/$BUNDLE/data/models"
cp "$SRC"/data/models/*.pt "$SRC/dist/$BUNDLE/data/models/"

echo "==> Verifying the glibc floor (target: GLIBC_${MAX_GLIBC})"
verify_glibc_floor "$SRC/dist/$BUNDLE"

smoke_start "$SRC/dist/$BUNDLE/$BUNDLE" "$PORT"
smoke_wait_healthy "$PORT"

health=$(curl -s "http://localhost:$PORT/health")
echo "    /health -> $health"

# model_loaded is the assertion that matters here: it's what proves the
# checkpoints were found and loaded, which is the one thing the freeze
# can't do on its own.
if [[ "$health" != *"model_loaded"* ]]; then
    echo "Smoke test FAILED: /health didn't report model_loaded. Output:" >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi
if [[ "$health" == *'"model_loaded": false'* || "$health" == *'"model_loaded":false'* ]]; then
    echo "Smoke test FAILED: model_loaded is false - the checkpoints didn't load." >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi

predict_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:$PORT/predict" \
    -H "Content-Type: application/json" -d '{"smiles":"CCO"}')
if [ "$predict_code" != "200" ]; then
    echo "Smoke test FAILED: /predict returned HTTP $predict_code. Output:" >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi
echo "    /predict(CCO) -> HTTP $predict_code"

smoke_stop
trap - EXIT

echo "==> Copying into $OUT"
rm -rf "$OUT"
cp -r "$SRC/dist/$BUNDLE" "$OUT"

echo "==> Done. $OUT/ is ready -- run npm run dist:linux."