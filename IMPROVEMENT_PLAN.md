# EnlaceCraft improvement plan

Benchmark: [MolDraw](https://www.moldraw.com/) (checked via its public `llms.txt` and `/tools/` index, because the home page is rendered client-side).

Follow-up benchmark and phased plan: [Octet Draw](https://github.com/SamChemMan/Octet-Draw) in [`OCTET_DRAW_IMPROVEMENT_PLAN.md`](OCTET_DRAW_IMPROVEMENT_PLAN.md).

## Where EnlaceCraft already leads

- Full 2D structure editor with rings, chains, stereochemistry, abbreviations, query atoms, S-groups, haptics, TLC plates, orbitals and shapes.
- Reaction schemes, mechanism arrows and CDXML round-tripping.
- 3D viewer, NMR/IR/mass-spec helpers, IUPAC naming and PubChem substructure search.
- Local project files, autosave, version history, Electron desktop build and installable PWA.
- English/Spanish UI.

## Gaps worth closing

1. **Publication-ready output** — export is currently tight-cropped PNG/SVG, browser print, MOL and CDXML. There is no page-aware PDF, no journal page/bond-length presets, and no way to reproduce a fixed physical bond length.
2. **Reaction interchange** — schemes are drawn and stored, but cannot be exported as SDF, RXN V2000 or reaction SMILES, which are the formats other chemistry tools expect.
3. **Identifier search** — the search box only understands names and SMILES. MolDraw-class tools accept InChI, InChIKey, CID, CAS and formula, and auto-detect what was pasted.
4. **Batch/property workflows** — no table of computed properties for a multi-component drawing, no CSV export.
5. **Structure cleanup** — ring/chain clean-up already exists (`cleanUpAtoms`, the sidebar's "Clean up"), but it deliberately leaves fragment positions alone: structures that were merged or pasted on top of each other stayed overlapping, and annotations had no grid or alignment snapping. Phase 3 adds explicit separation, grid snapping and smart guides.
6. **Collaboration** — no shareable read-only link or embedded viewer (closed in Phase 4; live collaboration remains deferred).
7. **Accessibility** — canvas interactions are mouse/pointer-first; keyboard-only structure editing is limited.
8. **Spanish naming quality** — reported from real lookups and fixed in Phase 3: the best-effort transliteration left a parent chain ending in `-hexan`/`-heptan` (now `-hexano`/`-heptano`) and did not reorder substituents alphabetically (`1-ethyl-4-t-butylcyclohexane` now cites *t-butyl* before *ethyl*).

## Phased roadmap

### Phase 1 — Publication and interchange (implemented here)

- [x] Publication presets (`src/model/publicationPresets.ts`): A4, US Letter, ACS single/double column, each with a physical bond length and margin.
- [x] Placement math shared by PDF/print: scale the drawing to the preset's bond length, then shrink only if it would not fit the printable area.
- [x] Direct PDF export (`src/io/pdfExport.ts`) using lazily loaded `jspdf` + `svg2pdf.js`, with a printable page box and centered artwork.
- [x] `foreignObject` annotation boxes converted to real SVG text before PDF rendering, so reaction conditions survive the export.
- [x] SDF export (one record per connected structure).
- [x] RXN V2000 export from a reaction scheme, including multi-component reactants/products.
- [x] Reaction SMILES export (`reactants>>products`) from a scheme.
- [x] Export menu entries and status messages for the new formats.
- [x] Identifier hub (`src/io/pubchem.ts`): auto-detection plus explicit name, SMILES, InChI, InChIKey, CID, CAS and molecular-formula lookup.
- [x] Compound search UI mode selector and auto-detect placeholder.

### Phase 2 — Property and batch tooling (implemented here)

- [x] Properties table (`src/io/propertiesTable.ts`) with one row per connected structure: formula, MW, exact mass, formal charge, atom/heavy-atom/bond counts, SMILES, and the OpenChemLib descriptors (logP, logS, TPSA, H-bond donors/acceptors, rotatable bonds, stereocenters).
- [x] Descriptor failures are reported per row (`IGNORED_VALENCE`, `ABBREVIATED_GROUP`, `UNSUPPORTED`, `TOO_SMALL`) instead of blanking the row; formula/mass/counts still work.
- [x] CSV/clipboard export of the visible table, with RFC 4180 quoting. Headers are localised to match the UI; values use `.` decimals for interoperability.
- [x] Batch identifier enrichment against PubChem's property endpoint (CID, name, InChIKey), requested on demand, one fragment at a time with a small delay to stay inside PubChem's rate guidance.
- [x] Optional `SDF with properties` export: one `> <Field>` block per computed property, using stable English tag names so downstream tools can query them in either UI language.
- [x] Top-bar `Properties` button with the table, Copy CSV, Download CSV, and PubChem enrichment.

### Phase 3 — Layout, import and naming quality (implemented here)

- [x] "Clean structure" / relayout command — **already shipped before this pass**: `cleanUpAtoms` in `src/model/molecule.ts`, exposed as the sidebar/context-menu "Clean up". It redraws rings as regular polygons, relaxes chains into proper zigzags, keeps boundary atoms fixed, and preserves wedge/dash stereo and labels.
- [x] Overlapping structures: `separateOverlappingFragments` detects connected fragments whose bounding boxes collide and lays them out left-to-right with a fixed gap, moving each rigidly so internal geometry is untouched. Exposed as "Separate overlapping structures" in the align menu (desktop and mobile). Multi-record SDF import opens each record as its own tab, so this targets structures merged by paste, compound lookup, CDXML import or project restore. A no-op when nothing overlaps, so it is safe as a one-click fix.
- [x] Grid snapping for annotations and scheme components: when the square grid is visible (`View` → `Grid`), dragging a text box, bracket, shape, orbital, TLC plate, arrow body or arrow endpoint lands on the nearest 24-unit grid intersection. Shift bypasses snapping for one gesture, matching the existing Shift escape hatch while drawing bonds. Group drags are left unsnapped so a selection keeps its internal arrangement.
- [x] Smart alignment guides: while dragging an annotation, its left/centre/right and top/middle/bottom lines are compared with every other annotation and with each connected structure's bounds. A match within 6 screen pixels pins that axis and draws a guide line spanning both objects, even when the grid is hidden. Alignment wins over grid snapping per axis; Shift bypasses both for one gesture. Arrow endpoint drags align the endpoint itself, and group drags keep their internal arrangement (same policy as grid snapping).
- [x] Spanish transliteration: bare parent-chain stems such as `-hexan`/`-heptan` (and `-methan`/`-ethan`) now get the Spanish `-o` ending. Only the very end of the name is rewritten, so `heptan-2-ol` and other suffixed elided forms keep their stem.
- [x] Substituent alphabetisation in generated/transliterated names: locant-prefixed substituents are reordered alphabetically by the substituent's own first letter. `tert-`/`t-`/`sec-`/`s-`/`n-` and ortho/meta/para prefixes are ignored for ordering, as are multiplicative prefixes (`di-`, `tri-`, ...). Reported example: `1-ethyl-4-t-butylcyclohexane` becomes `4-t-butil-1-etilciclohexano`; *butyl* (b) is cited before *ethyl* (e). Locants stay attached to their own substituent — this is a citation-order fix, not a renumbering, so it can never describe a different isomer. Multi-word and bracketed names are left alone.

### Phase 4 — Sharing and collaboration (static sharing implemented here)

- [x] Read-only share links or an embeddable viewer (static, no server required). `src/io/shareLink.ts` encodes one tab as a `.enlacecraft` payload in the URL fragment (`#view=…`); `src/components/SharedViewer/SharedViewer.tsx` opens it as a separate read-only root, and `?embed=1` hides its header and controls for iframes.
- [x] Export a self-contained HTML viewer. `src/io/htmlViewer.ts` wraps the existing self-contained SVG export in a minimal document with no external scripts, stylesheets or fonts.
- [ ] Optional real-time collaboration behind a feature flag. **Deferred**: it needs a signalling/transport service (or a vendor SDK) and conflict handling, which is outside this plan's "static, no server" scope. The share-link payload is deliberately not a live document.

### Phase 5 — Accessibility and polish

- [x] Keyboard-accessible atom/bond placement and selection. `Ctrl/Cmd+Shift+K` (or the command palette) turns on a keyboard drawing cursor; arrow keys move it by one bond length (Shift for the 24-unit grid), Enter places an atom bonded to the current single selection or selects the atom underneath, and Escape clears the selection before leaving the mode. The cursor is drawn on the canvas and excluded from exports.
- [x] Screen-reader descriptions for structures and reactions. `src/hooks/useStructureDescription.ts` summarizes formula, atom/bond counts, reaction schemes, annotations and selection; the canvas exposes it as its `aria-label`, and `App` repeats it through a debounced polite live region so edits are announced without narrating every drag frame.
- [x] Command palette for every tool and export action. `Ctrl/Cmd+K` opens `src/components/common/CommandPalette.tsx`; `src/commands/commands.ts` keeps the list in sync with the tools, editing, view, file, export and share actions registered by `App` and `TopBar`.

## Implementation notes

- PDF rendering is lazy-loaded: `jspdf` and `svg2pdf.js` are only fetched when the user chooses PDF, keeping the initial bundle unchanged.
- The PDF page uses the preset's physical dimensions in points and a matching safe margin. The drawing is centered; its bond length equals the preset's target unless that would overflow, in which case it is reduced proportionally.
- Annotation text lives in SVG `<foreignObject>` elements, which `svg2pdf.js` cannot render. The PDF path measures the rendered words in the browser and rewrites them as positioned SVG `<text>` elements; the on-screen drawing and SVG/PNG exports are untouched.
- Reaction formats use `Molecule.schemes`. RXN and reaction SMILES are disabled in the UI when the drawing has no scheme, rather than inventing a reaction from ungrouped fragments.
- Identifier search deliberately keeps the existing PubChem-backed import path; no new service or API key is introduced.
- The properties table scopes every value to a connected fragment, the same split as the formula readout and descriptor popover, so a reaction scheme does not get one chemically-meaningless combined row.
- PubChem enrichment is lazy and sequential. A blank table costs no requests; a multi-fragment canvas is looked up one structure at a time rather than as a burst.
- CSV headers follow the current UI language, while SDF data-field tags stay in English: the file is the interchange boundary, and external tools query tags by name.
- Spanish naming remains best-effort transliteration, not a validated nomenclature engine. The alphabetisation pass deliberately does not renumber: renumbering correctly requires the full lowest-locant rule plus symmetry analysis of the parent, and guessing would risk turning a correct name for one isomer into a correct name for a different one.
- Overlap separation is explicit rather than automatic. Cleaning bond geometry and relocating whole structures are different intents, and annotations are not moved with their structures, so a scheme with attached captions stays under the user's control.
- Grid snapping reuses the canvas's own 24-unit grid (`GRID_STEP`) rather than a separate hidden increment, so what the user sees is exactly what a drag snaps to. It is deliberately coupled to grid visibility: no new preference to discover, and no snapping when the grid is off.
- Smart guides measure bounds through one shared helper (`model/alignmentGuides.ts`), which the CDXML auto-page calculation also uses, so export framing and drag snapping cannot disagree about where an object is. Structures contribute one box per connected fragment rather than a single drawing-wide box, because a reaction scheme's overall bounds would rarely line up with anything useful. The guide threshold is divided by the current zoom so the grab distance feels the same at every scale, and guides are transient store state (never saved, never exported).
- Share links carry the drawing in the URL *fragment*, not the query string, so the browser never sends it to a server. The token is the project format deflated through `CompressionStream` when available, with a plain-base64 fallback and a 48,000-character ceiling; decoded data still goes through `importProject`, so a hand-edited link gets the same validation as an untrusted project file. Inflated bytes are capped while streaming, so a small compressed link cannot expand into an unbounded allocation.
- Copying a share link or embed snippet falls back to downloading `share-link.txt` / `embed-code.html` when the clipboard is unavailable or denied, matching the existing SMILES-copy behaviour rather than losing the result.
- The shared viewer is a separate render root, not the editor with buttons hidden. `main.tsx` picks `SharedViewer` when `#view=` is present, so autosave, version history, shortcuts and editing surfaces never mount for a read-only link. The canvas keeps its normal pointer handlers but is isolated with `pointer-events:none`; the surrounding stage owns pan, wheel zoom and fit-to-window.
- Share-link creation from the packaged desktop build targets the public web deployment (`https://enlacecraft.vercel.app`, overridable with `VITE_WEB_APP_URL`) instead of producing a link to a local `file:` path. Copying uses a native Electron clipboard bridge when `navigator.clipboard` is unavailable, and the desktop app can open a pasted read-only link in its own window through the `share:open-window` IPC handler.
- The standalone HTML viewer reuses the same export-ready SVG as SVG export (`serializeExportSVG`), so both stay visually identical. Only the caller-supplied title, background and language are escaped/validated; the SVG markup itself comes from our exporter.
- Keyboard drawing owns its keys in the capture phase while the mode is active, so Enter places an atom instead of opening the label editor and Escape clears the selection without also leaving the mode. The cursor is transient store state like hover/selection: never saved, never exported, and reset on tab switches. Placing an atom and its bond goes through one store commit, so undo treats the pair as a single action.
- The command palette does not reimplement actions: each owner registers a group and the palette translates the titles, so adding a tool or export automatically makes it searchable. A modal dialog keeps its own arrow/Enter/Escape handling.
- Structure announcements are debounced separately from the SVG's `aria-label`: the label is always current for on-demand reading, while the polite live region waits until edits settle so a drag does not flood a screen reader.

## Verification

- `npm run check` (oxlint, `tsc -b`, Vitest) must pass.
- New unit coverage: publication placement math, reaction export formats, identifier detection and PubChem namespaces, property-row construction, CSV quoting, SDF property fields, batch identifier enrichment, Spanish chain endings and substituent ordering, overlapping-fragment separation, grid-point rounding, alignment-guide matching, and guide-over-grid drag snapping. Phase 4 adds share-token round-trips (compressed and fallback), URL/embed-code building, size and format rejection, HTML-viewer escaping, cross-build clipboard fallbacks, and the Electron clipboard/share IPC channel list. Phase 5 adds keyboard-cursor movement, single-step atom+bond placement, atom selection, and Escape handling.
