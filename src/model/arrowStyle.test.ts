import { describe, expect, test } from "vitest";
import {
  defaultArrowHead,
  defaultArrowShaft,
  defaultArrowTail,
  effectiveArrowHead,
  effectiveArrowShaft,
  effectiveArrowTail,
} from "./arrowStyle";
import type { ArrowAnnotation, ArrowVariant } from "../types/chemistry";

function arrow(variant: ArrowVariant, extra: Partial<ArrowAnnotation> = {}): ArrowAnnotation {
  return { id: "a", kind: "arrow", x1: 0, y1: 0, x2: 10, y2: 0, variant, ...extra };
}

describe("default arrow styles", () => {
  test("variant-specific shafts", () => {
    expect(defaultArrowShaft(arrow("forward"))).toBe("solid");
    expect(defaultArrowShaft(arrow("dashed"))).toBe("dashed");
    expect(defaultArrowShaft(arrow("bold"))).toBe("bold");
    expect(defaultArrowShaft(arrow("double"))).toBe("double");
    expect(defaultArrowShaft(arrow("retrosynthetic"))).toBe("double");
    // A legacy dashed flag still dashes a plain arrow.
    expect(defaultArrowShaft(arrow("forward", { dashed: true }))).toBe("dashed");
    // Curved arrows ignore the legacy flag (dashed arcs are not a thing).
    expect(defaultArrowShaft(arrow("curved", { dashed: true }))).toBe("solid");
  });

  test("variant-specific heads", () => {
    expect(defaultArrowHead(arrow("forward"))).toBe("full");
    expect(defaultArrowHead(arrow("openHead"))).toBe("open");
    expect(defaultArrowHead(arrow("circleHead"))).toBe("circle");
    expect(defaultArrowHead(arrow("diamondHead"))).toBe("diamond");
    expect(defaultArrowHead(arrow("retrosynthetic"))).toBe("retro");
    expect(defaultArrowHead(arrow("forward", { barb: "single" }))).toBe("half");
  });

  test("only the tailed variant gets a tail by default", () => {
    expect(defaultArrowTail(arrow("tailed"))).toBe("full");
    expect(defaultArrowTail(arrow("forward"))).toBe("none");
  });
});

describe("effective arrow styles", () => {
  test("an explicit override wins over the variant default", () => {
    const ann = arrow("bold", { shaftStyle: "dashed", headStyle: "open", tailStyle: "full" });
    expect(effectiveArrowShaft(ann)).toBe("dashed");
    expect(effectiveArrowHead(ann)).toBe("open");
    expect(effectiveArrowTail(ann)).toBe("full");
  });

  test("without overrides the effective style is the variant default", () => {
    const ann = arrow("tailed");
    expect(effectiveArrowShaft(ann)).toBe("solid");
    expect(effectiveArrowHead(ann)).toBe("full");
    expect(effectiveArrowTail(ann)).toBe("full");
  });
});
