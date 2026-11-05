/**
 * Support code for the 3D panel's "Rotate bond" tool (see
 * Molecule3DView.tsx) — lets someone manually spin one half of the
 * molecule around a chosen single bond (e.g. to show eclipsed vs.
 * staggered ethane) as a rigid, unminimized rotation, layered visually
 * on top of whatever the currently-selected generation method (Quick /
 * MMFF94 / GFN2-xTB — see io/embed3d.ts, io/xtbRefine.ts) last produced.
 *
 * Deliberately *not* re-running any energy method after rotating: a
 * conformer like eclipsed ethane is a torsional *maximum*, not a
 * minimum, of any of those methods — asking an optimizer to relax it
 * would just slide it straight back to staggered, defeating the point
 * of being able to look at it at all. This module is pure rigid-body
 * geometry, nothing more.
 *
 * Parses/serializes the V2000 molfile format itself (rather than
 * reusing io/molfile.ts, which parses the app's own 2D drawing format
 * into its 2D-only Atom/Molecule model — no z-coordinate, no explicit
 * hydrogens) because this needs the *actual* 3D structure being shown,
 * explicit hydrogens included, exactly as embed3d.ts/xtbRefine.ts
 * produced it.
 */

export interface XyzAtom {
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface XyzBond {
  /** 0-indexed positions into the atoms array (V2000 itself is
   * 1-indexed — see parseV2000/serializeV2000 for that conversion). */
  a: number;
  b: number;
  order: number;
}

/**
 * Parses just enough of V2000 to get atom elements/coordinates and
 * bond connectivity/order — everything else (charges, wedges, etc.)
 * is irrelevant to rotating a rigid substructure and is ignored.
 *
 * Column positions match the real CTfile V2000 spec exactly (not just
 * "close enough" / whitespace-split) because that's what 3Dmol.js's own
 * parser expects on the way back in — see serializeV2000's docstring.
 */
export function parseV2000(molfile: string): { atoms: XyzAtom[]; bonds: XyzBond[] } {
  const lines = molfile.split(/\r?\n/);
  const counts = lines[3] ?? "";
  const atomCount = parseInt(counts.substring(0, 3), 10);
  const bondCount = parseInt(counts.substring(3, 6), 10);

  const atoms: XyzAtom[] = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i] ?? "";
    atoms.push({
      x: parseFloat(line.substring(0, 10)),
      y: parseFloat(line.substring(10, 20)),
      z: parseFloat(line.substring(20, 30)),
      element: line.substring(31, 34).trim(),
    });
  }

  const bonds: XyzBond[] = [];
  for (let i = 0; i < bondCount; i++) {
    const line = lines[4 + atomCount + i] ?? "";
    bonds.push({
      a: parseInt(line.substring(0, 3), 10) - 1,
      b: parseInt(line.substring(3, 6), 10) - 1,
      order: parseInt(line.substring(6, 9), 10),
    });
  }

  return { atoms, bonds };
}

/**
 * Serializes back to a minimal, spec-valid V2000 block. 3Dmol.js's own
 * parser reads atom coordinates/element and bond endpoints/order by
 * *fixed column position* (`line.substring(0,10)` etc.), not by
 * splitting on whitespace — so the padding here isn't cosmetic, it's
 * load-bearing. All other V2000 fields (charge, stereo, etc.) are
 * written as the standard "0", which every reader treats as "unset" -
 * fine here since this is a transient rotated view, not something fed
 * back into embed3d.ts/xtbRefine.ts as a new starting structure.
 */
export function serializeV2000(atoms: XyzAtom[], bonds: XyzBond[]): string {
  const coord = (v: number) => v.toFixed(4).padStart(10, " ");
  const count3 = (n: number) => String(n).padStart(3, " ");

  const header = ["", "EnlaceCraft rotate-bond", ""].join("\n");
  const counts = `${count3(atoms.length)}${count3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`;

  const atomLines = atoms.map(
    (a) => `${coord(a.x)}${coord(a.y)}${coord(a.z)} ${a.element.padEnd(3, " ")}0  0  0  0  0  0  0  0  0  0  0  0`,
  );

  const bondLines = bonds.map((b) => `${count3(b.a + 1)}${count3(b.b + 1)}${count3(b.order)}  0  0  0`);

  return [header, counts, ...atomLines, ...bondLines, "M  END", ""].join("\n");
}

export type RotatableBondResult =
  | { ok: true; half: number[] }
  | { ok: false; reason: "NOT_BONDED" | "RING_BOND" | "MULTIPLE_BOND" };

/**
 * Checks that `atomA`-`atomB` is a genuine, freely-rotatable single
 * bond, and if so returns which atoms make up the side that should
 * move (everything reachable from `atomB` without crossing back
 * through `atomA`) — `atomA`'s own side, including `atomA` itself,
 * stays fixed.
 *
 * A bond that's part of a ring isn't rotatable at all in this rigid
 * sense: there's a second path from `atomB` back to `atomA` around the
 * ring, so "rotate everything on B's side" isn't well-defined (it'd
 * have to stretch/break the ring instead of rotating rigidly) — caught
 * here by the BFS below reaching `atomA` again through that second
 * path, which it only can if the bond is a ring bond.
 */
export function findRotatableHalf(bonds: XyzBond[], atomCount: number, atomA: number, atomB: number): RotatableBondResult {
  const directBond = bonds.find(
    (bond) => (bond.a === atomA && bond.b === atomB) || (bond.a === atomB && bond.b === atomA),
  );
  if (!directBond) return { ok: false, reason: "NOT_BONDED" };
  if (directBond.order !== 1) return { ok: false, reason: "MULTIPLE_BOND" };

  const adjacency: number[][] = Array.from({ length: atomCount }, () => []);
  for (const bond of bonds) {
    if (bond === directBond) continue; // the axis bond itself is excluded from traversal
    adjacency[bond.a].push(bond.b);
    adjacency[bond.b].push(bond.a);
  }

  const visited = new Set<number>([atomB]);
  const queue = [atomB];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency[current]) {
      if (visited.has(neighbor)) continue;
      if (neighbor === atomA) return { ok: false, reason: "RING_BOND" };
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return { ok: true, half: [...visited] };
}

/**
 * Rigidly rotates the atoms at `half` (indices into `atoms`) around the
 * line through `axisOrigin`→`axisTarget`, by `angleDeg`, via Rodrigues'
 * rotation formula. Atoms not in `half` come back unchanged. Always
 * takes `atoms` as the untouched base geometry (whatever the active
 * generation method last produced) and `angleDeg` as an absolute angle
 * from that base — callers should recompute from the same base on every
 * slider change rather than repeatedly re-rotating an already-rotated
 * result, so floating-point error can't accumulate over a drag session.
 */
export function rotateHalf(atoms: XyzAtom[], half: number[], axisOrigin: XyzAtom, axisTarget: XyzAtom, angleDeg: number): XyzAtom[] {
  const halfSet = new Set(half);
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const dx = axisTarget.x - axisOrigin.x;
  const dy = axisTarget.y - axisOrigin.y;
  const dz = axisTarget.z - axisOrigin.z;
  const len = Math.hypot(dx, dy, dz) || 1; // guard against a zero-length axis (coincident atoms)
  const kx = dx / len;
  const ky = dy / len;
  const kz = dz / len;

  return atoms.map((atom, i) => {
    if (!halfSet.has(i)) return atom;

    const vx = atom.x - axisOrigin.x;
    const vy = atom.y - axisOrigin.y;
    const vz = atom.z - axisOrigin.z;

    // k × v
    const cx = ky * vz - kz * vy;
    const cy = kz * vx - kx * vz;
    const cz = kx * vy - ky * vx;

    // k · v
    const dot = kx * vx + ky * vy + kz * vz;

    const rx = vx * cos + cx * sin + kx * dot * (1 - cos);
    const ry = vy * cos + cy * sin + ky * dot * (1 - cos);
    const rz = vz * cos + cz * sin + kz * dot * (1 - cos);

    return { ...atom, x: axisOrigin.x + rx, y: axisOrigin.y + ry, z: axisOrigin.z + rz };
  });
}
