#!/usr/bin/env bash
# Shared helpers for the python/freeze_*.sh container build scripts.
#
# Sourced, not executed - each freeze_*.sh sources this and then does its
# own backend-specific freeze/bundle/smoke steps.
#
# The point of this file is that the glibc verification and the HTTP smoke
# test are the two pieces that are easy to get subtly wrong, and getting
# them wrong is expensive: a false PASS ships a bundle that dies on every
# user's machine, and a false FAIL blocks a legitimate release. Having one
# copy of each means a fix applies everywhere at once.

# Single source of truth for the glibc floor every Linux freeze targets.
# Must match the base image in python/Dockerfile.* - ubuntu:20.04 is
# glibc 2.31. The verify function below fails the build if the two ever
# disagree in effect, which is what catches a botched bump.
MAX_GLIBC="2.31"

require_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        echo "ERROR: docker is required but wasn't found on PATH." >&2
        echo "       The freeze has to run inside the pinned container - see" >&2
        echo "       python/Dockerfile.* for why there's no host-side fallback." >&2
        exit 1
    fi
}

# Freeze a backend inside its pinned container.
#
#   freeze_in_container <image> <source-dir> <bundle-name> <spec> [extra sh]
#
# <source-dir> and <bundle-name> are relative to the repo root, e.g.
# python/structure3d_server and structure3d_server.
#
# The three odd-looking details here are all deliberate, and each one was a
# real bug found by actually running this:
#
#  - The rm happens *inside* the container. A previous run's output is
#    root-owned (the container runs as root), so a host-side `rm -rf` fails
#    with "Permission denied" and can't clean up its own mess.
#
#  - The trailing chmod fixes ownership at the source. Without it the
#    host-side steps that follow (copying checkpoints in, copying to
#    resources/) can't write to root-owned directories, and there's no
#    sudo available to chown them.
#
#  - `micromamba run` is NOT used as the entrypoint directly; it's invoked
#    from a plain `sh -c` instead, so we can chain the chmod with `&&`.
#    Running micromamba run directly leaves the container's exit status
#    unmapped to the actual pyinstaller result in some micromamba versions.
freeze_in_container() {
    local image="$1" src="$2" bundle="$3" spec="$4" extra="${5:-}"

    echo "==> Freezing $bundle inside the container"
    mkdir -p "$src/dist"
    docker run --rm \
        -v "$(pwd)/$src/dist:/src/dist" \
        "$image" \
        sh -c "set -e
            rm -rf /src/dist/* /src/dist/.[!.]* 2>/dev/null || true
            /opt/bin/micromamba run -n build \
                pyinstaller --noconfirm $spec
            ${extra}
            chmod -R a+rwX /src/dist"

    if [ ! -x "$src/dist/$bundle/$bundle" ]; then
        echo "ERROR: freeze produced no executable at $src/dist/$bundle/" >&2
        exit 1
    fi
}

# verify_glibc_floor <bundle-dir>
#
# Scans every shared object plus the frozen bootloader for the highest
# GLIBC_* version symbol any of them requires. That's the real compatibility
# floor of the bundle - the thing that shipped broken in 1.7.1, where the
# whole app died with "GLIBC_2.44 not found" on a glibc-2.43 machine.
#
# Scans file-by-file rather than piping one big `objdump` through xargs: a
# broad file filter also matches non-ELF files (checkpoints, data files),
# objdump exits non-zero on those, xargs reports 123, and under
# `set -e` + `pipefail` that kills the script before it can print a verdict
# - silently, which is exactly how it failed the first time.
verify_glibc_floor() {
    local dir="$1"

    if ! command -v objdump >/dev/null 2>&1; then
        echo "ERROR: objdump (binutils) is required to verify the glibc floor." >&2
        exit 1
    fi

    # Match *.so* by name regardless of mode bits - a shared object doesn't
    # need the executable bit to set the compatibility floor.
    local max_glibc
    max_glibc=$(find "$dir" -type f -name '*.so*' -print0 \
        | xargs -0 -r objdump -T 2>/dev/null || true)

    # The frozen bootloader itself usually isn't named *.so*, so include the
    # top-level executable explicitly.
    max_glibc="$max_glibc
$(objdump -T "$dir/$(basename "$dir")" 2>/dev/null || true)"

    max_glibc=$(printf '%s' "$max_glibc" \
        | grep -o 'GLIBC_[0-9][0-9.]*' \
        | sort -V | uniq | tail -1 || true)

    if [ -z "$max_glibc" ]; then
        echo "ERROR: couldn't determine the glibc requirement of $dir." >&2
        exit 1
    fi
    echo "    highest GLIBC symbol required: $max_glibc"

    if [ "$(printf '%s\n' "$max_glibc" "GLIBC_${MAX_GLIBC}" | sort -V | tail -1)" != "GLIBC_${MAX_GLIBC}" ]; then
        echo "ERROR: bundle requires $max_glibc, above the GLIBC_${MAX_GLIBC} target." >&2
        echo "       The container's base image is too new - see python/Dockerfile.*." >&2
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# HTTP smoke test
# ---------------------------------------------------------------------------
#
# Starts a frozen server, waits for /health, runs a caller-supplied request
# and asserts on the response, then shuts it down. The backend-specific
# scripts define SMOKE_ASSERT to do the actual request+check.

SMOKE_PID=""
SMOKE_LOG=""

smoke_start() {
    local exe="$1" port="$2"

    SMOKE_LOG=$(mktemp)
    "$exe" --port "$port" >"$SMOKE_LOG" 2>&1 &
    SMOKE_PID=$!
    trap 'smoke_stop' EXIT

    echo "==> Smoke-testing $(basename "$exe")"
}

# Returns 0 once /health answers 200, 1 on timeout (having dumped the log).
smoke_wait_healthy() {
    local port="$1"

    for _ in $(seq 1 60); do
        if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port/health" 2>/dev/null)" = "200" ]; then
            return 0
        fi
        sleep 0.5
    done

    echo "Smoke test FAILED: server never became healthy. Output:" >&2
    cat "$SMOKE_LOG" >&2
    return 1
}

smoke_stop() {
    if [ -n "$SMOKE_PID" ]; then
        kill "$SMOKE_PID" 2>/dev/null || true
        SMOKE_PID=""
    fi
    if [ -n "$SMOKE_LOG" ]; then
        rm -f "$SMOKE_LOG"
        SMOKE_LOG=""
    fi
}

# post <port> <path> <json-body> -> prints "HTTP <code>" and the body
smoke_post() {
    local port="$1" path="$2" body="$3"
    local tmp
    tmp=$(mktemp)
    local code
    code=$(curl -s -o "$tmp" -w '%{http_code}' -X POST "http://localhost:$port$path" \
        -H "Content-Type: application/json" -d "$body")
    printf '%s\n' "$code"
    cat "$tmp"
    rm -f "$tmp"
}