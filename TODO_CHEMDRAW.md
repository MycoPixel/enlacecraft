# ChemDraw Compatibility — Status & Remaining Work

> **Verified against the code on 2026-10-27** (app version 1.17.0, HEAD `9a2c78e9`).
> Earlier revisions of this file overstated progress in Phase 1: several items
> were checked off that were never actually added (notably the fused
> heteroaromatics and the chair/boat/decalin/norbornane templates). Those are
> now listed honestly below.

## Current Inventory (verified in source)

| Family | File | Implemented | Missing |
|---|---|---|---|
| Ring templates | `src/model/constants.ts` | 31 rings: benzene, cyclohexane, cyclopentane, cyclobutane, cyclopropane, cycloheptane, cyclooctane, pyridine, pyrimidine, pyridazine, pyrazine, 1,3,5-/1,2,4-triazine, furan, thiophene, pyrrole, imidazole, oxazole, thiazole, pyrazole, isoxazole, isothiazole, 1,2,3-/1,2,4-triazole, piperidine, pyrrolidine, THF, THP, morpholine, piperazine, naphthalene | Chair/boat cyclohexane; decalins; norbornane |
| Fused heteroaromatics | `src/model/heterocycleTemplates.ts` | Indole, quinoline, isoquinoline, benzimidazole, purine | — |
| Amino acids | `src/model/aminoAcidTemplates.ts` | All 20 standard amino acids (`gly` … `val`) | — |
| Nucleotides | `src/model/nucleotideTemplates.ts` | AMP, GMP, CMP, UMP, TMP, GTP, CTP, UTP | — |
| Nucleobases | `src/model/nucleobaseTemplates.ts` | Adenine, guanine, cytosine, thymine, uracil | — |
| Carbohydrates | `src/model/carbohydrateTemplates.ts` | D-Glucose (Fischer), L-Glucose (Fischer), D-Glucose (Haworth pyranose), maltose, D-galactose, D-mannose, D-fructose, D-ribose (all Fischer except the two noted), 2-deoxy-D-ribose, lactose, sucrose, cellobiose | Polysaccharide repeating units |
| Steroids | `src/model/steroidTemplates.ts` | Gonane, cholesterol, testosterone, estradiol, progesterone, cortisol, cholic acid | Additional bile acids (deoxycholic, lithocholic, …) |
| Terpenes | `src/model/terpeneTemplates.ts` | Limonene, caryophyllene, retinol, menthol, camphor, artemisinin, squalene | — |
| Ligands | `src/model/structureTemplates.ts` | Cyclopentadienyl (Cp⁻) | — |

Total built-in structure templates: **65** (1 ligand + 20 amino acids + 12 carbohydrates + 8 nucleotides + 5 nucleobases + 7 steroids + 7 terpenes + 5 fused heteroaromatics).

---

## Phase 1: Template Palettes

### 1.1 Ring Templates — Partial
- [x] Basic rings (benzene, cyclohexane, cyclopentane, cyclobutane, cyclopropane, cycloheptane, cyclooctane)
- [x] 5-membered heterocycles (furan, thiophene, pyrrole, imidazole, oxazole, thiazole, pyrazole, isoxazole, isothiazole, triazoles)
- [x] 6-membered heterocycles (pyridine, pyrimidine, pyridazine, pyrazine, triazines, piperidine, pyrrolidine, THF, THP, morpholine, piperazine)
- [x] Naphthalene (fused, dedicated placement in `engine/ringPlacement.ts`)
- [x] Aromatic sextet circle toggle for 6-rings
- [x] Cp⁻ ring (lives in `structureTemplates.ts`, because `RingTemplate` has no charge field)
- [x] Fused heteroaromatics: indole, quinoline, isoquinoline, benzimidazole, purine (`heterocycleTemplates.ts`, added to the Structures picker)
- [ ] Chair/boat cyclohexane templates (only mentioned in a doc comment)
- [ ] Decalins (cis/trans)
- [ ] Norbornane

### 1.2 Amino Acid Templates ✅
- [x] `src/model/aminoAcidTemplates.ts`
- [x] All 20 standard amino acids with side chains and L-stereochemistry
- [x] Glycine and the achiral/proline cases handled separately

### 1.3 Nucleotide Templates ✅
- [x] `src/model/nucleotideTemplates.ts`
- [x] AMP, GMP, CMP, UMP, TMP
- [x] GTP, CTP, UTP (triphosphates)

### 1.4 Nucleobase Templates ✅
- [x] `src/model/nucleobaseTemplates.ts`
- [x] Adenine, guanine, cytosine, thymine, uracil

### 1.5 Carbohydrate Templates — Mostly Done
- [x] `src/model/carbohydrateTemplates.ts`
- [x] D-Glucose (Fischer), L-Glucose (Fischer)
- [x] D-Glucose (Haworth pyranose)
- [x] Maltose (α-1,4 disaccharide)
- [x] D-Galactose, D-Mannose, D-Fructose, D-Ribose (Fischer)
- [x] 2-Deoxy-D-ribose
- [x] Lactose (β-1,4 galactose–glucose)
- [x] Sucrose (α-1,2 glucose–fructose)
- [x] Cellobiose (β-1,4 glucose–glucose)
- [ ] Polysaccharide repeating units (cellulose, amylose, chitin, …)

> The four added templates are generated from PubChem isomeric SMILES through
> `importSmiles` (OpenChemLib 2D layout + wedge/dash parity), not hand-laid
> Fischer/Haworth projections. Their formulas are pinned in
> `structureTemplates.test.ts`.

### 1.6 Steroid Templates — Mostly Done
- [x] `src/model/steroidTemplates.ts`
- [x] Gonane (steroid nucleus)
- [x] Cholesterol, testosterone, estradiol, progesterone, cortisol, cholic acid
- [ ] Additional bile acids (deoxycholic, lithocholic, chenodeoxycholic)

### 1.7 Terpene Templates ✅
- [x] `src/model/terpeneTemplates.ts`
- [x] Limonene, caryophyllene, retinol, menthol, camphor, artemisinin, squalene

### 1.8 Template Palette UI ✅
- [x] Unified `TemplatePalette` with tabs: All, one per built-in category, and My Templates
- [x] Search/filter (hides empty groups, no-results state, tested)
- [x] Two-column grid layout for built-in templates
- [x] User-template manager merged into the My Templates tab (save/delete/import/export)
- [x] Category headings translated for every category (EN/ES); a regression test asserts this
- [x] Normalized all carbohydrates to the `carbohydrates` category (D-/L-glucose no longer split into a separate `sugars` group)

> Rings intentionally remain a dedicated tool/picker rather than a palette tab:
> a ring is placed with a live preview through `placeRing`, not pasted as a
> fragment, so it does not share the palette's insertion path.

---

## Phase 2: Bond Types & Stereochemistry ✅
- [x] `boldDouble`, `dashedDouble`, `hollowWedge` in `BondStereo`
- [x] `hollow?: boolean` on `Bond`
- [x] `queryProps` on `Atom`/`Bond`
- [x] `stereoGroup` on `Atom`
- [x] `z?: number` on `Atom` for 3D coordinates
- [x] Import `Display="BoldDouble"` / `"DashedDouble"` / `Hollow="yes"`
- [x] Export new bond stereo types to CDXML
- [x] `BondView.tsx` renders the new stereo types
- [x] Enhanced stereo groups (AND/OR) in `cdxDisplayToStereo`
- [x] Computed CIP stereochemistry: OpenChemLib engine (`engine/stereo.ts`), canvas overlay (`ComputedStereoOverlay.tsx`), info-panel section, persistence, export exclusion, tests

---

## Phase 3: Arrow Tool Expansion ✅
- [x] `ArrowVariant`: `dashed`, `double`, `bold`, `openHead`, `circleHead`, `diamondHead`, `tailed`
- [x] `headStyle`, `tailStyle`, `shaftStyle` on `ArrowAnnotation`
- [x] Import CDX arrow head/tail/line attributes
- [x] Export new arrow variants
- [x] Render dashed shafts and new variants

---

## Phase 4: Orbital Tool Expansion ✅
- [x] `d`, `sp`, `sp2`, `sp3`, `hybrid` orbital variants
- [x] CDXML import/export for the new `OrbitalType` values
- [x] Rendering in `OrbitalAnnotationView`

---

## Phase 5: Shape Primitives ✅
- [x] `polygon`, `arc`, `curve`, `polyline`, `roundedRect`, `triangle`, `hexagon`
- [x] `fillPattern`, `lineStyle`, `lineCap`, `lineJoin`, `sides`, `startAngle`, `points`
- [x] CDXML import/export of shape attributes
- [x] Rendering in `ShapeAnnotationView`

---

## Phase 6: TLC Enhancements ✅
- [x] `TlcSpot`: `label`, `uv`, `stain`
- [x] `TlcPlateAnnotation`: baseline/solvent-front fractions, UV, stain type, lane labels/count, plate size, Rf values
- [x] CDXML import/export of the enhanced attributes
- [x] TLC rendering and interaction

---

## Phase 7: BioDraw Elements (P3 — Deferred)
- [ ] Deferred to a future iteration

---

## Phase 8: CDXML Fidelity — Partial
- [x] `SGroup` type and `sgroups` field on `Molecule`
- [x] Bond stereo types, arrow variants, orbital types, shape primitives, TLC enhancements
- [x] 3D coordinate preservation (`Atom.z`)
- [x] Single-page documents with annotations (arrows, brackets, captions, shapes, orbitals, TLC)
- [x] Round-trip tests for app-generated CDXML (including `fixtures/chemdraw-scheme.cdxml`)
- [x] Multi-fragment documents: export writes one `<fragment>` per connected component; import already merged them
- [x] Nickname/superatom round-trip: registry groups (`Ph`, `Boc`, …) write CDX labeled nodes; free-typed formulas/placeholders (`COOH`, `R1`) write `NodeType="Unspecified"` labels
- [x] Isotope mass numbers (`Isotope`) and radical dots (`Radical="2"`) round-trip
- [x] Import skips multi-/variable-attachment and external-connection nodes instead of adding bogus carbons
- [x] Nickname definition fragments no longer leak their internal nodes/bonds into the imported molecule
- [x] Color-table fidelity: TLC spot colors are pre-scanned, so every emitted `color` index exists in the header table
- [ ] Page setup parsing/serialization (`<page>` attributes: size, margins, bond length)
- [ ] Scheme/reaction-step grouping (`<scheme>`, `<step>`) — arrows import, grouping metadata is dropped
- [ ] S-Groups import/export for polymers/mixtures (`sgroups` has no producer in the app yet, so this is deferred until there is something to round-trip)
- [ ] Font/color-table fidelity verification against real ChemDraw output
- [ ] Real ChemDraw-file round-trip suite (currently one fixture plus synthetic documents)

---

## Phase 9: UI/UX Integration — Partial
- [x] Keyboard shortcuts overlay (`ShortcutsOverlay.tsx`, opened with `?`)
- [x] Context menu (atom/bond/selection/canvas actions, charge, radical, stereo, highlight, cleanup, collapse-to-group, IUPAC)
- [x] 3D viewer surfaces: VDW/SAS/SES, opacity slider, coloring sync, persistence, tests
- [x] Template palette redesign (unified tabs, grid, search, My Templates)
- [ ] Arrow tool refinement (full ChemDraw-style arrow editing)
- [ ] Bond tool refinement (ChemDraw-compatible bond palette/behavior)

---

## Phase 10: File Formats — Partial
- [x] Native project format `.enlacecraft` (tabs, annotations, view state)
- [x] Import `.mol`, `.sdf` (multi-record), `.cdxml`, `.smi`/`.smiles`, `.enlacecraft` (with content sniffing for `.txt`/unknown)
- [x] Export MOL, CDXML, SMILES; PNG/SVG/print
- [x] 3D import `.xyz`, `.pdb`/`.ent`, `.mol`, `.sdf`; 3D export `.xyz`/`.mol`
- [x] CDX binary documented as unsupported (undocumented format)
- [x] SDF multi-record import — each structure opens in its own tab, capped at `LIMITS.maxTabs`; unreadable records are skipped and reported
- [ ] CML import/export (optional)
- [ ] ChemSketch SKC import/export (optional)

---

## Follow-ups (not ChemDraw-specific)

- [ ] Stereo panel does not list manual `R/S` atom labels when there is no computed assignment.
- [ ] No component-level test for the 3D surface toggle/opacity path.

---

## Progress Summary

- **Done:** all 20 amino acids, all 8 nucleotides, 5 nucleobases, 12 carbohydrates, 7 steroids, 7 terpenes, 5 fused heteroaromatics, 31 ring templates; bond types, computed stereochemistry, arrows, orbitals, shapes, TLC (including per-spot deletion); CDXML round-trip with multi-fragment layout, abbreviated-group nicknames, isotopes, radicals, and a complete color table; shortcuts overlay; context menu; 3D surfaces; unified searchable template palette with user templates.
- **Main remaining work:** conformation ring templates (chair/boat, decalins, norbornane); polysaccharide repeating units; CDXML page setup and scheme/step grouping; S-groups (no producer yet); SDF multi-record and optional CML/SKC.
- **Type checking:** `npx tsc -b` passes cleanly.
- **Lint:** `oxlint` is clean on the touched files.
