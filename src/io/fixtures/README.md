# CDXML test fixtures

These files are real ChemDraw-generated documents used to exercise the
importer and exporter against output the app did not write itself.

| File | Source | What it covers |
|---|---|---|
| `chemdraw-scheme.cdxml` | ChemDraw 22 drawing (project fixture) | Bracketed charged arene, orbital, reaction arrow, curved arrow, TLC plate, bracket pairs, page setup, scheme grouping |
| `rdkit-sgroups.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/sgroups_and_remove_atoms_4.cdxml` | `<bracketedgroup>` / MultipleGroup S-group |
| `rdkit-dative.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/github7501-dative.cdxml` | ChemDraw 22 `Order="dative"` coordinate bonds |
| `rdkit-wavy.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/wavy.cdxml` | Wavy/unknown-stereo bonds |
| `rdkit-aromatic.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/aromatic.cdxml` | Aromatic `Order="1.5"` bonds |
| `rdkit-reaction-boc.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/reaction-with-boc.cdxml` | Reaction scheme/step grouping plus Boc nickname groups |

The RDKit files come from the RDKit project
(https://github.com/rdkit/rdkit), which is BSD-3-Clause licensed. They are
included here only as test inputs.
