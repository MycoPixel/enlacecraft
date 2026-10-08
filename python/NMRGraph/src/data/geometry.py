"""
Precomputes 3D heavy-atom geometry per molecule and derives a
through-space "relation" channel for the GNN, on top of the existing
bond-type relations (single/double/triple/aromatic) in graph_dataset.py.

WHY: the bond graph alone cannot represent ring-current shielding or
any other through-space effect - an atom sitting near (but not
bonded to) an aromatic ring is invisible to a 2D message-passing GNN.
This module adds exactly that missing signal as one more adjacency
channel, using the SAME RelationalGraphConv machinery already in
gnn.py (which loops generically over num_relations and does not know
or care what a "relation" physically means) - so NO changes are
needed to gnn.py itself, only to how the adjacency tensor is built.

GEOMETRY SOURCE: reuses the same embedding approach as
coupling_karplus.py (Chem.AddHs + MMFF), but deliberately uses ONE
optimized conformer per molecule here, not a 30-conformer Boltzmann
ensemble - full ensembles for ~33K molecules would be expensive for a
first pass at "does this feature help at all". If it does, upgrading
to Boltzmann-averaged geometry (mirroring estimate_vicinal_coupling's
approach) is a natural follow-up, not a redesign - the cache format
below already stores one coordinate array per molecule, and averaging
in a second (or third, ...) conformer's contribution to the
distance-weighted adjacency is an additive change, not a rewrite.

INDEX ALIGNMENT: per coupling_karplus.py's own documented behavior,
Chem.AddHs() preserves original heavy-atom indices and appends new H
atoms afterward. So heavy-atom coordinates read off the embedded,
explicit-H conformer line up EXACTLY with graph_dataset.py's
MoleculeGraph.node_features indices (which come from the implicit-H
mol) - no remapping needed, as long as the input mol passed here is
the same implicit-H mol used to build the graph (do not call AddHs
yourself before calling embed_heavy_atom_coords).

FAILURE HANDLING: MMFF embedding fails for a real (small) fraction of
structures - disconnected fragments, exotic valences, salts (you've
already seen sanitize failures for some of these in nmrshiftdb.py's
iter_molecules logs). Molecules where embedding fails get coords=None
in the cache and simply contribute an all-zero geometric channel
downstream (see graph_dataset.py's build_geo_adjacency) - they are
NOT dropped from the dataset, they just train on bonds alone for that
one extra channel, same as before this feature existed.
"""

import pickle
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem

from src.data.nmrshiftdb import get_db_id, iter_molecules


DEFAULT_CACHE_FILE = Path("data/processed/geometry_cache.pkl")

# Through-space relation parameters. Ring-current shielding and
# similar through-space effects operate over roughly a few bond
# lengths (~3-6 Angstrom is the physically relevant range for
# ring-current effects specifically) - CUTOFF_ANGSTROM bounds how far
# a pair can be and still count, RBF_SIGMA controls how fast the
# weight falls off with distance inside that cutoff (Gaussian RBF,
# weight = exp(-(d/sigma)^2), so a well-separated pair near the
# cutoff contributes a small but nonzero weight rather than a hard
# cliff at the boundary).
CUTOFF_ANGSTROM = 5.0
RBF_SIGMA = 1.5

# Minimum TOPOLOGICAL (bond-graph) distance for a pair to be eligible
# for the geometric relation at all. 2 excludes both directly-bonded
# pairs (already captured by the existing bond-type relations - no
# reason to double-encode them) AND 1-3 (two-bonds-apart) pairs,
# since those are already strongly implied by the 2D graph via a
# single intermediate node; this channel is meant to capture
# information the bond graph does NOT already carry.
MIN_TOPOLOGICAL_DISTANCE = 3


def embed_heavy_atom_coords(mol, seed=42):
    """
    Generate one MMFF-optimized 3D conformer for `mol` (an
    implicit-H mol, e.g. straight from iter_molecules - do NOT pass
    an already-AddHs'd mol) and return an (num_heavy_atoms, 3) numpy
    array of heavy-atom coordinates, indexed identically to `mol`'s
    own atom indices.

    Returns None if embedding or MMFF optimization fails (see module
    docstring - FAILURE HANDLING) rather than raising, so callers can
    process a whole dataset without a single bad structure aborting
    the run.
    """

    try:

        # Disconnected structures (salts, counterions - not rare in
        # NMRShiftDB deposits) are NOT safe to embed as one system:
        # RDKit's embedder does not raise for them, it just places
        # fragments at arbitrary/overlapping positions relative to
        # each other (confirmed empirically - two separate ions came
        # back at IDENTICAL coordinates, which would silently inject
        # a spurious zero-distance/max-weight geo edge between atoms
        # that aren't even part of the same physical structure).
        # Bail out to the same coords=None fallback as any other
        # embedding failure.
        if len(Chem.GetMolFrags(mol)) > 1:
            return None

        mol_h = Chem.AddHs(mol)

        # A single embedding attempt fails more often than you'd
        # expect for anything with real ring strain or a fused/bridged
        # system - a handful of retries with different seeds recovers
        # a meaningful fraction of those at low extra cost. This will
        # NOT rescue genuinely pathological cases (e.g.
        # [2.2]paracyclophane and similarly extreme-strain macrocycles
        # - confirmed via manual testing to still fail even across 50
        # seeds with relaxed ETKDG parameters, so that's a known hard
        # case for distance-geometry embedding generally, not
        # something a few more retries fixes), but does help the more
        # common "moderately strained, just needs another roll of the
        # dice" case.
        embedded = False
        for retry_seed in (seed, seed + 1, seed + 2):
            embed_result = AllChem.EmbedMolecule(
                mol_h, randomSeed=retry_seed, useRandomCoords=True
            )
            if embed_result == 0:
                embedded = True
                break

        if not embedded:
            return None

        optimize_result = AllChem.MMFFOptimizeMolecule(mol_h)
        if optimize_result != 0:
            # 0 = converged, 1 = did not converge within max
            # iterations. A non-converged geometry is still a
            # reasonable rough 3D structure (same tolerance already
            # accepted by coupling_karplus.py's conformer generation)
            # - only a hard exception below is treated as failure.
            pass

        conformer = mol_h.GetConformer()
        num_heavy = mol.GetNumAtoms()

        coords = np.array(
            [
                list(conformer.GetAtomPosition(i))
                for i in range(num_heavy)
            ]
        )

        return coords

    except Exception:
        return None


def build_geometry_cache(output_file=DEFAULT_CACHE_FILE, input_file=None, seed=42):
    """
    Runs embed_heavy_atom_coords() over every molecule in the
    NMRShiftDB SDF and saves {db_id: coords_or_None} to
    `output_file`. This is the expensive, one-time step - graph
    building (graph_dataset.py) reads this cache rather than
    re-embedding conformers on every run.

    Molecules with no db_id are skipped (same filter build_graphs
    already applies), so cache keys line up with the db_ids used
    elsewhere.
    """

    kwargs = {} if input_file is None else {"input_file": input_file}

    cache = {}
    n_ok = 0
    n_failed = 0

    for mol in iter_molecules(**kwargs):

        db_id = get_db_id(mol)
        if db_id is None:
            continue

        coords = embed_heavy_atom_coords(mol, seed=seed)

        cache[db_id] = coords

        if coords is None:
            n_failed += 1
        else:
            n_ok += 1

    output_file = Path(output_file)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "wb") as f:
        pickle.dump(cache, f)

    print(f"Embedded {n_ok:,} molecules, failed {n_failed:,}")
    print(f"Cache saved to: {output_file}")

    return cache


def load_geometry_cache(cache_file=DEFAULT_CACHE_FILE):

    cache_file = Path(cache_file)
    if not cache_file.exists():
        raise FileNotFoundError(
            f"Geometry cache not found at {cache_file} - run "
            f"build_geometry_cache() first (see "
            f"src/data/geometry.py, python -m src.data.geometry)."
        )

    with open(cache_file, "rb") as f:
        return pickle.load(f)


def _topological_distances(mol):
    """
    All-pairs shortest bond-path length between heavy atoms, via
    RDKit's own topological distance matrix (BFS over the bond
    graph, not through-space) - used to exclude directly- and
    2-bonds-apart pairs from the geometric relation (see
    MIN_TOPOLOGICAL_DISTANCE above).
    """

    return Chem.GetDistanceMatrix(mol)


def build_geo_edges(mol, coords):
    """
    Given a molecule and its heavy-atom coordinates (from the
    geometry cache; may be None if embedding failed for this
    molecule), return a list of (atom_i, atom_j, weight) edges for
    the through-space relation channel.

    If coords is None (embedding failed for this molecule), returns
    an empty list - the molecule still trains normally, just with no
    contribution on this one extra channel (see module docstring,
    FAILURE HANDLING).
    """

    if coords is None:
        return []

    num_atoms = mol.GetNumAtoms()
    topo_dist = _topological_distances(mol)

    edges = []

    for i in range(num_atoms):
        for j in range(i + 1, num_atoms):

            if topo_dist[i, j] < MIN_TOPOLOGICAL_DISTANCE:
                continue

            d = float(np.linalg.norm(coords[i] - coords[j]))

            if d > CUTOFF_ANGSTROM:
                continue

            weight = float(np.exp(-((d / RBF_SIGMA) ** 2)))
            edges.append((i, j, weight))

    return edges


def parse_molfile_with_coords(molfile):
    """
    Parse a V2000 molfile that already has explicit hydrogens and
    real 3D coordinates (e.g. EnlaceCraft's embed3d.ts/xtbRefine.ts
    output) into (mol, coords, smiles) - an implicit-H mol matching
    the same convention used everywhere else in this codebase, its
    heavy-atom coordinates, and a SMILES string for display.

    Unlike embed_heavy_atom_coords (which generates its OWN geometry
    from scratch via MMFF, blind to any real structure the caller
    might already have), this function trusts the caller's
    coordinates entirely and never re-embeds - connectivity AND
    geometry both come from the same molfile, so there is no
    separate atom-ordering alignment step needed (see this project's
    notes on why aligning two independently-parsed structures is
    risky - this sidesteps that by construction, never combining
    coordinates from one parse with connectivity from another).

    Real 3D coordinates already fully determine stereochemistry
    (there's no "which stereoisomer did you mean" ambiguity the way
    there is starting from a bare 2D SMILES with unspecified ring
    stereocenters) - AssignStereochemistryFrom3D makes that explicit
    on the returned mol/SMILES, so callers using this path should
    skip stereoisomer enumeration entirely (see
    enumerate_stereoisomers in coupling_karplus.py - that machinery
    is for resolving 2D ambiguity, which doesn't exist here).

    Raises ValueError (not a silent None) on a bad molfile, since a
    request explicitly providing geometry should fail loudly if that
    geometry can't be used, rather than quietly falling back to
    something the caller didn't ask for.
    """

    mol_h = Chem.MolFromMolBlock(molfile, removeHs=False)

    if mol_h is None:
        raise ValueError("Could not parse molfile")

    if mol_h.GetNumConformers() == 0:
        raise ValueError("Molfile has no 3D coordinates")

    Chem.AssignStereochemistryFrom3D(mol_h)

    # RemoveHs is documented to preserve the relative order of the
    # remaining (heavy) atoms, and carries the conformer over with
    # it - so the resulting mol's own coordinates already line up
    # index-for-index with its own connectivity. No manual bookkeeping
    # between two separately-parsed mols needed.
    mol = Chem.RemoveHs(mol_h)

    conformer = mol.GetConformer()
    coords = np.array(
        [
            list(conformer.GetAtomPosition(i))
            for i in range(mol.GetNumAtoms())
        ]
    )

    smiles = Chem.MolToSmiles(mol)

    return mol, coords, smiles


def main():
    build_geometry_cache()


if __name__ == "__main__":
    main()
