"""
Sanity-check the topology-only n+1 multiplicity rule (multiplicity.py)
against well-established textbook multiplicities, using the same
molecules and atom-index convention as sanity_check.py. This is a
gut-check for the RULE, not the GNN - no model weights involved.

Mismatches are expected and informative in specific, well-understood
cases (noted per-molecule below) - particularly aromatic rings, where
real spectra show finer structure (dd/ddd, second-order effects) than
a single-J n+1 label can express. A mismatch there isn't a bug, it's
the documented limitation of this tier-1 approach.
"""

from rdkit import Chem

from src.models.multiplicity import predict_multiplicities


# known_multiplicities: atom_idx -> (label, known_multiplicity, note)
# "known_multiplicity" is the commonly cited real-world label (CDCl3,
# typical conditions) - same caveat as sanity_check.py's known_shifts:
# textbook ballpark, not pulled from one specific primary source.

SANITY_MOLECULES = [
    {
        "name": "Ethanol",
        "smiles": "CCO",
        "known_multiplicities": {
            0: ("CH3", "t", None),
            1: ("CH2", "q", None),
        },
    },
    {
        "name": "Acetone",
        "smiles": "CC(=O)C",
        "known_multiplicities": {
            0: ("CH3", "s", None),
            3: ("CH3", "s", None),
        },
    },
    {
        "name": "Benzene",
        "smiles": "c1ccccc1",
        "known_multiplicities": {
            0: ("aromatic H", "s", None),
            1: ("aromatic H", "s", None),
            2: ("aromatic H", "s", None),
            3: ("aromatic H", "s", None),
            4: ("aromatic H", "s", None),
            5: ("aromatic H", "s", None),
        },
    },
    {
        "name": "Toluene",
        "smiles": "Cc1ccccc1",
        "known_multiplicities": {
            0: ("CH3", "s", None),
            2: (
                "ortho H", "d",
                "real spectrum often reported as an unresolved "
                "aromatic multiplet - ortho J dominates, so 'd' is a "
                "reasonable first-order approximation",
            ),
            3: (
                "meta H", "t",
                "same aromatic-multiplet caveat as ortho H",
            ),
            4: (
                "para H", "t",
                "same aromatic-multiplet caveat as ortho H",
            ),
            5: ("meta H", "t", "same aromatic-multiplet caveat as ortho H"),
            6: ("ortho H", "d", "same aromatic-multiplet caveat as ortho H"),
        },
    },
    {
        "name": "Acetic acid",
        "smiles": "CC(=O)O",
        "known_multiplicities": {
            0: ("CH3", "s", None),
        },
    },
    {
        "name": "Aspirin",
        "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
        "known_multiplicities": {
            0: ("acetyl CH3", "s", None),
            5: (
                "aromatic H (ortho-OAc)", "d",
                "real spectrum is dd (two inequivalent ring neighbors) "
                "- this rule collapses it to a single-J label, see note field",
            ),
            6: (
                "aromatic H (para-COOH)", "t",
                "real spectrum is ddd/td - same collapsing caveat",
            ),
            7: (
                "aromatic H (meta-COOH)", "t",
                "real spectrum is ddd/td - same collapsing caveat",
            ),
            8: (
                "aromatic H (ortho-COOH)", "d",
                "real spectrum is dd - same collapsing caveat",
            ),
        },
    },
]


def main():

    matches = 0
    total = 0

    for molecule in SANITY_MOLECULES:

        print(f"{molecule['name']}  ({molecule['smiles']})")
        print("-" * (len(molecule["name"]) + len(molecule["smiles"]) + 4))

        mol = Chem.MolFromSmiles(molecule["smiles"])

        predicted = {
            entry["atom_idx"]: entry
            for entry in predict_multiplicities(mol, carbon_only=True)
        }

        for atom_idx, (label, known, caveat) in sorted(
            molecule["known_multiplicities"].items()
        ):

            entry = predicted.get(atom_idx)

            if entry is None:
                print(f"    atom {atom_idx} ({label}): not found in prediction")
                continue

            predicted_label = entry["label"]
            match = predicted_label == known
            total += 1
            matches += int(match)

            flag = "" if match else "  <-- MISMATCH"
            caveat_str = f"   [{caveat}]" if caveat else ""

            print(
                f"    atom {atom_idx:>3} ({label:22s}): "
                f"known {known:>5s}  predicted {predicted_label:>5s}"
                f"{flag}{caveat_str}"
            )

        print()

    print(f"{matches}/{total} atoms matched the known multiplicity exactly")
    print(
        "(mismatches flagged with a caveat above are expected - see "
        "multiplicity.py's module docstring for the tier-1 scope)"
    )


if __name__ == "__main__":
    main()
