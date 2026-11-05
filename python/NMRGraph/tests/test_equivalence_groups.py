"""
Equivalence-grouping regression tests.

Runs on the standard library alone - no pytest - because the backend's frozen
environment is a packaging artefact and adding a test dependency to it would
change the shipped binary to no purpose:

    python3 -m unittest discover -s python/NMRGraph/tests -t python/NMRGraph

WHY THIS FILE EXISTS
--------------------
`canonical_ranks` called `Chem.CanonicalRankAtoms(mol, breakTies=False)`,
relying on RDKit's default `includeAtomMaps=True`.

The stereoisomer-enumeration path stamps every atom with a UNIQUE atom-map
number before enumerating, and those survive `MolToSmiles` / `MolFromSmiles`.
With the default in force the map number acted as a perfect tiebreaker, so
EVERY atom received its own canonical rank and equivalence grouping became a
silent no-op - on exactly the path taken by any structure drawn without
stereowedges, which is most sketches.

Measured on the project's own sanity-check molecule, `CC(C)(C)C1CCC(O)CC1`
(with map numbers set, as the enumeration path sets them):

    before: 11 distinct ranks for 11 atoms, largest equivalence class of 1
    after:   7 distinct ranks,           largest equivalence class of 3

So the tert-butyl rendered as three separate 3H signals instead of one 9H
signal, integral steps fragmented with them, and the report table listed every
atom individually. Nothing errored - the output simply looked normal while
being wrong.

These assertions are on the CHEMISTRY, not on RDKit's internals: the largest
equivalence class must match the number of genuinely symmetry-equivalent atoms
in the molecule, which is checkable by hand.
"""

import unittest
from collections import Counter

from rdkit import Chem

from src.models.multiplicity import canonical_ranks
from src.models.coupling_karplus import unassigned_stereocenters


def ranks_with_map_numbers(smiles):
    """Reproduce the enumeration path: stamp unique map numbers, then rank.

    Done here rather than by calling enumerate_stereoisomers() so the test
    depends only on RDKit, not on that module's option choices.
    """
    mol = Chem.MolFromSmiles(smiles)
    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(atom.GetIdx() + 1)
    return canonical_ranks(mol)


class TestEquivalenceGrouping(unittest.TestCase):
    def test_benzene_is_one_group(self):
        ranks = canonical_ranks(Chem.MolFromSmiles("c1ccccc1"))
        self.assertEqual(len(set(ranks)), 1, "all six aryl protons are equivalent")

    def test_isobutane_methyls_share_a_group(self):
        # The tert-butyl case, small enough to reason about by hand: three CH3
        # attached to one CH, so exactly two groups and a class of three.
        ranks = canonical_ranks(Chem.MolFromSmiles("CC(C)C"))
        self.assertEqual(len(set(ranks)), 2)
        self.assertEqual(max(Counter(ranks).values()), 3)

    def test_ethanol_carbons_are_all_distinct(self):
        # CH3 / CH2 / CH2OH have no symmetry - grouping them would be the bug
        # in the other direction.
        self.assertEqual(len(set(canonical_ranks(Chem.MolFromSmiles("CCO")))), 3)

    def test_aspirin_has_no_symmetry(self):
        ranks = canonical_ranks(Chem.MolFromSmiles("CC(=O)OC1=CC=CC=C1C(=O)O"))
        self.assertEqual(max(Counter(ranks).values()), 1)

    def test_acet_anilide_ortho_carbons_pair_up(self):
        # The unsubstituted half of the ring is a genuine two-fold symmetry.
        ranks = canonical_ranks(Chem.MolFromSmiles("CC(=O)Nc1ccccc1"))
        self.assertEqual(max(Counter(ranks).values()), 2)


class TestAtomMapsDoNotBreakGrouping(unittest.TestCase):
    """The actual regression: unique map numbers must not defeat grouping."""

    def test_tert_butylcyclohexanol_survives_map_numbers(self):
        # Skeleton's own sanity-check molecule, and the reported case: the
        # tert-butyl's three methyls must still group when map numbers are set.
        self.assertEqual(max(Counter(ranks_with_map_numbers("CC(C)(C)C1CCC(O)CC1")).values()), 3)

    def test_no_atom_is_left_in_a_class_of_one_when_symmetry_exists(self):
        # Before the fix every single atom was its own class, so the largest
        # class was always 1. Anything above 1 proves map numbers are ignored.
        for smiles in ("CC(C)(C)C1CCC(O)CC1", "CC(C)CC(C)CC", "OC1CCCCC1"):
            with self.subTest(smiles=smiles):
                self.assertGreater(max(Counter(ranks_with_map_numbers(smiles)).values()), 1)

    def test_rank_count_matches_the_unmapped_molecule(self):
        # Map numbers are bookkeeping for the enumeration, not chemistry, so
        # they must not change the grouping at all.
        for smiles in ("CC(C)(C)C1CCC(O)CC1", "CC(C)CC(C)CC", "CC(=O)Nc1ccccc1"):
            with self.subTest(smiles=smiles):
                plain = canonical_ranks(Chem.MolFromSmiles(smiles))
                mapped = ranks_with_map_numbers(smiles)
                self.assertEqual(
                    sorted(Counter(plain).values()),
                    sorted(Counter(mapped).values()),
                    "map numbers changed the equivalence classes",
                )

    def test_this_is_the_path_real_drawings_take(self):
        # Confirms the bug was reachable by default, not only in theory: a
        # molecule with an unspecified tetrahedral centre skips the no-op
        # branch and goes straight to enumeration.
        self.assertTrue(unassigned_stereocenters(Chem.MolFromSmiles("CC(C)(C)C1CCC(O)CC1")))


class TestAromaticRingSymmetry:
    def test_benzene_map_numbers_ignored(self):
        self.assertEqual(len(set(ranks_with_map_numbers("c1ccccc1"))), 1)


if __name__ == "__main__":
    unittest.main()