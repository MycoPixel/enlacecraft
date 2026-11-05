"""
Sanity-check the trained GNN against a handful of textbook molecules
with well-established literature 13C shifts. These are almost
certainly IN the training data too (they're extremely common), so
this isn't a rigorous held-out test - evaluate_gnn.py's test-set
breakdown is the real accuracy measurement. This script is instead a
fast, human-readable gut-check: does the model get the molecules a
chemist would sanity-check first? And it doubles as a regression test
you can rerun any time you retrain or touch the inference code, to
catch bugs like the AddHs one immediately instead of discovering it
from garbled predictions.

Each molecule maps atom indices (as produced by
Chem.MolFromSmiles(smiles), no AddHs) to their known shift and a
human label, so mismatches are easy to read.
"""

from src.models.predict import (
    MODEL_PATH_H1_ALL,
    MODEL_PATH_H1_CH,
    load_model,
    predict_h1_spectrum,
    predict_spectrum,
)


# Atom indices below were determined by inspecting
# Chem.MolFromSmiles(smiles) atom ordering for each SMILES string.
# literature values are commonly cited ranges/values, not from any
# single specific paper - treat the comparison as "same ballpark",
# not "exact to two decimal places". This is even more true for the
# aromatic ring positions in aspirin below - the VALUES are solid
# textbook numbers, but which exact ring position gets which value
# is a best-effort mapping, not verified against a primary source.
#
# known_shifts_h1 entries are (label, known_ppm, exchangeable).
# exchangeable=True marks O-H/COOH protons, whose real shift varies
# a lot with concentration/solvent/temperature - included for
# reference but excluded from the aggregate error stat since a large
# error there doesn't mean the same thing as a large error on a
# normal C-H.

SANITY_MOLECULES = [
    {
        "name": "Ethanol",
        "smiles": "CCO",
        "known_shifts": {
            0: ("CH3", 18.4),
            1: ("CH2-OH", 58.3),
        },
        "known_shifts_h1": {
            0: ("CH3", 1.19, False),
            1: ("CH2", 3.72, False),
            2: ("OH", 2.6, True),
        },
    },
    {
        "name": "Acetone",
        "smiles": "CC(=O)C",
        "known_shifts": {
            0: ("CH3", 30.9),
            1: ("C=O", 206.7),
            3: ("CH3", 30.9),
        },
        "known_shifts_h1": {
            0: ("CH3", 2.17, False),
            3: ("CH3", 2.17, False),
        },
    },
    {
        "name": "Benzene",
        "smiles": "c1ccccc1",
        "known_shifts": {
            0: ("aromatic CH", 128.4),
            1: ("aromatic CH", 128.4),
            2: ("aromatic CH", 128.4),
            3: ("aromatic CH", 128.4),
            4: ("aromatic CH", 128.4),
            5: ("aromatic CH", 128.4),
        },
        "known_shifts_h1": {
            0: ("aromatic H", 7.36, False),
            1: ("aromatic H", 7.36, False),
            2: ("aromatic H", 7.36, False),
            3: ("aromatic H", 7.36, False),
            4: ("aromatic H", 7.36, False),
            5: ("aromatic H", 7.36, False),
        },
    },
    {
        "name": "Toluene",
        "smiles": "Cc1ccccc1",
        "known_shifts": {
            0: ("CH3", 21.4),
            1: ("ipso C", 137.8),
            2: ("ortho CH", 129.3),
            3: ("meta CH", 128.5),
            4: ("para CH", 125.6),
            5: ("meta CH", 128.5),
            6: ("ortho CH", 129.3),
        },
        "known_shifts_h1": {
            0: ("CH3", 2.36, False),
            # atom 1 is the substituted ipso carbon - no attached H,
            # correctly absent from a 1H spectrum.
            2: ("ortho H", 7.17, False),
            3: ("meta H", 7.25, False),
            4: ("para H", 7.17, False),
            5: ("meta H", 7.25, False),
            6: ("ortho H", 7.17, False),
        },
    },
    {
        "name": "Acetic acid",
        "smiles": "CC(=O)O",
        "known_shifts": {
            0: ("CH3", 20.8),
            1: ("COOH", 178.1),
        },
        "known_shifts_h1": {
            0: ("CH3", 2.10, False),
            3: ("COOH", 11.5, True),
        },
    },
    {
        "name": "Aspirin",
        "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
        "known_shifts": {
            0: ("acetyl CH3", 21.1),
            1: ("acetyl C=O", 169.7),
            10: ("COOH", 170.4),
        },
        "known_shifts_h1": {
            0: ("acetyl CH3", 2.35, False),
            5: ("aromatic H (ortho-OAc)", 7.11, False),
            6: ("aromatic H (para-COOH)", 7.58, False),
            7: ("aromatic H (meta-COOH)", 7.34, False),
            8: ("aromatic H (ortho-COOH)", 8.09, False),
            12: ("COOH", 11.5, True),
        },
    },
    {
        # [2.2]paracyclophane: two benzene rings held rigidly
        # face-to-face by two -CH2-CH2- bridges (not bonded to each
        # other - purely through-space). A textbook ring-current
        # shielding case, added specifically to test the geometric
        # relation channel in geometry.py: a 2D bond graph alone
        # cannot represent "these two rings are stacked" at all,
        # since they're only connected via the two-bond-long
        # aliphatic bridges - any shielding effect here has to come
        # from the through-space geo channel, or not be captured at
        # all. Aromatic H is characteristically shifted upfield of
        # normal benzene (7.36) because each ring sits in the other's
        # shielding cone.
        #
        # NOTE: values below are from general organic chemistry
        # knowledge, not a specific verified citation - same
        # "ballpark, not exact" caveat as the rest of this file, but
        # worth double-checking against a primary source if you want
        # to lean on this case heavily, since it's the one that
        # matters most for judging the geometric feature specifically.
        #
        # IMPORTANT CAVEAT (found after adding this case): this
        # specific molecule's extreme ring strain makes it a
        # genuinely hard case for RDKit's standard distance-geometry
        # conformer embedding - confirmed to fail even across 50
        # different seeds with relaxed ETKDG parameters. Unless
        # embed_heavy_atom_coords has since been given a way to embed
        # this molecule specifically (e.g. seeding from external/
        # crystal-structure coordinates instead of ab initio
        # embedding), any prediction error printed here for THIS
        # molecule reflects the geo channel likely contributing
        # nothing (empty geo_edges from a failed embed) - i.e. it's
        # testing the bond-graph-only fallback path, not the
        # through-space feature it was added to test. Don't treat a
        # good or bad result here as evidence either way about the
        # geometric feature until this is confirmed to embed
        # successfully.
        "name": "[2.2]Paracyclophane",
        "smiles": "C1Cc2ccc(CCc3ccc1cc3)cc2",
        "known_shifts": {
            0: ("bridge CH2", 35.6),
            1: ("bridge CH2", 35.6),
            2: ("ipso C", 139.8),
            3: ("aromatic CH", 132.8),
            4: ("aromatic CH", 132.8),
            5: ("ipso C", 139.8),
            6: ("bridge CH2", 35.6),
            7: ("bridge CH2", 35.6),
            8: ("ipso C", 139.8),
            9: ("aromatic CH", 132.8),
            10: ("aromatic CH", 132.8),
            11: ("ipso C", 139.8),
            12: ("aromatic CH", 132.8),
            13: ("aromatic CH", 132.8),
            14: ("aromatic CH", 132.8),
            15: ("aromatic CH", 132.8),
        },
        "known_shifts_h1": {
            0: ("bridge CH2", 3.10, False),
            1: ("bridge CH2", 3.10, False),
            3: ("aromatic H", 6.47, False),
            4: ("aromatic H", 6.47, False),
            6: ("bridge CH2", 3.10, False),
            7: ("bridge CH2", 3.10, False),
            9: ("aromatic H", 6.47, False),
            10: ("aromatic H", 6.47, False),
            12: ("aromatic H", 6.47, False),
            13: ("aromatic H", 6.47, False),
            14: ("aromatic H", 6.47, False),
            15: ("aromatic H", 6.47, False),
        },
    },
]


def main():

    model_c13 = load_model()
    model_h1_ch = load_model(MODEL_PATH_H1_CH)
    model_h1_all = load_model(MODEL_PATH_H1_ALL)

    c13_errors = []
    h1_errors = []

    for molecule in SANITY_MOLECULES:

        print(f"{molecule['name']}  ({molecule['smiles']})")
        print("-" * (len(molecule["name"]) + len(molecule["smiles"]) + 4))

        c13_spectrum = {
            entry["atom_index"]: entry["predicted_shift_ppm"]
            for entry in predict_spectrum(molecule["smiles"], model_c13)
        }
        # C-H-only model for ordinary protons (its actual training
        # target); all-protons model only consulted for the
        # exchangeable entries below, since the C-H-only model was
        # never trained on those at all and has no basis to predict
        # them.
        h1_spectrum_ch = {
            entry["atom_index"]: entry["predicted_shift_ppm"]
            for entry in predict_h1_spectrum(
                molecule["smiles"], model_h1_ch, carbon_only=True
            )
        }
        h1_spectrum_all = {
            entry["atom_index"]: entry["predicted_shift_ppm"]
            for entry in predict_h1_spectrum(
                molecule["smiles"], model_h1_all, carbon_only=False
            )
        }

        print("  13C:")
        for atom_index, (label, known_shift) in sorted(
            molecule["known_shifts"].items()
        ):

            predicted = c13_spectrum.get(atom_index)

            if predicted is None:
                print(f"    atom {atom_index} ({label}): not found in prediction")
                continue

            error = abs(predicted - known_shift)
            c13_errors.append(error)

            flag = "  <-- off by 10+ ppm" if error > 10 else ""

            print(
                f"    atom {atom_index} ({label:22s}): "
                f"known {known_shift:7.1f}  predicted {predicted:7.2f}  "
                f"error {error:5.2f}{flag}"
            )

        print("  1H:")
        for atom_index, (label, known_shift, exchangeable) in sorted(
            molecule.get("known_shifts_h1", {}).items()
        ):

            spectrum = h1_spectrum_all if exchangeable else h1_spectrum_ch
            predicted = spectrum.get(atom_index)

            if predicted is None:
                print(f"    atom {atom_index} ({label}): not found in prediction")
                continue

            error = abs(predicted - known_shift)
            if not exchangeable:
                h1_errors.append(error)

            model_tag = " [all-protons model]" if exchangeable else ""
            note = (
                f" (exchangeable - variable, not counted below){model_tag}"
                if exchangeable
                else ""
            )
            flag = "  <-- off by 1+ ppm" if (error > 1 and not exchangeable) else ""

            print(
                f"    atom {atom_index} ({label:22s}): "
                f"known {known_shift:5.2f}  predicted {predicted:5.2f}  "
                f"error {error:4.2f}{flag}{note}"
            )

        print()

    if c13_errors:
        mean_c13 = sum(c13_errors) / len(c13_errors)
        print(f"13C mean absolute error across sanity checks: {mean_c13:.2f} ppm")

    if h1_errors:
        mean_h1 = sum(h1_errors) / len(h1_errors)
        print(f"1H  mean absolute error across sanity checks: {mean_h1:.2f} ppm")
        print("(C-H-only model; excludes exchangeable O-H/COOH protons - see note above)")


if __name__ == "__main__":
    main()
