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
# conda-forge's Python drops that floor to 2.31.
#
# This script verifies that rather than trusting it: it scans every ELF file
# in the output for the highest GLIBC_* symbol it requires and fails the
# build if that's above MAX_GLIBC. That check is the whole point - it turns
# "works on the build machine, broken on every user's" into a hard failure.
#
# Run from the repo root:
#     ./python/freeze_in_container.sh
#
# Output: resources/nmrgraph_server/ -- matches package.json's
# build.extraResources entry, so `npm run dist:linux` picks it up.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE="enlacecraft-nmrgraph-build"
SRC="python/NMRGraph"
OUT="resources/nmrgraph_server"
PORT=18098

# Must match the Dockerfile's base image (ubuntu:20.04 = glibc 2.31). Bump
# both together, deliberately - the check below enforces the agreement.
MAX_GLIBC="2.31"

if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is required but wasn't found on PATH." >&2
    echo "       The freeze has to run inside the pinned container - see" >&2
    echo "       python/Dockerfile.nmrgraph's header for why there's no" >&2
    echo "       host-side fallback." >&2
    exit 1
fi

if [ ! -f "$SRC/packaging/nmrgraph_server.spec" ]; then
    echo "ERROR: $SRC/packaging/nmrgraph_server.spec not found." >&2
    echo "       If you cloned without submodules, run:" >&2
    echo "         git submodule update --init --recursive" >&2
    exit 1
fi

echo "==> Building the pinned build container"
docker build -f python/Dockerfile.nmrgraph -t "$IMAGE" .

echo "==> Freezing inside the container"
# Bind-mount the output dir instead of `docker cp`, so the container writes
# straight to the host path and there's no copy step to go wrong.
#
# The rm happens *inside* the container too, not just before it: a previous
# run's output is root-owned (the container runs as root), so a host-side
# `rm -rf` fails with "Permission denied" and can't clean up its own mess.
# Doing the cleanup as root inside the container avoids needing sudo on the
# host for a self-inflicted problem.
#
# The trailing chmod fixes the ownership problem at the source - without it
# this script couldn't write the checkpoints next to the executable, because
# the freeze left them root-owned.
mkdir -p "$SRC/dist"
docker run --rm \
    -v "$(pwd)/$SRC/dist:/src/dist" \
    "$IMAGE" \
    sh -c 'rm -rf /src/dist/* /src/dist/.[!.]* 2>/dev/null || true
           /opt/bin/micromamba run -n build \
               pyinstaller --noconfirm packaging/nmrgraph_server.spec \
        && chmod -R a+rwX /src/dist'

if [ ! -x "$SRC/dist/nmrgraph_server/nmrgraph_server" ]; then
    echo "ERROR: freeze produced no executable at $SRC/dist/nmrgraph_server/" >&2
    exit 1
fi

echo "==> Copying model checkpoints alongside the executable"
# The spec deliberately excludes these (see src/paths.py) - frozen mode
# resolves data/models/ relative to the executable, not the cwd.
mkdir -p "$SRC/dist/nmrgraph_server/data/models"
cp "$SRC"/data/models/*.pt "$SRC/dist/nmrgraph_server/data/models/"

echo "==> Verifying the glibc floor (target: GLIBC_${MAX_GLIBC})"
if ! command -v objdump >/dev/null 2>&1; then
    echo "ERROR: objdump (binutils) is required to verify the glibc floor." >&2
    exit 1
fi

max_glibc=$(find "$SRC/dist/nmrgraph_server" -type f \( -name '*.so*' -o -perm -u+x \) -print0 \
    | xargs -0 -r objdump -T 2>/dev/null \
    | grep -o 'GLIBC_[0-9][0-9.]*' \
    | sort -V | uniq | tail -1)

if [ -z "$max_glibc" ]; then
    echo "ERROR: couldn't determine the glibc requirement of the bundle." >&2
    exit 1
fi
echo "    highest GLIBC symbol required: $max_glibc"

if [ "$(printf '%s\n' "$max_glibc" "GLIBC_${MAX_GLIBC}" | sort -V | tail -1)" != "GLIBC_${MAX_GLIBC}" ]; then
    echo "ERROR: bundle requires $max_glibc, above the GLIBC_${MAX_GLIBC} target." >&2
    echo "       The container's base image is too new - see python/Dockerfile.nmrgraph." >&2
    exit 1
fi

echo "==> Smoke-testing the frozen binary"
log=$(mktemp)
"$SRC/dist/nmrgraph_server/nmrgraph_server" --port "$PORT" >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT

healthy=""
for _ in $(seq 1 60); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/health" 2>/dev/null)" = "200" ]; then
        healthy=1
        break
    fi
    sleep 0.5
done

if [ -z "$healthy" ]; then
    echo "Smoke test FAILED: server never became healthy. Output:" >&2
    cat "$log" >&2
    exit 1
fi

health=$(curl -s "http://localhost:$PORT/health")
echo "    /health -> $health"

if [[ "$health" != *"model_loaded"* ]]; then
    echo "Smoke test FAILED: /health didn't report model_loaded. Output:" >&2
    cat "$log" >&2
    exit 1
fi
if [[ "$health" == *'"model_loaded": false'* || "$health" == *'"model_loaded":false'* ]]; then
    echo "Smoke test FAILED: model_loaded is false - the checkpoints didn't load." >&2
    cat "$log" >&2
    exit 1
fi

predict_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:$PORT/predict" \
    -H "Content-Type: application/json" -d '{"smiles":"CCO"}')
if [ "$predict_code" != "200" ]; then
    echo "Smoke test FAILED: /predict returned HTTP $predict_code. Output:" >&2
    cat "$log" >&2
    exit 1
fi
echo "    /predict(CCO) -> HTTP $predict_code"

kill "$pid" 2>/dev/null || true
trap - EXIT
rm -f "$log"

echo "==> Copying into $OUT"
rm -rf "$OUT"
cp -r "$SRC/dist/nmrgraph_server" "$OUT"

echo "==> Done. $OUT/ is ready -- run npm run dist:linux."
