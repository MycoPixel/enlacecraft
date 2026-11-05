"""
One-off diagnostic for the "N/O showing up with 13C shifts, some C-H
carbons missing from 1H" bug report. Prints raw atom_index -> RDKit
element + shift, bypassing atomOrder/label mapping (that's a frontend
concern - this only tells us whether the backend itself is already
wrong before the frontend ever sees it).

Usage
-----
    python -m src.models.debug_report "SMILES_HERE"
"""

import sys

from rdkit import Chem

from src.models.multiplicity import canonical_ranks
from src.models.predict import (
    MODEL_PATH_H1_CH,
    MODEL_PATH,
    load_model,
    predict_spectrum,
)
from src.models.predict_multiplicity import predict_h1_with_multiplicity


def main():

    smiles = sys.argv[1]
    mol = Chem.MolFromSmiles(smiles)

    if mol is None:
        print(f"RDKit could not parse this SMILES at all: {smiles}")
        return

    print(f"SMILES: {smiles}")
    print(f"Parsed OK - {mol.GetNumAtoms()} heavy atoms")
    print()

    print("All heavy atoms (ground truth, straight from RDKit):")
    for atom in mol.GetAtoms():
        print(
            f"  atom_index {atom.GetIdx():>3}: {atom.GetSymbol():<2}  "
            f"numHs={atom.GetTotalNumHs()}  aromatic={atom.GetIsAromatic()}  "
            f"inRing={atom.IsInRing()}"
        )
    print()

    model_c13 = load_model(MODEL_PATH)
    model_h1 = load_model(MODEL_PATH_H1_CH)

    ranks = canonical_ranks(mol)

    print("predict_spectrum (13C) raw output:")
    spectrum = predict_spectrum(smiles, model_c13)
    for entry in spectrum:
        idx = entry["atom_index"]
        symbol = mol.GetAtomWithIdx(idx).GetSymbol()
        flag = "" if symbol == "C" else "  <-- NOT CARBON, SHOULD NOT BE HERE"
        print(
            f"  atom_index {idx:>3} ({symbol}): "
            f"{entry['predicted_shift_ppm']:7.2f} ppm  "
            f"rank={ranks[idx]}{flag}"
        )
    print()

    print("predict_h1_with_multiplicity (1H) raw output:")
    spectrum_h1 = predict_h1_with_multiplicity(smiles, model_h1)
    seen_idx = {e["atom_index"] for e in spectrum_h1}
    for entry in spectrum_h1:
        idx = entry["atom_index"]
        symbol = mol.GetAtomWithIdx(idx).GetSymbol()
        flag = "" if symbol == "C" else "  <-- NOT CARBON, SHOULD NOT BE HERE"
        print(
            f"  atom_index {idx:>3} ({symbol}): "
            f"{entry['predicted_shift_ppm']:6.2f} ppm  "
            f"{entry['multiplicity']}  rank={ranks[idx]}{flag}"
        )
    print()

    print("Carbon atoms bearing H that are MISSING from the 1H list above:")
    missing = [
        atom for atom in mol.GetAtoms()
        if atom.GetSymbol() == "C" and atom.GetTotalNumHs() > 0 and atom.GetIdx() not in seen_idx
    ]
    if not missing:
        print("  (none - every C-H carbon is accounted for)")
    for atom in missing:
        print(f"  atom_index {atom.GetIdx():>3}: C, numHs={atom.GetTotalNumHs()}")
    print()

    print("Duplicate rank collisions (would explain merged labels like 'C5, N1'):")
    rank_to_atoms = {}
    for atom in mol.GetAtoms():
        rank_to_atoms.setdefault(ranks[atom.GetIdx()], []).append(atom)
    found_collision = False
    for rank, atoms in rank_to_atoms.items():
        symbols = {a.GetSymbol() for a in atoms}
        if len(symbols) > 1:
            found_collision = True
            print(
                f"  rank {rank}: "
                + ", ".join(f"atom_index {a.GetIdx()} ({a.GetSymbol()})" for a in atoms)
            )
    if not found_collision:
        print("  (none - no rank is shared across different elements)")


if __name__ == "__main__":
    main()
