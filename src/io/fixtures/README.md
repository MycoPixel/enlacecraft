# CDXML test fixtures

Real ChemDraw/RDKit documents plus hand-authored matrix fixtures used to
exercise the importer and exporter. The round-trip matrix over all of these
lives in `src/io/cdxmlFidelity.test.ts`.

| File | Source | What it covers |
|---|---|---|
| `chemdraw-scheme.cdxml` | ChemDraw 22 drawing (project fixture) | Bracketed charged arene, orbital, reaction arrow, curved arrow, TLC plate, bracket pairs, page setup, scheme grouping |
| `rdkit-sgroups.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/sgroups_and_remove_atoms_4.cdxml` | `<bracketedgroup>` / MultipleGroup S-group |
| `rdkit-dative.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/github7501-dative.cdxml` | ChemDraw 22 `Order="dative"` coordinate bonds |
| `rdkit-wavy.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/wavy.cdxml` | Wavy/unknown-stereo bonds |
| `rdkit-aromatic.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/aromatic.cdxml` | Aromatic `Order="1.5"` bonds (with a `Display="Dash"` ring) |
| `rdkit-reaction-boc.cdxml` | RDKit `Code/GraphMol/test_data/CDXML/reaction-with-boc.cdxml` | Reaction scheme/step grouping plus Boc nickname groups |
| `caption-text.cdxml` | Hand-authored | Page-level `<t>` caption with plain, bold, italic, subscript and superscript style runs |
| `unicode-text.cdxml` | Hand-authored | Captions with Spanish text (¿ á é í ó ú ñ), Greek letters and superscript-ish characters, plus escaped `<`/`&` |
| `large-coordinates.cdxml` | Hand-authored | Atoms at unusually large and negative drawing coordinates (~±10^5 units) |
| `truncated.cdxml` | Hand-authored | Valid CDXML cut off mid-element — the malformed class: import must fail with the controlled "Not a valid CDXML file" error |

The RDKit files come from the RDKit project
(https://github.com/rdkit/rdkit), which is BSD-3-Clause licensed. They are
included here only as test inputs.
