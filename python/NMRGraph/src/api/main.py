"""
Small HTTP API wrapping the trained GNN, for EnlaceCraft (or anything
else) to call.

Run it:
    pip install fastapi uvicorn[standard]
    uvicorn src.api.main:app --reload --port 8000

Then:
    POST http://localhost:8000/predict
    {"smiles": "CCO"}

    ->

    {
      "smiles": "CCO",
      "results": [
        {
          "smiles": "CCO",
          "predictions": [
            {"atom_index": 0, "predicted_shift_ppm": 17.18, "equivalence_group": 0},
            {"atom_index": 1, "predicted_shift_ppm": 58.91, "equivalence_group": 1}
          ],
          "predictions_h1": [
            {"atom_index": 0, "predicted_shift_ppm": 1.21, "num_hs": 3, "multiplicity": "t", "multiplicity_detail": "", "equivalence_group": 0},
            {"atom_index": 1, "predicted_shift_ppm": 3.69, "num_hs": 2, "multiplicity": "q", "multiplicity_detail": "", "equivalence_group": 1}
          ]
        }
      ],
      "warnings": []
    }

results has more than one entry when the input SMILES has unassigned
ring stereocenters (no @/@@ tags) - rather than silently blending
what could be physically distinct diastereomers (e.g. cis/trans)
into one ambiguous number, every fully-defined isomer is enumerated
(coupling_karplus.enumerate_stereoisomers) and predicted separately,
so the caller gets N complete, individually correct result sets
instead of one questionable average. Each result's own "smiles"
field is the fully-defined isomer SMILES it was computed from (all
entries share the same atom_index numbering, since enumeration only
changes stereo tags, not atom order).

multiplicity is s/d/t/dd/td/... - see
src/models/predict_multiplicity.py's module docstring for the full
tier 1 (topology n+1 rule) / tier 2 (conformer + Karplus, for ring
atoms and atoms near a defined stereocenter) routing rule.

equivalence_group groups constitutionally-equivalent atoms (e.g. a
tert-butyl group's 3 methyl carbons) - see ShiftPrediction's field
docstring. Purely a display grouping hint for callers, not used by
the prediction logic itself.

Both models are loaded once at startup (not per-request) since
loading a checkpoint from disk on every call would make each
prediction far slower than it needs to be.

1H predictions use the carbon-attached-only checkpoint
(gnn_h1_ch_v1.pt) rather than the all-protons one - see the
carbon_only docstring on predict_h1_spectrum for why: the
all-protons model's O-H/N-H/S-H predictions are inherently ~4x
noisier (no fixed concentration/solvent/temperature), so this API
deliberately only ever returns the more reliable C-H shifts.
"""

import time
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from rdkit import Chem

from src.data.geometry import parse_molfile_with_coords
from src.models.coupling_karplus import (
    enumerate_stereoisomers,
    unassigned_stereo_elements,
)
from src.models.multiplicity import canonical_ranks
from src.models.predict import (
    MODEL_PATH_H1_CH,
    find_unusual_elements,
    load_model,
    predict_spectrum,
)
from src.models.predict_multiplicity import predict_h1_with_multiplicity

# Hard cap on how many stereoisomers a single ambiguous SMILES can
# expand into - protects against a pathological input (many
# unassigned centers) turning one request into dozens of slow tier 2
# conformer-generation calls. Matches
# enumerate_stereoisomers's own default.
MAX_ISOMERS = 8


# Loaded once, at process startup - see the lifespan handler below.
_model = None
_model_h1 = None


@asynccontextmanager
async def lifespan(app: FastAPI):

    global _model, _model_h1
    _model = load_model()
    _model_h1 = load_model(MODEL_PATH_H1_CH)

    yield

    _model = None
    _model_h1 = None


app = FastAPI(title="NMRGraph API", lifespan=lifespan)

ALLOWED_ORIGINS = frozenset([
    "file://",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_ORIGINS),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

MAX_REQUEST_BYTES = 25 * 1024 * 1024

_rate_limit_log: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30


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


class PredictRequest(BaseModel):
    smiles: str
    # Optional V2000 molfile with explicit Hs and real 3D coordinates
    # (e.g. EnlaceCraft's embed3d.ts "mmff94" output, or the more
    # accurate xtbRefine.ts-refined structure - see io/xtbRefine.ts on
    # that side, geometry.parse_molfile_with_coords on this one).
    # When present, this REPLACES smiles as the source of both
    # connectivity and geometry for shift prediction (smiles is still
    # required and used for tier 2 multiplicity/Karplus, which does
    # its own separate embedding for a different physical purpose -
    # see predict_h1_with_multiplicity) - real 3D coordinates already
    # fully determine stereochemistry, so the usual "unassigned ring
    # stereocenter -> enumerate all isomers" flow below is skipped
    # entirely for this path; there's nothing ambiguous left to
    # enumerate.
    molfile: str | None = None


class ShiftPrediction(BaseModel):
    atom_index: int
    predicted_shift_ppm: float
    # Atoms sharing the same equivalence_group are constitutionally
    # symmetry-equivalent (RDKit canonical ranking, no stereo
    # considered - see multiplicity.canonical_ranks) - e.g. the 3
    # methyl carbons of a tert-butyl group. Same value for a given
    # atom across both this and H1ShiftPrediction, and stable across
    # different isomers of the same molecule (equivalence depends
    # only on the 2D graph, not stereo). Purely a grouping hint for
    # display - group rows sharing this value into one line (e.g.
    # "9H, 0.90 ppm (s)") the way a real NMR report would, rather
    # than one row per atom.
    equivalence_group: int


class H1ShiftPrediction(BaseModel):
    atom_index: int
    predicted_shift_ppm: float
    # Number of protons this one shift represents (equivalent protons
    # on the same heavy atom are averaged into a single value - see
    # predict_h1_spectrum's docstring). A CH2 or CH3 group reports one
    # row here, not two or three.
    num_hs: int
    # See ShiftPrediction.equivalence_group - same meaning, same
    # value for a given atom index across both models.
    equivalence_group: int
    # s/d/t/dd/td/... - tier 1 (topology n+1 rule) for acyclic and
    # aromatic atoms, tier 2 (conformer + Karplus) automatically for
    # non-aromatic ring atoms and atoms near a defined stereocenter -
    # see src/models/predict_multiplicity.py's module docstring for
    # the full routing rule and validation notes.
    multiplicity: str
    # Human-readable detail behind the label - e.g. tier 2's
    # per-neighbor J values in Hz, or tier 1's caveat notes (fine
    # structure collapsed into a single-J approximation, etc). Empty
    # string when there's nothing extra to say.
    multiplicity_detail: str = ""
    # Raw, unclustered J values (Hz) behind the multiplicity label -
    # only ever populated for tier 2 atoms (ring/stereocenter
    # geometry); empty for tier 1, which has no real coupling
    # magnitude estimate, only a topological count. Intended for
    # building an illustrative simulated spectrum client-side - a
    # frontend doing that should fall back to a default J per implied
    # coupling partner (inferred from the multiplicity label) when
    # this is empty, and should mark tier 1-derived peaks as
    # illustrative rather than measured.
    coupling_hz: list[float] = []


class IsomerResult(BaseModel):
    # The fully-defined isomer SMILES this result was computed from -
    # identical to the top-level request smiles when there was
    # nothing ambiguous to resolve, otherwise one specific resolved
    # stereoisomer (see PredictResponse.results).
    smiles: str
    predictions: list[ShiftPrediction]
    predictions_h1: list[H1ShiftPrediction]


class PredictResponse(BaseModel):
    smiles: str
    results: list[IsomerResult]
    warnings: list[str]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": _model is not None and _model_h1 is not None,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):

    smiles = request.smiles.strip()

    if not smiles:
        raise HTTPException(status_code=400, detail="smiles must not be empty")

    mol = Chem.MolFromSmiles(smiles)

    if mol is None:
        raise HTTPException(
            status_code=400,
            detail=f"Could not parse SMILES: {smiles}",
        )

    warnings = []

    unusual_elements = find_unusual_elements(mol)
    if unusual_elements:
        warnings.append(
            f"Contains {', '.join(sorted(unusual_elements))} - rarely seen "
            "in training data (organometallics and unusual elements are a "
            "known weak spot). Treat these predictions with extra "
            "skepticism."
        )

    if mol.GetNumAtoms() == 0:
        raise HTTPException(
            status_code=400, detail="Molecule has no atoms."
        )

    carbon_count = sum(
        1 for atom in mol.GetAtoms() if atom.GetSymbol() == "C"
    )
    if carbon_count == 0:
        warnings.append("No carbon atoms in this molecule - nothing to predict.")

    molfile_mol = None
    molfile_geo_coords = None
    molfile_smiles = None

    if request.molfile is not None:
        try:
            molfile_mol, molfile_geo_coords, molfile_smiles = parse_molfile_with_coords(
                request.molfile
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))

    if molfile_mol is not None:
        # Real 3D coordinates already fully determine stereochemistry
        # (parse_molfile_with_coords already called
        # AssignStereochemistryFrom3D) - there's no "which
        # stereoisomer did you mean" ambiguity the way there is
        # starting from a bare 2D SMILES with unspecified ring
        # stereocenters, so the usual enumerate_stereoisomers flow
        # below is entirely skipped. Exactly one isomer entry, using
        # the molfile's own real geometry rather than a fresh MMFF
        # embed.
        isomer_entries = [(molfile_smiles, molfile_mol, molfile_geo_coords)]
    else:
        # Every kind of unspecified stereochemistry, not just tetrahedral
        # centres: an alkene drawn without E/Z marks is as ambiguous as an
        # unmarked ring stereocentre, and in a 2D sketching tool it is the
        # commoner of the two. Gating on tetrahedral centres alone returned one
        # blended prediction for two different compounds with no warning.
        unassigned = unassigned_stereo_elements(mol)
        isomer_smiles_list = [smiles]

        if unassigned:
            isomer_smiles_list = enumerate_stereoisomers(smiles, max_isomers=MAX_ISOMERS)
            kinds = {kind for kind, _ in unassigned}
            if kinds == {"bond"}:
                what = "double-bond geometry that isn't specified (cis/trans not indicated)"
            elif kinds == {"atom"}:
                what = "stereocentres that aren't fully specified (no wedge/dash indicated)"
            else:
                what = "stereochemistry that isn't fully specified (cis/trans and/or wedge/dash not indicated)"
            warnings.append(
                f"This structure has {what} - showing all "
                f"{len(isomer_smiles_list)} possible stereoisomer(s) below "
                "instead of one ambiguous averaged result. Draw the specific "
                "stereochemistry instead if you already know which one you want."
            )

        # geo_coords left as None here on purpose - predict_spectrum
        # embeds live per isomer when it's not given one (see its
        # docstring), same as before this endpoint accepted molfile
        # input at all.
        isomer_entries = [
            (isomer_smiles, Chem.MolFromSmiles(isomer_smiles), None)
            for isomer_smiles in isomer_smiles_list
        ]

    def _reported_atom_index(atom):
        # See enumerate_stereoisomers's docstring: a re-parsed isomer's
        # RAW atom index isn't guaranteed to match the original request
        # SMILES's atom order once that isomer went through RDKit's
        # writer, so the map number (which does survive the round-trip)
        # is the only reliable way back to "which atom the frontend
        # actually meant." Falls back to the raw index when there's no
        # map number - the no-ambiguity path never adds one, since it
        # returns the original request string untouched, where raw
        # index was already correct by construction.
        map_num = atom.GetAtomMapNum()
        return map_num - 1 if map_num > 0 else atom.GetIdx()

    def _display_smiles(mol):
        # Strips map numbers before handing a SMILES back to the
        # caller for display (e.g. EnlaceCraft's isomer picker) -
        # they're purely internal bookkeeping and would otherwise show
        # up as ugly, confusing bracket annotations like "[CH:6]".
        clean = Chem.Mol(mol)
        for atom in clean.GetAtoms():
            atom.SetAtomMapNum(0)
        return Chem.MolToSmiles(clean)

    results = []

    try:
        for isomer_smiles, isomer_mol, geo_coords in isomer_entries:
            # Constitutional (non-stereo) equivalence only - same value
            # for a given atom regardless of which isomer we're in,
            # since ring-stereo enumeration never changes 2D
            # connectivity, only stereo tags. Keyed by RAW index here
            # (isomer_mol's own indexing), matching entry["atom_index"]
            # below before that gets translated for the response.
            # Computed once per isomer rather than reused across
            # isomers purely for simplicity/robustness - it's cheap.
            ranks = canonical_ranks(isomer_mol)

            spectrum = predict_spectrum(
                isomer_smiles, _model, mol=isomer_mol, geo_coords=geo_coords
            )
            # Includes multiplicity (tier 1 n+1 rule / tier 2 conformer +
            # Karplus, auto-selected per atom) alongside the shift - see
            # predict_h1_with_multiplicity's docstring. Ring-containing
            # molecules pay for conformer generation here (tier 2), which
            # is noticeably slower than a plain shift-only lookup - and
            # this now happens once PER enumerated isomer, so an
            # ambiguous ring molecule is proportionally slower still.
            # mol=isomer_mol here is NOT optional the way it might look -
            # see predict_h1_with_multiplicity's docstring: without it,
            # atom_index below silently comes back in isomer_smiles's
            # OWN (canonical, molfile-request-only-different) atom
            # order rather than isomer_mol's, so every shift gets
            # attributed to the wrong atom once looked up against
            # isomer_mol two lines below. Tier 2's own conformer
            # ensemble is still SMILES-only regardless (see that
            # docstring's "known residual gap" paragraph) - wiring the
            # molfile's real geometry into tier 2 too is a further
            # follow-up, not done in this pass.
            spectrum_h1 = predict_h1_with_multiplicity(
                isomer_smiles, _model_h1, mol=isomer_mol, geo_coords=geo_coords
            )
            results.append(
                IsomerResult(
                    smiles=_display_smiles(isomer_mol),
                    predictions=[
                        ShiftPrediction(
                            atom_index=_reported_atom_index(
                                isomer_mol.GetAtomWithIdx(entry["atom_index"])
                            ),
                            predicted_shift_ppm=entry["predicted_shift_ppm"],
                            equivalence_group=ranks[entry["atom_index"]],
                        )
                        for entry in spectrum
                    ],
                    predictions_h1=[
                        H1ShiftPrediction(
                            atom_index=_reported_atom_index(
                                isomer_mol.GetAtomWithIdx(entry["atom_index"])
                            ),
                            predicted_shift_ppm=entry["predicted_shift_ppm"],
                            num_hs=entry["num_hs"],
                            multiplicity=entry["multiplicity"],
                            multiplicity_detail=entry["multiplicity_detail"],
                            coupling_hz=entry["coupling_hz"],
                            equivalence_group=ranks[entry["atom_index"]],
                        )
                        for entry in spectrum_h1
                    ],
                )
            )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    return PredictResponse(
        smiles=smiles,
        results=results,
        warnings=warnings,
    )
