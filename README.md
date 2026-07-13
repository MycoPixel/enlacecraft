# EnlaceCraft

A browser-based molecule drawing application in the spirit of ChemDraw — built with React,
TypeScript, Zustand, and SVG rendering. Runs entirely client-side; no backend required.

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
- Ring templates: benzene, cyclohexane, cyclopentane, cyclobutane, cyclopropane —
  place fresh or fuse onto an existing atom
- Full element palette with charges, implicit-hydrogen labeling, and a live molecular
  formula readout
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
- Rotate the current selection (or the whole molecule, if nothing's selected) in
  30° steps — sidebar/mobile-toolbar buttons, or `[` / `]` on desktop
- A universal "Clear everything" action (top bar, works on mobile and desktop)
- Undo/redo, keyboard shortcuts (desktop), touch-friendly bottom toolbar (mobile)
- **Compound search**: type a name (e.g. "aspirin", "caffeine") into the search box
  in the top bar and it's looked up against PubChem's public database and dropped
  onto the canvas with real 2D coordinates — no local SMILES parsing needed, since
  PubChem can hand back a ready-to-use 2D structure file directly
- **English / Spanish interface**: a language toggle in the top bar switches every
  tool tooltip, label, and status message; it remembers your choice (localStorage)
  and defaults to your browser's language on first visit
- Compound search understands Spanish names too (e.g. "cafeína", "ácido acético")
  even though PubChem itself is indexed mostly in English — see below
- Import/export MOL (V2000), export PNG and SVG
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

## Project structure

The app is deliberately layered so each concern can be worked on (or replaced) independently:

```
src/
  types/chemistry.ts        Domain types: Atom, Bond, Molecule, ToolId, ...
  model/                    Pure chemistry logic (no React, no store)
    constants.ts             Elements, colors, valence table, ring templates
    geometry.ts               distance / angle / snapping math
    valence.ts                 implicit-H, over-valence, molecular formula
    molecule.ts                 addAtom/addBond/moveAtoms/... pure reducers
    id.ts                        id generator
  engine/                   Interaction logic that sits on top of the model
    hitTest.ts                atom/bond hit-testing under a pointer
    bondAngles.ts               bond-angle snapping heuristic
    ringPlacement.ts             ring template placement / fusion
  io/                       File format & export handling
    molfile.ts                 MOL (V2000) import/export
    exportImage.ts               PNG/SVG rasterization + download
  store/
    useMoleculeStore.ts       Zustand store: structural state + undo/redo history
                              + tool/selection/view/theme UI state
  hooks/
    useCanvasInteractions.ts  Pointer event handling (draw/move/pan/zoom)
    useKeyboardShortcuts.ts    Global keyboard shortcuts
    useIsMobile.ts              Responsive breakpoint hook
  components/
    Canvas/                   MoleculeCanvas, AtomView, BondView (SVG rendering)
    Sidebar/                  Desktop toolbar + pickers
    TopBar/                   Brand, formula, undo/redo, import/export, theme
    MobileToolbar/            Touch-friendly bottom toolbar
    StatusBar/                Status text, formula (mobile), zoom readout
  styles/                    theme.css (CSS variables) + app.css (layout)
  App.tsx                    Layout assembly
  main.tsx                   React entry point
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
  there's no V3000 support.
- No multi-select marquee, copy/paste, or reaction-arrow tooling yet — see "Extending it"
  above for where these would plug in.
