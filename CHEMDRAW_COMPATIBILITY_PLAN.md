# ChemDraw Compatibility Implementation Plan

## Executive Summary

This plan outlines the work needed to make EnlaceCraft fully compatible with ChemDraw's CDXML format for import/export, covering all drawing tools, templates, and annotation types that ChemDraw supports.

**Current State**: EnlaceCraft already has a solid CDXML importer/exporter (`src/io/cdxml.ts`) that handles:
- Atoms, bonds (orders 1-3, stereo: wedge, dash, wavy, bold, boldHash, dashed)
- Reaction arrows (forward, equilibrium, resonance, retrosynthetic, curved)
- Brackets (square, curly, paren)
- Text annotations (bold, italic, underline, sub/superscript, inline font-size/color)
- Shapes (rectangle, ellipse, line)
- Orbitals (s, p, lobe)
- TLC plates

**Gaps to Close**: Template palettes, specialized bond types, arrow variants, BioDraw elements, and advanced stereochemistry.

---

## Phase 1: Template Palettes (High Priority)

ChemDraw organizes templates into palettes accessible via **File > Open Templates**. We need to implement equivalent template libraries.

### 1.1 Rings Palette (`src/model/ringTemplates.ts` - extend existing)

**Current**: Basic ring templates (3-8 membered, aromatic toggle)

**Add**:
| Template | Description | Implementation |
|----------|-------------|----------------|
| Cyclohexane Chair | Chair conformation with axial/equatorial bonds | StructureTemplate with explicit wedge/hash bonds |
| Cyclohexane Boat | Boat conformation | StructureTemplate |
| Fused Bicyclics | Decalin (cis/trans), Norbornane | `fused: true` RingTemplates with custom placement |
| Spiro Compounds | Spiro[4.5]decane, etc. | StructureTemplate |
| Heterocycles (5-member) | Furan, Thiophene, Pyrrole, Imidazole, Oxazole, Thiazole | RingTemplates with heteroatoms + bondOrders |
| Heterocycles (6-member) | Pyridine, Pyridazine, Pyrimidine, Pyrazine, Triazine | RingTemplates |
| Fused Heterocycles | Indole, Quinoline, Isoquinoline, Benzimidazole, Purine | StructureTemplates (fused rings) |
| Cp Ring | Cyclopentadienyl anion (η⁵) | StructureTemplate with charge |
| Aromatic Sextet Circle | Toggle for any 6-ring | Already supported via `AromaticRingDisplay` |

### 1.2 Amino Acids Palette (`src/model/aminoAcidTemplates.ts` - NEW)

**StructureTemplate** entries for all 20 standard L-amino acids + D-forms:
- Each as Fischer projection AND zwitterion form
- Side chains as FunctionalGroupTemplates (already partially exist in `functionalGroupTemplates.ts`)
- Protecting groups: Fmoc, Boc, Cbz, Trt, Alloc, TFA
- Peptide bond template (dipeptide with correct geometry)

```typescript
// Example structure:
{
  id: "l-alanine",
  label: "L-Alanine",
  category: "aminoAcids",
  molecule: { ... },  // Full atom/bond layout
  annotations: []     // Stereo labels (R/S) on α-carbon
}
```

### 1.3 Nucleotides Palette (`src/model/nucleotideTemplates.ts` - NEW)

- **DNA**: dA, dT, dG, dC (deoxyribose + base + phosphate)
- **RNA**: A, U, G, C (ribose + base + phosphate)
- Each in: nucleoside, nucleotide (mono/di/tri-phosphate)
- Backbone templates for 3'→5' and 5'→3' linking

### 1.4 Carbohydrates Palette (`src/model/carbohydrateTemplates.ts` - NEW)

- **Monosaccharides**: D/L-Glucose, Galactose, Mannose, Fructose, Ribose, Deoxyribose
- **Forms**: Fischer, Haworth (α/β pyranose/furanose), Chair (⁴C₁/¹C₄)
- **Disaccharides**: Maltose, Lactose, Sucrose, Cellobiose (with glycosidic bonds)
- **Polysaccharide repeating units**: Cellulose, Starch, Glycogen

### 1.5 Steroids Palette (`src/model/steroidTemplates.ts` - NEW)

- **Core**: Gonane (cyclopentanoperhydrophenanthrene)
- **Key steroids**: Cholesterol, Testosterone, Estradiol, Progesterone, Cortisol, Bile acids
- **Configurations**: 5α/5β (A/B ring fusion), chair/boat conformations

### 1.6 Terpenes Palette (`src/model/terpeneTemplates.ts` - NEW)

- **Monoterpenes**: Limonene, Pinene, Myrcene, Terpinene
- **Sesquiterpenes**: Caryophyllene, Humulene, Farnesene
- **Diterpenes**: Taxol core, Retinol
- **Triterpenes**: Squalene, Lanosterol

### 1.7 General/Common Structures (`src/model/generalTemplates.ts` - extend)

- Common functional groups (already in `functionalGroupTemplates.ts`)
- Protecting groups (already partially there)
- Named reagents: PCC, DMP, Swern, Dess-Martin, Jones, etc.
- Common catalysts: Pd/C, Wilkinson's, Grubbs 1st/2nd gen

---

## Phase 2: Bond Types & Stereochemistry (High Priority)

### 2.1 Missing Bond Display Types

| ChemDraw Type | CDXML Display Value | Current Support | Action |
|---------------|---------------------|-----------------|--------|
| Bold Double | `BoldDouble` | ❌ | Add `BondStereo = "boldDouble"` |
| Dashed Double | `DashedDouble` | ❌ | Add `BondStereo = "dashedDouble"` |
| Triple | `Order="3"` | ✅ | Already works |
| Dative/Coordinate | `Dative="yes"` | ❌ | Add `Bond.dative` field (partially exists) |
| Hollow Wedge | `WedgeBegin` + `Hollow="yes"` | ❌ | Add `Bond.hollow?: boolean` |
| Bold Wedged Hash | `WedgedHashBegin` + `Bold="yes"` | ⚠️ degrades to dash | Add distinct type |

**Implementation**:
```typescript
// In types/chemistry.ts
export type BondStereo = "none" | "wedge" | "dash" | "wavy" | "bold" | "boldHash" | "dashed" | "boldDouble" | "dashedDouble" | "hollowWedge";

// In cdxml.ts export:
case "BoldDouble": return { stereo: "boldDouble", swapped: false };
case "DashedDouble": return { stereo: "dashedDouble", swapped: false };
case "HollowWedgeBegin": return { stereo: "hollowWedge", swapped: false };

// In BondView.tsx: render each style
```

### 2.2 Enhanced Stereochemistry

- **Atom parity** (R/S, E/Z): Already have `stereoLabel` on Atom
- **Enhanced stereo groups** (AND/OR): Not supported — add `Atom.stereoGroup?: { type: "and"|"or"; groupId: number }`
- **Wedge bond to chiral center**: Already works via `wedge`/`dash`

---

## Phase 3: Arrow Tool Expansion (High Priority)

ChemDraw has **35-41 arrow types**. Current support: 6 variants.

### 3.1 Additional Arrow Variants Needed

| Variant | Description | CDXML Representation |
|---------|-------------|---------------------|
| `dashed` | Straight dashed shaft | `Dash="yes"` on graphic |
| `double` | Double-shaft arrow (⇒) | Two parallel lines |
| `bold` | Thick shaft | `LineWidth="4"` equivalent |
| `openHead` | Open arrowhead (▷) | `Head="OpenHead"` |
| `circleHead` | Circle terminus | `Head="Circle"` |
| `diamondHead` | Diamond terminus | `Head="Diamond"` |
| `tailed` | Arrow with tail feather | `Tail="Full"` |
| `halfHead` | Single barb (fishhook) | Already: `barb: "single"` |
| `equilibriumHarpoon` | ⇌ with harpoons | Already: `variant: "equilibrium"` |
| `retrosyntheticOpen` | Retrosynthetic with open head | `Head="RetroSyntheticOpen"` |

### 3.2 Curved Arrow Enhancements

- **Arrow curvature handles**: Already have `curvature` field
- **Arc angle control**: Add `angularSize` field (CDXML `AngularSize`)
- **Multiple segments**: For complex curved paths — not in CDXML, app-only

### 3.3 Reaction Arrow Tool Features

- **Arrow positioning**: Auto-align to structures (snap to atom/bond centers)
- **Plus signs** (`+`): For multi-reactant/product — `ShapeAnnotation` with `variant: "plus"`
- **Conditions above/below arrow**: TextAnnotation with positioning logic
- **Step numbering**: Auto-numbered scheme steps (CDXML `<scheme><step>`)

---

## Phase 4: Orbital Tool Expansion (Medium Priority)

**Current**: s, p, lobe variants

**Add**:
| Orbital Type | Description | Implementation |
|--------------|-------------|----------------|
| `d` | d-orbital (4-lobed cloverleaf) | New `OrbitalVariant = "d"` |
| `sp` | sp hybrid (2 lobes, 180°) | `OrbitalVariant = "sp"` |
| `sp2` | sp² hybrid (3 lobes, 120°) | `OrbitalVariant = "sp2"` |
| `sp3` | sp³ hybrid (4 lobes, tetrahedral) | `OrbitalVariant = "sp3"` |
| `hybrid` | Generic hybrid orbital | `OrbitalVariant = "hybrid"` |

**CDXML Mapping**: `OrbitalType` attribute values

---

## Phase 5: Shape & Graphics Primitives (Medium Priority)

**Current**: rectangle, ellipse, line

**Add**:
| Shape | CDXML GraphicType | Use Case |
|-------|-------------------|----------|
| `polygon` | `Polygon` | n-sided polygons |
| `arc` | `Arc` | Circular arcs (non-arrow) |
| `curve` | `Curve` | Bézier curves |
| `polyline` | `Polyline` | Connected line segments |
| `roundedRect` | `RoundRect` | Rounded rectangles |
| `triangle` | `Triangle` | Triangle callouts |
| `hexagon` | `Hexagon` | Hexagon shapes |

**Features**:
- Fill patterns (solid, hatch, crosshatch, dots) — `FillType` + `FillPattern`
- Line styles (solid, dashed, dotted, dash-dot) — `LineStyle`
- Line caps (round, square, butt) — `LineCap`
- Line joins (miter, round, bevel) — `LineJoin`

---

## Phase 6: TLC Plate Enhancements (Medium Priority)

**Current**: Basic TLC plate with spots

**Add**:
- **Multiple solvent fronts**: `SolventFrontFraction` array
- **UV lamp indicators**: `ShowUV="yes"` + `UV254`, `UV365` colors
- **Staining visualization**: `StainType` (iodine, ninhydrin, KMnO₄, etc.)
- **Lane labels**: Text above/below each lane
- **Rf value display**: Auto-calculate and show Rf numbers
- **Plate dimensions**: Standard sizes (20×20, 10×10, 5×20 cm)

---

## Phase 7: BioDraw Elements (Low Priority - Professional Features)

Only if targeting ChemDraw Professional compatibility:

### 7.1 Biological Pathways
- Membranes (lipid bilayer)
- DNA/RNA helices
- Enzyme symbols
- Receptors, ion channels
- G-proteins, ribosomes
- Organelles (mitochondria, golgi, ER)

### 7.2 Sequence Tools
- Peptide sequence toolbar (1-letter/3-letter codes)
- Nucleotide sequence toolbar
- Expand/contract sequence
- Protective group toggles
- Cyclic peptide closure

### 7.3 HELM Notation
- Hierarchical Editing Language for Macromolecules
- Monomer library integration

---

## Phase 8: CDXML Import/Export Fidelity (Critical)

### 8.1 Round-Trip Testing Matrix

For each template/type, verify:
1. Draw in ChemDraw → Save as CDXML → Import in EnlaceCraft → Export CDXML → Open in ChemDraw
2. Draw in EnlaceCraft → Export CDXML → Open in ChemDraw → Save CDXML → Import in EnlaceCraft

### 8.2 Known Gaps to Fix

| Feature | Import Status | Export Status | Fix Required |
|---------|---------------|---------------|--------------|
| Nickname/abbrev groups (Ph, Boc) | ⚠️ imports as C | ❌ exports as C | Implement superatom/nickname system |
| Multi-fragment documents | ❌ | ❌ | Support multiple `<fragment>` per page |
| Page setup (margins, size) | ❌ | ❌ | Parse/serialize `<page>` attributes |
| Color table fidelity | ✅ | ✅ | Verify all colors round-trip |
| Font table | ⚠️ partial | ⚠️ partial | Full fonttable support |
| Scheme/reaction steps | ❌ | ❌ | Parse `<scheme>` element |
| Atom query properties | ❌ | ❌ | `Atom.queryProps` field |
| Bond query properties | ❌ | ❌ | `Bond.queryProps` field |
| Enhanced stereo (wedge/dash on same bond) | ❌ | ❌ | `Bond.enhancedStereo` |
| S-groups (polymers, mixtures) | ❌ | ❌ | `Molecule.sgroups` |
| 3D coordinates (z) | ⚠️ ignores z | ❌ | Preserve z in `Atom.z` |

### 8.3 CDX Binary Format

**Decision**: Do NOT implement `.cdx` binary parser. It's undocumented, proprietary, and `.cdxml` is the official interchange format. Document this clearly.

---

## Phase 9: UI/UX Integration (High Priority)

### 9.1 Template Picker Redesign

**Current**: Ring picker + Functional group picker + Structure templates

**New**: Unified **Template Palette Panel** with tabs:
```
[ Rings ] [ Amino Acids ] [ Nucleotides ] [ Carbohydrates ] [ Steroids ] [ Terpenes ] [ General ] [ Orbitals ] [ Arrows ] [ Shapes ] [ Lab Equipment ] [ My Templates ]
```

Each tab shows categorized grid with search/filter.

### 9.2 Arrow Tool Redesign

**Current**: Single arrow tool with variant selector

**New**: Arrow toolbar with:
- Variant buttons (visual icons)
- Head/tail style dropdowns
- Curvature handle (existing)
- Dashed/bold toggles
- Auto-connect mode (snap to atoms)

### 9.3 Bond Tool Enhancement

- Visual bond type selector (icons for each stereo type)
- Keyboard shortcuts for each (already partially exist)
- Dative bond toggle

### 9.4 Keyboard Shortcuts (ChemDraw Compatibility)

| Action | ChemDraw Shortcut | Implement |
|--------|-------------------|-----------|
| Benzene ring | `b` | ✅ |
| Cyclohexane chair | `Shift+B` | Add |
| Amino acid (1-letter) | `a` + letter | Add |
| Nucleotide | `n` + letter | Add |
| Arrow forward | `→` | ✅ |
| Equilibrium | `↔` | Add |
| Curved arrow | `c` + drag | Add |
| Orbital s/p/d | `o` + s/p/d | Add |
| TLC plate | `t` | Add |
| Bracket pair | `[` / `]` | Add |

---

## Phase 10: File Format Support (Medium Priority)

### 10.1 Import Formats
- ✅ CDXML (primary)
- ✅ SMILES
- ✅ MOL/SDF (V2000/V3000)
- ✅ XYZ
- ⚠️ CDX (binary) — **WON'T FIX** (undocumented)
- ❌ SKC (ChemSketch) — Optional
- ❌ CML (Chemical Markup Language) — Optional

### 10.2 Export Formats
- ✅ CDXML (primary)
- ✅ SMILES
- ✅ MOL/SDF
- ✅ SVG/PNG (image)
- ✅ PDF (via print)
- ❌ CDX — **WON'T FIX**

---

## Implementation Priority Order

| Phase | Priority | Est. Effort | Dependencies |
|-------|----------|-------------|--------------|
| 1. Template Palettes | P0 | 4-6 weeks | Core model types |
| 2. Bond Types | P0 | 1-2 weeks | types/chemistry.ts, cdxml.ts, BondView |
| 3. Arrow Expansion | P0 | 2-3 weeks | ArrowAnnotation, ArrowView, cdxml.ts |
| 4. Orbital Expansion | P1 | 1 week | OrbitalAnnotation, OrbitalView, cdxml.ts |
| 5. Shape Primitives | P1 | 1-2 weeks | ShapeAnnotation, ShapeView, cdxml.ts |
| 6. TLC Enhancements | P2 | 1 week | TlcPlateAnnotation, cdxml.ts |
| 7. BioDraw | P3 | 4+ weeks | New annotation kinds, major UI |
| 8. CDXML Fidelity | P0 | 2-3 weeks | cdxml.ts, validation, testing |
| 9. UI Integration | P0 | 3-4 weeks | All above phases |
| 10. File Formats | P1 | 1-2 weeks | io/ modules |

---

## Technical Architecture Notes

### Data Model Extensions

```typescript
// types/chemistry.ts additions
export type BondStereo = "none" | "wedge" | "dash" | "wavy" | "bold" | "boldHash" | "dashed" | "boldDouble" | "dashedDouble" | "hollowWedge";

export interface Bond {
  // ... existing
  hollow?: boolean;           // for hollow wedge
  dative?: boolean;           // coordinate bond
  queryProps?: BondQueryProps; // query bond properties
}

export interface Atom {
  // ... existing
  stereoGroup?: { type: "and" | "or"; groupId: number };
  queryProps?: AtomQueryProps;
  z?: number;                 // 3D coordinate
}

export type OrbitalVariant = "s" | "p" | "lobe" | "d" | "sp" | "sp2" | "sp3" | "hybrid";

export type ShapeVariant = "rectangle" | "ellipse" | "line" | "polygon" | "arc" | "curve" | "polyline" | "roundedRect" | "triangle" | "hexagon";

export interface ShapeAnnotation {
  // ... existing
  fillPattern?: "solid" | "hatch" | "crosshatch" | "dots";
  lineStyle?: "solid" | "dashed" | "dotted" | "dashdot";
  lineCap?: "round" | "square" | "butt";
  lineJoin?: "miter" | "round" | "bevel";
}

export type ArrowVariant = "forward" | "equilibrium" | "resonance" | "retrosynthetic" | "curved" | "curvedReverse" | "dashed" | "double" | "bold" | "openHead" | "circleHead" | "diamondHead" | "tailed";

export interface ArrowAnnotation {
  // ... existing
  headStyle?: "full" | "open" | "circle" | "diamond" | "retro" | "half";
  tailStyle?: "none" | "full" | "half" | "open";
  shaftStyle?: "solid" | "dashed" | "bold" | "double";
}
```

### CDXML Mapping Strategy

For each new feature, implement **both directions**:
1. **Import**: Parse CDXML element/attribute → internal model
2. **Export**: Internal model → CDXML element/attribute

Test with real ChemDraw-generated files at each step.

### Testing Strategy

1. **Unit tests**: Each parser/writer function (cdxml.test.ts)
2. **Round-trip tests**: ChemDraw file → Import → Export → Compare
3. **Visual regression**: Snapshot testing of rendered output
4. **Compatibility suite**: Collect 50+ real ChemDraw files covering all features

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CDXML undocumented edge cases | High | Medium | Test with diverse real files; graceful degradation |
| Nickname/superatom round-trip | High | High | Implement proper superatom system or document limitation |
| BioDraw complexity | Medium | High | Defer to Phase 2; focus on core chemistry first |
| Performance with large templates | Low | Medium | Lazy-load templates; virtualize picker grids |
| Font/color fidelity | Medium | Medium | Embed fonttable/colortable faithfully |

---

## Success Criteria

1. **Import**: Open any ChemDraw-generated CDXML file without errors
2. **Visual fidelity**: Imported structures match ChemDraw rendering ≥95%
3. **Export**: Files saved from EnlaceCraft open in ChemDraw without data loss
4. **Templates**: All standard ChemDraw template categories available
5. **Workflow**: ChemDraw users can switch to EnlaceCraft without relearning tools

---

## Appendix: ChemDraw Template Palette Reference

From ChemDraw 17/18/21 manuals and documentation:

**File > Open Templates submenu:**
- General
- Rings
- Amino Acids
- DNA/RNA (Nucleotides)
- Carbohydrates
- Steroids
- Terpenes
- Orbitals
- Arrows
- Shapes
- Lab Equipment (BioDraw)
- My Templates (user-created)

**Main Toolbar Tools:**
- Selection (Lasso, Marquee)
- Bond tools (Single, Double, Triple, Wedge, Dash, Wavy, Bold, Dative, Query)
- Charge (+/-)
- Atom label
- Chain
- Ring (3-7 member, fused, spiro)
- Functional Group
- Text/Caption
- Arrow (Straight, Curved, Equilibrium, Resonance, Retrosynthetic, etc.)
- Bracket (Square, Curly, Paren)
- Shape (Rectangle, Oval, Line, Polygon, Arc)
- Orbital (s, p, d, sp, sp2, sp3, lobe)
- TLC Plate
- Erase
- Plus (for reaction schemes)

**Context Menu Actions:**
- Clean Up Structure
- Check Structure
- Convert to/from Name (Name=Struct)
- Calculate Properties
- NMR Prediction
- 3D Model (Chem3D integration)

---

*Document Version: 1.0*
*Last Updated: 2026*
*Author: EnlaceCraft Team*