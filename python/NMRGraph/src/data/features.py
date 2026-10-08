from rdkit.Chem.rdchem import Atom, BondType

HYBRIDIZATION_MAP = {
    "UNSPECIFIED": 0,
    "S": 1,
    "SP": 2,
    "SP2": 3,
    "SP3": 4,
    "SP3D": 5,
    "SP3D2": 6,
}


def atom_features(atom: Atom) -> dict:
    """
    Extract machine learning features from a single RDKit atom.
    """

    hybridization = str(atom.GetHybridization())

    # -------------------------
    # Neighbor atom counts
    # -------------------------

    carbon_neighbors = 0
    oxygen_neighbors = 0
    nitrogen_neighbors = 0
    sulfur_neighbors = 0
    phosphorus_neighbors = 0
    fluorine_neighbors = 0
    chlorine_neighbors = 0
    bromine_neighbors = 0
    iodine_neighbors = 0

    for neighbor in atom.GetNeighbors():

        symbol = neighbor.GetSymbol()

        if symbol == "C":
            carbon_neighbors += 1
        elif symbol == "O":
            oxygen_neighbors += 1
        elif symbol == "N":
            nitrogen_neighbors += 1
        elif symbol == "S":
            sulfur_neighbors += 1
        elif symbol == "P":
            phosphorus_neighbors += 1
        elif symbol == "F":
            fluorine_neighbors += 1
        elif symbol == "Cl":
            chlorine_neighbors += 1
        elif symbol == "Br":
            bromine_neighbors += 1
        elif symbol == "I":
            iodine_neighbors += 1

    # -------------------------
    # Bond type counts
    # -------------------------

    single_bonds = 0
    double_bonds = 0
    triple_bonds = 0
    aromatic_bonds = 0

    for bond in atom.GetBonds():

        bond_type = bond.GetBondType()

        if bond_type == BondType.SINGLE:
            single_bonds += 1

        elif bond_type == BondType.DOUBLE:
            double_bonds += 1

        elif bond_type == BondType.TRIPLE:
            triple_bonds += 1

        elif bond_type == BondType.AROMATIC:
            aromatic_bonds += 1

    # -------------------------
    # Return feature dictionary
    # -------------------------

    return {
        # Atom properties
        "atomic_num": atom.GetAtomicNum(),
        "degree": atom.GetDegree(),
        "formal_charge": atom.GetFormalCharge(),
        "total_hs": atom.GetTotalNumHs(),
        "is_aromatic": int(atom.GetIsAromatic()),
        "is_in_ring": int(atom.IsInRing()),
        "hybridization": HYBRIDIZATION_MAP.get(hybridization, -1),

        # Neighbor atoms
        "carbon_neighbors": carbon_neighbors,
        "oxygen_neighbors": oxygen_neighbors,
        "nitrogen_neighbors": nitrogen_neighbors,
        "sulfur_neighbors": sulfur_neighbors,
        "phosphorus_neighbors": phosphorus_neighbors,
        "fluorine_neighbors": fluorine_neighbors,
        "chlorine_neighbors": chlorine_neighbors,
        "bromine_neighbors": bromine_neighbors,
        "iodine_neighbors": iodine_neighbors,

        # Bond types
        "single_bonds": single_bonds,
        "double_bonds": double_bonds,
        "triple_bonds": triple_bonds,
        "aromatic_bonds": aromatic_bonds,
    }
