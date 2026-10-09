# Changelog

Release notes for EnlaceCraft. Newest first.

The version number is the `version` field in `package.json`; each release is
tagged with it.

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

An H toggle inside the structure panel adds each atom's hydrogen count
(`C1H2`, `O1H`). Off by default next to a ¹H spectrum, where the signal's own
integration already says it — but there's no proton count anywhere on the ¹³C
tab, which is exactly where it's needed.

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
act on. It now reports the count on each label instead.

### Fixes

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