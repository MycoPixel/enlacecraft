import { describe, expect, test } from "vitest";
import {
  buildStructureStyle,
  buildSurfaceSpec,
  clampSurfaceOpacity,
  styleLabelKey,
  colorLabelKey,
  surfaceLabelKey,
  STRUCTURE3D_STYLES,
  STRUCTURE3D_COLOR_SCHEMES,
  STRUCTURE3D_SURFACES,
  DEFAULT_STRUCTURE3D_SURFACE_OPACITY,
  MIN_STRUCTURE3D_SURFACE_OPACITY,
  MAX_STRUCTURE3D_SURFACE_OPACITY,
} from "./structureStyle";
import { translate } from "../../i18n/translate";

describe("buildStructureStyle", () => {
  test("ball-and-stick draws both sticks and spheres at the familiar default sizes", () => {
    const spec = buildStructureStyle("ball-and-stick", "element");
    expect(spec.stick?.radius).toBe(0.14);
    expect(spec.sphere?.scale).toBe(0.28);
  });

  test("space-filling draws spheres at full VDW size and no sticks at all", () => {
    const spec = buildStructureStyle("space-filling", "element");
    expect(spec.stick).toBeUndefined();
    expect(spec.sphere?.scale).toBe(1);
  });

  test("stick draws bonds only", () => {
    const spec = buildStructureStyle("stick", "element");
    expect(spec.stick).toBeDefined();
    expect(spec.sphere).toBeUndefined();
  });

  test("wireframe draws very thin sticks", () => {
    expect(buildStructureStyle("wireframe", "element").stick?.radius).toBe(0.03);
  });

  test('"element" maps onto 3Dmol\'s Jmol scheme', () => {
    const spec = buildStructureStyle("ball-and-stick", "element");
    expect(spec.stick?.colorscheme).toBe("Jmol");
    expect(spec.sphere?.colorscheme).toBe("Jmol");
  });

  test("carbon-tinted schemes pass their name straight through", () => {
    expect(buildStructureStyle("stick", "greenCarbon").stick?.colorscheme).toBe("greenCarbon");
  });

  test("monochrome sets a fixed color on every representation, never a colorscheme", () => {
    // The reason this is special-cased rather than just another scheme name:
    // the built-in schemes are all element- or carbon-keyed, so there is no
    // built-in "one color for everything" preset.
    const spec = buildStructureStyle("ball-and-stick", "monochrome");
    expect(spec.stick?.color).toBeDefined();
    expect(spec.stick?.colorscheme).toBeUndefined();
    expect(spec.sphere?.color).toBe(spec.stick?.color);
    expect(spec.sphere?.colorscheme).toBeUndefined();
  });

  test("an unknown style falls back to ball-and-stick rather than throwing", () => {
    expect(buildStructureStyle("nonsense" as never, "element").stick?.radius).toBe(0.14);
  });

  test("every style resolves to at least one representation", () => {
    for (const s of STRUCTURE3D_STYLES) {
      const spec = buildStructureStyle(s.id, "element");
      expect(spec.stick || spec.sphere).toBeTruthy();
    }
  });
});

describe("style/color label keys", () => {
  test("resolve to real translations in every supported language", () => {
    // translate() falls back to echoing the key itself when a lookup misses,
    // so a mistyped key would render as raw "view3d.rep_ballAndStick" in the
    // UI with no error anywhere. These assertions are what catch that.
    for (const lang of ["en", "es"] as const) {
      for (const s of STRUCTURE3D_STYLES) {
        expect(translate(lang, styleLabelKey(s.id))).not.toBe(styleLabelKey(s.id));
      }
      for (const scheme of STRUCTURE3D_COLOR_SCHEMES) {
        expect(translate(lang, colorLabelKey(scheme))).not.toBe(colorLabelKey(scheme));
      }
    }
  });

  test("generate the exact key shapes the translation table uses", () => {
    expect(styleLabelKey("ball-and-stick")).toBe("view3d.rep_ballAndStick");
    expect(styleLabelKey("space-filling")).toBe("view3d.rep_spaceFilling");
    expect(colorLabelKey("element")).toBe("view3d.color_element");
    expect(colorLabelKey("greenCarbon")).toBe("view3d.color_green-carbon");
    expect(colorLabelKey("whiteCarbon")).toBe("view3d.color_white-carbon");
  });
});
describe("buildSurfaceSpec", () => {
  test('"none" draws no surface at all', () => {
    expect(buildSurfaceSpec("none", "element", 0.75)).toBeNull();
  });

  test("each surface id maps onto its 3Dmol SurfaceType name", () => {
    expect(buildSurfaceSpec("vdw", "element", 0.75)?.type).toBe("VDW");
    expect(buildSurfaceSpec("sas", "element", 0.75)?.type).toBe("SAS");
    expect(buildSurfaceSpec("ses", "element", 0.75)?.type).toBe("SES");
  });

  test("element coloring uses the same Jmol scheme as the atom style", () => {
    const spec = buildSurfaceSpec("vdw", "element", 0.75);
    expect(spec?.style.colorscheme).toBe("Jmol");
    expect(spec?.style.color).toBeUndefined();
    expect(buildStructureStyle("stick", "element").stick?.colorscheme).toBe("Jmol");
  });

  test("monochrome uses a fixed color, matching the atom style's grey", () => {
    const surface = buildSurfaceSpec("vdw", "monochrome", 0.75);
    const atoms = buildStructureStyle("stick", "monochrome");
    expect(surface?.style.color).toBe(atoms.stick?.color);
    expect(surface?.style.colorscheme).toBeUndefined();
  });

  test("opacity is clamped to the slider's range", () => {
    expect(buildSurfaceSpec("vdw", "element", -5)?.style.opacity).toBe(MIN_STRUCTURE3D_SURFACE_OPACITY);
    expect(buildSurfaceSpec("vdw", "element", 5)?.style.opacity).toBe(MAX_STRUCTURE3D_SURFACE_OPACITY);
    expect(buildSurfaceSpec("vdw", "element", 0.5)?.style.opacity).toBe(0.5);
  });

  test("a non-finite opacity falls back to the default rather than hiding the surface", () => {
    expect(buildSurfaceSpec("vdw", "element", Number.NaN)?.style.opacity).toBe(DEFAULT_STRUCTURE3D_SURFACE_OPACITY);
    expect(clampSurfaceOpacity(Infinity)).toBe(DEFAULT_STRUCTURE3D_SURFACE_OPACITY);
  });
});

describe("surface label keys", () => {
  test("resolve to real translations in every supported language", () => {
    for (const lang of ["en", "es"] as const) {
      for (const s of STRUCTURE3D_SURFACES) {
        expect(translate(lang, surfaceLabelKey(s))).not.toBe(surfaceLabelKey(s));
      }
      expect(translate(lang, "view3d.surfaceOpacity")).not.toBe("view3d.surfaceOpacity");
    }
  });

  test("generate the exact key shape the translation table uses", () => {
    expect(surfaceLabelKey("vdw")).toBe("view3d.surface_vdw");
    expect(surfaceLabelKey("none")).toBe("view3d.surface_none");
  });
});
