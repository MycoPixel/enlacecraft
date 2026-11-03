import type { Molecule } from "../types/chemistry";
import {
  computeFormula,
  computeMolecularWeight,
  findConnectedFragments,
  hasIgnoredValenceAtoms,
} from "../model/valence";
import { subMolecule } from "../model/molecule";
import { exactMass } from "../model/massSpec";
import { exportSmiles } from "./smiles";
import {
  computeMoleculeDescriptors,
  MoleculeDescriptorsError,
  type DescriptorUnavailableReason,
  type MoleculeDescriptors,
} from "./moleculeDescriptors";
import type { CompoundIdentifiers } from "./pubchem";

/**
 * One row per connected structure for the properties table.
 *
 * The drawing model deliberately stores unrelated structures side by side
 * (A + B -> C, or just several molecules on one canvas), so every aggregate
 * property here is scoped to a single fragment rather than summed across the
 * whole canvas — the same reasoning useFormulaDisplay and
 * useMoleculeDescriptors already use. `atomIds` is kept so callers can map a
 * row back to the fragment it came from (and so the SDF builder can rely on
 * the identical fragment order).
 */
export interface PropertyRow {
  /** 1-based, matching the table's "#" column and the SDF record order. */
  index: number;
  atomIds: string[];
  formula: string;
  molecularWeight: number;
  exactMass: number;
  /** Sum of formal charges — a neutral molecule has 0, an ion is signed. */
  charge: number;
  atomCount: number;
  heavyAtomCount: number;
  bondCount: number;
  smiles: string;
  descriptors: MoleculeDescriptors | null;
  /** Set instead of `descriptors` when the descriptor engine declines the
   * structure, so the table can explain a blank cell rather than hide it. */
  descriptorsUnavailable: DescriptorUnavailableReason | null;
}

/**
 * Builds the table's data from the same fragment split and descriptor engine
 * the info popover uses, so a number shown here can never disagree with the
 * same number shown there.
 *
 * Descriptors are computed synchronously (OpenChemLib's increment tables are
 * built in) and cached per render by the caller's memoization. A fragment the
 * engine can't handle still gets a full row — formula/mass/counts are pure
 * arithmetic — with `descriptorsUnavailable` naming the reason.
 */
export function buildPropertyRows(molecule: Molecule): PropertyRow[] {
  return findConnectedFragments(molecule).map((atomIds, i) => {
    const fragment = subMolecule(molecule, atomIds);
    const atoms = Object.values(fragment.atoms);
    const charge = atoms.reduce((sum, atom) => sum + (atom.charge || 0), 0);

    let descriptors: MoleculeDescriptors | null = null;
    let descriptorsUnavailable: DescriptorUnavailableReason | null = null;
    if (hasIgnoredValenceAtoms(fragment)) {
      descriptorsUnavailable = "IGNORED_VALENCE";
    } else {
      try {
        descriptors = computeMoleculeDescriptors(fragment);
      } catch (err) {
        descriptorsUnavailable = err instanceof MoleculeDescriptorsError ? err.code : "UNSUPPORTED";
      }
    }

    return {
      index: i + 1,
      atomIds,
      formula: computeFormula(fragment),
      molecularWeight: computeMolecularWeight(fragment),
      exactMass: exactMass(fragment),
      charge,
      atomCount: atoms.length,
      heavyAtomCount: atoms.filter((atom) => atom.element !== "H").length,
      bondCount: Object.keys(fragment.bonds).length,
      smiles: exportSmiles(fragment),
      descriptors,
      descriptorsUnavailable,
    };
  });
}

/**
 * Stable column identities. Kept separate from the translated header text so
 * CSV/table/SDF consumers all read the same value from a row while the UI can
 * label it in either language.
 */
export type PropertyColumnKey =
  | "index"
  | "formula"
  | "molecularWeight"
  | "exactMass"
  | "charge"
  | "atoms"
  | "heavyAtoms"
  | "bonds"
  | "smiles"
  | "logP"
  | "logS"
  | "tpsa"
  | "hBondDonors"
  | "hBondAcceptors"
  | "rotatableBonds"
  | "stereocenters"
  | "pubchemCid"
  | "pubchemName"
  | "inchikey";

export interface PropertyColumn {
  key: PropertyColumnKey;
  /** Already-localised text for the table header and CSV header row. */
  header: string;
}

/**
 * `identifiers` is the optional PubChem enrichment map, keyed by the row's
 * SMILES. Looking it up here (rather than mutating rows) keeps the computed
 * row model a pure function of the drawing.
 */
export function formatPropertyValue(
  row: PropertyRow,
  key: PropertyColumnKey,
  identifiers?: Record<string, CompoundIdentifiers | null>,
): string {
  const identifier = identifiers?.[row.smiles];
  switch (key) {
    case "index":
      return String(row.index);
    case "formula":
      return row.formula;
    case "molecularWeight":
      return row.molecularWeight > 0 ? row.molecularWeight.toFixed(2) : "";
    case "exactMass":
      return row.exactMass > 0 ? row.exactMass.toFixed(4) : "";
    case "charge":
      return row.charge > 0 ? `+${row.charge}` : String(row.charge);
    case "atoms":
      return String(row.atomCount);
    case "heavyAtoms":
      return String(row.heavyAtomCount);
    case "bonds":
      return String(row.bondCount);
    case "smiles":
      return row.smiles;
    case "logP":
      return row.descriptors ? row.descriptors.logP.toFixed(2) : "";
    case "logS":
      return row.descriptors ? row.descriptors.logS.toFixed(2) : "";
    case "tpsa":
      return row.descriptors ? row.descriptors.polarSurfaceArea.toFixed(1) : "";
    case "hBondDonors":
      return row.descriptors ? String(row.descriptors.hBondDonorCount) : "";
    case "hBondAcceptors":
      return row.descriptors ? String(row.descriptors.hBondAcceptorCount) : "";
    case "rotatableBonds":
      return row.descriptors ? String(row.descriptors.rotatableBondCount) : "";
    case "stereocenters":
      return row.descriptors ? String(row.descriptors.stereoCenterCount) : "";
    case "pubchemCid":
      return identifier?.cid !== undefined ? String(identifier.cid) : "";
    case "pubchemName":
      return identifier?.name ?? "";
    case "inchikey":
      return identifier?.inchikey ?? "";
  }
}

/** RFC 4180 quoting: wrap a cell only when it would otherwise break the row,
 * and double any embedded quote. Values we write are normally single-line,
 * but names and copied-in data can contain commas/quotes, so this can't be a
 * naive join. */
export function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Serialises rows using the caller's column set (which also supplies the
 * header labels), so the downloaded file always matches what the table shows.
 * CRLF is what spreadsheet applications expect from CSV.
 */
export function propertiesToCsv(
  rows: readonly PropertyRow[],
  columns: readonly PropertyColumn[],
  identifiers?: Record<string, CompoundIdentifiers | null>,
): string {
  const lines = [columns.map((column) => escapeCsvCell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => escapeCsvCell(formatPropertyValue(row, column.key, identifiers)))
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Data fields for one SDF record. Keys are deliberately stable English tag
 * names rather than the UI language: an SDF is an interchange file, and
 * downstream tools query `> <Formula>` / `> <Molecular Weight>` by name.
 * Unavailable values are omitted instead of written as an empty field.
 */
export function propertyRowToSdfFields(row: PropertyRow): Record<string, string> {
  const fields: Record<string, string> = {
    Formula: row.formula,
    "Molecular Weight": formatPropertyValue(row, "molecularWeight"),
    "Exact Mass": formatPropertyValue(row, "exactMass"),
    Charge: formatPropertyValue(row, "charge"),
    "Atom Count": formatPropertyValue(row, "atoms"),
    "Heavy Atom Count": formatPropertyValue(row, "heavyAtoms"),
    "Bond Count": formatPropertyValue(row, "bonds"),
    SMILES: row.smiles,
  };

  if (row.descriptors) {
    fields["logP"] = formatPropertyValue(row, "logP");
    fields["logS"] = formatPropertyValue(row, "logS");
    fields["TPSA"] = formatPropertyValue(row, "tpsa");
    fields["H-Bond Donors"] = formatPropertyValue(row, "hBondDonors");
    fields["H-Bond Acceptors"] = formatPropertyValue(row, "hBondAcceptors");
    fields["Rotatable Bonds"] = formatPropertyValue(row, "rotatableBonds");
    fields["Stereocenters"] = formatPropertyValue(row, "stereocenters");
  }

  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ""));
}
