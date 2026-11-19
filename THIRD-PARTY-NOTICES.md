# Third-party notices

EnlaceCraft itself is licensed under the GNU Affero General Public License,
version 3 or later (AGPL-3.0-or-later) — see [`LICENSE`](LICENSE).

It bundles or depends on the components below. Each remains under its own
license; nothing here changes those terms. All of them are compatible with the
AGPL.

Source files do not carry per-file SPDX headers. The license is declared once:
`package.json`'s `"license": "AGPL-3.0-or-later"`, this repository's
[`LICENSE`](LICENSE), and the in-app about panel. Contributions are accepted
under the same license; no separate copyright assignment is required.

## JavaScript / TypeScript runtime dependencies

| Component | License | Used for |
| --- | --- | --- |
| [React](https://react.dev) and React DOM | MIT | UI |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | Application state |
| [OpenChemLib](https://github.com/Actelion/openchemlib) | BSD-3-Clause | SMILES parsing/writing, descriptors, 3D embedding |
| [3Dmol.js](https://github.com/3dmol/3Dmol.js) | BSD-3-Clause | 3D structure viewer |
| [jsPDF](https://github.com/parallax/jsPDF) | MIT | PDF export |
| [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) | MIT | SVG → PDF rendering |
| [DOMPurify](https://github.com/cure53/DOMPurify) | MPL-2.0 OR Apache-2.0 | Sanitizing imported text/annotations |
| [Lucide](https://lucide.dev) | ISC | Icons |

The production build (`dist/`) contains only these runtime dependencies plus
EnlaceCraft's own code. Development-only tooling (TypeScript, Vite, Vitest,
oxlint, electron-builder, jsdom, …) is not redistributed in the web build;
it is MIT / Apache-2.0 licensed.

## Desktop application

| Component | License | Used for |
| --- | --- | --- |
| [Electron](https://www.electronjs.org) | MIT | Desktop shell (includes Chromium and Node.js, with their own licenses) |
| [electron-updater](https://github.com/electron-userland/electron-builder) | MIT | Update checks |

Electron's own `LICENSE` and `LICENSES.chromium.html` are included in the
packaged application by electron-builder.

## Optional Python backends (desktop builds)

These are separate local processes, not linked into the JavaScript app.

| Component | License | Used for |
| --- | --- | --- |
| [FastAPI](https://fastapi.tiangolo.com) | MIT | Local HTTP service |
| [Uvicorn](https://www.uvicorn.org) | BSD-3-Clause | ASGI server |
| [RDKit](https://www.rdkit.org) | BSD-3-Clause | Molecular graphs for NMR prediction |
| [PyTorch](https://pytorch.org) | BSD-3-Clause | NMR graph neural network inference |
| [NumPy](https://numpy.org) | BSD-3-Clause | Numerical work |
| [xtb](https://github.com/grimme-lab/xtb) 6.7.1 | LGPL-3.0-or-later | GFN2-xTB geometry refinement and IR spectra |
| [OPSIN](https://github.com/dan2097/opsin) 2.9.0 | MIT | IUPAC name → structure and name verification |
| [py2opsin](https://github.com/JacksonBurns/py2opsin) | MIT | Python wrapper around OPSIN |
| [JPype](https://jpype.readthedocs.io) | Apache-2.0 | Embedded JVM bridge for OPSIN |
| [Eclipse Temurin JRE](https://adoptium.net) 21.0.9+10 | GPL-2.0 WITH Classpath-exception-2.0 | Java runtime bundled with the IUPAC fallback |

**xtb (LGPL).** `xtb` is invoked as an external command-line program, and a
desktop release bundles the unmodified upstream Linux x86-64 binary at
`resources/structure3d_server/xtb/bin/xtb`. The corresponding source is the
upstream `v6.7.1` tag (commit `edcfbbe`), available from
<https://github.com/grimme-lab/xtb/tree/v6.7.1>; anyone distributing a
release must also pass that source (or a written offer) on, and must not
prevent the user from replacing the binary with a modified one. The Windows
build uses a conda-forge `xtb` build instead, with the same obligations.

**Bundled JRE and OPSIN.** The frozen IUPAC fallback ships Temurin's `jre/`
directory with its own `NOTICE` and `legal/` files, plus OPSIN's
`opsin-cli-2.9.0-jar-with-dependencies.jar` unmodified. Temurin's
Classpath-exception terms cover running OPSIN, not the reverse-engineering
restriction of the bare GPL; nothing in this project modifies either.

## Data and models

- **nmrshiftdb2.** The NMR prediction model was trained on chemical shifts
  from **nmrshiftdb2**, whose data is published under the **nmrshiftdb2
  Database License** — an Open Database License (ODbL) 1.0 derivative with
  an added §4.5. That license requires attribution and share-alike for
  adapted databases. The source database itself is not redistributed here;
  the app credits nmrshiftdb2 beside every prediction. See
  <https://nmrshiftdb.nmr.uni-koeln.de> and
  <https://opendatacommons.org/licenses/odbl/1-0/>.
- **Model checkpoints.** `python/NMRGraph/data/models/*.pt` (three files,
  about 1.7 MB each) are this project's own trained weights, produced with
  NMRGraph's training scripts from that nmrshiftdb2 data. They contain no
  third-party pre-trained weights. Provenance, checksums and regeneration
  steps are in
  [`python/NMRGraph/MODEL_PROVENANCE.md`](python/NMRGraph/MODEL_PROVENANCE.md).
  They are distributed as part of EnlaceCraft under AGPL-3.0-or-later; the
  training data's own terms still apply to the data, not to the program.
- **PubChem** and **MassBank** data are fetched at runtime from their public
  services; they are not bundled. Their own terms apply to the returned data.

## Prior art and inspiration

EnlaceCraft is an independent implementation. Its chemistry file handling is
written from the published format descriptions (MDL CTfile, CDXML/CDX,
SMILES). It does not include code from ChemDraw or other commercial chemistry
software. UI ideas were compared against openly licensed projects such as
[MolDraw](https://www.moldraw.com), [Octet Draw](https://github.com/SamChemMan/Octet-Draw)
(Apache-2.0) and [Reactio Draw](https://github.com/Paivel/reactio-draw)
(MPL-2.0); any code reused from those projects would be noted here and kept
under its original license.
