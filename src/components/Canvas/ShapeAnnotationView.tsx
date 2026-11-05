import { useCallback, useRef } from "react";
import type { Annotation, Molecule, Point, ShapeAnnotation, ShapeVariant } from "../../types/chemistry";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { snapAnnotationMove } from "./annotationSnap";

interface ShapeAnnotationViewProps {
  annotation: ShapeAnnotation;
  selected: boolean;
  viewScale: number;
}

type Snapshot = { molecule: Molecule; annotations: Record<string, Annotation> };

const MIN_SIZE = 4;

/** The lab-glassware shape variants — see ShapeVariant's doc comment. */
export type GlasswareVariant = Extract<ShapeVariant, "beaker" | "erlenmeyerFlask" | "roundBottomFlask" | "testTube">;

export const GLASSWARE_VARIANTS: GlasswareVariant[] = ["beaker", "erlenmeyerFlask", "roundBottomFlask", "testTube"];

export function isGlasswareVariant(v: ShapeVariant): v is GlasswareVariant {
  return (GLASSWARE_VARIANTS as string[]).includes(v);
}

export interface GlasswareGlyph {
  /** SVG path data covering the whole glyph (subpaths where the glass has
   * separate strokes, e.g. a test tube's rim). */
  d: string;
  /** Circles the glyph needs on top of the path (only the round-bottom
   * flask's bulb — a path arc through more than half a circle is fiddly;
   * a real <circle> is exact and hits the same stroke styling). */
  circles: { cx: number; cy: number; r: number }[];
}

/**
 * Generates the line-art geometry for one glassware glyph fitted into the
 * box (x, y, width, height). Every fraction below is relative to that box,
 * so a resize-handle drag re-proportions the glass instead of scaling a
 * fixed drawing. The shapes are deliberately the simplest conventional
 * line-art forms used in scheme/procedure annotations:
 *
 *  - beaker: straight walls inset 12% with outward pouring lips at the
 *    rim and softly rounded bottom corners.
 *  - erlenmeyerFlask: straight-sided neck (41%-59% of the width) opening
 *    into a conical body that lands on a flat base with rounded corners.
 *  - roundBottomFlask: a neck whose two lines run from the rim down into
 *    a spherical bulb of radius min(width/2, 0.34·height) resting on the
 *    box floor — the neck lines stop exactly at the sphere's surface
 *    (Pythagoras, so the joint never shows a gap or an overlap).
 *  - testTube: a U of walls 12% in from the box sides closed by a cubic
 *    Bézier that bottoms out ≈96% down the box, plus a rim tick across
 *    the top.
 */
export function glasswareGlyph(variant: GlasswareVariant, x: number, y: number, width: number, height: number): GlasswareGlyph {
  const round = (n: number) => Math.round(n * 100) / 100;
  // Fraction → absolute point helper; all fractions are (fx of width, fy of height).
  const p = (fx: number, fy: number) => `${round(x + fx * width)},${round(y + fy * height)}`;

  if (variant === "beaker") {
    return {
      d: [
        `M ${p(0.04, 0)}`,
        `Q ${p(0.12, 0.01)} ${p(0.12, 0.09)}`,
        `L ${p(0.12, 0.86)}`,
        `Q ${p(0.12, 1)} ${p(0.26, 1)}`,
        `L ${p(0.74, 1)}`,
        `Q ${p(0.88, 1)} ${p(0.88, 0.86)}`,
        `L ${p(0.88, 0.09)}`,
        `Q ${p(0.88, 0.01)} ${p(0.96, 0)}`,
      ].join(" "),
      circles: [],
    };
  }

  if (variant === "erlenmeyerFlask") {
    return {
      d: [
        `M ${p(0.41, 0)}`,
        `L ${p(0.41, 0.25)}`,
        `L ${p(0.05, 0.92)}`,
        `Q ${p(0.03, 1)} ${p(0.12, 1)}`,
        `L ${p(0.88, 1)}`,
        `Q ${p(0.97, 1)} ${p(0.95, 0.92)}`,
        `L ${p(0.59, 0.25)}`,
        `L ${p(0.59, 0)}`,
      ].join(" "),
      circles: [],
    };
  }

  if (variant === "testTube") {
    return {
      d: [
        // Rim tick across the top, then the U: left wall, rounded bottom
        // (cubic bottoms out at ≈0.96 of the box height), right wall.
        `M ${p(0.3, 0)} L ${p(0.7, 0)}`,
        `M ${p(0.36, 0)}`,
        `L ${p(0.36, 0.78)}`,
        `C ${p(0.36, 1.02)} ${p(0.64, 1.02)} ${p(0.64, 0.78)}`,
        `L ${p(0.64, 0)}`,
      ].join(" "),
      circles: [],
    };
  }

  // roundBottomFlask
  const r = Math.min(width / 2, height * 0.34);
  const cx = x + width / 2;
  const cy = y + height - r;
  const neckHalf = 0.08 * width;
  // Where the neck lines meet the sphere: the y on the circle's upper
  // half at horizontal offset ±neckHalf from its centre.
  const neckBottom = cy - Math.sqrt(Math.max(r * r - neckHalf * neckHalf, 0));
  return {
    d: [
      `M ${round(x + width / 2 - neckHalf)},${round(y)}`,
      `L ${round(x + width / 2 - neckHalf)},${round(neckBottom)}`,
      `M ${round(x + width / 2 + neckHalf)},${round(y)}`,
      `L ${round(x + width / 2 + neckHalf)},${round(neckBottom)}`,
    ].join(" "),
    circles: [{ cx, cy, r }],
  };
}

/**
 * A graphics-primitive shape (rectangle, ellipse, or plain line) — the
 * generic drawing-object layer, the same idea as ChemDraw's shapes palette:
 * boxes around scheme steps, oval callouts, divider lines. Drag the body to
 * move; drag the bottom-right handle (shown once selected) to resize. For
 * "line" the box is the endpoint offset (see ShapeAnnotation's doc comment),
 * so the resize handle drags the far endpoint and the move drags both.
 */
export function ShapeAnnotationView({ annotation, selected, viewScale }: ShapeAnnotationViewProps) {
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const moveAnnotationTransient = useMoleculeStore((s) => s.moveAnnotationTransient);
  const moveAnnotationsTransient = useMoleculeStore((s) => s.moveAnnotationsTransient);
  const updateShapeSize = useMoleculeStore((s) => s.updateShapeSize);
  const commitCheckpoint = useMoleculeStore((s) => s.commitCheckpoint);
  const deleteAnnotation = useMoleculeStore((s) => s.deleteAnnotation);

  const dragRef = useRef<
    | { kind: "move"; startClient: Point; origin: Point; before: Snapshot }
    | { kind: "group"; startClient: Point; origins: Record<string, Annotation>; before: Snapshot }
    | { kind: "resize"; startClient: Point; startSize: { width: number; height: number }; before: Snapshot }
    | null
  >(null);

  const onBodyPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const store = useMoleculeStore.getState();
    if (store.tool === "erase") {
      deleteAnnotation(annotation.id);
      return;
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    let nextIds: Set<string>;
    if (e.shiftKey) {
      nextIds = new Set(store.selectedAnnotationIds);
      if (nextIds.has(annotation.id)) nextIds.delete(annotation.id);
      else nextIds.add(annotation.id);
    } else if (store.selectedAnnotationIds.has(annotation.id) && store.selectedAnnotationIds.size > 1) {
      nextIds = new Set(store.selectedAnnotationIds);
    } else {
      nextIds = new Set([annotation.id]);
    }
    setSelectedAnnotationIds(nextIds);

    if (nextIds.size > 1 && nextIds.has(annotation.id)) {
      const origins: Record<string, Annotation> = {};
      nextIds.forEach((id) => {
        const ann = store.annotations[id];
        if (ann) origins[id] = ann;
      });
      dragRef.current = { kind: "group", startClient: { x: e.clientX, y: e.clientY }, origins, before: store.snapshotBefore() };
      return;
    }

    dragRef.current = {
      kind: "move",
      startClient: { x: e.clientX, y: e.clientY },
      origin: { x: annotation.x, y: annotation.y },
      before: store.snapshotBefore(),
    };
  }, [annotation.id, annotation.x, annotation.y, deleteAnnotation, setSelectedAnnotationIds]);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const store = useMoleculeStore.getState();
    dragRef.current = {
      kind: "resize",
      startClient: { x: e.clientX, y: e.clientY },
      startSize: { width: annotation.width, height: annotation.height },
      before: store.snapshotBefore(),
    };
  }, [annotation.width, annotation.height]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "move") {
      const dx = (e.clientX - drag.startClient.x) / viewScale;
      const dy = (e.clientY - drag.startClient.y) / viewScale;
      moveAnnotationTransient(
        annotation.id,
        snapAnnotationMove(annotation.id, { x: drag.origin.x + dx, y: drag.origin.y + dy }, e.shiftKey),
      );
      return;
    }
    if (drag.kind === "group") {
      const dx = (e.clientX - drag.startClient.x) / viewScale;
      const dy = (e.clientY - drag.startClient.y) / viewScale;
      moveAnnotationsTransient(drag.origins, dx, dy);
      return;
    }
    const dw = (e.clientX - drag.startClient.x) / viewScale;
    const dh = (e.clientY - drag.startClient.y) / viewScale;
    updateShapeSize(annotation.id, Math.max(MIN_SIZE, drag.startSize.width + dw), Math.max(MIN_SIZE, drag.startSize.height + dh));
  }, [annotation.id, moveAnnotationTransient, moveAnnotationsTransient, updateShapeSize, viewScale]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    commitCheckpoint(drag.before);
  }, [commitCheckpoint]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteAnnotation(annotation.id);
    }
  }, [annotation.id, deleteAnnotation]);

  // Real color only — selection shows via the separate handle (same rule as
  // every other annotation view, so copies never bake in selection color).
  const color = "var(--ink)";
  const { x, y, width, height, variant, filled } = annotation;

  return (
    <g tabIndex={selected ? 0 : -1} onKeyDown={onKeyDown} style={{ outline: "none" }} data-annotation-id={annotation.id}>
      {/* Wide invisible hit-area. A line's body is the diagonal itself — a
          filled rect hit area there would grab clicks meant for things the
          line merely passes near, so the line gets a thick transparent
          stroke instead. */}
      {variant === "line" ? (
        <line
          x1={x} y1={y} x2={x + width} y2={y + height}
          stroke="transparent" strokeWidth={14}
          onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          style={{ cursor: "move" }}
        />
      ) : (
        <rect
          x={x - 4} y={y - 4} width={Math.max(width + 8, 12)} height={Math.max(height + 8, 12)}
          fill="transparent"
          onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          style={{ cursor: "move" }}
        />
      )}
      {variant === "rectangle" && (
        <rect
          x={x} y={y} width={width} height={height}
          fill={filled ? color : "none"} stroke={color} strokeWidth={1.6} strokeLinejoin="round" pointerEvents="none"
        />
      )}
      {variant === "ellipse" && (
        <ellipse
          cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2}
          fill={filled ? color : "none"} stroke={color} strokeWidth={1.6} pointerEvents="none"
        />
      )}
      {variant === "line" && (
        <line x1={x} y1={y} x2={x + width} y2={y + height} stroke={color} strokeWidth={1.6} strokeLinecap="round" pointerEvents="none" />
      )}

      {variant === "roundedRect" && (
        <rect
          x={x} y={y} width={width} height={height}
          rx={Math.min(width, height) * 0.2} ry={Math.min(width, height) * 0.2}
          fill={filled ? color : "none"} stroke={color} strokeWidth={1.6} strokeLinejoin="round" pointerEvents="none"
        />
      )}

      {variant === "triangle" && (
        <polygon
          points={`${x + width / 2},${y} ${x + width},${y + height} ${x},${y + height}`}
          fill={filled ? color : "none"} stroke={color} strokeWidth={1.6} strokeLinejoin="round" pointerEvents="none"
        />
      )}

      {variant === "hexagon" && (
        <polygon
          points={
            [
              { x: x + width / 2, y: y },
              { x: x + width, y: y + height * 0.25 },
              { x: x + width, y: y + height * 0.75 },
              { x: x + width / 2, y: y + height },
              { x: x, y: y + height * 0.75 },
              { x: x, y: y + height * 0.25 },
            ]
              .map((p) => `${p.x},${p.y}`)
              .join(" ")
          }
          fill={filled ? color : "none"} stroke={color} strokeWidth={1.6} strokeLinejoin="round" pointerEvents="none"
        />
      )}

      {variant === "polygon" && annotation.sides && annotation.sides >= 3 && (
        <>
          {(() => {
            const n = annotation.sides!;
            return (
              <polygon
                points={
                  Array.from({ length: n }).map((_, i) => {
                    const angle = ((i * 360) / n - 90) * (Math.PI / 180);
                    const r = Math.min(width, height) / 2;
                    return `${x + width / 2 + Math.cos(angle) * r},${y + height / 2 + Math.sin(angle) * r}`;
                  }).join(" ")
                }
                fill={filled ? color : "none"} stroke={color} strokeWidth={1.6} strokeLinejoin="round" pointerEvents="none"
              />
            );
          })()}
        </>
      )}

      {variant === "arc" && (
        <path
          d={
            (() => {
              const startAngle = ((annotation.startAngle ?? 0) * Math.PI) / 180;
              const sweepAngle = ((annotation.sides ?? 90) * Math.PI) / 180;
              const r = Math.min(width, height) / 2;
              const cx = x + width / 2;
              const cy = y + height / 2;
              const x1 = cx + Math.cos(startAngle) * r;
              const y1 = cy + Math.sin(startAngle) * r;
              const x2 = cx + Math.cos(startAngle + sweepAngle) * r;
              const y2 = cy + Math.sin(startAngle + sweepAngle) * r;
              const largeArc = sweepAngle > Math.PI ? 1 : 0;
              return `M ${x1},${y1} A ${r},${r} 0 ${largeArc} 0 ${x2},${y2}`;
            })()
          }
          fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" pointerEvents="none"
        />
      )}

      {variant === "curve" && annotation.points && annotation.points.length >= 2 && (
        <path
          d={
            annotation.points
              .map((p, i) => {
                const px = x + p.x;
                const py = y + p.y;
                return i === 0 ? `M ${px},${py}` : `L ${px},${py}`;
              })
              .join(" ")
          }
          fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
        />
      )}

      {variant === "polyline" && annotation.points && annotation.points.length >= 2 && (
        <path
          d={
            annotation.points
              .map((p, i) => {
                const px = x + p.x;
                const py = y + p.y;
                return i === 0 ? `M ${px},${py}` : `L ${px},${py}`;
              })
              .join(" ")
          }
          fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
        />
      )}

      {/* Lab glassware — generated line art, one glyph per variant (see
          glasswareGlyph). "Filled" gives a light wash rather than the
          solid fill rectangles/ellipses get: solid-filled glass reads as
          a black blob at annotation sizes, while a translucent fill
          suggests liquid content the way filled flask icons usually do. */}
      {isGlasswareVariant(variant) && (() => {
        const glyph = glasswareGlyph(variant, x, y, width, height);
        return (
          <>
            <path
              d={glyph.d}
              fill={filled ? color : "none"}
              fillOpacity={filled ? 0.15 : undefined}
              stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
            />
            {glyph.circles.map((c, i) => (
              <circle
                key={i} cx={c.cx} cy={c.cy} r={c.r}
                fill={filled ? color : "none"}
                fillOpacity={filled ? 0.15 : undefined}
                stroke={color} strokeWidth={1.6} pointerEvents="none"
              />
            ))}
          </>
        );
      })()}

      {selected && variant !== "line" && (
        <rect
          x={x + width - 4} y={y + height - 4} width={10} height={10}
          fill="var(--accent)"
          data-export-exclude="true"
          onPointerDown={onResizePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: "nwse-resize" }}
        />
      )}
      {selected && variant === "line" && (
        <rect
          x={x + width - 5} y={y + height - 5} width={10} height={10}
          fill="var(--accent)"
          data-export-exclude="true"
          onPointerDown={onResizePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: "nwse-resize" }}
        />
      )}
    </g>
  );
}
