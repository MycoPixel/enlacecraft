import re
from pathlib import Path
from rdkit import Chem

_C13_PROP_RE = re.compile(r"^Spectrum 13C \d+$")
_H1_PROP_RE = re.compile(r"^Spectrum 1H \d+$")

RAW_DIR = Path("data/raw")
DEFAULT_FILE = RAW_DIR / "nmrshiftdb2withsignals.sd"


def load_supplier(input_file=DEFAULT_FILE):
    """
    Load the NMRShiftDB SDF file.
    """

    return Chem.SDMolSupplier(
        str(input_file),
        removeHs=False,
    )


def iter_molecules(input_file=DEFAULT_FILE):
    """
    Yield valid molecules from the SDF.
    """

    supplier = load_supplier(input_file)

    for mol in supplier:
        if mol is None:
            continue

        yield mol


def get_db_id(mol):
    """
    Return the official NMRShiftDB ID.
    """

    if not mol.HasProp("nmrshiftdb2 ID"):
        return None

    return int(mol.GetProp("nmrshiftdb2 ID"))


def get_smiles(mol):
    """
    Return canonical SMILES.
    """

    return Chem.MolToSmiles(mol, canonical=True)


def get_c13_spectra(mol):
    """
    Return ALL raw 13C spectrum strings recorded for this molecule.

    NMRShiftDB stores one property per independently-submitted
    spectrum: "Spectrum 13C 0", "Spectrum 13C 1", "Spectrum 13C 2",
    etc. Molecules with more than one literature source reporting
    shifts for them have more than one of these - only reading index
    0 (the old behavior) silently drops that data. Property names
    are matched dynamically via regex rather than probing a fixed
    range, since the max index varies per molecule.
    """

    return [
        mol.GetProp(name)
        for name in mol.GetPropNames()
        if _C13_PROP_RE.match(name)
    ]


def get_h1_spectra(mol):
    """
    Return ALL raw 1H spectrum strings recorded for this molecule.
    See get_c13_spectra - same reasoning, "Spectrum 1H N" properties.
    """

    return [
        mol.GetProp(name)
        for name in mol.GetPropNames()
        if _H1_PROP_RE.match(name)
    ]


def parse_h1_signals(mol):
    """
    Parse all assigned 1H signals.

    Same three-field format as the 13C spectrum property
    (shift;unused;atom_index), but the atom index here points at the
    HEAVY ATOM the proton is attached to (there are no explicit H
    atoms in these molblocks - see graph_dataset.py). A carbon with
    3 equivalent protons (e.g. a methyl group) shows up as three
    separate entries with the same atom_index - in NMRShiftDB these
    are consistently the same shift value in practice (no distinct
    diastereotopic splitting recorded), so we average them into one
    representative shift per heavy atom. This does mean genuinely
    diastereotopic protons (rare cases where duplicate entries for
    the same atom_index actually differ) get collapsed to a mean too
    - a known simplification, not a bug.

    Unlike parse_c13_signals, this is NOT filtered to carbon atoms -
    O-H and N-H protons are legitimate targets too.

    Merges across every recorded spectrum for this molecule (see
    get_h1_spectra), not just the first submission - so this also
    now averages over independent literature measurements, not only
    over duplicate protons within a single spectrum (e.g. a methyl
    group's three equivalent H's).

    Returns
    -------
    list of dict, one per heavy atom (after averaging duplicates)
    """

    shifts_by_atom = {}

    for spectrum in get_h1_spectra(mol):

        for signal in spectrum.split("|"):

            if not signal.strip():
                continue

            parts = signal.split(";")

            if len(parts) != 3:
                continue

            try:

                shift = float(parts[0])
                atom_index = int(parts[2])

                if atom_index < 0 or atom_index >= mol.GetNumAtoms():
                    continue

                atom = mol.GetAtomWithIdx(atom_index)

                if atom.GetTotalNumHs() == 0:
                    # Data inconsistency guard: this heavy atom has no
                    # attached hydrogens per RDKit, so a proton signal
                    # pointing at it doesn't make sense - skip rather
                    # than silently train on a mislabeled example.
                    continue

                shifts_by_atom.setdefault(atom_index, []).append(shift)

            except Exception:
                continue

    return [
        {
            "atom_index": atom_index,
            "shift_ppm": sum(shifts) / len(shifts),
        }
        for atom_index, shifts in shifts_by_atom.items()
    ]


def parse_c13_signals(mol):
    """
    Parse all assigned 13C signals, merged across every recorded
    spectrum for this molecule (see get_c13_spectra) - not just the
    first submission. Molecules with multiple independent literature
    measurements now contribute an averaged shift per atom instead
    of only the first spectrum's value, which both recovers atoms
    that were only assigned in a later spectrum and reduces label
    noise for atoms assigned in more than one.

    Returns
    -------
    list of dict
    """

    shifts_by_atom = {}

    for spectrum in get_c13_spectra(mol):

        for signal in spectrum.split("|"):

            if not signal.strip():
                continue

            parts = signal.split(";")

            if len(parts) != 3:
                continue

            try:

                shift = float(parts[0])
                atom_index = int(parts[2])

                if atom_index < 0 or atom_index >= mol.GetNumAtoms():
                    continue

                atom = mol.GetAtomWithIdx(atom_index)

                if atom.GetSymbol() != "C":
                    continue

                shifts_by_atom.setdefault(atom_index, []).append(shift)

            except Exception:
                continue

    return [
        {
            "atom_index": atom_index,
            "shift_ppm": sum(shifts) / len(shifts),
        }
        for atom_index, shifts in shifts_by_atom.items()
    ]
