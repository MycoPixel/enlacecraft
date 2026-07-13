import type { Annotation, Molecule, ViewTransform } from "../types/chemistry";

/**
 * The native "save project" format: unlike MOL/CDXML/SMILES (which only
 * round-trip the molecule's structure, for interchange with other
 * software), this captures everything needed to reopen a drawing exactly
 * as it was left and keep editing it — annotations (text, arrows,
 * brackets — a reaction scheme's "+" signs and reagent labels included)
 * and the current pan/zoom, not just the atoms and bonds.
 *
 * `version` exists so a future format change can still read old files
 * (branch on it, rather than silently misreading — or refusing to read —
 * a file this code doesn't recognize).
 */
export interface ProjectFile {
  version: 1;
  molecule: Molecule;
  annotations: Record<string, Annotation>;
  view: ViewTransform;
}

export const PROJECT_FILE_EXTENSION = ".enlacecraft";

export function exportProject(data: { molecule: Molecule; annotations: Record<string, Annotation>; view: ViewTransform }): string {
  const file: ProjectFile = { version: 1, molecule: data.molecule, annotations: data.annotations, view: data.view };
  return JSON.stringify(file, null, 2);
}

export class ProjectParseError extends Error {}

export function importProject(json: string): ProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ProjectParseError("Not valid JSON");
  }
  if (
    !parsed || typeof parsed !== "object" ||
    !("molecule" in parsed) || !("annotations" in parsed) || !("view" in parsed)
  ) {
    throw new ProjectParseError("Missing expected project fields");
  }
  const p = parsed as ProjectFile;
  if (p.version !== 1) {
    throw new ProjectParseError(`Unrecognized project file version: ${String((parsed as { version?: unknown }).version)}`);
  }
  return p;
}
