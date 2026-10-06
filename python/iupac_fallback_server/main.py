"""
iupac_fallback_server: a small local companion service that gives
EnlaceCraft's IUPAC-naming feature a verified fallback for structures
PubChem's own on-the-fly naming can't handle.

Why this exists: PubChem's compound/smiles/property/IUPACName endpoint
reliably names a structure only once it's already indexed as a
Compound in PubChem's own ~120M-record database -- for a SMILES that
isn't already a known compound, several properties (IUPAC naming among
them, since it needs PubChem's own Lexichem/OEChem toolkit) are
documented as too expensive to compute on the fly, and the property
just comes back empty. A structure someone draws by hand -- especially
a less-common substitution pattern -- is often simply not already in
that index, with nothing wrong with the drawing itself.

This service closes that gap locally: NISPO (a rule-based, RDKit-driven
namer) generates a candidate name, and OPSIN (run via an embedded JVM,
see naming.py) independently re-parses that name back into a structure
to confirm it actually describes the same molecule before this ever
returns it. A name that doesn't round-trip is never returned -- see
naming.py's name_and_verify for exactly what's checked.

Run with:  uvicorn main:app --port 8002
(matches ../../src/io/iupacFallback.ts's IUPAC_FALLBACK_API_BASE)

When frozen with PyInstaller for a packaged Electron build, the
__main__ block below is the actual entry point instead of uvicorn's
own CLI (electron/iupac_fallback_server.cjs spawns the frozen
executable directly, passing --port itself, and polls /health exactly
the way electron/server.cjs and electron/structure3d_server.cjs already
do for the other two backends) -- see README.md's "Bundling for a
packaged Electron build" section for the freeze steps, including the
JRE this service needs bundled alongside it that the other two don't.

See README.md for setup, including the Java 8+ runtime OPSIN itself
needs in dev mode (separate from the Python dependencies in
requirements.txt; not needed by an end user of a packaged build, which
bundles its own).
"""

import argparse
import time
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from naming import NamingError, name_and_verify, start_jvm

ALLOWED_ORIGINS = frozenset([
    "file://",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
])

MAX_REQUEST_BYTES = 25 * 1024 * 1024

_rate_limit_log: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Starts the embedded JVM once, at process startup, rather than per
    # request -- see naming.py's start_jvm doc comment for why a
    # per-request JVM startup would make this service far too slow to
    # use from a live UI.
    start_jvm()
    yield


# Must come BEFORE security_middleware below. `@app.middleware` is a
# decorator, so the name `app` is looked up when the module is imported -
# if this line sat after the decorator, the frozen server would die at
# startup with "NameError: name 'app' is not defined" before uvicorn ever
# got a chance to bind a port.
app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Request too large"})

    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    _rate_limit_log[client_ip] = [
        t for t in _rate_limit_log[client_ip] if now - t < RATE_LIMIT_WINDOW_SECONDS
    ]
    if len(_rate_limit_log[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
    _rate_limit_log[client_ip].append(now)

    return await call_next(request)


class NameRequest(BaseModel):
    smiles: str


class NameResponse(BaseModel):
    smiles: str
    name: str


@app.get("/health")
def health() -> dict:
    # Polled by electron/iupac_fallback_server.cjs's waitForHealth() in
    # a packaged build, exactly like the other two bundled backends'
    # /health endpoints -- 200 here is what flips this service's status
    # from "starting" to "ready" for the renderer. Doesn't check the JVM
    # specifically: if start_jvm() failed during lifespan startup, the
    # process would already have crashed before ever binding this route,
    # so a reachable /health already implies a usable JVM.
    return {"status": "ok"}


@app.post("/name", response_model=NameResponse)
def name_endpoint(request: NameRequest) -> NameResponse:
    smiles = request.smiles.strip()
    if not smiles:
        raise HTTPException(status_code=400, detail="empty smiles")
    try:
        result = name_and_verify(smiles)
    except NamingError as exc:
        # Every NamingError reason maps to the same "couldn't produce a
        # verified name" outcome for the frontend (see
        # ../../src/io/iupacFallback.ts) -- the specific reason is
        # server-side detail only, not worth a richer error contract
        # for a single-purpose fallback endpoint nobody but this app's
        # own client calls.
        raise HTTPException(status_code=404, detail=exc.reason) from exc
    return NameResponse(**result)


if __name__ == "__main__":
    # This is what actually runs once frozen (see the PyInstaller spec)
    # -- electron/iupac_fallback_server.cjs spawns the frozen executable
    # with exactly this --port argument, same convention as the other
    # two bundled backends.
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8002)
    args = parser.parse_args()

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=args.port)
