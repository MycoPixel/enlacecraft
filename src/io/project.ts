import type { Annotation, Molecule, ViewTransform } from "../types/chemistry";
import { nextId } from "../model/id";

/**
 * The native "save project" format: unlike MOL/CDXML/SMILES (which only
 * round-trip the molecule's structure, for interchange with other
 * software), this captures everything needed to reopen a drawing exactly
 * as it was left and keep editing it — annotations (text, arrows,
 * brackets — a reaction scheme's "+" signs and reagent labels included),
 * the current pan/zoom, and (from version 2 on) every tab, not just the
 * one that happened to be active when you hit save.
 *
 * `version` exists so a future format change can still read old files
 * (branch on it, rather than silently misreading — or refusing to read —
 * a file this code doesn't recognize). A version-1 file (single
 * molecule/annotations/view, no concept of tabs) is transparently upgraded
 * into a one-tab version-2 project on import; nothing this code writes out
 * is ever version 1 again.
 */
export interface ProjectTab {
  id: string;
  title: string;
  molecule: Molecule;
  annotations: Record<string, Annotation>;
  view: ViewTransform;
}

export interface ProjectFile {
  version: 2;
  activeTabId: string;
  tabs: ProjectTab[];
}

export const PROJECT_FILE_EXTENSION = ".enlacecraft";

export function exportProject(data: { activeTabId: string; tabs: ProjectTab[] }): string {
  const file: ProjectFile = { version: 2, activeTabId: data.activeTabId, tabs: data.tabs };
  return JSON.stringify(file, null, 2);
}

export class ProjectParseError extends Error {}

/**
 * Backfills fields that didn't exist yet when older project files/
 * autosave snapshots were written — right now, just `hapticBonds` (added
 * well after this format already had files and autosaved sessions in the
 * wild). Without this, an old save loads with `molecule.hapticBonds`
 * simply absent, and the first thing that calls Object.values() on it
 * (e.g. findConnectedFragments, for the formula/MW display) throws
 * immediately on open. Mutates nothing — returns a fresh Molecule with
 * the gap filled in, leaving everything else as it was.
 */
function migrateMolecule(molecule: Molecule): Molecule {
  return { ...molecule, hapticBonds: molecule.hapticBonds ?? {} };
}

export function importProject(json: string): ProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ProjectParseError("Not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ProjectParseError("Missing expected project fields");
  }

  const version = (parsed as { version?: unknown }).version;

  if (version === 1) {
    const v1 = parsed as { molecule?: Molecule; annotations?: Record<string, Annotation>; view?: ViewTransform };
    if (!v1.molecule || !v1.annotations || !v1.view) {
      throw new ProjectParseError("Missing expected project fields");
    }
    const id = `tab-${nextId()}`;
    return { version: 2, activeTabId: id, tabs: [{ id, title: "Tab 1", molecule: migrateMolecule(v1.molecule), annotations: v1.annotations, view: v1.view }] };
  }

  if (version === 2) {
    const v2 = parsed as ProjectFile;
    if (!Array.isArray(v2.tabs) || v2.tabs.length === 0 || typeof v2.activeTabId !== "string") {
      throw new ProjectParseError("Missing expected project fields");
    }
    for (const tab of v2.tabs) {
      if (!tab.id || !tab.molecule || !tab.annotations || !tab.view) {
        throw new ProjectParseError("Missing expected project fields");
      }
    }
    return { ...v2, tabs: v2.tabs.map((tab) => ({ ...tab, molecule: migrateMolecule(tab.molecule) })) };
  }

  throw new ProjectParseError(`Unrecognized project file version: ${String(version)}`);
}
