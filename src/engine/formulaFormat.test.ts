import { describe, expect, test } from "vitest";
import { autoFormatFormulaHtml, formatFormulaHtml, formulaSegments } from "./formulaFormat";

describe("formulaSegments", () => {
  test("subscripts digit runs that follow a letter or closing bracket", () => {
    expect(formatFormulaHtml("H2SO4")).toBe("H<sub>2</sub>SO<sub>4</sub>");
    expect(formatFormulaHtml("C12H22O11")).toBe("C<sub>12</sub>H<sub>22</sub>O<sub>11</sub>");
    expect(formatFormulaHtml("Et3N")).toBe("Et<sub>3</sub>N");
    expect(formatFormulaHtml("NaBH4")).toBe("NaBH<sub>4</sub>");
    expect(formatFormulaHtml("(NH4)2SO4")).toBe("(NH<sub>4</sub>)<sub>2</sub>SO<sub>4</sub>");
  });

  test("leaves quantities, ratios, temperatures and charges alone", () => {
    expect(formatFormulaHtml("3 h")).toBe("3 h");
    expect(formatFormulaHtml("24 h")).toBe("24 h");
    expect(formatFormulaHtml("1:1")).toBe("1:1");
    expect(formatFormulaHtml("80 °C")).toBe("80 °C");
    expect(formatFormulaHtml("pH 7.4")).toBe("pH 7.4");
    expect(formatFormulaHtml("Fe3+")).toBe("Fe3+");
    expect(formatFormulaHtml("SO4-")).toBe("SO4-");
  });

  test("escapes markup characters in the text", () => {
    expect(formatFormulaHtml("H2O & <x>")).toBe("H<sub>2</sub>O &amp; &lt;x&gt;");
  });

  test("reports subscript runs separately from the plain text", () => {
    expect(formulaSegments("H2SO4")).toEqual([
      { text: "H", sub: false },
      { text: "2", sub: true },
      { text: "S", sub: false },
      { text: "O", sub: false },
      { text: "4", sub: true },
    ]);
  });
});

describe("autoFormatFormulaHtml", () => {
  test("formats a plain annotation", () => {
    expect(autoFormatFormulaHtml("H2SO4, heat")).toBe("H<sub>2</sub>SO<sub>4</sub>, heat");
  });

  test("is idempotent and keeps hand-made sub/superscripts", () => {
    const once = autoFormatFormulaHtml("H2SO4");
    expect(autoFormatFormulaHtml(once)).toBe(once);
    expect(autoFormatFormulaHtml("H<sub>2</sub>SO4")).toBe("H<sub>2</sub>SO<sub>4</sub>");
    expect(autoFormatFormulaHtml("Fe<sup>3+</sup>")).toBe("Fe<sup>3+</sup>");
  });

  test("preserves bold/italic/span markup and formats inside it", () => {
    expect(autoFormatFormulaHtml("<b>H2SO4</b>")).toBe("<b>H<sub>2</sub>SO<sub>4</sub></b>");
    expect(autoFormatFormulaHtml('<span style="color: red">C6H12O6</span>')).toBe(
      '<span style="color: red">C<sub>6</sub>H<sub>12</sub>O<sub>6</sub></span>'
    );
  });

  test("tracks the preceding character across tag boundaries", () => {
    expect(autoFormatFormulaHtml("H<b>2</b>SO4")).toBe("H<b><sub>2</sub></b>SO<sub>4</sub>");
  });

  test("does not subscript a charge whose sign is inside another tag", () => {
    expect(autoFormatFormulaHtml("Fe3<b>+</b>")).toBe("Fe3<b>+</b>");
  });

  test("leaves existing text markup-free content untouched", () => {
    const html = "<b>+</b>";
    expect(autoFormatFormulaHtml(html)).toBe(html);
  });
});
