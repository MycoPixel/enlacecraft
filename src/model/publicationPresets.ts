import { BOND_LEN } from "./constants";

/**
 * Publication export presets.
 *
 * A drawing is authored in abstract canvas units (BOND_LEN of them per
 * average bond), so "make the bonds 12 pt" is the only instruction that
 * transfers cleanly to paper. Each preset therefore pairs a physical page
 * with a target bond length; `computePublicationPlacement` maps the
 * drawing's measured bounds into that physical space.
 *
 * Sizes are in PostScript points (1/72 in), which is what jsPDF, CSS print
 * styles and CDXML all use, so no unit conversion is needed at the call
 * sites.
 */
export interface PublicationPreset {
  id: string;
  /** i18n key, so the menu can localise the label. */
  labelKey: string;
  /** Page width in points. */
  widthPt: number;
  /** Page height in points. */
  heightPt: number;
  /** Desired bond length on the page, in points. */
  bondLengthPt: number;
  /** Safe margin kept clear on every side, in points. */
  marginPt: number;
}

const IN = 72;

export const PUBLICATION_PRESETS: PublicationPreset[] = [
  {
    id: "a4",
    labelKey: "export.presetA4",
    widthPt: 595.28,
    heightPt: 841.89,
    bondLengthPt: 30,
    marginPt: 28.35, // 1 cm
  },
  {
    id: "letter",
    labelKey: "export.presetLetter",
    widthPt: 8.5 * IN,
    heightPt: 11 * IN,
    bondLengthPt: 30,
    marginPt: 0.5 * IN,
  },
  {
    id: "acs-single",
    labelKey: "export.presetAcsSingle",
    widthPt: 3.25 * IN,
    heightPt: 9 * IN,
    bondLengthPt: 10,
    marginPt: 0.25 * IN,
  },
  {
    id: "acs-double",
    labelKey: "export.presetAcsDouble",
    widthPt: 7 * IN,
    heightPt: 9.5 * IN,
    bondLengthPt: 12,
    marginPt: 0.33 * IN,
  },
];

export const DEFAULT_PUBLICATION_PRESET_ID = "a4";

export function findPublicationPreset(id: string): PublicationPreset {
  return PUBLICATION_PRESETS.find((preset) => preset.id === id) ?? PUBLICATION_PRESETS[0];
}

export interface PublicationPlacement {
  pageWidthPt: number;
  pageHeightPt: number;
  /** Top-left corner of the rendered drawing, in page points. */
  xPt: number;
  yPt: number;
  /** Rendered drawing size, in page points. */
  widthPt: number;
  heightPt: number;
  /**
   * World units -> page points. Equals `bondLengthPt / BOND_LEN` unless the
   * drawing had to be shrunk to fit inside the margins, in which case it is
   * proportionally smaller.
   */
  scale: number;
}

/**
 * Places a drawing of `contentWidth` x `contentHeight` canvas units on a
 * preset's page.
 *
 * The requested bond length sets the scale. Keeping that scale fixed is what
 * makes two separately exported figures look consistent in a manuscript, so
 * it is only reduced when the scaled drawing would not fit inside the
 * printable area — a large scheme on a narrow single-column page, for
 * example. The drawing is then centred horizontally and vertically.
 */
export function computePublicationPlacement(
  contentWidth: number,
  contentHeight: number,
  preset: PublicationPreset
): PublicationPlacement {
  const width = Number.isFinite(contentWidth) && contentWidth > 0 ? contentWidth : 1;
  const height = Number.isFinite(contentHeight) && contentHeight > 0 ? contentHeight : 1;
  const margin = Math.max(0, preset.marginPt);
  const availableWidth = Math.max(1, preset.widthPt - margin * 2);
  const availableHeight = Math.max(1, preset.heightPt - margin * 2);

  const desiredScale = preset.bondLengthPt / BOND_LEN;
  const fitScale = Math.min(availableWidth / width, availableHeight / height);
  const scale = Math.max(0.0001, Math.min(desiredScale, fitScale));

  const widthPt = width * scale;
  const heightPt = height * scale;

  return {
    pageWidthPt: preset.widthPt,
    pageHeightPt: preset.heightPt,
    xPt: (preset.widthPt - widthPt) / 2,
    yPt: (preset.heightPt - heightPt) / 2,
    widthPt,
    heightPt,
    scale,
  };
}
