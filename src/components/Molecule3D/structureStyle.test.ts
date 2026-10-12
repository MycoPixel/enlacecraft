import { describe, expect, test } from "vitest";
import { buildStructureStyle, styleLabelKey, colorLabelKey, STRUCTURE3D_STYLES, STRUCTURE3D_COLOR_SCHEMES } from "./structureStyle";
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