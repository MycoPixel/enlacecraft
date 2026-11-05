import { useMemo } from "react";
import type { Annotation, Molecule } from "../../types/chemistry";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { annotationBounds } from "../../model/alignmentGuides";
import { interpretReaction, type ReactionRole } from "../../engine/reactionInterpret";

/**
 * "Show Reaction Interpretation" for EnlaceCraft.
 *
 * The overlay reads every scheme with engine/reactionInterpret.ts and puts a
 * quiet outline plus a small role badge around each part: reactants on the
 * left, products on the right, and conditions above/below the arrow. It is a
 * transient reading aid, not part of the drawing — `data-export-exclude`
 * keeps it out of SVG/PNG/PDF exports, and the store flag that drives it is
 * deliberately not persisted with the molecule.
 *
 * Structures that appear in two steps (an intermediate between two arrows)
 * are drawn once, labelled by their product role, matching the precedence the
 * interpretation itself uses.
 */
export function ReactionRoleOverlay({
  molecule,
  annotations,
}: {
  molecule: Molecule;
  annotations: Record<string, Annotation>;
}) {
  const t = useT();
  const reactionMapHighlight = useMoleculeStore((s) => s.reactionMapHighlight);

  const reading = useMemo(() => {
    const structures = new Map<string, { atomIds: string[]; role: ReactionRole }>();
    const conditions: { annotationId: string; role: ReactionRole }[] = [];

    for (const scheme of molecule.schemes ?? []) {
      const interpretation = interpretReaction(molecule, annotations, scheme);

      // Products first so an intermediate keeps a single product badge.
      for (const step of interpretation.steps) {
        for (const part of step.products) {
          if (part.kind !== "structure") continue;
          const key = part.atomIds.join(",");
          if (!structures.has(key)) structures.set(key, { atomIds: part.atomIds, role: "product" });
        }
      }
      for (const step of interpretation.steps) {
        for (const part of step.reactants) {
          if (part.kind !== "structure") continue;
          const key = part.atomIds.join(",");
          if (!structures.has(key)) structures.set(key, { atomIds: part.atomIds, role: "reactant" });
        }
      }
      for (const step of interpretation.steps) {
        for (const part of step.above) {
          if (part.kind === "text") conditions.push({ annotationId: part.annotationId, role: "above" });
        }
        for (const part of step.below) {
          if (part.kind === "text") conditions.push({ annotationId: part.annotationId, role: "below" });
        }
      }
    }

    return { structures: [...structures.values()], conditions };
  }, [annotations, molecule]);

  if (reading.structures.length === 0 && reading.conditions.length === 0) return null;

  return (
    <g className="reaction-role-overlay" pointerEvents="none" data-export-exclude="">
      {reading.structures.map(({ atomIds, role }) => {
        const bounds = boundsForAtoms(molecule, atomIds);
        if (!bounds) return null;
        return (
          <RoleBox
            key={atomIds.join(",")}
            bounds={bounds}
            role={role}
            label={t(roleLabelKey(role))}
          />
        );
      })}
      {reading.conditions.map(({ annotationId, role }) => {
        const ann = annotations[annotationId];
        if (!ann) return null;
        const bounds = annotationBounds(ann);
        return (
          <RoleBox
            key={`${role}-${annotationId}`}
            bounds={bounds}
            role={role}
            label={t(roleLabelKey(role))}
            padded={false}
          />
        );
      })}
      {[...reactionMapHighlight].map((atomId) => {
        const atom = molecule.atoms[atomId];
        if (!atom) return null;
        return (
          <circle
            key={`mapped-${atomId}`}
            cx={atom.x}
            cy={atom.y}
            r={13}
            className="reaction-role-overlay__mapped"
          />
        );
      })}
    </g>
  );
}

function roleLabelKey(role: ReactionRole): string {
  switch (role) {
    case "reactant":
      return "reaction.role.reactant";
    case "product":
      return "reaction.role.product";
    case "above":
      return "reaction.role.above";
    case "below":
      return "reaction.role.below";
  }
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boundsForAtoms(molecule: Molecule, atomIds: string[]): Bounds | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const id of atomIds) {
    const atom = molecule.atoms[id];
    if (!atom) continue;
    left = Math.min(left, atom.x);
    top = Math.min(top, atom.y);
    right = Math.max(right, atom.x);
    bottom = Math.max(bottom, atom.y);
  }
  if (left === Infinity) return null;
  return { left, top, right, bottom };
}

function RoleBox({
  bounds,
  role,
  label,
  padded = true,
}: {
  bounds: Bounds;
  role: ReactionRole;
  label: string;
  padded?: boolean;
}) {
  const pad = padded ? 12 : 3;
  const x = bounds.left - pad;
  const y = bounds.top - pad;
  const width = Math.max(12, bounds.right - bounds.left + pad * 2);
  const height = Math.max(12, bounds.bottom - bounds.top + pad * 2);
  const badgeWidth = Math.max(34, label.length * 5.6 + 10);
  const badgeY = y - 13;

  return (
    <g className={`reaction-role-overlay__part is-${role}`}>
      <rect x={x} y={y} width={width} height={height} rx={7} className="reaction-role-overlay__box" />
      <g transform={`translate(${x}, ${badgeY})`}>
        <rect width={badgeWidth} height={13} rx={6.5} className="reaction-role-overlay__badge-bg" />
        <text x={badgeWidth / 2} y={9.3} textAnchor="middle" className="reaction-role-overlay__badge">
          {label}
        </text>
      </g>
    </g>
  );
}
