import type { Bond, BondOrder, Molecule } from "../types/chemistry";
import { bondsOfAtom, findConnectedFragments, implicitH, neighborIds } from "../model/valence";

/**
 * Elements SMILES lets you write bare (no brackets), with implicit-hydrogen
 * counts a parser infers from standard valence — matches this app's own
 * VALENCE table for exactly these elements, so a plain, uncharged,
 * standard-isotope atom of one of these can always skip the bracket form.
 * Everything else (Si, charged atoms, isotopes, chiral atoms, and — see
 * exportSmiles's doc comment — abbreviated groups) needs bracket notation
 * instead.
 */
const ORGANIC_SUBSET = new Set(["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I"]);

function bondSymbol(order: BondOrder): string {
  return order === 2 ? "=" : order === 3 ? "#" : "";
}

function atomToken(mol: Molecule, id: string, chiral: "@" | "@@" | undefined): string {
  const a = mol.atoms[id];
  if (a.group) {
    // Abbreviated groups (Ph, Boc, ...) only exist in this app as a single
    // labeled vertex with a formula for weight/formula purposes — there's
    // no actual stored substructure to expand into real SMILES atoms. `*`
    // is SMILES's standard wildcard atom, so this stays valid SMILES
    // rather than asserting a structure we don't actually have.
    return "*";
  }

  const needsBracket = !ORGANIC_SUBSET.has(a.element) || a.charge !== 0 || !!a.isotope || !!chiral;
  if (!needsBracket) return a.element;

  const h = implicitH(mol, id);
  const hPart = h > 0 ? `H${h > 1 ? h : ""}` : "";
  const chargePart = a.charge === 0 ? "" : a.charge === 1 ? "+" : a.charge === -1 ? "-" : a.charge > 0 ? `+${a.charge}` : `${a.charge}`;
  const isotopePart = a.isotope ? String(a.isotope) : "";
  return `[${isotopePart}${a.element}${chiral ?? ""}${hPart}${chargePart}]`;
}

function ringClosureToken(digit: number): string {
  return digit <= 9 ? String(digit) : `%${digit}`;
}

function bondBetween(mol: Molecule, a: string, b: string): Bond | null {
  for (const bond of Object.values(mol.bonds)) {
    if ((bond.a1 === a && bond.a2 === b) || (bond.a1 === b && bond.a2 === a)) return bond;
  }
  return null;
}

/**
 * Which tree-edge single bonds adjacent to a stereo-relevant double bond
 * need a "/" or "\" direction character in place of their normal (blank)
 * single-bond symbol, and which character — SMILES's cis/trans notation.
 *
 * The geometry test itself is simple (which side of the double bond's axis
 * a substituent falls on, via a 2D cross product), but which literal
 * character encodes that depends on whether the substituent is written
 * *before* the double-bond atom (its DFS parent — the char sits between
 * them, "sub/atom") or *after* it (a DFS child — "atom/sub"), since SMILES
 * direction symbols are read left-to-right like literal slashes. Both
 * halves of that mapping (side -> character, per writing direction) were
 * derived by hand against the two textbook examples (F/C=C/F = trans,
 * F/C=C\F = cis) and then verified against RDKit's independent 2D+wedge
 * stereo perception (via this app's own molfile export, which doesn't
 * need any of this — double-bond geometry there is just the 2D
 * coordinates directly) across a battery of generated test molecules.
 *
 * Deliberately conservative about when to mark anything at all:
 *  - a double bond that's itself a ring-closure back-edge (rather than a
 *    tree edge), or a substituent reached only via a ring closure, or one
 *    exactly collinear with the double bond, is left unmarked;
 *  - a double bond that's *part of* a ring at all (its two atoms still
 *    connect via some other path once it's removed) never gets marked,
 *    matching standard SMILES writers — a small/medium ring's geometry
 *    makes the configuration structurally fixed rather than a free
 *    choice worth encoding (there's no way to draw *trans*-cyclopentene),
 *    and RDKit itself simply discards a direction mark here as
 *    meaningless rather than erroring, which is exactly the kind of
 *    silently-ignored clutter worth not emitting in the first place;
 *  - a double bond where either end has zero real substituents (a
 *    terminal =O or =NH with nothing else attached) never gets marked —
 *    with nothing on that side to be cis/trans *relative to*, a mark on
 *    the other side alone doesn't encode real stereochemistry either.
 * Encoding only some of a molecule's double-bond stereo is honest;
 * encoding all of it incorrectly, or encoding marks that don't actually
 * mean anything, is not.
 */
function computeDoubleBondStereo(mol: Molecule, children: Map<string, { id: string; order: BondOrder }[]>): Map<string, "/" | "\\"> {
  const result = new Map<string, "/" | "\\">();
  const isTreeEdge = (u: string, v: string) => (children.get(u) ?? []).some((k) => k.id === v);

  // Is `bond` a ring bond — do its two atoms still connect via some other
  // path once this bond itself is excluded? A plain BFS/DFS over the rest
  // of the graph (this is the standard graph-theory "bridge" test, just
  // inverted: an edge that's *not* a bridge is a ring/cycle edge).
  function connectsWithoutBond(mol: Molecule, skipBondId: string, from: string, to: string): boolean {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const u = queue.shift()!;
      if (u === to) return true;
      for (const bb of Object.values(mol.bonds)) {
        if (bb.id === skipBondId) continue;
        const v = bb.a1 === u ? bb.a2 : bb.a2 === u ? bb.a1 : null;
        if (v && !seen.has(v)) { seen.add(v); queue.push(v); }
      }
    }
    return false;
  }

  for (const bond of Object.values(mol.bonds)) {
    if (bond.order !== 2) continue;
    let b: string, c: string;
    if (isTreeEdge(bond.a1, bond.a2)) { b = bond.a1; c = bond.a2; }
    else if (isTreeEdge(bond.a2, bond.a1)) { b = bond.a2; c = bond.a1; }
    else continue; // the double bond itself is a ring-closure edge

    if (connectsWithoutBond(mol, bond.id, b, c)) continue; // part of a ring

    const bAtom = mol.atoms[b], cAtom = mol.atoms[c];
    const axisX = cAtom.x - bAtom.x, axisY = cAtom.y - bAtom.y;
    if (Math.hypot(axisX, axisY) < 1e-6) continue; // coincident atoms, shouldn't happen

    // Collect usable (tree-edge, non-collinear, single-bond) substituents
    // for each side before marking anything — a side with none means
    // there's nothing for the other side to be cis/trans relative to.
    const usable: { y: string; x: string; side: 1 | -1; childOfY: boolean }[] = [];
    for (const y of [b, c]) {
      const yAtom = mol.atoms[y];
      let sideHasAny = false;
      for (const x of neighborIds(mol, y)) {
        if (x === b || x === c) continue;
        const sBond = bondBetween(mol, y, x);
        if (!sBond || sBond.order !== 1) continue;
        const childOfY = isTreeEdge(y, x);
        const parentOfY = isTreeEdge(x, y);
        if (!childOfY && !parentOfY) continue; // reached only via ring closure

        const xAtom = mol.atoms[x];
        const cr = axisX * (xAtom.y - yAtom.y) - axisY * (xAtom.x - yAtom.x);
        if (Math.abs(cr) < 1e-6) continue; // collinear with the double bond
        usable.push({ y, x, side: cr > 0 ? 1 : -1, childOfY });
        sideHasAny = true;
      }
      if (!sideHasAny) { usable.length = 0; break; }
    }

    for (const { y, x, side, childOfY } of usable) {
      const writtenForward = childOfY; // x is emitted after y (y/x tree order)
      const char: "/" | "\\" = writtenForward
        ? (side === 1 ? "\\" : "/")
        : (side === 1 ? "/" : "\\");
      const key = writtenForward ? `${y}|${x}` : `${x}|${y}`;
      result.set(key, char);
    }
  }
  return result;
}

interface P3 { x: number; y: number; z: number }

/** Signed volume of the tetrahedron [p1-p0, p2-p0, p3-p0] — positive and
 * negative correspond to the two possible neighbor-orderings' handedness;
 * which literal sign maps to "@" vs "@@" was determined empirically
 * against RDKit (see computeChiralTags's doc comment) rather than
 * asserted from memory of the spec's wording. */
function signedVolume(p0: P3, p1: P3, p2: P3, p3: P3): number {
  const ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.z - p0.z;
  const bx = p2.x - p0.x, by = p2.y - p0.y, bz = p2.z - p0.z;
  const cx = p3.x - p0.x, cy = p3.y - p0.y, cz = p3.z - p0.z;
  return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
}

/**
 * Which atoms get a "@"/"@@" tetrahedral tag, from their wedge/dash bond
 * plus 2D layout — SMILES's stereo notation doesn't require knowing CIP
 * priority (R/S) at all, just the neighbors' geometric handedness in a
 * specific reading order; a parser (or PubChem, when this feeds the IUPAC
 * naming feature) works out R/S from that independently.
 *
 * Only atoms with exactly one wedge/dash bond among 3-4 total plain
 * (single-bond) connections qualify — multiple wedge/dash bonds on one
 * atom, a wavy (explicitly unspecified) bond, or a double bond on the
 * same atom are all left untagged rather than guessed at.
 *
 * The SMILES neighbor order this is computed against — [DFS parent, if
 * any], [implicit H, if any], [ring-closure partners in digit order],
 * [DFS children in branch order] — mirrors exactly how writeFragment
 * actually emits this atom's bonds left-to-right.
 *
 * An implicit H has no real 2D position of its own, so one is inferred:
 * minus the sum of the other substituents' offsets from the center (xy
 * and z, where z is +1/-1 for the one explicit wedge/dash bond and 0 for
 * the rest) — the standard "the unshown 4th substituent completes the
 * tetrahedron on the far side" placement. A simpler first attempt (H at
 * the center's own (x, y), only z offset) turned out to be blind to
 * *which* explicit neighbor had the wedge/dash in symmetric-ish layouts,
 * silently producing the same answer regardless — this sum-based version
 * doesn't have that problem, at the cost of degenerating (skipped,
 * tagged null) for a genuinely symmetric or exactly-collinear
 * arrangement of the other substituents, which turns out to coincide
 * exactly with when a real 2D depiction is itself ambiguous about the
 * configuration (verified: RDKit's own molfile-based perception declines
 * to assign parity for the same geometries too, not just this code).
 *
 * The whole ordering + placement scheme, and the sign convention mapping
 * a positive/negative signed volume to "@"/"@@", were both determined
 * empirically against RDKit's independent 2D-molfile stereo perception
 * (this app's own molfile export encodes the identical wedge/dash +
 * coordinates, needing none of this reasoning — it's the ground truth
 * this was checked against) across a battery of generated test
 * molecules: root and non-root stereocenters, a ring stereocenter,
 * multiple independent stereocenters, 3-explicit-plus-implicit-H and
 * full 4-explicit cases, and a position sweep isolating which of three
 * substituents carries the wedge on an otherwise-identical triangle.
 */
function computeChiralTags(
  mol: Molecule,
  children: Map<string, { id: string; order: BondOrder }[]>,
  parentOf: Map<string, string | null>,
  backEdges: { a: string; b: string; order: BondOrder }[],
): Map<string, "@" | "@@"> {
  const result = new Map<string, "@" | "@@">();

  for (const id of Object.keys(mol.atoms)) {
    const a = mol.atoms[id];
    if (a.group) continue;
    const bonds = bondsOfAtom(mol, id);
    if (bonds.length < 3 || bonds.length > 4) continue;
    if (bonds.some((b) => b.order !== 1)) continue;
    if (bonds.some((b) => b.stereo === "wavy")) continue;
    const stereoBonds = bonds.filter((b) => b.stereo === "wedge" || b.stereo === "dash");
    if (stereoBonds.length !== 1) continue;

    const stereoBond = stereoBonds[0];
    const stereoNeighborId = stereoBond.a1 === id ? stereoBond.a2 : stereoBond.a1;
    const stereoZ = stereoBond.stereo === "wedge" ? 1 : -1;

    const orderedIds: string[] = [];
    const parent = parentOf.get(id);
    if (parent) orderedIds.push(parent);
    const hCount = implicitH(mol, id);
    if (hCount === 1 && bonds.length === 3) orderedIds.push("__H__");
    for (const be of backEdges) {
      if (be.a === id) orderedIds.push(be.b);
      else if (be.b === id) orderedIds.push(be.a);
    }
    for (const kid of children.get(id) ?? []) orderedIds.push(kid.id);

    if (orderedIds.length !== 4) continue; // didn't line up to a clean tetrahedron — skip

    const centerAtom = mol.atoms[id];
    const hSlot = orderedIds.indexOf("__H__");
    let tag: "@" | "@@" | null = null;
    let hPoint: P3 | null = null;
    let degenerate = false;
    if (hSlot !== -1) {
      // Inferred position for an implicit H: minus the sum of the other
      // explicit substituents' offsets from the center (xy and z alike)
      // — the standard "completes the tetrahedron on the opposite side"
      // placement. Degenerates (sums to ~0) for a perfectly symmetric
      // arrangement of the other substituents, which is rare enough in
      // real drawings to just skip rather than guess.
      let sx = 0, sy = 0, sz = 0;
      for (const oid of orderedIds) {
        if (oid === "__H__") continue;
        const o = mol.atoms[oid];
        const oz = oid === stereoNeighborId ? stereoZ : 0;
        sx += o.x - centerAtom.x;
        sy += o.y - centerAtom.y;
        sz += oz;
      }
      if (Math.hypot(sx, sy, sz) < 1e-6) degenerate = true;
      else hPoint = { x: centerAtom.x - sx, y: centerAtom.y - sy, z: -sz };
    }
    if (!degenerate) {
      const points: P3[] = orderedIds.map((nid) => {
        if (nid === "__H__") return hPoint!;
        const z = nid === stereoNeighborId ? stereoZ : 0;
        const n = mol.atoms[nid];
        return { x: n.x, y: n.y, z };
      });
      const vol = signedVolume(points[0], points[1], points[2], points[3]);
      tag = Math.abs(vol) < 1e-9 ? null : vol > 0 ? "@" : "@@";
    }

    if (tag) result.set(id, tag);
  }

  return result;
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

  const parentOf = new Map<string, string | null>();
  parentOf.set(atomIds[0], null);
  for (const [u, kids] of children) {
    for (const kid of kids) parentOf.set(kid.id, u);
  }

  const doubleBondChar = computeDoubleBondStereo(mol, children);
  const chiralTag = computeChiralTags(mol, children, parentOf, backEdges);

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
    let s = atomToken(mol, u, chiralTag.get(u)) + ringDigitsFor(u);
    const kids = children.get(u)!;
    kids.forEach((kid, i) => {
      const bondChar = doubleBondChar.get(`${u}|${kid.id}`) ?? bondSymbol(kid.order);
      const branch = bondChar + emit(kid.id);
      s += i < kids.length - 1 ? `(${branch})` : branch;
    });
    return s;
  }

  return emit(atomIds[0]);
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
 *  - Stereo descriptors ARE produced from wedge/dash bonds and 2D
 *    geometry — tetrahedral "@"/"@@" (see computeChiralTags) and
 *    double-bond "/"/"\\" cis/trans (see computeDoubleBondStereo) — but
 *    only where the drawing unambiguously implies them; anything
 *    geometrically unclear (collinear substituents, multiple wedges on
 *    one atom, a stereo-relevant bond that's a ring closure rather than a
 *    tree edge) is left unmarked rather than guessed at. Both were
 *    validated against RDKit's independent stereo perception of this
 *    app's own molfile export (io/molfile.ts) — the same wedge/dash +
 *    coordinates, interpreted a completely different way — across a
 *    battery of generated test molecules.
 *  - An abbreviated-group vertex (Ph, Boc, ...) has no stored substructure
 *    to expand, so it's written as `*`, SMILES's standard wildcard atom,
 *    rather than asserting a structure that isn't actually there.
 */
export function exportSmiles(mol: Molecule): string {
  const fragments = findConnectedFragments(mol);
  return fragments.map((ids) => writeFragment(mol, ids)).filter(Boolean).join(".");
}
