let counter = 1;

/** Monotonically increasing id, unique for the lifetime of the page. */
export function nextId(): string {
  return String(counter++);
}

/**
 * Moves the counter past every id in `used`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `nextId()` is a page-lifetime counter that restarts at 1 on every load, while
 * documents restored from disk carry ids minted by whichever session last saved
 * them. Nothing reconciled the two, so a restored document's low ids ("2",
 * "3", ...) collided with ids handed out again in the new session.
 *
 * That is not a rare race - it is near deterministic. Restored ids are always
 * small integers and the fresh counter is always small, so they overlap by
 * default. `addAtom` writes `atoms[id]` unconditionally, so a collision
 * OVERWRITES rather than appends: drawing one more atom after a restore
 * silently replaced an existing atom with a different element somewhere else
 * on the canvas, and every bond referencing the old id then pointed at the
 * replacement. No error, and the corrupted document is what the next autosave
 * persists.
 *
 * `insertMolecule` (the PubChem/paste path) has always remapped ids through
 * nextId() and so was never affected. The project-restore paths install
 * documents verbatim - deliberately, because remapping would have to rewrite
 * every cross-reference - so they are the ones that must reserve instead.
 *
 * Only numeric ids are considered. Ids are always produced by `nextId()`, so
 * anything non-numeric cannot come from this counter and cannot collide with
 * it.
 *
 * @returns how many distinct ids were reserved, for tests and diagnostics.
 */
export function reserveIds(used: Iterable<string>): number {
  let reserved = 0;
  for (const id of used) {
    // Number(), not parseInt: parseInt("12abc") is 12 and would reserve against
    // an id that can never actually be produced by nextId().
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) continue;
    if (n >= counter) {
      counter = n + 1;
      reserved++;
    }
  }
  return reserved;
}