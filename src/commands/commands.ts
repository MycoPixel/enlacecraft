/**
 * A tiny registry for the command palette.
 *
 * Commands live where their implementation does (TopBar owns exports and
 * sharing, App owns tools and view toggles) instead of being re-implemented
 * in the palette. Each owner registers a named group and unregisters it when
 * it unmounts; the palette reads the flattened list through
 * `useSyncExternalStore`, so a newly available command shows up immediately.
 *
 * Titles and section headers are translation keys, not finished strings: the
 * palette translates them with the current UI language, so changing language
 * does not require re-registering every group.
 */

export interface AppCommand {
  id: string;
  titleKey: string;
  sectionKey: string;
  /** Extra search terms (English is fine; the title itself is translated). */
  keywords?: string;
  /** Displayed on the right, e.g. "Ctrl+K". */
  shortcut?: string;
  /** Evaluated at render time so availability can follow the drawing. */
  isDisabled?: () => boolean;
  run: () => void | Promise<void>;
}

const groups = new Map<string, AppCommand[]>();
const listeners = new Set<() => void>();
let snapshot: AppCommand[] = [];
let dirty = true;

function rebuild() {
  snapshot = [...groups.values()].flat();
  dirty = false;
}

function emit() {
  dirty = true;
  for (const listener of listeners) listener();
}

export function registerCommandGroup(groupId: string, commands: AppCommand[]): void {
  groups.set(groupId, commands);
  emit();
}

export function unregisterCommandGroup(groupId: string): void {
  if (groups.delete(groupId)) emit();
}

/** Stable snapshot for useSyncExternalStore: same identity until a change. */
export function getCommands(): AppCommand[] {
  if (dirty) rebuild();
  return snapshot;
}

export function subscribeCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
