from rdkit import Chem
import pandas as pd


INPUT_FILE = "data/raw/nmrshiftdb2withsignals.sd"
OUTPUT_FILE = "data/processed/c13_shifts.csv"

supplier = Chem.SDMolSupplier(INPUT_FILE, removeHs=False)

records = []

for mol in supplier:

    if mol is None:
        continue

    # Skip molecules without an official database ID
    if not mol.HasProp("nmrshiftdb2 ID"):
        continue

    # Skip molecules without a 13C spectrum
    if not mol.HasProp("Spectrum 13C 0"):
        continue

    db_id = int(mol.GetProp("nmrshiftdb2 ID"))
    smiles = Chem.MolToSmiles(mol, canonical=True)

    spectrum = mol.GetProp("Spectrum 13C 0")

    for signal in spectrum.split("|"):

        if not signal.strip():
            continue

        parts = signal.split(";")

        if len(parts) != 3:
            continue

        shift = float(parts[0])
        atom_index = int(parts[2])

        atom = mol.GetAtomWithIdx(atom_index)

        # We only want 13C assignments
        if atom.GetSymbol() != "C":
            continue

        records.append({
            "nmrshiftdb_id": db_id,
            "smiles": smiles,
            "atom_index": atom_index,
            "shift_ppm": shift
        })


df = pd.DataFrame(records)

df.to_csv(OUTPUT_FILE, index=False)

print(f"Saved: {OUTPUT_FILE}")
print(f"Rows: {len(df)}")
print(f"Unique molecules: {df['nmrshiftdb_id'].nunique()}")
