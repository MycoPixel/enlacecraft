import type { ArrowHeadSize, ArrowVariant } from "../../types/chemistry";
import {
  defaultArrowHead,
  defaultArrowShaft,
  defaultArrowTail,
  type ArrowHeadChoice,
  type ArrowHeadStyle,
  type ArrowShaftChoice,
  type ArrowShaftStyle,
  type ArrowTailChoice,
  type ArrowTailStyle,
} from "../../model/arrowStyle";
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
  /** Explicit style overrides for the arrow being drawn (or edited). The
   * "auto" choice means "follow the variant", which is the pre-override
   * behaviour and remains the default. Style rows are only rendered when
   * their change handler is supplied, so the fishhook picker can stay
   * focused on shape. */
  headStyle?: ArrowHeadChoice;
  onHeadStyleChange?: (s: ArrowHeadChoice) => void;
  tailStyle?: ArrowTailChoice;
  onTailStyleChange?: (s: ArrowTailChoice) => void;
  shaftStyle?: ArrowShaftChoice;
  onShaftStyleChange?: (s: ArrowShaftChoice) => void;
}

const VARIANTS: ArrowVariant[] = [
  "forward",
  "equilibrium",
  "resonance",
  "retrosynthetic",
  "curved",
  "curvedReverse",
  "dashed",
  "double",
  "bold",
  "openHead",
  "circleHead",
  "diamondHead",
  "tailed",
];
const HEAD_SIZES: ArrowHeadSize[] = ["small", "medium", "large"];
const HEAD_CHOICES: ArrowHeadChoice[] = ["auto", "full", "open", "circle", "diamond", "retro", "half"];
const TAIL_CHOICES: ArrowTailChoice[] = ["auto", "none", "full", "half", "open"];
const SHAFT_CHOICES: ArrowShaftChoice[] = ["auto", "solid", "dashed", "bold", "double"];

/** Just the shape grid (all thirteen variants) plus the head/tail/shaft
 * override rows, for one fixed barb style. Barb itself is now the
 * top-level choice — see ArrowFull/ArrowFishhook's two separate tool
 * buttons — rather than a second row in here, since crossing "which arrow
 * tool did I open" with "which barb is currently active" made it unclear
 * which one you were about to change. */
export function ArrowShapePicker({
  value,
  onChange,
  active,
  barb,
  headSize = "medium",
  headStyle = "auto",
  onHeadStyleChange,
  tailStyle = "auto",
  onTailStyleChange,
  shaftStyle = "auto",
  onShaftStyleChange,
}: ArrowShapePickerProps) {
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

      {onShaftStyleChange && (
        <StyleRow label={t("arrow.style.shaft")}>
          {SHAFT_CHOICES.map((choice) => (
            <StyleButton
              key={choice}
              active={active && shaftStyle === choice}
              title={t(`arrow.shaft.${choice}`)}
              onClick={() => onShaftStyleChange(choice)}
            >
              {choice === "auto" ? <AutoGlyph /> : <MiniShaftPreview style={choice} />}
            </StyleButton>
          ))}
        </StyleRow>
      )}

      {onHeadStyleChange && (
        <StyleRow label={t("arrow.style.head")}>
          {HEAD_CHOICES.map((choice) => (
            <StyleButton
              key={choice}
              active={active && headStyle === choice}
              title={t(`arrow.head.${choice}`)}
              onClick={() => onHeadStyleChange(choice)}
            >
              {choice === "auto" ? <AutoGlyph /> : <MiniHeadPreview style={choice} headSize={headSize} />}
            </StyleButton>
          ))}
        </StyleRow>
      )}

      {onTailStyleChange && (
        <StyleRow label={t("arrow.style.tail")}>
          {TAIL_CHOICES.map((choice) => (
            <StyleButton
              key={choice}
              active={active && tailStyle === choice}
              title={t(`arrow.tail.${choice}`)}
              onClick={() => onTailStyleChange(choice)}
            >
              {choice === "auto" ? <AutoGlyph /> : <MiniTailPreview style={choice} headSize={headSize} />}
            </StyleButton>
          ))}
        </StyleRow>
      )}
    </div>
  );
}

function StyleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="arrow-style-section">
      <div className="arrow-style-label">{label}</div>
      <div className="arrow-style-grid">{children}</div>
    </div>
  );
}

function StyleButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`arrow-variant-btn arrow-style-btn ${active ? "arrow-variant-btn--active" : ""}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
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

const MINI_LEN: Record<ArrowHeadSize, number> = { small: 4, medium: 5.5, large: 7 };
const MINI_HALF: Record<ArrowHeadSize, number> = { small: 2, medium: 2.8, large: 3.6 };

/** A head with its tip at the origin, pointing along +x. Callers position
 * and rotate it with an SVG transform. */
function MiniHead({ style, size }: { style: ArrowHeadStyle; size: ArrowHeadSize }) {
  const len = MINI_LEN[size];
  const half = MINI_HALF[size];
  if (style === "full") {
    return <polygon points={`0,0 ${-len},${-half} ${-len},${half}`} fill="currentColor" />;
  }
  if (style === "open" || style === "retro") {
    const s = style === "retro" ? 1.15 : 1;
    return (
      <g stroke="currentColor" strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={0} y1={0} x2={-len * s} y2={-half} />
        <line x1={0} y1={0} x2={-len * s} y2={half} />
      </g>
    );
  }
  if (style === "half") {
    return (
      <path
        d={`M ${-len * 0.75},${half * 0.9} Q ${-len * 0.25},${half * 0.45} 0,0`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    );
  }
  if (style === "circle") {
    return <circle cx={0} cy={0} r={half * 0.75} fill="none" stroke="currentColor" strokeWidth={1.2} />;
  }
  // diamond
  return (
    <polygon
      points={`0,0 ${-len * 0.5},${-half * 0.8} ${-len},0 ${-len * 0.5},${half * 0.8}`}
      fill="currentColor"
    />
  );
}

/** A tail with its tip at the origin, pointing along -x (i.e. back along
 * the arrow). Callers rotate it to match the shaft. */
function MiniTail({ style, size }: { style: ArrowTailStyle; size: ArrowHeadSize }) {
  if (style === "none") return null;
  const len = MINI_LEN[size];
  const half = MINI_HALF[size];
  if (style === "full") {
    return <polygon points={`0,0 ${len},${-half} ${len},${half}`} fill="currentColor" />;
  }
  if (style === "open") {
    return (
      <g stroke="currentColor" strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={0} y1={0} x2={len} y2={-half} />
        <line x1={0} y1={0} x2={len} y2={half} />
      </g>
    );
  }
  // half
  return (
    <path
      d={`M ${len * 0.75},${half * 0.9} Q ${len * 0.25},${half * 0.45} 0,0`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
    />
  );
}

function headInset(style: ArrowHeadStyle, size: ArrowHeadSize): number {
  if (style === "circle") return MINI_HALF[size] * 0.75;
  if (style === "diamond") return MINI_LEN[size];
  return 0;
}

function tailInset(style: ArrowTailStyle, size: ArrowHeadSize): number {
  if (style === "none") return 0;
  return style === "half" ? MINI_LEN[size] * 0.75 : MINI_LEN[size];
}

/** A straight mini arrow assembled from effective styles, used by the
 * variant grid and the style-preview rows. */
function MiniStraight({
  fromX,
  fromY,
  toX,
  toY,
  shaft,
  head,
  tail,
  size,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  shaft: ArrowShaftStyle;
  head: ArrowHeadStyle;
  tail: ArrowTailStyle;
  size: ArrowHeadSize;
}) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const tInset = tailInset(tail, size);
  const hInset = headInset(head, size);
  const bx = fromX + ux * tInset;
  const by = fromY + uy * tInset;
  const ex = toX - ux * hInset;
  const ey = toY - uy * hInset;
  const offsets = shaft === "double" ? [-1.6, 1.6] : [0];
  return (
    <>
      {offsets.map((o, i) => (
        <line
          key={i}
          x1={bx - uy * o}
          y1={by + ux * o}
          x2={ex - uy * o}
          y2={ey + ux * o}
          stroke="currentColor"
          strokeWidth={shaft === "bold" ? 2.6 : 1.3}
          strokeDasharray={shaft === "dashed" ? "3.5 2.5" : undefined}
          strokeLinecap="round"
        />
      ))}
      <g transform={`translate(${toX} ${toY}) rotate(${angle})`}>
        <MiniHead style={head} size={size} />
      </g>
      {tail !== "none" && (
        <g transform={`translate(${fromX} ${fromY}) rotate(${angle})`}>
          <MiniTail style={tail} size={size} />
        </g>
      )}
    </>
  );
}

export function MiniArrow({
  variant,
  barb,
  headSize = "medium",
  headStyle,
  tailStyle,
  shaftStyle,
}: {
  variant: ArrowVariant;
  barb: "full" | "single";
  headSize?: ArrowHeadSize;
  headStyle?: ArrowHeadStyle;
  tailStyle?: ArrowTailStyle;
  shaftStyle?: ArrowShaftStyle;
}) {
  const shaft = shaftStyle ?? defaultArrowShaft({ variant });
  const head = headStyle ?? defaultArrowHead({ variant, barb });
  const tail = tailStyle ?? defaultArrowTail({ variant });
  const isCurved = variant === "curved" || variant === "curvedReverse";

  if (isCurved) {
    const start = variant === "curved" ? { x: 3, y: 9 } : { x: 3, y: 12 };
    const ctrl = variant === "curved" ? { x: 13, y: 17 } : { x: 13, y: 1 };
    const end = variant === "curved" ? { x: 23, y: 12 } : { x: 23, y: 9 };
    const endAngle = (Math.atan2(end.y - ctrl.y, end.x - ctrl.x) * 180) / Math.PI;
    const startAngle = (Math.atan2(ctrl.y - start.y, ctrl.x - start.x) * 180) / Math.PI;
    return (
      <svg width="28" height="18" viewBox="0 0 28 18">
        <path
          d={`M ${start.x},${start.y} Q ${ctrl.x},${ctrl.y} ${end.x},${end.y}`}
          stroke="currentColor"
          strokeWidth={shaft === "bold" ? 2.6 : 1.3}
          strokeDasharray={shaft === "dashed" ? "3.5 2.5" : undefined}
          fill="none"
          strokeLinecap="round"
        />
        <g transform={`translate(${end.x} ${end.y}) rotate(${endAngle})`}>
          <MiniHead style={head} size={headSize} />
        </g>
        {tail !== "none" && (
          <g transform={`translate(${start.x} ${start.y}) rotate(${startAngle})`}>
            <MiniTail style={tail} size={headSize} />
          </g>
        )}
      </svg>
    );
  }

  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      {variant === "equilibrium" ? (
        <>
          <MiniStraight
            fromX={3}
            fromY={6}
            toX={23}
            toY={6}
            shaft={shaft === "double" ? "solid" : shaft}
            head={head}
            tail="none"
            size={headSize}
          />
          <MiniStraight
            fromX={23}
            fromY={12}
            toX={3}
            toY={12}
            shaft={shaft === "double" ? "solid" : shaft}
            head={head}
            tail="none"
            size={headSize}
          />
        </>
      ) : variant === "resonance" ? (
        <MiniStraight
          fromX={3}
          fromY={9}
          toX={23}
          toY={9}
          shaft={shaft}
          head={head}
          tail={head === "half" ? "half" : head === "open" ? "open" : "full"}
          size={headSize}
        />
      ) : (
        <MiniStraight fromX={3} fromY={9} toX={23} toY={9} shaft={shaft} head={head} tail={tail} size={headSize} />
      )}
    </svg>
  );
}

function AutoGlyph() {
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <text x="14" y="13" textAnchor="middle" fontSize="10.5" fill="currentColor">
        A
      </text>
    </svg>
  );
}

function MiniShaftPreview({ style }: { style: ArrowShaftStyle }) {
  const offsets = style === "double" ? [-2, 2] : [0];
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      {offsets.map((o, i) => (
        <line
          key={i}
          x1={3}
          y1={9 + o}
          x2={25}
          y2={9 + o}
          stroke="currentColor"
          strokeWidth={style === "bold" ? 3 : 1.4}
          strokeDasharray={style === "dashed" ? "4 3" : undefined}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function MiniHeadPreview({ style, headSize }: { style: ArrowHeadStyle; headSize: ArrowHeadSize }) {
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <MiniStraight fromX={3} fromY={9} toX={24} toY={9} shaft="solid" head={style} tail="none" size={headSize} />
    </svg>
  );
}

function MiniTailPreview({ style, headSize }: { style: ArrowTailStyle; headSize: ArrowHeadSize }) {
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <MiniStraight fromX={5} fromY={9} toX={25} toY={9} shaft="solid" head="full" tail={style} size={headSize} />
    </svg>
  );
}
