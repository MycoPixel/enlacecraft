import type { ArrowAnnotation } from "../types/chemistry";

export type ArrowShaftStyle = NonNullable<ArrowAnnotation["shaftStyle"]>;
export type ArrowHeadStyle = NonNullable<ArrowAnnotation["headStyle"]>;
export type ArrowTailStyle = NonNullable<ArrowAnnotation["tailStyle"]>;

/**
 * "auto" means "whatever this variant draws by default" (see
 * defaultArrowShaft/Head/Tail below). The picker uses these for its style
 * rows so an arrow can either follow its variant or be overridden
 * explicitly — the same distinction CDXML makes between an arrow that
 * simply has a RetroSynthetic head and one whose head was set by hand.
 */
export type ArrowShaftChoice = ArrowShaftStyle | "auto";
export type ArrowHeadChoice = ArrowHeadStyle | "auto";
export type ArrowTailChoice = ArrowTailStyle | "auto";

/**
 * The shaft a variant draws when no explicit override is set. Kept as a
 * pure function (rather than folded into the renderer) so the canvas and
 * CDXML export agree on what "this arrow looks like" without duplicating
 * the same switch in two files.
 */
export function defaultArrowShaft(ann: Pick<ArrowAnnotation, "variant" | "dashed">): ArrowShaftStyle {
  // Curved arrows deliberately ignore the legacy dashed flag: a dashed
  // curve reads as a delocalization path rather than an electron movement.
  // An explicit shaftStyle override still wins (see effectiveArrowShaft).
  if (ann.variant === "curved" || ann.variant === "curvedReverse") return "solid";
  if (ann.variant === "retrosynthetic") return "double";
  if (ann.variant === "bold") return "bold";
  if (ann.variant === "double") return "double";
  if (ann.variant === "dashed" || ann.dashed) return "dashed";
  return "solid";
}

/** Head appearance when no explicit override is set. */
export function defaultArrowHead(ann: Pick<ArrowAnnotation, "variant" | "barb">): ArrowHeadStyle {
  if (ann.barb === "single") return "half";
  switch (ann.variant) {
    case "openHead": return "open";
    case "circleHead": return "circle";
    case "diamondHead": return "diamond";
    case "retrosynthetic": return "retro";
    default: return "full";
  }
}

/** Tail appearance when no explicit override is set. */
export function defaultArrowTail(ann: Pick<ArrowAnnotation, "variant">): ArrowTailStyle {
  return ann.variant === "tailed" ? "full" : "none";
}

export function effectiveArrowShaft(ann: ArrowAnnotation): ArrowShaftStyle {
  return ann.shaftStyle ?? defaultArrowShaft(ann);
}

export function effectiveArrowHead(ann: ArrowAnnotation): ArrowHeadStyle {
  return ann.headStyle ?? defaultArrowHead(ann);
}

export function effectiveArrowTail(ann: ArrowAnnotation): ArrowTailStyle {
  return ann.tailStyle ?? defaultArrowTail(ann);
}
