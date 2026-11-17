import type { Molecule, ReagentRole, ReagentRow, ReagentTable } from "../types/chemistry";
import { nextId } from "./id";
import { connectedComponents } from "./molecule";
import { computeFormula, computeMolecularWeight } from "./valence";

/**
 * Reagent-table arithmetic.
 *
 * A chemist fills in what they know — a structure (so formula and MW come
 * from the drawing), the equivalents, and the batch size — and every other
 * column is derived here rather than stored. That is what keeps the table
 * self-consistent: changing the limiting reagent's mmol changes every
 * dependent mass and volume in the same render.
 *
 * Conventions, matching how a lab notebook writes a table:
 *  - exactly one row is limiting (the first reactant otherwise);
 *  - the limiting row's `mmol`, or `scaleMmol`, is the batch size;
 *  - every other row's amount is `equivalents × batch / limiting equivalents`;
 *  - a row with an explicit `mmol` keeps that amount instead: it is the
 *    batch for the limiting row, and an override for any other row;
 *  - mass (mg) = mmol × MW (g/mol), because mmol × g/mol = mg;
 *  - volume = mass / density, or mmol / concentration when a solution is
 *    given instead of a neat liquid;
 *  - a product's mass is corrected by its isolated yield.
 */

export interface ComputedReagentRow {
  row: ReagentRow;
  /** Amount used (or formed, for a product), in mmol. */
  mmol: number | null;
  /** mass = mmol × MW, in mg. For a product this is the theoretical mass. */
  massMg: number | null;
  /** Volume in mL, from density or concentration. */
  volumeMl: number | null;
  /** A product's mass after applying its yield; null for everything else. */
  isolatedMassMg: number | null;
}

export interface ComputedReagentTable {
  rows: ComputedReagentRow[];
  /** The row the batch is scaled from. */
  limitingId: string | null;
  /** Batch size in mmol. */
  scaleMmol: number;
  /** Sum of the reactants' masses, in mg. */
  totalReactantMassMg: number;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function positive(value: unknown): number | null {
  const n = finiteNonNegative(value);
  return n !== null && n > 0 ? n : null;
}

export function computeReagentTable(table: ReagentTable | undefined): ComputedReagentTable {
  const rows = table?.rows ?? [];
  const limiting = rows.find((row) => row.limiting) ?? rows.find((row) => row.role === "reactant") ?? null;
  const scaleMmol = positive(limiting?.mmol) ?? positive(table?.scaleMmol) ?? 1;
  const limitingEquivalents = positive(limiting?.equivalents) ?? 1;

  let totalReactantMassMg = 0;

  const computed = rows.map((row): ComputedReagentRow => {
    const isProduct = row.role === "product";
    const equivalents = finiteNonNegative(row.equivalents) ?? 1;

    let mmol: number | null;
    if (isProduct) {
      mmol = finiteNonNegative(row.mmol) ?? scaleMmol;
    } else if (row === limiting) {
      mmol = finiteNonNegative(row.mmol) ?? scaleMmol;
    } else {
      mmol = finiteNonNegative(row.mmol) ?? (equivalents * scaleMmol) / limitingEquivalents;
    }

    const mw = positive(row.mw);
    const massMg = mmol !== null && mw !== null ? mmol * mw : null;

    let volumeMl: number | null = null;
    if (massMg !== null) {
      const density = positive(row.density);
      const concentration = positive(row.concentration);
      if (concentration !== null && mmol !== null) volumeMl = mmol / concentration;
      else if (density !== null) volumeMl = massMg / 1000 / density;
    }

    const yieldPercent = isProduct ? finiteNonNegative(row.yieldPercent) ?? 100 : null;
    const isolatedMassMg =
      isProduct && massMg !== null && yieldPercent !== null ? (massMg * yieldPercent) / 100 : null;

    if (!isProduct && massMg !== null && (row.role === "reactant" || row.role === "reagent")) {
      totalReactantMassMg += massMg;
    }

    return { row, mmol, massMg, volumeMl, isolatedMassMg };
  });

  return {
    rows: computed,
    limitingId: limiting?.id ?? null,
    scaleMmol,
    totalReactantMassMg,
  };
}

/** A blank row, with only the fields a person would type. */
export function newReagentRow(partial: Partial<ReagentRow> = {}): ReagentRow {
  return {
    id: `reagent-${nextId()}`,
    name: "",
    role: "reactant",
    equivalents: 1,
    ...partial,
  };
}

/** Turns connected structures into rows, one per fragment, with formula and
 * MW taken from the drawing. Used by "add from selection" and by importing a
 * whole sheet into a table. */
export function reagentRowsFromAtoms(
  molecule: Molecule,
  atomIds: Iterable<string>,
  role: ReagentRole = "reactant"
): ReagentRow[] {
  const ids = [...atomIds].filter((id) => !!molecule.atoms[id]);
  if (ids.length === 0) return [];
  return connectedComponents(molecule, ids).map((component) => {
    const formula = computeFormula(molecule, component);
    const mw = computeMolecularWeight(molecule, component);
    return newReagentRow({
      name: formula,
      role,
      formula,
      mw: Math.round(mw * 100) / 100,
      atomIds: component,
      equivalents: role === "product" ? undefined : 1,
    });
  });
}

export function reagentRowsFromMolecule(molecule: Molecule, role: ReagentRole = "reactant"): ReagentRow[] {
  return reagentRowsFromAtoms(molecule, Object.keys(molecule.atoms), role);
}

/** `null`/`undefined` become an empty cell; a number keeps at most three
 * decimals and no trailing zeros. */
export function formatReagentNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  return String(rounded);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The table as CSV, with the derived columns included. */
export function reagentTableToCsv(table: ReagentTable | undefined): string {
  const computed = computeReagentTable(table);
  const header = [
    "Name",
    "Role",
    "Formula",
    "MW (g/mol)",
    "Equivalents",
    "Amount (mmol)",
    "Mass (mg)",
    "Isolated (mg)",
    "Volume (mL)",
    "Yield (%)",
    "Limiting",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const { row, mmol, massMg, volumeMl, isolatedMassMg } of computed.rows) {
    lines.push(
      [
        row.name,
        row.role,
        row.formula ?? "",
        formatReagentNumber(row.mw),
        formatReagentNumber(row.equivalents),
        formatReagentNumber(mmol),
        formatReagentNumber(massMg),
        formatReagentNumber(isolatedMassMg),
        formatReagentNumber(volumeMl),
        row.role === "product" ? formatReagentNumber(row.yieldPercent ?? 100) : "",
        row.id === computed.limitingId ? "yes" : "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}
