import type { Molecule } from "../types/chemistry";
import { VALENCE } from "./constants";
import { angleOf } from "./geometry";

export function bondsOfAtom(mol: Molecule, atomId: string) {
  return Object.values(mol.bonds).filter((b) => b.a1 === atomId || b.a2 === atomId);
}

export function neighborIds(mol: Molecule, atomId: string): string[] {
  return bondsOfAtom(mol, atomId).map((b) => (b.a1 === atomId ? b.a2 : b.a1));
}

export function neighborAngles(mol: Molecule, atomId: string): number[] {
  const a = mol.atoms[atomId];
  return bondsOfAtom(mol, atomId).map((b) => {
    const otherId = b.a1 === atomId ? b.a2 : b.a1;
    const o = mol.atoms[otherId];
    return angleOf(a, o);
  });
}

/**
 * Effective valence given charge. This is a simplified organic-chemistry
 * approximation, not a full valence-electron model:
 *  - heteroatoms with lone pairs (N, O, S, P) gain bonding capacity when
 *    positively charged and lose it when negatively charged
 *    (e.g. ammonium N+ -> 4, alkoxide O- -> 1)
 *  - carbon-like atoms (C, Si, B) lose one bonding site per unit of charge
 *    in either direction (e.g. carbocation / carbanion -> 3)
 */
export function effectiveValence(el: keyof typeof VALENCE, charge: number): number {
  const base = VALENCE[el] ?? 4;
  if (el === "C" || el === "Si" || el === "B") {
    return Math.max(0, base - Math.abs(charge));
  }
  return Math.max(0, base + charge);
}

export function usedValence(mol: Molecule, atomId: string): number {
  return bondsOfAtom(mol, atomId).reduce((sum, b) => sum + b.order, 0);
}

export function implicitH(mol: Molecule, atomId: string): number {
  const a = mol.atoms[atomId];
  const used = usedValence(mol, atomId);
  const eff = effectiveValence(a.element, a.charge);
  return Math.max(0, eff - used);
}

export function isOverValent(mol: Molecule, atomId: string): boolean {
  const a = mol.atoms[atomId];
  return usedValence(mol, atomId) > effectiveValence(a.element, a.charge);
}

export interface AtomLabelInfo {
  /** Whether this atom shows a text label at all (vs. a bare skeletal vertex). */
  visible: boolean;
  /** The exact label text (e.g. "C", "OH", "NH2", "CH3"). */
  text: string;
}

/**
 * Single source of truth for what an atom's label looks like — used both to
 * render it (AtomView) and to know how much to shorten bonds that touch it
 * (BondView), so the two can never disagree about where the label sits.
 *
 * A charge alone does NOT force the full letter+H-count label onto a bonded
 * carbon — it's drawn as a +/- symbol next to the bare skeletal vertex
 * instead, matching conventional skeletal-formula notation. The full label
 * only appears when Show Hydrogens is on, the atom is a heteroatom, or it's
 * an isolated atom with no bonds at all (nothing else to anchor it to).
 */
export function atomLabelInfo(mol: Molecule, atomId: string, showHydrogens: boolean, forceLabel = false): AtomLabelInfo {
  const atom = mol.atoms[atomId];
  const bondCount = bondsOfAtom(mol, atomId).length;
  const hCount = implicitH(mol, atomId);
  const isCarbon = atom.element === "C";
  const isIsolated = bondCount === 0;

  const visible = forceLabel || showHydrogens || !isCarbon || isIsolated;

  let text: string = atom.element;
  if (isCarbon && isIsolated) {
    text = hCount > 0 ? `CH${hCount > 1 ? hCount : ""}` : "C";
  } else if (visible && hCount > 0) {
    text = `${atom.element}H${hCount > 1 ? hCount : ""}`;
  }

  return { visible, text };
}

/** Approximate on-screen half-width (plus a little padding) of an atom's label, in px. */
export function atomLabelRadius(mol: Molecule, atomId: string, showHydrogens: boolean, forceLabel = false): number {
  const { visible, text } = atomLabelInfo(mol, atomId, showHydrogens, forceLabel);
  if (!visible) return 0;
  return 7 + text.length * 3.6;
}

/** Hill-system-ish molecular formula string (C, H, then the rest alphabetically). */
export function computeFormula(mol: Molecule): string {
  const counts: Record<string, number> = {};
  const add = (el: string, n: number) => { counts[el] = (counts[el] || 0) + n; };
  for (const id in mol.atoms) {
    const a = mol.atoms[id];
    add(a.element, 1);
    add("H", implicitH(mol, id));
  }
  if (Object.keys(counts).length === 0) return "";

  const sub = (n: number) => (n > 1 ? String(n) : "");
  const parts: string[] = [];
  if (counts.C) {
    parts.push(`C${sub(counts.C)}`);
    if (counts.H) parts.push(`H${sub(counts.H)}`);
  } else if (counts.H) {
    parts.push(`H${sub(counts.H)}`);
  }
  const rest = Object.keys(counts).filter((e) => e !== "C" && e !== "H").sort();
  for (const el of rest) parts.push(`${el}${sub(counts[el])}`);
  return parts.join("");
}
