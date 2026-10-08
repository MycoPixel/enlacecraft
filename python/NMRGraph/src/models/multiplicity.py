"""
Rule-based 1H multiplicity estimation from molecular topology (the
n+1 rule), independent of the trained GNN. Unlike chemical shift,
first-order splitting pattern is largely determined by the graph
itself (how many non-equivalent, non-exchangeable protons sit on
directly-bonded heavy atoms), so this doesn't need any training data
at all - it's a deterministic calculation over the RDKit mol.

Two refinements beyond a textbook-naive n+1 count, both needed to
match real spectra on even simple molecules:

  1. Protons on exchangeable heavy atoms (O, N, S) are excluded from
     a NEIGHBOR's coupling count. Under typical solution conditions
     (e.g. CDCl3), O-H/N-H/S-H exchange fast enough that coupling to
     them isn't resolved - e.g. ethanol's CH2 is a real quartet
     (coupled only to CH3), not a quintet (which you'd get if you
     naively also counted the adjacent OH).

  2. Neighbors that are symmetry-equivalent to the atom itself (same
     RDKit canonical rank) are excluded, since chemically equivalent
     protons don't split each other's signal - e.g. benzene's ring
     protons are a real singlet, not the triplet a naive per-atom
     count would suggest.

Known limitations NOT handled here (see chat discussion):
  - assumes one shared coupling constant across all counted vicinal
    neighbors, so it collapses real "dd"/"ddd"-type patterns from
    multiple inequivalent neighbor groups into a single n+1 label
    (flagged via the "note" field when this applies, not resolved)
  - only vicinal (3-bond, H-C-C-H) coupling is considered - no
    long-range (4J/5J, allylic, W-coupling) contributions
  - no 3D geometry, so no Karplus-type dihedral dependence of J
    (e.g. axial/equatorial differences in ring systems)
  - exchangeable protons themselves are always reported as broad
    singlets by convention (standard default assumption), not
    computed - their real behavior depends on solvent/temperature
  - genuinely diastereotopic CH2 protons are still treated as one
    equivalence class, same simplification as parse_h1_signals() in
    nmrshiftdb.py
"""

from rdkit import Chem


MULTIPLICITY_LABELS = {
    0: "s",
    1: "d",
    2: "t",
    3: "q",
    4: "quint",
    5: "sext",
    6: "sept",
}

EXCHANGEABLE_ELEMENTS = {"O", "N", "S"}


def _label_for_count(n):
    return MULTIPLICITY_LABELS.get(n, "m")


def canonical_ranks(mol):
    """
    One canonical rank per atom index; atoms sharing a rank are
    topologically (symmetry) equivalent. Computed once per molecule
    and passed around rather than recomputed per atom.
    """

    # includeAtomMaps=False is load-bearing, not tidiness.
    #
    # RDKit defaults it to True, and enumerate_stereoisomers() (see
    # coupling_karplus.py) stamps every atom with a UNIQUE map number before
    # enumerating. Those survive MolToSmiles/MolFromSmiles, so with the default
    # the map number acts as a perfect tiebreaker and EVERY atom gets its own
    # rank - equivalence grouping silently becomes a no-op on exactly the path
    # taken by anything drawn without stereowedges, i.e. most sketches. The
    # tert-butyl of CC(C)(C)C1CCC(O)CC1 came back as 11 distinct ranks for 11
    # atoms instead of 7 groups, so a 9H signal rendered as three separate 3H
    # rows.
    #
    # includeChirality=True is also the default and is left alone: that one is
    # chemically CORRECT, since diastereotopic protons genuinely are not
    # equivalent. Note the consequence, though - equivalence groups can
    # legitimately differ between stereoisomer tabs, because each is ranked
    # with its own stereochemistry.
    return list(
        Chem.CanonicalRankAtoms(mol, breakTies=False, includeAtomMaps=False)
    )


def neighbor_h_groups(mol, atom_idx, ranks=None):
    """
    Returns a list of {neighbor_idx, neighbor_symbol, num_hs} for
    each directly-bonded heavy-atom neighbor of atom_idx that
    contributes to its vicinal (3-bond H-C-C-H) coupling - i.e.
    itself bears at least one proton, is not an exchangeable
    heteroatom, and is not symmetry-equivalent to atom_idx.
    """

    if ranks is None:
        ranks = canonical_ranks(mol)

    atom = mol.GetAtomWithIdx(atom_idx)
    own_rank = ranks[atom_idx]
    groups = []

    for neighbor in atom.GetNeighbors():

        if neighbor.GetSymbol() in EXCHANGEABLE_ELEMENTS:
            # Fast exchange - coupling to O-H/N-H/S-H is not resolved
            # under typical solution NMR conditions.
            continue

        if ranks[neighbor.GetIdx()] == own_rank:
            # Symmetry-equivalent protons don't split each other's
            # signal (standard first-order assumption).
            continue

        num_hs = neighbor.GetTotalNumHs()

        if num_hs > 0:
            groups.append(
                {
                    "neighbor_idx": neighbor.GetIdx(),
                    "neighbor_symbol": neighbor.GetSymbol(),
                    "num_hs": num_hs,
                    "neighbor_rank": ranks[neighbor.GetIdx()],
                }
            )

    return groups


def predict_multiplicity(mol, atom_idx, ranks=None):
    """
    Returns a dict describing the estimated multiplicity for the
    proton(s) on atom_idx, or None if atom_idx has no attached H.
    """

    atom = mol.GetAtomWithIdx(atom_idx)

    if atom.GetTotalNumHs() == 0:
        return None

    if atom.GetSymbol() in EXCHANGEABLE_ELEMENTS:
        return {
            "atom_idx": atom_idx,
            "label": "s",
            "n_coupled_h": 0,
            "neighbor_groups": [],
            "note": (
                "exchangeable proton - reported as broad singlet by "
                "convention, not computed from topology"
            ),
        }

    if ranks is None:
        ranks = canonical_ranks(mol)

    groups = neighbor_h_groups(mol, atom_idx, ranks=ranks)
    n_total = sum(group["num_hs"] for group in groups)

    result = {
        "atom_idx": atom_idx,
        "label": _label_for_count(n_total),
        "n_coupled_h": n_total,
        "neighbor_groups": groups,
    }

    distinct_ranks = {group["neighbor_rank"] for group in groups}

    if len(distinct_ranks) > 1:
        result["note"] = (
            f"coupled to {len(distinct_ranks)} inequivalent neighbor "
            "groups - real pattern may be finer structure (e.g. "
            "dd/ddd) than this single-J n+1 approximation shows"
        )

    return result


def predict_multiplicities(mol, carbon_only=True):
    """
    Returns predict_multiplicity() results for every H-bearing atom
    in mol. carbon_only=True (default) matches the scope of the
    C-H-only 1H shift model (gnn_h1_ch_v1.pt) - set False to also
    include exchangeable O-H/N-H/S-H entries (always reported as a
    broad singlet, per predict_multiplicity above).
    """

    ranks = canonical_ranks(mol)
    results = []

    for atom in mol.GetAtoms():

        if carbon_only and atom.GetSymbol() != "C":
            continue

        result = predict_multiplicity(mol, atom.GetIdx(), ranks=ranks)

        if result is not None:
            results.append(result)

    return results
