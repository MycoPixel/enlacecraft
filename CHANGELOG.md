# Changelog

Release notes for EnlaceCraft. Newest first.

The version number is the `version` field in `package.json`; each release is
tagged with it.

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