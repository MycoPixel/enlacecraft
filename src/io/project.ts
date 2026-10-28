import type { Annotation, Molecule, ViewTransform } from "../types/chemistry";
import { nextId } from "../model/id";
import { pruneSchemeArrowIds } from "../model/reactionSchemes";
import {
  ImportValidationError,
  LIMITS,
  newRepairReport,
  sanitizeAnnotationRecord,
  sanitizeMolecule,
  sanitizeView,
  type RepairReport,
} from "./validate";

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
 * Parses a `.enlacecraft` file (or an autosave snapshot, which is the same
 * shape — see io/autosave.ts). The file is untrusted input: it may have
 * come from another machine, another person's Save, or a hand-edited/
 * malicious source, not just this app's own last export.
 *
 * Everything is rebuilt through io/validate.ts rather than trusted:
 *  - molecules: unknown fields dropped, bad atoms/bonds dropped (a bond
 *    to a missing atom used to make exportSmiles throw), old saves
 *    missing `hapticBonds`/`aromaticRingDisplays` backfilled (what the
 *    old migrateMolecule() did), size limits enforced;
 *  - annotations: `__proto__`-style keys refused, text `html` run through
 *    DOMPurify (the one field that reaches a raw innerHTML write on
 *    render — see components/Canvas/TextAnnotationView.tsx);
 *  - view: non-finite/zero scale falls back to the default view;
 *  - tabs: duplicate ids dropped, `activeTabId` guaranteed to exist.
 *
 * Structure that can't be repaired (not an object, limits exceeded) throws
 * ProjectParseError. Anything merely skipped is counted in `report` (pass
 * one in, then check totalDropped(report) to tell the user).
 */
export function importProject(json: string, report: RepairReport = newRepairReport()): ProjectFile {
  if (typeof json !== "string" || json.length > LIMITS.maxFileChars) {
    throw new ProjectParseError("File is too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ProjectParseError("Not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProjectParseError("Missing expected project fields");
  }

  try {
    return importParsedProject(parsed as Record<string, unknown>, report);
  } catch (err) {
    if (err instanceof ImportValidationError) throw new ProjectParseError(err.message);
    throw err;
  }
}

function sanitizeTab(raw: unknown, fallbackId: string, fallbackTitle: string, report: RepairReport): ProjectTab {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProjectParseError("Missing expected project fields");
  }
  const tab = raw as Record<string, unknown>;
  if (!tab.molecule || !tab.annotations || !tab.view) {
    throw new ProjectParseError("Missing expected project fields");
  }
  const id = typeof tab.id === "string" && tab.id.length > 0 && tab.id.length <= LIMITS.maxIdChars ? tab.id : fallbackId;
  const title = typeof tab.title === "string" ? tab.title.slice(0, LIMITS.maxTitleChars) : fallbackTitle;
  const molecule = sanitizeMolecule(tab.molecule, report);
  const annotations = sanitizeAnnotationRecord(tab.annotations, report);
  // Scheme arrow references point into the annotation map, so they can only
  // be checked once both halves of the tab are clean.
  const schemes = pruneSchemeArrowIds(molecule.schemes, annotations);
  let cleanedMolecule = molecule;
  if (schemes !== molecule.schemes) {
    cleanedMolecule = { ...molecule };
    if (schemes) cleanedMolecule.schemes = schemes;
    else delete cleanedMolecule.schemes;
  }
  return {
    id,
    title,
    molecule: cleanedMolecule,
    annotations,
    view: sanitizeView(tab.view),
  };
}

function importParsedProject(parsed: Record<string, unknown>, report: RepairReport): ProjectFile {
  const version = parsed.version;

  if (version === 1) {
    if (!parsed.molecule || !parsed.annotations || !parsed.view) {
      throw new ProjectParseError("Missing expected project fields");
    }
    const id = `tab-${nextId()}`;
    return { version: 2, activeTabId: id, tabs: [sanitizeTab({ ...parsed, id, title: "Tab 1" }, id, "Tab 1", report)] };
  }

  if (version === 2) {
    const rawTabs = parsed.tabs;
    if (!Array.isArray(rawTabs) || rawTabs.length === 0 || typeof parsed.activeTabId !== "string") {
      throw new ProjectParseError("Missing expected project fields");
    }
    if (rawTabs.length > LIMITS.maxTabs) {
      throw new ProjectParseError(`Too many tabs (${rawTabs.length} > ${LIMITS.maxTabs})`);
    }
    const tabs: ProjectTab[] = [];
    const seen = new Set<string>();
    rawTabs.forEach((raw, i) => {
      // Same requirement the old code had: a tab must carry its own id.
      if (!raw || typeof raw !== "object" || typeof (raw as { id?: unknown }).id !== "string" || !(raw as { id: string }).id) {
        throw new ProjectParseError("Missing expected project fields");
      }
      const tab = sanitizeTab(raw, `tab-${nextId()}`, `Tab ${i + 1}`, report);
      if (seen.has(tab.id)) {
        report.droppedOther++;
        return;
      }
      seen.add(tab.id);
      tabs.push(tab);
    });
    const activeTabId = seen.has(parsed.activeTabId) ? parsed.activeTabId : tabs[0].id;
    return { version: 2, activeTabId, tabs };
  }

  throw new ProjectParseError(`Unrecognized project file version: ${String(version)}`);
}
