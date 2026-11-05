import { useMemo } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { useFormulaDisplay } from "./useFormulaDisplay";
import { useT } from "../i18n/useT";
import { countReactionRoles, interpretReaction } from "../engine/reactionInterpret";

/**
 * Plain-language description of the current drawing for assistive tech.
 *
 * It is deliberately structural (formula, counts, reaction schemes, current
 * selection) rather than a dump of atom coordinates: a screen-reader user
 * needs to know what is on the canvas and what is selected, and the existing
 * status messages already report each edit as it happens. The formula comes
 * from the same hook as the visible readout, so the two can never disagree.
 */
export function useStructureDescription(): string {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const annotations = useMoleculeStore((s) => s.annotations);
  const selected = useMoleculeStore((s) => s.selected);
  const showReactionInterpretation = useMoleculeStore((s) => s.showReactionInterpretation);
  const { formula } = useFormulaDisplay();

  return useMemo(() => {
    const atomCount = Object.keys(molecule.atoms).length;
    const cycles = molecule.cycles ?? [];
    if (atomCount === 0 && Object.keys(annotations).length === 0 && cycles.length === 0) {
      return t("a11y.empty");
    }

    const parts: string[] = [];
    if (formula) {
      parts.push(
        t("a11y.structure", {
          formula,
          atoms: atomCount,
          bonds: Object.keys(molecule.bonds).length,
        }),
      );
    } else {
      parts.push(t("a11y.annotationsOnly"));
    }

    const schemes = molecule.schemes?.length ?? 0;
    if (schemes > 0) parts.push(t("a11y.reactionSchemes", { count: schemes }));
    if (showReactionInterpretation && schemes > 0) {
      const interpretations = (molecule.schemes ?? []).map((scheme) =>
        interpretReaction(molecule, annotations, scheme)
      );
      const roles = countReactionRoles(interpretations);
      parts.push(
        t("a11y.reactionRoles", {
          reactants: roles.reactants,
          products: roles.products,
          conditions: roles.conditions,
        })
      );
    }

    for (const cycle of cycles) {
      parts.push(
        t("a11y.catalyticCycle", {
          intermediates: cycle.nodes.length,
          direction: t(cycle.clockwise !== false ? "a11y.cycleClockwise" : "a11y.cycleAnticlockwise"),
        })
      );
      const sides = cycle.sides ?? [];
      const reagents = sides
        .filter((side) => side.direction === "in" && side.label)
        .map((side) => side.label as string);
      const products = sides
        .filter((side) => side.direction === "out" && side.label)
        .map((side) => side.label as string);
      if (reagents.length > 0) parts.push(t("a11y.cycleReagents", { names: reagents.join(", ") }));
      if (products.length > 0) parts.push(t("a11y.cycleProducts", { names: products.join(", ") }));
    }

    const annotationCount = Object.keys(annotations).length;
    if (annotationCount > 0) parts.push(t("a11y.annotations", { count: annotationCount }));

    if (selected.size > 0) {
      parts.push(t("a11y.selection", { count: selected.size }));
    }

    return parts.join(" ");
  }, [annotations, formula, molecule, selected, showReactionInterpretation, t]);
}
