import type { AtomStyleSpec } from "3dmol/build/types/GLModel";

/**
 * How the 3D structure is drawn — the "representation" in molecular
 * visualization terms. These are the handful of conventions a chemist
 * actually switches between; each one answers a different question
 * ("what's the shape?" / "how much room does this atom take?" / "where
 * are the bonds?"), which is why a single hardcoded stick+sphere look
 * can't serve all of them.
 */
export type Structure3DStyle = "ball-and-stick" | "space-filling" | "stick" | "licorice" | "wireframe";

/** Element coloring options. "element" is the standard CPK-ish Jmol palette. */
export type Structure3DColorScheme = "element" | "monochrome" | "greenCarbon" | "cyanCarbon" | "magentaCarbon" | "purpleCarbon" | "whiteCarbon";

export const STRUCTURE3D_STYLES: Structure3DStyleOption[] = [
  { id: "ball-and-stick", radii: { stick: 0.14, sphere: 0.28 } },
  { id: "space-filling", radii: { sphere: 1.0 } },
  { id: "stick", radii: { stick: 0.18 } },
  { id: "licorice", radii: { stick: 0.25, sphere: 0.4 } },
  { id: "wireframe", radii: { stick: 0.03 } },
];

export const STRUCTURE3D_COLOR_SCHEMES: Structure3DColorScheme[] = [
  "element",
  "monochrome",
  "greenCarbon",
  "cyanCarbon",
  "magentaCarbon",
  "purpleCarbon",
  "whiteCarbon",
];

/** Translation key suffix for a representation, e.g. "ball-and-stick" ->
 * "rep_ballAndStick". Lives here rather than inline in the panel so the
 * mapping from id to translation key is defined in one place. */
export function styleLabelKey(style: Structure3DStyle): string {
  return `view3d.rep_${style.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase())}`;
}

/** Translation key suffix for a coloring, e.g. "greenCarbon" ->
 * "color_green-carbon". The hyphenated (rather than camelCase) form is what
 * the translation table uses. */
export function colorLabelKey(scheme: Structure3DColorScheme): string {
  return `view3d.color_${scheme.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

interface Structure3DStyleOption {
  id: Structure3DStyle;
  /** Radius for each representation the style uses. Absent key = that
   * representation isn't drawn at all, which is how "space-filling" hides
   * sticks and "stick" hides spheres. */
  radii: { stick?: number; sphere?: number };
}

/**
 * Builds the 3Dmol style spec for a representation + coloring combination.
 *
 * Deliberately a pure function returning a fresh spec rather than an
 * imperative viewer call: it makes the mapping testable (see
 * structureStyle.test.ts) and lets the viewer re-apply the whole style
 * with one call after loading a model or changing a preference, without
 * having to know how a given representation is built out of primitives.
 *
 * "monochrome" is handled with an explicit grey rather than a 3Dmol
 * colorscheme name, because the built-in schemes are all element- or
 * carbon- *keyed* — there's no "one color for everything" preset, and
 * picking "whiteCarbon" would still leave oxygen red and nitrogen blue.
 */
export function buildStructureStyle(
  style: Structure3DStyle,
  colorScheme: Structure3DColorScheme
): AtomStyleSpec {
  const option = STRUCTURE3D_STYLES.find((s) => s.id === style) ?? STRUCTURE3D_STYLES[0];

  const spec: {
    stick?: { radius?: number; colorscheme?: string; color?: string };
    sphere?: { scale?: number; colorscheme?: string; color?: string };
  } = {};

  if (option.radii.stick !== undefined) {
    spec.stick = { radius: option.radii.stick };
  }
  if (option.radii.sphere !== undefined) {
    // sphere uses `scale` (a multiple of the VDW radius), not `radius`.
    spec.sphere = { scale: option.radii.sphere };
  }

  if (colorScheme === "monochrome") {
    if (spec.stick) spec.stick.color = "#8a8f98";
    if (spec.sphere) spec.sphere.color = "#8a8f98";
  } else {
    const scheme = colorScheme === "element" ? "Jmol" : colorScheme;
    if (spec.stick) spec.stick.colorscheme = scheme;
    if (spec.sphere) spec.sphere.colorscheme = scheme;
  }

  return spec;
}