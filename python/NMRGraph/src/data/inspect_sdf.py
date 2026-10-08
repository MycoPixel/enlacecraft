from rdkit import Chem

INPUT_FILE = "data/raw/nmrshiftdb2withsignals.sd"

supplier = Chem.SDMolSupplier(INPUT_FILE, removeHs=False)

# Get the first valid molecule
mol = next((m for m in supplier if m is not None), None)

if mol is None:
    print("No valid molecules found.")
    exit()

print(f"Number of atoms: {mol.GetNumAtoms()}")
print(f"Number of properties: {len(mol.GetPropNames())}")

print("\nProperties:\n")

for prop in sorted(mol.GetPropNames()):
    print("=" * 60)
    print(prop)

    value = mol.GetProp(prop)

    if len(value) > 200:
        print(value[:200] + "...")
    else:
        print(value)
