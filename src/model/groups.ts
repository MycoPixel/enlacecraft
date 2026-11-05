import type { Annotation, Molecule, ObjectGroup } from "../types/chemistry";

/**
 * Helpers for document-level object groups (see ObjectGroup).
 *
 * A group is a selection unit, not a new kind of drawing object: it names
 * existing atoms, annotations and cycles, and every operation that moves or
 * rotates a member expands the selection to the whole group first. Keeping
 * the rules pure and shared means the canvas, the store and project loading
 * can't disagree about what "in the same group" means.
 */

export interface GroupSelection {
  atomIds: Set<string>;
  annotationIds: Set<string>;
  cycleIds: Set<string>;
}

export function emptyGroupSelection(): GroupSelection {
  return { atomIds: new Set(), annotationIds: new Set(), cycleIds: new Set() };
}

/** True when any member of `group` is in one of the selection sets. */
function intersects(group: ObjectGroup, selection: GroupSelection): boolean {
  return (
    group.atomIds.some((id) => selection.atomIds.has(id)) ||
    group.annotationIds.some((id) => selection.annotationIds.has(id)) ||
    group.cycleIds.some((id) => selection.cycleIds.has(id))
  );
}

/**
 * Expands a selection until it contains every member of every group it
 * touches. Groups never overlap (groupSelection re-homes members), but the
 * loop is still written to a fixed point so a hand-edited project file that
 * does contain overlaps can't leave a half-selected group behind.
 */
export function expandGroupSelection(
  groups: ObjectGroup[] | undefined,
  atomIds: Iterable<string>,
  annotationIds: Iterable<string>,
  cycleIds: Iterable<string>
): GroupSelection {
  const out: GroupSelection = {
    atomIds: new Set(atomIds),
    annotationIds: new Set(annotationIds),
    cycleIds: new Set(cycleIds),
  };
  if (!groups || groups.length === 0) return out;

  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (!intersects(group, out)) continue;
      for (const id of group.atomIds) {
        if (!out.atomIds.has(id)) {
          out.atomIds.add(id);
          changed = true;
        }
      }
      for (const id of group.annotationIds) {
        if (!out.annotationIds.has(id)) {
          out.annotationIds.add(id);
          changed = true;
        }
      }
      for (const id of group.cycleIds) {
        if (!out.cycleIds.has(id)) {
          out.cycleIds.add(id);
          changed = true;
        }
      }
    }
  }
  return out;
}

/** The groups that touch any of the given objects. */
export function groupsTouching(
  groups: ObjectGroup[] | undefined,
  atomIds: Iterable<string>,
  annotationIds: Iterable<string>,
  cycleIds: Iterable<string>
): ObjectGroup[] {
  if (!groups || groups.length === 0) return [];
  const selection: GroupSelection = {
    atomIds: new Set(atomIds),
    annotationIds: new Set(annotationIds),
    cycleIds: new Set(cycleIds),
  };
  return groups.filter((group) => intersects(group, selection));
}

/** Drops references to objects that no longer exist, and groups left with
 * fewer than two members. Returns the same array when nothing changed so the
 * store can avoid an unnecessary undo step. */
export function pruneObjectGroups(
  groups: ObjectGroup[] | undefined,
  molecule: Molecule,
  annotations: Record<string, Annotation>
): ObjectGroup[] | undefined {
  if (!groups || groups.length === 0) return groups;
  const cycleIds = new Set((molecule.cycles ?? []).map((cycle) => cycle.id));
  let changed = false;
  const out: ObjectGroup[] = [];
  for (const group of groups) {
    const atomIds = group.atomIds.filter((id) => !!molecule.atoms[id]);
    const annotationIds = group.annotationIds.filter((id) => !!annotations[id]);
    const keptCycleIds = group.cycleIds.filter((id) => cycleIds.has(id));
    if (
      atomIds.length !== group.atomIds.length ||
      annotationIds.length !== group.annotationIds.length ||
      keptCycleIds.length !== group.cycleIds.length
    ) {
      changed = true;
    }
    if (atomIds.length + annotationIds.length + keptCycleIds.length < 2) {
      changed = true;
      continue;
    }
    out.push({ ...group, atomIds, annotationIds, cycleIds: keptCycleIds });
  }
  if (!changed) return groups;
  return out.length > 0 ? out : undefined;
}

/** Number of distinct objects a selection names, used to enable/disable
 * group/restack commands. */
export function selectionObjectCount(
  atomIds: ReadonlySet<string>,
  annotationIds: ReadonlySet<string>,
  cycleIds: Iterable<string>
): number {
  return atomIds.size + annotationIds.size + new Set(cycleIds).size;
}

/** All ids a group names, for selection after grouping. */
export function groupSelectionSets(group: ObjectGroup): GroupSelection {
  return {
    atomIds: new Set(group.atomIds),
    annotationIds: new Set(group.annotationIds),
    cycleIds: new Set(group.cycleIds),
  };
}

/** Stable z-order sort. Objects without an explicit zOrder keep their
 * insertion order (Array.prototype.sort is stable in modern engines). */
export function sortByZOrder<T extends { zOrder?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));
}

export type RestackMode = "front" | "back" | "forward" | "backward";

/**
 * Returns a new array whose selected members have been moved in the z-order.
 *
 * Explicit numeric zOrder values are assigned from the item's position in
 * the sorted list, so repeated restacks remain stable and a save/reload
 * reproduces exactly the same order. Unselected neighbours keep their old
 * value (or absence) unless they need to make room.
 */
export function restackByZOrder<T extends { id: string; zOrder?: number }>(
  items: T[],
  selectedIds: ReadonlySet<string>,
  mode: RestackMode
): T[] {
  if (selectedIds.size === 0 || items.length < 2) return items;
  const sorted = sortByZOrder(items);
  const indexById = new Map(sorted.map((item, index) => [item.id, index]));
  const selected = sorted.filter((item) => selectedIds.has(item.id));
  if (selected.length === 0) return items;

  const order = sorted.map((item) => item.id);
  if (mode === "front") {
    const rest = order.filter((id) => !selectedIds.has(id));
    order.splice(0, order.length, ...rest, ...selected.map((item) => item.id));
  } else if (mode === "back") {
    const rest = order.filter((id) => !selectedIds.has(id));
    order.splice(0, order.length, ...selected.map((item) => item.id), ...rest);
  } else {
    const delta = mode === "forward" ? 1 : -1;
    // Walk in the direction of travel so a contiguous selected block moves
    // together instead of the first item leapfrogging the rest.
    const indices = selected.map((item) => indexById.get(item.id)!).sort((a, b) => (delta > 0 ? b - a : a - b));
    for (const index of indices) {
      const swap = index + delta;
      if (swap < 0 || swap >= order.length) continue;
      if (selectedIds.has(order[swap])) continue;
      [order[index], order[swap]] = [order[swap], order[index]];
    }
  }

  const zById = new Map(order.map((id, index) => [id, index]));
  if (order.every((id, index) => sorted[index].id === id)) return items;
  let changed = false;
  const next = items.map((item) => {
    const zOrder = zById.get(item.id)!;
    if (item.zOrder === zOrder) return item;
    changed = true;
    return { ...item, zOrder };
  });
  return changed ? next : items;
}
