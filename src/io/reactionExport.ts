import type { Molecule, ReactionScheme } from "../types/chemistry";
import { findConnectedFragments } from "../model/valence";
import { subMolecule } from "../model/molecule";
import { exportMol } from "./molfile";
import { exportSmiles } from "./smiles";

/**
 * Reaction/structure interchange exports.
 *
 * The drawing model already stores disconnected structures side by side and
 * groups reaction components into `Molecule.schemes` (see ReactionScheme's
 * doc comment). These helpers turn that data into the three formats other
 * chemistry tools consume:
 *
 *  - SDF: one V2000 record per connected structure, for databases and
 *    property pipelines that expect a multi-record file.
 *  - RXN V2000: one scheme as reactants and products, the format
 *    ChemDraw/RDKit/OpenBabel use for a single reaction.
 *  - Reaction SMILES: `reactants>>products`, the compact text form.
 *
 * Nothing here invents a reaction from ungrouped fragments. If the drawing
 * has no scheme, RXN/reaction SMILES return null so the UI can say so rather
 * than guessing which fragments are meant to be reactants.
 */

function uniqueIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)];
}

function schemeReactantIds(scheme: ReactionScheme): string[] {
  return uniqueIds(scheme.steps.flatMap((step) => step.reactantAtomIds));
}

function schemeProductIds(scheme: ReactionScheme): string[] {
  return uniqueIds(scheme.steps.flatMap((step) => step.productAtomIds));
}

/** Optional per-record data fields for exportSdf, aligned by fragment order.
 * Each entry becomes one or more `> <Field>` blocks after that record's
 * molfile. Values are written verbatim; empty/missing values are skipped so
 * a structurally-correct SDF isn't padded with meaningless blank fields. */
export interface SdfExportOptions {
  properties?: readonly Record<string, string>[];
}

function formatSdfFields(properties: Record<string, string> | undefined): string {
  if (!properties) return "";
  let out = "";
  for (const [tag, value] of Object.entries(properties)) {
    if (!value) continue;
    // CTfile's data-field header. `> <Tag>` and `>  <Tag>` are both accepted;
    // the single-space form is what RDKit, OpenBabel and ChemDraw write.
    out += `> <${tag}>\n${value}\n\n`;
  }
  return out;
}

/**
 * Exports every connected structure as a separate SDF record.
 *
 * Deliberately not scheme-aware: an SDF is a list of structures, not a
 * reaction, so a drawing containing A + B -> C becomes three records (or
 * whichever fragments are actually on the canvas), not one "reaction"
 * record. RXN below is the format that carries the arrow relationship.
 *
 * `options.properties` is indexed by the same fragment order used to write
 * the records, so callers can attach computed property fields (formula,
 * mass, descriptors) without this module depending on the property table.
 */
export function exportSdf(molecule: Molecule, name = "molecule", options: SdfExportOptions = {}): string {
  const fragments = findConnectedFragments(molecule);
  if (fragments.length === 0) return "";
  return fragments
    .map((atomIds, index) => {
      const suffix = fragments.length > 1 ? ` ${index + 1}` : "";
      const fields = formatSdfFields(options.properties?.[index]);
      return `${exportMol(subMolecule(molecule, atomIds), `${name}${suffix}`)}${fields}$$$$\n`;
    })
    .join("");
}

/** Splits one side of a reaction into its separate connected components —
 * RXN expects one `$MOL` block per reactant/product molecule, not one block
 * containing every component of that side. */
function sideFragments(molecule: Molecule, atomIds: string[]): Molecule[] {
  if (atomIds.length === 0) return [];
  const side = subMolecule(molecule, atomIds);
  return findConnectedFragments(side).map((ids) => subMolecule(side, ids));
}

function rxnCountField(count: number): string {
  // RXN V2000 stores the reactant/product counts in two 3-character fields.
  return String(Math.min(999, count)).padStart(3);
}

/**
 * Exports one reaction scheme as RXN V2000.
 *
 * Multiple disconnected components on the same side are emitted as separate
 * `$MOL` blocks and counted independently, which is what external readers
 * expect. A scheme with several steps is flattened into one overall
 * reactant set and one product set; RXN V2000 has no notion of intermediate
 * steps, so a multi-step scheme cannot be represented losslessly here.
 */
export function exportRxn(molecule: Molecule, scheme?: ReactionScheme): string | null {
  const selected = scheme ?? molecule.schemes?.[0];
  if (!selected) return null;

  const reactants = sideFragments(molecule, schemeReactantIds(selected));
  const products = sideFragments(molecule, schemeProductIds(selected));
  if (reactants.length === 0 && products.length === 0) return null;

  let out = "$RXN\n";
  out += "  EnlaceCraft\n";
  out += `${rxnCountField(reactants.length)}${rxnCountField(products.length)}\n`;
  for (const fragment of [...reactants, ...products]) {
    out += "$MOL\n";
    out += exportMol(fragment, "molecule");
  }
  return out;
}

function reactionSideSmiles(molecule: Molecule, atomIds: string[]): string {
  if (atomIds.length === 0) return "";
  // Atom maps are part of a reaction SMILES's meaning (they say which product
  // atom came from which reactant atom), so they are written as atom classes
  // here. A plain structure export leaves them off — see exportSmiles.
  return exportSmiles(subMolecule(molecule, atomIds), { includeAtomMaps: true });
}

/** Reaction SMILES for one scheme, or null when either side is empty (an
 * arrow with nothing on one side isn't a reaction that `>>` can express). */
export function exportReactionSmiles(molecule: Molecule, scheme?: ReactionScheme): string | null {
  const selected = scheme ?? molecule.schemes?.[0];
  if (!selected) return null;

  const reactants = reactionSideSmiles(molecule, schemeReactantIds(selected));
  const products = reactionSideSmiles(molecule, schemeProductIds(selected));
  if (!reactants || !products) return null;
  return `${reactants}>>${products}`;
}

/** One reaction SMILES per scheme, newline-separated. Null when there are no
 * exportable schemes at all. */
export function exportAllReactionSmiles(molecule: Molecule): string | null {
  const lines = (molecule.schemes ?? [])
    .map((scheme) => exportReactionSmiles(molecule, scheme))
    .filter((line): line is string => !!line);
  return lines.length > 0 ? lines.join("\n") : null;
}

/** True when the drawing has at least one scheme with atoms on both sides —
 * used to enable/disable the reaction-only export entries. */
export function hasExportableReaction(molecule: Molecule): boolean {
  return (molecule.schemes ?? []).some(
    (scheme) => schemeReactantIds(scheme).length > 0 && schemeProductIds(scheme).length > 0
  );
}
