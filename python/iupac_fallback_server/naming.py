"""
Core naming + verification logic for the IUPAC-naming fallback service.

The naming step (NISPO) and the verification step (OPSIN, via a
directly-embedded JVM) are kept separate from main.py's HTTP layer so
they can be exercised without spinning up FastAPI at all.

Why an embedded, kept-alive JVM rather than shelling out to OPSIN per
request (e.g. via py2opsin's default subprocess call): each subprocess
invocation pays a fresh JVM startup cost, which measured at roughly
1.3-1.5 seconds *per name* on a typical machine -- far too slow for a
synchronous naming request from a live UI (PubChem itself typically
answers in well under a second). Starting the JVM once, at server
startup, and reusing it for every request via a cached NameToStructure
instance drops per-request verification to single-digit milliseconds
after the first call. The jar itself is borrowed from the installed
py2opsin package (the same OPSIN release py2opsin would otherwise shell
out to) rather than bundling a second copy of it.
"""

import glob
import os
import sys
import threading

import jpype
import nispo
import py2opsin
from rdkit import Chem

_name_to_structure = None
# parseToSmiles calls are fast (single-digit ms) once the JVM is warm,
# so serializing them costs effectively nothing -- cheap insurance
# against relying on undocumented JNI thread-safety when FastAPI runs
# these requests from a threadpool.
_opsin_lock = threading.Lock()

# Upper bound on a name either direction will accept. Real systematic
# names are rarely over ~200 characters; anything near this is more
# likely a pasted paragraph than a molecule, and a definition-of-insanity
# input is exactly what you don't want to hand to a parser.
MAX_NAME_CHARS = 512


def _opsin_jar_path() -> str:
    """Locates the OPSIN jar bundled inside the installed py2opsin
    package, without hardcoding its version number (py2opsin bumps that
    on its own release schedule, independent of this project's).

    Works the same whether running from source or frozen with
    PyInstaller: the spec file's `datas` entry places the jar back at
    this same py2opsin-package-relative path inside the frozen bundle
    (see iupac_fallback_server.spec's comment on that), so
    `py2opsin.__file__`'s directory resolves correctly either way --
    PyInstaller rewrites that to point inside the frozen bundle
    automatically, no frozen-specific branch needed here.
    """
    package_dir = os.path.dirname(py2opsin.__file__)
    matches = glob.glob(os.path.join(package_dir, "opsin-cli-*-jar-with-dependencies.jar"))
    if not matches:
        raise RuntimeError(
            "Could not find the OPSIN jar inside the installed py2opsin "
            f"package ({package_dir}) -- has py2opsin's packaging changed?"
        )
    return matches[0]


def _bundled_jre_jvm_path() -> str | None:
    """Path to the JVM shared library inside the JRE bundled alongside
    a *frozen* build (see README.md's "Bundling for a packaged Electron
    build" section) -- None when running from source (`sys.frozen` is
    only set by PyInstaller), in which case start_jvm() below falls
    back to JPype's own auto-detection of a system-installed JRE/JDK,
    matching this project's documented dev-mode requirement of a plain
    "Java 8+ installed".

    A packaged end user has no such system Java, which is exactly why a
    frozen build needs its own JRE bundled next to the executable
    rather than relying on this function ever returning None for them.
    """
    if not getattr(sys, "frozen", False):
        return None
    exe_dir = os.path.dirname(sys.executable)
    if sys.platform == "win32":
        candidate = os.path.join(exe_dir, "jre", "bin", "server", "jvm.dll")
    else:
        candidate = os.path.join(exe_dir, "jre", "lib", "server", "libjvm.so")
    return candidate if os.path.exists(candidate) else None


def start_jvm() -> None:
    """Starts the embedded JVM and caches OPSIN's NameToStructure
    singleton, ready for repeated parseToSmiles calls.

    Call this once, at server startup (see main.py's lifespan handler).
    Calling it again after the JVM is already running is a harmless
    no-op, but starting a *second* JVM in the same process isn't
    possible at all (a JPype/JVM limitation) -- this must not be called
    per-request.
    """
    global _name_to_structure
    if _name_to_structure is not None:
        return
    if not jpype.isJVMStarted():
        jvm_path = _bundled_jre_jvm_path()
        if jvm_path:
            jpype.startJVM(jvm_path, classpath=[_opsin_jar_path()])
        else:
            jpype.startJVM(classpath=[_opsin_jar_path()])
    name_to_structure_class = jpype.JClass("uk.ac.cam.ch.wwmm.opsin.NameToStructure")
    _name_to_structure = name_to_structure_class.getInstance()


def _canonical_smiles(smiles: str) -> str | None:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    return Chem.MolToSmiles(mol, canonical=True)


class NamingError(Exception):
    """Raised for every failure mode below -- main.py maps all of them
    to the same 404 ("couldn't produce a verified name"), since none of
    them are actionable differently by the frontend. `reason` is kept
    only for server-side logging/debugging.
    """

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def name_and_verify(smiles: str) -> dict:
    """Generates a name for `smiles` with NISPO, then independently
    re-parses that name back into a structure with OPSIN and checks it
    against the original via RDKit canonical SMILES.

    Returns {"smiles": <canonical input>, "name": <name>} ONLY when
    that round-trip matches exactly -- raises NamingError for every
    other outcome (invalid input, NISPO producing nothing, or a name
    that doesn't parse back to the same structure), so a caller never
    receives a name this function hasn't itself confirmed.
    """
    if _name_to_structure is None:
        raise RuntimeError("start_jvm() must be called before name_and_verify()")

    input_canonical = _canonical_smiles(smiles)
    if input_canonical is None:
        raise NamingError("invalid_smiles")

    try:
        candidate_name = nispo.smiles_to_iupac(smiles)
    except Exception as exc:  # NISPO's own failure modes aren't documented
        raise NamingError(f"nispo_error: {exc}") from exc
    if not candidate_name:
        raise NamingError("no_name_generated")

    with _opsin_lock:
        try:
            roundtrip_smiles = _name_to_structure.parseToSmiles(candidate_name)
        except Exception as exc:
            raise NamingError(f"opsin_error: {exc}") from exc
    if not roundtrip_smiles:
        raise NamingError("name_did_not_parse")

    roundtrip_canonical = _canonical_smiles(str(roundtrip_smiles))
    if roundtrip_canonical != input_canonical:
        raise NamingError("roundtrip_mismatch")

    return {"smiles": input_canonical, "name": candidate_name}


def name_to_smiles(name: str) -> str:
    """Parses a chemical name into canonical SMILES with OPSIN -- the
    reverse direction of name_and_verify above, and the local half of the
    app's compound search (see main.py's /name-to-structure): PubChem
    resolves most names, but only ones already in its own index, while a
    perfectly well-formed systematic name it has never heard of is still
    parseable by OPSIN's grammar.

    Follows name_and_verify's all-failures-are-NamingError contract (which
    main.py maps to a single 404): empty or over-long input, OPSIN
    producing nothing, or an OPSIN result that RDKit can't canonicalize
    all raise NamingError rather than returning a partial answer.
    """
    if _name_to_structure is None:
        raise RuntimeError("start_jvm() must be called before name_to_smiles()")

    trimmed = name.strip()
    if not trimmed:
        raise NamingError("empty_name")
    if len(trimmed) > MAX_NAME_CHARS:
        raise NamingError("name_too_long")

    with _opsin_lock:
        try:
            smiles = _name_to_structure.parseToSmiles(trimmed)
        except Exception as exc:
            raise NamingError(f"opsin_error: {exc}") from exc
    if not smiles:
        # Like name_and_verify's roundtrip check: OPSIN signals "not a name
        # I understand" with an empty result rather than an exception.
        raise NamingError("name_did_not_parse")

    # Sanity check that OPSIN's output is actually something this app's own
    # importer would accept before handing it on -- defensive against a
    # parser bug surfacing as a corrupt structure on the canvas.
    canonical = _canonical_smiles(str(smiles))
    if not canonical:
        raise NamingError("unparseable_structure")
    return canonical
