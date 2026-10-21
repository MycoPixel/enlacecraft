import { useCallback, useRef } from "react";
import type { Annotation, Molecule, OrbitalAnnotation, Point } from "../../types/chemistry";
import { useMoleculeStore } from "../../store/useMoleculeStore";

interface OrbitalAnnotationViewProps {
  annotation: OrbitalAnnotation;
  selected: boolean;
  viewScale: number;
}

type Snapshot = { molecule: Molecule; annotations: Record<string, Annotation> };

/**
 * One teardrop orbital lobe pointing along +x from the nucleus at the
 * origin, in a local coordinate space the caller rotates/positions: the
 * two curves leave the nucleus pointed, bulge to the lobe's full width
 * around 60% out, and close in a rounded outer end — the classic orbital
 * glyph shape (ChemDraw's single-lobe "H orbital"). Exported because the
 * canvas's live drag preview draws the same shape before the annotation
 * exists (MoleculeCanvas.tsx).
 */
export function lobePath(size: number): string {
  const w = size * 0.36; // half-width of the lobe's belly
  const tipX = size;
  return `M 0 0 C ${size * 0.22} ${-w} ${size * 0.7} ${-w * 1.05} ${tipX} 0 C ${size * 0.7} ${w * 1.05} ${size * 0.22} ${w} 0 0 Z`;
}

/**
 * An orbital glyph: a single circle ("s"), the two-lobed dumbbell ("p"), or
 * one free teardrop lobe ("lobe") — ChemDraw's Orbitals palette, for
 * mechanism diagrams and MO pictures. The nucleus (the p/lobe lobe's
 * pointed end, the s circle's center) sits at x/y. Drag the body to move;
 * the one handle on the orbital's axis (shown once selected) rotates AND
 * resizes in a single drag — its direction is the new axis, its distance
 * the new lobe length.
 */
export function OrbitalAnnotationView({ annotation, selected, viewScale }: OrbitalAnnotationViewProps) {
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const moveAnnotationTransient = useMoleculeStore((s) => s.moveAnnotationTransient);
  const moveAnnotationsTransient = useMoleculeStore((s) => s.moveAnnotationsTransient);
  const updateOrbitalTransformTransient = useMoleculeStore((s) => s.updateOrbitalTransformTransient);
  const commitCheckpoint = useMoleculeStore((s) => s.commitCheckpoint);
  const deleteAnnotation = useMoleculeStore((s) => s.deleteAnnotation);

  const dragRef = useRef<
    | { kind: "move"; startClient: Point; origin: Point; before: Snapshot }
    | { kind: "group"; startClient: Point; origins: Record<string, Annotation>; before: Snapshot }
    | { kind: "transform"; before: Snapshot }
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

  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const store = useMoleculeStore.getState();
    setSelectedAnnotationIds(new Set([annotation.id]));
    dragRef.current = { kind: "transform", before: store.snapshotBefore() };
  }, [annotation.id, setSelectedAnnotationIds]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
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
    // Transform: needs the pointer in WORLD space, so this (unlike the
    // move/group cases above, which work purely in screen deltas) resolves
    // through the SVG's bounding rect — the same way the arrow view's
    // endpoint/curve handles do.
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const { view } = useMoleculeStore.getState();
    const pt: Point = { x: (e.clientX - rect.left - view.tx) / view.scale, y: (e.clientY - rect.top - view.ty) / view.scale };
    const size = Math.hypot(pt.x - annotation.x, pt.y - annotation.y);
    const angle = (Math.atan2(pt.y - annotation.y, pt.x - annotation.x) * 180) / Math.PI;
    updateOrbitalTransformTransient(annotation.id, size, angle);
  }, [annotation.id, annotation.x, annotation.y, moveAnnotationTransient, moveAnnotationsTransient, updateOrbitalTransformTransient, viewScale]);

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
  const { x, y, size, angle, variant, filled } = annotation;
  const fillAttrs = filled ? { fill: color, fillOpacity: 0.88 } : { fill: "none" };
  const strokeWidth = 1.5;

  // Rotation pivot: the nucleus for p/lobe (the pointed end), irrelevant
  // for "s" (round, angle pinned to 0).
  const rad = (angle * Math.PI) / 180;
  // Handle sits at the axis tip — beyond the lobe so it's grabbable without
  // hovering the glyph itself.
  const handleDist = size + 12;
  const hx = x + Math.cos(rad) * handleDist;
  const hy = y + Math.sin(rad) * handleDist;

  return (
    <g tabIndex={selected ? 0 : -1} onKeyDown={onKeyDown} style={{ outline: "none" }} data-annotation-id={annotation.id}>
      {/* Invisible hit areas: one per lobe (rotated with the glyph), so any
          part of the dumbbell grabs, plus a small circle over the nucleus. */}
      <g transform={`translate(${x} ${y}) rotate(${angle})`} onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "move" }}>
        {variant === "s" ? (
          <circle r={size * 0.55} fill="transparent" stroke="transparent" strokeWidth={6} />
        ) : variant === "p" ? (
          <>
            <path d={lobePath(size)} fill="transparent" stroke="transparent" strokeWidth={6} />
            <path d={lobePath(size)} fill="transparent" stroke="transparent" strokeWidth={6} transform="rotate(180)" />
          </>
        ) : (
          <path d={lobePath(size)} fill="transparent" stroke="transparent" strokeWidth={6} />
        )}
      </g>
      <circle cx={x} cy={y} r={8} fill="transparent" onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "move" }} />

      <g transform={`translate(${x} ${y}) rotate(${angle})`} pointerEvents="none">
        {variant === "s" ? (
          <circle r={size * 0.55} {...fillAttrs} stroke={color} strokeWidth={strokeWidth} />
        ) : variant === "p" ? (
          <>
            <path d={lobePath(size)} {...fillAttrs} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
            <path d={lobePath(size)} {...fillAttrs} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" transform="rotate(180)" />
          </>
        ) : (
          <path d={lobePath(size)} {...fillAttrs} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        )}
      </g>

      {selected && variant !== "s" && (
        <circle
          cx={hx} cy={hy} r={5}
          fill="var(--accent)" stroke="var(--panel)" strokeWidth={1.6}
          data-export-exclude="true"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: "grab" }}
        />
      )}
    </g>
  );
}
