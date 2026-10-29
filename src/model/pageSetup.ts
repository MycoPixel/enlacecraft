import type { PageSetup } from "../types/chemistry";

/**
 * ChemDraw's default drawing/page constants, in CDXML units (points).
 *
 * These are the values a fresh tab starts with and the fallbacks used when an
 * imported file leaves something out. Keeping them in one place means the
 * CDXML reader/writer, project validation and store defaults can't drift
 * apart — a mismatch here would make a file gain or lose a page size every
 * time it was opened and saved.
 */

/** ChemDraw's default fixed bond length: 30 pt = 0.4167 in. */
export const DEFAULT_BOND_LENGTH = 30;

/** ChemDraw's default atom-label margin (CDXML MarginWidth): 2 pt. */
export const DEFAULT_MARGIN_WIDTH = 2;

/** A4 portrait, in points — ChemDraw's default paper. */
export const A4_PAGE_WIDTH = 595.28;
export const A4_PAGE_HEIGHT = 841.89;

/** A fresh tab's page: A4 portrait at the origin, with ChemDraw's defaults. */
export function defaultPageSetup(): PageSetup {
  return {
    x: 0,
    y: 0,
    width: A4_PAGE_WIDTH,
    height: A4_PAGE_HEIGHT,
    bondLength: DEFAULT_BOND_LENGTH,
    marginWidth: DEFAULT_MARGIN_WIDTH,
  };
}
