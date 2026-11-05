# EnlaceCraft × Octet Draw improvement plan

Status: implemented (Phases 8–10) · 5 November 2026

Benchmark: [Octet Draw](https://github.com/SamChemMan/Octet-Draw), Apache-2.0, commit
`d5ebf898de3a82bf7549680a171fc4909daae69f` (Version 1.0.29, 2 November 2026).
The comparison was made from a read-only clone at `/tmp/opencode/octet-draw`, not from the
README alone. This is a behaviour comparison: no Octet source code or data is proposed for
copying.

This plan continues after `IMPROVEMENT_PLAN.md` Phases 1–5, which are complete in this
repository (publication output, reaction formats, identifier search, properties table,
layout/import/naming quality, static sharing, command palette, screen-reader descriptions and
keyboard drawing).

## How the comparison was made

Read and compared against EnlaceCraft's current source:

- Octet product and engineering notes: `README.md`, `OCTET_BRIEF.md`, `PRODUCT.md`,
  `docs/ROADMAP.md`, `CLAUDE.md`.
- Octet implementation: `src/Editor.tsx` (menu commands and editing behaviour),
  `src/tools.tsx` (tool palette and variants), `src/keys.ts` (action/keybinding model),
  `src/interpret.ts` (reaction roles), `src/reaction.ts` (reaction layout),
  `src/cycle.ts` (catalytic-cycle object), `src/grid.ts` (grid/rulers/snap),
  `src/clean2d.ts` and `src/clean3d.ts` (geometry clean-up), `src/expand.ts` and
  `src/query.ts` (generic structures/R-groups), `src/templates.ts` and
  `src/library.json` (template library), `src/export.ts` (export/clipboard),
  `src/access.ts` and `src/CanvasAccess.tsx` (canvas accessibility),
  `src/cdxml.ts` (CDXML fidelity) and `src/namer.ts` (naming coverage).
- EnlaceCraft: `src/types/chemistry.ts`, `src/model`, `src/engine`, `src/io`,
  `src/store/useMoleculeStore.ts`, `src/hooks/useCanvasInteractions.ts`,
  `src/components/Canvas`, `src/components/TopBar`, `src/components/Sidebar` and the
  completed `IMPROVEMENT_PLAN.md`.

## Where EnlaceCraft already leads

These are deliberately **not** in scope, because Octet has no meaningful advantage or because
copying Octet's approach would be a regression:

- Broader 2D object model: query atoms and labels, S-groups (including polymers), haptic
  bonds, aromatic-ring displays, TLC plates, orbitals, shapes, brackets, charge brackets and
  functional-group templates.
- Publication output: paper presets, direct PDF, SVG/PNG, print, standalone HTML viewer and
  read-only share links/iframes, all already shipped.
- Desktop and web delivery together: Electron packaging, installable PWA, autosave, version
  history and local project files.
- NMR/IR/mass-spec helpers: prediction, measured-peak comparison, JCAMP-DX read/write,
  isotope patterns, adducts and neutral-loss matching.
- A chemistry template library that already covers amino acids, carbohydrates, nucleotides,
  nucleobases, steroids, terpenes, fused heterocycles and ligands, plus user templates.
- English/Spanish UI, command palette, keyboard drawing and screen-reader structure
  descriptions.
- Octet's Tauri/Rust architecture, brand, icon set and visual design are out of scope. The
  goal is capability, not a port.

## What Octet does differently

| Capability | Octet evidence | EnlaceCraft today | Decision |
|---|---|---|---|
| Reaction interpretation and reaction-aware editing | `src/interpret.ts` derives reactant/product/condition roles from arrows and rows; `Editor.tsx` exposes Show Reaction Interpretation, Map Reaction Atoms, Clear Reaction Map, Clean Up Reaction, Augmented Clean Up Reaction and Analyse Stoichiometry | `Molecule.schemes` exists and CDXML/RXN/reaction-SMILES already use it, but schemes can only arrive by CDXML import. No role display, creation UI, atom mapping or reaction layout | **Adopt**: create, interpret, map and clean reactions |
| Native catalytic-cycle object | `src/cycle.ts` holds ordered intermediates, derives arc arrows and reagent/product side arrows, and refits them when nodes move | No cycle object; a cycle is drawn manually from arrows | **Adopt** as a live object, not a static template |
| Scheme-grid / stoichiometry layout | `src/grid.ts`, `layoutGrid` in `src/expand.ts`, and the stoichiometry grid in `Editor.tsx` | Properties table exists, but there is no on-canvas reaction table or multi-structure grid layout | **Adopt later**, after reaction roles exist |
| Chemistry-aware 2D clean-up | `src/clean2d.ts` relaxes bond lengths, angles and non-bonded contacts; `src/clean3d.ts` uses hybridisation, cis/trans and stereo constraints | `cleanUpAtoms` redraws rings and zigzags chains on a 30° grid, but does not use hybridisation, bond-length targets or non-bonded repulsion | **Adapt** the existing clean-up rather than replace it |
| Generic structures and R-groups | `src/query.ts` and `src/expand.ts` define R-groups and expand generic structures | Query labels such as R/R1 are drawable and S-groups exist, but there is no R-group definition or expansion model | **Adopt** a small R-group layer |
| Page, rulers, crosshair, fixed length/angle | `src/grid.ts` plus `Editor.tsx` commands for page setup, rulers, crosshair, fixed lengths, fixed angles | `PageSetup` exists and CDXML/PDF use it, but there is no page-setup UI; no rulers or crosshair guides; grid snapping and free-angle only | **Adopt** page/workspace controls |
| Object grouping and restacking | `Editor.tsx` exposes Group, Ungroup, Bring to Front and Send to Back | No grouping or z-order model | **Adopt** |
| Office/vector clipboard and paste-back | `src/export.ts` copies SVG/PDF plus CDXML, CDX, MOL, SMILES and native JSON; `readClipboard` accepts CDXML, CDX, molfile, SMILES and pictures | Clipboard copy writes PNG plus a private JSON format; paste reads the private format and pasted text, not CDXML/SVG/MOL from other apps | **Adopt** SVG/CDXML/MOL first; skip EMF/EPS/TIFF |
| Deep CDXML fidelity | `src/cdxml.ts` (2,315 lines) and 68 round-trip cases completed per `docs/ROADMAP.md` | Strong CDXML support and 7 real fixtures, but a narrow fixture matrix and no fuzz/malformed-file suite | **Adapt** the testing approach; do not port CDX binary parsing |
| Large curated template library | `src/library.json`: 16 sets, 292 templates (conformers, aromatics, bicyclics, ligands, paddlewheels, lab glassware) | Chemistry template sets already exist; missing conformer, metallocene/paddlewheel, named aromatic/bicyclic and lab-glassware sets | **Selectively expand** |
| Naming breadth and name-to-structure | `src/namer.ts` (2,772 lines), 6,855/6,924 names correct per `docs/ROADMAP.md`; Name to Structure command | PubChem name lookup and a verified local OPSIN fallback exist; naming is not an offline general-purpose engine | **Adopt only name-to-structure/local fallback improvements**; do not build a full namer |
| Measured-spectrum objects | `src/jcamp.ts`, `src/measured.ts` and spectrum objects in `Editor.tsx` | NMR measured peak lists and JCAMP-DX import/export exist; mass-spec measured import and on-canvas spectrum objects do not | **Defer**; current comparison tools cover the common need |
| 3D clean-up, perspective and flatten | `src/clean3d.ts`; `Editor.tsx` commands for 3D Clean Up, Structure Perspective and Flatten | 3D viewer, conformer generation, MMFF/xTB refinement and torsion scan exist; no 2D↔3D write-back or perspective drawing | **Consider later**; high effort, narrower audience |
| Beginner/pro modes and auto-correction | `OCTET_BRIEF.md` describes chemistry-aware beginner mode and non-overriding pro mode | Valence warnings exist; geometry is never silently corrected | **Skip the mode split**; add conservative, explicitly invoked corrections instead |

## Guiding constraints

1. Add to the existing `Molecule` / annotation / store architecture. Do not introduce a second
   document model or a parallel editor.
2. New persisted fields are optional, sanitized in `src/io/validate.ts`, and migrated by
   `src/io/project.ts`. Old projects, autosaves and share links must keep opening.
3. Chemistry algorithms live in pure `src/engine` or `src/model` modules with unit tests. React
   components only render and route events.
4. Every new object must support: selection, move, delete, undo/redo, keyboard access, a
   screen-reader description, SVG/PDF/PNG export, project save/reopen and CDXML where a
   sensible mapping exists.
5. Desktop-only capabilities (RDKit, OPSIN) must fail soft to a manual or web path.
6. Do not silently override the user's geometry. "Clean", "map" and "expand" are explicit
   commands; optional automatic behaviour is off by default.
7. `npm run check` (oxlint, `tsc -b`, Vitest) must pass at the end of every phase.

---

## Phase 6 — Reaction intelligence and scheme creation (priority 1)

**Why.** EnlaceCraft already stores ChemDraw schemes and can export RXN and reaction SMILES,
but it cannot create a scheme, show which structure is a reactant or product, map atoms, or
tidy a reaction row. Octet's `src/interpret.ts` and its reaction commands fill exactly that
gap and make the existing export features reachable from the editor.

### Tasks

- [x] **Create schemes from a selection.** Extend `src/model/reactionSchemes.ts` with
  `buildSchemesFromSelection(molecule, annotations, atomIds, annotationIds)` and
  `findReactionRows(...)`. Group connected fragments into reactants/products around one or
  more straight arrows, using the same left-to-right/x-order logic as reading order. Add
  `createSchemeFromSelection`, `removeScheme` and `selectScheme` to
  `src/store/useMoleculeStore.ts`.
- [x] **Interpret a reaction.** Add `src/engine/reactionInterpret.ts`:
  `interpretReaction(molecule, annotations, scheme)` returns ordered steps with
  `reactants`, `products`, `above` and `below` parts. Conditions come from text annotations
  above or below the arrow; multi-arrow rows make intermediate structures both a product and
  the next reactant. Keep it pure and independent of the store.
- [x] **Show reaction interpretation.** Add a transient `showReactionInterpretation` flag and
  a `src/components/Canvas/ReactionRoleOverlay.tsx` layer with small role badges and subtle
  outlines. Exclude the layer from export (`data-export-exclude`), exactly like guides and
  previews. Describe the roles in `src/hooks/useStructureDescription.ts` and the live region.
- [x] **Map reaction atoms.** Reuse the existing map-number tool for manual mapping. Add
  `src/engine/reactionMapping.ts` with `mapReactionAtoms(steps)`, `clearReactionMap` and
  `validateReactionMap`; expose store actions of the same names. Mapping highlights are
  transient; map numbers persist. Mapping is deliberately conservative (see the decision
  note below) rather than calling out to RDKit.
- [x] **Clean up a reaction.** Add `src/engine/reactionLayout.ts`:
  `cleanReaction(molecule, annotations, scheme)` aligns the arrow row, equalises horizontal
  gaps, keeps plus signs between components, places conditions above/below the arrow, and
  preserves each structure's internal geometry. Add "Augmented clean" that rotates products
  onto their mapped reactants before laying out. Expose both as commands and shortcuts.
- [x] **UI and commands.** Extend the read-only `SchemeSection` in
  `src/components/TopBar/MoleculeInfoButton.tsx` with Create/Clean/Map/Clear/Interpret
  actions. Register the same actions in `src/App.tsx` for the command palette (the palette
  owns command definitions; `TopBar.tsx` only renders it). Add English and Spanish strings in
  `src/i18n/translations.ts`.
- [x] **Export consistency.** Confirm `src/io/reactionExport.ts` writes map numbers and
  multi-step schemes correctly, and that a scheme-less selection stays disabled rather than
  inventing a reaction. RXN already carried `M  MAP`; reaction SMILES now writes the same
  numbers as atom classes (`[CH3:1]`) via an opt-in `includeAtomMaps` option on
  `exportSmiles`. Invalid maps are reported by the Validate/Map commands rather than
  silently blocking export.

### Tests

- `src/engine/reactionInterpret.test.ts`: one-step row, three-step row with intermediates,
  conditions above/below, structures not in a scheme, arrows without a row.
- `src/model/reactionSchemes.test.ts`: create/prune/select round-trips, stacked rows and an
  intermediate shared by two steps.
- `src/engine/reactionLayout.test.ts`: gaps equalise, arrows align, conditions stay attached,
  connected structures do not overlap, geometry inside a fragment is unchanged.
- `src/engine/reactionMapping.test.ts`: manual map survives; symmetric atoms stay unmapped;
  one number shared across the arrow is valid, a duplicate on one side is not.
- `src/io/reactionExport.test.ts`: RXN and reaction SMILES include map numbers.
- `src/store/reactionSchemes.test.ts` and `src/components/TopBar/SchemeSection.test.tsx`:
  create/select/remove, one-undo-step clean, mapping highlight and interpretation toggle.

### Implementation notes

- Mapping uses a pure Weisfeiler-Lehman-style label refinement over each step's reactant and
  product components. Only labels that are unique on both sides are paired; ambiguous atoms
  are left unmapped for the existing map-number tool. Manual numbers are preserved, and one
  numbering is carried across steps through a shared intermediate.
- "Interpretation" gives products precedence when an intermediate belongs to two steps, so
  the canvas shows one product badge instead of contradictory roles. This matches the
  precedence used by the accessibility description.
- Cleaning is one undo entry for the atoms and annotations it moves. A tidy reaction returns
  the same objects, so it does not create an empty undo step.
- Verification: `npm run check` passes with 110 test files and 3851 tests (3839 passed,
  12 skipped); lint reports only the repository's pre-existing hook warnings.

### Done when

Selecting reactants, an arrow and products and choosing "Create reaction scheme" produces a
selectable scheme; "Show interpretation" labels each part; "Clean up reaction" tidies the row
in one undo step; RXN export carries the scheme; nothing changes for drawings without a
scheme.

---

## Phase 7 — Catalytic cycles and scheme layout (priority 1)

**Why.** A native catalytic cycle is Octet's clearest structural differentiator
(`src/cycle.ts`). In EnlaceCraft the same figure is currently a hand-placed ring of arrows
that breaks whenever an intermediate moves. A live cycle object is a large but contained
addition and exercises the annotation/layout architecture already in place.

### Tasks

- [x] **Model.** Add `CatalyticCycle` to `src/types/chemistry.ts`:
  `{ id, centre, radius, clockwise, nodes: string[][], sides?, gap?, scale?, label? }`, where
  each node is a list of atom ids. Add optional `Molecule.cycles`. Sanitize in
  `src/io/validate.ts` (`sanitizeCycles`), carry it through `src/io/project.ts`, autosave,
  share links and the native clipboard fragment (`subMolecule`/`extractFragment`/
  `insertMolecule`).
- [x] **Layout engine.** Add `src/engine/cycleLayout.ts` with a pure `layoutCycle(cycle,
  molecule)` that returns arc spans, side-arrow geometry, label anchors and hit regions.
  Node ink boxes come from the molecule's current atom positions, so every render refits the
  arcs. It leaves a clear gap around each intermediate, supports 0 nodes (full circle), 1
  node (arc), and 2+ nodes, handles clockwise/anticlockwise, and recomputes the traversal
  order from node angles. The algorithm was written independently; no Octet source copied.
- [x] **Canvas object.** Add `src/components/Canvas/CycleView.tsx` and render it from
  `src/components/Canvas/MoleculeCanvas.tsx` above aromatic circles and below atoms. Hit
  helpers (`cycleAt`, `cycleHandleAt`, `cycleSideAt`) live in `cycleLayout.ts`; interaction
  handling in `src/hooks/useCanvasInteractions.ts` covers placement, moving the whole ring,
  the direction toggle, resizing, and dragging an intermediate's atoms (the arcs follow the
  atoms, so no separate node-drag gesture is needed).
- [x] **Store actions.** Add `addCatalyticCycle`, `removeCatalyticCycle`,
  `addCycleNode`, `removeCycleNode`, `setCycleDirection`, `setCycleScale`,
  `setCycleRadius`, `addCycleSide`, `removeCycleSide`, `attachCycleLabel` and
  `moveCatalyticCycle`. Every structural change is one undo step and prunes nodes when their
  atoms are deleted. Adding a structure already on the ring is a no-op instead of a
  duplicate node.
- [x] **Tool and commands.** Add a cycle tool to the sidebar and mobile toolbar (direction
  toggle, "insert selected structure as a node"), shortcut `Y`, and command-palette entries
  for create/add/remove/flip/reagent-in/product-out. The tool previews the circle before
  placement and adopts any selected structures as intermediates.
- [x] **CDXML interoperability.** Export derived cycle arcs, side arrows and captions as
  ordinary graphics inside one `<group>` so ChemDraw displays the figure, and record the
  live object's identity in an `EnlaceCraftCycle` attribute. On import, rebuild the live
  cycle when that metadata is present and skip the group's child graphics; otherwise fall
  back to plain arrows. Documented limitation: ChemDraw cannot edit a live cycle, and a
  re-imported edited ChemDraw file becomes static arrows.
- [x] **Accessibility and export.** `useStructureDescription` reports one accessible object
  per cycle with intermediate count, direction and reagent/product names. Handles and the
  transient preview are marked `data-export-exclude`, so SVG, PNG and PDF contain only the
  figure. The same `CycleView` renders in the shared HTML viewer.
- [x] **Scheme layout.** Add `layoutSchemeGrid` in `src/engine/reactionLayout.ts` to clean
  each scheme, align row left edges and stack rows with equal spacing. Store
  `cleanReaction()` uses it when no scheme id is given and the document has more than one
  scheme.

### Tests

- `src/engine/cycleLayout.test.ts`: arc gaps respect node boxes; 0/1/2/3/6-node cases;
  clockwise and anticlockwise; adding/removing a node refits spans; moving a node keeps its
  arc adjacent; side arrows stay outside the circle; handle hit regions.
- `src/model/cycles.test.ts`: fragment grouping, pruning and suggested radius.
- `src/store/cycles.test.ts`: create/move/direction/scale/side/label, add/remove node,
  duplicate prevention, atom-deletion pruning and one-undo-step behaviour.
- `src/hooks/useCanvasInteractions.test.tsx`: cycle-tool placement, direction-handle toggle
  and one-undo-step ring drag.
- `src/io/cdxml.test.ts`: cycle exports as grouped graphics; imports back to a cycle; without
  metadata imports as static arrows; the group's child graphics are not duplicated as
  annotations.
- `src/engine/reactionLayout.test.ts`: `layoutSchemeGrid` aligns and stacks rows, is
  idempotent, and is a no-op for an empty scheme list.
- `src/model/molecule.test.ts`: `subMolecule`/`extractFragment` carry only fully-contained
  cycles; `insertMolecule` remaps node ids and translates the centre.

### Implementation notes

- Cycle geometry is derived from each node's current atom positions on every render, so
  moving an intermediate (with the normal select tool) refits its arcs immediately. The
  stored array order is traversal order, but arcs are ordered by angle to keep a dragged node
  adjacent to its neighbours.
- A bare ring (0 nodes) is valid and renders a full circle; a 1-node cycle renders the
  complementary arc. Deleting an atom prunes it from its node, and a formerly non-empty
  cycle that loses every node is dropped.
- Delete targets atoms first. The selected cycle figure is removed only when no atoms are
  selected, leaving its structures on the canvas.
- CDXML metadata stores centre/radius in CDX points and nodes as CDX atom ids; import scales
  them back and mints fresh ids. Stripping the attribute degrades to static arrows rather
  than losing the figure.
- `layoutSchemeGrid` cleans each scheme first, then aligns the rows' left edges and stacks
  them with a default `rowGap` of 80. A tidy grid returns `count: 0` and the same molecule
  object.
- Verification: `npm run check` passes with 113 test files and 3920 tests (3908 passed,
  12 skipped); lint reports only the repository's pre-existing hook warnings.

### Done when

A three-intermediate cycle can be placed, each intermediate moved, and every arc/side arrow
refits automatically; undo restores the previous geometry; the figure exports identically to
SVG/PDF/PNG; reopening the project restores the live object.

---

## Phase 8 — Page, workspace and object control (priority 2)

**Why.** `PageSetup` already exists in `src/types/chemistry.ts` and is written to CDXML and
used by PDF export, but there is no UI to change it. Octet's `src/grid.ts` and its page/ruler
commands show the missing user-facing layer: paper setup, rulers, crosshair, fixed lengths and
angles, grouping and restacking. These are low-risk, high-polish additions.

### Tasks

- [x] **Page setup dialog.** Add `src/components/TopBar/PageSetupDialog.tsx` with paper preset
  (A4, US Letter, ACS single/double column), orientation, margin, bond length and
  margin width. Reuse `src/model/publicationPresets.ts` and `src/model/pageSetup.ts`. Apply
  to the active tab and store the result in `ProjectTab.page`.
- [x] **Make page geometry visible.** Draw the page outline in `MoleculeCanvas.tsx` when
  enabled, and ensure PDF, print, SVG, PNG and the HTML viewer all use the same
  `pageSetup` / placement math. Keep `autoPageSetup` as the fallback for drawings without an
  explicit page.
- [x] **Rulers and crosshair.** Add `src/components/Canvas/Rulers.tsx` with mm/in/bond-length
  units, zoom-aware ticks, and a crosshair that follows the pointer. Both are View toggles,
  transient, excluded from exports, and off by default. Reuse `src/model/constants.ts`
  (`GRID_STEP`) and the existing page setup for the origin.
- [x] **Fixed length / fixed angle.** Extend the existing `snapAngleDegrees` and `freeAngle`
  controls with explicit toolbar/status toggles for "fixed bond length" and "fixed angles",
  matching Octet's discoverability without adding a beginner/pro mode. Shift remains the
  per-gesture bypass.
- [x] **Grouping and z-order.** Add a document-level object-group model (atom ids +
  annotation/cycle ids) in the store and project tab, with `groupSelection`,
  `ungroupSelection`, `bringToFront`, `sendToBack`, `bringForward`, `sendBackward`.
  Add optional `zOrder` to annotations and cycles; sort consistently in the renderer and
  sanitize on load. Undo treats a group/ungroup/z-order change as one action.
- [x] **Commands and accessibility.** Register all of the above in the command palette and
  `ShortcutsOverlay`; add English/Spanish strings; announce group and z-order changes through
  the existing polite live region.

### Tests

- `src/model/pageSetup.test.ts`: presets, orientation, margins, bond length and round-trip.
- `src/io/pdfExport.test.ts`: page setup changes placement; auto page still works.
- `src/components/Canvas/Rulers.test.ts`: tick spacing/units and zoom behaviour.
- Store tests for group move/undo and z-order stability after save/reload.
- Visual/export test that guides, rulers, selection and crosshair never appear in exports.

### Done when

The page dialog changes the printed/exported page and survives save/reload; rulers and
crosshair can be toggled without affecting exports; grouped objects move/rotate as one and
restack predictably.

---

## Phase 9 — Interoperability with Office and other editors (priority 2)

**Why.** Octet's `src/export.ts` puts a picture plus CDXML, MOL and SMILES on the clipboard and
reads those formats back on paste. EnlaceCraft currently writes PNG plus a private JSON format,
so a drawing cannot be pasted into Word/PowerPoint as editable vector data, and a ChemDraw or
MOL structure copied from another app cannot be pasted directly.

### Tasks

- [x] **Rich clipboard write.** Extend `src/io/clipboard.ts` with
  `writeClipboardPayload({ svg, png, cdxml, molfile, text, json })`. Use `ClipboardItem`
  where the browser supports multiple representations; keep PNG and the private JSON format
  for EnlaceCraft-to-EnlaceCraft paste. In Electron, add a `clipboard:write-rich` IPC channel
  that writes SVG/PNG/CDXML/MOL on platforms that support it, with the existing text bridge
  as fallback.
- [x] **Clipboard paste detection.** In `src/hooks/useClipboard.ts`, accept
  `image/svg+xml`, `chemical/x-cdxml`, `chemical/x-mdl-molfile`, `chemical/x-mdl-rxnfile` and
  plain text that parses as CDXML/MOL/SMILES. Route through the existing sanitizing importers
  (`src/io/cdxml.ts`, `src/io/molfile.ts`, `src/io/smiles.ts`). Never trust clipboard HTML or
  SVG wrappers.
- [x] **Copy As submenu.** Add SVG, PNG, CDXML, MOL V2000/V3000, SMILES and InChI entries to
  the export menu and command palette, disabled when the selection is empty. Keep the current
  selection semantics.
- [x] **SVG metadata round-trip.** On SVG export, embed the CDXML in an SVG `<metadata>`
  block; on SVG import, read it back when present. This gives a portable, editable
  round-trip through Inkscape/Illustrator without inventing a new format.
- [x] **CDXML fidelity matrix.** Expand `src/io/fixtures/` from the current 7 files into a
  matrix covering pages, captions and rich text, reaction schemes, arrows (all variants),
  brackets, S-groups, TLC plates, orbitals, unicode/Spanish text, unusually large coordinates
  and malformed/truncated XML. Add a table-driven round-trip test and a fuzz test that
  asserts the importer never throws on hostile input.
- [x] **Defer binary CDX, EMF, EPS and TIFF.** They add platform-specific native code and are
  not needed for the common Word/PowerPoint/Inkscape/PDF workflow. State this in the UI help.

### Tests

- `src/io/clipboard.test.ts`: representation priority, mixed ClipboardItem support, bridge
  fallback, rejection and download fallback.
- `src/hooks/useClipboard.test.tsx`: CDXML/SVG/MOL detection, size limits, hostile payloads.
- `src/io/cdxmlFidelity.test.ts`: fixture matrix round-trips and fuzz cases.
- `src/io/exportImage.test.ts`: SVG metadata is present and does not affect rendering.
- Electron IPC tests for the new clipboard channel.

### Done when

A selection copied from EnlaceCraft pastes as editable vector content into LibreOffice/Inkscape
(manual check) and as a picture into Word; CDXML or MOL copied from another editor pastes as a
new structure; SVG exported and re-imported preserves the editable drawing; the full fixture
matrix passes.

---

## Phase 10 — Chemistry assistance and library (priority 3)

**Why.** Octet's `clean2d.ts`, `query.ts`/`expand.ts`, `library.json` and `namer.ts` cover
chemistry-aware clean-up, generic structures, a much larger curated library and broad naming.
EnlaceCraft should take the parts that materially reduce drawing work without turning into a
full ChemDraw clone or a nomenclature engine.

### Tasks

- [x] **Hybridisation-aware clean-up.** Replace the fixed 30° relaxation in
  `cleanUpAtoms` (`src/model/molecule.ts`) with a pure engine module
  (`src/engine/clean2d.ts`): ideal angles from hybridisation (180°/120°/109.5°), real bond
  lengths by element, ring templates, cis/trans preservation for double bonds, stereo
  preservation, and a non-bonded overlap penalty. Keep boundary atoms fixed and make it one
  undo step. Offer "Clean structure" and an optional "Clean as I draw" toggle that is off by
  default and never touches manually placed stereochemistry.
- [x] **Warnings with fixes.** Surface valence/geometry warnings in the status bar or a small
  panel, with "Explain" and a one-click local fix where one is unambiguous. Do not silently
  change a structure.
- [x] **R-group definitions and expansion.** Add `RGroupDefinition` to
  `src/types/chemistry.ts` (label, attachment atom, substituent fragments). Add
  `src/engine/genericExpansion.ts` to enumerate combinations, cap the result, and lay them
  out with a grid helper. Commands: Define R-group, Expand generic structure, Clear
  R-groups. Persist in the native project; export/import in CDXML only where a faithful
  mapping exists, otherwise document the limitation. S-groups already cover polymer/repeat
  cases.
- [x] **Template library expansion.** Add sets for ring conformers (chair/flipped/Newman),
  metallocenes and paddlewheels, named aromatics/bicyclics, and a small lab-glassware set.
  Put data in `src/model/*Templates.ts`, register categories in
  `src/components/Sidebar/TemplatePalette.tsx`, and add tests for unique ids, placement and
  template search. Do not import Octet's library data; author or license it separately.
- [x] **Name-to-structure.** Extend the existing compound search with a "Name → structure"
  path: PubChem first, local OPSIN fallback when the desktop backend is present, and a clear
  error when neither can resolve the name. This complements the existing structure-to-name
  flow without building a namer.
- [x] **3D clean-up and flatten (optional, after the above).** Use the existing
  `src/io/embed3d.ts` / `refineStructure3D` backend to add "3D clean-up" and "Flatten to 2D"
  commands, with depth shading. Keep it desktop-first and fail soft when the backend is
  unavailable. This is a larger, narrower feature; do not block the rest of the phase on it.

### Tests

- `src/engine/clean2d.test.ts`: angles per hybridisation, ring regularity, double-bond
  cis/trans, stereo retention, no atom overlap, idempotence within tolerance.
- `src/engine/genericExpansion.test.ts`: combination count, cap, attachment points, layout.
- Template tests: unique ids, every category has a label, placement origin is stable.
- Name lookup tests: PubChem hit, local fallback hit, both miss.
- Optional 3D tests reuse `src/components/Molecule3D/*` coverage.

### Done when

A strained drawing visibly improves without changing its stereochemistry or connectivity;
R-group expansion produces editable structures; the new template sets are searchable; name
lookup resolves a structure offline when the backend is available.

---

## Phases 8–10 completion notes (5 November 2026)

All three remaining phases are implemented in this repository. Verification: `npm run check`
(oxlint 0 errors; `tsc -b` clean; Vitest 130 files / 4340 passed / 1 expected fail / 12 skipped). Notes beyond
the per-phase checklists:

**Phase 8.** The page-setup dialog, page outline, rulers/crosshair, fixed length/angle
toggles, and the group/z-order model were already present from earlier WIP (this plan's
checkboxes were stale); the gaps closed now: view toggles registered as palette commands
(`view.rulers`/`view.crosshair`/`view.pageOutline`), a status-bar indicator for the drawing
constraints, and "Fit SVG/PNG/HTML exports to page" — an opt-in export framing that routes
those exports through the same `pageSetup` box PDF/print use (default off: the tight crop is
deliberately kept for paste-a-picture workflows, per constraint 6). Sanitize now always fills
`PageSetup.margin` (1 cm default), which the CDXML page-setup tests needed updated.

**Phase 9.** `writeClipboardPayload` writes rich copies through the Electron
`clipboard:write-rich` bridge (text + HTML-as-SVG-img + native bitmap) or one multi-representation
`ClipboardItem` (png/html/text + the private fragment format), degrading to PNG-only and then
text. Paste reads chemistry MIME flavors (`chemical/x-cdxml`, molfile/rxnfile), SVG with
embedded CDXML metadata (`io/svgMetadata.ts` — export embeds whole-canvas CDXML in
`<metadata>`, import/`useFileImport` read it back), then sniffed plain text via the same
`detectStructureText` pipeline as the Paste dialog. Copy As (SVG/PNG/CDXML/MOL V2000/V3000/
SMILES/InChI) lives in the export menu and palette; chemistry formats copy the selection and
are disabled when it is empty; InChI resolves via PubChem and fails soft. `exportMolV3000`
covers counts/CHG/MASS/aamap/CFG/dative-type-10 (our own importer stays V2000-only, documented).
The CDXML fidelity matrix added caption/rich-text, Spanish/unicode and large-coordinate
fixtures plus a table-driven round-trip suite (`cdxmlFidelity.test.ts`) and a hostile-input
suite asserting controlled failures. Binary CDX/EMF/EPS/TIFF deferral is stated in the Paste
dialog help.

**Phase 10.** `engine/clean2d.ts` replaces the fixed 30° zigzag: hybridisation-aware angles,
element bond-length table, ring templates, double-bond cis/trans verification with subtree
mirroring, wedge/dash endpoints fixed, non-bonded overlap relaxation, idempotent, boundary
atoms pinned; "Clean as I draw" (off by default, persisted) polishes only the atoms a stroke
created inside that stroke's own undo entry. Warnings with fixes: the valence chip opens a
popover listing over-valent atoms with an explanation and a one-click formal-charge fix
(N/P/O/S/Se/Te, over-by-one, charge 0 only — never silent). R-groups: `RGroupDefinition` +
`model/rgroups.ts` (define from selection, clear, cartesian expansion capped at 64, grid
layout, re-bonded attachment atoms), sanitized like cycles, one undo step per action, no
CDXML mapping (documented). Templates: flipped chair + Newman conformations, ferrocene/
cobaltocene/nickelocene + Ru(II) acetate paddlewheel (haptic bonds), named aromatics
(anthracene, phenanthrene, azulene, biphenyl, fluorene, indene), and lab-glassware shape
variants (beaker, Erlenmeyer, round-bottom flask, test tube) rendered from the shape's
bounding box and degrading to polygons in CDXML. Name→structure: PubChem first, local OPSIN
`/name-to-structure` fallback (desktop backend), clear error otherwise. Flatten to 2D writes
the 3D panel's geometry back onto the drawing (drawn structures only, one undo step).

**Performance fix (user-reported lag).** Progressive session lag had four compounding causes,
all fixed: a per-molecule adjacency index in `model/valence.ts` (every `bondsOfAtom` call was
a full bond scan, and render paths call it per atom per frame — O(atoms×bonds) per render);
hover state setters bailing when unchanged (every pointer-move re-rendered the canvas shell);
`useT` returning a fresh closure per render (silently defeating every `useMemo`/`useCallback`
that depended on `t`, including the structure-description memo); and `useKeyboardShortcuts`
subscribing App to hover/selection (the whole shell re-rendered and the window keydown
listener re-bound on every atom hover). Autosave now ignores non-document state changes, blob
URLs from downloads are revoked, and hide-triggered version checkpoints are rate-limited.

**Cycle deletion fix (user-reported: "catalytic cycles cannot be deleted").** Phase 7's
`removeCatalyticCycle` store action always worked (and still does — removing the figure leaves
the intermediates untouched), but the direct UI paths never reached it: clicking the ring
selects only the figure (`selected` is cleared, only `selectedCycleId` is set), so the Delete
handler's `selected.size > 0` guard swallowed the key; the context menu had no cycle section;
and Escape's `clearSelection` left the ring selected. Delete/Backspace now lets a cycle-only
selection through to `deleteSelection`, right-click/long-press on a ring selects it and offers
"Delete cycle", and Escape deselects the cycle too. Regression tests cover the keyboard path
(`useKeyboardShortcuts.test.tsx`) and the store path (`cycles.test.ts`).

**"Clean as I draw" wiring fix (user-reported: "i dont get if it is working or not").** The
user was right — for the gestures that matter the toggle changed nothing. Two compounding
defects: the mouse bond tool and atom tool finished their strokes with a bare `addAtom` +
`addBond` pair in two commits, so `polishDrawn` (which lives inside `addAtomWithBond`/
`addChain`) never saw them; and the polish set passed only the stroke's NEW atoms, which
clean2d turns into singleton components that are their own boundary — pinned exactly where
they landed, a silent no-op even for the chain tool's single-atom cases. Now the bond and
atom strokes finish through one `addAtomWithBond` commit (extended with bond order/stereo/
dative attributes so double-bond and stereo tools keep their behaviour), and the polish set
is the stroke's new atoms PLUS the anchors they attach to (anchor first, so clean2d seeds the
BFS there): the engine holds the anchors and re-places only the new atoms at ideal angle and
length, inside the stroke's single undo step. Stereo bonds keep their drawn geometry (the
engine stereo-fixes the new endpoint), and lone fragments recentre in place exactly as the
"Clean structure" command does. Regression tests: `src/store/cleanAsIdraw.test.ts`.

**Desktop clipboard fix (user-reported: "i can copy the molecule only inside the same app…
nothing in the clipboard to copy outside the app", AppImage).** Two stacked wiring bugs, both
fixed. First, the Edit menu added earlier to restore Linux/Windows text-editing shortcuts was
built from the stock `editMenu` role, whose accelerators consume Ctrl+C/V/X/Z/A before the
page's keydown handlers run — and the roles then act only on DOM text selections, which a
canvas app never has, so canvas copy/paste/undo/select-all were all dead keys in the packaged
build. The menu now builds explicit items with `registerAccelerator: false`: keys reach the
app's own handlers, a text-field focus forwards the command back through a whitelisted
`edit:native-command` IPC (preserving the original inputs-are-copyable behavior), and the
menu's click handlers deliver the same commands over IPC for the click path. Second, the
Ctrl+C payload never contained a picture — only the private JSON and CDXML/MOL/SMILES text —
so the desktop rich-write put text alone on the OS clipboard and image-expecting targets
found nothing to paste. The payload now carries a selection-scoped SVG (text/html `<img>`
flavor) and PNG (`exportSelectionSVGString` mirrors `exportSelectionPNGBlob`'s filter), and
plain Ctrl/Cmd+X cuts the canvas selection (rich copy + delete as one step;
Ctrl/Cmd+Shift+X stays clean-reaction). Regression tests: `electron/main.test.mjs` (menu
accelerators unregistered, click→IPC, native-command whitelist), `useClipboard.test.tsx`
(bridge payload carries text+html+png, canvas Cut, editable-field routing),
`useKeyboardShortcuts.test.tsx` (menu-command undo/redo/select-all, editable forwarding),
`exportImage.test.ts` (selection SVG framing).

## Priority and sequencing

| Phase | User impact | Effort | Depends on | Can ship alone |
|---|---|---|---|---|
| 6 — Reaction intelligence | High: makes existing schemes and exports usable | Medium | — | Yes |
| 7 — Catalytic cycles | High: distinctive scheme figure, keeps arrows attached | Medium–high | 6 for scheme layout | Yes |
| 8 — Page and object control | Medium–high: publication polish and object management | Low–medium | — | Yes |
| 9 — Interoperability | High: Word/PowerPoint/Inkscape/ChemDraw workflow | Medium | 7 for cycle CDXML | Yes |
| 10 — Chemistry assistance and library | Medium: less cleanup work, broader templates | High | 6/7 for layout reuse | Partly |

Recommended order: **6 → 7 → 8 → 9 → 10**. Phase 8 is independent and can be scheduled
earlier if a release needs a quick publication-polish win.

## Cross-cutting implementation rules

- New persisted fields: optional in TypeScript, sanitized in `src/io/validate.ts`, migrated in
  `src/io/project.ts`, and covered by an old-project fixture.
- New actions: one undo entry per user intent; transient previews/guides override state, never
  history.
- New canvas objects: implement `hitTest`, render, export exclusion, accessible name, and
  keyboard selection before considering the feature complete.
- New formats: sanitize on import, cap sizes, never evaluate HTML/SVG, and test with malformed
  input.
- Localization: add English and Spanish strings together; keep SDF/CDXML field names in
  English as the existing plan does.
- Performance: layout functions are pure and memoized per molecule/annotation version; large
  template libraries and reaction grids are virtualized or capped.

## Non-goals

- Rewriting EnlaceCraft on Tauri/Rust, or adopting Octet's architecture, UI, icons or brand.
- A binary CDX parser, EMF/EPS/TIFF export, or byte-for-byte ChemDraw parity.
- Beginner/pro mode switching. Use explicit commands and optional conservative toggles.
- A general-purpose offline IUPAC namer. Keep PubChem plus the verified local OPSIN fallback.
- Real-time collaboration or a server component; the existing static share model stays.
- Multiple pages per tab. One page per tab plus tabs is the current model and is sufficient.
- Silently auto-correcting user geometry, or automatically expanding generic structures
  without an explicit command.
- Copying Octet's template data or clip art. Any reused dataset needs its own provenance and
  licence review.

## Licensing and attribution

Octet Draw is Apache-2.0. This plan is based on reading its source to understand behaviour;
no Octet code is proposed for copying. If implementation later adapts an algorithm rather than
reimplementing it, the source file must carry a short header naming Octet Draw, the commit and
the Apache-2.0 licence, and the repository should add a `NOTICE` entry. Template structures,
library data and any clip art must be authored for EnlaceCraft or verified as separately
licensed before inclusion; do not copy `src/library.json` or its assets.

## Verification

- `npm run check` (oxlint, `tsc -b`, Vitest) passes at the end of each phase.
- Unit coverage for every new pure module, plus store/undo tests and import sanitization tests.
- Manual matrix: Chrome, Firefox, Safari/PWA and the packaged Electron build.
- Export checks: SVG, PNG, PDF, print and the standalone HTML viewer must never contain
  selection, guides, rulers, crosshair, role badges, mapping highlights or cycle handles.
- Interoperability checks: CDXML reopen in ChemDraw when available; SVG round-trip through
  Inkscape; clipboard paste in LibreOffice and Word; share-link reopen in the web build.
- Accessibility checks: screen-reader reading order, accessible names for cycles/reactions,
  keyboard creation/selection, and no focus traps.
