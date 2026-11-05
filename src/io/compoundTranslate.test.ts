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

  // Reported from real lookups: the upstream name sometimes ends in a bare
  // English chain stem ("heptan") instead of the full "-ane", which the
  // generic `ane\b` rule cannot see. Spanish still needs the final "-o".
  describe("bare parent-chain endings", () => {
    test("adds the final -o to elided alkane stems", () => {
      expect(approximateSpanishIupacName("methan")).toBe("metano");
      expect(approximateSpanishIupacName("ethan")).toBe("etano");
      expect(approximateSpanishIupacName("propan")).toBe("propano");
      expect(approximateSpanishIupacName("butan")).toBe("butano");
      expect(approximateSpanishIupacName("pentan")).toBe("pentano");
      expect(approximateSpanishIupacName("hexan")).toBe("hexano");
      expect(approximateSpanishIupacName("heptan")).toBe("heptano");
      expect(approximateSpanishIupacName("octan")).toBe("octano");
      expect(approximateSpanishIupacName("nonan")).toBe("nonano");
      expect(approximateSpanishIupacName("decan")).toBe("decano");
    });

    test("keeps the chain stem when a suffix follows it", () => {
      // "heptan-2-ol" is a valid elided form in its own right; only the
      // very end of the name is rewritten, so the stem stays intact.
      expect(approximateSpanishIupacName("heptan-2-ol")).toBe("heptan-2-ol");
      expect(approximateSpanishIupacName("hexan-1-amine")).toBe("hexan-1-amina");
    });

    test("does not touch an unrelated word that merely ends in -an", () => {
      expect(approximateSpanishIupacName("furan")).toBe("furano");
      // Only alkane stems are in the ending rule; an elided steroid parent
      // is left as the upstream generator wrote it rather than guessed at.
      expect(approximateSpanishIupacName("androstan")).toBe("androstan");
    });
  });

  // Reported from a real lookup: "1-ethyl-4-t-butilcyclohexane" cited the
  // substituents in locant order instead of alphabetically. t-Butyl starts
  // with b, ethyl with e, so t-butyl is cited first. Locants stay attached
  // to their own substituent (this is a citation-order fix, not a
  // renumbering), so the result is "4-t-butil-1-etilciclohexano".
  describe("substituent alphabetisation", () => {
    test("cites t-butyl before ethyl", () => {
      expect(approximateSpanishIupacName("1-ethyl-4-t-butylcyclohexane")).toBe(
        "4-t-butil-1-etilciclohexano",
      );
    });

    test("expanded tert- prefix sorts under the substituent's own letter", () => {
      expect(approximateSpanishIupacName("1-ethyl-4-tert-butylcyclohexane")).toBe(
        "4-tert-butil-1-etilciclohexano",
      );
    });

    test("reorders a simpler pair by first letter", () => {
      expect(approximateSpanishIupacName("1-methyl-4-ethylcyclohexane")).toBe(
        "4-etil-1-metilciclohexano",
      );
    });

    test("leaves an already-alphabetical name unchanged", () => {
      expect(approximateSpanishIupacName("1-bromo-3-chlorobenzene")).toBe(
        "1-bromo-3-clorobenceno",
      );
      expect(approximateSpanishIupacName("1-chloro-4-methylbenzene")).toBe(
        "1-cloro-4-metilbenceno",
      );
    });

    test("ignores multiplicative prefixes when ordering", () => {
      // ethyl (e) before dimethyl (d for the underlying methyl, since
      // "di-" does not count) — and a multi-locant group keeps its locants.
      expect(approximateSpanishIupacName("4-ethyl-1,1-dimethylcyclohexane")).toBe(
        "4-etil-1,1-dimetilciclohexano",
      );
      expect(approximateSpanishIupacName("1,2-dimethylcyclohexane")).toBe(
        "1,2-dimetilciclohexano",
      );
      // The same multiplicative rule applies to non-yl prefixes, so a name
      // whose source order is locant-based still gets alphabetised.
      expect(approximateSpanishIupacName("1-ethyl-2,4-dichlorobenzene")).toBe(
        "2,4-dicloro-1-etilbenceno",
      );
    });

    test("leaves names with fewer than two substituents alone", () => {
      expect(approximateSpanishIupacName("2-methylhexane")).toBe("2-metilhexano");
      expect(approximateSpanishIupacName("tert-butylbenzene")).toBe("tert-butilbenceno");
    });
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
