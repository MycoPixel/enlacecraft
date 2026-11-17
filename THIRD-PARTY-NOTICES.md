# Third-party notices

EnlaceCraft itself is licensed under the GNU Affero General Public License,
version 3 or later (AGPL-3.0-or-later) — see [`LICENSE`](LICENSE).

It bundles or depends on the components below. Each remains under its own
license; nothing here changes those terms. All of them are compatible with the
AGPL.

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
| [xtb](https://github.com/grimme-lab/xtb) | LGPL-3.0-or-later | GFN2-xTB geometry refinement and IR spectra |

`xtb` is invoked as an external command-line program. If a release bundles its
binary, that release must also provide the corresponding xtb source (or a
written offer) and must not prevent the user from replacing the binary, as the
LGPL requires. The `xtb` source is available from the link above.

## Data and models

- **NMR prediction** is derived from **nmrshiftdb2** data. The nmrshiftdb2
  database license applies to that data; see the attribution shown in the
  prediction result and <https://nmrshiftdb.nmr.uni-koeln.de>.
- `python/NMRGraph` is a separate project by the same author. Check the
  redistribution terms of its trained model checkpoints and of the datasets
  they were trained on before publishing them in a release.
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
