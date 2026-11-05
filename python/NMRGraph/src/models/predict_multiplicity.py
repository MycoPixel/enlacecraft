"""
Predict 1H shift (trained GNN) together with multiplicity, using
whichever tier is appropriate per atom:

  - Tier 1 (multiplicity.py, topology-only n+1 rule): used for
    acyclic atoms AND aromatic ring atoms. Validated 22/22 against
    textbook molecules including aromatic rings (see
    sanity_check_multiplicity.py) - aromatic ring protons are
    planar/flat, so the sp3 Karplus dihedral relationship tier 2
    relies on doesn't apply there anyway.

  - Tier 2 (coupling_karplus.py, conformer + Karplus): used
    automatically for non-aromatic (sp3) ring atoms - e.g. saturated
    rings like cyclohexanes - where axial/equatorial-type geometry
    creates real J differences tier 1 cannot see (validated on
    trans-4-tert-butylcyclohexanol, see sanity_check_karplus.py).
    Reports the actual per-neighbor J values (Hz) plus a proper
    compound multiplet label (multiplet_label - s/d/t/dd/td/...,
    clustering coincident J's the same way tier 1's n+1 labels do)
    rather than a literal one-'d'-per-coupling-partner count.

If the input SMILES has unassigned stereocenters (no @/@@ tags),
this CLI enumerates every distinct fully-defined isomer
(coupling_karplus.enumerate_stereoisomers, via RDKit's
EnumerateStereoisomers) and reports each one separately, instead of
running tier 2 once and silently blending what could be physically
different diastereomers (e.g. cis vs. trans) into one meaningless
averaged number.

Usage
-----
    python -m src.models.predict_multiplicity "CCO"
    python -m src.models.predict_multiplicity "CC(=O)C" "c1ccccc1"
    python -m src.models.predict_multiplicity "CC(C)(C)C1CCC(O)CC1"
"""

import argparse

from rdkit import Chem

from src.models.coupling_karplus import (
    _near_defined_stereocenter,
    enumerate_stereoisomers,
    estimate_vicinal_coupling,
    generate_conformers,
    multiplet_label,
    unassigned_stereocenters,
)
from src.models.multiplicity import canonical_ranks, neighbor_h_groups, predict_multiplicity
from src.models.predict import MODEL_PATH_H1_CH, load_model, predict_h1_spectrum


def _needs_tier2(mol, atom):
    """
    Non-aromatic ring atoms: geometry-dependent coupling (axial/
    equatorial etc.) shows up there - see module docstring.
    Acyclic atoms near a DEFINED stereocenter: also escalate, since
    coupling_karplus now keeps a nearby CH2's two H's separate rather
    than averaging them (see _atom_is_prochiral_locked there) - tier
    1's flat n+1 count can't represent that distinction at all, so
    it's worth surfacing via tier 2 even without a ring.
    """

    if atom.IsInRing() and not atom.GetIsAromatic():
        return True

    return _near_defined_stereocenter(mol, atom.GetIdx())


def _tier2_report(smiles, atom_idx, mol, ranks, ensemble):

    groups = neighbor_h_groups(mol, atom_idx, ranks=ranks)

    if not groups:
        return "s", "tier 2 (ring geometry) - no vicinal H", []

    label_components = []
    per_neighbor_str = []
    all_j_flat = []

    for group in groups:

        coupling = estimate_vicinal_coupling(
            smiles, atom_idx, group["neighbor_idx"], ensemble=ensemble
        )
        j_values = coupling["j_values_hz"]
        all_j_flat.extend(j_values)

        # Cluster/label THIS neighbor's contribution on its own - never
        # pool across neighbors first, or numerically-close values from
        # physically unrelated couplings can merge into a fake shared
        # component (seen in practice: a neighbor's two ~7 Hz couplings
        # merging with an unrelated ~6.6 Hz coupling from a different
        # neighbor just because they happened to land close together).
        label_components.append(multiplet_label(j_values))

        j_str = "/".join(f"{j:.1f}" for j in j_values)
        per_neighbor_str.append(f"atom{group['neighbor_idx']}: {j_str} Hz")

    label = "".join(label_components)

    detail = "; ".join(per_neighbor_str)

    return label, f"tier 2 (ring geometry) - {detail}", all_j_flat


def predict_h1_with_multiplicity(smiles, model_h1, warn_unassigned_stereo=False, mol=None, geo_coords=None):
    """
    Returns a list of dicts, one per qualifying H-bearing carbon:
        {
          "atom_index": int,
          "predicted_shift_ppm": float,
          "num_hs": int,
          "multiplicity": str,        # e.g. "t", "dd", "tdq"
          "multiplicity_detail": str, # human-readable per-neighbor J's/notes
          "coupling_hz": list[float], # raw J values (Hz) behind the label -
                                       # only ever populated for tier 2 atoms;
                                       # empty for tier 1 (no real J estimate
                                       # exists there, only a topological count)
        }

    This is the single shared source of truth for multiplicity - both
    this module's CLI (main() below) and the HTTP API
    (src/api/main.py) call this rather than duplicating the tier
    1/tier 2 routing logic (see module docstring for what each tier
    covers).

    Does NOT enumerate stereoisomers for unassigned stereocenters
    (see main()/coupling_karplus.enumerate_stereoisomers for that) -
    callers that care should check
    coupling_karplus.unassigned_stereocenters(mol) themselves and
    decide how to surface it (the CLI enumerates and reruns this per
    isomer; the API instead adds one warning message to keep its
    response shape simple - see src/api/main.py). warn_unassigned_stereo
    defaults to False here specifically so a caller doing its own
    enumeration (or its own warning) doesn't also get generate_conformers'
    console warning printed underneath it.

    mol, geo_coords : optional
        Same meaning as predict_spectrum's/predict_h1_spectrum's
        docstrings - pass an already-parsed mol (e.g. from
        geometry.parse_molfile_with_coords) instead of re-parsing
        `smiles` here.

        IMPORTANT, not just a minor optimization: every atom_index
        this function returns is relative to whatever mol it actually
        used - Chem.MolFromSmiles(smiles)'s own atom order when mol
        isn't given. That's only guaranteed to match a caller's own
        separately-held mol when that mol was ALSO built directly from
        this exact same smiles string (true for src/api/main.py's
        enumerate_stereoisomers path, where isomer_mol IS
        Chem.MolFromSmiles(isomer_smiles)). It is NOT true for the
        molfile request path there: isomer_mol comes from
        Chem.MolFromMolBlock (real atom order preserved from the
        caller's file), while isomer_smiles is a *canonical*
        Chem.MolToSmiles(isomer_mol) re-encoding - and RDKit's
        canonical writer generally reorders atoms according to its own
        ranking, not the original mol's order. Re-parsing that string
        here without being given mol therefore silently produces a
        DIFFERENT atom order than isomer_mol, and every atom_index this
        function returns then points at the wrong atom once the caller
        maps it back through isomer_mol - not a crash, just silently
        wrong (e.g. a methyl's protons reported as if they belonged to
        a neighboring oxygen). Passing mol explicitly is what keeps the
        molfile path correct; predict_spectrum's parallel case is
        exactly why it already accepts (and src/api/main.py already
        passes) the same parameter.

        Known residual gap even with mol passed: tier 2 (ring atoms /
        atoms near a defined stereocenter - see _needs_tier2) still
        estimates J-coupling via generate_conformers/
        estimate_vicinal_coupling in coupling_karplus.py, which embed
        their OWN conformer ensemble from `smiles` alone and document
        their atom indices as "matching Chem.MolFromSmiles(smiles)
        convention" - independent of whatever `mol` this function was
        given. So for a molfile request, tier 2's multiplicity/coupling
        *detail* for ring/stereocenter atoms can still be computed
        against a different embedded conformer (and, worse, a
        different atom order) than the real submitted geometry - a
        separate, deeper limitation than the one this parameter fixes,
        not yet addressed. The atom_index/shift/num_hs attribution
        this docstring is about is correct once mol is passed; treat
        tier-2 multiplicity detail specifically with extra caution
        until that's addressed too.
    """

    if mol is None:

        mol = Chem.MolFromSmiles(smiles)

        if mol is None:
            raise ValueError(f"Could not parse SMILES: {smiles}")

    shift_entries = {
        entry["atom_index"]: entry
        for entry in predict_h1_spectrum(
            smiles, model_h1, carbon_only=True, mol=mol, geo_coords=geo_coords
        )
    }

    ranks = canonical_ranks(mol)

    # Only pay for conformer generation if some atom actually needs
    # tier 2 - most molecules won't (acyclic or aromatic-only).
    needs_tier2 = any(
        _needs_tier2(mol, atom)
        for atom in mol.GetAtoms()
        if atom.GetIdx() in shift_entries
    )
    ensemble = (
        generate_conformers(smiles, warn_unassigned_stereo=warn_unassigned_stereo)
        if needs_tier2
        else None
    )

    results = []

    for atom_idx in sorted(shift_entries):

        shift_entry = shift_entries[atom_idx]
        atom = mol.GetAtomWithIdx(atom_idx)

        if _needs_tier2(mol, atom):
            label, note, coupling_hz = _tier2_report(smiles, atom_idx, mol, ranks, ensemble)
        else:
            mult = predict_multiplicity(mol, atom_idx, ranks=ranks)
            label = mult["label"] if mult else "?"
            note = mult.get("note", "") if mult else ""
            # Tier 1 has no real J magnitude - just a topological count
            # (the n+1 rule doesn't estimate coupling strength at all).
            # Left empty here; callers building an illustrative spectrum
            # (e.g. EnlaceCraft's spectrum view) fall back to a default
            # J per implied coupling partner, clearly marked as
            # illustrative rather than measured - see that caller for
            # specifics, not this module's concern.
            coupling_hz = []

        results.append(
            {
                "atom_index": atom_idx,
                "predicted_shift_ppm": shift_entry["predicted_shift_ppm"],
                "num_hs": shift_entry["num_hs"],
                "multiplicity": label,
                "multiplicity_detail": note,
                # Raw, unclustered per-coupling J values (Hz) behind the
                # multiplicity label above - only ever populated for
                # tier 2 atoms (see comment above for tier 1). Order is
                # not meaningful (couplings from different neighbors are
                # flattened together) - fine for peak-simulation use via
                # successive splitting/convolution, which doesn't care
                # about source order.
                "coupling_hz": coupling_hz,
            }
        )

    return results


def _print_molecule(smiles, model_h1):

    try:
        results = predict_h1_with_multiplicity(
            smiles, model_h1, warn_unassigned_stereo=True
        )
    except ValueError as error:
        print(f"  {error}")
        return

    for entry in results:
        note_str = (
            f"   ({entry['multiplicity_detail']})"
            if entry["multiplicity_detail"]
            else ""
        )
        print(
            f"    atom {entry['atom_index']:>3}: "
            f"{entry['predicted_shift_ppm']:6.2f} ppm   "
            f"{entry['multiplicity']}{note_str}"
        )


def main():

    parser = argparse.ArgumentParser(
        description=(
            "Predict 1H shift (GNN) + multiplicity, auto-selecting "
            "tier 1 (n+1 rule) or tier 2 (conformer + Karplus, for "
            "non-aromatic ring atoms) per atom. Carbon-attached "
            "protons only - exchangeable O-H/N-H/S-H are always "
            "singlets by convention and aren't handled by this CLI."
        )
    )
    parser.add_argument(
        "smiles", nargs="+", help="One or more SMILES strings, space-separated."
    )
    args = parser.parse_args()

    model_h1 = load_model(MODEL_PATH_H1_CH)

    for smiles in args.smiles:

        mol = Chem.MolFromSmiles(smiles)

        if mol is None:
            print(f"SMILES: {smiles}")
            print(f"  Could not parse SMILES: {smiles}")
            print()
            continue

        if unassigned_stereocenters(mol):

            isomer_smiles_list = enumerate_stereoisomers(smiles)

            print(
                f"SMILES: {smiles}  (unassigned stereo - enumerating "
                f"{len(isomer_smiles_list)} isomer(s) instead of blending them)"
            )
            print("=" * (8 + len(smiles)))

            for isomer_smiles in isomer_smiles_list:
                print(f"  Isomer: {isomer_smiles}")
                print("  " + "-" * (10 + len(isomer_smiles)))
                _print_molecule(isomer_smiles, model_h1)
                print()

        else:
            print(f"SMILES: {smiles}")
            print("-" * (8 + len(smiles)))
            _print_molecule(smiles, model_h1)
            print()


if __name__ == "__main__":
    main()
