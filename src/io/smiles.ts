import type { BondOrder, Molecule } from "../types/chemistry";
import { findConnectedFragments, implicitH, neighborIds } from "../model/valence";

/**
 * Elements SMILES lets you write bare (no brackets), with implicit-hydrogen
 * counts a parser infers from standard valence — matches this app's own
 * VALENCE table for exactly these elements, so a plain, uncharged,
 * standard-isotope atom of one of these can always skip the bracket form.
 * Everything else (Si, charged atoms, isotopes, and — see exportSmiles's
 * doc comment — abbreviated groups) needs bracket notation instead.
 */
const ORGANIC_SUBSET = new Set(["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I"]);

function bondSymbol(order: BondOrder): string {
  return order === 2 ? "=" : order === 3 ? "#" : "";
}

function atomToken(mol: Molecule, id: string): string {
  const a = mol.atoms[id];
  if (a.group) {
    // Abbreviated groups (Ph, Boc, ...) only exist in this app as a single
    // labeled vertex with a formula for weight/formula purposes — there's
    // no actual stored substructure to expand into real SMILES atoms. `*`
    // is SMILES's standard wildcard atom, so this stays valid SMILES
    // rather than asserting a structure we don't actually have.
    return "*";
  }

  const needsBracket = !ORGANIC_SUBSET.has(a.element) || a.charge !== 0 || !!a.isotope;
  if (!needsBracket) return a.element;

  const h = implicitH(mol, id);
  const hPart = h > 0 ? `H${h > 1 ? h : ""}` : "";
  const chargePart = a.charge === 0 ? "" : a.charge === 1 ? "+" : a.charge === -1 ? "-" : a.charge > 0 ? `+${a.charge}` : `${a.charge}`;
  const isotopePart = a.isotope ? String(a.isotope) : "";
  return `[${isotopePart}${a.element}${hPart}${chargePart}]`;
}

function ringClosureToken(digit: number): string {
  return digit <= 9 ? String(digit) : `%${digit}`;
}

/** Writes one connected fragment as a SMILES string, via a DFS spanning
 * tree with ring-closure digits for any non-tree ("back") edges. */
function writeFragment(mol: Molecule, atomIds: string[]): string {
  const idSet = new Set(atomIds);
  const visited = new Set<string>();
  const children = new Map<string, { id: string; order: BondOrder }[]>();
  const visitOrder = new Map<string, number>();
  const backEdges: { a: string; b: string; order: BondOrder }[] = [];
  let order = 0;

  // Pass 1: DFS spanning tree + back-edge (ring closure) discovery. A
  // neighbor that's already visited (and isn't the edge we just came from)
  // is, by construction of an undirected DFS, always discovered from
  // exactly one side (the side visited later) — so each physical ring
  // bond ends up recorded as a back-edge exactly once here.
  function dfs(u: string, cameFromBondPartner: string | null) {
    visited.add(u);
    visitOrder.set(u, order++);
    children.set(u, []);
    let skippedParent = false;
    for (const v of neighborIds(mol, u)) {
      if (!idSet.has(v)) continue;
      if (!skippedParent && v === cameFromBondPartner) { skippedParent = true; continue; }
      const bond = bondBetween(mol, u, v);
      if (!bond) continue;
      if (!visited.has(v)) {
        children.get(u)!.push({ id: v, order: bond.order });
        dfs(v, u);
      } else if (visitOrder.get(v)! < visitOrder.get(u)!) {
        // v is an ancestor/earlier atom, and this edge isn't the tree edge
        // to our immediate parent — a genuine ring closure.
        backEdges.push({ a: u, b: v, order: bond.order });
      }
    }
  }
  dfs(atomIds[0], null);
  // Every id in this fragment is connected by construction (fragments come
  // from findConnectedFragments), so a single dfs() call covers it all.

  const digitOf = new Map<string, number>(); // `${a}|${b}` -> digit, for each back-edge
  backEdges.forEach((be, i) => {
    const digit = i + 1;
    digitOf.set(`${be.a}|${be.b}`, digit);
    digitOf.set(`${be.b}|${be.a}`, digit);
  });
  // Which of a back-edge's two atoms is visited later — that's where the
  // bond-order symbol (if not a plain single bond) gets written, matching
  // the one atom whose token we haven't already emitted by the time we
  // reach it a second time conceptually (both ends just print the digit;
  // only one end needs the symbol, and either would be valid — the later
  // one keeps the symbol next to the atom that "completes" the ring).
  const closingAtomOf = new Map<string, { order: BondOrder }>(); // atomId -> only set for the later endpoint
  for (const be of backEdges) {
    const laterId = visitOrder.get(be.a)! > visitOrder.get(be.b)! ? be.a : be.b;
    closingAtomOf.set(`${laterId}|${be.a}|${be.b}`, { order: be.order });
  }

  function ringDigitsFor(u: string): string {
    let s = "";
    for (const be of backEdges) {
      if (be.a !== u && be.b !== u) continue;
      const digit = digitOf.get(`${be.a}|${be.b}`)!;
      const isLater = closingAtomOf.has(`${u}|${be.a}|${be.b}`);
      s += (isLater ? bondSymbol(be.order) : "") + ringClosureToken(digit);
    }
    return s;
  }

  function emit(u: string): string {
    let s = atomToken(mol, u) + ringDigitsFor(u);
    const kids = children.get(u)!;
    kids.forEach((kid, i) => {
      const branch = bondSymbol(kid.order) + emit(kid.id);
      s += i < kids.length - 1 ? `(${branch})` : branch;
    });
    return s;
  }

  return emit(atomIds[0]);
}

function bondBetween(mol: Molecule, a: string, b: string) {
  for (const bond of Object.values(mol.bonds)) {
    if ((bond.a1 === a && bond.a2 === b) || (bond.a1 === b && bond.a2 === a)) return bond;
  }
  return null;
}

/**
 * Converts the drawn molecule into a SMILES string. Each disconnected
 * fragment (see findConnectedFragments — the same split the formula
 * display uses) is written separately and joined with "." (SMILES's own
 * convention for unconnected components, e.g. salts or, here, a reaction
 * scheme's separate molecules), left-to-right in drawing order.
 *
 * Scope/limitations, kept deliberately simple and honest rather than
 * silently wrong:
 *  - Bond orders are written exactly as drawn (Kekulé form) rather than
 *    perceiving aromaticity and switching to lowercase aromatic atoms —
 *    Kekulé SMILES is standard, fully valid SMILES, so this loses nothing
 *    a parser needs, it just isn't the lowercase spelling.
 *  - No stereo descriptors (no @/@@ tetrahedral marks, no /\ double-bond
 *    geometry) are produced — deriving those correctly from 2D wedges/
 *    dashes and geometry is substantial its own project, and getting it
 *    subtly wrong would silently mislabel a structure (the same reasoning
 *    the R/S label tool's own doc comment gives for why that's a manually
 *    asserted label rather than a computed one).
 *  - An abbreviated-group vertex (Ph, Boc, ...) has no stored substructure
 *    to expand, so it's written as `*`, SMILES's standard wildcard atom,
 *    rather than asserting a structure that isn't actually there.
 */
export function exportSmiles(mol: Molecule): string {
  const fragments = findConnectedFragments(mol);
  return fragments.map((ids) => writeFragment(mol, ids)).filter(Boolean).join(".");
}
