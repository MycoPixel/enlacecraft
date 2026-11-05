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
from src.data.nmrshiftdb import (
    get_db_id,
    get_smiles,
    iter_molecules,
    parse_c13_signals,
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

# One relation per bond type, used as separate adjacency channels.
BOND_TYPES = [
    BondType.SINGLE,
    BondType.DOUBLE,
    BondType.TRIPLE,
    BondType.AROMATIC,
]
NUM_RELATIONS = len(BOND_TYPES)


def _element_one_hot(symbol):

    vector = [0.0] * NUM_ELEMENTS
    vector[ELEMENT_INDEX.get(symbol, NUM_ELEMENTS - 1)] = 1.0

    return vector


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
    targets: dict = field(default_factory=dict)  # atom_index -> shift_ppm

    @property
    def num_atoms(self):
        return len(self.node_features)


def mol_to_graph(mol, db_id, smiles):
    """
    Convert an RDKit mol (implicit Hs, as parsed from the SDF or a
    SMILES string - do not call Chem.AddHs() beforehand) into a
    MoleculeGraph.
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

    targets = {
        signal["atom_index"]: signal["shift_ppm"]
        for signal in parse_c13_signals(mol)
    }

    return MoleculeGraph(
        db_id=db_id,
        smiles=smiles,
        node_features=node_features,
        bonds=bonds,
        targets=targets,
    )


def build_graphs(input_file=None, max_atoms=None):
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
    """

    graphs = []

    kwargs = {} if input_file is None else {"input_file": input_file}

    for mol in iter_molecules(**kwargs):

        db_id = get_db_id(mol)
        if db_id is None:
            continue

        graph = mol_to_graph(
            mol,
            db_id=db_id,
            smiles=get_smiles(mol),
        )

        if not graph.targets:
            # No assigned carbon signals -> nothing to train/eval on.
            continue

        if max_atoms is not None and graph.num_atoms > max_atoms:
            continue

        graphs.append(graph)

    return graphs


def collate_graphs(graphs):
    """
    Pad a list of MoleculeGraph into batched dense tensors.

    Returns
    -------
    node_features : (batch, max_atoms, NODE_FEATURE_DIM)
    adjacency     : (batch, NUM_RELATIONS, max_atoms, max_atoms)
    targets       : (batch, max_atoms)
    target_mask   : (batch, max_atoms)  bool, True where a shift exists
    atom_mask     : (batch, max_atoms)  bool, True for real (non-pad) atoms
    """

    batch_size = len(graphs)
    max_atoms = max(graph.num_atoms for graph in graphs)

    node_features = torch.zeros(batch_size, max_atoms, NODE_FEATURE_DIM)
    adjacency = torch.zeros(batch_size, NUM_RELATIONS, max_atoms, max_atoms)
    targets = torch.zeros(batch_size, max_atoms)
    target_mask = torch.zeros(batch_size, max_atoms, dtype=torch.bool)
    atom_mask = torch.zeros(batch_size, max_atoms, dtype=torch.bool)

    for b, graph in enumerate(graphs):

        n = graph.num_atoms

        node_features[b, :n] = torch.tensor(graph.node_features)
        atom_mask[b, :n] = True

        for i, j, relation in graph.bonds:
            adjacency[b, relation, i, j] = 1.0
            adjacency[b, relation, j, i] = 1.0

        for atom_index, shift in graph.targets.items():
            targets[b, atom_index] = shift
            target_mask[b, atom_index] = True

    return node_features, adjacency, targets, target_mask, atom_mask
