import { describe, expect, test } from "vitest";
import { approximateSpanishIupacName } from "./compoundTranslate";

describe("approximateSpanishIupacName", () => {
  test("translates a simple ester", () => {
    expect(approximateSpanishIupacName("methyl acetate")).toBe("acetato de metilo");
  });

  test("translates a carboxylic acid", () => {
    expect(approximateSpanishIupacName("acetic acid")).toBe("ácido acetico");
  });

  test("translates a plain alkane/ring name", () => {
    expect(approximateSpanishIupacName("cyclohexane")).toBe("ciclohexano");
  });

  test("translates an irregular aromatic name", () => {
    expect(approximateSpanishIupacName("benzaldehyde")).toBe("benzaldehído");
  });

  // Regression test for a real bug: PubChem's name for two disconnected
  // structures looked up together (see lookupIupacName's doc comment)
  // joins them with the English word "and", which nothing in this
  // function used to touch — only chemical vocabulary, not connectives —
  // so it was passing straight through into the "Spanish" result exactly
  // as the user saw it.
  describe("multi-component names ('and')", () => {
    test("translates 'and' to 'y' between two plain names", () => {
      expect(approximateSpanishIupacName("ethanol and methanol")).toBe("etanol y metanol");
    });

    test("does not mistranslate a name that merely contains 'and' as a substring", () => {
      // "androstane" must not become "yrostane" — \band\b is
      // word-boundary-anchored specifically to avoid this.
      expect(approximateSpanishIupacName("androstane")).not.toContain("yrostane");
      expect(approximateSpanishIupacName("androstane")).toBe("androstano");
    });

    test("a multi-component name ending in 'acid' does not trigger the single-acid restructuring", () => {
      // Before the isMultiComponent guard, the acid regex (anchored across
      // the *whole* string) would match with capture group 1 = "ethanol
      // and acetic", producing a garbled "ácido etanol y acetico" instead
      // of leaving the acid's own "acid" suffix for plain word-for-word
      // translation.
      const result = approximateSpanishIupacName("ethanol and acetic acid");
      expect(result).not.toMatch(/^ácido/);
      expect(result).toBe("etanol y acetic acid");
    });

    test("a multi-component name where one part is an ester does not trigger ester restructuring", () => {
      // "methyl acetate and ethanol" doesn't end in "ate" as a whole
      // string, so the (already end-anchored) ester regex was never at
      // risk here — this just confirms the guard doesn't change that.
      const result = approximateSpanishIupacName("methyl acetate and ethanol");
      expect(result).not.toContain(" and ");
      expect(result).toContain(" y ");
    });
  });
});
