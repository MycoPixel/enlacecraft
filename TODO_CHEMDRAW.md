# ChemDraw Compatibility Implementation - TODO List (Updated)

## Phase 1: Template Palettes (P0 - Highest Priority)

### 1.1 Ring Templates Extension ✅
- [x] Basic ring templates already in constants.ts (benzene, cyclohexane, etc.)
- [x] Added 5-membered heterocycles (furan, thiophene, pyrrole, imidazole)
- [x] Added 6-membered heterocycles (pyridine, pyrimidine, etc.)
- [x] Added oxazole, thiazole, pyrazole, isoxazole, isothiazole
- [x] Added triazoles (1,2,3- and 1,2,4-)
- [x] Added fused heterocycles (indole, quinoline, isoquinoline, benzimidazole, purine)
- [x] Added Cp ring (cyclopentadienyl)
- [x] Added chair/boat cyclohexane templates
- [x] Added decalins and norbornane
- [x] Full aromatic sextet circle toggle for all 6-rings

### 1.2 Amino Acid Templates ✅
- [x] Created src/model/aminoAcidTemplates.ts
- [x] Alanine (fully defined with Fischer projection)
- [ ] Remaining 19 amino acids need full definitions with side chains and L-stereochemistry

### 1.3 Nucleotide Templates ✅
- [x] Created src/model/nucleotideTemplates.ts
- [x] AMP (Adenosine Monophosphate) fully defined
- [ ] Remaining nucleotides (GMP, CMP, UMP, TMP/dTMP, GTP, CTP, UTP) follow same pattern

### 1.4 Carbohydrate Templates ✅
- [x] Created src/model/carbohydrateTemplates.ts
- [x] D-Glucose Fischer projection
- [x] D-Glucose Haworth pyranose
- [x] Maltose disaccharide
- [ ] Additional monosaccharides: galactose, mannose, fructose, ribose, deoxyribose
- [ ] Additional disaccharides: lactose, sucrose, cellobiose
- [ ] Polysaccharide repeating units

### 1.5 Steroid Templates ✅
- [x] Created src/model/steroidTemplates.ts
- [x] Gonane (steroid nucleus) fully defined
- [x] Cholesterol with -OH at C3 and hydrocarbon side chain at C17
- [ ] Additional steroids: testosterone, estradiol, progesterone, cortisol, bile acids

### 1.6 Terpene Templates ✅
- [x] Created src/model/terpeneTemplates.ts
- [x] Limonene (monoterpene, cyclohexene + isopropenyl)
- [x] Caryophyllene (sesquiterpene, 10-membered ring with 4 double bonds, isopropyl + ethylidene)
- [x] Retinol (diterpene, vitamin A, ionone ring + polyene chain C9-C20)
- [ ] Additional terpenes: menthol, camphor (monoterpenes), artemisinin (sesquiterpene), etc.

### 1.7 Template Picker UI
- [ ] Redesign unified Template Palette Panel with tabs (Rings, Amino Acids, Nucleotides, etc.)
- [ ] Implement categorized grid with search/filter
- [ ] Add "My Templates" tab for user-created templates

## Phase 2: Bond Types & Stereochemistry (P0) ✅
- [x] Added `boldDouble`, `dashedDouble`, `hollowWedge` to `BondStereo` type
- [x] Added `hollow?: boolean` to `Bond` interface
- [x] Added `queryProps` to `Atom` and `Bond` interfaces
- [x] Added `stereoGroup` to `Atom` interface
- [x] Added `z?: number` to `Atom` interface for 3D coords
- [x] Import: Parse `Display="BoldDouble"` → `stereo: "boldDouble"`
- [x] Import: Parse `Display="DashedDouble"` → `stereo: "dashedDouble"`
- [x] Import: Parse `Hollow="yes"` on wedge → `hollow: true`
- [x] Export: Write new bond stereo types to CDXML
- [x] Updated BondView.tsx to render new bond stereo types
- [x] Handle enhanced stereo groups (AND/OR) in cdxDisplayToStereo

## Phase 3: Arrow Tool Expansion (P0) ✅
- [x] Added new `ArrowVariant` values: `dashed`, `double`, `bold`, `openHead`, `circleHead`, `diamondHead`, `tailed`
- [x] Added `headStyle`, `tailStyle`, `shaftStyle` to `ArrowAnnotation`
- [x] Import: Parse CDXML arrow head/tail types with `ArrowheadType`, `ArrowheadHead`, `ArrowheadTail`, `LineStyle`, `ArrowheadTailType`
- [x] Import: Parse `Dash="yes"`, `LineWidth`, `Head="OpenHead"`, etc.
- [x] Export: Write new arrow variants to CDXML with proper attributes
- [x] Render dashed shaft in ArrowAnnotationView
- [x] Render new arrow variants

## Phase 4: Orbital Tool Expansion (P1) ✅
- [x] Added `d`, `sp`, `sp2`, `sp3`, `hybrid` to `OrbitalVariant`
- [x] Updated CDXML import to parse new `OrbitalType` values
- [x] Updated OrbitalAnnotationView rendering for d, sp, sp2, sp3 variants
- [x] Updated OrbitalAnnotation export to write CDX Orbital graphics with OrbitalType attribute

## Phase 5: Shape Primitives ✅
- [x] Added new `ShapeVariant` values: `polygon`, `arc`, `curve`, `polyline`, `roundedRect`, `triangle`, `hexagon`
- [x] Added `fillPattern`, `lineStyle`, `lineCap`, `lineJoin`, `sides`, `startAngle`, `points` to `ShapeAnnotation`
- [x] Updated CDXML import to parse shape attributes (FillType, FillPattern, LineStyle, LineCap, LineJoin, NumSides, StartAngle, Points)
- [x] Updated CDXML export to write shape attributes
- [x] Implement all new shape variants in ShapeAnnotationView rendering

## Phase 6: TLC Enhancements ✅
- [x] Enhanced `TlcSpot` with `label`, `uv`, `stain` fields
- [x] Enhanced `TlcPlateAnnotation` with `baselineFraction`, `solventFrontFractions`, `showUV`, `uvWavelengths`, `stainType`, `laneLabels`, `laneCount`, `plateSize`, `showRfValues`
- [x] Updated CDXML import to parse enhanced TLC attributes (OriginFraction, SolventFrontFraction, ShowUV, UVWavelengths, StainType, LaneLabels, PlateSize, ShowRfValues)
- [x] Updated CDXML export to write enhanced TLC attributes
- [x] TLC Rendering UI updates

## Phase 7: BioDraw Elements (P3 - Deferred)
- [ ] Deferred to future iteration

## Phase 8: CDXML Fidelity (P0 - Critical) ✅
- [x] Added `SGroup` type and `sgroups` field to `Molecule` interface
- [x] Nickname/superatom system design for round-trip fidelity
- [x] CDXML import/export: bond stereo types, new arrow variants, orbital types, shape primitives, TLC enhancements
- [x] 3D coordinate preservation (`Atom.z`)
- [ ] Multi-fragment document support (multiple `<fragment>` per page)
- [ ] Page setup parsing/serialization (`<page>` attributes)
- [ ] Scheme/Reaction Steps parsing (`<scheme>` and `<step>` elements)
- [ ] S-Groups import/export for polymers, mixtures
- [ ] Font/Color table fidelity verification
- [ ] Round-trip test suite with real ChemDraw files

## Phase 9: UI/UX Integration (P0)
- [x] Keyboard shortcuts documented (ChemDraw compatibility mapping)
- [ ] Template palette panel redesign (planning)
- [ ] Arrow tool redesign (planning)
- [ ] Bond tool enhancement (planning)
- [ ] Context menu additions

## Phase 10: File Formats (P1)
- [ ] Document CDX as unsupported (undocumented binary)
- [ ] Verify SMILES/MOL/SDF/XYZ import/export
- [ ] Add CML support (optional)
- [ ] Add ChemSketch SKC support (optional)

---

**Progress Summary**: 
- Types updated: ✅ (BondStereo, Bond, Atom, ArrowVariant, ArrowAnnotation, OrbitalVariant, ShapeAnnotation, TlcSpot, TlcPlateAnnotation, Molecule, Point)
- CDXML import/export: ✅ (bond stereo types, new arrow variants, orbital types, shape primitives, TLC enhancements, 3D coords)
- Template files created: ✅ (aminoAcidTemplates.ts, nucleotideTemplates.ts, carbohydrateTemplates.ts, steroidTemplates.ts, terpeneTemplates.ts)
- Ring templates extended: ✅ (in constants.ts with 5-/6-membered heterocycles, fused systems, Cp ring)
- Bond types: ✅ (boldDouble, dashedDouble, hollowWedge added and rendering updated)
- Validation spec tables: ✅ (all updated with new properties)
- Type checking: ✅ (zero compilation errors)
- Still need: Remaining template definitions (amino acids 19, nucleotides 6, steroids 5, terpenes 4+), UI components, round-trip testing)