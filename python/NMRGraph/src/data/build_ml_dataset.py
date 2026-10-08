from pathlib import Path

import pandas as pd

from src.data.descriptors import molecular_descriptors
from src.data.features import atom_features
from src.data.nmrshiftdb import (
    get_db_id,
    get_smiles,
    iter_molecules,
    parse_c13_signals,
)


OUTPUT_FILE = Path("data/processed/ml_dataset.csv")


def main():

    rows = []

    for mol in iter_molecules():

        # Skip molecules without an official NMRShiftDB ID
        db_id = get_db_id(mol)
        if db_id is None:
            continue

        smiles = get_smiles(mol)

        # Compute molecular descriptors ONCE per molecule
        mol_desc = molecular_descriptors(mol)

        # Loop over all assigned carbon atoms
        for signal in parse_c13_signals(mol):

            atom = mol.GetAtomWithIdx(signal["atom_index"])

            row = {
                "nmrshiftdb_id": db_id,
                "smiles": smiles,
                "atom_index": signal["atom_index"],
                "shift_ppm": signal["shift_ppm"],
            }

            # Add atom-level descriptors
            row.update(atom_features(atom))

            # Add molecule-level descriptors
            row.update(mol_desc)

            rows.append(row)

    df = pd.DataFrame(rows)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_FILE, index=False)

    print(f"Saved {len(df):,} rows")
    print(f"Unique molecules: {df['nmrshiftdb_id'].nunique():,}")
    print(f"Columns: {len(df.columns)}")
    print()
    print(df.head())


if __name__ == "__main__":
    main()
