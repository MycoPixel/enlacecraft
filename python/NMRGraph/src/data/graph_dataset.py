"""
Builds molecular graphs (nodes = atoms, edges = bonds) directly from
the NMRShiftDB SDF file, for the GNN.

Unlike the tabular pipeline (features.py + build_ml_dataset.py), this
does NOT hand-aggregate neighbor counts / bond counts — the whole
point of a GNN is that message passing learns that aggregation
itself. Node features here are just the atom's own properties.

Molecules come straight from nmrshiftdb.py's iter_molecules(), which
uses removeHs=False. Note that this only means "don't strip Hs if the
molblock has them" - it does NOT add hydrogens. NMRShiftDB's SDF only
encodes heavy atoms, so in practice these graphs contain no explicit
H nodes; hydrogen count only shows up indirectly via total_hs in the
node features. Atom indices here line up exactly with the atom
indices used in parse_c13_signals() — no reindexing needed. Anything
that builds a graph from a SMILES for inference (see predict.py) must
NOT call Chem.AddHs() first, or the graph shape won't match training.
"""

from dataclasses import dataclass, field

import torch
from rdkit.Chem.rdchem import BondType

from src.data.features import HYBRIDIZATION_MAP
from src.data.geometry import build_geo_edges, load_geometry_cache
from src.data.nmrshiftdb import (
    get_db_id,
    get_smiles,
    iter_molecules,
    parse_c13_signals,
    parse_h1_signals,
)


ELEMENTS = ["C", "H", "N", "O", "S", "F", "Cl", "Br", "I", "P"]
ELEMENT_INDEX = {symbol: i for i, symbol in enumerate(ELEMENTS)}
NUM_ELEMENTS = len(ELEMENTS) + 1  # +1 for "other"

NUM_HYBRIDIZATIONS = len(HYBRIDIZATION_MAP)

# Node feature layout:
#   [ one-hot element (NUM_ELEMENTS) ]
#   [ one-hot hybridization (NUM_HYBRIDIZATIONS) ]
#   [ degree, formal_charge, total_hs, is_aromatic, is_in_ring ]
NODE_FEATURE_DIM = NUM_ELEMENTS + NUM_HYBRIDIZATIONS + 5

# One relation per bond type, used as separate adjacency channels,
# PLUS one more relation (index NUM_RELATIONS - 1, i.e. last) for the
# through-space geometric channel from geometry.py - see
# RelationalGraphConv in gnn.py, which loops generically over
# num_relations and does not need to know this last one is different
# in kind (continuous-weighted, not binary) from the bond relations;
# a weighted adjacency degree-normalizes and message-passes exactly
# the same way a binary one does.
BOND_TYPES = [
    BondType.SINGLE,
    BondType.DOUBLE,
    BondType.TRIPLE,
    BondType.AROMATIC,
]
GEO_RELATION_INDEX = len(BOND_TYPES)
NUM_RELATIONS = len(BOND_TYPES) + 1


def _element_one_hot(symbol):

    vector = [0.0] * NUM_ELEMENTS
    vector[ELEMENT_INDEX.get(symbol, NUM_ELEMENTS - 1)] = 1.0

    return vector


def _decode_element(node_feat):
    """
    Inverse of _element_one_hot: given a full node feature vector,
    read back the element symbol from its one-hot prefix (the first
    NUM_ELEMENTS entries). Returns "other" for anything outside the
    training vocabulary (see ELEMENTS above).
    """

    one_hot = node_feat[:NUM_ELEMENTS]
    index = one_hot.index(max(one_hot))

    return ELEMENTS[index] if index < len(ELEMENTS) else "other"


def _hybridization_one_hot(atom):

    vector = [0.0] * NUM_HYBRIDIZATIONS
    index = HYBRIDIZATION_MAP.get(str(atom.GetHybridization()), 0)
    vector[index] = 1.0

    return vector


def _node_features(atom):

    return (
        _element_one_hot(atom.GetSymbol())
        + _hybridization_one_hot(atom)
        + [
            float(atom.GetDegree()),
            float(atom.GetFormalCharge()),
            float(atom.GetTotalNumHs()),
            float(atom.GetIsAromatic()),
            float(atom.IsInRing()),
        ]
    )


@dataclass
class MoleculeGraph:

    db_id: int
    smiles: str
    node_features: list
    bonds: list  # list of (atom_i, atom_j, relation_index)
    geo_edges: list = field(default_factory=list)  # (atom_i, atom_j, weight) - see geometry.py
    targets: dict = field(default_factory=dict)  # atom_index -> 13C shift_ppm
    h1_targets: dict = field(default_factory=dict)  # atom_index -> 1H shift_ppm

    @property
    def num_atoms(self):
        return len(self.node_features)


def mol_to_graph(mol, db_id, smiles, geo_coords=None):
    """
    Convert an RDKit mol (implicit Hs, as parsed from the SDF or a
    SMILES string - do not call Chem.AddHs() beforehand) into a
    MoleculeGraph.

    geo_coords : numpy array or None
        Heavy-atom 3D coordinates from geometry.py's cache (indices
        must already line up with `mol`'s own atom indices - see
        geometry.py's INDEX ALIGNMENT note). None (the default, and
        what you get for any molecule the geometry cache failed to
        embed) means this graph simply gets no through-space edges -
        it still trains normally on bonds alone.
    """

    node_features = [
        _node_features(atom) for atom in mol.GetAtoms()
    ]

    bonds = []

    for bond in mol.GetBonds():

        bond_type = bond.GetBondType()

        if bond_type not in BOND_TYPES:
            # Rare bond types (e.g. dative) fall back to SINGLE so
            # the edge isn't silently dropped.
            relation = 0
        else:
            relation = BOND_TYPES.index(bond_type)

        i = bond.GetBeginAtomIdx()
        j = bond.GetEndAtomIdx()

        bonds.append((i, j, relation))

    geo_edges = build_geo_edges(mol, geo_coords)

    targets = {
        signal["atom_index"]: signal["shift_ppm"]
        for signal in parse_c13_signals(mol)
    }

    h1_targets = {
        signal["atom_index"]: signal["shift_ppm"]
        for signal in parse_h1_signals(mol)
    }

    return MoleculeGraph(
        db_id=db_id,
        smiles=smiles,
        node_features=node_features,
        bonds=bonds,
        geo_edges=geo_edges,
        targets=targets,
        h1_targets=h1_targets,
    )


def restrict_h1_to_carbon(graphs):
    """
    Returns new MoleculeGraph objects with h1_targets filtered down
    to only carbon-attached protons, dropping exchangeable-type
    targets (O-H, N-H, S-H). Those are inherently noisier training
    signals - the database can only record one number for something
    whose real shift depends on concentration/solvent/temperature -
    and evaluate_gnn_h1.py showed roughly 4x higher error on them
    (0.97 ppm MAE vs 0.25 ppm for ordinary C-H). A model trained only
    on C-H targets isn't wasting capacity trying to fit that noise.

    Graphs left with no h1_targets after filtering (e.g. a molecule
    whose only assigned proton was an O-H) are dropped entirely,
    since split_graphs/collate_graphs_h1 downstream expect every kept
    graph to have contributed a nonzero target when nucleus="h1" was
    used to build them.

    Does not touch mol_to_graph, parse_h1_signals, or build_graphs -
    this is a pure post-processing filter, so the "all protons"
    pipeline (gnn_h1_v1.pt) is completely unaffected.
    """

    filtered = []

    for graph in graphs:

        carbon_only = {
            atom_index: shift
            for atom_index, shift in graph.h1_targets.items()
            if _decode_element(graph.node_features[atom_index]) == "C"
        }

        if not carbon_only:
            continue

        filtered.append(
            MoleculeGraph(
                db_id=graph.db_id,
                smiles=graph.smiles,
                node_features=graph.node_features,
                bonds=graph.bonds,
                geo_edges=graph.geo_edges,
                targets=graph.targets,
                h1_targets=carbon_only,
            )
        )

    return filtered


def build_graphs(input_file=None, max_atoms=None, nucleus="c13", use_geometry=False, geometry_cache_file=None):
    """
    Parse the whole SDF into a list of MoleculeGraph objects.

    Parameters
    ----------
    input_file : Path, optional
        Passed straight through to iter_molecules (defaults to
        data/raw/nmrshiftdb2withsignals.sd).
    max_atoms : int, optional
        Skip molecules with more atoms than this (guards against a
        handful of huge outliers blowing up batch padding).
    nucleus : {"c13", "h1", "both"}
        Which signal type a molecule must have at least one assigned
        value for, to be kept. "c13" is the default and matches this
        function's original (pre-1H) behavior exactly, so existing
        13C training/eval runs are unaffected. Use "h1" to build the
        proton dataset, or "both" to keep anything with either (e.g.
        for future joint multi-task training).
    use_geometry : bool
        If True, load the precomputed geometry cache (see
        src/data/geometry.py - run build_geometry_cache() once
        before using this) and attach through-space edges to every
        graph. Default False, so every existing call site
        (train_gnn.py, train_gnn_h1_ch.py, evaluate_*.py, etc. as of
        before this feature was added) is completely unaffected
        unless explicitly opted in.
    geometry_cache_file : Path, optional
        Passed to load_geometry_cache if use_geometry=True. Defaults
        to geometry.py's DEFAULT_CACHE_FILE.
    """

    if nucleus not in ("c13", "h1", "both"):
        raise ValueError(f"nucleus must be 'c13', 'h1', or 'both', got {nucleus!r}")

    geo_cache = None
    if use_geometry:
        kwargs_cache = {} if geometry_cache_file is None else {"cache_file": geometry_cache_file}
        geo_cache = load_geometry_cache(**kwargs_cache)

    graphs = []

    kwargs = {} if input_file is None else {"input_file": input_file}

    for mol in iter_molecules(**kwargs):

        db_id = get_db_id(mol)
        if db_id is None:
            continue

        geo_coords = geo_cache.get(db_id) if geo_cache is not None else None

        graph = mol_to_graph(
            mol,
            db_id=db_id,
            smiles=get_smiles(mol),
            geo_coords=geo_coords,
        )

        has_c13 = bool(graph.targets)
        has_h1 = bool(graph.h1_targets)

        keep = (
            (nucleus == "c13" and has_c13)
            or (nucleus == "h1" and has_h1)
            or (nucleus == "both" and (has_c13 or has_h1))
        )

        if not keep:
            continue

        if max_atoms is not None and graph.num_atoms > max_atoms:
            continue

        graphs.append(graph)

    return graphs


def split_graphs(graphs, test_size=0.20, val_size=0.10, random_state=42):
    """
    Molecule-level train/val/test split, shared by train_gnn.py and
    evaluate_gnn.py so both always operate on the identical split
    (same random_state, same order-of-first-appearance for the id
    list) rather than risking drift from copy-pasted logic.

    Returns
    -------
    train_graphs, val_graphs, test_graphs : lists of MoleculeGraph
    """

    from sklearn.model_selection import train_test_split

    db_ids = [graph.db_id for graph in graphs]
    unique_ids = list(dict.fromkeys(db_ids))  # preserve first-seen order

    train_ids, test_ids = train_test_split(
        unique_ids,
        test_size=test_size,
        random_state=random_state,
    )
    train_ids = set(train_ids)
    test_ids = set(test_ids)

    train_id_list = sorted(train_ids)
    train_ids_fit, val_ids = train_test_split(
        train_id_list,
        test_size=val_size,
        random_state=random_state,
    )
    train_ids_fit = set(train_ids_fit)
    val_ids = set(val_ids)

    train_graphs = [g for g in graphs if g.db_id in train_ids_fit]
    val_graphs = [g for g in graphs if g.db_id in val_ids]
    test_graphs = [g for g in graphs if g.db_id in test_ids]

    return train_graphs, val_graphs, test_graphs


def _collate_common(graphs):
    """
    Shared padding logic for both nuclei: builds the node feature and
    adjacency tensors, which don't depend on which signal type you're
    predicting. Returns (node_features, adjacency, atom_mask, max_atoms).
    """

    batch_size = len(graphs)
    max_atoms = max(graph.num_atoms for graph in graphs)

    node_features = torch.zeros(batch_size, max_atoms, NODE_FEATURE_DIM)
    adjacency = torch.zeros(batch_size, NUM_RELATIONS, max_atoms, max_atoms)
    atom_mask = torch.zeros(batch_size, max_atoms, dtype=torch.bool)

    for b, graph in enumerate(graphs):

        n = graph.num_atoms

        node_features[b, :n] = torch.tensor(graph.node_features)
        atom_mask[b, :n] = True

        for i, j, relation in graph.bonds:
            adjacency[b, relation, i, j] = 1.0
            adjacency[b, relation, j, i] = 1.0

        for i, j, weight in graph.geo_edges:
            adjacency[b, GEO_RELATION_INDEX, i, j] = weight
            adjacency[b, GEO_RELATION_INDEX, j, i] = weight

    return node_features, adjacency, atom_mask, max_atoms


def _collate_targets(graphs, target_attr, batch_size, max_atoms):

    targets = torch.zeros(batch_size, max_atoms)
    target_mask = torch.zeros(batch_size, max_atoms, dtype=torch.bool)

    for b, graph in enumerate(graphs):
        for atom_index, shift in getattr(graph, target_attr).items():
            targets[b, atom_index] = shift
            target_mask[b, atom_index] = True

    return targets, target_mask


def collate_graphs(graphs):
    """
    Pad a list of MoleculeGraph into batched dense tensors, targeting
    13C shifts. Unchanged signature/behavior from before 1H support
    was added - existing 13C training/eval/predict code is unaffected.

    Returns
    -------
    node_features : (batch, max_atoms, NODE_FEATURE_DIM)
    adjacency     : (batch, NUM_RELATIONS, max_atoms, max_atoms)
    targets       : (batch, max_atoms)
    target_mask   : (batch, max_atoms)  bool, True where a shift exists
    atom_mask     : (batch, max_atoms)  bool, True for real (non-pad) atoms
    """

    node_features, adjacency, atom_mask, max_atoms = _collate_common(graphs)
    targets, target_mask = _collate_targets(
        graphs, "targets", len(graphs), max_atoms
    )

    return node_features, adjacency, targets, target_mask, atom_mask


def collate_graphs_h1(graphs):
    """
    Same as collate_graphs, but targeting 1H shifts (graph.h1_targets)
    instead of 13C. Same tensor shapes/semantics, just a different
    signal type - see parse_h1_signals() in nmrshiftdb.py for how
    those targets are derived (one averaged shift per heavy atom).
    """

    node_features, adjacency, atom_mask, max_atoms = _collate_common(graphs)
    targets, target_mask = _collate_targets(
        graphs, "h1_targets", len(graphs), max_atoms
    )

    return node_features, adjacency, targets, target_mask, atom_mask
