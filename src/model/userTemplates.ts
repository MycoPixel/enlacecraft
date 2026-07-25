import type { Annotation, Molecule } from "../types/chemistry";

/**
 * A structure the user saved from their own drawing — same shape as a
 * built-in StructureTemplate (see structureTemplates.ts) and insertable
 * through the exact same pasteFragment path, but stored per-browser in
 * localStorage rather than shipped with the app, and freely deletable.
 */
export interface UserTemplate {
  id: string;
  label: string;
  molecule: Molecule;
  annotations: Annotation[];
  createdAt: number;
}

const STORAGE_KEY = "enlacecraft-user-templates";

/** A persisted-id generator, distinct from the in-session nextId() used
 * for atoms/bonds/annotations — that counter resets to 1 on every reload,
 * which would risk collisions between templates saved in different
 * sessions. Falls back to a timestamp+random string if the browser
 * doesn't have crypto.randomUUID (very old browsers, non-HTTPS contexts). */
function newTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `t${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadUserTemplates(): UserTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Unreadable/corrupt storage, or localStorage unavailable (e.g.
    // privacy mode) — behave as if there are simply no saved templates
    // yet, rather than crashing the app on load.
    return [];
  }
}

function persist(templates: UserTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // localStorage unavailable — the save silently won't survive a
    // reload, but nothing here needs to crash the app over it.
  }
}

export function addUserTemplate(existing: UserTemplate[], label: string, molecule: Molecule, annotations: Annotation[]): UserTemplate[] {
  const next = [...existing, { id: newTemplateId(), label, molecule, annotations, createdAt: Date.now() }];
  persist(next);
  return next;
}

export function removeUserTemplate(existing: UserTemplate[], id: string): UserTemplate[] {
  const next = existing.filter((t) => t.id !== id);
  persist(next);
  return next;
}

/** Appends imported templates (see io/templateBookmarks.ts) to the
 * existing list, each given a fresh id — an imported file's own ids
 * might collide with ones already saved locally (or with another import
 * of the same file), and these are meant to land as new entries either
 * way, never silently overwrite an existing template. */
export function addImportedUserTemplates(existing: UserTemplate[], imported: UserTemplate[]): UserTemplate[] {
  const withFreshIds = imported.map((t) => ({ ...t, id: newTemplateId(), createdAt: Date.now() }));
  const next = [...existing, ...withFreshIds];
  persist(next);
  return next;
}
