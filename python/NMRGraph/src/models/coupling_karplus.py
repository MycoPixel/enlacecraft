"""
Tier 2 vicinal coupling estimation: unlike multiplicity.py (pure
topology, the n+1 rule), this uses actual 3D geometry - generates
conformers, measures H-C-C-H dihedral angles, and applies the
Karplus equation to estimate real J values (in Hz) per vicinal pair.

This matters most for RING systems and other conformationally
restricted molecules, where axial/equatorial (or similarly locked)
protons have genuinely different J values that pure topology cannot
see (tier 1 always predicts the same multiplicity regardless of
geometry). For freely-rotating open chains, rapid bond rotation
already averages J across rotamers at room temperature, so tier 1's
flat n+1 count is often already a reasonable approximation there -
tier 2's real payoff is restricted systems.

Because dihedral angles require actual proton positions, this module
works with an explicit-H, 3D-embedded copy of the molecule
(Chem.AddHs + conformer embedding) - a DIFFERENT representation than
the implicit-H 2D graph used for training/inference elsewhere in this
project (mol_to_graph, predict.py). Do not feed anything from this
module into the GNN pipeline or vice versa. AddHs() preserves the
original heavy-atom indices and appends new H atoms afterward, so
heavy-atom indices here still line up with predict.py/multiplicity.py
- only the new explicit H indices are specific to this module.

Multiple conformers are generated and MMFF-optimized; each vicinal
pair's J is Boltzmann-weighted across the conformer ensemble (weight
∝ exp(-E/RT) at 298K) rather than read off a single geometry, so
freely-rotating bonds correctly show an averaged J instead of an
arbitrary single-conformer value. MMFF energies are a rough force
field, not DFT-quality - treat the resulting J values as reasonable
estimates, not literature-precision numbers.

Karplus equation used: J(theta) = A + B*cos(theta) + C*cos(2*theta),
with A=7.0, B=-1.0, C=5.0 Hz - the commonly cited simplified/pedagogical
form (anti ~180 deg -> ~13 Hz, gauche ~60 deg -> ~4 Hz, minimum near
90 deg -> ~2 Hz). Real systems (electronegative substituents, ring
strain) shift these constants somewhat - this is a reasonable general-
purpose estimate, not a substituent-specific fit.
"""

import math
from dataclasses import dataclass

from rdkit import Chem
from rdkit.Chem import AllChem, rdMolTransforms
from rdkit.Chem.EnumerateStereoisomers import (
    EnumerateStereoisomers,
    StereoEnumerationOptions,
)

from src.models.multiplicity import (
    EXCHANGEABLE_ELEMENTS,
    MULTIPLICITY_LABELS,
    canonical_ranks,
)


R_KCAL = 0.0019872041  # kcal/(mol*K)
TEMPERATURE_K = 298.0


def karplus_J(dihedral_deg, A=7.0, B=-1.0, C=5.0):
    """Estimate vicinal J (Hz) from an H-C-C-H dihedral angle (deg)."""

    theta = math.radians(dihedral_deg)
    return A + B * math.cos(theta) + C * math.cos(2 * theta)


def cluster_j_values(j_values, tolerance=0.5):
    """
    Groups J values (Hz) that coincide within `tolerance` of each
    other - the numeric equivalent of "these couplings overlap into
    one set of lines" in real NMR. Returns a list of clusters (each a
    list of the original values), sorted largest-J-cluster first.
    Greedy/sequential: sorts descending, then extends the current
    cluster while consecutive values stay within tolerance - correct
    as long as clusters are numerically well-separated, which held in
    every case tested during this project's development. Real spectra
    sometimes need more careful clustering (values from unrelated
    couplings can coincidentally land close together); treat this as
    a reasonable default, not a guarantee.
    """

    if not j_values:
        return []

    sorted_vals = sorted(j_values, reverse=True)
    clusters = [[sorted_vals[0]]]

    for value in sorted_vals[1:]:
        if abs(value - clusters[-1][-1]) <= tolerance:
            clusters[-1].append(value)
        else:
            clusters.append([value])

    return clusters


def multiplet_label(j_values, tolerance=0.5):
    """
    Builds a conventional compound multiplet label (s, d, t, dd, td,
    ddd, ...) from a list of raw J values, instead of naively
    printing one 'd' per value. Couplings that coincide within
    `tolerance` collapse into a single higher-order component (e.g.
    two equal ~7 Hz couplings become a triplet, not "dd") using the
    same n+1 vocabulary as tier 1 (MULTIPLICITY_LABELS); couplings
    with genuinely different magnitudes combine as separate
    components, largest J first (a common convention, not the only
    one used in the literature - e.g. some sources order small-to-large
    or by structural role instead).
    """

    if not j_values:
        return "s"

    clusters = cluster_j_values(j_values, tolerance=tolerance)

    return "".join(
        MULTIPLICITY_LABELS.get(len(cluster), "m") for cluster in clusters
    )


def unassigned_stereocenters(mol):
    """
    Atom indices of tetrahedral stereocenters RDKit can identify but
    that have no defined configuration in the input (no @ /@@ tag) -
    i.e. exactly the ambiguity that lets EmbedMultipleConfs silently
    pick an arbitrary (possibly inconsistent across conformers)
    spatial arrangement, potentially blending what are really
    distinct diastereomers into one physically meaningless average.
    """

    centers = Chem.FindMolChiralCenters(
        mol, includeUnassigned=True, useLegacyImplementation=False
    )
    return [idx for idx, cip_code in centers if cip_code == "?"]


def unassigned_stereo_elements(mol):
    """
    Every piece of stereochemistry RDKit could define but that the input left
    unspecified, as (kind, index) pairs - kind being "atom" or "bond".

    BROADER THAN unassigned_stereocenters ON PURPOSE
    -----------------------------------------------
    That function only looks at tetrahedral centres, so it misses unspecified
    alkene geometry - which is not an edge case in a 2D sketching tool. A double
    bond drawn without E/Z marks is the NORMAL state of a hand-drawn structure,
    and it is exactly as ambiguous: RDKit will happily enumerate the E and Z
    isomers, we just never asked.

    Verified before this existed: CC=CCC gave unassigned_stereocenters() == []
    (so the enumeration path was skipped and one blended result returned), while
    EnumerateStereoisomers produced ['C/C=C/CC', 'C/C=C\\CC'] - two genuinely
    different compounds silently averaged into one prediction with no warning.

    FindPotentialStereo covers both kinds in one pass, and distinguishes
    Unspecified ("you could draw this either way") from Unknown ("RDKit can't
    assign it even in principle"). Only the former should trigger enumeration.

    unassigned_stereocenters is left as-is because its callers want atom
    indices specifically - this is the gate, not a replacement.
    """
    out = []
    for element in Chem.FindPotentialStereo(mol):
        if element.specified != Chem.StereoSpecified.Unspecified:
            continue
        if element.type == Chem.StereoType.Atom_Tetrahedral:
            out.append(("atom", element.centeredOn))
        elif element.type == Chem.StereoType.Bond_Double:
            out.append(("bond", element.centeredOn))
    return out


def has_unassigned_stereo(mol):
    """True when the input leaves any stereochemistry open to interpretation."""
    return len(unassigned_stereo_elements(mol)) > 0


def _mirror_image_smiles(mol):
    """
    SMILES of this molecule's mirror image - every tetrahedral
    stereocenter flipped (CW<->CCW), everything else unchanged. Used
    to detect enantiomer pairs: two SMILES that are mirror images of
    each other describe molecules NMR cannot tell apart (no chiral
    shift reagent involved anywhere in this pipeline), so they should
    never be reported as two separate results.

    Atom identity (map numbers, if the input mol has them - see
    enumerate_stereoisomers) is preserved automatically: this only
    copies the mol and flips chirality tags, never touching map
    numbers, so whatever RDKit's writer decides about atom order here
    doesn't matter for correctness downstream.
    """

    mirrored = Chem.Mol(mol)

    for atom in mirrored.GetAtoms():
        tag = atom.GetChiralTag()
        if tag == Chem.ChiralType.CHI_TETRAHEDRAL_CW:
            atom.SetChiralTag(Chem.ChiralType.CHI_TETRAHEDRAL_CCW)
        elif tag == Chem.ChiralType.CHI_TETRAHEDRAL_CCW:
            atom.SetChiralTag(Chem.ChiralType.CHI_TETRAHEDRAL_CW)

    return Chem.MolToSmiles(mirrored)


def enumerate_stereoisomers(smiles, max_isomers=32):
    """
    Returns a list of SMILES enumerating every DIASTEREOMER arising
    from the molecule's UNASSIGNED stereocenters (already-defined
    ones are left untouched). If there are no unassigned
    stereocenters, returns [smiles] unchanged - nothing to enumerate,
    and returning the untouched input avoids any re-serialization risk
    (see ATOM IDENTITY below) for the common case entirely.

    ATOM IDENTITY ACROSS THE ROUND-TRIP: every returned SMILES has
    each atom tagged with a SMILES atom map number equal to its
    ORIGINAL index in the input `smiles` (1-based - map number 0
    means "unmapped" in SMILES convention) - e.g. what was atom_index
    5 in the input shows up somewhere in the output as `[...:6]`.
    This matters because callers like predict_multiplicity.py re-parse
    each returned SMILES independently, and the RAW atom indices RDKit
    assigns on that re-parse are NOT guaranteed to match the input's
    atom order - confirmed in practice, not just theoretically: an
    earlier version of this function tried to guarantee that ordering
    match by writing with canonical=False, on the (plausible-seeming,
    but wrong) assumption that skipping canonical ranking would leave
    atoms in their original order. It didn't - RDKit's SMILES writer
    still makes its own traversal/ring-perception decisions even
    canonically unranked, and sanitization steps like Kekule-to-
    aromatic perception can change those decisions entirely. It
    happened to hold on simpler test molecules and broke on a more
    complex one (an aromatic ring plus other structure), producing a
    completely rewritten atom order and, downstream, real atoms
    mislabeled with the wrong element in the app.
    Map numbers sidestep the problem rather than relying on writer
    behavior: they're an explicit label carried BY each atom itself
    through the round-trip, independent of what index position it
    ends up parsed at. A caller that needs the true original index
    back should read atom.GetAtomMapNum() - 1 (falling back to
    atom.GetIdx() when GetAtomMapNum() is 0, i.e. this same function's
    no-ambiguity branch, which was never re-serialized and so never
    had map numbers added in the first place) rather than trusting
    the re-parsed atom's raw index - see src/api/main.py for where
    this translation actually happens (the only place that needs it;
    everything else can keep using each isomer's own self-consistent
    raw indices internally without translating anything).

    Enantiomer pairs are collapsed to a single representative: NMR
    (without a chiral shift reagent, which nothing here accounts for)
    cannot distinguish a molecule from its mirror image, so returning
    both would just double the work for two results that should be
    numerically identical - and in practice weren't quite identical,
    since each independently goes through stochastic conformer
    generation (see generate_conformers), so tiny cross-run numerical
    noise showed up as spuriously different multiplet labels between
    what were really the same real compound. A molecule with N
    unassigned stereocenters can have up to 2^N combinatorial
    assignments but at most 2^(N-1) chemically distinct diastereomers
    once enantiomer pairs are merged (exactly 2^(N-1) unless the
    molecule has an internal symmetry making some of those coincide,
    e.g. a meso compound - fewer still then).

    This is the real fix for the ambiguity generate_conformers's
    warning flags: rather than one number that may silently blend
    distinct diastereomers (e.g. cis/trans), run tier 2 on each
    distinct diastereomer separately and compare - see
    predict_multiplicity.py for where this gets used end-to-end.
    """

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Could not parse SMILES: {smiles}")

    # Every kind of open stereochemistry, not just tetrahedral centres - see
    # unassigned_stereo_elements. Skipping an unspecified alkene returned a
    # single blended prediction for two different compounds, with no warning.
    if not has_unassigned_stereo(mol):
        return [smiles]

    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(atom.GetIdx() + 1)

    options = StereoEnumerationOptions(
        onlyUnassigned=True, maxIsomers=max_isomers, unique=True
    )
    isomers = EnumerateStereoisomers(mol, options=options)
    all_smiles = [Chem.MolToSmiles(isomer) for isomer in isomers]

    seen = set()
    diastereomers = []

    for isomer_smiles in all_smiles:

        if isomer_smiles in seen:
            continue

        mirror_smiles = _mirror_image_smiles(Chem.MolFromSmiles(isomer_smiles))

        seen.add(isomer_smiles)
        seen.add(mirror_smiles)

        # Deterministic, arbitrary-but-consistent choice of which
        # enantiomer represents the pair (doesn't matter which -
        # their NMR predictions are meant to be identical). Both
        # candidates were written canonical=False from mols that
        # share the same atom order, so either choice preserves it.
        diastereomers.append(min(isomer_smiles, mirror_smiles))

    return diastereomers


@dataclass
class ConformerEnsemble:
    mol_h: "Chem.Mol"  # explicit-H mol with N embedded conformers
    energies: list  # MMFF energy (kcal/mol) per conformer, same order
    unassigned_stereocenters: list  # atom indices, see unassigned_stereocenters()


def generate_conformers(smiles, n_confs=30, seed=42, warn_unassigned_stereo=True):
    """
    Builds an explicit-H mol with n_confs embedded, MMFF-optimized
    conformers. Conformers that fail to optimize are dropped.

    If the molecule has unassigned stereocenters (see
    unassigned_stereocenters()) and warn_unassigned_stereo=True
    (default), prints a warning: results for such a molecule average
    across an arbitrary/inconsistent embedded configuration at each
    unassigned center, which can silently blend distinct diastereomers
    into one physically meaningless number - most concerning for ring
    systems, where cis/trans differences produce genuinely different
    spectra (see the trans-4-tert-butylcyclohexanol vs. no-stereo-tags
    comparison earlier in this project's development). This does NOT
    fix the ambiguity, only surfaces it - pass explicit stereo in the
    SMILES for a trustworthy answer, or disable the warning if you've
    already accounted for this some other way.
    """

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Could not parse SMILES: {smiles}")

    unassigned = unassigned_stereocenters(mol)

    if unassigned and warn_unassigned_stereo:
        print(
            f"WARNING: {smiles} has unassigned stereocenter(s) at atom(s) "
            f"{unassigned} - conformer embedding will pick an arbitrary "
            "configuration there, which can blend distinct diastereomers "
            "(e.g. cis/trans) into one meaningless averaged J. Supply "
            "explicit @/@@ stereo tags for a trustworthy result."
        )

    mol_h = Chem.AddHs(mol)

    conf_ids = AllChem.EmbedMultipleConfs(
        mol_h,
        numConfs=n_confs,
        randomSeed=seed,
        pruneRmsThresh=0.5,
    )

    energies = []
    valid_conf_ids = []

    results = AllChem.MMFFOptimizeMoleculeConfs(mol_h, maxIters=2000)
    # results: list of (not_converged, energy) per conformer, same
    # order as conf_ids
    for conf_id, (not_converged, energy) in zip(conf_ids, results):
        if not_converged == 0:  # 0 == converged
            valid_conf_ids.append(conf_id)
            energies.append(energy)

    if not energies:
        raise RuntimeError(
            f"No conformers converged for {smiles} - try a different seed "
            "or check the molecule for embedding issues."
        )

    # Keep only the converged conformers on the mol object.
    for conf_id in list(range(mol_h.GetNumConformers()))[::-1]:
        if conf_id not in valid_conf_ids:
            mol_h.RemoveConformer(conf_id)

    return ConformerEnsemble(
        mol_h=mol_h, energies=energies, unassigned_stereocenters=unassigned
    )


def _boltzmann_weights(energies, temperature_k=TEMPERATURE_K):

    min_energy = min(energies)
    relative = [e - min_energy for e in energies]
    raw_weights = [math.exp(-e / (R_KCAL * temperature_k)) for e in relative]
    total = sum(raw_weights)

    return [w / total for w in raw_weights]


def vicinal_h_pairs(mol_h, heavy_atom_i, heavy_atom_j):
    """
    Returns all (h_on_i, h_on_j) explicit-H index pairs for a bonded
    heavy-atom pair (i, j) - i.e. every H-C-C-H path between them.
    """

    atom_i = mol_h.GetAtomWithIdx(heavy_atom_i)
    atom_j = mol_h.GetAtomWithIdx(heavy_atom_j)

    h_on_i = [n.GetIdx() for n in atom_i.GetNeighbors() if n.GetSymbol() == "H"]
    h_on_j = [n.GetIdx() for n in atom_j.GetNeighbors() if n.GetSymbol() == "H"]

    return [(hi, hj) for hi in h_on_i for hj in h_on_j]


def _near_defined_stereocenter(mol, atom_idx, radius=2):
    """
    True if a defined tetrahedral stereocenter (Chem.ChiralType !=
    CHI_UNSPECIFIED) exists within `radius` bonds of atom_idx.
    Radius=2 matches the same local scope as vicinal (3-bond)
    coupling itself - a stereocenter far enough away that it can't
    plausibly influence the local geometry isn't checked.
    UNDEFINED stereocenters (no @ /@@ in the input SMILES) are NOT
    caught by this - see the "unspecified ring stereo" caveat in the
    module docstring and predict_multiplicity.py.
    """

    visited = set()
    frontier = {atom_idx}

    for _ in range(radius + 1):
        next_frontier = set()
        for idx in frontier:
            if idx in visited:
                continue
            visited.add(idx)
            atom = mol.GetAtomWithIdx(idx)
            if atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED:
                return True
            for neighbor in atom.GetNeighbors():
                if neighbor.GetIdx() not in visited:
                    next_frontier.add(neighbor.GetIdx())
        frontier = next_frontier

    return False


def _atom_is_prochiral_locked(mol, atom_idx):
    """
    True if this atom's own multiple H's (if it has more than one)
    cannot be assumed equivalent via free rotation - i.e. it's in a
    ring, or near a defined stereocenter. Only meaningful for atoms
    with exactly 2 H's (CH2-type) - see _effective_h_key below for
    why 3H (CH3-type) atoms are never subject to this regardless of
    this function's result.
    """

    atom = mol.GetAtomWithIdx(atom_idx)

    if atom.IsInRing():
        return True

    return _near_defined_stereocenter(mol, atom_idx)


def _effective_h_key(h_idx, parent_atom_idx, mol, h_ranks):
    """
    Grouping key for one explicit H atom, used to decide which H-H
    paths get averaged together. Two different rules depending on
    how many H's the PARENT heavy atom carries:

      - 3 H's (a methyl-type group): ALWAYS grouped by canonical
        rank, regardless of ring/stereocenter proximity. A methyl's
        3 protons interconvert via genuine, always-accessible 3-fold
        bond rotation - a real physical symmetry that a nearby
        stereocenter cannot prevent, so treating them as equivalent
        is correct even next to a locked ring or a stereocenter (this
        was the actual bug in the previous version: it disabled
        averaging for a plain terminal CH3 just because a stereocenter
        happened to be one bond away, producing a fake "ddd" for what
        is really a clean doublet).

      - 2 H's (a methylene/CH2-type group) AND the parent atom is
        prochiral-locked (_atom_is_prochiral_locked): grouped by the
        H's own index instead of rank, i.e. NEVER merged with its
        geminal partner. Swapping a CH2's two H's is not a rotation
        - it's a real configurational distinction once any nearby
        stereocenter or ring breaks the local mirror symmetry, so
        canonical rank (which was shown empirically to conflate them
        anyway) is bypassed entirely here.

      - Anything else (1 H, or a 2H atom that's NOT prochiral-locked,
        e.g. ClCCBr's freely-rotating CH2 with no stereocenter
        anywhere): grouped by canonical rank as usual.
    """

    parent = mol.GetAtomWithIdx(parent_atom_idx)
    n_hs = sum(1 for neighbor in parent.GetNeighbors() if neighbor.GetSymbol() == "H")

    if n_hs == 2 and _atom_is_prochiral_locked(mol, parent_atom_idx):
        return ("h", h_idx)

    return ("rank", h_ranks[h_idx])


def estimate_vicinal_coupling(smiles, heavy_atom_i, heavy_atom_j, ensemble=None, n_confs=30):
    """
    Boltzmann-weighted J estimate (Hz) between the protons on two
    bonded heavy atoms (heavy_atom_i, heavy_atom_j - indices as in
    Chem.MolFromSmiles(smiles), matching predict.py/multiplicity.py
    convention).

    Returns one J value per DISTINCT equivalence group of H-H paths
    (not one per raw path). Grouping is decided per H atom via
    _effective_h_key (see there for the full rule) - in short: a
    genuinely prochiral CH2 (in a ring, or near a defined
    stereocenter) never merges its two H's with each other, while a
    freely-rotating CH3 always merges its three H's with each other
    regardless of what's nearby, since methyl rotation is a real
    physical symmetry a stereocenter cannot prevent. This handles
    mixed cases correctly - e.g. a CH2 adjacent to a stereocenter,
    itself bonded to a terminal CH3, correctly reports 2 distinct J
    values (one per diastereotopic CH2 proton), each already
    rotation-averaged over the CH3's 3 equivalent protons - rather
    than either wrongly collapsing to 1 value or wrongly exploding
    into 6 raw un-averaged values.

    Note: plain canonical ranking alone does NOT reliably distinguish
    diastereotopic protons that aren't themselves marked stereocenters
    (verified empirically - it incorrectly collapsed a locked ring's
    genuine 13/4 Hz split into one averaged ~8.5 Hz value), which is
    why prochiral-locked CH2s bypass it entirely rather than trusting
    it to sort paths correctly on its own.

    Pass a pre-built ensemble (from generate_conformers) to reuse it
    across multiple atom pairs in the same molecule instead of
    re-embedding conformers each call.

    Returns a dict: {j_values_hz, n_conformers, n_h_pairs}
    """

    if ensemble is None:
        ensemble = generate_conformers(smiles, n_confs=n_confs)

    mol_h = ensemble.mol_h
    weights = _boltzmann_weights(ensemble.energies)

    # includeAtomMaps=False for the same reason as canonical_ranks in
    # multiplicity.py: these ranks group the protons on a heavy atom to decide
    # how many equivalent sets of vicinal partners exist, and a unique map
    # number would make every proton look distinct and collapse the coupling
    # analysis. includeChirality=True stays - diastereotopic protons really do
    # couple differently.
    h_ranks = list(
        Chem.CanonicalRankAtoms(
            mol_h, breakTies=False, includeChirality=True, includeAtomMaps=False
        )
    )

    h_pairs = vicinal_h_pairs(mol_h, heavy_atom_i, heavy_atom_j)

    if not h_pairs:
        raise ValueError(
            f"No H-C-C-H path found between heavy atoms "
            f"{heavy_atom_i} and {heavy_atom_j}."
        )

    per_path_j = {}

    for h_i, h_j in h_pairs:

        j_values = []

        for conf_id in range(mol_h.GetNumConformers()):
            conformer = mol_h.GetConformer(conf_id)
            dihedral = rdMolTransforms.GetDihedralDeg(
                conformer, h_i, heavy_atom_i, heavy_atom_j, h_j
            )
            j_values.append(karplus_J(dihedral))

        per_path_j[(h_i, h_j)] = sum(w * j for w, j in zip(weights, j_values))

    equivalence_groups = {}
    for (h_i, h_j), weighted_j in per_path_j.items():
        key_i = _effective_h_key(h_i, heavy_atom_i, mol_h, h_ranks)
        key_j = _effective_h_key(h_j, heavy_atom_j, mol_h, h_ranks)
        key = tuple(sorted((key_i, key_j)))
        equivalence_groups.setdefault(key, []).append(weighted_j)

    j_values_hz = [
        sum(values) / len(values) for values in equivalence_groups.values()
    ]

    return {
        "j_values_hz": j_values_hz,
        "n_conformers": mol_h.GetNumConformers(),
        "n_h_pairs": len(h_pairs),
    }


def estimate_all_vicinal_couplings(smiles, n_confs=30, carbon_only=True):
    """
    Runs estimate_vicinal_coupling() for every bonded heavy-atom pair
    that has at least one vicinal H-C-C-H path (same neighbor
    relationships multiplicity.py's neighbor_h_groups considers:
    excludes exchangeable-atom neighbors and symmetry-equivalent
    neighbor pairs are naturally deduplicated by the caller if
    desired via ranks).

    Returns a list of dicts, one per (atom_i, atom_j) pair with
    atom_i < atom_j, each including the coupling stats plus the
    canonical ranks of both atoms (so equivalent pairs, e.g. both
    ortho positions in a symmetric ring, can be spotted/deduplicated
    downstream).
    """

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Could not parse SMILES: {smiles}")

    ranks = canonical_ranks(mol)
    ensemble = generate_conformers(smiles, n_confs=n_confs)

    seen_pairs = set()
    results = []

    for bond in mol.GetBonds():

        i, j = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        atom_i, atom_j = mol.GetAtomWithIdx(i), mol.GetAtomWithIdx(j)

        if carbon_only and (atom_i.GetSymbol() != "C" or atom_j.GetSymbol() != "C"):
            continue
        if atom_i.GetSymbol() in EXCHANGEABLE_ELEMENTS or atom_j.GetSymbol() in EXCHANGEABLE_ELEMENTS:
            continue
        if atom_i.GetTotalNumHs() == 0 or atom_j.GetTotalNumHs() == 0:
            continue

        pair_key = tuple(sorted((i, j)))
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        coupling = estimate_vicinal_coupling(smiles, i, j, ensemble=ensemble)

        results.append(
            {
                "atom_i": pair_key[0],
                "atom_j": pair_key[1],
                "rank_i": ranks[pair_key[0]],
                "rank_j": ranks[pair_key[1]],
                "j_values_hz": coupling["j_values_hz"],
                "n_conformers": coupling["n_conformers"],
            }
        )

    return results
