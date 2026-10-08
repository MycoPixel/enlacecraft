"""
Standalone entry point for the NMRGraph prediction API - this is what
gets frozen into a single executable by PyInstaller (see
packaging/nmrgraph_server.spec), and what Electron's main.cjs spawns
as a background process.

Deliberately does NOT go through the `uvicorn` CLI (i.e. does not run
as `python -m uvicorn ...`) - console-script entry points are a
common source of headaches when freezing with PyInstaller. Calling
uvicorn.run() directly from a plain script is the more robust,
well-trodden pattern.

Also deliberately does NOT use --reload: that's a dev-only feature
(spawns a file-watcher + subprocess reloader) that doesn't make sense
for, and doesn't play well with, a single frozen executable.

Binds to 127.0.0.1 only, not 0.0.0.0 - this is a local backend for
the desktop app on the same machine, not meant to be reachable from
the network.

Usage (dev, from source):
    python server_entrypoint.py
    python server_entrypoint.py --port 8123

Usage (frozen):
    ./nmrgraph_server            (Linux)
    nmrgraph_server.exe          (Windows)
"""

import argparse
import sys

import uvicorn

from src.api.main import app


DEFAULT_PORT = 8000


def main():

    parser = argparse.ArgumentParser(description="Run the NMRGraph prediction API.")
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Port to listen on (default: {DEFAULT_PORT}).",
    )
    args = parser.parse_args()

    # Printed as a distinct, greppable line so Electron (or anyone
    # else launching this) has an unambiguous signal in stdout that
    # the server process started, independent of polling /health.
    print(f"NMRGRAPH_SERVER_STARTING port={args.port}", flush=True)

    try:
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=args.port,
            log_level="info",
        )
    except OSError as error:
        # Most common cause: the port's already in use (e.g. a dev
        # `uvicorn --reload` instance still running, or a previous
        # copy of this same frozen process that didn't exit cleanly).
        print(f"NMRGRAPH_SERVER_FAILED_TO_START: {error}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
