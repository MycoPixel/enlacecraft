import type { UserTemplate } from "../model/userTemplates";
import { LIMITS, sanitizeUserTemplates } from "./validate";

/**
 * The saved-templates ("bookmarks" — the star/bookmark icon in the
 * sidebar that saves a piece of a drawing for reuse) export format.
 * Deliberately a distinct extension from .enlacecraft (io/project.ts) —
 * a project file is one drawing's full editable state (every tab, pan/
 * zoom, annotations); this is a portable library of reusable snippets,
 * a completely different thing to open by mistake as the other.
 */
export const BOOKMARKS_FILE_EXTENSION = ".enlacebookmarks";

export interface BookmarksFile {
  version: 1;
  templates: UserTemplate[];
}

export function exportBookmarks(templates: UserTemplate[]): string {
  const file: BookmarksFile = { version: 1, templates };
  return JSON.stringify(file, null, 2);
}

export class BookmarksParseError extends Error {}

export function importBookmarks(json: string): UserTemplate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BookmarksParseError("Not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new BookmarksParseError("Missing expected bookmarks fields");
  }
  const version = (parsed as { version?: unknown }).version;
  if (version !== 1) {
    throw new BookmarksParseError(`Unrecognized bookmarks file version: ${String(version)}`);
  }
  const templates = (parsed as { templates?: unknown }).templates;
  if (!Array.isArray(templates) || templates.length === 0) {
    throw new BookmarksParseError("Missing expected bookmarks fields");
  }
  if (templates.length > LIMITS.maxTemplates) {
    throw new BookmarksParseError(`Too many bookmarks (${templates.length} > ${LIMITS.maxTemplates})`);
  }
  // Rebuild every template through the shared validator (bad molecules and
  // annotations are dropped or repaired, text html is sanitized). A file
  // where NOTHING survives is treated as not being a bookmarks file at all.
  const clean = sanitizeUserTemplates(templates);
  if (clean.length === 0) {
    throw new BookmarksParseError("Missing expected bookmarks fields");
  }
  return clean;
}
