import type { Molecule, Element } from "../types/chemistry";
import { nextId } from "./id";
import { implicitH } from "./valence";

/**
 * Collapses a drawn-out fragment back into a single labeled vertex when it
 * exactly matches a known abbreviated group ("Et", "tBu", "Ph", ...) — the
 * inverse of expanding one, and what makes this app's group support behave
 * like a real superatom/nickname system rather than one-way shorthand.
 *
 * Matching is by **graph topology**, never by molecular formula. Formula is
 * tempting (every group in constants.ts carries one) and wrong: C4H9 is
 * nBu, iBu, sBu *or* tBu, and C2H5 might be one ethyl or two methyls on
 * different atoms. Collapsing the wrong one silently changes what the
 * drawing says. So each group below carries an explicit atom/bond graph and a
 * subgraph-isomorphism match decides, which can only ever produce a
 * correct answer.
 *
 * Hydrogen atoms are deliberately ignored throughout. The app's convention
 * (see README's "Known simplifications") is skeletal display with implicit
 * hydrogens, so a drawn ethyl is two bare carbon vertices with one bond
 * between them, while the template says C-C — matching must not insist the
 * hydrogens be drawn.
 */

/**
 * One template atom. `n` is the index within its own group, 0-based, and `h`
 * is how many implicit hydrogens it carries.
 *
 * The `h` count is load-bearing, not decoration. Connectivity alone cannot
 * separate the butyl isomers: n-Bu and sec-Bu are both the path graph on four
 * carbons, and i-Bu and t-Bu are both the same three-armed star. As bare
 * graphs they are indistinguishable — the difference is which carbon carries
 * the hydrogens. Matching on implicit-H count (from valence.ts's implicitH,
 * exactly the function the rest of the app uses to draw them) is what makes
 * the match chemically correct rather than merely plausible.
 */
interface TemplateAtom {
  n: number;
  element: Element;
  h: number;
}

/** A group's canonical graph. `bonds` are 0-based indices into `atoms`. */
interface GroupTemplate {
  id: string;
  label: string;
  atoms: TemplateAtom[];
  /** [from, to, order] triples, 0-based, order 1 | 2 | 3. */
  bonds: [number, number, number][];
}

/**
 * Builds a template atom list from element/implicit-H pairs, e.g.
 * `atoms("C3", "C2", "C3")` is the n-propyl skeleton CH3-CH2-CH3.
 * The digit suffix is the implicit-hydrogen count; no digit means 0.
 */
function atoms(...specs: string[]): GroupTemplate["atoms"] {
  return specs.map((spec, n) => {
    const m = /^([A-Z][a-z]?)(\d*)$/.exec(spec);
    if (!m) throw new Error(`groupCollapse: bad template atom spec "${spec}"`);
    return { n, element: m[1] as Element, h: m[2] ? parseInt(m[2], 10) : 0 };
  });
}
const links_ = links;
function links(count: number, order: 1 | 2 | 3 = 1): [number, number, number][] {
  return Array.from({ length: count }, (_, i): [number, number, number] => [i, i + 1, order]);
}

/**
 * The nickname library. Deliberately limited to groups whose topology is
 * small and unambiguous; a group whose expanded form has rotational or
 * positional isomers that don't change the topology (Ph's Kekulé arrangement,
 * say) is fine, but nothing here depends on 3D shape.
 *
 * Order matters for matches: when two templates could both match the same
 * fragment (they can't, given distinct element/bond counts, but the check is
 * cheap) the first wins.
 */
/**
 * The nickname library.
 *
 * Two rules govern the numbers here, and both are easy to get wrong:
 *
 *  1. Every group's `h` counts describe it **as a substituent**, i.e. with
 *     the attachment bond already present. So n-Bu is C3-C2-C2-C2, not
 *     C3-C2-C2-C3 (that would be butane itself, which has no free valence to
 *     be the attachment point). Getting this backwards makes groups only
 *     match isolated fragments, which is exactly backwards.
 *  2. Bond lists must describe the real connectivity, not an abbreviation
 *     that happens to read similarly. Boc is (CH3)3C-C(=O)-O-, so the
 *     carbonyl carbon bonds to *both* oxygens; an off-by-one index silently
 *     produces O-O.
 *
 * Groups whose expanded form has positional isomers that topology can't see
 * are omitted rather than guessed at.
 */
/** One Kekule form of an aromatic ring: three alternating double bonds plus
 * three single ones. Written out rather than generated so the exact pattern
 * is reviewable — an earlier version used links_(5, 2), which puts a double
 * bond on *five* of the six ring edges and leaves the middle carbons with no
 * hydrogens at all, so it matched nothing. */
function benzeneBonds(): [number, number, number][] {
  return [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]];
}

export const GROUP_TEMPLATES: GroupTemplate[] = [
  { id: "Me", label: "Me", atoms: atoms("C3"), bonds: [] },
  { id: "Et", label: "Et", atoms: atoms("C3", "C2"), bonds: links_(1) },
  { id: "nPr", label: "nPr", atoms: atoms("C3", "C2", "C2"), bonds: links_(2) },
  { id: "iPr", label: "iPr", atoms: atoms("C3", "C1", "C3"), bonds: [[0, 1, 1], [1, 2, 1]] },
  { id: "nBu", label: "nBu", atoms: atoms("C3", "C2", "C2", "C2"), bonds: links_(3) },
  // Attachment on the secondary carbon, so it is listed first.
  { id: "sBu", label: "sBu", atoms: atoms("C1", "C2", "C3", "C3"), bonds: [[0, 1, 1], [1, 2, 1], [0, 3, 1]] },
  { id: "iBu", label: "iBu", atoms: atoms("C2", "C1", "C3", "C3"), bonds: [[0, 1, 1], [1, 2, 1], [1, 3, 1]] },
  { id: "tBu", label: "tBu", atoms: atoms("C0", "C3", "C3", "C3"), bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] },
  { id: "Vinyl", label: "Vinyl", atoms: atoms("C2", "C1"), bonds: [[0, 1, 2]] },
  { id: "Allyl", label: "Allyl", atoms: atoms("C2", "C1", "C2"), bonds: [[0, 1, 2], [1, 2, 1]] },
  { id: "Cy", label: "Cy", atoms: atoms("C2", "C2", "C2", "C2", "C2", "C2"), bonds: [...links_(5), [5, 0, 1]] },
  { id: "Ph", label: "Ph", atoms: atoms("C1", "C1", "C1", "C1", "C1", "C1"), bonds: benzeneBonds() },
  {
    id: "Bn", label: "Bn",
    atoms: atoms("C1", "C1", "C1", "C1", "C1", "C1", "C2"),
    bonds: [...benzeneBonds(), [0, 6, 1]],
  },
  { id: "Ac", label: "Ac", atoms: atoms("C3", "C0", "O"), bonds: [[0, 1, 1], [1, 2, 2]] },
  { id: "OMe", label: "OMe", atoms: atoms("O", "C3"), bonds: [[0, 1, 1]] },
  {
    id: "Boc", label: "Boc",
    // Quaternary carbon first (it carries no hydrogen and has four bonds),
    // then its three methyls, then the carbonyl carbon and its oxygens.
    atoms: atoms("C0", "C3", "C3", "C3", "C0", "O", "O"),
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [4, 5, 2], [4, 6, 1]],
  },
  {
    id: "Cbz", label: "Cbz",
    atoms: atoms("C1", "C1", "C1", "C1", "C1", "C1", "C2", "O", "C0", "O"),
    bonds: [...benzeneBonds(), [0, 6, 1], [6, 7, 1], [7, 8, 1], [8, 9, 2]],
  },
  { id: "TMS", label: "TMS", atoms: atoms("Si", "C3", "C3", "C3"), bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] },
  {
    id: "Ms", label: "Ms",
    atoms: atoms("S", "C3", "O", "O"),
    bonds: [[0, 1, 1], [0, 2, 2], [0, 3, 2]],
  },
  {
    id: "Tf", label: "Tf",
    atoms: atoms("S", "C0", "O", "O", "F", "F", "F"),
    bonds: [[0, 1, 1], [0, 2, 2], [0, 3, 2], [1, 4, 1], [1, 5, 1], [1, 6, 1]],
  },
];

interface Candidate {
  /** Candidate atom ids, for iteration order. */
  atoms: string[];
  bonds: [string, string, number][];
  elements: Map<string, Element>;
  /** Implicit-hydrogen count per atom, so templates can tell the butyl
   * isomers apart (see TemplateAtom.h). */
  hydrogens: Map<string, number>;
}

/** Bond orders between two candidate atoms, as a lookup. */
function bondOrderBetween(cand: Candidate, a: string, b: string): number | undefined {
  for (const [x, y, order] of cand.bonds) {
    if ((x === a && y === b) || (x === b && y === a)) return order;
  }
  return undefined;
}

/**
 * Backtracking subgraph isomorphism: can `template` be mapped onto the
 * candidate's atoms? Returns the mapping (template index -> candidate atom
 * id) or null.
 *
 * Small graphs only (every template here has <= 9 atoms), so the naive
 * backtracking search is fine — and being explicit beats a cleverer
 * algorithm that's harder to convince yourself is right.
 */
function matchTemplate(template: GroupTemplate, cand: Candidate, allowed: Set<string>): string[] | null {
  const mapping: (string | undefined)[] = Array.from({ length: template.atoms.length });
  const used = new Set<string>();

  function consistent(tIdx: number, id: string): boolean {
    // Every bond from tIdx to an already-mapped template atom must exist in
    // the candidate with the same order.
    for (const [f, t, order] of template.bonds) {
      let other: string | undefined;
      if (f === tIdx) other = mapping[t];
      else if (t === tIdx) other = mapping[f];
      else continue;
      if (other === undefined) continue;
      const actual = bondOrderBetween(cand, id, other);
      if (actual === undefined || actual !== order) return false;
    }
    // And the candidate atom must not already have more bonds to mapped
    // atoms than the template allows — otherwise a substituted benzene would
    // match Ph. Any *unmapped* candidate neighbour is fine: that's the
    // attachment point the superatom will take over.
    let mappedNeighbours = 0;
    for (const [x, y] of cand.bonds) {
      const other = x === id ? y : y === id ? x : null;
      if (other !== null && mapping.some((m) => m === other)) mappedNeighbours++;
    }
    let templateNeighbours = 0;
    for (const [f, t] of template.bonds) {
      if (f === tIdx || t === tIdx) templateNeighbours++;
    }
    return mappedNeighbours <= templateNeighbours;
  }

  function search(depth: number): boolean {
    if (depth === template.atoms.length) return true;
    const tIdx = depth;
    for (const id of allowed) {
      if (used.has(id)) continue;
      if (cand.elements.get(id) !== template.atoms[tIdx].element) continue;
      // Implicit-H count is part of the atom's identity for matching
      // purposes: a CH3 and a CH2 on the same element are not interchangeable.
      if (cand.hydrogens.get(id) !== template.atoms[tIdx].h) continue;
      if (!consistent(tIdx, id)) continue;
      mapping[tIdx] = id;
      used.add(id);
      if (search(depth + 1)) return true;
      used.delete(id);
      mapping[tIdx] = undefined;
    }
    return false;
  }

  return search(0) ? (mapping as string[]) : null;
}

export interface CollapseMatch {
  templateId: string;
  label: string;
  atomIds: string[];
}

/** Connected groups of atom ids (each bond unions its two ends). */
function connectedComponents(mol: Molecule, candidateIds: string[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const id of candidateIds) parent.set(id, id);
  for (const b of Object.values(mol.bonds)) {
    if (parent.has(b.a1) && parent.has(b.a2)) {
      const ra = find(b.a1);
      const rb = find(b.a2);
      if (ra !== rb) parent.set(ra, rb);
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of candidateIds) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }
  return [...groups.values()];
}

export interface FindOptions {
  /** Atoms to consider; defaults to every atom in the molecule. */
  candidateIds?: string[];
  /** Atoms already claimed by an earlier match and not to be reused. */
  skip?: Set<string>;
}

/**
 * Finds the most specific recognizable group in each connected component.
 *
 * A group is inherently a *sub*structure — an ethyl is the last two carbons
 * of a longer chain, not a disconnected C-C floating on its own — so matches
 * are allowed to be proper subsets of their component, and the outward bonds
 * that collapseToGroup re-points at the new superatom are the attachment
 * point the nickname was already standing in for.
 *
 * Two things keep that from producing wrong labels:
 *
 *  - Templates are tried largest-first and the first success per component
 *    wins, so a four-carbon chain resolves to nBu rather than having three of
 *    its carbons claimed by a nested nPr first.
 *  - Matching is on implicit-hydrogen count as well as element and bond
 *    order (see TemplateAtom.h). That is what stops a *substituted* benzene
 *    from being swallowed into "Ph": the substituted ring carbon carries one
 *    fewer hydrogen than the template's, so it can't match. The same check
 *    separates the butyl isomers, which are pairwise identical as graphs.
 */
export function findCollapsibleGroups(mol: Molecule, options: FindOptions = {}): CollapseMatch[] {
  const matches: CollapseMatch[] = [];
  const skip = options.skip ?? new Set<string>();
  const allIds = Object.keys(mol.atoms);
  const candidateIds = (options.candidateIds ?? allIds).filter((id) => !skip.has(id));

  const ordered = [...GROUP_TEMPLATES].sort((a, b) => b.atoms.length - a.atoms.length);

  for (const component of connectedComponents(mol, candidateIds)) {
    const compSet = new Set(component);
    // Precompute the element multiset once per component; a template whose
    // elements aren't all present can't match and needn't be tried at all.
    const elements = new Map(component.map((id) => [id, mol.atoms[id].element]));
    const hydrogens = new Map(component.map((id) => [id, implicitH(mol, id)]));
    const cand: Candidate = {
      atoms: component,
      elements,
      hydrogens,
      bonds: Object.values(mol.bonds)
        .filter((b) => compSet.has(b.a1) && compSet.has(b.a2))
        .map((b) => [b.a1, b.a2, b.order] as [string, string, number]),
    };

    for (const template of ordered) {
      if (template.atoms.length > component.length) continue;
      const mapping = matchTemplate(template, cand, new Set(component));
      if (!mapping) continue;
      matches.push({ templateId: template.id, label: template.label, atomIds: mapping });
      break; // the most specific group wins for this component
    }
  }

  return matches;
}

/**
 * Replaces a matched fragment with a single group atom positioned at the
 * fragment's *attachment* vertex — the one carrying a bond to the rest of the
 * molecule — so the superatom lands exactly where the fragment it replaces
 * connected, and the surrounding drawing doesn't shift.
 *
 * Falls back to the centroid when no atom has an outward bond (a fragment
 * that isn't attached to anything yet), which is the only sane anchor then.
 */
export function collapseToGroup(mol: Molecule, match: CollapseMatch): Molecule {
  const memberIds = new Set(match.atomIds);

  const bonds: Molecule["bonds"] = {};
  let anchor: { x: number; y: number } | null = null;

  // An attachment point is a member atom with a bond leaving the fragment.
  for (const id of match.atomIds) {
    for (const b of Object.values(mol.bonds)) {
      const other = b.a1 === id ? b.a2 : b.a2 === id ? b.a1 : null;
      if (other === null || memberIds.has(other)) continue;
      anchor = { x: mol.atoms[id].x, y: mol.atoms[id].y };
      break;
    }
    if (anchor) break;
  }

  if (!anchor) {
    const sum = match.atomIds.reduce((acc, id) => ({ x: acc.x + mol.atoms[id].x, y: acc.y + mol.atoms[id].y }), { x: 0, y: 0 });
    anchor = { x: sum.x / match.atomIds.length, y: sum.y / match.atomIds.length };
  }

  // Allocated through the shared counter rather than derived from the
  // matched ids, so a collapse can never produce an id that collides with an
  // existing atom (ids are what every other structure lookup is keyed on).
  const newId = nextId();
  const atoms: Molecule["atoms"] = { ...mol.atoms };
  for (const id of match.atomIds) delete atoms[id];
  atoms[newId] = { id: newId, x: anchor.x, y: anchor.y, element: "C", charge: 0, group: match.templateId };

  // Re-point every bond that left the fragment at the new atom, dropping the
  // fragment's internal bonds entirely.
  for (const b of Object.values(mol.bonds)) {
    if (memberIds.has(b.a1) && memberIds.has(b.a2)) continue;
    const a1 = memberIds.has(b.a1) ? newId : b.a1;
    const a2 = memberIds.has(b.a2) ? newId : b.a2;
    const id = a1 === b.a1 && a2 === b.a2 ? b.id : nextId();
    if (bonds[id]) continue;
    bonds[id] = { ...b, id, a1, a2 };
  }

  return { ...mol, atoms, bonds, hapticBonds: {}, aromaticRingDisplays: {} };
}