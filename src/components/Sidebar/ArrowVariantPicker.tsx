import type { ArrowHeadSize, ArrowVariant } from "../../types/chemistry";
import { useT } from "../../i18n/useT";

interface ArrowShapePickerProps {
  value: ArrowVariant;
  onChange: (v: ArrowVariant) => void;
  active: boolean;
  /** Fixed for this picker instance — barb (full electron-pair arrowhead
   * vs. single-electron fishhook) is chosen by which of the two arrow
   * tools you opened this from (see Sidebar/MobileToolbar), not by
   * anything in here. Only used to preview each shape with the right
   * arrowhead. */
  barb: "full" | "single";
  /** Only affects the preview when barb is "full" — a fishhook only ever
   * comes in one size. Defaults to "medium" so callers that don't care
   * (the fishhook picker) can omit it entirely. */
  headSize?: ArrowHeadSize;
  /** Dashed-shaft toggle (see ArrowAnnotation.dashed) — rendered as a
   * small checkbox row under the shape grid in the full-arrow tool's
   * dropdown. Absent (fishhook picker) = no toggle; fishhooks are curved
   * in practice, and dashed curved arcs aren't a thing here. */
  dashed?: boolean;
  onDashedChange?: (d: boolean) => void;
}

const VARIANTS: ArrowVariant[] = ["forward", "equilibrium", "resonance", "retrosynthetic", "curved", "curvedReverse"];
const HEAD_SIZES: ArrowHeadSize[] = ["small", "medium", "large"];

/** Just the shape grid (straight, equilibrium, resonance, curved either
 * way) for one fixed barb style. Barb itself is now the top-level choice
 * — see ArrowFull/ArrowFishhook's two separate tool buttons — rather than
 * a second row in here, since crossing "which arrow tool did I open" with
 * "which barb is currently active" made it unclear which one you were
 * about to change. */
export function ArrowShapePicker({ value, onChange, active, barb, headSize = "medium", dashed, onDashedChange }: ArrowShapePickerProps) {
  const t = useT();
  return (
    <div>
      <div className="arrow-variant-grid">
        {VARIANTS.map((v) => (
          <button
            key={v}
            className={`arrow-variant-btn ${active && value === v ? "arrow-variant-btn--active" : ""}`}
            onClick={() => onChange(v)}
            title={t(`arrow.${v}`)}
          >
            <MiniArrow variant={v} barb={barb} headSize={headSize} />
          </button>
        ))}
      </div>
      {onDashedChange && (
        <button
          className={`arrow-variant-btn shape-fill-toggle ${active && dashed ? "arrow-variant-btn--active" : ""}`}
          onClick={() => onDashedChange(!dashed)}
          title={t("arrow.dashed")}
        >
          <MiniArrow variant="forward" barb="full" headSize={headSize} dashed />
          <span className="shape-fill-toggle__label">{t("arrow.dashed")}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Full-arrowhead size picker — small/medium/large. Rendered only inside
 * the electron-pair arrow tool's dropdown (see Sidebar/MobileToolbar); a
 * fishhook has no size options, so this never applies to that one.
 */
export function ArrowHeadSizePicker({
  value,
  onChange,
  active,
}: {
  value: ArrowHeadSize;
  onChange: (s: ArrowHeadSize) => void;
  active: boolean;
}) {
  const t = useT();
  return (
    <div className="arrow-headsize-grid">
      {HEAD_SIZES.map((s) => (
        <button
          key={s}
          className={`arrow-variant-btn ${active && value === s ? "arrow-variant-btn--active" : ""}`}
          onClick={() => onChange(s)}
          title={t(`arrow.headSize.${s}`)}
        >
          <MiniArrow variant="forward" barb="full" headSize={s} />
        </button>
      ))}
    </div>
  );
}

const MINI_HEAD_SIZE: Record<ArrowHeadSize, number> = { small: 4, medium: 6, large: 9 };

export function MiniArrow({
  variant,
  barb,
  headSize = "medium",
  dashed = false,
}: {
  variant: ArrowVariant;
  barb: "full" | "single";
  headSize?: ArrowHeadSize;
  dashed?: boolean;
}) {
  const markerId = `mini-arrowhead-${variant}-${barb}-${headSize}-${dashed ? "d" : "s"}`;
  const markerSize = barb === "full" ? MINI_HEAD_SIZE[headSize] : 6;
  const dashAttrs = dashed ? { strokeDasharray: "4 3" } : {};
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth={markerSize} markerHeight={markerSize} orient="auto-start-reverse">
          {barb === "full"
            ? <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            : <path d="M 0.5,1.5 Q 7,2 9.5,5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />}
        </marker>
      </defs>
      {variant === "forward" && (
        <line x1={3} y1={9} x2={23} y2={9} stroke="currentColor" strokeWidth={1.4} markerEnd={`url(#${markerId})`} {...dashAttrs} />
      )}
      {variant === "curved" && (
        // Matches ArrowAnnotationView.tsx's real curveSign===+1 case: for a
        // left-to-right arrow that bows toward larger y (downward in SVG's
        // y-grows-down space) — this path's control point (y=17) sits below
        // both endpoints for exactly that reason. (Swapped with
        // "curvedReverse" below until both were found bowing the opposite
        // way from what they actually draw on the canvas.)
        <path d="M 3,9 Q 13,17 23,12" stroke="currentColor" strokeWidth={1.4} fill="none" markerEnd={`url(#${markerId})`} />
      )}
      {variant === "curvedReverse" && (
        // Matches curveSign===-1: bows toward smaller y (upward) — control
        // point (y=1) sits above both endpoints.
        <path d="M 3,12 Q 13,1 23,9" stroke="currentColor" strokeWidth={1.4} fill="none" markerEnd={`url(#${markerId})`} />
      )}
      {variant === "resonance" && (
        <line x1={3} y1={9} x2={23} y2={9} stroke="currentColor" strokeWidth={1.4} markerEnd={`url(#${markerId})`} markerStart={`url(#${markerId})`} {...dashAttrs} />
      )}
      {variant === "equilibrium" && (
        <>
          <line x1={3} y1={6} x2={23} y2={6} stroke="currentColor" strokeWidth={1.2} markerEnd={`url(#${markerId})`} {...dashAttrs} />
          <line x1={23} y1={12} x2={3} y2={12} stroke="currentColor" strokeWidth={1.2} markerEnd={`url(#${markerId})`} {...dashAttrs} />
        </>
      )}
      {variant === "retrosynthetic" && (() => {
        // Double shaft + open V head, mirroring the canvas renderer's
        // retrosynthetic case (ArrowAnnotationView.tsx).
        const o = 1.8;
        const headLen = 8;
        const headHalf = 4.5;
        return (
          <g stroke="currentColor" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1={3} y1={9 - o} x2={23} y2={9 - o} {...dashAttrs} />
            <line x1={3} y1={9 + o} x2={23} y2={9 + o} {...dashAttrs} />
            <line x1={24.5} y1={9} x2={24.5 - headLen} y2={9 - headHalf} />
            <line x1={24.5} y1={9} x2={24.5 - headLen} y2={9 + headHalf} />
          </g>
        );
      })()}
    </svg>
  );
}
