# Changelog

Release notes for EnlaceCraft. Newest first.

The version number is the `version` field in `package.json`; each release is
tagged with it.

## Unreleased

A release about looking at structures rather than just drawing them: the 3D
view gets representations, imported files and a link back to the 2D canvas,
drawn groups can collapse back into abbreviations, and the canvas stops
redrawing itself every time the mouse moves.

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

Conformer generation was seeded, and always with the same seed, so a structure
produced exactly one geometry — and the one you happened to get first was the
only one you would ever see. For a molecule with real rotational freedom that
means never seeing an alternative rotamer, which is the entire reason to look
at it in 3D.

A shuffle button beside the style picker re-rolls the seed and generates a
different collision-free conformer. The seed is deliberately not remembered
between sessions: a stale one would silently make your first structure of the
session differ from the last one you saw, for no reason you could explain.

The seed is a genuine parameter of the generation, threaded through all three
methods including the starting geometry handed to GFN2-xTB — it previously
accepted a seed but never passed it on, so this button would have kept
regenerating the same structure regardless.

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