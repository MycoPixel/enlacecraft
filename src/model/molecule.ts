import type { Atom, AromaticRingDisplay, Bond, BondOrder, BondStereo, DoubleBondSide, Element, HapticBond, Molecule, Point } from "../types/chemistry";
import { nextId } from "./id";
import { BOND_LEN } from "./constants";
import { isMetalLike } from "./valence";
import { cleanStructure2D, connectedComponents } from "../engine/clean2d";
import { pruneSchemesForAtoms } from "./reactionSchemes";
import { pruneCyclesForAtoms } from "./cycles";
import { pruneSgroups } from "./sgroups";

// The 2D clean-up engine lives in src/engine/clean2d.ts (hybridisation-aware
// angles, element bond lengths, ring templates, cis/trans + stereo
// preservation, overlap penalty). Re-exported here so every existing
// importer of connectedComponents keeps working unchanged.
export { connectedComponents };

export function emptyMolecule(): Molecule {
  return { atoms: {}, bonds: {}, hapticBonds: {}, aromaticRingDisplays: {} };
}

export function cloneMolecule(mol: Molecule): Molecule {
  return {
    atoms: { ...mol.atoms },
    bonds: { ...mol.bonds },
    hapticBonds: { ...mol.hapticBonds },
    aromaticRingDisplays: { ...mol.aromaticRingDisplays },
    ...(mol.schemes ? { schemes: mol.schemes } : {}),
    ...(mol.sgroups ? { sgroups: mol.sgroups } : {}),
    ...(mol.cycles ? { cycles: mol.cycles } : {}),
    ...(mol.rgroups ? { rgroups: mol.rgroups } : {}),
  };
}

/** Keeps only the haptic bonds whose metal atom and every ring atom are
 * still present, per `isSurviving` — the same "drop it if either end is
 * gone" cascade-cleanup Bond filtering already does at each of these
 * call sites, extended to a haptic bond's multi-atom ring reference. */
function survivingHapticBonds(hapticBonds: Record<string, HapticBond>, isSurviving: (id: string) => boolean): Record<string, HapticBond> {
  const result: Record<string, HapticBond> = {};
  for (const id in hapticBonds) {
    const hb = hapticBonds[id];
    if (isSurviving(hb.metalAtomId) && hb.ringAtomIds.every(isSurviving)) result[id] = hb;
  }
  return result;
}

/** Same idea as survivingHapticBonds, for aromatic-ring circle toggles:
 * drops one the moment any single ring atom is gone, since the remaining
 * atoms may no longer even form a ring at all. */
function survivingAromaticRingDisplays(rings: Record<string, AromaticRingDisplay>, isSurviving: (id: string) => boolean): Record<string, AromaticRingDisplay> {
  const result: Record<string, AromaticRingDisplay> = {};
  for (const id in rings) {
    if (rings[id].atomIds.every(isSurviving)) result[id] = rings[id];
  }
  return result;
}

/**
 * All structural edits are pure functions: (Molecule, args) -> Molecule.
 * This keeps the chemistry model fully decoupled from Zustand/React,
 * so it's easy to unit test or reuse (e.g. in a headless import script).
 */

export function addAtom(mol: Molecule, id: string, p: Point, element: Element, group?: string, isotope?: number): Molecule {
  return {
    ...mol,
    atoms: { ...mol.atoms, [id]: { id, x: p.x, y: p.y, element, charge: 0, chargeOffsetX: 0, chargeOffsetY: 0, group, isotope } },
  };
}

/** Sets (or, called again with the same preset, effectively re-asserts) an
 * atom's element + isotope together — see Atom.isotope's doc comment for
 * why these travel as a pair rather than isotope alone. */
export function setAtomIsotope(mol: Molecule, id: string, element: Element, massNumber: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, element, isotope: massNumber, group: undefined } } };
}

/** Clears an atom's isotope label, returning it to the standard isotope. */
export function clearAtomIsotope(mol: Molecule, id: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, isotope: undefined } } };
}

/** Cycles an atom's manually-asserted stereo descriptor: none -> R -> S -> none. */
export function cycleAtomStereoLabel(mol: Molecule, id: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  const next = a.stereoLabel === "R" ? "S" : a.stereoLabel === "S" ? undefined : "R";
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, stereoLabel: next } } };
}

export function addBond(
  mol: Molecule,
  id: string,
  a1: string,
  a2: string,
  order: BondOrder = 1,
  stereo: BondStereo = "none",
  dative = false
): Molecule {
  if (a1 === a2) return mol;
  const duplicate = Object.values(mol.bonds).find(
    (b) => (b.a1 === a1 && b.a2 === a2) || (b.a1 === a2 && b.a2 === a1)
  );
  if (duplicate) return mol;
  const bond: Bond = { id, a1, a2, order, stereo, doubleSide: "auto" };
  if (dative) bond.dative = true;
  return { ...mol, bonds: { ...mol.bonds, [id]: bond } };
}

export function moveAtoms(mol: Molecule, moves: Record<string, Point>): Molecule {
  const atoms = { ...mol.atoms };
  for (const id in moves) {
    if (atoms[id]) atoms[id] = { ...atoms[id], ...moves[id] };
  }
  return { ...mol, atoms };
}

export function setAtomElement(mol: Molecule, id: string, element: Element): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  // Picking a real element from the periodic-table picker always overrides
  // any abbreviated-group label or isotope this vertex previously had.
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, element, group: undefined, groupFormula: undefined, isotope: undefined } } };
}

/** Converts (or places) a vertex to an abbreviated-group shorthand — see
 * Atom.group's doc comment. `element` is set to a plain "C" placeholder
 * since group atoms don't participate in element-based valence math. */
export function setAtomGroup(mol: Molecule, id: string, group: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, element: "C", group, groupFormula: undefined, isotope: undefined } } };
}

/** Sets a free-typed group label (from model/atomLabelParser.ts) rather
 * than a fixed ABBREVIATED_GROUPS pick — `formula` is present for a
 * recognized condensed formula ("COOH", "CF3") and absent for a generic
 * placeholder label ("R", "R1", "X"); see Atom.groupFormula's doc comment. */
export function setAtomCustomGroup(mol: Molecule, id: string, label: string, formula: string | undefined): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, element: "C", group: label, groupFormula: formula, isotope: undefined } } };
}

export function setAtomCharge(mol: Molecule, id: string, delta: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, charge: a.charge + delta } } };
}

/** Sets charge to an exact value rather than nudging it by delta — for
 * the label editor's charge notation (model/atomLabelParser.ts), where
 * what's typed is the whole intended state, not a nudge. */
export function setAtomChargeAbsolute(mol: Molecule, id: string, charge: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, charge } } };
}

/** Sets an atom's shown lone-pair count directly, rather than the
 * lone-pair tool's one-click-at-a-time cycling (model/molecule.ts's
 * cycleAtomLonePairs) — for the reactive-site presets (Nu:, Nu:-, ...)
 * that need a specific count applied in the same click as everything
 * else about the atom. */
export function setAtomLonePairs(mol: Molecule, id: string, count: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, lonePairs: count || undefined, lonePairOffsets: undefined } } };
}

/** Applies a whole REACTIVE_SITE_PRESETS entry (label, charge, lone
 * pairs) to an atom in one go — the mechanism-arrow placeholders (Nu,
 * Nu:, Nu:-, E, E+). Same "group" mechanism as an abbreviated group
 * (see Atom.group's doc comment) — element becomes a plain "C"
 * placeholder, `group` carries the actual shown label — but with
 * charge/lone-pairs set alongside it instead of left at whatever the
 * atom had before. */
export function setAtomReactiveSite(mol: Molecule, id: string, label: string, charge: number, lonePairs: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return {
    ...mol,
    atoms: {
      ...mol.atoms,
      [id]: { ...a, element: "C", group: label, groupFormula: undefined, isotope: undefined, charge, lonePairs: lonePairs || undefined, lonePairOffsets: undefined },
    },
  };
}

export function setAtomChargeOffset(mol: Molecule, id: string, dx: number, dy: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, chargeOffsetX: dx, chargeOffsetY: dy } } };
}

/** Clears a lone pair's manual override, reverting it back to the
 * automatically computed placement from defaultLonePairPosition (e.g.
 * double-clicking a dragged pair in AtomView to reset it). */
export function clearLonePairOffset(mol: Molecule, id: string, index: number): Molecule {
  const a = mol.atoms[id];
  if (!a?.lonePairOffsets?.[index]) return mol;
  const offsets = [...a.lonePairOffsets];
  offsets[index] = null;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, lonePairOffsets: offsets } } };
}

/** Sets an explicit local (x, y) position for one specific lone pair,
 * overriding the automatic placement defaultLonePairPosition would
 * otherwise compute for it — this is what lets each lone pair on an atom
 * be dragged to its own position/angle independently of the others. */
export function setLonePairOffset(mol: Molecule, id: string, index: number, x: number, y: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  const offsets = [...(a.lonePairOffsets ?? [])];
  while (offsets.length <= index) offsets.push(null);
  offsets[index] = { x, y };
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, lonePairOffsets: offsets } } };
}

export function setAtomRadicalOffset(mol: Molecule, id: string, dx: number, dy: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, radicalOffsetX: dx, radicalOffsetY: dy } } };
}

export function setAtomStereoLabelOffset(mol: Molecule, id: string, dx: number, dy: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, stereoLabelOffsetX: dx, stereoLabelOffsetY: dy } } };
}

export function setAtomMapNumberOffset(mol: Molecule, id: string, dx: number, dy: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, mapNumberOffsetX: dx, mapNumberOffsetY: dy } } };
}

/** Cycles an atom's shown lone-pair count 0 -> 1 -> 2 -> 3 -> 4 -> 0. */
export function cycleAtomLonePairs(mol: Molecule, id: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  const next = ((a.lonePairs ?? 0) + 1) % 5;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, lonePairs: next } } };
}

/** Toggles whether an atom shows a radical (unpaired electron) dot. */
export function toggleAtomRadical(mol: Molecule, id: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, radical: !a.radical } } };
}

/** Sets (or, passed null, clears) an atom's emphasis color — see
 * Atom.highlightColor's doc comment. */
export function setAtomHighlight(mol: Molecule, id: string, color: string | null): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, highlightColor: color ?? undefined } } };
}

/** Sets (or clears) an atom's Atom.ignoreValence flag — see its own doc comment. */
export function setAtomIgnoreValence(mol: Molecule, id: string, value: boolean): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, ignoreValence: value || undefined } } };
}

/** Sets (or, passed null, clears) a bond's emphasis color — see
 * Bond.highlightColor's doc comment. */
export function setBondHighlight(mol: Molecule, id: string, color: string | null): Molecule {
  const b = mol.bonds[id];
  if (!b) return mol;
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, highlightColor: color ?? undefined } } };
}

/**
 * Applies (or, passed null, clears) an emphasis color across a whole
 * selection in one step: every selected atom, plus every bond whose
 * *both* endpoints are selected — so selecting a run of atoms along a
 * chain highlights that whole stretch, bonds included, not just the
 * vertices. A bond with only one endpoint selected is left untouched
 * (matches how the rest of the app already treats "this bond is
 * selected" as exactly its two atoms being selected — see
 * useCanvasInteractions' bond-click handling).
 */
export function setHighlightForSelection(mol: Molecule, selected: Set<string>, color: string | null): Molecule {
  if (selected.size === 0) return mol;
  const atoms = { ...mol.atoms };
  for (const id of selected) {
    const a = atoms[id];
    if (a) atoms[id] = { ...a, highlightColor: color ?? undefined };
  }
  const bonds = { ...mol.bonds };
  for (const b of Object.values(bonds)) {
    if (selected.has(b.a1) && selected.has(b.a2)) {
      bonds[b.id] = { ...b, highlightColor: color ?? undefined };
    }
  }
  return { ...mol, atoms, bonds };
}

/** Sets (or, passed null, clears) an atom's reaction map number — see
 * Atom.mapNumber's doc comment. */
export function setAtomMapNumber(mol: Molecule, id: string, n: number | null): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, mapNumber: n ?? undefined } } };
}

/** The next never-yet-used map number for this molecule (one past
 * whatever's currently the highest), or 1 if nothing's mapped yet. */
export function nextMapNumber(mol: Molecule): number {
  let max = 0;
  for (const a of Object.values(mol.atoms)) {
    if (typeof a.mapNumber === "number" && a.mapNumber > max) max = a.mapNumber;
  }
  return max + 1;
}

/** Clears every atom's map number in one step (a "start over" escape
 * hatch for the map-number tool). */
export function clearAllMapNumbers(mol: Molecule): Molecule {
  const atoms = { ...mol.atoms };
  for (const id in atoms) {
    if (atoms[id].mapNumber != null) atoms[id] = { ...atoms[id], mapNumber: undefined };
  }
  return { ...mol, atoms };
}

export function setBondOrder(mol: Molecule, id: string, order: BondOrder): Molecule {
  const b = mol.bonds[id];
  if (!b) return mol;
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, order, stereo: "none", doubleSide: "auto", dative: false } } };
}

export function setBondStereo(mol: Molecule, id: string, stereo: BondStereo): Molecule {
  const b = mol.bonds[id];
  if (!b) return mol;
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, stereo, order: 1, doubleSide: "auto", dative: false } } };
}

/** Toggles the dative/coordinate-bond arrow (see Bond.dative's doc
 * comment) on or off. Mirrors setBondOrder/setBondStereo's own
 * mutual-exclusivity: choosing any of the three always resets the other
 * two to their plain defaults, so a bond is never simultaneously "order
 * 2" and "dative" and "wedge" at once. */
export function setBondDative(mol: Molecule, id: string, dative: boolean): Molecule {
  const b = mol.bonds[id];
  if (!b) return mol;
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, dative, order: 1, stereo: "none", doubleSide: "auto" } } };
}

/**
 * Swaps a bond's two endpoints. A wedge/dash's narrow end is always a1 and
 * its wide end a2 (see BondView), so this is what flips which atom a
 * wedge/dash points from — the two atoms and the bond itself are otherwise
 * unchanged. Clicking the wedge/dash tool again on a bond that's already
 * that stereo uses this to flip it in place, since there's nothing else
 * left for a repeat click on it to usefully do.
 */
export function flipBondDirection(mol: Molecule, id: string): Molecule {
  const b = mol.bonds[id];
  if (!b) return mol;
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, a1: b.a2, a2: b.a1 } } };
}

/** Rotates the given atoms around `center` by `angleRad` radians. Bonds are unaffected (they follow their atoms). */
export function rotateAtoms(mol: Molecule, atomIds: string[], center: Point, angleRad: number): Molecule {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const atoms = { ...mol.atoms };
  for (const id of atomIds) {
    const a = atoms[id];
    if (!a) continue;
    const dx = a.x - center.x;
    const dy = a.y - center.y;
    atoms[id] = { ...a, x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  }
  return { ...mol, atoms };
}

export type MirrorAxis = "horizontal" | "vertical";

/**
 * Mirrors the given atoms across the bounding-box centre of that same set
 * — horizontal flips left/right (the y axis), vertical flips top/bottom.
 *
 * Label offsets are mirrored with their atom so a charge/lone-pair/radical/
 * stereo/map label stays on the outside of the structure instead of
 * swapping sides. Manual double-bond side placement is also swapped for
 * bonds whose two ends are both in the mirrored set: reflecting the drawing
 * reverses left/right relative to the bond's a1 -> a2 direction, so keeping
 * "left" would put the second line on the opposite visual side from where
 * it was before the flip. Wedge/dash stereo is deliberately left alone —
 * a mirror image of a chiral centre *is* its enantiomer, which is what
 * flipping the drawing should produce.
 *
 * Returns the original molecule when nothing actually moved, so a flip of a
 * selection already centred on the axis doesn't create an empty undo step.
 */
export function mirrorAtoms(mol: Molecule, atomIds: string[], axis: MirrorAxis): Molecule {
  const ids = [...new Set(atomIds)].filter((id) => !!mol.atoms[id]);
  if (ids.length === 0) return mol;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const a = mol.atoms[id];
    if (a.x < minX) minX = a.x;
    if (a.x > maxX) maxX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.y > maxY) maxY = a.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const atoms = { ...mol.atoms };
  let changed = false;
  for (const id of ids) {
    const a = mol.atoms[id];
    const x = axis === "horizontal" ? 2 * cx - a.x : a.x;
    const y = axis === "vertical" ? 2 * cy - a.y : a.y;
    let next: Atom = a;
    if (x !== a.x || y !== a.y) {
      next = { ...next, x, y };
      changed = true;
    }

    if (axis === "horizontal") {
      if (a.chargeOffsetX) { next = { ...next, chargeOffsetX: -a.chargeOffsetX }; changed = true; }
      if (a.radicalOffsetX) { next = { ...next, radicalOffsetX: -a.radicalOffsetX }; changed = true; }
      if (a.stereoLabelOffsetX) { next = { ...next, stereoLabelOffsetX: -a.stereoLabelOffsetX }; changed = true; }
      if (a.mapNumberOffsetX) { next = { ...next, mapNumberOffsetX: -a.mapNumberOffsetX }; changed = true; }
      if (a.lonePairOffsets?.some((o) => o && o.x !== 0)) {
        next = {
          ...next,
          lonePairOffsets: a.lonePairOffsets.map((o) => (o ? { ...o, x: -o.x } : o)),
        };
        changed = true;
      }
    } else {
      if (a.chargeOffsetY) { next = { ...next, chargeOffsetY: -a.chargeOffsetY }; changed = true; }
      if (a.radicalOffsetY) { next = { ...next, radicalOffsetY: -a.radicalOffsetY }; changed = true; }
      if (a.stereoLabelOffsetY) { next = { ...next, stereoLabelOffsetY: -a.stereoLabelOffsetY }; changed = true; }
      if (a.mapNumberOffsetY) { next = { ...next, mapNumberOffsetY: -a.mapNumberOffsetY }; changed = true; }
      if (a.lonePairOffsets?.some((o) => o && o.y !== 0)) {
        next = {
          ...next,
          lonePairOffsets: a.lonePairOffsets.map((o) => (o ? { ...o, y: -o.y } : o)),
        };
        changed = true;
      }
    }
    atoms[id] = next;
  }
  if (!changed) return mol;

  const idSet = new Set(ids);
  const bonds = { ...mol.bonds };
  let bondsChanged = false;
  for (const b of Object.values(mol.bonds)) {
    if (!idSet.has(b.a1) || !idSet.has(b.a2)) continue;
    if (b.doubleSide === "left" || b.doubleSide === "right") {
      bonds[b.id] = { ...b, doubleSide: b.doubleSide === "left" ? "right" : "left" };
      bondsChanged = true;
    }
  }
  return bondsChanged ? { ...mol, atoms, bonds } : { ...mol, atoms };
}

/**
 * Cycles a double bond's second-line placement: auto -> left -> right ->
 * center -> auto. Clicking the double-bond tool repeatedly on an existing
 * double bond steps through this, letting you override the automatic
 * placement and eventually return to it. No-op for bonds that aren't
 * currently order 2.
 */
export function cycleDoubleBondSide(mol: Molecule, id: string): Molecule {
  const b = mol.bonds[id];
  if (!b || b.order !== 2) return mol;
  const sequence: DoubleBondSide[] = ["auto", "left", "right", "center"];
  const next = sequence[(sequence.indexOf(b.doubleSide) + 1) % sequence.length];
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, doubleSide: next } } };
}

export function deleteAtom(mol: Molecule, id: string): Molecule {
  const atoms = { ...mol.atoms };
  delete atoms[id];
  const bonds: Record<string, Bond> = {};
  for (const bid in mol.bonds) {
    const b = mol.bonds[bid];
    if (b.a1 !== id && b.a2 !== id) bonds[bid] = b;
  }
  const hapticBonds = survivingHapticBonds(mol.hapticBonds, (aid) => aid !== id);
  const aromaticRingDisplays = survivingAromaticRingDisplays(mol.aromaticRingDisplays, (aid) => aid !== id);
  const schemes = pruneSchemesForAtoms(mol.schemes, new Set(Object.keys(atoms)));
  const sgroups = pruneSgroups(mol.sgroups, new Set(Object.keys(atoms)), new Set(Object.keys(bonds)));
  const cycles = pruneCyclesForAtoms(mol.cycles, atoms);
  // R-group definitions are keyed by label, not by atom id, so deleting an
  // atom never invalidates one (an R placeholder's deletion just means its
  // label is no longer drawn, i.e. not expandable) — they ride along as-is.
  return {
    atoms,
    bonds,
    hapticBonds,
    aromaticRingDisplays,
    ...(schemes ? { schemes } : {}),
    ...(sgroups ? { sgroups } : {}),
    ...(cycles ? { cycles } : {}),
    ...(mol.rgroups ? { rgroups: mol.rgroups } : {}),
  };
}

export function deleteBond(mol: Molecule, id: string): Molecule {
  const bonds = { ...mol.bonds };
  delete bonds[id];
  const sgroups = pruneSgroups(mol.sgroups, new Set(Object.keys(mol.atoms)), new Set(Object.keys(bonds)));
  if (sgroups) return { ...mol, bonds, sgroups };
  const rest = { ...mol };
  delete rest.sgroups;
  return { ...rest, bonds };
}

/**
 * Looks for a haptic bond already covering exactly this metal + ring atom
 * set (in either atom order, since a set of ring atoms has no inherent
 * order) — used to make the context-menu action a toggle: "add" if none
 * exists yet for this exact selection, "remove" if one already does,
 * rather than letting repeated clicks pile up duplicate haptic bonds
 * between the same atoms.
 */
export function findHapticBond(mol: Molecule, metalAtomId: string, ringAtomIds: Iterable<string>): HapticBond | null {
  const ringSet = new Set(ringAtomIds);
  for (const hb of Object.values(mol.hapticBonds)) {
    if (hb.metalAtomId !== metalAtomId) continue;
    if (hb.ringAtomIds.length !== ringSet.size) continue;
    if (hb.ringAtomIds.every((id) => ringSet.has(id))) return hb;
  }
  return null;
}

export function addHapticBond(mol: Molecule, id: string, metalAtomId: string, ringAtomIds: string[]): Molecule {
  const hb: HapticBond = { id, metalAtomId, ringAtomIds };
  return { ...mol, hapticBonds: { ...mol.hapticBonds, [id]: hb } };
}

export function deleteHapticBond(mol: Molecule, id: string): Molecule {
  const hapticBonds = { ...mol.hapticBonds };
  delete hapticBonds[id];
  return { ...mol, hapticBonds };
}

/**
 * Looks for an aromatic ring circle display already covering exactly
 * this atom set (in any order) — same toggle-matching idea as
 * findHapticBond, for the same reason: "add" if this exact ring has no
 * circle yet, "remove" if it already does.
 */
export function findAromaticRingDisplay(mol: Molecule, atomIds: Iterable<string>): AromaticRingDisplay | null {
  const set = new Set(atomIds);
  for (const r of Object.values(mol.aromaticRingDisplays)) {
    if (r.atomIds.length !== set.size) continue;
    if (r.atomIds.every((id) => set.has(id))) return r;
  }
  return null;
}

export function addAromaticRingDisplay(mol: Molecule, id: string, atomIds: string[]): Molecule {
  const r: AromaticRingDisplay = { id, atomIds };
  return { ...mol, aromaticRingDisplays: { ...mol.aromaticRingDisplays, [id]: r } };
}

export function deleteAromaticRingDisplay(mol: Molecule, id: string): Molecule {
  const aromaticRingDisplays = { ...mol.aromaticRingDisplays };
  delete aromaticRingDisplays[id];
  return { ...mol, aromaticRingDisplays };
}

/**
 * Resolves a selection into "one metal atom + \u22652 ligand atoms" for the
 * haptic-bond context-menu action \u2014 shared between deciding whether to
 * show that action at all (and whether it should read "add" or "remove")
 * and actually applying it, so both agree on exactly the same rule for
 * what counts as a valid selection. Null whenever the selection doesn't
 * unambiguously split that way: no metal atom, more than one, or fewer
 * than two remaining atoms to serve as the ring/ligand \u2014 deliberately
 * strict rather than guessing, since a wrong guess here would silently
 * bond the wrong atom set.
 */
export function resolveHapticSelection(mol: Molecule, atomIds: Iterable<string>): { metalAtomId: string; ringAtomIds: string[] } | null {
  const atoms = [...atomIds].map((id) => mol.atoms[id]).filter((a): a is Atom => !!a);
  const metals = atoms.filter((a) => isMetalLike(a.element));
  if (metals.length !== 1) return null;
  const ringAtomIds = atoms.filter((a) => a.id !== metals[0].id).map((a) => a.id);
  if (ringAtomIds.length < 2) return null;
  return { metalAtomId: metals[0].id, ringAtomIds };
}

/** The shared "is this a redundant explicit hydrogen" test stripExplicitHydrogens
 * and hasExplicitHydrogens both need to agree on: element H, a single bond,
 * no charge, no isotope label, no custom group text. */
function isSimpleTerminalHydrogen(a: Atom, connected: Bond[]): boolean {
  if (a.element !== "H" || a.charge !== 0 || a.isotope || a.group) return false;
  return connected.length === 1 && connected[0].order === 1 && connected[0].stereo === "none";
}

/**
 * Removes "simple" terminal hydrogen atoms — element H, a single bond, no
 * charge, no other bonds — and the bonds connecting them. Used when
 * importing files that list every hydrogen explicitly (common in real-world
 * MOL/SDF output, including PubChem's), so imported molecules match this
 * app's skeletal display convention. implicitH() re-derives the same count
 * from the remaining heavy atom's valence, so no chemical information is
 * lost — only the redundant explicit graph nodes are removed. Hydrogens
 * that are multiply-bonded, charged, or isotopically labeled (rare, but
 * chemically meaningful) are deliberately left alone.
 */
export function stripExplicitHydrogens(mol: Molecule): Molecule {
  const bondsByAtom = new Map<string, Bond[]>();
  for (const b of Object.values(mol.bonds)) {
    (bondsByAtom.get(b.a1) ?? bondsByAtom.set(b.a1, []).get(b.a1)!).push(b);
    (bondsByAtom.get(b.a2) ?? bondsByAtom.set(b.a2, []).get(b.a2)!).push(b);
  }

  const atoms = { ...mol.atoms };
  const bonds = { ...mol.bonds };

  for (const id in mol.atoms) {
    const a = mol.atoms[id];
    const connected = bondsByAtom.get(id) ?? [];
    if (!isSimpleTerminalHydrogen(a, connected)) continue;
    delete atoms[id];
    delete bonds[connected[0].id];
  }

  const schemes = pruneSchemesForAtoms(mol.schemes, atoms);
  const sgroups = pruneSgroups(mol.sgroups, new Set(Object.keys(atoms)), new Set(Object.keys(bonds)));
  const cycles = pruneCyclesForAtoms(mol.cycles, atoms);
  return {
    atoms,
    bonds,
    hapticBonds: survivingHapticBonds(mol.hapticBonds, (id) => id in atoms),
    aromaticRingDisplays: survivingAromaticRingDisplays(mol.aromaticRingDisplays, (id) => id in atoms),
    ...(schemes ? { schemes } : {}),
    ...(sgroups ? { sgroups } : {}),
    ...(cycles ? { cycles } : {}),
    // R-group definitions are label-keyed document metadata — nothing here
    // references an atom id — so they ride along untouched.
    ...(mol.rgroups ? { rgroups: mol.rgroups } : {}),
  };
}

/**
 * Whether this molecule has at least one atom stripExplicitHydrogens
 * would remove -- i.e. whether it currently looks "explicit" rather than
 * "implicit" for hydrogens. Used to decide which way the store's single
 * toggleExplicitHydrogens action should go on the next click, the same
 * way a real molecule editor's explicit-hydrogens button reads as
 * pressed or not based on the document's actual content rather than a
 * separately-tracked view flag.
 */
export function hasExplicitHydrogens(mol: Molecule): boolean {
  const bondsByAtom = new Map<string, Bond[]>();
  for (const b of Object.values(mol.bonds)) {
    (bondsByAtom.get(b.a1) ?? bondsByAtom.set(b.a1, []).get(b.a1)!).push(b);
    (bondsByAtom.get(b.a2) ?? bondsByAtom.set(b.a2, []).get(b.a2)!).push(b);
  }
  for (const id in mol.atoms) {
    if (isSimpleTerminalHydrogen(mol.atoms[id], bondsByAtom.get(id) ?? [])) return true;
  }
  return false;
}

/**
 * Extracts the induced subgraph of `mol` restricted to `atomIds`: those
 * atoms plus every bond whose both endpoints are in the set. Ids are kept
 * as-is (unlike insertMolecule, which mints fresh ones) since this is a
 * read-only snapshot for copy/export, not something merged into a live
 * molecule.
 */
export function subMolecule(mol: Molecule, atomIds: Iterable<string>): Molecule {
  const idSet = new Set(atomIds);
  const atoms: Record<string, Atom> = {};
  for (const id of idSet) {
    const a = mol.atoms[id];
    if (a) atoms[id] = a;
  }
  const bonds: Record<string, Bond> = {};
  for (const id in mol.bonds) {
    const b = mol.bonds[id];
    if (idSet.has(b.a1) && idSet.has(b.a2)) bonds[id] = b;
  }
  // A cycle only travels with a copied fragment when every intermediate it
  // names is part of that fragment: a half-copied cycle would draw arcs
  // around structures that stayed behind.
  const cycles = (mol.cycles ?? []).filter(
    (cycle) =>
      cycle.nodes.length > 0 &&
      cycle.nodes.every((node) => node.every((id) => idSet.has(id)))
  );
  // R-group definitions deliberately do NOT travel with fragments
  // (subMolecule feeds copy/paste and share/export snapshots): a pasted
  // generic keeps its R labels as plain placeholders, while the definitions
  // stay with the document they were drawn in. Definitions reference
  // fragments whose ids only mean something inside the source document, and
  // silently duplicating them into every pasted fragment would multiply the
  // same substituent under ids no other half of the paste agrees on.
  return {
    atoms,
    bonds,
    hapticBonds: survivingHapticBonds(mol.hapticBonds, (id) => idSet.has(id)),
    aromaticRingDisplays: survivingAromaticRingDisplays(mol.aromaticRingDisplays, (id) => idSet.has(id)),
    ...(cycles.length > 0 ? { cycles } : {}),
  };
}

/** All atoms reachable from `atomId` by traversing bonds (its connected fragment). */
export function fragmentOf(mol: Molecule, atomId: string): Set<string> {
  const visited = new Set<string>([atomId]);
  const stack = [atomId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const b of Object.values(mol.bonds)) {
      const other = b.a1 === cur ? b.a2 : b.a2 === cur ? b.a1 : null;
      if (other && !visited.has(other)) {
        visited.add(other);
        stack.push(other);
      }
    }
  }
  return visited;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundingBox(mol: Molecule): BoundingBox | null {
  const ids = Object.keys(mol.atoms);
  if (ids.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const a = mol.atoms[id];
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Merges `incoming` into `base`, assigning every incoming atom/bond a fresh
 * id (so it can never collide with what's already on the canvas) and
 * shifting positions by (dx, dy). Used to drop a fetched/imported compound
 * onto an existing drawing without disturbing anything already there.
 */
export function insertMolecule(
  base: Molecule,
  incoming: Molecule,
  dx: number,
  dy: number
): { mol: Molecule; newAtomIds: string[] } {
  const idMap: Record<string, string> = {};
  const atoms = { ...base.atoms };
  const bonds = { ...base.bonds };
  const newAtomIds: string[] = [];

  for (const oldId in incoming.atoms) {
    const a = incoming.atoms[oldId];
    const newId = nextId();
    idMap[oldId] = newId;
    atoms[newId] = {
      id: newId,
      x: a.x + dx,
      y: a.y + dy,
      element: a.element,
      charge: a.charge,
      chargeOffsetX: a.chargeOffsetX ?? 0,
      chargeOffsetY: a.chargeOffsetY ?? 0,
    };
    newAtomIds.push(newId);
  }
  for (const oldId in incoming.bonds) {
    const b = incoming.bonds[oldId];
    const newId = nextId();
    bonds[newId] = { id: newId, a1: idMap[b.a1], a2: idMap[b.a2], order: b.order, stereo: b.stereo, doubleSide: b.doubleSide, dative: b.dative };
  }
  const hapticBonds = { ...base.hapticBonds };
  for (const oldId in incoming.hapticBonds) {
    const hb = incoming.hapticBonds[oldId];
    const newId = nextId();
    hapticBonds[newId] = { id: newId, metalAtomId: idMap[hb.metalAtomId], ringAtomIds: hb.ringAtomIds.map((id) => idMap[id]) };
  }
  const aromaticRingDisplays = { ...base.aromaticRingDisplays };
  for (const oldId in incoming.aromaticRingDisplays) {
    const r = incoming.aromaticRingDisplays[oldId];
    const newId = nextId();
    aromaticRingDisplays[newId] = { id: newId, atomIds: r.atomIds.map((id) => idMap[id]) };
  }

  // Pasted cycles move with the fragment and get fresh ids, exactly like
  // its atoms and bonds. A cycle whose nodes all failed to map (a malformed
  // fragment) is dropped rather than left pointing at nothing.
  const cycles = [...(base.cycles ?? [])];
  for (const cycle of incoming.cycles ?? []) {
    const nodes = cycle.nodes
      .map((node) => node.map((id) => idMap[id]).filter((id): id is string => !!id))
      .filter((node) => node.length > 0);
    if (cycle.nodes.length > 0 && nodes.length === 0) continue;
    cycles.push({
      ...cycle,
      id: `cycle-${nextId()}`,
      centre: { x: cycle.centre.x + dx, y: cycle.centre.y + dy },
      nodes,
      ...(cycle.sides
        ? { sides: cycle.sides.map((side) => ({ ...side, id: `side-${nextId()}` })) }
        : {}),
    });
  }

  // R-group definitions never merge with the incoming fragment (see the
  // matching comment on subMolecule): the base document keeps its own
  // definitions, and an incoming fragment's R labels paste as plain
  // placeholders. `incoming.rgroups`, if somehow present, is dropped.
  return {
    mol: {
      atoms,
      bonds,
      hapticBonds,
      aromaticRingDisplays,
      ...(base.schemes ? { schemes: base.schemes } : {}),
      ...(cycles.length > 0 ? { cycles } : {}),
      ...(base.rgroups ? { rgroups: base.rgroups } : {}),
    },
    newAtomIds,
  };
}

/**
 * Pulls the given atoms — and only the bonds where *both* ends are among
 * them — out of a molecule into a standalone Molecule: the same shape a
 * built-in StructureTemplate or a clipboard paste uses. IDs are left as
 * they were; anything that inserts this later (pasteFragment) remaps
 * everything fresh on insertion anyway, so collisions with whatever's
 * already on the canvas aren't a concern. Used both for saving a selection
 * as a reusable template (see model/userTemplates.ts) and for turning a
 * selection into a SMILES string to search PubChem by structure.
 */
export function extractFragment(mol: Molecule, atomIds: Iterable<string>): Molecule {
  const idSet = new Set(atomIds);
  const atoms: Record<string, Atom> = {};
  for (const id of idSet) {
    if (mol.atoms[id]) atoms[id] = { ...mol.atoms[id] };
  }
  const bonds: Record<string, Bond> = {};
  for (const [id, b] of Object.entries(mol.bonds)) {
    if (idSet.has(b.a1) && idSet.has(b.a2)) bonds[id] = { ...b };
  }
  const hapticBonds: Record<string, HapticBond> = {};
  for (const [id, hb] of Object.entries(survivingHapticBonds(mol.hapticBonds, (aid) => idSet.has(aid)))) {
    hapticBonds[id] = { ...hb, ringAtomIds: [...hb.ringAtomIds] };
  }
  const aromaticRingDisplays: Record<string, AromaticRingDisplay> = {};
  for (const [id, r] of Object.entries(survivingAromaticRingDisplays(mol.aromaticRingDisplays, (aid) => idSet.has(aid)))) {
    aromaticRingDisplays[id] = { ...r, atomIds: [...r.atomIds] };
  }
  const cycles = (mol.cycles ?? []).filter(
    (cycle) =>
      cycle.nodes.length > 0 &&
      cycle.nodes.every((node) => node.every((id) => idSet.has(id)))
  );
  // Like subMolecule above: fragments never carry R-group definitions — the
  // pasted/saved generic keeps its R labels, definitions stay with the
  // document (see model/rgroups.ts).
  return {
    atoms,
    bonds,
    hapticBonds,
    aromaticRingDisplays,
    ...(cycles.length > 0 ? { cycles } : {}),
  };
}

// connectedComponents used to be defined here; it now lives in
// engine/clean2d.ts (which needs it for the clean-up engine) and is
// re-exported at the top of this file under the same name and signature.

interface Fragment { ids: string[]; atoms: Atom[]; minX: number; maxX: number; minY: number; maxY: number }

function fragmentsOf(mol: Molecule, atomIds: string[]): Fragment[] {
  return connectedComponents(mol, atomIds)
    .map((ids): Fragment | null => {
      const atoms = ids.map((id) => mol.atoms[id]).filter((a): a is Atom => !!a);
      if (atoms.length === 0) return null;
      return {
        ids,
        atoms,
        minX: Math.min(...atoms.map((a) => a.x)),
        maxX: Math.max(...atoms.map((a) => a.x)),
        minY: Math.min(...atoms.map((a) => a.y)),
        maxY: Math.max(...atoms.map((a) => a.y)),
      };
    })
    .filter((f): f is Fragment => f !== null);
}

export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

/**
 * Aligns whole connected fragments (see connectedComponents) to a shared
 * edge or centerline computed from their combined bounding box — each
 * fragment slides rigidly as a unit, so its own bond lengths and angles are
 * completely unaffected, only its position relative to the other fragments
 * changes. A no-op with fewer than 2 fragments, since there's nothing to
 * align a single rigid piece to.
 */
export function alignAtoms(mol: Molecule, atomIds: string[], mode: AlignMode): Molecule {
  const fragments = fragmentsOf(mol, atomIds);
  if (fragments.length < 2) return mol;

  let axis: "x" | "y";
  let target: number;
  switch (mode) {
    case "left": axis = "x"; target = Math.min(...fragments.map((f) => f.minX)); break;
    case "right": axis = "x"; target = Math.max(...fragments.map((f) => f.maxX)); break;
    case "centerX": axis = "x"; target = (Math.min(...fragments.map((f) => f.minX)) + Math.max(...fragments.map((f) => f.maxX))) / 2; break;
    case "top": axis = "y"; target = Math.min(...fragments.map((f) => f.minY)); break;
    case "bottom": axis = "y"; target = Math.max(...fragments.map((f) => f.maxY)); break;
    case "centerY": axis = "y"; target = (Math.min(...fragments.map((f) => f.minY)) + Math.max(...fragments.map((f) => f.maxY))) / 2; break;
  }

  const atoms = { ...mol.atoms };
  for (const f of fragments) {
    let edge: number;
    switch (mode) {
      case "left": edge = f.minX; break;
      case "right": edge = f.maxX; break;
      case "centerX": edge = (f.minX + f.maxX) / 2; break;
      case "top": edge = f.minY; break;
      case "bottom": edge = f.maxY; break;
      case "centerY": edge = (f.minY + f.maxY) / 2; break;
    }
    const delta = target - edge;
    for (const id of f.ids) {
      const a = atoms[id];
      if (!a) continue;
      atoms[id] = axis === "x" ? { ...a, x: a.x + delta } : { ...a, y: a.y + delta };
    }
  }
  return { ...mol, atoms };
}

export type DistributeAxis = "horizontal" | "vertical";

/**
 * Evenly re-spaces 3+ whole fragments (see connectedComponents) between the
 * two extreme ones' centers along the given axis — like alignAtoms, each
 * fragment translates rigidly, so internal bond geometry never changes,
 * only spacing between fragments. A no-op with fewer than 3 fragments.
 */
export function distributeAtoms(mol: Molecule, atomIds: string[], axis: DistributeAxis): Molecule {
  const fragments = fragmentsOf(mol, atomIds);
  if (fragments.length < 3) return mol;

  const centerOf = (f: Fragment) => (axis === "horizontal" ? (f.minX + f.maxX) / 2 : (f.minY + f.maxY) / 2);
  const entries = fragments.map((f) => ({ f, center: centerOf(f) })).sort((p, q) => p.center - q.center);
  const first = entries[0].center;
  const last = entries[entries.length - 1].center;
  const step = (last - first) / (entries.length - 1);

  const atoms = { ...mol.atoms };
  entries.forEach((e, i) => {
    const delta = first + step * i - e.center;
    for (const id of e.f.ids) {
      const a = atoms[id];
      if (!a) continue;
      atoms[id] = axis === "horizontal" ? { ...a, x: a.x + delta } : { ...a, y: a.y + delta };
    }
  });
  return { ...mol, atoms };
}

/** Horizontal clearance left between structures when overlapping fragments
 * are pulled apart. Generous enough that a wide atom label on the left
 * structure still clears the right one. */
export const FRAGMENT_SEPARATION = BOND_LEN * 1.5;

/**
 * Separates connected structures whose bounding boxes overlap, laying them
 * out left-to-right in their current reading order with a fixed gap.
 *
 * This is the "several records landed on top of each other" case: an import
 * or merge can bring in structures at coordinates that collide with what is
 * already drawn, and cleaning bond lengths (cleanUpAtoms) deliberately
 * leaves fragment positions alone. Only actual overlap triggers a move; a
 * drawing whose structures are already apart is returned unchanged, so this
 * can be offered as a one-click command without disturbing a tidy layout.
 *
 * Each fragment is translated rigidly — its internal geometry, stereo
 * wedges and atom labels are untouched — and the leftmost fragment keeps its
 * original left edge as the row's starting point.
 */
export function separateOverlappingFragments(
  mol: Molecule,
  gap: number = FRAGMENT_SEPARATION,
): Molecule {
  const fragments = fragmentsOf(mol, Object.keys(mol.atoms));
  if (fragments.length < 2) return mol;

  // A small positive margin means structures that merely touch edges are
  // treated as overlapping too — "touching" is not a readable layout.
  const margin = gap * 0.25;
  const overlaps = (a: Fragment, b: Fragment): boolean =>
    a.minX < b.maxX + margin && b.minX < a.maxX + margin &&
    a.minY < b.maxY + margin && b.minY < a.maxY + margin;

  let anyOverlap = false;
  for (let i = 0; i < fragments.length && !anyOverlap; i++) {
    for (let j = i + 1; j < fragments.length; j++) {
      if (overlaps(fragments[i], fragments[j])) {
        anyOverlap = true;
        break;
      }
    }
  }
  if (!anyOverlap) return mol;

  // Reading order: left to right, then top to bottom for fragments that
  // share a left edge (e.g. a vertically stacked pair).
  const ordered = [...fragments].sort((a, b) => a.minX - b.minX || a.minY - b.minY);
  const centerY =
    (Math.min(...fragments.map((f) => f.minY)) + Math.max(...fragments.map((f) => f.maxY))) / 2;
  let cursorX = Math.min(...fragments.map((f) => f.minX));

  const atoms = { ...mol.atoms };
  for (const fragment of ordered) {
    const dx = cursorX - fragment.minX;
    const dy = centerY - (fragment.minY + fragment.maxY) / 2;
    for (const id of fragment.ids) {
      const atom = atoms[id];
      if (!atom) continue;
      atoms[id] = { ...atom, x: atom.x + dx, y: atom.y + dy };
    }
    cursorX += fragment.maxX - fragment.minX + gap;
  }
  return { ...mol, atoms };
}

/**
 * "Clean Up": redraws the given atoms' structure in place, delegating to
 * the hybridisation-aware engine in engine/clean2d.ts — every ring comes
 * out a regular polygon, chains come out as proper skeletal zigzags at
 * hybridisation-ideal angles (sp 180°, sp2 120°, sp3 120° for the 2-coordinate
 * zigzag convention / 109.5°-clamped fans where degree allows), bond lengths
 * follow the elements and bond orders, double-bond cis/trans arrangements are
 * preserved, and the endpoints of any wedge/dash bond stay exactly where
 * they were so manually drawn stereochemistry is never reinterpreted.
 *
 * Each connected fragment (see connectedComponents) is handled on its own,
 * anchored so it doesn't drift or detach in a way the user didn't ask for:
 *  - If any atom in the fragment has a bond to something *outside* the
 *    given atoms (e.g. cleaning up one substituent, or one ring, of a
 *    larger structure), every such boundary atom is treated as already
 *    fixed, and everything else builds outward from there — so the
 *    fragment's attachment point to the rest of the molecule never moves.
 *  - Otherwise (the fragment is entirely self-contained in the selection —
 *    including the common case of cleaning up with nothing selected, i.e.
 *    the whole molecule) the whole fragment is shifted back so its center
 *    of mass lands exactly where it started — so Clean Up only straightens
 *    things in place rather than relocating the structure elsewhere.
 *
 * The signature and return shape are unchanged from the pre-engine
 * implementation (Molecule in, new Molecule out, positions only — bond
 * orders/connectivity/annotations never touched) so the store action and
 * the existing tests keep working untouched. `snapStep` threads the user's
 * snap-angle preference into the engine; a non-positive value disables
 * snapping (see Clean2DOptions.snapStep).
 */
export function cleanUpAtoms(mol: Molecule, atomIds: string[], snapStep: number = Math.PI / 6): Molecule {
  return cleanStructure2D(mol, atomIds, { snapStep }).mol;
}
