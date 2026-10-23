// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { bracketPath } from "./BracketAnnotationView";
import type { BracketAnnotation } from "../../types/chemistry";

const base: BracketAnnotation = {
  id: "b1",
  kind: "bracket",
  x: 100,
  y: 10,
  width: 8,
  height: 40,
  variant: "curly",
  facing: "open",
};

describe("bracketPath curly direction", () => {
  test("an open brace anchors at its right edge and curls left (opens right, toward content)", () => {
    const d = bracketPath({ ...base, facing: "open" });
    // Mid-height of a 40-tall box starting at y=10 is 30.
    expect(d).toContain("M 108 10"); // anchor = x + width (right edge)
    expect(d).toContain("T 100 30"); // tip = x (left edge, into the content)
  });

  test("a close brace anchors at its left edge and curls right (opens left, toward content)", () => {
    const d = bracketPath({ ...base, facing: "close" });
    expect(d).toContain("M 100 10"); // anchor = x (left edge)
    expect(d).toContain("T 108 30"); // tip = x + width (right edge, into the content)
  });
});
