import type { PageSetup } from "../types/chemistry";
import { BOND_LEN } from "./constants";
import {
  PUBLICATION_PRESETS,
  computePublicationPlacement,
  findPublicationPreset,
  type PublicationPlacement,
  type PublicationPreset,
} from "./publicationPresets";

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

/**
 * Printable margin for a fresh page, in points. Matches the A4 publication
 * preset's 1 cm so opening the page dialog on a new tab doesn't silently
 * change where a PDF puts the drawing.
 */
export const DEFAULT_PAGE_MARGIN = 28.35;

export type PageOrientation = "portrait" | "landscape";

/** Paper choices offered by the page dialog, in the same order/labels as
 * the export presets they are derived from. */
export const PAPER_PRESETS: PublicationPreset[] = PUBLICATION_PRESETS;

export function findPaperPreset(id: string): PublicationPreset {
  return findPublicationPreset(id);
}

/** A fresh tab's page: A4 portrait at the origin, with ChemDraw's defaults. */
export function defaultPageSetup(): PageSetup {
  return {
    x: 0,
    y: 0,
    width: A4_PAGE_WIDTH,
    height: A4_PAGE_HEIGHT,
    bondLength: DEFAULT_BOND_LENGTH,
    marginWidth: DEFAULT_MARGIN_WIDTH,
    margin: DEFAULT_PAGE_MARGIN,
  };
}

export function pageOrientation(page: PageSetup): PageOrientation {
  return page.width > page.height ? "landscape" : "portrait";
}

/**
 * Builds a page from a paper preset and orientation. The preset's bond
 * length and margin travel with the paper, which is what makes "ACS single
 * column" also mean "10 pt bonds" without the user setting that twice.
 */
export function pageSetupFromPreset(preset: PublicationPreset, orientation: PageOrientation = "portrait"): PageSetup {
  const [shortSide, longSide] = [Math.min(preset.widthPt, preset.heightPt), Math.max(preset.widthPt, preset.heightPt)];
  return {
    x: 0,
    y: 0,
    width: orientation === "landscape" ? longSide : shortSide,
    height: orientation === "landscape" ? shortSide : longSide,
    bondLength: preset.bondLengthPt,
    marginWidth: DEFAULT_MARGIN_WIDTH,
    margin: preset.marginPt,
  };
}

/**
 * Returns the paper preset whose dimensions match `page`, if any. Used by the
 * dialog to preselect a paper size; a custom size simply leaves the select on
 * "Custom".
 */
export function matchingPaperPreset(page: PageSetup): PublicationPreset | null {
  const orientation = pageOrientation(page);
  for (const preset of PAPER_PRESETS) {
    const candidate = pageSetupFromPreset(preset, orientation);
    if (Math.abs(candidate.width - page.width) < 0.5 && Math.abs(candidate.height - page.height) < 0.5) {
      return preset;
    }
  }
  return null;
}

/** The preset-shaped view of a page, so PDF/print and the preset math share
 * one placement implementation. */
export function pageAsPlacementPreset(page: PageSetup): PublicationPreset {
  return {
    id: "page",
    labelKey: "pageSetup.title",
    widthPt: page.width,
    heightPt: page.height,
    bondLengthPt: page.bondLength,
    marginPt: page.margin ?? DEFAULT_PAGE_MARGIN,
  };
}

/**
 * Places a drawing of `contentWidth` x `contentHeight` canvas units on a
 * page. This is the single placement used by PDF and print, so what the page
 * dialog says is what gets printed.
 */
export function computePagePlacement(
  contentWidth: number,
  contentHeight: number,
  page: PageSetup
): PublicationPlacement {
  return computePublicationPlacement(contentWidth, contentHeight, pageAsPlacementPreset(page));
}

/** World units -> page points. */
export function pointsPerWorldUnit(page: PageSetup): number {
  return page.bondLength / BOND_LEN;
}

/** Page points -> world units (the inverse of pointsPerWorldUnit). */
export function worldUnitsPerPoint(page: PageSetup): number {
  return BOND_LEN / page.bondLength;
}

/** The page box in canvas/world coordinates, for drawing its outline. */
export function pageBoundsInWorld(page: PageSetup): { x: number; y: number; width: number; height: number } {
  const f = worldUnitsPerPoint(page);
  return { x: page.x * f, y: page.y * f, width: page.width * f, height: page.height * f };
}

export type RulerUnit = "mm" | "in" | "bond";

/** How many world units one ruler unit spans. Physical units follow the
 * page's own bond length, the same scale CDXML export uses. */
export function worldUnitsPerRulerUnit(page: PageSetup, unit: RulerUnit): number {
  if (unit === "bond") return BOND_LEN;
  const pointsPerUnit = unit === "mm" ? 72 / 25.4 : 72;
  return pointsPerUnit / pointsPerWorldUnit(page);
}

/** Ruler label for a world coordinate measured from the page origin. */
export function rulerLabel(page: PageSetup, unit: RulerUnit, world: number): string {
  const value = world / worldUnitsPerRulerUnit(page, unit);
  if (unit === "bond") return `${formatTick(value)}×`;
  const rounded = Math.abs(value) < 1e-9 ? 0 : value;
  return `${formatTick(rounded)} ${unit === "mm" ? "mm" : "in"}`;
}

function formatTick(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
