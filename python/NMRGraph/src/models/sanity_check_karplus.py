"""
Sanity-check tier 2 (coupling_karplus.py) on two contrasting cases:

  1. ClCCBr (1,2-dibromo... actually 1-chloro-2-bromoethane) - a
     freely-rotating open chain. All 4 H-C-C-H paths should come out
     fairly close to each other after Boltzmann-averaging across
     rotamers, since free rotation samples gauche/anti conformers
     roughly proportionally. Literature-cited averaged J for
     1,2-dihaloethanes is typically in the ~6-7 Hz range - not an
     exact target (MMFF is a rough force field, not DFT/experiment),
     just a "does this land in a sane ballpark" check.

  2. trans-4-tert-butylcyclohexanol - a conformationally LOCKED ring
     (bulky tBu practically never goes axial, so the ring sits in one
     chair). trans places the carbinol H (H1) axial, so it should
     show one LARGE diaxial J (~10-11 Hz, to the axial H on the
     adjacent CH2) and one SMALL J (~4-5 Hz, to that CH2's equatorial
     H) - a genuine split that tier 1's topology-only rule cannot see
     (it would just report both as part of one flat multiplicity
     count). If instead both values come out similar/small, either
     the stereo-SMILES below landed on the cis isomer by mistake, or
     something else is off - worth flagging back rather than assuming
     tier 2 is broken.

Stereo-SMILES caveat: the trans SMILES below was written without
being able to run RDKit to confirm the @ /@@ tags actually produce
the trans (diequatorial-preferred) isomer rather than cis - that's
exactly what this sanity check is for.
"""

from src.models.coupling_karplus import estimate_all_vicinal_couplings


TEST_MOLECULES = [
    {
        "name": "1-chloro-2-bromoethane (freely rotating)",
        "smiles": "ClCCBr",
        "expectation": (
            "all H-C-C-H paths on the C1-C2 bond should land roughly "
            "in the same ballpark (~5-8 Hz), reflecting free-rotation "
            "averaging - large spread here would be the surprising result"
        ),
    },
    {
        "name": "trans-4-tert-butylcyclohexanol (locked ring)",
        "smiles": "CC(C)(C)[C@H]1CC[C@@H](O)CC1",
        "expectation": (
            "the H1-H2 pair should split into one LARGE J (~10-11 Hz, "
            "diaxial) and one SMALL J (~4-5 Hz, axial-equatorial) - "
            "if both come out similar instead, the stereo tags likely "
            "landed on the cis isomer or the ring isn't locking as "
            "expected"
        ),
    },
]


def main():

    for molecule in TEST_MOLECULES:

        print(f"{molecule['name']}  ({molecule['smiles']})")
        print("Expectation:", molecule["expectation"])
        print("-" * 70)

        results = estimate_all_vicinal_couplings(molecule["smiles"])

        for entry in sorted(results, key=lambda e: (e["atom_i"], e["atom_j"])):

            j_values = entry["j_values_hz"]
            j_str = ", ".join(f"{j:.2f}" for j in j_values)

            print(
                f"    atoms {entry['atom_i']:>2}-{entry['atom_j']:<2} "
                f"(ranks {entry['rank_i']},{entry['rank_j']}): "
                f"J = [{j_str}] Hz  "
                f"({entry['n_conformers']} conformers)"
            )

        print()


if __name__ == "__main__":
    main()
