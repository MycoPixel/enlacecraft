import type { Molecule } from "../../types/chemistry";
import { ELEMENT_COLOR } from "../../model/constants";
import { useStereoAnalysis } from "../../hooks/useStereoAnalysis";

/**
 * Draws OpenChemLib-computed (R)/(S) and E/Z descriptors on top of the
 * drawing, when the "show computed stereochemistry" preference is on.
 *
 * A separate overlay rather than a prop on AtomView/BondView: those are
 * React.memo'd per atom/bond and rebuilt only when that atom or bond object
 * changes, so threading a molecule-wide analysis into them would either
 * defeat the memo or make every atom re-render whenever any other atom was
 * edited. One component that walks the (already cached) analysis result is
 * both cheaper and easier to switch off.
 *
 * Atoms carrying a manual Atom.stereoLabel are skipped: that label is the
 * person's own assertion, and printing a computed one on top of it would
 * look like the app overriding them.
 */
export function ComputedStereoOverlay({ molecule }: { molecule: Molecule }) {
  const analysis = useStereoAnalysis(molecule, true);
  if (!analysis || analysis.status !== "ok") return null;
  if (analysis.atoms.length === 0 && analysis.bonds.length === 0) return null;

  return (
    <g
      className="computed-stereo-overlay"
      pointerEvents="none"
      // The computed descriptor is the app's reading of the drawing, not
      // part of it, so exported figures/SVGs must not ink it in. Same
      // exclusion marker the aromaticity overlay uses.
      data-export-exclude=""
    >
      {analysis.atoms.map(({ atomId, label }) => {
        const atom = molecule.atoms[atomId];
        if (!atom || atom.stereoLabel) return null;
        const dir = freeLabelDirection(molecule, atomId);
        return (
          <text
            key={`atom-${atomId}`}
            x={atom.x + dir.dx * 17}
            y={atom.y + dir.dy * 17}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="9.5"
            fontStyle="italic"
            fontWeight="600"
            fill={ELEMENT_COLOR[atom.element] ?? "var(--ink)"}
            className="atom-label"
          >
            ({label})
          </text>
        );
      })}
      {analysis.bonds.map(({ bondId, label }) => {
        const bond = molecule.bonds[bondId];
        if (!bond) return null;
        const a1 = molecule.atoms[bond.a1];
        const a2 = molecule.atoms[bond.a2];
        if (!a1 || !a2) return null;

        const mx = (a1.x + a2.x) / 2;
        const my = (a1.y + a2.y) / 2;
        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const len = Math.hypot(dx, dy);
        // Perpendicular offset so the descriptor sits beside the double
        // bond's lines rather than on top of them. A zero-length bond can't
        // happen in practice, but guarding here keeps the math finite.
        const nx = len > 0 ? (-dy / len) * 11 : 0;
        const ny = len > 0 ? (dx / len) * 11 : -11;

        return (
          <text
            key={`bond-${bondId}`}
            x={mx + nx}
            y={my + ny + 3.5}
            textAnchor="middle"
            fontSize="9.5"
            fontStyle="italic"
            fontWeight="600"
            fill="var(--ink-soft)"
            className="atom-label"
          >
            ({label})
          </text>
        );
      })}
    </g>
  );
}

/**
 * Picks a direction for an atom's descriptor that doesn't sit on top of one
 * of its own drawn bonds.
 *
 * The conventional "just below the atom" placement works for a bare vertex,
 * but a stereocenter is by definition crowded: three or four bonds radiate
 * from it, and whichever way is "down" may be exactly where a substituent
 * label already is. Instead, this finds the largest angular gap between the
 * drawn bonds — the free sector an implicit hydrogen would occupy — and
 * points into the middle of it. A center with no drawn bonds at all falls
 * back to plain "below".
 */
function freeLabelDirection(mol: Molecule, atomId: string): { dx: number; dy: number } {
  const atom = mol.atoms[atomId];
  if (!atom) return { dx: 0, dy: 1 };

  const angles: number[] = [];
  for (const bond of Object.values(mol.bonds)) {
    const otherId = bond.a1 === atomId ? bond.a2 : bond.a2 === atomId ? bond.a1 : null;
    if (!otherId) continue;
    const other = mol.atoms[otherId];
    if (!other) continue;
    angles.push(Math.atan2(other.y - atom.y, other.x - atom.x));
  }
  if (angles.length === 0) return { dx: 0, dy: 1 };

  angles.sort((a, b) => a - b);
  let widestGap = -1;
  let midpoint = Math.PI / 2;
  for (let i = 0; i < angles.length; i++) {
    const start = angles[i];
    const end = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
    const gap = end - start;
    if (gap > widestGap) {
      widestGap = gap;
      midpoint = start + gap / 2;
    }
  }
  return { dx: Math.cos(midpoint), dy: Math.sin(midpoint) };
}
