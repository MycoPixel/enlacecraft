import type { Atom, Bond, Molecule, Point, RGroupDefinition } from "../types/chemistry";
import { boundingBox, extractFragment } from "./molecule";
import { isPlaceholderLabel } from "./valence";
import { pruneSchemesForAtoms } from "./reactionSchemes";
import { pruneSgroups } from "./sgroups";
import { pruneCyclesForAtoms } from "./cycles";
import { nextId } from "./id";

/**
 * R-group definitions and generic-structure expansion (OCTET_DRAW_IMPROVEMENT_PLAN
 * Phase 10).
 *
 * Placeholder R labels already exist as ordinary atoms: typing "R"/"R1"/"R'"
 * into a label lands in Atom.group as a "generic" label (model/atomLabelParser.ts,
 * flagged by model/valence.ts's isPlaceholderLabel). An R-group *definition*
 * attaches a substituent fragment to one of those labels: `defineRGroup` pulls
 * the selected atoms out of the drawing into an RGroupDefinition, and
 * `expandGeneric` produces concrete copies of the whole drawing in which every
 * defined R placeholder has been replaced by a copy of its fragment.
 *
 * CDXML LIMITATION (documented per the plan — "export/import in CDXML only
 * where a faithful mapping exists, otherwise document the limitation"):
 * R placeholder labels themselves round-trip through CDXML/MOL as ordinary
 * atom labels, but the *definitions* have no faithful CDXML mapping (ChemDraw's
 * R-group file semantics — RDESC/RSITE markup — differ enough that a lossy
 * mapping would be worse than none). Definitions therefore exist only in the
 * native project format; a CDXML export of a drawing with definitions writes
 * the generic structures and the R labels but not the definitions, and
 * re-importing it yields the same drawing without them. S-groups already cover
 * the polymer/repeat cases that ChemDraw also expresses via S-groups.
 *
 * All functions here are pure: (Molecule, args) -> Molecule, like the rest of
 * src/model.
 */

/** The placeholder labels an R-group definition can attach to: "R",
 * "R1".."R99", and the prime-marked variants ("R'", "R''", "R1'", ...) that
 * atomLabelParser's generic case accepts for distinguished R sites. Mirrors
 * the R-shaped subset of GENERIC_LABEL_RE there — a definition label is
 * deliberately stricter than "any placeholder text" ("X", "Ar", "Nu" stay
 * plain placeholders with no R-group semantics). */
export const RGROUP_LABEL_PATTERN = /^R[0-9]{0,2}['\u2032\u2033]{0,2}$/;

/** Hard ceiling on how many expanded copies one Expand command may produce.
 * The cartesian product across labels grows fast (2 defs on each of 6 labels
 * is already 64); past this the grid stops being readable anyway, so the
 * command lays out the first maxCombinations combinations and stops. */
export const MAX_RGROUP_COMBINATIONS = 64;

/** Clearance between the original drawing and the first expanded copy, and
 * between neighbouring copies, in drawing units. Generous, so even a wide
 * atom label on one copy clears the next one. */
export const RGROUP_EXPANSION_GAP = 80;

/** Expanded copies wrap onto a new row (below the previous one) after this
 * many columns, so a capped 64-copy run becomes a grid rather than a strip
 * several screens wide. */
export const RGROUP_EXPANSION_COLUMNS = 4;

export function isRGroupLabel(label: string | undefined): label is string {
  return typeof label === "string" && RGROUP_LABEL_PATTERN.test(label);
}

/** The distinct R labels actually drawn on the canvas (an atom carrying a
 * placeholder label that looks like an R site), in a stable, natural reading
 * order (R, R1, R2, … R10). */
export function drawnRGroupLabels(mol: Molecule): string[] {
  const labels = new Set<string>();
  for (const atom of Object.values(mol.atoms)) {
    if (isPlaceholderLabel(atom) && isRGroupLabel(atom.group)) labels.add(atom.group);
  }
  return [...labels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** The definitions bucketed by label, preserving record order within a label
 * (expandGeneric's combination order follows this). */
export function rgroupDefinitionsByLabel(mol: Molecule): Map<string, RGroupDefinition[]> {
  const byLabel = new Map<string, RGroupDefinition[]>();
  for (const def of Object.values(mol.rgroups ?? {})) {
    const list = byLabel.get(def.label) ?? [];
    list.push(def);
    byLabel.set(def.label, list);
  }
  return byLabel;
}

/** True when Expand has something to do: at least one drawn R label that has
 * a definition. Used by the command palette / context menu to keep the item
 * from looking broken when it would be a no-op. */
export function hasExpandableRGroups(mol: Molecule): boolean {
  const byLabel = rgroupDefinitionsByLabel(mol);
  return drawnRGroupLabels(mol).some((label) => byLabel.has(label));
}

/** The first R label ("R", then "R1", "R2", …) that has no definition yet —
 * the default pick for a Define command invoked without an explicit label
 * (command palette). */
export function nextUnusedRGroupLabel(mol: Molecule): string {
  const defined = new Set(Object.values(mol.rgroups ?? {}).map((def) => def.label));
  if (!defined.has("R")) return "R";
  for (let i = 1; i <= 99; i++) {
    const label = `R${i}`;
    if (!defined.has(label)) return label;
  }
  return "R";
}

/**
 * Extracts the selected atoms (and their internal bonds) into a new R-group
 * definition and removes them from the drawing — the substituent "moves into"
 * the definition, exactly as drawn.
 *
 * The attachment atom is the fragment atom that had a bond to the rest of the
 * drawing (first such bond in bond order); when the selection is disconnected
 * from everything else, it falls back to the first selected atom. Redefining
 * a label replaces that label's previous definition (one definition per
 * label); the record is keyed by definition id, so the old entry is dropped
 * rather than shadowed. Returns the molecule unchanged for an invalid label
 * or an empty selection.
 */
export function defineRGroup(mol: Molecule, label: string, selectedAtomIds: Iterable<string>): Molecule {
  if (!isRGroupLabel(label)) return mol;
  const idSet = new Set(selectedAtomIds);
  for (const id of idSet) {
    if (!mol.atoms[id]) idSet.delete(id);
  }
  if (idSet.size === 0) return mol;

  // Attachment point: the fragment side of the first bond that crosses the
  // selection boundary; otherwise (fully disconnected selection) the first
  // selected atom.
  let attachmentAtomId: string | null = null;
  for (const bond of Object.values(mol.bonds)) {
    const inside = idSet.has(bond.a1) ? bond.a1 : idSet.has(bond.a2) ? bond.a2 : null;
    if (inside && !(idSet.has(bond.a1) && idSet.has(bond.a2))) {
      attachmentAtomId = inside;
      break;
    }
  }
  if (!attachmentAtomId) attachmentAtomId = [...idSet][0];

  // The fragment is stored exactly as drawn — same ids, same positions — the
  // same shape extractFragment produces for templates/clipboard.
  const fragment = extractFragment(mol, idSet);

  // Remove the selected atoms from the drawing (the multi-atom analogue of
  // deleteAtom: every cross-referencing container is pruned the same way).
  const atoms: Record<string, Atom> = {};
  for (const id in mol.atoms) {
    if (!idSet.has(id)) atoms[id] = mol.atoms[id];
  }
  const bonds: Record<string, Bond> = {};
  for (const bid in mol.bonds) {
    const b = mol.bonds[bid];
    if (!idSet.has(b.a1) && !idSet.has(b.a2)) bonds[bid] = b;
  }
  const isSurviving = (id: string) => !idSet.has(id);
  const survivingHaptic = Object.values(mol.hapticBonds).filter(
    (hb) => isSurviving(hb.metalAtomId) && hb.ringAtomIds.every(isSurviving)
  );
  const survivingRings = Object.values(mol.aromaticRingDisplays).filter((r) => r.atomIds.every(isSurviving));
  const schemes = pruneSchemesForAtoms(mol.schemes, new Set(Object.keys(atoms)));
  const sgroups = pruneSgroups(mol.sgroups, new Set(Object.keys(atoms)), new Set(Object.keys(bonds)));
  const cycles = pruneCyclesForAtoms(mol.cycles, atoms);

  const id = `rgroup-${nextId()}`;
  const definition: RGroupDefinition = { id, label, attachmentAtomId, molecule: fragment };
  // One definition per label: redefining replaces, keyed by the new id.
  const rgroups: Record<string, RGroupDefinition> = {};
  for (const def of Object.values(mol.rgroups ?? {})) {
    if (def.label !== label) rgroups[def.id] = def;
  }
  rgroups[id] = definition;

  return {
    atoms,
    bonds,
    hapticBonds: Object.fromEntries(survivingHaptic.map((hb) => [hb.id, hb])),
    aromaticRingDisplays: Object.fromEntries(survivingRings.map((r) => [r.id, r])),
    ...(schemes ? { schemes } : {}),
    ...(sgroups ? { sgroups } : {}),
    ...(cycles ? { cycles } : {}),
    rgroups,
  };
}

/**
 * Drops every R-group definition. This is deliberately NOT an undo of
 * defineRGroup: the substituent atoms that were extracted into definitions
 * stay extracted (they are no longer part of the drawing's history), so
 * clearing only makes the drawing forget them — Expand afterwards is a no-op
 * and drawn R labels stay plain placeholders. Restoring the fragments would
 * require knowing where they came from, which the model deliberately does not
 * record (undo of the original Define command is the way back).
 */
export function clearRGroups(mol: Molecule): Molecule {
  if (!mol.rgroups) return mol;
  const next = { ...mol };
  delete next.rgroups;
  return next;
}

export interface ExpandGenericOptions {
  /** Cap on produced copies (default and ceiling: MAX_RGROUP_COMBINATIONS). */
  maxCombinations?: number;
  /** Clearance between copies (default RGROUP_EXPANSION_GAP). */
  gap?: number;
}

/**
 * Expands every defined R placeholder into concrete structures: for each
 * combination of definitions across the distinct drawn R labels (the
 * cartesian product of each label's definition list — with the UI's
 * one-definition-per-label convention a two-label drawing yields exactly one
 * fully-expanded copy, while a document that carries several definitions for
 * a label gets one copy per choice), produces a fresh copy of the whole
 * drawing in which each R placeholder of a participating label is replaced by
 * a copy of its definition's fragment, bonded at the fragment's attachment
 * atom.
 *
 * Mechanically, per R placeholder: the R atom is deleted, the fragment copy
 * is translated so its attachment atom lands exactly on the R atom's old
 * position (the "relabel" in the plan), rotated so the fragment body extends
 * away from the R atom's former neighbours (its internal geometry is
 * untouched — only the orientation changes — and the step is skipped when
 * either side has no well-defined direction), and the R atom's former
 * neighbours are re-bonded to the attachment-atom copy with their original
 * bond orders and stereo.
 *
 * Copies are laid out left-to-right in a grid to the right of the original
 * (bounds width + gap spacing, RGROUP_EXPANSION_COLUMNS per row), and carry
 * plain structure only — annotations, reaction schemes and cycles stay with
 * the original drawing, since they belong to the row it sits in, not to the
 * expanded variants. The original drawing itself is untouched, and the
 * definitions stay registered so the command can be run again. Returns the
 * SAME molecule object with count 0 when there is nothing to expand (no
 * drawn label has a definition), so the store records no empty undo step.
 */
export function expandGeneric(
  mol: Molecule,
  opts: ExpandGenericOptions = {}
): { mol: Molecule; count: number } {
  const byLabel = rgroupDefinitionsByLabel(mol);
  const labels = drawnRGroupLabels(mol).filter((label) => byLabel.has(label) && byLabel.get(label)!.length > 0);
  if (labels.length === 0) return { mol, count: 0 };

  const cap = Math.max(
    1,
    Math.min(opts.maxCombinations ?? MAX_RGROUP_COMBINATIONS, MAX_RGROUP_COMBINATIONS)
  );

  // Cartesian product across the labels, enumerated in label order and
  // stopped at the cap (later combinations are simply not produced).
  const lists = labels.map((label) => byLabel.get(label)!);
  const combinations: RGroupDefinition[][] = [[]];
  for (const list of lists) {
    const next: RGroupDefinition[][] = [];
    for (const partial of combinations) {
      for (const def of list) {
        if (next.length >= cap) break;
        next.push([...partial, def]);
      }
      if (next.length >= cap) break;
    }
    combinations.length = 0;
    combinations.push(...next);
  }
  if (combinations.length === 0 || (combinations.length === 1 && combinations[0].length === 0)) {
    return { mol, count: 0 };
  }

  const bounds = boundingBox(mol);
  if (!bounds) return { mol, count: 0 };
  const gap = Math.max(0, opts.gap ?? RGROUP_EXPANSION_GAP);
  const rowHeight = bounds.maxY - bounds.minY + gap;

  let next = mol;
  combinations.forEach((combination, index) => {
    const copy = buildExpandedCopy(mol, labels, combination);
    const column = index % RGROUP_EXPANSION_COLUMNS;
    const row = Math.floor(index / RGROUP_EXPANSION_COLUMNS);
    // Column 0 starts one copy-width + gap to the right of the original's
    // right edge; each further column advances by the same stride. Every
    // copy shares the original's geometry, so its bounds are the original's.
    const stride = bounds.maxX - bounds.minX + gap;
    const dx = (column + 1) * stride;
    const dy = row * rowHeight;
    const atoms: Record<string, Atom> = { ...next.atoms };
    for (const atom of Object.values(copy.atoms)) {
      atoms[atom.id] = { ...atom, x: atom.x + dx, y: atom.y + dy };
    }
    const bonds: Record<string, Bond> = { ...next.bonds, ...copy.bonds };
    next = { ...next, atoms, bonds };
  });

  return { mol: next, count: combinations.length };
}

/**
 * Builds one expanded copy of the whole drawing: every atom/bond gets a
 * fresh id, and each R placeholder whose label is in `labels` is replaced by
 * its combination entry's fragment (see expandGeneric's doc comment for the
 * delete / translate / rotate / re-bond mechanics). Returns atoms+bonds
 * only; layout is the caller's job.
 */
function buildExpandedCopy(
  mol: Molecule,
  labels: string[],
  combination: RGroupDefinition[]
): { atoms: Record<string, Atom>; bonds: Record<string, Bond> } {
  const idMap: Record<string, string> = {};
  const atoms: Record<string, Atom> = {};
  const bonds: Record<string, Bond> = {};

  for (const oldId in mol.atoms) {
    const a = mol.atoms[oldId];
    const newId = nextId();
    idMap[oldId] = newId;
    atoms[newId] = { ...a, id: newId };
  }
  for (const oldId in mol.bonds) {
    const b = mol.bonds[oldId];
    const newId = nextId();
    bonds[newId] = { ...b, id: newId, a1: idMap[b.a1], a2: idMap[b.a2] };
  }

  const defByLabel = new Map<string, RGroupDefinition>();
  labels.forEach((label, i) => defByLabel.set(label, combination[i]));

  // Group the R placeholders by label once, so a label drawn at several
  // sites replaces all of them with its combination's fragment.
  for (const oldId in mol.atoms) {
    const rAtom = mol.atoms[oldId];
    if (!isPlaceholderLabel(rAtom) || !isRGroupLabel(rAtom.group)) continue;
    const def = defByLabel.get(rAtom.group);
    if (!def) continue;
    expandPlaceholder(atoms, bonds, idMap[oldId], rAtom, def);
  }

  return { atoms, bonds };
}

/** Replaces one R placeholder atom (the copy at `rCopyId`) with a copy of
 * `def`'s fragment, per the mechanics documented on expandGeneric. */
function expandPlaceholder(
  atoms: Record<string, Atom>,
  bonds: Record<string, Bond>,
  rCopyId: string,
  rAtom: Atom,
  def: RGroupDefinition
): void {
  const fragment = def.molecule;
  const attachOriginal = fragment.atoms[def.attachmentAtomId];
  if (!attachOriginal) return; // sanitized definitions always have it; defend anyway

  // Copy the fragment in with fresh ids, then translate it so the attachment
  // atom sits exactly at the R atom's position (rPos - offset).
  const fragIdMap: Record<string, string> = {};
  const fragAtoms: Record<string, Atom> = {};
  for (const oldId in fragment.atoms) {
    const a = fragment.atoms[oldId];
    const newId = nextId();
    fragIdMap[oldId] = newId;
    fragAtoms[newId] = { ...a, id: newId };
  }
  const fragBonds: Record<string, Bond> = {};
  for (const oldId in fragment.bonds) {
    const b = fragment.bonds[oldId];
    const newId = nextId();
    fragBonds[newId] = { ...b, id: newId, a1: fragIdMap[b.a1], a2: fragIdMap[b.a2] };
  }
  const attachCopyId = fragIdMap[def.attachmentAtomId];
  const rPos: Point = { x: rAtom.x, y: rAtom.y };
  const dx = rPos.x - attachOriginal.x;
  const dy = rPos.y - attachOriginal.y;
  for (const a of Object.values(fragAtoms)) {
    fragAtoms[a.id] = { ...a, x: a.x + dx, y: a.y + dy };
  }

  // Orient the fragment away from the host: rotate around the attachment
  // point so the fragment's body direction turns toward the side opposite
  // the R atom's former neighbours. Pure orientation change — bond lengths
  // and angles inside the fragment are untouched. Skipped when either side
  // has no well-defined direction (a single-atom fragment, or neighbours on
  // exactly opposite sides).
  const hostDir = averageDirection(
    Object.values(bonds)
      .filter((b) => b.a1 === rCopyId || b.a2 === rCopyId)
      .map((b) => {
        const other = atoms[b.a1 === rCopyId ? b.a2 : b.a1];
        return { x: other.x - rPos.x, y: other.y - rPos.y };
      })
  );
  const attachCopy = fragAtoms[attachCopyId];
  const fragDir = averageDirection(
    Object.values(fragBonds)
      .filter((b) => b.a1 === attachCopyId || b.a2 === attachCopyId)
      .map((b) => {
        const other = fragAtoms[b.a1 === attachCopyId ? b.a2 : b.a1];
        return { x: other.x - attachCopy.x, y: other.y - attachCopy.y };
      })
  );
  if (hostDir && fragDir) {
    // Target direction: opposite the host neighbours.
    const target = { x: -hostDir.x, y: -hostDir.y };
    const angle = Math.atan2(target.y, target.x) - Math.atan2(fragDir.y, fragDir.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const a of Object.values(fragAtoms)) {
      const relX = a.x - rPos.x;
      const relY = a.y - rPos.y;
      fragAtoms[a.id] = { ...a, x: rPos.x + relX * cos - relY * sin, y: rPos.y + relX * sin + relY * cos };
    }
  }

  // Delete the R placeholder: its former neighbours are re-bonded to the
  // attachment-atom copy with the bonds' original order and stereo.
  const formerNeighborBonds = Object.values(bonds).filter((b) => b.a1 === rCopyId || b.a2 === rCopyId);
  delete atoms[rCopyId];
  for (const b of formerNeighborBonds) delete bonds[b.id];

  for (const a of Object.values(fragAtoms)) atoms[a.id] = a;
  for (const b of Object.values(fragBonds)) bonds[b.id] = b;
  for (const b of formerNeighborBonds) {
    const neighborCopyId = b.a1 === rCopyId ? b.a2 : b.a1;
    const newId = nextId();
    bonds[newId] = {
      id: newId,
      a1: neighborCopyId,
      a2: attachCopyId,
      order: b.order,
      stereo: b.stereo,
      doubleSide: b.doubleSide,
      ...(b.dative ? { dative: true } : {}),
    };
  }
}

/** Mean of unit vectors; null when there is nothing to average or the result
 * is degenerate (neighbours on exactly opposite sides cancel out). */
function averageDirection(vectors: Point[]): Point | null {
  if (vectors.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const v of vectors) {
    const len = Math.hypot(v.x, v.y);
    if (len < 1e-9) continue;
    x += v.x / len;
    y += v.y / len;
  }
  const len = Math.hypot(x, y);
  if (len < 1e-6) return null;
  return { x: x / len, y: y / len };
}
