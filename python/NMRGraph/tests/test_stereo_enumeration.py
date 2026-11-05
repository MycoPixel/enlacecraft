"""
Unspecified double-bond geometry must trigger stereoisomer enumeration.

Runs on the standard library alone, no pytest - see
test_equivalence_groups.py for why.

WHY THIS FILE EXISTS
--------------------
The gate that decides "is this input ambiguous?" called
`unassigned_stereocenters()`, which only inspects TETRAHEDRAL centres via
`Chem.FindMolChiralCenters`. An alkene drawn without E/Z marks was therefore
invisible to it.

That is not an edge case. In a 2D sketching tool a plain double bond with no
stereo marks is the NORMAL state of a hand-drawn structure, and it is exactly
as ambiguous as an unmarked ring stereocentre - RDKit enumerates the E and Z
isomers happily, we simply never asked.

Verified against the old gate before the fix:

    CC=CCC  unassigned_stereocenters -> []      => returns [CC=CCC], no warning
    CC=CCC  EnumerateStereoisomers  -> ['C/C=C/CC', 'C/C=C\\CC']

So two genuinely different compounds were silently averaged into one
prediction, with no warning - which is precisely the failure the multi-tab
design says it exists to prevent.
"""

import unittest

from rdkit import Chem

from src.models.coupling_karplus import (
    unassigned_stereo_elements,
    has_unassigned_stereo,
    unassigned_stereocenters,
    enumerate_stereoisomers,
)


class TestAlkenesAreNoLongerInvisible(unittest.TestCase):
    def test_unspecified_alkene_is_detected(self):
        elements = unassigned_stereo_elements(Chem.MolFromSmiles("CC=CCC"))
        self.assertEqual([kind for kind, _ in elements], ["bond"])

    def test_unspecified_alkene_opens_the_gate(self):
        # The regression. unassigned_stereocenters saw nothing here.
        self.assertEqual(unassigned_stereocenters(Chem.MolFromSmiles("CC=CCC")), [])
        self.assertTrue(has_unassigned_stereo(Chem.MolFromSmiles("CC=CCC")))

    def test_unspecified_alkene_now_enumerates_both_isomers(self):
        # The user-visible half: two results instead of one blended average.
        isomers = enumerate_stereoisomers("CC=CCC")
        self.assertEqual(len(isomers), 2, "expected E and Z")

    def test_explicit_alkene_stereo_stays_closed(self):
        # Only "you could draw this either way" should enumerate. A drawn E or Z
        # is a decision, not an ambiguity - re-enumerating it would be noise.
        self.assertFalse(has_unassigned_stereo(Chem.MolFromSmiles("C/C=C/C")))
        self.assertFalse(has_unassigned_stereo(Chem.MolFromSmiles("C/C=C\\C")))
        self.assertEqual(unassigned_stereo_elements(Chem.MolFromSmiles("C/C=C/C")), [])

    def test_terminal_alkene_is_not_treated_as_ambiguous(self):
        # =CH2 has no E/Z to choose between, so RDKit reports nothing open.
        # Treating it as ambiguous would add a pointless second result to every
        # molecule with a terminal vinyl group.
        self.assertFalse(has_unassigned_stereo(Chem.MolFromSmiles("C=CC")))

    def test_aromatic_ring_is_not_treated_as_ambiguous(self):
        self.assertFalse(has_unassigned_stereo(Chem.MolFromSmiles("c1ccccc1")))

    def test_no_stereochemistry_at_all_stays_closed(self):
        self.assertFalse(has_unassigned_stereo(Chem.MolFromSmiles("CC(=O)Nc1ccccc1")))
        self.assertFalse(has_unassigned_stereo(Chem.MolFromSmiles("CCO")))

    def test_tetrahedral_centres_are_still_detected(self):
        # The original behaviour must not regress.
        kinds = {kind for kind, _ in unassigned_stereo_elements(Chem.MolFromSmiles("CC(C)(C)C1CCC(O)CC1"))}
        self.assertEqual(kinds, {"atom"})

    def test_both_kinds_together_are_all_reported(self):
        # An unspecified alkene AND an unspecified centre: both, not just one.
        elements = unassigned_stereo_elements(Chem.MolFromSmiles("CC=CC(C)O"))
        kinds = {kind for kind, _ in elements}
        self.assertIn("bond", kinds, "alkene must not be dropped")
        self.assertIn("atom", kinds, "centre must not be dropped")


if __name__ == "__main__":
    unittest.main()