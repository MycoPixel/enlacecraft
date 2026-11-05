from rdkit.Chem import Descriptors
from rdkit.Chem import Lipinski
from rdkit.Chem import rdMolDescriptors
from rdkit.Chem import rdFingerprintGenerator


# Create the fingerprint generator once
MORGAN_GENERATOR = rdFingerprintGenerator.GetMorganGenerator(
    radius=2,
    fpSize=128,
)


def molecular_descriptors(mol):
    """
    Compute molecular descriptors and Morgan fingerprint.

    Returns
    -------
    dict
        Dictionary of descriptors.
    """

    descriptors = {
        # Basic size
        "mol_weight": Descriptors.MolWt(mol),
        "exact_mol_weight": Descriptors.ExactMolWt(mol),
        "heavy_atom_count": Lipinski.HeavyAtomCount(mol),

        # Polarity
        "tpsa": rdMolDescriptors.CalcTPSA(mol),

        # Hydrophobicity
        "logp": Descriptors.MolLogP(mol),

        # Flexibility
        "rotatable_bonds": Lipinski.NumRotatableBonds(mol),

        # Rings
        "ring_count": Lipinski.RingCount(mol),
        "aromatic_ring_count": Lipinski.NumAromaticRings(mol),
        "aliphatic_ring_count": Lipinski.NumAliphaticRings(mol),

        # Hydrogen bonding
        "h_donors": Lipinski.NumHDonors(mol),
        "h_acceptors": Lipinski.NumHAcceptors(mol),

        # Carbon hybridization
        "fraction_csp3": rdMolDescriptors.CalcFractionCSP3(mol),
    }

    # --------------------------------------------------
    # Morgan fingerprint (128 bits)
    # --------------------------------------------------

    fingerprint = MORGAN_GENERATOR.GetFingerprint(mol)

    for bit in range(128):
        descriptors[f"fp_{bit:03d}"] = int(fingerprint.GetBit(bit))

    return descriptors
