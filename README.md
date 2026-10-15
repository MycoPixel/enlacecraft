# EnlaceCraft

A browser-based molecule drawing application in the spirit of ChemDraw — built with React,
TypeScript, Zustand, and SVG rendering. The 2D editor runs entirely client-side, no backend
required; a couple of optional features (NMR prediction, high-accuracy 3D structures — see
below) call small local backend services that are only present in the desktop (Electron)
build.

<br/>

## Features

- Click/drag drawing of single, double, triple, wedge, and dash bonds with 30°-snapped
  angles (auto zig-zag chains), with a live tinted preview of where the bond and atom
  will land before you release the mouse/finger
- Double bonds default to an **auto** placement: the second line is drawn toward
  whichever side the surrounding atoms sit on, so ring double bonds (benzene,
  fused rings, etc.) automatically get their inner line on the interior side with
  no manual work, and it re-evaluates live as you edit the structure. Click the
  double-bond tool again on an existing double bond to override it, cycling
  auto → left → right → center → auto
- Ring templates: carbocycles (benzene, cyclopropane through cyclooctane) plus
  common heterocycles — pyridine, furan, thiophene, pyrrole, imidazole, pyrimidine,
  piperidine, pyrrolidine, tetrahydrofuran, tetrahydropyran, morpholine, piperazine
  — and fused naphthalene; place fresh or fuse onto an existing atom
- Functional-group templates (hydroxyl, amine, thiol, ether, carboxylic acid, ester,
  amide, ketone, aldehyde, nitrile, nitro) and a small abbreviated-group/superatom
  registry (Me, Et, tBu, Ph, Bn, Ac, OMe, Boc, Ts), plus free-text atom labels that
  parse as elements, isotopes, condensed formulas (e.g. "COOH", "CF3"), or
  placeholder substituents (R, R1, R', Ar, X, Nu, E, ...)
- Reaction/mechanism-arrow tool: straight, equilibrium, resonance, and curved arrows,
  in both full (electron-pair) and fishhook (single-electron) barb styles, with
  adjustable arrowhead size
- Brackets (for polymers, ions, and other grouped structures), text annotations,
  and the "+" annotation for reaction schemes
- Full element palette with charges, radicals, lone pairs, isotope labeling
  (D/T shorthands and mass-number notation), implicit-hydrogen labeling, R/S
  stereo-descriptor labels, and a live molecular formula readout
- Visual valence-violation warnings based on a simplified charge-adjusted valence model
- Move single atoms or multi-atom selections; pan (dedicated Pan tool, or
  middle-mouse-drag from any tool) and zoom the canvas
- Selection tools: click an atom to select it, shift-click to add/remove atoms
  one at a time, drag on empty canvas to rectangle-select ("marquee", shift to
  add to the current selection), and double-click any atom or bond to select
  its entire connected molecule at once
- Toggle-able "Show Hydrogens" button: switches every atom between the default
  skeletal look and fully-labeled atoms with explicit implicit-hydrogen counts
  (e.g. every backbone carbon shows as CH₂/CH₃ instead of a bare vertex)
- Black-and-white mode: a toggle that renders every atom label in the theme's ink
  color instead of CPK element colors, for print/grayscale-friendly output
- Highlight tool: apply one of eight preset emphasis colors (or clear it) to the
  current atom/bond selection, for calling out specific parts of a structure
- Rotate the current selection (or the whole molecule, if nothing's selected) in
  30° steps — sidebar/mobile-toolbar buttons, or `[` / `]` on desktop
- A universal "Clear everything" action (top bar, works on mobile and desktop)
- Copy/paste of the current selection (`hooks/useClipboard.ts`) — via a private
  round-trippable format, with an OS-clipboard path (Ctrl/Cmd+C/V) where the browser
  supports it and an in-memory fallback otherwise (notably Firefox, which doesn't
  support arbitrary clipboard MIME types)
- Undo/redo, keyboard shortcuts (desktop), touch-friendly bottom toolbar (mobile)
- Multi-document tabs: work on several structures at once in one window, each
  with its own undo history; rename, close (with an unsaved-changes confirm),
  and open new tabs from the tab bar
- **Compound search**: type a name (e.g. "aspirin", "caffeine") into the search box
  in the top bar and it's looked up against PubChem's public database and dropped
  onto the canvas with real 2D coordinates — no local SMILES parsing needed, since
  PubChem can hand back a ready-to-use 2D structure file directly
- **Structure search**: the reverse lookup — searches PubChem for real compounds
  that contain the currently drawn structure (or selection) as a substructure,
  so you can start from a fragment and find what it's part of
- **English / Spanish interface**: a language toggle in the top bar switches every
  tool tooltip, label, and status message; it remembers your choice (localStorage)
  and defaults to your browser's language on first visit
- Compound search understands Spanish names too (e.g. "cafeína", "ácido acético")
  even though PubChem itself is indexed mostly in English — see below
- Import/export MOL (V2000), import/export CDXML (ChemDraw's documented XML
  interchange format — see `io/cdxml.ts` for what does and doesn't round-trip),
  export SMILES, and export PNG/SVG
- **3D structure view**: a toggleable panel next to the 2D canvas showing a real,
  computed 3D structure of what you're drawing, with a choice of three generation
  methods (see below) — fast collision-free conformer, MMFF94 force-field
  optimization, or GFN2-xTB semi-empirical quantum refinement (desktop app only)
- **IUPAC naming**: look up the systematic name for the current selection (or
  whole molecule) against PubChem's naming service — on demand via the top-bar
  button, or continuously via an auto-naming panel docked under the canvas that
  re-resolves the name (debounced) as you edit, opt-in and off by default to
  avoid hammering PubChem
- **NMR prediction** (desktop app only): predicts ¹H/¹³C shifts for the drawn
  structure via a bundled local model backend — see below
- Light/dark theme

<br/>

## Getting started

```bash
npm install
npm run dev       # starts a local dev server (Vite)
```

```bash
npm run build      # type-checks and produces a production build in dist/
npm run preview    # serve the production build locally
```

<br/>

## Changelog

Release notes are in [CHANGELOG.md](CHANGELOG.md) — what's new in each version,
and what changed underneath it.

<br/>

## Project structure

The app is deliberately layered so each concern can be worked on (or replaced) independently:

```
src/
  types/chemistry.ts        Domain types: Atom, Bond, Molecule, ToolId, ...
  model/                    Pure chemistry logic (no React, no store)
    constants.ts             Elements, colors, valence table, ring templates
    geometry.ts               distance / angle / snapping math
    valence.ts                 implicit-H, over-valence, molecular formula
    massSpec.ts                  exact mass, adducts, isotope pattern, neutral losses
    molecule.ts                 addAtom/addBond/moveAtoms/... pure reducers
    id.ts                        id generator
  engine/                   Interaction logic that sits on top of the model
    hitTest.ts                atom/bond hit-testing under a pointer
    bondAngles.ts               bond-angle snapping heuristic
    ringPlacement.ts             ring template placement / fusion
  io/                       File format & export handling
    molfile.ts                 MOL (V2000) import/export
    cdxml.ts                     CDXML (ChemDraw XML) import/export
    exportImage.ts               PNG/SVG rasterization + download
    embed3d.ts                  3D conformer generation (OpenChemLib) + MMFF94
    xtbRefine.ts                 Client for the GFN2-xTB refinement backend
    pubchem.ts                    PubChem PUG REST client (compound search)
    iupacLookup.ts                Shared IUPAC lookup+retry logic (button + live panel)
    nmrPredict.ts                 Client for the NMR prediction backend
    massBank.ts                   MassBank measured-spectrum lookup (MS/MS)
  store/
    useMoleculeStore.ts       Zustand store: structural state + undo/redo history
                              + tool/selection/view/theme UI state
  hooks/
    useCanvasInteractions.ts  Pointer event handling (draw/move/pan/zoom)
    useKeyboardShortcuts.ts    Global keyboard shortcuts
    useIsMobile.ts              Responsive breakpoint hook
    useAutoIupacName.ts          Debounced auto-naming for the live IUPAC panel
    useUpdaterStatus.ts          Polls the desktop app's auto-update status
  components/
    Canvas/                   MoleculeCanvas, AtomView, BondView (SVG rendering)
                              + LiveIupacPanel.tsx (auto-updating name panel)
    Sidebar/                  Desktop toolbar + pickers
    TopBar/                   Brand, formula, undo/redo, import/export, theme
                              + IupacNameButton, NmrPredictionButton,
                                DesktopDownloadButton
    Molecule3D/                3D structure panel (3Dmol.js viewer)
    MobileToolbar/            Touch-friendly bottom toolbar
    StatusBar/                Status text, formula (mobile), zoom readout,
                              update-ready prompt
  styles/                    theme.css (CSS variables) + app.css (layout)
  App.tsx                    Layout assembly
  main.tsx                   React entry point

electron/                   Desktop (Electron) shell — see ELECTRON.md
  server.cjs                  NMR prediction backend process manager
  structure3d_server.cjs       GFN2-xTB 3D-refinement backend process manager
  updater.cjs                  electron-updater wrapper (checks/downloads updates)

python/
  structure3d_server/        FastAPI backend for the "High accuracy (GFN2-xTB)"
                              3D method — see its own README.md
```

**Why this split matters for extending the app:** the `model/` and `engine/` folders have
zero React or Zustand dependencies — they're plain, testable TypeScript functions operating
on a `Molecule` object. That means new features like reaction arrows, a mechanism-arrow tool,
or a server-side rendering/export service can reuse the same chemistry logic without pulling
in UI code. The Zustand store (`store/useMoleculeStore.ts`) is the only place that combines
the model with mutable app state and undo/redo history, so swapping in Redux or another store
later only touches that one file.

<br/>

## Extending it

- **New tool**: add a `ToolId` variant in `types/chemistry.ts`, handle it in
  `hooks/useCanvasInteractions.ts`, add a button in `Sidebar.tsx` / `MobileToolbar.tsx`.
- **New ring/template**: add an entry to `RING_TEMPLATES` in `model/constants.ts`.
- **New export format**: add a function to `io/`, wire a button into `TopBar`'s `ExportMenu`.
- **Reaction arrows / text labels / templates library**: these are natural additions to the
  `Molecule` model (e.g. a parallel `arrows: Record<string, Arrow>` collection) and a new
  `engine/` module, without touching the rendering or store wiring patterns already in place.

<br/>

## 3D structure view

The 3D icon in the top bar toggles a resizable panel next to the 2D canvas showing
a computed 3D structure of whatever's currently drawn, rendered with
[3Dmol.js](https://3dmol.org). The 2D editor's coordinates are just a drawing
convenience, not real geometry, so the panel generates an actual 3D structure
rather than reprojecting anything — regenerated automatically (debounced) as you
edit, via whichever of three methods is selected in the panel's header:

- **Quick** — a collision-free 3D conformer from
  [OpenChemLib](https://github.com/cheminfo/openchemlib-js) (real
  torsion-preference statistics, not a random guess), no energy minimization.
  Runs fully client-side, in both the web and desktop builds.
- **Force field (MMFF94)** — that same conformer relaxed against a real MMFF94s
  molecular-mechanics force field (also via OpenChemLib), for geometry closer to
  a true local energy minimum. Also fully client-side.
- **High accuracy (GFN2-xTB)** — desktop app only. Takes the MMFF94-optimized
  structure and refines it further with **GFN2-xTB**, a real semi-empirical
  quantum-mechanical method, via a small local backend
  (`python/structure3d_server/`, spawned automatically in a packaged build —
  see `ELECTRON.md`). Genuinely more accurate than a force field, at a
  computational cost that's still fine for small teaching molecules. Not
  available in the plain web build, since it needs the bundled `xtb` binary.

Both local generation methods live in `io/embed3d.ts`; the GFN2-xTB client (which
talks to the backend over `localhost:8001`) is `io/xtbRefine.ts`. Abbreviated
group atoms (Ph, Boc, etc.) aren't yet supported by any of the three methods,
since this app stores them as a single labeled vertex with no real substructure
— the panel shows a clear message rather than a confusing failure in that case.

<br/>

## NMR prediction

Desktop app only. Predicts ¹H and ¹³C chemical shifts for the current selection
(or whole molecule) via a separate local model backend (**NMRGraph**, a
different project from this one — see `ELECTRON.md`'s "Bundling the NMR
prediction server" section for how it gets frozen and copied in), reached over
`localhost:8000` (`io/nmrPredict.ts`). Results are grouped by symmetry-
equivalent atoms (`groupByEquivalence`) rather than shown one row per atom, and
can optionally use a GFN2-xTB-refined 3D structure as the model's input
geometry instead of its own default embed — see the doc comment at the top of
`NmrPredictionButton.tsx` for why that's a meaningfully better input, not just
a slower one. There's no web-build equivalent: unlike the 3D panel's Quick/
MMFF94 tiers, this has no client-side fallback, since running a real predictive
model in the browser isn't practical.

<br/>

## IUPAC naming

Two ways to get a systematic name for the current selection (or whole
molecule), both against PubChem's naming service and both sharing the same
lookup/retry logic (`io/iupacLookup.ts`, factored out specifically so the two
call sites can't drift apart in behavior):

- **On demand** — `IupacNameButton.tsx` in the top bar, click to resolve once.
- **Live** — `LiveIupacPanel.tsx`, docked under the canvas. Off by default
  (toggle in the panel itself); when on, it re-resolves the name automatically
  as the structure changes, debounced (`hooks/useAutoIupacName.ts`) so a burst
  of edits collapses into one request after you pause, rather than hitting
  PubChem on every bond drawn.

If the exact stereoisomer doesn't resolve, both retry once with stereochemistry
stripped and flag the result accordingly, rather than surfacing a dead end.
When the UI language is Spanish, both also show a best-effort transliteration
underneath the (always-authoritative) English name — see
`approximateSpanishIupacName`'s doc comment in `io/compoundTranslate.ts`.

<br/>

## Compound search

Typing a name into the top-bar search box calls PubChem's public PUG REST API
directly from the browser:

```
https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/<name>/record/SDF?record_type=2d
```

PubChem returns a 2D SDF (structure-data file) with real, pre-computed 2D layout
coordinates. An SDF's structure block is the same MDL V2000 format as a `.mol`
file, so this reuses the exact same parser as **Import .mol** (`io/molfile.ts`) —
no SMILES parsing or coordinate-generation was needed on our end. The result is
merged onto the canvas (next to whatever's already drawn, or centered if the
canvas is empty) as a single undoable step, via `insertMolecule` in
`model/molecule.ts`, which remaps ids so it can never collide with existing atoms.

This is a direct client-side network call (see `io/pubchem.ts`), so:
- It requires the end user's browser to have outbound internet access to
  `pubchem.ncbi.nlm.nih.gov`. If you deploy this behind a restrictive network/proxy,
  you'd need to add a small server-side proxy and point `PUG_REST_BASE` at it instead.
- PubChem's usage policy asks for no more than ~5 requests/second, which a
  human typing into a search box is nowhere near.
- Only compounds present in PubChem's database can be found; the error state
  (not found, network error, unparseable response) is surfaced in the search box.

### Searching in Spanish

PubChem's name index is overwhelmingly English (plus IUPAC/CAS names), so a raw
Spanish query usually 404s. When that happens, `io/compoundTranslate.ts` retries
once, resolving the name to English via:

1. A small curated dictionary of common compound names (instant, no network, and
   can't produce a wrong chemical translation the way machine translation could) —
   e.g. `cafeína → caffeine`, `ácido acético → acetic acid`, `agua → water`.
2. A fallback to [MyMemory](https://mymemory.translated.net/) — a free, keyless,
   CORS-enabled translation API — for names not in the dictionary, so arbitrary
   Spanish input still has a reasonable shot at resolving.

The dictionary lives as a plain object in `ES_TO_EN` in `io/compoundTranslate.ts`;
extending it (more compounds, other languages) is a one-line-per-entry edit — just
add more `langpair` fallbacks in the same file to support additional languages
beyond Spanish.

<br/>

## Internationalization (UI language)

The interface language is separate from compound-search language resolution above.
`i18n/translations.ts` holds flat `key -> string` dictionaries for `en` and `es`;
`i18n/useT.ts` is the `useT()` hook components call to get a `t(key, vars?)`
function, and `i18n/translate.ts` is the same lookup usable outside React (e.g. the
pointer-interaction hook, which isn't a component). Adding a language means adding
one more entry to the `translations` record — every component already reads through
`t()`, so nothing else needs to change. The chosen language persists to
`localStorage` and otherwise defaults to the browser's language.

<br/>

## Deployment

The Vite config uses a relative `base: "./"`, so the production build in `dist/` works when
hosted at any path.

**Vercel**
```bash
npm i -g vercel
vercel
```
Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.

**GitHub Pages**
```bash
npm run deploy
```
This runs `gh-pages -d dist` (already wired up in `package.json`) after building, publishing
`dist/` to the `gh-pages` branch. Enable Pages for that branch in your repo settings.

**Any static host** (Netlify, S3, nginx, etc.): run `npm run build` and serve the `dist/`
folder — it's a fully static bundle.

<br/>

## Desktop app

Packaged with Electron — see `ELECTRON.md` for building installers locally and
bundling the two Python backends (NMR prediction, GFN2-xTB 3D refinement).
Windows (`.exe`, NSIS) and Linux (`.AppImage`) only; no macOS build, since
producing one needs actual Mac hardware or a GitHub Actions `macos-latest`
runner, neither currently in use.

**Distribution**: built installers are published to the separate, public
[MycoPixel/enlacecraft-releases](https://github.com/MycoPixel/enlacecraft-releases)
repo (`electron-builder`'s `publish` config in `package.json`) — this repo
stays private, but that one holds nothing except compiled binaries, so nothing
here gets exposed by publishing a release. The webapp's top bar has a
**download button** (`DesktopDownloadButton.tsx`) that fetches that repo's
latest release from the GitHub API client-side and links straight to the
right asset for the visitor's OS.

**Auto-update**: the desktop app checks for updates on launch via
`electron-updater` (`electron/updater.cjs`), downloads any new version
automatically in the background, and shows a "Restart to update" prompt in
the status bar once it's ready — installing is never silent/forced, matching
the app's existing unsaved-changes-on-close behavior. Publishing a new
release is what triggers this for everyone already on an older version; see
`ELECTRON.md`'s "Publishing a release" section for the actual steps
(version bump, token, `--publish always`).

<br/>

## Recent fixes worth knowing about

- **Searched compounds landing off-screen**: fixed — new compounds now center on
  the actual visible viewport (tracked via `canvasSize` + `ResizeObserver` in
  `MoleculeCanvas`), not the world origin, which happened to sit at the canvas's
  top-left corner rather than its middle.
- **Charged carbons always showing "CH2+"-style labels**: fixed — a charge alone
  no longer forces a bonded carbon's full letter+H-count label; it now shows a
  bare vertex with just the +/- symbol unless Show Hydrogens is on (or the atom
  is a heteroatom / has no bonds at all). See `atomLabelInfo` in `model/valence.ts`.
- **Garbled "valence exceeded" text**: the old code embedded a `\u00b7` escape
  directly in JSX children, where it's not treated as a JS string (JSX text isn't
  escape-processed), so the literal six characters were rendered instead of a
  middot. Replaced with a proper standalone warning badge (icon + text).

## Known simplifications

- Imported/searched molecules that list hydrogens explicitly (common in real-world
  MOL/SDF files) have simple terminal H atoms stripped back to implicit on import,
  to match this app's skeletal display convention — `implicitH()` re-derives the
  same count from valence, so no chemical information is lost, only the redundant
  explicit graph nodes. Hydrogens that are multiply-bonded or charged are left as-is.
- Bond lines are shortened to clear each end's label text (see `atomLabelRadius` /
  `insetSegment`) using an approximate text-width estimate rather than exact font
  metrics — generous enough in practice, but a very long custom element label could
  theoretically still touch the line.
- Imported aromatic bonds (MDL bond type 4) are approximated as double bonds for
  display; query bond types (5-8) fall back to single. Neither is common in
  practice for compound-database exports (which are usually Kekulized), but both
  are handled defensively rather than silently mis-rendered.

This targets teaching / basic structure-drawing use, not full cheminformatics parity:

- Valence/charge rules are a simplified organic-chemistry approximation (see comments in
  `model/valence.ts`), not a full valence-electron model.
- Ring fusion shares only the attachment atom, not a full shared edge.
- MOL support covers the common V2000 atom/bond/charge (inline column and `M  CHG`
  property lines) and wedge fields, not SGroups, isotopes, or 3D coordinates, and
  there's no V3000 support. (The 3D structure view is unrelated to this — it
  generates its own 3D geometry fresh rather than importing/exporting it; see above.)
- Selection is rectangle ("marquee") only — no freeform/lasso selection.
- The abbreviated-group (superatom) registry is a small fixed list (`ABBREVIATED_GROUPS`
  in `model/constants.ts`: Me, Et, tBu, Ph, Bn, Ac, OMe, Boc, Ts) rather than the large
  nickname libraries ChemDraw ships. User-saved fragments (`model/userTemplates.ts`) cover
  reusable custom structures, but they paste back in as a full expanded fragment rather
  than collapsing to a single labeled vertex the way a true superatom/nickname does.
- Built-in `StructureTemplate`s (`model/structureTemplates.ts`) are limited to D-/L-glucose
  Fischer projections — no amino acid, peptide, nucleotide, or other biomolecule template
  library yet. See "Extending it" above for where more would plug in.
- No reaction atom-mapping (numbering corresponding atoms across reactants/products).
- CDXML import/export only; no native `.cdx` (ChemDraw's binary format is undocumented —
  see the comment at the top of `io/cdxml.ts`).
