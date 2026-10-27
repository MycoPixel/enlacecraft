import { useCallback, useRef } from "react";
import type { Annotation, Molecule, Point, TlcPlateAnnotation } from "../../types/chemistry";
import { TLC_SPOT_GRAB_RADIUS, useMoleculeStore } from "../../store/useMoleculeStore";
import { dist, TLC_BASELINE_FRACTION, TLC_FRONT_FRACTION, tlcSpotPosition } from "../../model/geometry";
import { useT } from "../../i18n/useT";

interface TlcPlateAnnotationViewProps {
  annotation: TlcPlateAnnotation;
  selected: boolean;
  viewScale: number;
}

type Snapshot = { molecule: Molecule; annotations: Record<string, Annotation> };

const MIN_SIZE = 20;

/** Index of the spot nearest to `pt` if it lies within the grab radius, else
 * null — used by the TLC tool to decide whether a click drags an existing
 * spot or spots a new one. */
const nearestTlcSpotHit = (plate: TlcPlateAnnotation, pt: Point): number | null => {
  let bestIdx = -1;
  let bestD = Infinity;
  plate.spots.forEach((spot, i) => {
    const d = dist(tlcSpotPosition(plate, spot), pt);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  });
  return bestIdx < 0 || bestD > TLC_SPOT_GRAB_RADIUS ? null : bestIdx;
};

/**
 * A thin-layer chromatography plate: frame, pencil baseline, solvent front,
 * and spots (fractional coordinates — see TlcPlateAnnotation's doc comment).
 *
 * Drag the body to move the whole plate; the bottom-right handle resizes
 * (spots stay put fractionally, so they ride along). With the TLC tool
 * active, clicking inside the plate spots it where you clicked, and
 * Shift+click removes the nearest spot (or the one directly under the
 * cursor) — so spotting works without touching the sidebar between every
 * sample. Each spot also gets a small × button whenever the plate is
 * selected or the TLC tool is active, so a spot can be removed with an
 * ordinary click. Double-clicking the plate while the select/lasso tool is
 * active switches to the TLC tool, so after placing a plate (which returns
 * the tool to select) you don't have to go back to the sidebar to start
 * spotting.
 */
export function TlcPlateAnnotationView({ annotation, selected, viewScale }: TlcPlateAnnotationViewProps) {
  const t = useT();
  const tool = useMoleculeStore((s) => s.tool);
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const moveAnnotationTransient = useMoleculeStore((s) => s.moveAnnotationTransient);
  const moveAnnotationsTransient = useMoleculeStore((s) => s.moveAnnotationsTransient);
  const updateTlcSize = useMoleculeStore((s) => s.updateTlcSize);
  const moveTlcSpot = useMoleculeStore((s) => s.moveTlcSpot);
  const removeTlcSpot = useMoleculeStore((s) => s.removeTlcSpot);
  const commitCheckpoint = useMoleculeStore((s) => s.commitCheckpoint);
  const deleteAnnotation = useMoleculeStore((s) => s.deleteAnnotation);

  const dragRef = useRef<
    | { kind: "move"; startClient: Point; origin: Point; before: Snapshot }
    | { kind: "group"; startClient: Point; origins: Record<string, Annotation>; before: Snapshot }
    | { kind: "resize"; startClient: Point; startSize: { width: number; height: number }; before: Snapshot }
    | { kind: "spot"; startClient: Point; spotIndex: number; origin: { fx: number; fy: number }; before: Snapshot }
    | null
  >(null);

  const onBodyPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const store = useMoleculeStore.getState();
    if (store.tool === "erase") {
      deleteAnnotation(annotation.id);
      return;
    }
    if (store.tool === "tlc") {
      // TLC tool on the plate = edit its spots, not select the plate.
      // The canvas <svg> is needed to convert the click to world coords —
      // same resolution path the arrow view's handles use.
      const svg = (e.target as SVGElement).ownerSVGElement;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const { view } = useMoleculeStore.getState();
        const pt: Point = { x: (e.clientX - rect.left - view.tx) / view.scale, y: (e.clientY - rect.top - view.ty) / view.scale };
        // Drag an existing spot if the click lands on one; otherwise add a
        // new spot. Shift+click always deletes: the spot under the cursor
        // when there is one, else the nearest spot within grab range.
        const hit = nearestTlcSpotHit(annotation, pt);
        if (e.shiftKey) {
          if (hit != null) store.removeTlcSpot(annotation.id, hit);
          else store.removeNearestTlcSpot(annotation.id, pt);
          return;
        }
        if (hit != null) {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          const spot = annotation.spots[hit];
          dragRef.current = {
            kind: "spot",
            startClient: { x: e.clientX, y: e.clientY },
            spotIndex: hit,
            origin: { fx: spot.fx, fy: spot.fy },
            before: store.snapshotBefore(),
          };
          return;
        }
        store.addTlcSpot(annotation.id, pt);
      }
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
  }, [annotation, deleteAnnotation, setSelectedAnnotationIds]);

  const onBodyDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useMoleculeStore.getState();
    // Placing a plate returns the tool to select so the new plate can be
    // moved/resized straight away; double-clicking it puts the TLC tool
    // back so the next clicks spot samples. Only from the selection tools,
    // so a double-click during some other drawing operation can't yank the
    // user into spot mode unexpectedly.
    if (store.tool !== "select" && store.tool !== "lasso") return;
    store.setTool("tlc");
    store.setSelectedAnnotationIds(new Set([annotation.id]));
  }, [annotation.id]);

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
    if (drag.kind === "spot") {
      const svg = (e.target as SVGElement).ownerSVGElement;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const { view } = useMoleculeStore.getState();
        const pt: Point = {
          x: (e.clientX - rect.left - view.tx) / view.scale,
          y: (e.clientY - rect.top - view.ty) / view.scale,
        };
        moveTlcSpot(annotation.id, drag.spotIndex, pt);
      }
      return;
    }
    if (drag.kind === "move") {
      const dx = (e.clientX - drag.startClient.x) / viewScale;
      const dy = (e.clientY - drag.startClient.y) / viewScale;
      moveAnnotationTransient(annotation.id, { x: drag.origin.x + dx, y: drag.origin.y + dy });
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
    updateTlcSize(annotation.id, Math.max(MIN_SIZE, drag.startSize.width + dw), Math.max(MIN_SIZE, drag.startSize.height + dh));
  }, [annotation.id, moveAnnotationTransient, moveAnnotationsTransient, updateTlcSize, moveTlcSpot, viewScale]);

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

  const color = "var(--ink)";
  const { x, y, width, height, spots } = annotation;
  const baselineY = y + height * TLC_BASELINE_FRACTION;
  const frontY = y + height * TLC_FRONT_FRACTION;

  return (
    <g tabIndex={selected ? 0 : -1} onKeyDown={onKeyDown} style={{ outline: "none" }} data-annotation-id={annotation.id}>
      {/* Wide invisible hit-area: the whole plate face, so the TLC tool can
          spot anywhere on it and the plate is easy to grab to move. */}
      <rect
        x={x - 4} y={y - 4} width={Math.max(width + 8, 12)} height={Math.max(height + 8, 12)}
        fill="transparent"
        onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onDoubleClick={onBodyDoubleClick}
        style={{ cursor: "move" }}
      />
      {/* Frame + pencil baseline + solvent front. */}
      <rect x={x} y={y} width={width} height={height} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" pointerEvents="none" />
      <line x1={x} y1={baselineY} x2={x + width} y2={baselineY} stroke={color} strokeWidth={1.2} pointerEvents="none" />
      <line
        x1={x} y1={frontY} x2={x + width} y2={frontY}
        stroke={color} strokeWidth={1.2} strokeDasharray="4 3" pointerEvents="none"
      />
      {/* Spots: filled circles at their fractional positions. Each gets a
          small × button while the plate is selected or the TLC tool is
          active, so a misplaced spot can be removed with one click. */}
      {spots.map((spot, i) => {
        const pos = tlcSpotPosition(annotation, spot);
        const r = spot.r ?? 4;
        return (
          <g key={i}>
            <circle
              cx={pos.x} cy={pos.y}
              r={r}
              fill={spot.color ?? color}
              fillOpacity={0.85}
              pointerEvents="none"
            />
            {(selected || tool === "tlc") && (
              <g
                className="tlc-spot-delete"
                data-export-exclude="true"
                role="button"
                aria-label={t("tlc.removeSpot")}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  removeTlcSpot(annotation.id, i);
                }}
              >
                <title>{t("tlc.removeSpot")}</title>
                <circle
                  cx={pos.x + r + 4} cy={pos.y - r - 4} r={5.5}
                  fill="var(--panel)" stroke="var(--ink-soft)" strokeWidth={1}
                />
                <line
                  x1={pos.x + r + 2} y1={pos.y - r - 6}
                  x2={pos.x + r + 6} y2={pos.y - r - 2}
                  stroke="var(--ink-soft)" strokeWidth={1.2} strokeLinecap="round"
                />
                <line
                  x1={pos.x + r + 6} y1={pos.y - r - 6}
                  x2={pos.x + r + 2} y2={pos.y - r - 2}
                  stroke="var(--ink-soft)" strokeWidth={1.2} strokeLinecap="round"
                />
              </g>
            )}
          </g>
        );
      })}

      {selected && (
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
    </g>
  );
}
