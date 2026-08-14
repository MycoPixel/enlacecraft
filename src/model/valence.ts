import type { Atom, Element, Molecule } from "../types/chemistry";
import { VALENCE, ATOMIC_WEIGHT, ABBREVIATED_GROUPS, ISOTOPE_PRESETS } from "./constants";
import { angleOf, largestGapAngle } from "./geometry";

const GROUP_BY_ID = Object.fromEntries(ABBREVIATED_GROUPS.map((g) => [g.id, g]));
const ISOTOPE_BY_ELEMENT_MASS = new Map(ISOTOPE_PRESETS.map((p) => [`${p.element}:${p.massNumber}`, p]));

/** Tokenizes a simple formula string ("C5H9O2") into element counts. Only
 * handles the flat "symbol then optional count" shape our own
 * ABBREVIATED_GROUPS registry uses — no parentheses/nesting needed since we
 * control every string that ever gets parsed here. */
function parseSimpleFormula(formula: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula))) {
    const [, el, numStr] = m;
    if (!el) continue;
    counts[el] = (counts[el] || 0) + (numStr ? parseInt(numStr, 10) : 1);
  }
  return counts;
}

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

/** True when this atom has a bond heading roughly east (within ~60° of due
 * right) — used to flip label content that would otherwise sit on top of
 * that bond over to the atom's other side instead. Shared by the implicit-H
 * suffix (AtomView) and multi-character group-label anchoring below, since
 * both are really the same problem: something reads left-to-right starting
 * at the atom, so it needs to know which side is actually clear. */
export function hasEastBond(mol: Molecule, atomId: string): boolean {
  return neighborAngles(mol, atomId).some((a) => Math.cos(a) > 0.5);
}

export type HSuffixPlacement = "right" | "left" | "top" | "bottom";

/** Which side of the atom the implicit-H suffix ("H" in "OH", "NH", "NH2",
 * ...) should render on, so it lands in whatever open space actually
 * exists instead of assuming the conventional right (or east-flipped-to-
 * left) slot is free. That old east-only check works fine for a terminal
 * heteroatom - one bond leaves ~300° of open space opposite it, which is
 * still overwhelmingly left- or right-ish in a normal zigzag chain - but
 * falls apart for a *bridging* heteroatom like an interior chain's -NH-,
 * which has bonds on both its left and right (e.g. one up-right, one
 * down-left in a zigzag) and no clear horizontal opening at all. This
 * finds the single widest open gap among all of the atom's bonds and
 * only then decides whether that gap is closer to horizontal (render
 * right/left, same as before) or closer to vertical (render top/bottom
 * instead, dropping the suffix into whichever of those is actually free -
 * e.g. below the N at the bottom of a "V" in the chain). Ties toward
 * horizontal, since that's the more familiar-looking rendering whenever
 * it's genuinely just as open as the vertical option. */
export function hSuffixPlacement(mol: Molecule, atomId: string): HSuffixPlacement {
  const angles = neighborAngles(mol, atomId);
  if (angles.length === 0) return "right";
  // Only fall back to a vertical (top/bottom) placement when bonds
  // genuinely box in *both* horizontal sides - the bridging-atom case
  // this function was written for (an interior chain's -NH-, with one
  // bond up-right and one down-left, leaving no horizontal opening at
  // all). A terminal atom - just one bond, e.g. methanol's -OH - always
  // has an entire free half open even when that one bond happens to be
  // drawn dead vertical (cos ~ 0, so it counts as neither east nor
  // west): the "largest gap" in that case is mathematically straight up,
  // but stacking the H above the O reads badly and isn't how anyone
  // actually draws it - horizontal ("OH") is still correct there, same
  // as if the bond were merely close to vertical rather than exactly on
  // it. So: check for real east/west bonds first, and only hand off to
  // the gap-based vertical logic when both are present.
  const hasEast = angles.some((a) => Math.cos(a) > 0.5);
  const hasWest = angles.some((a) => Math.cos(a) < -0.5);
  if (!(hasEast && hasWest)) {
    return hasEast ? "left" : "right";
  }
  const center = largestGapAngle(angles);
  const cos = Math.cos(center);
  const sin = Math.sin(center);
  if (Math.abs(cos) >= Math.abs(sin)) {
    return cos < 0 ? "left" : "right";
  }
  // Screen/SVG y grows downward, so a positive sin means the open gap
  // points down.
  return sin < 0 ? "top" : "bottom";
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
function applyChargeToBase(base: number, el: keyof typeof VALENCE, charge: number): number {
  if (el === "C" || el === "Si" || el === "B") {
    return Math.max(0, base - Math.abs(charge));
  }
  return Math.max(0, base + charge);
}

export function effectiveValence(el: keyof typeof VALENCE, charge: number): number {
  return applyChargeToBase(VALENCE[el] ?? 0, el, charge);
}

/**
 * A few elements routinely appear at more than one standard valence
 * depending on oxidation state, not just VALENCE's single (lowest, most
 * common) number: sulfur as a plain thioether/thiol (2), a sulfoxide (4),
 * or a sulfone/sulfonyl/sulfonate (6); phosphorus as a phosphine (3) or a
 * phosphate/phosphonium-like pentavalent center (5). Order matters here —
 * resolvedValence below picks the *smallest* candidate that still covers
 * however many bonds are actually drawn, so a plain -S- still reads as
 * divalent (matching VALENCE.S) while the same element with two S=O
 * bonds on it reads as hexavalent instead of being flagged as an invalid
 * structure.
 */
const EXPANDED_VALENCES: Partial<Record<Element, number[]>> = {
  S: [2, 4, 6],
  P: [3, 5],
};

/** Like effectiveValence, but for EXPANDED_VALENCES elements picks
 * whichever charge-adjusted candidate valence actually fits `used` (the
 * bond-order sum already drawn) instead of always the lowest one. Every
 * other element falls straight through to the ordinary single-valence
 * effectiveValence. If `used` exceeds even the largest candidate, returns
 * that largest one anyway — a genuinely over-valent atom (e.g. a 7-bonded
 * sulfur) still gets flagged, just against the right ceiling. */
function resolvedValence(el: Element, charge: number, used: number): number {
  const candidates = EXPANDED_VALENCES[el];
  if (!candidates) return effectiveValence(el, charge);
  const adjusted = candidates.map((base) => applyChargeToBase(base, el, charge));
  return adjusted.find((v) => v >= used) ?? adjusted[adjusted.length - 1];
}

export function usedValence(mol: Molecule, atomId: string): number {
  return bondsOfAtom(mol, atomId).reduce((sum, b) => sum + b.order, 0);
}

/**
 * Total hydrogens actually attached to this atom as drawn — implicit
 * (see implicitH) plus any explicit H atoms bonded to it as their own
 * atom. Used to sanity-check an external tool's claim that some number
 * of protons belong to a given atom (e.g. an NMR prediction service's
 * atom_index) against what's actually structurally possible here — an
 * ether oxygen or a fully-substituted quaternary carbon can never
 * legitimately have H1 shifts attributed to it, so a mismatch there is
 * a reliable, unambiguous sign of an atom-identification problem
 * upstream (a stale/incorrect index mapping, or the service re-deriving
 * a different atom order internally) rather than real chemistry -
 * unlike an unusual-but-real shift *value*, which this can't and
 * shouldn't try to judge.
 */
export function totalHydrogenCount(mol: Molecule, atomId: string): number {
  const explicit = bondsOfAtom(mol, atomId).filter((b) => {
    const otherId = b.a1 === atomId ? b.a2 : b.a1;
    return mol.atoms[otherId]?.element === "H";
  }).length;
  return implicitH(mol, atomId) + explicit;
}

export function implicitH(mol: Molecule, atomId: string): number {
  const a = mol.atoms[atomId];
  // A group atom (e.g. "Boc") is a fixed, already-complete substituent —
  // its single bond fully accounts for its one attachment point, so there's
  // no implicit-hydrogen filling to do (see ABBREVIATED_GROUPS doc comment).
  if (a.group) return 0;
  // Elements with no VALENCE entry (most transition metals, lanthanides,
  // actinides — see VALENCE's doc comment) have genuinely variable
  // bonding, so there's no sensible fixed number of implicit H to add.
  if (VALENCE[a.element] === undefined) return 0;
  const used = usedValence(mol, atomId);
  const eff = resolvedValence(a.element, a.charge, used);
  return Math.max(0, eff - used);
}

export function isOverValent(mol: Molecule, atomId: string): boolean {
  const a = mol.atoms[atomId];
  if (a.group) return false;
  if (a.ignoreValence) return false;
  if (VALENCE[a.element] === undefined) return false;
  const used = usedValence(mol, atomId);
  return used > resolvedValence(a.element, a.charge, used);
}

/**
 * True if anything in the molecule has valence-checking deliberately
 * turned off (see Atom.ignoreValence's doc comment) — e.g. a 5-bonded
 * transition-state carbon. PubChem/IUPAC naming, the NMR predictor, and
 * the 3D viewer all check this before running: each of them needs a
 * structure that means something under normal valence rules (naming and
 * NMR prediction go through PubChem/RDKit-style tooling that expects a
 * real molecule; the 3D viewer's MMFF94 geometry optimizer has no
 * meaningful force-field parameters for a deliberately-invalid bonding
 * pattern), so asking them to handle an atom that was intentionally
 * drawn "wrong" would silently produce a meaningless result rather than
 * a useful one.
 */
export function hasIgnoredValenceAtoms(mol: Molecule): boolean {
  return Object.values(mol.atoms).some((a) => a.ignoreValence);
}

export interface AtomLabelInfo {
  /** Whether this atom shows a text label at all (vs. a bare skeletal vertex). */
  visible: boolean;
  /** Just the element/isotope/group symbol (e.g. "C", "O", "N", "CH3" for a
   * group) — this is what's centered exactly on the atom's true (x, y), so
   * anything else anchored to the atom (a bond, a lone pair, a charge
   * badge) stays visually aligned with it. Does NOT include the implicit-H
   * suffix below — see that field's doc comment for why they're kept
   * separate. */
  text: string;
  /** The implicit-hydrogen suffix (e.g. "H" before "OH", "H2" before
   * "NH2"), shown right after `text` but deliberately NOT merged into it.
   * A combined string like "NH" centered as one block would put the
   * visual middle of the whole label — and so the "N" glyph itself —
   * noticeably left of the atom's actual (x, y), while bonds and lone
   * pairs are (correctly) still centered on the real coordinate. That
   * mismatch is exactly what made a lone pair on an aromatic N-H look
   * like it was rotating around "the whole NH" instead of sitting
   * straight above the N: the pair was right, the label's anchor wasn't.
   * Keeping this as its own suffix, rendered starting just after `text`
   * instead of centered with it, keeps the visible element symbol lined
   * up with everything else that's anchored to the atom. */
  hSuffix?: string;
  /** Superscript mass-number prefix shown before `text` (e.g. "13" before
   * "C") — only for isotopes without their own conventional symbol; D/T
   * are folded directly into `text` instead, since they're always written
   * as a plain "D"/"T", never as a superscript-prefixed "H". */
  isotopePrefix?: string;
}

/**
 * Single source of truth for what an atom's label looks like — used both to
 * render it (AtomView) and to know how much to shorten bonds that touch it
 * (BondView), so the two can never disagree about where the label sits.
 *
 * A charge alone does NOT force the full letter+H-count label onto a bonded
 * carbon — it's drawn as a +/- symbol next to the bare skeletal vertex
 * instead, matching conventional skeletal-formula notation. The full label
 * only appears when Show Hydrogens is on, the atom is a heteroatom, an
 * isotope label is set, or it's an isolated atom with no bonds at all
 * (nothing else to anchor it to).
 */
export function atomLabelInfo(mol: Molecule, atomId: string, showHydrogens: boolean, forceLabel = false): AtomLabelInfo {
  const atom = mol.atoms[atomId];
  if (atom.group) {
    return { visible: true, text: GROUP_BY_ID[atom.group]?.label ?? atom.group };
  }

  const isotopePreset = atom.isotope ? ISOTOPE_BY_ELEMENT_MASS.get(`${atom.element}:${atom.isotope}`) : undefined;
  const hasOwnSymbol = isotopePreset?.id === "D" || isotopePreset?.id === "T";
  const displayElement = hasOwnSymbol ? isotopePreset!.label : atom.element;

  const bondCount = bondsOfAtom(mol, atomId).length;
  const hCount = implicitH(mol, atomId);
  const isCarbon = atom.element === "C";
  const isIsolated = bondCount === 0;

  const visible = forceLabel || showHydrogens || !isCarbon || isIsolated || !!isotopePreset;

  let text: string = displayElement;
  let hSuffix: string | undefined;
  if (isCarbon && isIsolated) {
    if (hCount > 0) hSuffix = `H${hCount > 1 ? hCount : ""}`;
  } else if (visible && hCount > 0) {
    hSuffix = `H${hCount > 1 ? hCount : ""}`;
  }

  const isotopePrefix = isotopePreset && !hasOwnSymbol ? String(isotopePreset.massNumber) : undefined;
  return { visible, text, hSuffix, isotopePrefix };
}

/** Approximate on-screen half-width (plus a little padding) of an atom's label, in px. */
export function atomLabelRadius(mol: Molecule, atomId: string, showHydrogens: boolean, forceLabel = false): number {
  const { visible, text, isotopePrefix } = atomLabelInfo(mol, atomId, showHydrogens, forceLabel);
  if (!visible) return 0;
  if (mol.atoms[atomId]?.group) {
    // Group labels ("COOH", "OMe", ...) are anchored to whichever end
    // sits nearest the bond (see AtomView), not centered on the atom
    // like a plain element symbol - so the bond only ever needs to
    // clear that one near character, regardless of how long the rest
    // of the label is.
    return 11;
  }
  const prefixWidth = isotopePrefix ? isotopePrefix.length * 2.6 : 0;
  // Deliberately sized off the element symbol alone, not the implicit-H
  // suffix ("OH", "NH2", ...) — the suffix only renders out to one side
  // (see AtomView), so folding its length into this radius inflated the
  // bond-clearance gap in *every* direction, making a real bond on the
  // non-H side stop visibly far from the atom, as if the symbol had
  // drifted toward the H. Real bonds essentially never approach from the
  // suffix's side, so there's nothing to protect there in practice.
  return 7 + text.length * 3.6 + prefixWidth;
}

/** Hill-system-ish molecular formula string (C, H, then the rest
 * alphabetically). Restricted to `atomIds` if given (still using the full
 * `mol` for each atom's real bonds/implicit-H count — only which atoms get
 * summed is restricted, not how each one's own valence is worked out). */
export function computeFormula(mol: Molecule, atomIds?: Iterable<string>): string {
  const counts: Record<string, number> = {};
  const add = (el: string, n: number) => { counts[el] = (counts[el] || 0) + n; };
  for (const id of atomIds ?? Object.keys(mol.atoms)) {
    const a = mol.atoms[id];
    if (!a) continue;
    if (a.group) {
      const formulaStr = GROUP_BY_ID[a.group]?.formula ?? a.groupFormula;
      if (formulaStr) {
        const groupCounts = parseSimpleFormula(formulaStr);
        for (const el in groupCounts) add(el, groupCounts[el]);
      }
      continue;
    }
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

/**
 * Every connected fragment of atoms in `mol` (grouped purely by bonds —
 * annotations like a reaction-scheme "+" or arrow don't connect anything),
 * ordered left-to-right by each fragment's own horizontal center so a
 * fragment-by-fragment formula readout reads in the same order the scheme
 * is drawn in (e.g. matching "A + B -> C" left to right).
 */
export function findConnectedFragments(mol: Molecule): string[][] {
  const visited = new Set<string>();
  const fragments: { ids: string[]; cx: number }[] = [];
  for (const id in mol.atoms) {
    if (visited.has(id)) continue;
    visited.add(id);
    const ids: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      ids.push(cur);
      for (const nb of neighborIds(mol, cur)) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    const cx = ids.reduce((sum, i) => sum + mol.atoms[i].x, 0) / ids.length;
    fragments.push({ ids, cx });
  }
  fragments.sort((a, b) => a.cx - b.cx);
  return fragments.map((f) => f.ids);
}

/**
 * Molecular weight (g/mol) from the same per-atom + implicit-hydrogen
 * counting computeFormula uses, so the two always agree with each other.
 * Restricted to `atomIds` if given (see computeFormula's doc comment for
 * why that doesn't change each atom's own valence workings). Returns 0 for
 * an empty canvas/selection.
 */
export function computeMolecularWeight(mol: Molecule, atomIds?: Iterable<string>): number {
  let total = 0;
  for (const id of atomIds ?? Object.keys(mol.atoms)) {
    const a = mol.atoms[id];
    if (!a) continue;
    if (a.group) {
      const formulaStr = GROUP_BY_ID[a.group]?.formula ?? a.groupFormula;
      if (formulaStr) {
        const groupCounts = parseSimpleFormula(formulaStr);
        for (const el in groupCounts) total += (ATOMIC_WEIGHT[el as keyof typeof ATOMIC_WEIGHT] ?? 0) * groupCounts[el];
      }
      continue;
    }
    const isotopePreset = a.isotope ? ISOTOPE_BY_ELEMENT_MASS.get(`${a.element}:${a.isotope}`) : undefined;
    total += isotopePreset ? isotopePreset.mass : (ATOMIC_WEIGHT[a.element] ?? 0);
    total += implicitH(mol, id) * ATOMIC_WEIGHT.H;
  }
  return total;
}

/**
 * True for a `group` atom that isn't a recognized chemical formula — a
 * generic placeholder like "R", "R'", "R1", or "X" typed via the atom
 * label editor (model/atomLabelParser.ts's "generic" case), or any
 * `group` id matching neither the ABBREVIATED_GROUPS registry nor
 * carrying its own groupFormula. Contributes nothing to formula/MW (see
 * computeFormula/computeMolecularWeight above) — this is what the info
 * popup's placeholder-label warning checks for.
 */
export function isPlaceholderLabel(atom: Atom): boolean {
  return !!atom.group && !GROUP_BY_ID[atom.group] && !atom.groupFormula;
}

/** True if any atom in `mol` carries a placeholder label — see isPlaceholderLabel. */
export function hasPlaceholderLabels(mol: Molecule): boolean {
  return Object.values(mol.atoms).some(isPlaceholderLabel);
}
