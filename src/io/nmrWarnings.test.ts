import { describe, expect, test } from "vitest";
import { translateNmrWarning } from "./nmrWarnings";

describe("translateNmrWarning", () => {
  describe("English", () => {
    // English must render byte-for-byte identical to the server's raw
    // text — these templates were reconstructed from NMRGraph's own
    // src/api/main.py specifically so the "en" case is a pure passthrough,
    // never a paraphrase that could quietly drift from the server's actual
    // wording.
    test("no carbon atoms — exact passthrough", () => {
      const raw = "No carbon atoms in this molecule - nothing to predict.";
      expect(translateNmrWarning(raw, "en")).toBe(raw);
    });

    test("unusual elements — exact passthrough, list preserved verbatim", () => {
      const raw =
        "Contains Fe, Zn - rarely seen in training data (organometallics and unusual elements are a known weak spot). Treat these predictions with extra skepticism.";
      expect(translateNmrWarning(raw, "en")).toBe(raw);
    });

    test("ring stereochemistry — exact passthrough, count preserved (this is the exact string the user reported)", () => {
      const raw =
        "This structure has ring stereochemistry that isn't fully specified (e.g. cis/trans not indicated) - showing all 2 possible stereoisomer(s) below instead of one ambiguous averaged result. Draw the specific stereochemistry instead if you already know which one you want.";
      expect(translateNmrWarning(raw, "en")).toBe(raw);
    });
  });

  describe("Spanish", () => {
    test("no carbon atoms is translated", () => {
      const raw = "No carbon atoms in this molecule - nothing to predict.";
      const result = translateNmrWarning(raw, "es");
      expect(result).not.toBe(raw);
      expect(result).toContain("carbono");
    });

    test("unusual elements is translated and the element list is carried through unchanged", () => {
      const raw =
        "Contains Fe, Zn - rarely seen in training data (organometallics and unusual elements are a known weak spot). Treat these predictions with extra skepticism.";
      const result = translateNmrWarning(raw, "es");
      expect(result).not.toContain("Contains");
      expect(result).toContain("Fe, Zn");
    });

    test("a single unusual element (no comma) still matches", () => {
      const raw =
        "Contains Fe - rarely seen in training data (organometallics and unusual elements are a known weak spot). Treat these predictions with extra skepticism.";
      const result = translateNmrWarning(raw, "es");
      expect(result).not.toContain("Contains");
      expect(result).toContain("Fe");
    });

    test("ring stereochemistry is translated and the isomer count is carried through correctly", () => {
      const raw =
        "This structure has ring stereochemistry that isn't fully specified (e.g. cis/trans not indicated) - showing all 2 possible stereoisomer(s) below instead of one ambiguous averaged result. Draw the specific stereochemistry instead if you already know which one you want.";
      const result = translateNmrWarning(raw, "es");
      expect(result).not.toContain("This structure");
      expect(result).not.toContain("stereochemistry");
      expect(result).toContain("2");
    });

    test("a different isomer count (e.g. 4) is carried through correctly, not hardcoded", () => {
      const raw =
        "This structure has ring stereochemistry that isn't fully specified (e.g. cis/trans not indicated) - showing all 4 possible stereoisomer(s) below instead of one ambiguous averaged result. Draw the specific stereochemistry instead if you already know which one you want.";
      const result = translateNmrWarning(raw, "es");
      expect(result).toContain("4");
      expect(result).not.toContain(" 2 ");
    });
  });

  describe("unrecognized warnings", () => {
    test("falls back to the raw text unchanged rather than dropping or garbling it", () => {
      const raw = "Some future warning the server doesn't send today.";
      expect(translateNmrWarning(raw, "es")).toBe(raw);
      expect(translateNmrWarning(raw, "en")).toBe(raw);
    });
  });
});
