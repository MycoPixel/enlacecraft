import type { AtomStyleSpec } from "3dmol/build/types/GLModel";
import type { SurfaceStyleSpec } from "3dmol/build/types/GLViewer";

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

/**
 * A molecular surface drawn around the structure. "none" is the ordinary
 * stick/sphere view; the three surfaces answer different questions:
 *
 *  - VDW: the van der Waals envelope — the atom's literal collision surface.
 *  - SAS: solvent-accessible surface — where a water-sized probe's *center*
 *    can reach, so it reads as the VDW surface inflated by the probe.
 *  - SES: solvent-excluded surface (Connolly) — the physical surface a probe
 *    touches, with concave pockets smoothed over.
 */
export type Structure3DSurface = "none" | "vdw" | "sas" | "ses";

export const STRUCTURE3D_SURFACES: Structure3DSurface[] = ["none", "vdw", "sas", "ses"];

/** Translation key for a surface option, e.g. "vdw" -> "view3d.surface_vdw". */
export function surfaceLabelKey(surface: Structure3DSurface): string {
  return `view3d.surface_${surface}`;
}

/** Default opacity for a surface overlay. Chosen so the sticks/spheres stay
 * readable through it while the surface still reads as a solid envelope. */
export const DEFAULT_STRUCTURE3D_SURFACE_OPACITY = 0.75;
export const MIN_STRUCTURE3D_SURFACE_OPACITY = 0.1;
export const MAX_STRUCTURE3D_SURFACE_OPACITY = 1;

/** Clamps an opacity to the range the slider offers, so a hand-edited
 * localStorage value (or a NaN from a bad parse) can't hide the surface
 * entirely or blow past fully opaque. */
export function clampSurfaceOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return DEFAULT_STRUCTURE3D_SURFACE_OPACITY;
  return Math.min(MAX_STRUCTURE3D_SURFACE_OPACITY, Math.max(MIN_STRUCTURE3D_SURFACE_OPACITY, opacity));
}

/**
 * The one place a coloring preference becomes 3Dmol color fields, shared by
 * the atom style and the surface so the two can never disagree about what
 * "monochrome" or "green carbon" means.
 *
 * "monochrome" is an explicit grey rather than a 3Dmol colorscheme name,
 * because the built-in schemes are all element- or carbon- *keyed* — there's
 * no "one color for everything" preset, and picking "whiteCarbon" would still
 * leave oxygen red and nitrogen blue.
 */
export function resolveColorSpec(colorScheme: Structure3DColorScheme): { colorscheme?: string; color?: string } {
  if (colorScheme === "monochrome") return { color: "#8a8f98" };
  return { colorscheme: colorScheme === "element" ? "Jmol" : colorScheme };
}

export interface Structure3DSurfaceSpec {
  /** 3Dmol surface type name; see $3Dmol.SurfaceType. */
  type: "VDW" | "SAS" | "SES";
  style: SurfaceStyleSpec;
}

/** Builds the addSurface() type + style for a surface preference, or null
 * when no surface is selected. Pure and testable like buildStructureStyle. */
export function buildSurfaceSpec(
  surface: Structure3DSurface,
  colorScheme: Structure3DColorScheme,
  opacity: number
): Structure3DSurfaceSpec | null {
  if (surface === "none") return null;
  const type = surface === "vdw" ? "VDW" : surface === "sas" ? "SAS" : "SES";
  return {
    type,
    style: { opacity: clampSurfaceOpacity(opacity), ...resolveColorSpec(colorScheme) },
  };
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

  const color = resolveColorSpec(colorScheme);
  if (spec.stick) {
    if (color.color) spec.stick.color = color.color;
    if (color.colorscheme) spec.stick.colorscheme = color.colorscheme;
  }
  if (spec.sphere) {
    if (color.color) spec.sphere.color = color.color;
    if (color.colorscheme) spec.sphere.colorscheme = color.colorscheme;
  }

  return spec;
}