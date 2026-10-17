#!/usr/bin/env bash
# Freezes the structure3d_server (GFN2-xTB) backend inside a pinned Linux
# container, then copies the result into resources/structure3d_server/ for
# electron-builder to bundle.
#
# WHY A CONTAINER
# ---------------
# Same reason as the NMR backend: PyInstaller doesn't bundle glibc, so the
# build machine's glibc becomes every user's minimum. This one was frozen
# against glibc 2.44 for 1.7.1 and died on user machines exactly like the
# other two.
#
# The extra wrinkle this backend has over the NMR one: it shells out to the
# `xtb` binary, which has to be bundled *next to* the frozen executable at
# xtb/bin/xtb (see find_xtb_binary() in main.py). A freeze that omits it
# still produces a working-looking binary that 503s every request, so the
# smoke test below asserts on xtb_available rather than just on /health.
#
# Run from the repo root:
#     ./python/freeze_structure3d.sh
#
# Output: resources/structure3d_server/ -- matches package.json's
# build.extraResources entry, so `npm run dist:linux` picks it up.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# shellcheck source=python/freeze_lib.sh
. python/freeze_lib.sh

IMAGE="enlacecraft-structure3d-build"
DOCKERFILE="python/Dockerfile.structure3d"
SRC="python/structure3d_server"
OUT="resources/structure3d_server"
BUNDLE="structure3d_server"
PORT=18097

require_docker

if [ ! -f "$SRC/structure3d_server.spec" ]; then
    echo "ERROR: $SRC/structure3d_server.spec not found." >&2
    exit 1
fi

echo "==> Building the pinned build container"
docker build -f "$DOCKERFILE" -t "$IMAGE" .

# Copy xtb in from the image's pinned download. --strip-components was already
# applied when extracting the archive, so /opt/xtb/bin/xtb is already the
# bare statically-linked binary that find_xtb_binary() expects.
freeze_in_container "$IMAGE" "$SRC" "$BUNDLE" structure3d_server.spec \
    "mkdir -p /src/dist/$BUNDLE/xtb/bin \
     && cp /opt/xtb/bin/xtb /src/dist/$BUNDLE/xtb/bin/xtb"

echo "==> Verifying the glibc floor (target: GLIBC_${MAX_GLIBC})"
verify_glibc_floor "$SRC/dist/$BUNDLE"

smoke_start "$SRC/dist/$BUNDLE/$BUNDLE" "$PORT"
smoke_wait_healthy "$PORT"

health=$(curl -s "http://localhost:$PORT/health")
echo "    /health -> $health"

# xtb_available is the assertion that actually matters: /health returns 200
# even when xtb is missing, so without this check a bundle with no xtb would
# pass the smoke test and then fail every real request with a 503.
if [[ "$health" != *'"xtb_available": true'* && "$health" != *'"xtb_available":true'* ]]; then
    echo "Smoke test FAILED: xtb_available is not true - the xtb binary is" >&2
    echo "missing or not executable, so every /embed3d/xtb request would 503." >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi

# Also exercise the real endpoint, not just /health: this runs xtb for real,
# so it proves the bundled binary actually executes rather than merely being
# present and executable - and it's what catches an xtb that was bundled but
# can't find its parameters, which would otherwise only fail on a user's
# machine.
#
# The payload is a V2000 molfile (what main.py's Embed3DXtbRequest expects -
# a molfile with a 3D conformer and explicit hydrogens, not atom coordinates).
# Water is the smallest thing that still exercises a real SCF + optimization.
MOLFILE=$(cat <<'MOL'
water
  Mrv

  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.9572    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.2400    0.9266    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
M  END
MOL
)

embed_code=$(MOLFILE="$MOLFILE" python3 - "$PORT" <<'PY' 2>/dev/null || echo "000"
import json, os, sys, urllib.error, urllib.request
body = json.dumps({"molfile": os.environ["MOLFILE"], "charge": 0}).encode()
req = urllib.request.Request(
    f"http://localhost:{sys.argv[1]}/embed3d/xtb",
    data=body, headers={"Content-Type": "application/json"})
try:
    print(urllib.request.urlopen(req, timeout=200).status)
except urllib.error.HTTPError as e:
    print(e.code)
except Exception:
    print("000")
PY
)
if [ "$embed_code" != "200" ]; then
    echo "Smoke test FAILED: /embed3d/xtb returned HTTP $embed_code. Output:" >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi
echo "    /embed3d/xtb(water) -> HTTP $embed_code"

# The IR endpoint takes the identical request body, so the same water is
# reused. This one is NOT redundant with the /embed3d/xtb check above: /ir
# runs a different xtb code path (--ohess tight, reading `vibspectrum`) and
# parses that file itself. A bundle whose xtb is fine but whose /ir parsing
# or --ohess handling is broken still answers /embed3d/xtb with 200, which is
# how a stale bundle once shipped with /ir missing entirely.
ir_result=$(MOLFILE="$MOLFILE" python3 - "$PORT" <<'PY' 2>/dev/null || echo "000|"
import json, os, sys, urllib.error, urllib.request
body = json.dumps({"molfile": os.environ["MOLFILE"], "charge": 0}).encode()
req = urllib.request.Request(
    f"http://localhost:{sys.argv[1]}/ir",
    data=body, headers={"Content-Type": "application/json"})
try:
    payload = urllib.request.urlopen(req, timeout=200).read()
    print("%d|%d" % (200, len(json.loads(payload).get("modes", []))))
except urllib.error.HTTPError as e:
    print("%d|" % e.code)
except Exception:
    print("000|")
PY
)
ir_code="${ir_result%%|*}"
ir_modes="${ir_result##*|}"

if [ "$ir_code" != "200" ]; then
    echo "Smoke test FAILED: /ir returned HTTP $ir_code. Output:" >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi

# Water has 3 vibrational modes, so a 200 with none of them means the
# vibspectrum file was produced but not parsed - a silent breakage that
# would otherwise surface as an empty spectrum in the UI.
if [ "$ir_modes" != "3" ]; then
    echo "Smoke test FAILED: /ir returned $ir_modes modes, expected 3 for" >&2
    echo "water. A 200 with no modes means parse_vibspectrum is not matching" >&2
    echo "this xtb version's output." >&2
    cat "$SMOKE_LOG" >&2
    exit 1
fi
echo "    /ir(water) -> HTTP $ir_code, $ir_modes modes"

smoke_stop
trap - EXIT

echo "==> Copying into $OUT"
rm -rf "$OUT"
cp -r "$SRC/dist/$BUNDLE" "$OUT"

echo "==> Done. $OUT/ is ready -- run npm run dist:linux."