#!/usr/bin/env bash
# Freezes the iupac_fallback_server backend inside a pinned Linux container,
# then copies the result into resources/iupac_fallback_server/ for
# electron-builder to bundle.
#
# WHY A CONTAINER
# ---------------
# Same glibc reason as the other two backends (see Dockerfile.mmrgraph's
# header and freeze_lib.sh). This one was frozen against glibc 2.44 for 1.7.1
# and died on user machines like the rest.
#
# WHAT THIS SCRIPT FIXES THAT THE OLD build_linux.sh DIDN'T
# -------------------------------------------------------
# The JRE. This service wraps OPSIN (a Java library) and needs a JVM at
# runtime, but PyInstaller only freezes Python - it has no idea a JVM is
# involved, so the JRE has to be bundled explicitly. In 1.7.1 it wasn't: the
# shipped bundle had no jre/ directory at all, so naming.py's
# _bundled_jre_jvm_path() returned None and the server fell back to looking
# for a system-installed Java that a packaged end user doesn't have. The IUPAC
# fallback was broken on every user's machine, independently of glibc.
#
# This script asserts the JRE is present and actually starts, so that class of
# "everything built fine, nothing works when shipped" bug can't ship again.
#
# Run from the repo root:
#     ./python/freeze_iupac.sh
#
# Output: resources/iupac_fallback_server/ -- matches package.json's
# build.extraResources entry, so `npm run dist:linux` picks it up.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# shellcheck source=python/freeze_lib.sh
. python/freeze_lib.sh

IMAGE="enlacecraft-iupac-build"
DOCKERFILE="python/Dockerfile.iupac"
SRC="python/iupac_fallback_server"
OUT="resources/iupac_fallback_server"
BUNDLE="iupac_fallback_server"
PORT=18096

require_docker

if [ ! -f "$SRC/iupac_fallback_server.spec" ]; then
    echo "ERROR: $SRC/iupac_fallback_server.spec not found." >&2
    exit 1
fi

echo "==> Building the pinned build container"
docker build -f "$DOCKERFILE" -t "$IMAGE" .

# Copy the pinned JRE in next to the executable. The image already verified
# libjvm.so exists at this layout, and --strip-components was applied when the
# archive was unpacked, so /opt/jre already IS the jre/ directory naming.py
# expects relative to the executable.
freeze_in_container "$IMAGE" "$SRC" "$BUNDLE" iupac_fallback_server.spec \
    "cp -r /opt/jre /src/dist/$BUNDLE/jre"

echo "==> Checking the bundled JRE is where naming.py looks for it"
# This is the exact path naming.py's _bundled_jre_jvm_path() builds on Linux.
if [ ! -f "$SRC/dist/$BUNDLE/jre/lib/server/libjvm.so" ]; then
    echo "ERROR: jre/lib/server/libjvm.so is missing from the bundle." >&2
    echo "       The frozen server would fall back to a system Java that a" >&2
    echo "       packaged end user doesn't have, and OPSIN naming would fail." >&2
    exit 1
fi
echo "    found jre/lib/server/libjvm.so"

echo "==> Verifying the glibc floor (target: GLIBC_${MAX_GLIBC})"
verify_glibc_floor "$SRC/dist/$BUNDLE"

smoke_start "$SRC/dist/$BUNDLE/$BUNDLE" "$PORT"
smoke_wait_healthy "$PORT"

# The real test: /name runs OPSIN through the bundled JVM. If the JRE were
# missing or unusable, this is where it fails - /health would happily report
# ok regardless, since it doesn't touch the JVM.
name_result=$(smoke_post "$PORT" /name '{"smiles":"CF"}')
name_code=$(printf '%s' "$name_result" | head -1)
if [ "$name_code" != "200" ]; then
    echo "Smoke test FAILED: /name returned HTTP $name_code. Output:" >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi

# Assert on the chemistry, not just the status code: "CF" is fluoromethane,
# so a working OPSIN round-trip names it fluoro-something. A 200 with a wrong
# or empty name means the JVM started but OPSIN isn't actually working.
if ! printf '%s' "$name_result" | grep -qi "fluoro"; then
    echo "Smoke test FAILED: /name(CCF) didn't return a fluoro- name." >&2
    printf '%s\n' "$name_result" >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi
echo "    /name(CF) -> HTTP $name_code, OPSIN round-trip OK"

smoke_stop
trap - EXIT

echo "==> Copying into $OUT"
rm -rf "$OUT"
cp -r "$SRC/dist/$BUNDLE" "$OUT"

echo "==> Done. $OUT/ is ready -- run npm run dist:linux."