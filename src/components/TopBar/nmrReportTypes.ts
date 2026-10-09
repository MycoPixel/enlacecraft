/**
 * Per-atom predicted shifts, as the report and the structure diagram consume
 * them.
 *
 * Extracted from NmrReportView so the diagram component can take it without
 * importing the view that renders it - a shared type in one place, rather
 * than two structurally-identical definitions that could drift.
 */

export interface AtomShifts {
  c13?: number;
  h1?: { shift: number; numHs: number; multiplicity: string; multiplicityDetail: string };
  /**
   * This atom's equivalence_group from either prediction (they always agree -
   * it's a per-atom property, not per-nucleus). Used only to group table rows
   * for constitutionally equivalent atoms into one line.
   */
  equivalenceGroup?: number;
  /**
   * True when this atom has an h1 shift attached but structurally cannot bear
   * that many (or any) hydrogens as actually drawn - see totalHydrogenCount's
   * doc comment. Surfaced as a warning rather than silently trusted, since
   * it's a reliable sign of an atom-index mismatch coming from the prediction
   * service, not a real chemistry result.
   */
  implausible?: boolean;
}