# Changelog

Release notes for EnlaceCraft. Newest first.

The version number is the `version` field in `package.json`; each release is
tagged with it.

## 1.18.0

Adds a reaction builder that draws a whole scheme from names or SMILES, a
reagent table with computed masses and volumes, a `postMessage` API for
embedding the editor in another page, and an ONLYOFFICE plugin that inserts
the drawing as an editable object. Formula text is subscripted automatically
and the builder checks atom balance. The project moves to the GNU
AGPL-3.0-or-later, and undo/redo no longer leaves stale selection ids behind.

### Build a reaction from names or SMILES

- A new flask action in the top bar (and a command-palette entry) opens a
  dialog with separate reactant and product boxes. Each box accepts a
  compound name — resolved through the same PubChem/local-name path as the
  search box — or a SMILES string, which works offline.
- Multiple reactants and products are supported; plus signs are inserted
  into the gaps automatically rather than typed by hand.
- Conditions can be entered above and below the arrow, and the arrow's
  variant, head/tail style and size use the same picker as the sidebar.
- The finished row is laid out exactly like a hand-drawn reaction, so
  Clean up reaction, atom mapping, selection and export all continue to
  work on it. Building the row is one undo step.

### Stoichiometric coefficients

- Every reactant/product box has an optional small coefficient field
  (`2 H2 + O2`). Empty means no coefficient; integers, decimals and
  fractions such as `1/2` are accepted.
- A coefficient is stored as a text annotation with a `coefficientFor`
  atom-id list, so Clean up reaction can re-anchor it after the row is
  re-spaced instead of leaving it behind. Plus signs are placed between
  the previous structure and the next structure's coefficient.
- Coefficients move with their row in a multi-row scheme grid, are
  excluded from condition detection, and survive project save/load through
  the annotation validator.
- Copying/pasting a coefficient (and saving/pasting a user template) now
  remaps its atom references to the pasted structure's fresh ids. If the
  pasted fragment doesn't include the structure, the stale reference is
  dropped rather than left pointing at the original.

### Formula formatting everywhere

- Chemical-formula digits are now subscripted in any text annotation when
  you finish editing it, not just in builder-created conditions:
  `H2SO4` → H₂SO₄, `C12H22O11`, `Et3N`, `NaBH4`, `(NH4)2SO4`.
- The rule only subscripts a digit run directly after a letter or closing
  bracket, so quantities, ratios, temperatures and charges stay plain:
  `3 h`, `24 h`, `1:1`, `80 °C`, `pH 7.4`, `Fe3+`, `SO4-`.
- Existing bold/italic/colour markup and hand-made `<sub>`/`<sup>` spans
  are preserved, the formatter is idempotent, and it tracks the preceding
  character across tag boundaries (`H<b>2</b>SO4`).
- Condition boxes measure the smaller subscript glyph width, so a formula
  stays centred over the arrow without wrapping.
- The reaction interpreter now reads `H<sub>2</sub>SO<sub>4</sub>` as
  `H2SO4` (sub/sup tags are stripped without inserting spaces), so
  formatted captions still compare correctly.

### Automatic balance check

- Building a reaction now compares the element totals on both sides,
  including every row's stoichiometric coefficient and fractions, and
  reports the result in the status line: balanced, unbalanced with the
  mismatched elements (`C 2 → 3, H 6 → 4`), or unchecked when a coefficient
  is not numeric (for example the generic `n`).
- The check is atom balance only; charge and redox bookkeeping are out of
  scope.

### Reagent table

- A new top-bar table action opens a per-sheet reagent table: one row per
  reactant, reagent, catalyst, solvent or product, with equivalents, MW,
  mmol, density or concentration, and product yield.
- Everything that can be computed is computed, never stored: mass from
  mmol × MW, volume from concentration (preferred) or density, total
  reactant mass, and a product's isolated mass after its yield. Changing
  the batch scale moves every derived number in the same render, so the
  table cannot contradict itself.
- One row is the limiting reagent — the one marked, or the first reactant.
  Its mmol (or the batch scale) sets the batch; every other row is scaled
  from its equivalents. A row with an explicit mmol keeps that amount
  instead and is underlined so it is obvious which rows no longer follow
  the scale.
- "Add selection" turns each connected structure in the current selection
  into a row with its formula and MW taken from the drawing.
- Edits are written on Apply, so a column of typed numbers is one undo
  step; the table is saved with the sheet and copied out as CSV, including
  the derived columns.
- Removing a row, clearing the table and changing the scale are all undone
  and redone like any other edit.
- The table is drawn as part of the sheet: it hangs below the structure,
  pans and zooms with the drawing, and appears in PNG, SVG, PDF and print
  output because it lives inside the canvas SVG. Copying a selection still
  copies only the selected chemistry.

### Embedding API

- `?embed` opens the editor without its own chrome, autosave or version
  history, for use inside an `<iframe>`. A host page drives it with
  `postMessage`: `set`, `export` (project JSON, CDXML, SVG, SMILES, MOL,
  SDF, RXN), `picture` (base64 PNG), `uiTheme`/`setTheme`, `readOnly`,
  `selection`, `saved`, `markSaved`, `version` and `help`, each answered
  under the request's `id`.
- The editor posts `ready`, `change` and `selection` events of its own.
- `&origin=` takes a comma-separated allowlist; with no entry the editor
  only answers a real parent frame. An entry may also be a one-label host
  wildcard (`https://*.example.com`), `*`, or `null` for a sandboxed
  frame. A command that would export nothing answers with
  `The sheet is empty.` rather than a broken file.
- A multi-record SDF becomes one tab per record, with unique tab ids, so
  the second and later structures are no longer dropped.
- `change` and `selection` are sent only when the document or the selected
  ids actually differ, and never for mounting, so a host sees edits
  rather than redraws.
- `readOnly` guards the store's commit, undo and redo paths, so an
  embedding page can show a drawing it cannot edit.
- `ready` is announced from a timer rather than `requestAnimationFrame`:
  a frame that never paints (a background tab, a plugin window behind
  another) never fires rAF, and the host would wait forever.

### ONLYOFFICE plugin

- `onlyoffice-plugin/` builds a `.plugin` that opens the editor in a window
  over the document and inserts the drawing as an OLE object — a PNG
  preview plus the `.enlacecraft` project JSON — so double-clicking it
  reopens the drawing for editing.
- The whole editor is bundled under `web/`, so the plugin needs no server,
  no account and no network. `build.sh` runs the production build, asserts
  the relative asset paths survived, strips the service worker (which could
  never update from inside the editor) and zips the result.
- The plugin window remembers its size between uses and can be expanded to
  the whole window by double-clicking its title bar.

### License

- The project is now licensed under the GNU Affero General Public License,
  version 3 or later, which requires anyone who runs a modified version as
  a network service to offer its source too. `LICENSE` holds the full text,
  `THIRD-PARTY-NOTICES.md` the dependencies' licenses.
- The shortcuts/about overlay shows the license and a link to the source,
  as AGPL §13 asks for.
- Desktop packages ship `LICENSE` and `THIRD-PARTY-NOTICES.md` beside the
  app. The notices now name the bundled xtb 6.7.1 (LGPL-3.0-or-later, with
  the upstream source tag), the Temurin JRE and OPSIN inside the IUPAC
  fallback, and the provenance of the NMR model weights
  (`python/NMRGraph/MODEL_PROVENANCE.md`).
- The NMR result and its report credit nmrshiftdb2, whose database license
  asks for attribution, and the app no longer claims everything bundled is
  permissively licensed.

### Smaller changes

- The mass-spectrometry button uses a column-chart icon, distinct from the
  reaction builder's flask.
- The app version is shown in the brand tooltip and in the shortcuts
  dialog footer, read from `package.json` at build time.
- Undo and redo now prune atom, annotation and cycle ids that the restored
  snapshot no longer contains, preventing stale selections after undoing a
  generated reaction, an import or a deletion.
- The reagent dialog's limiting radio now shows the row that is actually
  limiting, including the fallback to the first reactant, and the CSV
  `Limiting` column agrees with it.
- A product's mass cell shows the isolated mass after yield beside the
  theoretical mass (`92.14 → 73.712`).
- The plugin posts commands to its own origin instead of `*` whenever the
  plugin has one.

## 1.17.1

Fixes two UI bugs found in pre-release testing: export menu entries that
couldn't all be seen or scrolled to on a short window, and a 3D-viewer atom
link that left an unremovable highlight on the canvas after the panel
closed.

### The export menu runs off the bottom of the screen

- The Export dropdown holds 25 entries (Save/Save As, sharing, picture and
  chemistry formats, Copy As). It is a fixed-position panel and nothing
  capped its height: on a window too short to show it all, the lower
  entries rendered past the bottom edge of the screen — unreachable, since
  no amount of scrolling reaches a fixed-position element that extends
  beyond the viewport. The dropdown now caps its height at the space
  actually available below the export button (recomputed while open on
  every resize) and scrolls the overflow — the same arrangement the sidebar
  tool dropdown already used. The molecule-info dropdown gets the same
  viewport cap as insurance.

### The 3D viewer leaves a selection behind that can't be removed

- Clicking an atom in the 3D panel's link tool highlights its 2D
  counterpart on the canvas: a selection *and* an accent ring. The ring is
  not a selection — clearSelection (Escape, clicking empty canvas) never
  touched it — so after closing the panel the highlight stayed with no way
  to remove it except reopening the panel and clicking the atom again.
  Closing the 3D panel now ends the link for good: the ring goes, and the
  single-atom selection the link tool made goes with it; a selection built
  on the canvas itself (anything bigger than that one atom) is left alone.

## 1.17.0

Completes the Octet Draw improvement plan (Phases 6–10: reaction
intelligence, catalytic cycles, page/workspace control, Office
interoperability and chemistry assistance), fixes the reported
progressive session lag, fixes and widens CDXML import — opening a
ChemDraw drawing now lands what was actually drawn on the canvas — and
fixes the reported copy/paste issues (a double paste in text fields, and
copies that pasted nothing into Microsoft Word / PowerPoint / LibreOffice /
OnlyOffice) by repairing the desktop clipboard channel that Electron 44's
API overhaul broke.

### The "pasted twice in a row" report (Ctrl+V in a text field)

- Verified with real key events on Electron 44: Chromium DOES have built-in
  input-edit bindings for Ctrl+C/X/V in text fields, so the desktop build's
  forwarded command ran *on top of* the native one — a Ctrl+V pasted the
  clipboard text twice in a row (e.g. "glucoseglucose" in the compound
  search box), Ctrl+Z undid two steps, Ctrl+A selected twice. The keydown
  handlers (useClipboard, useKeyboardShortcuts) now prevent the default in
  the desktop build so the forwarded command is the one and only action;
  the plain browser build is untouched and still lets the browser paste
  exactly once.

### The "Word pastes nothing" report

- **Electron 44 replaced the clipboard API** and the app's main-process
  handler was still written for the old one: `clipboard.write({ text, html,
  image })` now throws ("expects an array of ClipboardItem"), so the
  desktop rich-copy channel failed on every call and every copy fell back
  to weaker paths. The handler now writes one MIME-typed `ClipboardItem`
  (`text/plain` + `text/html` + `image/png`, the PNG as a Blob) in a single
  atomic write, with the legacy object form kept for older Electron pins;
  `clipboard.writeText` is awaited so "resolved" means "on the OS
  clipboard".
- **Uint8Array PNGs are now accepted**: a PNG sent from the renderer over
  IPC arrives as a `Uint8Array`, not a `Buffer` (verified on Electron 44) —
  the old `Buffer.isBuffer()` check rejected every PNG-bearing payload.
- **The HTML flavor now carries a base64 PNG instead of an SVG data URI.**
  Word 2016/2019 renders an SVG data-URI image as an empty frame — which
  reads as "paste did nothing" — while a base64 PNG is the one picture
  flavor Word, PowerPoint, LibreOffice, OnlyOffice and Google Docs all
  render from a paste. The SVG data URI remains as the fallback when no
  PNG could be produced. The native bitmap flavor still rides along, so
  targets that ignore HTML paste the raster instead.
- **A text-only copy now carries its words**: copying a text annotation
  (e.g. the caption "glucose") with no atoms used to put no text flavor on
  the clipboard at all; the annotation's plain text now lands in
  text/plain, so it pastes as text into Word, Notepad, or the app's own
  search box, while the picture flavors still ride along for visual
  targets.

### Performance — the "app starts lagging, reopen fixes it" report

- A per-molecule **adjacency index** replaces full bond-map scans: every
  `bondsOfAtom` call used to filter all bonds, and render paths call it per
  atom per frame — O(atoms × bonds) per render that grew as the drawing
  grew. Mouse-move and drag frames now stay flat as drawings get bigger.
- **Hover churn removed**: hover setters bail when the point/atom/bond is
  unchanged (previously every pointer move re-rendered the canvas shell),
  the keyboard-shortcut hook no longer re-subscribes the whole app on every
  atom hover, and the shared `t()` translator is now referentially stable,
  so structure descriptions and other memos actually memoize again.
- **Autosave** only re-arms on real document changes instead of every store
  touch (it used to re-serialize every tab after any pause in mouse
  movement), downloaded files no longer leak blob URLs, and version-history
  checkpoints taken when the window hides are rate-limited.

### Phase 8 — page, workspace and object control (finished)

- View toggles (rulers, crosshair, page outline) and the new drawing-behavior
  toggles are **command-palette commands**; the status bar shows active
  drawing constraints as clickable chips.
- New opt-in **"Fit SVG/PNG/HTML exports to page"** framing routes those
  exports through the same page-setup box PDF/print use (default stays the
  tight crop that pasting pictures wants).

### Phase 9 — Office and editor interoperability

- **Rich copy**: Ctrl+C / Copy puts a picture *and* editable chemistry on
  the clipboard — PNG, HTML (SVG), CDXML, MOL, SMILES and the private
  editable fragment, via the web Clipboard API or a new native Electron
  `clipboard:write-rich` bridge. Paste understands CDXML / MOL / RXN
  flavors from ChemDraw, SVGs carrying embedded CDXML metadata, and plain
  SMILES — all through the same sanitizing importers as opened files.
- **Copy As** menu and palette entries: SVG, PNG, CDXML, MOL V2000, MOL
  V3000 (new `exportMolV3000` writer), SMILES and InChI; SVG export embeds
  the drawing's CDXML in an SVG `<metadata>` block so an Inkscape/
  Illustrator round trip keeps the structure editable.
- **CDXML fidelity matrix**: new caption/rich-text, Spanish/unicode and
  large-coordinate fixtures, table-driven round-trip coverage
  (`cdxmlFidelity.test.ts`) and a hostile-input suite for the importer.
- Binary CDX and EMF/EPS/TIFF stay deliberately unsupported — now stated in
  the Paste Structure dialog's help.

### Desktop: copies actually reach the OS clipboard now

The packaged builds (AppImage/Windows) had two stacked wiring bugs that made
"Copy" look dead outside the app — nothing paste-shaped ever arrived in
Word, LibreOffice or an image editor, and in-app paste only worked through
the private in-memory fallback:

- **The Edit menu swallowed the canvas shortcuts.** The packaged build must
  register an Edit menu (without one, Linux/Windows have no copy/paste
  bindings at all — that earlier fix stands), but a registered menu
  accelerator is consumed before the page's keydown handlers ever run, and
  the menu roles' native commands only act on DOM text selections, which a
  canvas app never has. Ctrl+C therefore did nothing at all: the menu
  swallowed the key and then copied nothing. The menu's items now use
  `registerAccelerator: false` — every key reaches the app's own handlers
  (app-level copy/paste/cut/undo/redo/select-all on the canvas), while a
  text-field focus forwards the command back to the native editor through a
  new `edit:native-command` IPC with whitelisted command names, keeping the
  original "text is copyable in inputs" behavior. The menu's own click
  handlers (Alt, then Edit → Copy) send the same commands to the focused
  window over IPC, so the visible menu works too.
- **The rich copy never carried a picture.** The Ctrl+C payload held only
  the private JSON plus CDXML/MOL/SMILES text — and the desktop clipboard
  bridge writes exactly what the payload holds, so the OS clipboard got
  text alone and image-expecting targets found nothing to paste. The
  payload now also includes a selection-scoped SVG (carried as the
  text/html `<img>` flavor) and a selection-scoped PNG, so a copied
  fragment pastes as a picture into Office/LibreOffice/image editors and
  as editable chemistry into chemistry-aware targets.
- **Canvas Cut**: plain Ctrl/Cmd+X now cuts the selection — the same rich
  copy followed by deleting it as one undo step. Ctrl/Cmd+Shift+X stays
  the clean-reaction command.

### Phase 10 — chemistry assistance and library

- **Hybridisation-aware clean-up** (`engine/clean2d.ts`): ideal angles from
  hybridisation, element bond-length table, ring templates, cis/trans
  preservation, fixed wedge/dash endpoints, non-bonded overlap relaxation.
  The "Clean structure" command uses it, and an optional off-by-default
  **"Clean as I draw"** toggle idealizes each new stroke — bond tool, atom
  tool, chain tool and keyboard drawing — without ever moving existing
  atoms or placed stereochemistry: the stroke's new atoms relax onto ideal
  angle and length while the atoms they attach to are held as fixed
  anchors, all inside the stroke's own undo step.
- **Valence warnings with fixes**: the warning chip opens a popover listing
  every over-valent atom with an explanation and — where one exists — a
  one-click formal-charge fix (e.g. ammonium N+). Nothing is changed
  automatically.
- **R-groups**: define a substituent fragment against an R label, then
  **Expand generic structure** enumerates combinations (capped at 64) as
  editable copies laid out on a grid; definitions persist in the project.
- **Template library**: flipped chair and Newman conformations, ferrocene/
  cobaltocene/nickelocene and a Ru(II) acetate paddlewheel (haptic bonds),
  named aromatics (anthracene, phenanthrene, azulene, biphenyl, fluorene,
  indene), and lab-glassware shape variants (beaker, Erlenmeyer, round-
  bottom flask, test tube).
- **Name → structure**: PubChem first, with the desktop OPSIN backend as a
  local fallback (`/name-to-structure`) when offline or when PubChem misses.
- **Flatten to 2D**: the 3D panel can write its current geometry (including
  a rotated conformation) back onto the drawing as one undo step.

### Catalytic cycles

The Octet plan's Phase 7 figure ships in this release: a catalytic cycle is a
live ring drawn around a selection of intermediates — direction and scale
handles, in/out side arrows, a caption, drag-to-move the whole figure, and a
CDXML round trip (arcs, side arrows and captions export with a rebuild
marker our importer reads back; ChemDraw sees the drawn graphics). Phase 6's
reaction intelligence ships with it: create a scheme from a selection,
interpret reactant/product roles, map atoms, and clean up the whole scheme.

Deleting a cycle used to be impossible from the canvas — only the command
palette's "Remove cycle" worked. Fixed on every path:

- **Delete / Backspace removes a selected cycle.** Clicking the ring selects
  only the figure (the atom selection is cleared on purpose), and the Delete
  handler's old "something must be selected" guard swallowed the key before
  the store's cycle-only branch could run. The guard now lets a cycle-only
  selection through; `deleteSelection` removes just the ring figure, leaves
  the intermediates on the canvas, and undoes as one step.
- **Right-click / long-press a ring** now selects it and the context menu
  offers "Delete cycle" (the menu had no cycle section at all before).
- **Escape deselects the cycle too** — it used to leave the ring selected
  (and still targeted by the next Delete) while clearing everything else.

### CDXML import

- **`<arrow>` elements from current ChemDraw** (which write `Head3D`/`Tail3D`,
  `ArrowheadHead`/`ArrowheadTail`, and `AngularSize` instead of `x1/y1/x2/y2`)
  now import — plain reaction arrows, resonance arrows, curved mechanism
  arrows with the correct bulge side via the arc's bounding box, and both
  ends-headed/half-headed variants.
- **Stale graphics no longer import twice**: a graphic ChemDraw marked
  `SupersededBy` (left behind when it upgraded an arrow) is skipped, so its
  replacement arrow arrives once and no stray line remains.
- **Brackets** import with normalized boxes (a bracket drawn bottom-up no
  longer collapses to zero height), `BracketType` (`Curly`/`Round`) selects
  curly-brace vs. paren glyphs, and `<bracketedgroup>`/`<bracketattachment>`
  pairs decide each narrow glyph's open/close facing.
- **Orbital glyphs** (`<graphic GraphicType="Orbital">`, s/p/lobe) map onto
  the app's orbital annotations, and **TLC plates** (`<tlcplate>`/`<tlclane>`/
  `<tlcspot>` with `Rf`) map onto TLC plate annotations — both import-only,
  preserved losslessly in the project format.
- CDX color indexing corrected: color `0` is black/default, `1` is white, and
  the `<colortable>` entries start at index 2 — so TLC spots no longer import
  white/invisible, and caption color round-trips correctly.
- Imported CDXML drawings are reframed after import (`resetView`), since their
  coordinates are absolute page coordinates and could open partly off-screen.
- The user's reported file (`C:\Users\Paulo\Downloads\dibujo prueba.cdxml`,
  duplicate `untitled.cdxml`) is bundled as `src/io/fixtures/chemdraw-scheme.cdxml`
  and covered by an end-to-end regression test (14 atoms, 14 bonds, 1 charged
  atom, wavy/wedge/bold bonds, 2 arrows, 1 orbital, 4 brackets, 1 TLC plate).

### Structure templates — corrected, rebuilt, and expanded

The built-in structure picker's drawings were re-audited and rebuilt: every
template now has the correct molecular formula, one connected fragment, sane
bond lengths and stereo wedges where the compound is chiral. The old
hand-drawn data had missing/extra atoms, wrong bond orders, disconnected
fragments, over-valent atoms and stretched bonds; those are generated from
reference structures now (SMILES via OpenChemLib, PubChem 2D records for the
steroids/artemisinin) with explicit builders for the Fischer/Haworth
projections. A regression test pins each template's formula, connectivity and
insertion path.

The structure picker's categories:

- **Amino acids** — all 20 standard L-amino acids (ala, arg, asn, asp, cys,
  gln, glu, gly, his, ile, leu, lys, met, phe, pro, ser, thr, trp, tyr, val)
  with α-carbon, amino/carboxyl backbone and correct side-chain atom/bond
  layouts.
- **Nucleobases** — adenine, guanine, cytosine, thymine and uracil as
  standalone rings, in addition to the nucleotides below.
- **Nucleotides** — AMP (was already there) plus GMP, CMP, UMP, TMP (dTMP),
  GTP, CTP and UTP, each with ribose/deoxyribose sugar, nucleobase and
  mono-/tri-phosphate.
- **Steroids** — gonane and cholesterol plus testosterone, estradiol,
  progesterone, cortisol and cholic acid, each with the four-ring nucleus and
  its characteristic functional groups.
- **Terpenes** — limonene, caryophyllene, retinol plus menthol, camphor,
  artemisinin and squalene.
- **Carbohydrates** — D-glucose Fischer/Haworth and maltose plus D-galactose,
  D-mannose, D-fructose and D-ribose Fischer projections.

Each template is a full `StructureTemplate` (atom/bond layout, centered at
origin) insertable through the Structures picker, grouped by category.

### Bond stereo rendering

Three new bond stereochemistry types render in `BondView`:

- **`boldDouble`** — two heavy parallel lines for emphasized double bonds.
- **`dashedDouble`** — two dashed parallel lines for partial/resonance bonds.
- **`hollowWedge`** — an unfilled triangular outline for "bond comes out"
  stereochemistry.

All three round-trip through CDXML via `Display="BoldDouble"`,
`Display="DashedDouble"` and `Display="HollowWedgeBegin"`.

### Arrow variant rendering

Seven new arrow variants render in `ArrowAnnotationView`: `dashed`, `double`,
`bold`, `openHead`, `circleHead`, `diamondHead`, `tailed`. Straight variants
carry `LineStyle`/`ArrowheadType` attributes on export and re-import to the
matching variant; curved variants keep using `<arrow>` elements with
`AngularSize`.

### Shape variant rendering

Nine new shape variants render in `ShapeAnnotationView`: `roundedRect`,
`triangle`, `hexagon`, `polygon` (configurable sides), `arc` (start angle +
sweep), `curve` and `polyline` (point lists). Export writes `GraphicType`
(`Arc`, `Curve`, `Polyline`, `Polygon`, `RoundRect`, `Triangle`, `Hexagon`)
with `NumSides`, `StartAngle` and `Points` attributes; import maps them back
to the matching variant.

### Round-trip tests

CDXML tests now cover `boldDouble`/`dashedDouble`/`hollowWedge` bond stereo,
all straight arrow variants, all new shape variants, and a `validate.test.ts`
correction so `hexagon` is accepted as a valid shape variant instead of being
repaired to `rectangle`.

### Brackets and TLC plates
- **Curly brackets no longer import/draw backwards**: `open` now anchors at the
  right edge and curls left, `close` anchors at the left and curls right, so a
  pair faces inward toward the enclosed fragment the way ChemDraw (and the
  app's own bracket tool) draws them. Square brackets and parentheses were
  already correct; only the curly-brace path had its anchor/protrude swapped.
- **TLC spots are draggable**: with the TLC tool active, clicking an existing
  spot grabs it and dragging moves it (fractional `fx`/`fy` recomputed and
  clamped to the plate); click still adds a spot, and Shift+click still removes
  the nearest one. Previously spots could only be added or removed, never
  repositioned.
- **Double-click a TLC plate to start spotting**: placing a plate returns the
  tool to select (so the new plate can be moved/resized straight away), which
  used to leave no way to add spots without re-picking the TLC tool from the
  sidebar. Double-clicking the plate now switches straight back to the TLC
  tool, keeping the plate selected so the resize handle is still available.

### Ring picker and functional groups

- **Functional-group rings attach at a full bond length**: phenyl, benzyl,
  cyclohexyl, benzoyl, Cbz, tosyl and the tyrosine side chain were landing
  with a half-length (21 px) bond to the atom they were attached to. The
  shared ring builder now places the ring's first vertex a full bond length
  away, and a geometry regression test covers every group.
- **Naphthalene appears once** in the ring picker (it was listed twice), and
  the **1,3,5-/1,2,4-triazine** tooltips show their names instead of the raw
  translation key `ring.1,3,5-triazine`.

### NMR spectrum SVG export

- **Multiplet fine structure is visible in exported figures.** The SVG was
  760 px wide and sampled the curve at 480 points. At the assumed 400 MHz a
  7 Hz doublet is 0.0175 ppm apart, which was both about one pixel and almost
  exactly the sample step - so the path could step straight over a multiplet's
  lines and draw one spike at their midpoint, and zooming the exported image
  afterwards could not recover structure that was never in it. The figure is
  now 1600×460, a wide banner that doubles the horizontal resolution of the
  full ppm range, and the curve is sampled four times per plot pixel (6112
  points), so the exported path contains the individual lines. Type sizes were
  adjusted for the larger canvas. A regression test exports a 7 Hz doublet and
  asserts the path has two separate peak tops.

## 1.16.0

Two frontiers move at once: chemistry *data* can now come in as text (SMILES,
isotope-carrying MOL files), and CDXML files stop being stripped down to bare
molecules — reaction arrows, mechanism arrows, brackets, braces and styled
text captions now come in, and go back out. A new curly-brace tool completes
the bracket family so everything the importer can deliver can also be drawn
from scratch. And the drawing palette itself takes its biggest step toward
ChemDraw parity: bold/hash/dashed bond styles, the retrosynthetic arrow,
graphics primitives, orbital glyphs, a TLC-plate tool, and text underline &
color close the gaps the first CDXML round-trip exposed.

### SMILES import

The export menu already copied SMILES out; now the same strings can come back
in. Paste `CC(=O)Oc1ccccc1C(=O)O` and aspirin lands on the canvas with a real
2D layout. The parsing is OpenChemLib's (already bundled for the 3D panel and
descriptors), bridged through the *existing* MOL importer — so an imported
SMILES gets exactly the same scale calibration, skeletal-H treatment, and
wedge/dash handling as a dropped .mol file or a PubChem search result. Isomeric
SMILES (`C[C@H](O)Cl`) arrive as drawn wedge or dash bonds; bracket charges and
multi-fragment salts (`.Na+`) come through as drawn.

### Paste structure

A new clipboard button in the top bar opens a paste dialog that takes SMILES,
MOL text, or CDXML — whichever you copied, it detects the format live and shows
what it's about to do before you commit. The structure is added to the *current*
canvas next to whatever's already drawn (or centered when it's empty), selected,
and undoable as one step, the same way compound search inserts results. Ctrl/Cmd+Enter
submits; Escape dismisses.

### .smi / .smiles files

Those extensions now work everywhere a file can come in: the Import picker, the
desktop Open dialog, and drag-and-drop onto the window. Loose extensions like
.txt are sniffed by content — a recognizable SMILES or MOL inside is parsed as
such regardless of the name. One molecule per line files (the usual "SMILES
name" convention) work; the first line that parses wins.

### MOL files keep isotopes now

`M  ISO` property lines — how OpenChemLib, PubChem, and ChemDraw encode isotope
labels — were silently ignored on import, so a 13C in any of those files came
in as plain carbon. They're read now, with the semantics got right: the M ISO
value is the *absolute* mass number (13), not the inline column's difference
(+1). Deuterium and tritium survive the explicit-hydrogen strip they'd
otherwise have been eaten by, since `isSimpleTerminalHydrogen` already
excluded labeled H.

### Full-document CDXML import

Importing a scheme from ChemDraw used to deliver just the atoms and bonds;
every arrow and annotation in the file was silently dropped, which made
CDXML useless for reaction schemes — the most common thing a CDXML file *is*.
The importer now walks the whole document, not just the `<fragment>` nodes:

- `<arrow>` elements map to the app's arrow annotations by their Head/Tail
  classes — regular reaction arrows, resonance (both-ends-barbed) arrows,
  and equilibrium arrows; two antiparallel harpoons are recognized as the
  pair that draws one equilibrium arrow. Curved mechanism arrows
  (fishhook/full) import as curved arrows.
- `<graphic>` elements become square brackets, curly braces (spans and frame
  styles), and plain lines/arcs where nothing better applies.
- Top-level `<t>`/`<s>` runs become text captions with their styling —
  bold/italic/superscript/subscript faces, font size, and color. Atom-label
  text inside `<n>` elements is correctly *not* imported as a caption — it's
  already part of the atom.

Everything lands in the same annotation layer the drawing tools use, so
imported arrows and captions are selectable, draggable, and editable like
anything drawn by hand. Text is sanitized on the way in, and coordinates and
font sizes share the bond-length self-calibration scale, so a file written
at any ChemDraw zoom level lands at the app's standard scale.

### CDXML export catches up

Export writes the whole document too: reaction and resonance arrows,
equilibrium as the harpoon pair ChemDraw expects, bracket pairs as one
spanning graphic, and captions with their face/size/color runs (including a
dynamic colortable when non-default colors are used). Round-tripping a file
through EnlaceCraft keeps arrows, brackets, and captions at their original
coordinates. Curved mechanism arrows are the one deliberate gap — CDX's arc
geometry for them is undocumented, and guessing it would produce files other
editors render wrong, so curved arrows stay import-only.

### Curly braces, draw-your-own

The renderer knew how to draw a proper curly brace, but no tool could produce
one: the bracket picker offered only ( ) and [ ], and CDXML braces degraded to
paren glyphs on import. The bracket picker now has a third glyph — { } — and
CDXML `Brace` graphics import as real curly braces (spanning pairs included).
CDX has only two bracket types, so parens and braces both write back as
`Brace` graphics and both re-open as curly; visually adjacent, and every
glyph stays editable either way.

### The drawing palette closes the ChemDraw gaps

The first tool audit against ChemDraw's palette found a set of drawing
conventions the app couldn't produce — mostly the "non-chemistry" glyphs that
real schemes are full of. They're all in now:

- **Bold, bold-wedged-hash, and dashed bonds.** Bold is the heavy emphasis
  line for reaction-center callouts; the bold wedged hash is its hashed-wedge
  sibling; the plain dashed bond (uniform dashes *along* the bond, unlike the
  hashed wedge's growing marks *across* it) covers partial bonds, hydrogen
  bonds, and transition states. Clicking an existing bond with any of the
  three applies the style in place, exactly like the wedge/dash tools.
- **The retrosynthetic arrow.** The double-shaft, open-head disconnection
  arrow of synthetic analysis, with a dashed-shaft option on all straight
  arrows (for projected/multi-step flows). CDXML round-trips it through
  CDX's own `RetroSynthetic` head class.
- **Shapes: rectangle, ellipse, line.** The generic graphics primitives,
  with an outline/filled toggle. This also closes the CDXML import gap —
  ChemDraw `Rectangle` and `Oval` graphics and plain headless lines used to
  be dropped; now they import as shape annotations and export back.
- **Orbitals: s, p, and a free single lobe**, outline or shaded, for
  mechanism and MO pictures. One gesture places size *and* axis; a single
  handle later rotates/resizes.
- **A TLC plate tool.** Drag out a plate — frame, pencil baseline, dashed
  solvent front — then click inside it to spot samples (Shift+click removes).
  Spots store fractional positions, so resizing the plate carries them and
  a spot's vertical fraction *is* its Rf. App-only: CDXML has no TLC
  concept; the project format preserves everything.
- **Text underline and color.** The caption toolbar gains underline and a
  font-color control (plus a reset-to-ink). Underline round-trips through
  CDXML's underline face bit; colors already survived, but could never be
  authored before.

## 1.15.0

The IR spectrum gets the full-screen view it was missing: zoom in on a region,
read every computed mode at once, and keep the molecule in a window you can
drag around the spectrum rather than on a tab you have to switch away from.

### A full IR spectrum, with the structure alongside it

The panel in the toolbar shows a 360px sketch — enough to recognise the
spectrum, not enough to read it. "Open full spectrum" now gives it room: the
whole plot with labelled axes, every mode listed by wavenumber rather than
filtered down to the strongest dozen, and a legend of which textbook ranges are
shaded.

The structure is a **floating window over the plot** rather than a second tab.
That was the part worth getting right: a tab makes you look at one or the other
and rely on memory for the correspondence, which is exactly the part nobody can
do reliably. Drag it by its body, resize it from the lower-left corner, and it
never covers the whole spectrum — the readout is a reading aid, and the spectrum
is the thing being read. Arrow keys nudge it for anyone not using a mouse.

### Zoom, by dragging across what you want

Drag across the region of the spectrum you care about and it becomes the whole
plot. A short drag is a click rather than a zoom, so aiming at a peak on a
touchscreen doesn't collapse the view. The axis re-labels itself on round
numbers at any depth.

The axis runs backwards — 4000 cm⁻¹ on the left, 400 on the right — which is the
IR convention rather than a mistake, and both axes are now named: wavenumber in
cm⁻¹, transmittance in percent.

### Atoms you can tell apart at a glance

The structure window colours each atom the way the canvas does: oxygen red,
nitrogen blue, sulfur amber, the halogens green, and so on for all 118 elements.
The shading is deliberately faint, and the element symbol stays in the theme's
own ink — because that palette is tuned for the canvas, where colour is a large
shape, and 30 of those colours fall below 3:1 as *text* against the dark
themes. Nitrogen is one of them.

Hydrogen is the exception, and is white: the panel is white in the light theme,
so a translucent white disc would be invisible there. It gets a solid disc with
a ring, and a symbol pinned dark, because a fixed white disc needs a fixed dark
letter in every theme.

### Signal labels say what kind of vibration they are

Peak assignments read "C–O stretch" rather than a bare "C–O", and a molecule with
two carbonyls says "2 × C=O ketone stretch". The shaded ranges themselves are
unchanged — they're still the reference table, not a claim about which peak is
which.

### And a fix for black-on-black text in dark themes

The IR dropdown and report are rendered in a portal, outside the element that
declares the app's text colour, so any text not naming a colour of its own fell
back to black — invisible on a dark panel. The dropdown heading and the shaded
range labels both hit it. Four other portaled surfaces share the latent problem
and are worth a look.

## 1.14.1

The IR spectrum didn't work in 1.14.0. The button was there and every other
feature in that release behaved, but clicking "Calculate spectrum" always
failed.

### The IR spectrum button now works

The panel is unchanged — same transmittance plot, same peak table, same
correlation table shading the assigned bands. What was broken was everything
underneath it.

The app doesn't run xtb itself. It calls a small Python service bundled inside
the installer, and 1.14.0 shipped a build of that service frozen *before* the
spectrum code existed. So the request came back 404: 3D structure optimisation
worked because that endpoint was in the old build, and the IR spectrum didn't
because its endpoint wasn't. The frozen backend has been rebuilt, and water
now comes back with its three expected bands.

### Freezing now checks the IR endpoint too

The freeze step only ever exercised 3D optimisation, which is why a backend
missing the spectrum endpoint passed every check and shipped. Both the Linux
and Windows freeze scripts now make a real IR request and check the three modes
that come back — not just that the call succeeded, since a spectrum whose
parser has stopped matching still answers 200 with an empty plot.

## 1.14.0

Five themes instead of two, an aromaticity check, a computed IR spectrum, and a
pile of fixes to copying, text boxes and small screens.

### Aromatic, antiaromatic, or neither

The circle tool will draw an aromatic ring whenever a ring's bonds alternate,
but nothing knew *why* a given ring deserved one. There's now a top-bar button
that answers the question directly, one card per ring system: aromatic,
antiaromatic, or not — with the arithmetic behind the verdict rather than just
the label.

It's the textbook procedure applied to whatever you've drawn. Does every atom in
the ring have a p orbital taking part in one continuous cycle of conjugation?
How many π electrons does that cycle carry? 4n+2 is aromatic, 4n is
antiaromatic, anything else is neither. The panel shows the count and the
expression it matched — "6 π electrons · 4n+2, n=1" — because a verdict with no
number behind it is something you have to memorise rather than something you
can work out on a ring you haven't met yet.

That distinction carries real weight. Cyclopentadiene and the cyclopentadienyl
cation are the same drawing with a different charge on one carbon: the sp³ CH₂
is what breaks the cycle in the first, so there's no π system to count at all,
while the cation is fully conjugated with 4 electrons and is antiaromatic. A
test that only asked "do the bonds alternate?" would call both aromatic, and
would equally call cyclooctatetraene aromatic.

Fused rings are treated as what they are — one shared system. Naphthalene
reports a single 10 π cloud spanning both hexagons rather than 6 + 6, and
azulene, where neither ring satisfies Hückel on its own, comes out aromatic.

OpenChemLib is asked for an independent second opinion and its answer is shown
beside ours, agreeing or not. It only knows aromatic versus not — it has no
antiaromatic category — so it corroborates half the question, and the panel says
so instead of presenting it as a tie-break.

Two limits worth knowing. Verdicts come from connectivity alone: planarity and
bond-length alternation need a real 3D structure, so a drawn cyclooctatetraene
is reported antiaromatic even though the real molecule puckers into a tub to
avoid exactly that. And a ring containing an abbreviated group is reported as
*not determined* rather than guessed at, because "Ph" isn't a ring.

It needs no backend and no network, so unlike NMR prediction it works in the
web version too. Select a fragment and it analyses just that; a reaction scheme
gets one labelled block per fragment, so a verdict never reads as a statement
about the whole drawing.

### Ring verdicts on the canvas, not just in a panel

The aromaticity panel tells you a ring is antiaromatic; this puts it on the
ring. A toggle at the bottom of the panel outlines every ring on the drawing —
green for aromatic, red for antiaromatic, grey for neither — and re-analyses as
you edit, so it tracks the structure while you work.

Drawn as an outline through each ring's own atoms rather than an inscribed
circle. The circle used for the aromatic-ring glyph is right for a hexagon, but
this has to work for any ring, and a circle inside a pentagon reads as a
different shape from the ring it is labelling.

Outlines are screen-only: they're stripped from exported PNGs and SVGs, since
the figure is the structure rather than the app's opinion of it.

### An IR spectrum, computed rather than looked up

The mass panel tells you what a molecule will weigh and fragment into. This one
works out what it will absorb: a top-bar panel that runs a real vibrational
calculation on the structure you've drawn and plots the result as a
transmittance trace against a descending wavenumber axis, the way an IR
spectrum is actually drawn.

It reuses the xTB that already ships with the 3D view's high-accuracy mode, so
there's no new backend to build and no new installer weight — the same service,
given one more endpoint.

Behind the plot, the textbook diagnostic ranges are shaded for whichever
functional groups your structure actually has. Not every band on every
molecule: a plot striped with ranges for groups you don't have teaches the wrong
lesson by omission. Acetone gets C=O, CH₃ bend and sp³ C–H, and nothing else;
so does a diketone, but counted twice. Amides are told apart from esters and
acids (all three sit near 1700 but not on top of each other), and an
abbreviated group suppresses the band it stands in for rather than being
counted as a carbon.

**There is deliberately no scale factor applied to the frequencies.** The
obvious move is to multiply every wavenumber by a fitted constant so the numbers
line up with a table, and that doesn't work here: measured against a 22-band
calibration set, the error isn't a uniform bias. C–H and C–O stretches land
within about 1% already, C=O comes out ~3% high, C≡N and C≡C and CO₂ are 7–10%
high, and O–H and ring bends come out 2–5% *low*. Any single factor big enough
to help the triple bonds would visibly break the C–H stretches, which are most
of a teaching spectrum. So the frequencies are reported as calculated and each
peak is matched against the diagnostic ranges instead, which keeps the
comparison you're making visible rather than hiding it behind a constant.

Two honest limits, both stated in the panel:

- **It's a gas-phase molecule.** No hydrogen bonding, so an O–H or N–H stretch
  comes out near 3650 where a liquid gives you the broad 3200–3600 smear the
  textbook draws.
- **The geometry isn't always a true minimum.** xTB sometimes reports
  imaginary modes even after converging, which means the frequencies are
  unreliable — so when it happens, the panel says so rather than drawing a
  confident trace.

### Five themes, and a picker that shows them

Light and Dark are still there, joined by **ChemDraw Classic** (warm desktop
framing, publication-white canvas, classic navy), **Slate Lab** (deep slate
surfaces, hairline borders, laser cyan) and **Midnight OLED** (pure black for
OLED screens and dark rooms).

The light/dark button is now a popover listing all five with a palette swatch,
a line on what each is for, and a check on the active one. Cycling needed up to
four clicks to reach a given theme and never showed you what was coming. The
choice is remembered between sessions, which it wasn't before.

Bond and mark glyphs are also re-cut: uniform stroke weight across all seven
bond tools, a proper sine curve for the wavy bond, a dash that steps evenly,
and sharper wedge and chain vertices.

### A white canvas now works in the dark themes

It used to be silently unavailable there — the dark palettes' ink is calibrated
for a dark canvas, so a white one made the molecule unreadable. Rather than
taking the setting away, the canvas now re-resolves its ink for a white
background. Chemists routinely draft in a dark theme and need publication-white
figures out of it.

### Copying a reaction scheme keeps its condition boxes

Pasting into Word gave you the molecules and arrows with every text box
missing. Two bugs, stacked:

- **Ctrl+A only selected atoms.** A reaction scheme is mostly arrows and
  "H2O, heat", so the one command that means "take the whole drawing" dropped
  everything else — and copy, rotate, duplicate and Delete all inherited that.
- **The copied image then dropped the text anyway.** Annotation text is redrawn
  during export by measuring each word with a DOM range, and the clone doing
  the measuring was never attached to the page. A detached SVG has no layout,
  so every word measured as zero-sized and was skipped.

### Font size is now visible, and typeable

The text toolbar had `−` and `+` and nothing that told you what size a box was,
so matching two condition boxes meant nudging one and comparing by eye. There's
a number field now: it shows the caret's size while you type, and typing a
number applies to the selected words. Select several text boxes and the same
control sets them all at once — showing a dash instead of a number when they
disagree.

### The top bar's buttons are reachable on a small screen

On a narrow window the action strip overflowed with no scrollbar and no sign
that it did, and a mouse wheel couldn't move it sideways — so buttons like the
3D view looked like they simply weren't there. The strip now scrolls under a
plain wheel, and carries a soft shadow on whichever edge still has buttons
beyond it.

### Other fixes

- **NMR structure diagrams were invisible** in a dark theme with a white
  canvas: white ink on a white plate. They now follow the app theme in both the
  predictor report and the spectrum tab's structure overlay.
- **Copies and PNG exports from a dark theme drew their condition boxes in
  light ink** over a white background, for the same reason, while the bonds
  beside them came out correctly dark.
- **"Match app theme" export background** in the light theme now uses the
  theme's actual canvas colour instead of pure white.

## 1.13.0

1.12.0 shipped with a bug that could freeze the app — the isotope pattern
exhausted memory on any realistic molecule — so this release is mostly about
that, plus the Mass and Spectra tabs finally being readable against each
other.

### The isotope pattern could freeze the app

Every isotope combination was materialised and only merged by nominal mass at
the very end, so the work grew as 2^(number of atoms) even though the peaks
collapse onto a handful of values. An eight-carbon chain took 3.5 seconds and
a twelve-carbon one exhausted memory outright, on the UI thread, the moment the
Mass tab was opened.

Peaks are now merged after each atom, which is proportional to the number of
peaks rather than exponential: the same molecule takes about a millisecond.

Merged peaks also report a probability-weighted centroid. They used to be an
average of averages -- a running mean of means, so the result depended on the
order the peaks happened to arrive in and not just on their masses.

The pattern is also anchored to each element's *most abundant* isotope, matching the exact mass printed directly above it — which is
what makes boron and selenium, whose commonest isotope is not the lightest, show
peaks below the base mass rather than disagreeing with the number above.

### Corrected data

- **Boron had no isotope entry at all**, so no ¹⁰B peak appeared. Boron is 80%
  ¹¹B, so its lighter isotope genuinely sits *below* the base mass.
- **Selenium's masses were paired with the wrong abundances.** It has six
  stable isotopes from 74 to 82, with ⁸⁰Se the most abundant.
- **Three neutral-loss masses disagreed with their own formulas** — nitric
  oxide by about 1 u, nitrous acid by 15 mDa and sulfur dioxide by 4 mDa.
- **Six positive adducts read `[M+H]+⁺`**, an ASCII plus and then a superscript
  one.

### The two tabs now connect

The Mass tab predicts which neutral losses a structure can make; the Spectra
tab shows peaks someone actually measured. They were two unrelated lists, so
the predicted losses are now matched against the measured fragments — a peak a
loss accounts for is drawn differently and says which one. Matching is
one-to-one by proximity, so a peak two losses could explain is attributed
once, to the nearer, and the tolerance is 20 mDa, tighter than the accuracy of
the instruments most of these came from. A wrong annotation is worse than none.

Relatedly, losses are no longer the same fixed list for every molecule. Each
one declares the elements it needs and, where that's too weak a test, the group
that makes it plausible: water needs a real hydroxyl (an ether does not lose
water), CO₂ a carboxyl, SO₂ a sulfonyl, NO a nitro. So benzene is no longer
offered ammonia.

### Measured spectra

- **The picker listed bare accession codes**, so caffeine's 122 recorded
  spectra were 122 indistinguishable rows. Rows now carry MassBank's own
  description along with MS level, instrument and collision energy.
- **A failed search claimed the molecule had no data.** The error state was
  set but never rendered, so a network failure fell through to "0 spectra".
- **The InChIKey no longer depends on PubChem alone.** The bundled RDKit
  computes it locally, so a structure nobody has ever submitted is still
  identifiable — which is most of what a drawing program gets used for.
  PubChem remains the fallback and pasting a key the last resort.

### Packaging

Building a Windows installer on Linux would package Linux binaries into it and
report success, because `extraResources` copies `resources/` verbatim without
looking at what the files are, and the pre-build check validated against the
build machine rather than the target. The check now reads each binary's format
and refuses, with instructions for freezing on the right platform.

## 1.12.0

A release about asking what a molecule will do in a mass spectrometer: a new
top-bar button gives the exact mass, the ions that mass will actually appear
as, the isotope pattern, the usual neutral losses, and — separately — real
measured MS/MS spectra for the compound from MassBank.

### Mass spectrometry

A flask button in the top bar, next to the NMR one, opens a panel with two
tabs.

**Mass** is arithmetic on the structure, available immediately, with no
network involved:

- **Exact (monoisotopic) mass**, counting the hydrogens the drawing implies,
  expanding abbreviated groups, and honouring isotopes you've labelled by hand.
- **Expected ions**, positive and negative — `[M+H]+`, `[M+Na]+`, `[M-H]-` and
  the rest — at the m/z you'd actually set the instrument to.
- **Degree of unsaturation**, or `n/a` when a formula can't produce an honest
  one (a charged or radical species, for instance).
- **The isotope pattern**, drawn. The two patterns worth recognising are right
  there in it: roughly 3:1 M:M+2 for one chlorine, 1:1 for bromine.
- **Common neutral losses** by mass, since a 18.0106 gap is usually water and a
  27.9949 one usually CO.

These masses come from RDKit, not from a table typed out by hand — the values
that were checked are chlorine at 34.968853, not the 35.45 the average-weight
table in the app holds. Every reference compound in the tests agrees with
RDKit's own `ExactMolWt`.

A structure containing a placeholder label (R, R1, X) has no known
composition, so the panel says that rather than printing a confident wrong
mass. The formula is still shown, because that much is known.

### Measured spectra

The second tab looks up real, experimental MS/MS spectra in
[MassBank](https://massbank.eu/), matched by InChIKey. Caffeine has 122
recorded spectra there, aspirin 28. Each one shows its precursor, collision
energy and instrument, with the fragment peaks drawn and the m/z of every peak
on hover.

Two things about this are deliberate. MassBank records carry licences
individually — the caffeine record used here is `dl-de/by-2-0` — so the
licence is shown next to every spectrum rather than as one blanket credit
somewhere. And the link points at the record's own page, so what the app
shows can be checked against what MassBank holds.

The InChIKey comes from PubChem. If PubChem is unreachable, the tab says so
plainly and offers to retry — that's a temporary condition, not a statement
about your molecule — and you can paste an InChIKey yourself to skip the
lookup entirely. Pasting is always available, not only when something has
gone wrong.

### Fixes

This release also fixes several problems found in review, one of which made
the app unusable:

- **The isotope pattern could hang the app.** Every isotope combination was
  materialised and only merged at the very end, so the work grew as 2^(atoms):
  an eight-carbon chain took 3.5 seconds and a slightly larger one exhausted
  memory outright. It ran on the UI thread the moment the Mass tab was opened.
  Peaks are now merged by nominal mass after each atom, which is proportional
  to the number of peaks rather than exponential -- the same molecule now
  takes about a millisecond.
- **Boron and selenium had wrong isotope data.** Boron had no entry at all, so
  no ¹⁰B peak appeared; selenium's masses were paired with the wrong
  abundances. Both are fixed. Boron is 80% ¹¹B, so its lighter isotope sits
  *below* the base mass, and the pattern now shows peaks on both sides.
- **Three neutral-loss masses disagreed with their own formulas.** Nitric oxide
  was ~1 u out, and nitrous acid and sulfur dioxide were out by 15 and 4 mDa.
- **Six positive adducts read `[M+H]+⁺`** -- an ASCII plus followed by a
  superscript one.
- **The isotope pattern showed rows of "0".** Intensities were rounded to whole
  percent, so benzene's real M+2 (0.185%) and M+3 (0.003%) both printed as "0"
  and the pattern looked broken. Small intensities now keep their significant
  digits, and peaks below 0.05% are left out instead of drawn as stubs.
- **Every molecule was offered the same neutral losses.** Benzene was shown
  water and ammonia despite containing neither oxygen nor nitrogen. Losses are
  now filtered by the elements present and, for water, CO2, SO2, NO, methanol
  and carbon monoxide, by whether the characteristic group is actually drawn.

- **The spectrum picker listed bare accession codes.** A compound with 122
  recorded spectra (caffeine) gave 122 indistinguishable rows; they now show
  MassBank's own description plus MS level, instrument and collision energy, so
  two records of the same compound can be told apart.
- **The Mass and Spectra tabs could not be read against each other.** The
  predicted neutral losses are now matched to the measured fragment peaks -- a
  peak a loss accounts for is drawn differently and says which one -- so
  "this loss is expected" and "this loss is the one that produced that peak"
  are the same list.
- **Neutral-loss tooltips were English-only** in an app with a Spanish mode.
- **The InChIKey no longer depends entirely on PubChem.** The bundled RDKit can
  compute it locally, so a structure nobody has ever submitted is still
  identifiable; PubChem remains the fallback, and pasting a key remains the
  last resort.

- **A failed spectrum search claimed the molecule had no data.** The error
  state was set but never rendered, so a network failure fell through to
  "0 spectra in MassBank".
- **The NMR test that claimed to check plot zooming asserted nothing about
  zoom**, and left an unhandled `getScreenCTM is not a function` error in every
  test run. `npm run check` is clean now.

- PubChem's InChIKey lookup now retries its documented overload response
  (HTTP 503) with a short backoff, and reports it as "busy" rather than as a
  structure it couldn't resolve. Previously a momentary busy period produced
  the false message that your molecule had no data.

## 1.11.0

A release about looking at structures rather than just drawing them: the 3D
view gets representations, imported files and a link back to the 2D canvas,
drawn groups can collapse back into abbreviations, and the canvas stops
redrawing itself every time the mouse moves.

### Save and Save As

Saving a project used to mean a file dialog every time, and on a machine that
asks before overwriting, a confirm click on top of that. There are now two
commands, as in any program that edits files:

- **Save** (`Ctrl+S` / `Cmd+S`) overwrites the file this project was last
  saved to or opened from, with no dialog and no confirmation.
- **Save As…** (`Ctrl+Shift+S` / `Cmd+Shift+S`) always asks, and takes over as
  the destination for later Saves.

The Export menu's single "Save project" entry is split into both, and once a
file has been chosen its name is shown under the Save item, so you can see
where Save is going before you press it. The first Save of a session on a
new project asks where to put it, as it always did.

Opening a project makes it the save target, so Save overwrites the file you
just opened. Opening a `.mol` or `.cdxml` **clears** it instead — those are
different formats, and writing a project over the `.mol` you opened would
destroy it. After opening a `.mol`, Save behaves like Save As.

The remembered file is deliberately **not** kept across restarts. Each launch
starts untitled, so a plain Save can never quietly overwrite a file from
last week that you'd forgotten you had open.

Autosave is unchanged and still runs independently: it protects work you
haven't explicitly saved, while Save writes the file you chose.

In the browser, Chromium builds get the same silent Save through the File
System Access API. Firefox and Safari don't support it, so there Save falls
back to a normal download — the file is written, but the browser still
prompts and no destination is remembered, so the next Save asks again. That
is honest about what happened rather than reporting a silent save it didn't
perform.

#### How the desktop build knows where to write

The renderer is not allowed to name a save destination. A save dialog is user
consent — the path comes from the person, through the OS — so if the app
simply passed a path through, a compromised renderer would have an
arbitrary-file-write primitive: it could overwrite anything the user can
write, with no prompt at all.

Instead the main process remembers only paths it handed out itself, from a
Save As dialog or from Open, and refuses everything else. A Save As therefore
asks every time, exactly as before, and only a path the user already chose
can be written without asking again.

### Drawing stops re-rendering the whole molecule on every mouse move

Moving the cursor across the canvas re-rendered every atom and every bond in
the document, because hover state and the drawing itself lived in the same
React component. Moving the mouse around a structure you weren't editing cost
as much as editing it did. Hovering, dragging a selection marquee, and
lassoing now touch only the overlay they draw on.

Editing got cheaper too. Per-atom label geometry — the implicit-H suffix, lone
pair positions, where a group label anchors — used to be recomputed inside
each atom's render from the whole molecule, and since that molecule object is
rebuilt on every edit, every atom re-rendered whenever anything anywhere
changed. That work is now hoisted out and results are reused by identity, so
moving one atom re-renders that atom alone. Selecting or deselecting
everything no longer re-renders the selection.

This is a structural change in how much work a frame does; the gains show up
as a function of document size.

### The snap angle is a setting

Bond and chain angles snapped to 30° with no way to change it, which is the
wrong increment for anything that needs to line up with an existing drawing. A
picker in the sidebar's view section offers Off, 15°, 30°, 45° and 60°, and
the choice is remembered.

Off is genuinely off rather than "snap to something very fine". This is
separate from the existing Shift-while-dragging free-angle override: that one
is a momentary escape hatch for a single bond, this is the default for all of
them. "Clean up" respects the setting too, so tidying a structure doesn't
re-align it to a grid you didn't ask for.

### Groups collapse back into abbreviations

Abbreviated groups could be placed but not recovered: draw a tert-butyl out
atom by atom and nothing would turn it back into `tBu`. Selecting a fragment
now offers *Collapse to abbreviation*, which replaces it with a single
labelled vertex at the position it was attached from, so the surrounding
drawing doesn't shift.

Matching is by structure, never by molecular formula. Formula looks like the
easy answer and is wrong: C₄H₉ is n-Bu, i-Bu, sec-Bu *or* tert-butyl, and
C₂H₅ might be one ethyl or two methyls on different atoms. Relabelling the
wrong one quietly changes what the drawing says.

There's a deeper version of the same trap. As bare graphs, n-Bu and sec-Bu are
both the same four-carbon path, and i-Bu and tert-butyl are both the same
three-armed star — connectivity genuinely cannot separate them. What does is
which carbon carries the hydrogens, so the match also compares implicit
hydrogen counts. That same check is what stops a *substituted* benzene ring
being swallowed into `Ph`, leaving a substituent hidden inside a superatom.

The menu item is disabled rather than silently doing nothing when the selection
doesn't match anything.

A caveat worth knowing: in a molecule like 2-methylbutane both an i-Bu and a
sec-Bu fragment are present and either label is defensible. The app picks one
consistently; it is not telling you which, and neither reading is wrong.

The library is the groups this app already knows (20 of them) rather than
ChemDraw's full nickname set.

### 3D representation and colouring

The 3D view had exactly one hardcoded look — sticks and small spheres — so
every structure was drawn the same way regardless of what you wanted to see.
A palette button in the panel header now offers five representations:

- **Ball & stick** — what it always was, and still the default
- **Space-filling** — true van der Waals size, for asking how crowded a centre is
- **Sticks** — bonds only, for connectivity
- **Licorice** — uniform thick bonds, the usual presentation for small molecules
- **Wireframe** — a skeleton at a glance

Coloring offers the element palette, a monochrome, and five carbon-tinted
schemes. Both choices apply immediately to the structure already on screen,
rather than waiting for the next edit to regenerate it — which would have
needlessly re-run the conformer search and thrown away your viewing angle.
Both are remembered.

Monochrome is its own case rather than one of the library's schemes, because
every built-in scheme is keyed to an element or to carbon: there is no genuine
"one colour for everything" preset, and picking "white carbon" would still have
left oxygen red.

### New conformer

A structure used to be generated exactly one way, so a molecule with real
rotational freedom only ever showed one arrangement — and you could never see
an alternative rotamer, which is the main reason to look at something in 3D
at all. A shuffle button beside the style picker now walks to the next
distinct conformer: the most likely arrangement first, then the next, and so
on. Each press is a genuinely different geometry, not a re-roll that happens
to land somewhere similar.

Once a structure runs out of distinct arrangements the button disables itself
and says so, rather than silently doing nothing. It's unavailable for an
imported structure, which has its own geometry.

Getting this right took two attempts. The underlying library offers both a
one-shot "give me one conformer" call and a two-step "initialise, then give me
the next new one" API, and the seed argument to the first is **not** a
conformer index. Measured across ten seeds, butane through decane all came
back as the identical geometry every time — so a first version of this button,
which varied that seed, did nothing at all for exactly the molecules it was
built for. The fix walks the proper API, and the tests measure the structures
rather than trusting that a different argument implies a different answer.

Note this is a resampling of plausible arrangements, not an exhaustive
conformational search: it shows you low-energy shapes, not every one the
molecule could theoretically adopt. The torsion-scan tool in the rotate-bond
panel remains the systematic way to sweep a specific bond through a full turn.

### Selecting an atom in 3D selects it in 2D

A chain icon in the 3D panel turns on linking. Click an atom in 3D and it's
selected and ringed on the 2D canvas underneath; click it again to clear.
This is what makes the panel a working part of the drawing rather than a
picture beside it.

Clicking a hydrogen that only exists in 3D says so, rather than doing nothing
— the structure generated for display saturates valences with hydrogens that
have no counterpart in the 2D drawing.

The mapping is positional, which is only true because the 3D structure is
built from this app's own molfile writer and OpenChemLib preserves atom order.
That's not a published guarantee, so it's pinned by a test using a
deliberately non-alphabetical element sequence: if the ordering ever changes,
the test fails instead of the app quietly highlighting the wrong atom.

An imported structure has no 2D counterpart at all, so linking is off while
one is loaded.

### Importing an existing 3D structure

The export menu could write `.xyz` and `.mol`; nothing could read them back.
The panel now takes `.xyz`, `.pdb`, `.mol` and `.sdf` directly, rendering
exactly as a generated structure would — so measurement, rotation and export
all work on an imported file.

`MOL`/`SDF` carry their own bonds and are used as given. `XYZ` and `PDB`
usually carry none at all, so bonds are inferred from interatomic distances
against covalent radii. That can't distinguish a bonded pair 1.5 Å apart from
two atoms merely close, and the tolerance is deliberately generous, so an
import can occasionally show a bond that isn't one or miss a long bond — the
usual trade for this approach. Where a PDB file supplies `CONECT` records
those are used instead.

PDB elements are read from the file's dedicated element column rather than
parsed out of the atom name, which is what stops the `CA` of a protein alpha
carbon from coming in as calcium.

An imported structure isn't derived from your drawing, so editing the 2D
canvas no longer silently replaces it. A banner says which file is on screen,
with a button to go back to the generated structure.

**The method buttons then re-refine the imported structure** rather than
switching off. With a drawing behind them those three choose how the drawing
becomes 3D; with an imported file there's no drawing to embed, so they relax
the coordinates the file brought instead. That is usually the reason you'd
import a structure in the first place — Quick leaves it untouched, Force field
relaxes it locally, and High accuracy gives a proper GFN2-xTB optimisation,
which is the single most useful thing to do with a structure you got from a
database.

Connectivity is read back out of the imported file rather than rebuilt, so
bonds and bond orders survive; a missing metal or other parameterless atom
gives a readable message pointing at xTB rather than a library error.
Hydrogen is added first when the file has none — most skeletal `.mol` files
don't, and a force field has nothing to do with an atom whose valence is
unfilled. Without that, the identical molecule would refine when drawn and
fail when imported.

Note that xTB refinement of an import needs the local backend running and
takes seconds; the other two are instant.

### Atom map numbers and highlights now survive a molfile round trip

Both were drawn and then lost: export to `.mol`, reopen, and the highlight
colours and atom numbers were gone. Both now write and read back, so a file
round-tripped through another tool and returned still has them.

Two honest qualifications. These are carried in the legacy V2000 `M MAP` and
`M HIG`/`M HCOL` property lines — widely read in practice, but the current
BIOVIA spec puts both features in V3000 (as an atom-block `aamap` field and a
highlighting collection block respectively), which this app still doesn't
write. Round-tripping inside EnlaceCraft is exact. And haptic bonds are still
dropped on export: the molfile format has no representation for a
metal-to-ring-centroid bond, so ferrocene still exports as a metal and two
disconnected rings. Fixing that properly means a convention we'd have to
define ourselves, which is worse than the honest limitation.

### The 3D panel no longer breaks when you drag its divider

The panel is resizable, but the WebGL canvas only listened for *window*
resizes. Dragging the divider resized the surrounding panel while the
structure inside stayed at its old size — cropped, or offset from its
container — until the window itself was resized. It now tracks its own size,
the same way the 2D canvas always has.

### Ctrl+D duplicates

Duplicate was reachable only from the right-click menu. It's now `Ctrl+D`
(`Cmd+D` on macOS), matching every other drawing program, and it's one undo
step.

### Upgrading

Existing installs will pick this up automatically on next launch, subject to
the usual requirement that the `latest*.yml` manifests are uploaded alongside
the installers — without them `electron-updater` silently never registers an
update.

## 1.10.0

The NMR report gets a real integration tool, and the predicted spectrum stops
being a picture you can only look at.

### Integration regions

Drag over a signal and it reports how many protons that signal carries and
how it compares to the others — the workflow every NMR package provides, and
the thing you actually do with a spectrum once you trust it. The gesture is
the same drag the zoom tool uses, so switching tools changes what the drag
*means* rather than making you learn a second one.

Several regions at once, each showing its proton count on the plot and its
ratio in a table beneath. Drag a region's edge to adjust it; delete it with
the ×.

Absolute proton counts need a reference: mark one region, type the proton
number you know it to be, and the rest scale from it. Until you do, cells
read `set ref` — never `0`, which would read as a claim that there's no
protons in the signal.

This integrates the drawn envelope rather than summing peak heights, so a
window that clips a multiplet gives a proportionally smaller number instead
of a quietly wrong one.

### Structure beside the spectrum, linked by hover

A Structure toggle puts the molecule under the plot. Hovering a signal
highlights the atoms that produce it, which answers the question a predicted
spectrum actually raises: *which protons is this multiplet?* That previously
meant reading a label and hunting for the atoms by eye.

Hovering and clicking resolve atoms through the same lookup, so they can't
disagree about which signal belongs to which atoms.

An H toggle inside the structure panel draws the hydrogens as their own
vertices, each carrying the ¹H signal of the carbon it hangs off — `C1H2`,
`O1H`, or a separate H you can hover. Off by default next to a ¹H spectrum,
where the signal's own integration already says it — but there's no proton
count anywhere on the ¹³C tab, which is exactly where it's needed.

The overlay also:

- **Moves**: drag it anywhere over the plot, clamped so it can't be pushed off
  an edge, with arrow keys for the same thing.
- **Resizes**, and its size is the zoom — the drawing is fitted to whatever box
  you give it. Drag the bottom-left corner; `Home` resets.
- Is **bigger than it was** for large structures, which are width-bound and
  were drawing at well under a tenth of natural size.
- Puts the ¹H signal in exactly one place: on the drawn hydrogens when they're
  shown, on the carbon when they aren't. A carbon no longer appears to have a
  proton shift of its own.

### Spectrum fixes

**The SVG export drew sticks while the screen showed a curve.** An exported
figure looked nothing like the plot it came from. It now samples the same
Lorentzian envelope the plot draws, at the same resolution and with each
nucleus's own linewidth, and follows whichever representation you're looking
at. Rendering the output also turned up two layout bugs the tests couldn't
see: the axis title printed on top of the caption, and the `TMS` label
overhung the right edge and was clipped.

**Peak height could never be reduced.** The zoom range started at 1, so the
only way to make a small signal visible was to clip the tallest one flat
against the top — leaving it permanently pinned there, with no way to see the
whole spectrum unclipped. The floor is now 0.25, so the tallest peak sits at
a quarter of the plot height and two signals' real relative heights can be
compared directly.

**The report's H toggle did nothing** on any structure you'd actually draw.
It filtered hydrogens the user drew explicitly, but structures are normally
drawn skeletal — the hydrogens are implicit, so there was nothing for it to
act on. It now draws them (see *Structure beside the spectrum* above), and
falls back to a count on the label when they're not drawn.

### Fixes

**Predicted shifts were assigned to the wrong atoms** on any structure drawn
with explicit hydrogens. The backend drops those hydrogens and renumbers only
heavy atoms, while the app's own atom order keeps them — so prediction 0
landed on a hydrogen and every later atom was shifted by however many came
before it. Explicit-H ethanol showed its CH₃ with the CH₂'s shift. The
`implausible` warning was built to catch this, but the cause is an index
mismatch rather than a chemistry problem. Verified end to end against the live
backend; affects the Structure tab, the spectrum overlay, and the compact list.

**Copied and exported images came with a wide white border**, big enough to
trim by hand before pasting into a document. The margin was a fraction of the
molecule (18% of the larger dimension), and the crop was measured on the live
canvas — so a bond preview or hover ring under the cursor, stripped before
rasterizing, still framed the picture. Margin is now a fixed 6 units. White
border drops from ~55–65% of the image to ~10–20%. Also fixes off-screen
positioning leaking into exported `.svg` files and into print/Save-as-PDF.

**Hydrogen counts were double-counted.** An atom with hydrogens drawn
explicitly reported its implicit count *plus* the explicit ones, so a methyl
with all three drawn explicitly came out as CH₆ and a CH₂ as CH₄. Both
existing callers only asked whether the count was zero, so the wrong numbers
were invisible until something read an actual count. The hydrogen-filling
code already handled this correctly; the extra addition on top of it was the
bug.

**Backend freezes died on SELinux hosts.** On a machine with SELinux
enforcing (Fedora, RHEL), all three Python freezes failed after several
minutes of apparently-successful PyInstaller output, at the final step where
it creates its output directory. Invisible on CI, whose runners are
permissive — so a release frozen on a workstation could differ from one
frozen on CI for reasons unrelated to the build.

### Build

**Pushes no longer trigger installer builds.** Every push touching
`python/**`, `electron/**`, or the packaging config ran three jobs: unit
tests plus a Linux and a Windows installer, each freezing all three Python
backends from scratch. A one-line shell fix spent two full installer builds
for output nobody asked for. Installer builds are now manual — **Actions →
"build installers" → Run workflow**.

Nothing is lost: the workflow builds but doesn't publish, so releases were
already a deliberate manual step.

### Upgrading

Existing installs will pick this up automatically on next launch. The
`latest*.yml` manifests must be uploaded alongside the installers — without
them `electron-updater` silently never registers an update.