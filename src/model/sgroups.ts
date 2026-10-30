import type { Annotation, SGroup } from "../types/chemistry";

/**
 * Drops S-group bracket-annotation references that no longer exist.
 *
 * S-groups live on the molecule while their brackets live in the sibling
 * annotation map (or, on a CDXML import, the just-parsed annotation array),
 * so the two can only be reconciled once both have been cleaned. Returns the
 * original record when nothing changed, letting callers preserve reference
 * equality the same way pruneSchemeArrowIds does.
 */
export function pruneSGroupAnnotationIds(
  sgroups: Record<string, SGroup> | undefined,
  annotations: Record<string, Annotation> | readonly Annotation[],
): Record<string, SGroup> | undefined {
  if (!sgroups) return undefined;
  const exists = Array.isArray(annotations)
    ? (id: string): boolean => annotations.some((a) => a.id === id)
    : (id: string): boolean => Object.prototype.hasOwnProperty.call(annotations, id);

  let changed = false;
  const out: Record<string, SGroup> = {};
  for (const [key, sg] of Object.entries(sgroups)) {
    if (!sg.bracketAnnotationIds) {
      out[key] = sg;
      continue;
    }
    const kept = sg.bracketAnnotationIds.filter(exists);
    if (kept.length === sg.bracketAnnotationIds.length) {
      out[key] = sg;
      continue;
    }
    changed = true;
    const next: SGroup = { ...sg };
    if (kept.length > 0) next.bracketAnnotationIds = kept;
    else delete next.bracketAnnotationIds;
    out[key] = next;
  }
  return changed ? out : sgroups;
}
