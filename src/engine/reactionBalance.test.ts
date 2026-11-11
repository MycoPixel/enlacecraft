import { describe, expect, test } from "vitest";
import { importSmiles } from "../io/smilesImport";
import {
  computeReactionBalance,
  formatBalanceDifferences,
  moleculeElementCounts,
  parseStoichiometricCoefficient,
} from "./reactionBalance";

const molecule = (smiles: string) => importSmiles(smiles).molecule;

describe("parseStoichiometricCoefficient", () => {
  test("empty means one", () => {
    expect(parseStoichiometricCoefficient("")).toBe(1);
    expect(parseStoichiometricCoefficient(undefined)).toBe(1);
    expect(parseStoichiometricCoefficient("   ")).toBe(1);
  });

  test("accepts integers, decimals and fractions", () => {
    expect(parseStoichiometricCoefficient("2")).toBe(2);
    expect(parseStoichiometricCoefficient("0.5")).toBe(0.5);
    expect(parseStoichiometricCoefficient("1/2")).toBe(0.5);
    expect(parseStoichiometricCoefficient(" 3 / 2 ")).toBe(1.5);
  });

  test("rejects generic or non-positive coefficients", () => {
    expect(parseStoichiometricCoefficient("n")).toBeNull();
    expect(parseStoichiometricCoefficient("x")).toBeNull();
    expect(parseStoichiometricCoefficient("0")).toBeNull();
    expect(parseStoichiometricCoefficient("-2")).toBeNull();
    expect(parseStoichiometricCoefficient("1/0")).toBeNull();
  });
});

describe("moleculeElementCounts", () => {
  test("uses implicit hydrogens and abbreviated groups", () => {
    expect(moleculeElementCounts(molecule("CCO"))).toEqual({ C: 2, H: 6, O: 1 });
    expect(moleculeElementCounts(molecule("c1ccccc1"))).toEqual({ C: 6, H: 6 });
  });
});

describe("computeReactionBalance", () => {
  test("balances a reaction with stoichiometric coefficients", () => {
    const result = computeReactionBalance(
      [
        { molecule: molecule("C") },
        { molecule: molecule("O=O"), coefficient: "2" },
      ],
      [
        { molecule: molecule("O=C=O") },
        { molecule: molecule("O"), coefficient: "2" },
      ]
    );

    expect(result.status).toBe("balanced");
    expect(result.differences).toEqual([]);
    expect(result.reactants).toEqual({ C: 1, H: 4, O: 4 });
    expect(result.products).toEqual({ C: 1, H: 4, O: 4 });
  });

  test("reports the elements that disagree", () => {
    const result = computeReactionBalance(
      [{ molecule: molecule("C") }, { molecule: molecule("O=O") }],
      [{ molecule: molecule("O=C=O") }]
    );

    expect(result.status).toBe("unbalanced");
    expect(result.differences).toEqual([{ element: "H", reactants: 4, products: 0 }]);
    expect(formatBalanceDifferences(result.differences)).toBe("H 4 → 0");
  });

  test("accepts fractional coefficients", () => {
    const result = computeReactionBalance(
      [{ molecule: molecule("O=O"), coefficient: "1/2" }],
      [{ molecule: molecule("O=O"), coefficient: "1/2" }]
    );

    expect(result.status).toBe("balanced");
    expect(result.reactants).toEqual({ O: 1 });
    expect(result.products).toEqual({ O: 1 });
  });

  test("returns unknown when a coefficient is not numeric", () => {
    const result = computeReactionBalance(
      [{ molecule: molecule("C"), coefficient: "n" }],
      [{ molecule: molecule("C") }]
    );

    expect(result.status).toBe("unknown");
    expect(result.differences).toEqual([]);
  });
});
