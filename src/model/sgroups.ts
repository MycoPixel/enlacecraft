import type { Annotation, Bond, Molecule, SGroup, SGroupType } from "../types/chemistry";

/** Every S-group type this app knows about, in the order the pickers list
 * them: polymer repeat units first, then mixtures/superatoms/data. */
export const SGROUP_TYPES: readonly SGroupType[] = [
  "SRU",
  "COP",
  "CRO",
  "MON",
  "MER",
  "MOD",
  "GRA",
  "MUL",
  "COM",
  "SUP",
  "DAT",
  "ANY",
];

/** The repeat-count label a newly created group gets by default. ChemDraw
 * writes "n" for the common polymer brackets; the other types usually have
 * no count at all. */
export const DEFAULT_SGROUP_SUBSCRIPT: Partial<Record<SGroupType, string>> = {
  SRU: "n",
  COP: "n",
  CRO: "n",
  MOD: "n",
  GRA: "n",
};

/** Bonds whose both endpoints are inside `atomIds` — the bonds a new S-group
 * encloses. Crossing bonds (one endpoint outside) are added separately when
 * an imported file names them. */
export function sgroupBondIds(mol: Molecule, atomIds: Iterable<string>): string[] {
  const inside = new Set(atomIds);
  const out: string[] = [];
  for (const bond of Object.values(mol.bonds)) {
    if (inside.has(bond.a1) && inside.has(bond.a2)) out.push(bond.id);
  }
  return out;
}

/**
 * Drops S-group atom/bond references that no longer exist. This is the
 * molecule-side counterpart to pruneSGroupAnnotationIds: deleting an atom,
 * a bond, or a set of explicit hydrogens must not leave a group pointing at
 * something that's gone.
 *
 * A group with no atoms left is removed entirely; one that still has atoms
 * but lost its bonds keeps going (a bracket around a bare vertex is still
 * meaningful). Returns the original record when nothing changed, so callers
 * can preserve reference equality.
 */
export function pruneSgroups(
  sgroups: Record<string, SGroup> | undefined,
  atomIds: ReadonlySet<string>,
  bondIds: ReadonlySet<string>,
): Record<string, SGroup> | undefined {
  if (!sgroups) return undefined;

  let changed = false;
  const out: Record<string, SGroup> = {};
  for (const [key, sg] of Object.entries(sgroups)) {
    const atoms = sg.atomIds.filter((id) => atomIds.has(id));
    if (atoms.length === 0) {
      changed = true;
      continue;
    }
    if (atoms.length !== sg.atomIds.length) changed = true;
    const bonds = sg.bondIds?.filter((id) => bondIds.has(id));
    const lostBonds = bonds != null && bonds.length !== sg.bondIds!.length;
    if (lostBonds) changed = true;
    if (atoms.length === sg.atomIds.length && !lostBonds) {
      out[key] = sg;
      continue;
    }
    const next: SGroup = { ...sg, atomIds: atoms };
    if (bonds && bonds.length > 0) next.bondIds = bonds;
    else delete next.bondIds;
    out[key] = next;
  }

  if (!changed) return sgroups;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Drops S-group bracket-annotation references that no longer exist.
 *
 * S-groups live on the molecule while their brackets live in the sibling
 * annotation map (or, on a CDXML import, the just-parsed annotation array),
 * so the two can only be reconciled once both have been cleaned. Returns the
 * original record when nothing changed, letting callers preserve reference
 * equality the same way pruneSchemeArrowIds does.
 */
export function pruneSGroupAnnotationIds(
  sgroups: Record<string, SGroup> | undefined,
  annotations: Record<string, Annotation> | readonly Annotation[],
): Record<string, SGroup> | undefined {
  if (!sgroups) return undefined;
  const exists = Array.isArray(annotations)
    ? (id: string): boolean => annotations.some((a) => a.id === id)
    : (id: string): boolean => Object.prototype.hasOwnProperty.call(annotations, id);

  let changed = false;
  const out: Record<string, SGroup> = {};
  for (const [key, sg] of Object.entries(sgroups)) {
    if (!sg.bracketAnnotationIds) {
      out[key] = sg;
      continue;
    }
    const kept = sg.bracketAnnotationIds.filter(exists);
    if (kept.length === sg.bracketAnnotationIds.length) {
      out[key] = sg;
      continue;
    }
    changed = true;
    const next: SGroup = { ...sg };
    if (kept.length > 0) next.bracketAnnotationIds = kept;
    else delete next.bracketAnnotationIds;
    out[key] = next;
  }
  return changed ? out : sgroups;
}

/** The bonds an S-group keeps after its atom membership changes: everything
 * it already named that still touches a member atom. A crossing bond has one
 * endpoint outside the group by definition, so "both endpoints inside" would
 * wrongly drop it. */
export function sgroupBondsTouching(
  mol: Molecule,
  atomIds: Iterable<string>,
  existing: Iterable<string> = [],
): string[] {
  const inside = new Set(atomIds);
  const out = new Set(existing);
  for (const id of out) {
    const bond: Bond | undefined = mol.bonds[id];
    if (!bond || (!inside.has(bond.a1) && !inside.has(bond.a2))) out.delete(id);
  }
  for (const bond of Object.values(mol.bonds)) {
    if (inside.has(bond.a1) && inside.has(bond.a2)) out.add(bond.id);
  }
  return [...out];
}
