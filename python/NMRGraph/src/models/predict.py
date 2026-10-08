"""
Inference: given one or more SMILES strings, predict the 13C NMR
spectrum (one shift per carbon atom) using the trained GNN.

Usage
-----
    python -m src.models.predict "CCO"
    python -m src.models.predict "CC(=O)OC1=CC=CC=C1C(=O)O" "c1ccccc1"
"""

import argparse
from pathlib import Path

import torch
from rdkit import Chem

from src.data.geometry import embed_heavy_atom_coords
from src.data.graph_dataset import (
    ELEMENTS,
    collate_graphs,
    collate_graphs_h1,
    mol_to_graph,
)
from src.models.gnn import NMRGNN
from src.paths import resolve_path


MODEL_PATH = resolve_path("data", "models", "gnn_v1.pt")
MODEL_PATH_H1_ALL = resolve_path("data", "models", "gnn_h1_v1.pt")
MODEL_PATH_H1_CH = resolve_path("data", "models", "gnn_h1_ch_v1.pt")
# Kept as an alias so anything already importing MODEL_PATH_H1 (e.g.
# sanity_check.py before this change) still works.
MODEL_PATH_H1 = MODEL_PATH_H1_ALL

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_model(model_path=MODEL_PATH):

    model = NMRGNN().to(DEVICE)
    model.load_state_dict(torch.load(model_path, map_location=DEVICE))
    model.eval()

    return model


def find_unusual_elements(mol):
    """
    Elements present in `mol` that aren't in the training vocabulary
    (ELEMENTS in graph_dataset.py) - organometallics and other rare
    elements the model has essentially never learned properly. Used
    by both the CLI and the API to flag low-confidence predictions.
    """

    return {
        atom.GetSymbol()
        for atom in mol.GetAtoms()
        if atom.GetSymbol() not in ELEMENTS
    }


def predict_spectrum(smiles, model, mol=None, geo_coords=None):
    """
    Returns a list of dicts, one per carbon atom:
        {"atom_index": int, "predicted_shift_ppm": float}

    atom_index refers to the atom's index in the RDKit mol as parsed
    from the SMILES (implicit Hs, same convention used during
    training), so you can map it back with
    mol.GetAtomWithIdx(atom_index) if needed.

    mol, geo_coords : optional
        Pass both together to use an already-parsed mol with known
        geometry (e.g. from geometry.parse_molfile_with_coords, for a
        caller that already has a real 3D structure - see
        src/api/main.py's molfile request path) instead of parsing
        `smiles` and embedding a fresh MMFF conformer here. The two
        are independent: passing only `mol` (geo_coords left as
        None) still embeds live for you, using the mol you gave
        instead of re-parsing smiles - useful for a caller that
        already has a parsed mol for some other reason (e.g. computing
        canonical_ranks from it) and doesn't want to parse smiles
        twice, but has no geometry of its own to offer. When both are
        omitted (the default), behavior is unchanged from before
        these parameters existed: parse smiles, embed live.
    """

    if mol is None:

        mol = Chem.MolFromSmiles(smiles)

        if mol is None:
            raise ValueError(f"Could not parse SMILES: {smiles}")

    # IMPORTANT: do NOT call Chem.AddHs() here. NMRShiftDB's SDF only
    # encodes heavy atoms - hydrogens are implicit throughout training
    # (removeHs=False in nmrshiftdb.py just means "don't strip Hs if
    # present", it doesn't add them; none were present in the file).
    # Adding explicit H nodes here would give the model a graph shape
    # it never saw in training, which is exactly what caused the bad
    # predictions on sp3 carbons (ethanol, aspirin's acetyl CH3, etc).

    if geo_coords is None:
        # Since gnn_v1.pt is now trained with the through-space
        # geometric channel (see src/data/geometry.py), inference
        # needs it too - a model trained WITH geometric edges but
        # queried WITHOUT them is being asked to predict on a shape of
        # input it never actually saw during training (adjacency
        # channel present but always zero, rather than simply absent),
        # which is a distribution mismatch, not a neutral "just skip
        # this feature". There's no precomputed cache for an arbitrary
        # one-off SMILES (the cache in geometry_cache.pkl only covers
        # NMRShiftDB training molecules), so embed on the fly here
        # instead. Same graceful fallback as training: if embedding
        # fails (organometallics, disconnected structures, etc - see
        # geometry.py), geo_coords is None and the molecule just gets
        # an empty geometric channel, matching how such molecules were
        # handled during training. This condition is checked
        # independently of whether `mol` was pre-supplied (see above),
        # so a caller that passes a pre-parsed mol but no coordinates
        # still gets a live embed, not a silently-empty geo channel.
        geo_coords = embed_heavy_atom_coords(mol)

    graph = mol_to_graph(mol, db_id=0, smiles=smiles, geo_coords=geo_coords)

    node_features, adjacency, _, _, atom_mask = collate_graphs([graph])

    node_features = node_features.to(DEVICE)
    adjacency = adjacency.to(DEVICE)
    atom_mask = atom_mask.to(DEVICE)

    with torch.no_grad():
        predictions = model(node_features, adjacency, atom_mask)

    predictions = predictions[0].cpu().tolist()

    results = []

    for atom in mol.GetAtoms():

        if atom.GetSymbol() != "C":
            # The model only has meaningful predictions for carbons -
            # that's the only atom type it saw a loss signal for.
            continue

        results.append(
            {
                "atom_index": atom.GetIdx(),
                "predicted_shift_ppm": round(
                    predictions[atom.GetIdx()], 2
                ),
            }
        )

    return results


def predict_h1_spectrum(smiles, model, carbon_only=True, mol=None, geo_coords=None):
    """
    Same idea as predict_spectrum, but for 1H shifts. Returns a list
    of dicts, one per qualifying heavy atom:
        {"atom_index": int, "predicted_shift_ppm": float, "num_hs": int}

    carbon_only : bool, default True
        If True (matches the gnn_h1_ch_v1.pt checkpoint, the
        recommended default - see train_gnn_h1_ch.py), only returns
        carbon-attached protons and skips O-H/N-H/S-H entirely. That
        model was never trained on exchangeable-proton targets, so
        asking it for one wouldn't just be "low confidence" - it
        would be a number the model has no basis for at all.
        Set False ONLY when `model` is the all-protons checkpoint
        (gnn_h1_v1.pt / MODEL_PATH_H1_ALL), to also get O-H/N-H
        predictions - these are inherently ~4x noisier even in
        training (see evaluate_gnn_h1.py's exchangeable-vs-C-H
        breakdown), since a database can only record one number for
        something whose real shift depends on concentration/solvent/
        temperature. Treat them as a rough ballpark, not a real value.

    mol, geo_coords : optional
        See predict_spectrum's docstring - same meaning here.

    Reminder: since equivalent protons on the same atom were averaged
    into one training target (see parse_h1_signals in nmrshiftdb.py),
    this returns ONE shift per heavy atom, not one per individual
    proton. A CH2 or CH3 group's predicted shift represents the
    average of its attached protons, not separately resolved signals.
    """

    if mol is None:

        mol = Chem.MolFromSmiles(smiles)

        if mol is None:
            raise ValueError(f"Could not parse SMILES: {smiles}")

    # Same AddHs warning as predict_spectrum applies here too - do
    # not call Chem.AddHs() before mol_to_graph.

    if geo_coords is None:
        # Same reasoning as predict_spectrum: both gnn_h1_ch_v1.pt and
        # gnn_h1_v1.pt are 5-relation checkpoints now, so inference
        # needs live geometry too, not just training. Checked
        # independently of whether `mol` was pre-supplied - see
        # predict_spectrum's docstring.
        geo_coords = embed_heavy_atom_coords(mol)

    graph = mol_to_graph(mol, db_id=0, smiles=smiles, geo_coords=geo_coords)

    node_features, adjacency, _, _, atom_mask = collate_graphs_h1([graph])

    node_features = node_features.to(DEVICE)
    adjacency = adjacency.to(DEVICE)
    atom_mask = atom_mask.to(DEVICE)

    with torch.no_grad():
        predictions = model(node_features, adjacency, atom_mask)

    predictions = predictions[0].cpu().tolist()

    results = []

    for atom in mol.GetAtoms():

        num_hs = atom.GetTotalNumHs()

        if num_hs == 0:
            # No attached protons on this atom -> nothing to predict,
            # same reasoning as skipping non-carbons in predict_spectrum.
            continue

        if carbon_only and atom.GetSymbol() != "C":
            continue

        results.append(
            {
                "atom_index": atom.GetIdx(),
                "predicted_shift_ppm": round(
                    predictions[atom.GetIdx()], 2
                ),
                "num_hs": num_hs,
            }
        )

    return results


def _print_c13(smiles, model):

    try:
        mol_check = Chem.MolFromSmiles(smiles)
        if mol_check is not None:
            unusual = find_unusual_elements(mol_check)
            if unusual:
                print(
                    f"  Warning: contains {', '.join(sorted(unusual))} - "
                    "rarely seen in training data (organometallics and "
                    "unusual elements are a known weak spot). Treat "
                    "these predictions with extra skepticism."
                )
        spectrum = predict_spectrum(smiles, model)
    except ValueError as error:
        print(f"  {error}")
        return

    print("  13C:")
    for entry in sorted(
        spectrum, key=lambda e: e["predicted_shift_ppm"], reverse=True
    ):
        print(
            f"    atom {entry['atom_index']:>3}: "
            f"{entry['predicted_shift_ppm']:7.2f} ppm"
        )


def _print_h1(smiles, model, carbon_only=True):

    try:
        spectrum = predict_h1_spectrum(smiles, model, carbon_only=carbon_only)
    except ValueError as error:
        print(f"  {error}")
        return

    print("  1H:")
    for entry in sorted(
        spectrum, key=lambda e: e["predicted_shift_ppm"], reverse=True
    ):
        print(
            f"    atom {entry['atom_index']:>3} "
            f"({entry['num_hs']}H): "
            f"{entry['predicted_shift_ppm']:6.2f} ppm"
        )


def main():

    parser = argparse.ArgumentParser(
        description="Predict NMR shifts for one or more molecules."
    )
    parser.add_argument(
        "smiles",
        nargs="+",
        help="One or more SMILES strings, space-separated.",
    )
    parser.add_argument(
        "--nucleus",
        choices=["13c", "1h", "both"],
        default="13c",
        help="Which nucleus to predict shifts for (default: 13c).",
    )
    parser.add_argument(
        "--model",
        default=str(MODEL_PATH),
        help=f"Path to the 13C GNN checkpoint (default: {MODEL_PATH})",
    )
    parser.add_argument(
        "--h1-include-exchangeable",
        action="store_true",
        help=(
            "Also attempt O-H/N-H/S-H predictions, using the "
            f"all-protons checkpoint ({MODEL_PATH_H1_ALL}) instead of "
            f"the default C-H-only one ({MODEL_PATH_H1_CH}). Off by "
            "default: exchangeable protons had ~4x higher error in "
            "testing (0.97 vs 0.25 ppm MAE), since their real shift "
            "depends on concentration/solvent/temperature - treat "
            "these as a rough ballpark at best, not a real number."
        ),
    )
    parser.add_argument(
        "--model-h1",
        default=None,
        help=(
            "Path to a specific 1H GNN checkpoint, overriding the "
            f"default choice of {MODEL_PATH_H1_CH} (or "
            f"{MODEL_PATH_H1_ALL} if --h1-include-exchangeable is set)."
        ),
    )

    args = parser.parse_args()

    model_c13 = None
    model_h1 = None
    h1_carbon_only = not args.h1_include_exchangeable

    if args.nucleus in ("13c", "both"):
        model_c13 = load_model(Path(args.model))

    if args.nucleus in ("1h", "both"):
        if args.model_h1 is not None:
            h1_path = Path(args.model_h1)
        elif args.h1_include_exchangeable:
            h1_path = MODEL_PATH_H1_ALL
        else:
            h1_path = MODEL_PATH_H1_CH
        model_h1 = load_model(h1_path)

    for smiles in args.smiles:

        print(f"SMILES: {smiles}")
        print("-" * (8 + len(smiles)))

        if model_c13 is not None:
            _print_c13(smiles, model_c13)

        if model_h1 is not None:
            _print_h1(smiles, model_h1, carbon_only=h1_carbon_only)

        print()


if __name__ == "__main__":
    main()
