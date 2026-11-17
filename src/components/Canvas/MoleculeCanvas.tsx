import { forwardRef, memo, useEffect, useMemo } from "react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useCanvasInteractions } from "../../hooks/useCanvasInteractions";
import { useStructureDescription } from "../../hooks/useStructureDescription";
import { AtomView } from "./AtomView";
import { BondView } from "./BondView";
import { HapticBondView } from "./HapticBondView";
import { ArrowAnnotationView } from "./ArrowAnnotationView";
import { TextAnnotationView } from "./TextAnnotationView";
import { BracketAnnotationView, bracketPath } from "./BracketAnnotationView";
import { ShapeAnnotationView } from "./ShapeAnnotationView";
import { OrbitalAnnotationView, lobePath as orbitalLobePath } from "./OrbitalAnnotationView";
import { TlcPlateAnnotationView } from "./TlcPlateAnnotationView";
import { SGroupOverlay } from "./SGroupOverlay";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { DragReadout } from "./DragReadout";
import { atomLabelRadius, isOverValent } from "../../model/valence";
import { useAtomRenderContexts } from "./atomRenderContext";
import { resolveDoubleBondSide } from "../../engine/doubleBondSide";
import { ringBondIds, ringCircleGeometry } from "../../engine/aromaticRings";
import { AromaticityOverlay } from "./AromaticityOverlay";
import { ComputedStereoOverlay } from "./ComputedStereoOverlay";
import { ReactionRoleOverlay } from "./ReactionRoleOverlay";
import { CycleView } from "./CycleView";
import { previewRingLoops } from "../../engine/ringPlacement";
import { previewFunctionalGroupSegments } from "../../engine/functionalGroupPlacement";
import { bracketPairLayout } from "../../model/geometry";
import { pageBoundsInWorld } from "../../model/pageSetup";
import { sortByZOrder } from "../../model/groups";
import { DEFAULT_BRACKET_WIDTH, GRID_STEP, RING_TEMPLATES } from "../../model/constants";
import { FUNCTIONAL_GROUP_TEMPLATES } from "../../model/functionalGroupTemplates";
import type { Annotation, Atom, BracketAnnotation, RingAttachment, FunctionalGroupAttachment, Molecule } from "../../types/chemistry";

export const MoleculeCanvas = forwardRef<SVGSVGElement>(function MoleculeCanvas(_props, ref) {
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const view = useMoleculeStore((s) => s.view);
  // A text alternative for the drawing itself. The SVG is one image to a
  // screen reader, so its label carries the formula/counts/selection summary
  // rather than trying to expose every atom as a separate node.
  const structureDescription = useStructureDescription();
  const bondPreview = useMoleculeStore((s) => s.bondPreview);
  const atomMoveAnchor = useMoleculeStore((s) => s.atomMoveAnchor);
  const chainPreview = useMoleculeStore((s) => s.chainPreview);
  const marqueeRect = useMoleculeStore((s) => s.marqueeRect);
  const lassoPath = useMoleculeStore((s) => s.lassoPath);
  const tool = useMoleculeStore((s) => s.tool);
  const showHydrogens = useMoleculeStore((s) => s.showHydrogens);
  const showAromaticityOverlay = useMoleculeStore((s) => s.showAromaticityOverlay);
  const showComputedStereo = useMoleculeStore((s) => s.showComputedStereo);
  const showReactionInterpretation = useMoleculeStore((s) => s.showReactionInterpretation);
  const atomLabelRevealTargets = useMoleculeStore((s) => s.atomLabelRevealTargets);
  const setCanvasSize = useMoleculeStore((s) => s.setCanvasSize);
  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const selectedCycleId = useMoleculeStore((s) => s.selectedCycleId);
  const cyclePreview = useMoleculeStore((s) => s.cyclePreview);
  const editingTextId = useMoleculeStore((s) => s.editingTextId);
  const linkedAtomId = useMoleculeStore((s) => s.linkedAtomId);
  const arrowPreview = useMoleculeStore((s) => s.arrowPreview);
  const arrowBarb = useMoleculeStore((s) => s.arrowBarb);
  const arrowHeadSize = useMoleculeStore((s) => s.arrowHeadSize);
  const shapePreview = useMoleculeStore((s) => s.shapePreview);
  const orbitalPreview = useMoleculeStore((s) => s.orbitalPreview);
  const tlcPreview = useMoleculeStore((s) => s.tlcPreview);
  const shapeVariant = useMoleculeStore((s) => s.shapeVariant);
  const shapeFilled = useMoleculeStore((s) => s.shapeFilled);
  const orbitalVariant = useMoleculeStore((s) => s.orbitalVariant);
  const orbitalFilled = useMoleculeStore((s) => s.orbitalFilled);
  const bracketPairPreview = useMoleculeStore((s) => s.bracketPairPreview);
  const bracketVariant = useMoleculeStore((s) => s.bracketVariant);
  const canvasBackground = useMoleculeStore((s) => s.canvasBackground);
  const showGrid = useMoleculeStore((s) => s.showGrid);
  const showPageOutline = useMoleculeStore((s) => s.showPageOutline);
  const page = useMoleculeStore((s) => s.page);
  const alignmentGuides = useMoleculeStore((s) => s.alignmentGuides);
  const hoverAtomId = useMoleculeStore((s) => s.hoverAtomId);
  const hoverBondId = useMoleculeStore((s) => s.hoverBondId);
  const hoverPoint = useMoleculeStore((s) => s.hoverPoint);
  const keyboardDrawing = useMoleculeStore((s) => s.keyboardDrawing);
  const keyboardCursor = useMoleculeStore((s) => s.keyboardCursor);
  const ringTemplateId = useMoleculeStore((s) => s.ringTemplateId);
  const functionalGroupTemplateId = useMoleculeStore((s) => s.functionalGroupTemplateId);
  const functionalGroupDesiredAngle = useMoleculeStore((s) => s.functionalGroupDesiredAngle);

  const svgRef = ref as React.RefObject<SVGSVGElement>;
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel, onDoubleClick, onPointerLeave, onRotateHandleDown, onContextMenu } = useCanvasInteractions(svgRef);

  // Hover preview for the ring tool: exactly the same attachment resolution
  // useCanvasInteractions uses on click, so what you see hovering is what
  // you'll get — a single existing atom fuses through it, an existing bond
  // fuses directly onto it, otherwise it drops centered on the cursor.
  const ringTemplate = tool === "ring" ? RING_TEMPLATES.find((t) => t.id === ringTemplateId) ?? null : null;
  const ringAttachment: RingAttachment | null = hoverAtomId
    ? { type: "atom", atomId: hoverAtomId }
    : hoverBondId && molecule.bonds[hoverBondId]
    ? { type: "bond", a1: molecule.bonds[hoverBondId].a1, a2: molecule.bonds[hoverBondId].a2 }
    : { type: "none" };
  const ringPreviewLoops = ringTemplate && hoverPoint
    ? previewRingLoops(molecule, ringTemplate, hoverPoint, ringAttachment)
    : null;

  // Hover preview for the functional-group tool: same idea as the ring
  // preview above (no "bond" attachment case here — fusing a functional
  // group onto an existing bond isn't a chemically sensible operation the
  // way ring-fusion is, so it only ever attaches through a single atom or
  // drops free on an empty canvas).
  const functionalGroupPending = useMoleculeStore((s) => s.functionalGroupPendingPlacement);
  const functionalGroupTemplate = functionalGroupPending
    ? functionalGroupPending.template
    : tool === "functional-group"
    ? FUNCTIONAL_GROUP_TEMPLATES.find((t) => t.id === functionalGroupTemplateId) ?? null
    : null;
  // While a placement is being dragged, the attach point/atom and center
  // stay fixed at whatever they were at press time (functionalGroupPending
  // — set by useCanvasInteractions) rather than following the live hover,
  // exactly like a bond-drag keeps its own `from` atom fixed while only
  // the angle changes. Only the plain (not-yet-dragging) hover preview
  // uses the live hoverAtomId/hoverPoint.
  const functionalGroupAttachment: FunctionalGroupAttachment = functionalGroupPending
    ? functionalGroupPending.attachment
    : hoverAtomId ? { type: "atom", atomId: hoverAtomId } : { type: "none" };
  const functionalGroupCenter = functionalGroupPending ? functionalGroupPending.center : hoverPoint;
  const functionalGroupPreviewSegments = functionalGroupTemplate && functionalGroupCenter
    ? previewFunctionalGroupSegments(molecule, functionalGroupTemplate, functionalGroupCenter, functionalGroupAttachment, functionalGroupDesiredAngle)
    : null;

  // Free-rotation handle: shown above the current selection's bounding box
  // whenever there's more than one atom selected (rotating a single point
  // around itself would be a no-op) with the select tool active. Dragging
  // it (see onRotateHandleDown) rotates by any angle, not just the
  // sidebar's fixed ±30° nudges.
  const rotateHandle = (() => {
    if ((tool !== "select" && tool !== "lasso") || selected.size < 2) return null;
    const positions = [...selected].map((id) => molecule.atoms[id]).filter(Boolean);
    if (positions.length < 2) return null;
    const minX = Math.min(...positions.map((p) => p.x));
    const maxX = Math.max(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxY = Math.max(...positions.map((p) => p.y));
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const handle = { x: center.x, y: minY - 34 };
    return { center, handle, boxTopY: minY };
  })();

  // Track the canvas's actual on-screen size so actions like "center a
  // searched compound in view" know the real viewport, not a guess.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const rect = svg.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef, setCanvasSize]);

  // Smart guides are a live drag affordance: clear them on any pointer-up or
  // cancel, even if the gesture ended outside the annotation that owned it
  // (pointer capture normally routes that event back, but a cancelled OS
  // gesture may not). Capture phase means this runs even when a child stops
  // propagation.
  useEffect(() => {
    const clear = () => useMoleculeStore.getState().setAlignmentGuides([]);
    window.addEventListener("pointerup", clear, true);
    window.addEventListener("pointercancel", clear, true);
    return () => {
      window.removeEventListener("pointerup", clear, true);
      window.removeEventListener("pointercancel", clear, true);
    };
  }, []);

  const embedReadOnly = useMoleculeStore((s) => s.embedReadOnly);
  const cursor = tool === "pan" ? "grab" : tool === "select" || tool === "lasso" ? "default" : "crosshair";

  return (
    <>
    <svg
      ref={ref}
      className={embedReadOnly ? "canvas canvas--readonly" : "canvas"}
      role="img"
      aria-label={structureDescription}
      tabIndex={0}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // NOT onPointerUp: a cancel means the gesture was torn down (OS system
      // gesture, palm rejection, window blur), not finished. Reusing onPointerUp
      // made an interrupted bond/arrow/bracket drag commit anyway — see
      // onPointerCancel's doc comment in useCanvasInteractions.ts.
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
    >      <defs>
        <pattern id="grid" width={GRID_STEP} height={GRID_STEP} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={1} fill="var(--grid-dot)" />
        </pattern>
        <pattern id="line-grid" width={GRID_STEP} height={GRID_STEP} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID_STEP} 0 L 0 0 0 ${GRID_STEP}`} fill="none" stroke="var(--grid-line)" strokeWidth="1" />
        </pattern>
        <marker id="arrowhead-small" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
        <marker id="arrowhead-medium" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
        <marker id="arrowhead-large" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="10.5" markerHeight="10.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
        <marker id="arrowhead-fishhook" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          {/* One barb only (curling toward the "top" side of the line) — the
              standard notation for a single electron moving, as opposed to
              the full two-barb head above for an electron pair. */}
          <path d="M 0.5,1.5 Q 7,2 9.5,5" fill="none" stroke="context-stroke" strokeWidth="1.8" strokeLinecap="round" />
        </marker>
      </defs>
      {/* Plain white canvas mode skips the grid-dot pattern entirely, to
          look exactly as clean on screen as a "white background" export
          would — see CanvasBackground's doc comment. */}
      {canvasBackground !== "white" && (
        <rect x="-6000" y="-6000" width="12000" height="12000" fill="url(#grid)" data-export-exclude="true" />
      )}
      {/* Independent of canvasBackground — a plain optional square-grid
          overlay, off by default, that works over either a white or themed
          canvas (see showGrid's doc comment in the store). */}
      {showGrid && (
        <rect x="-6000" y="-6000" width="12000" height="12000" fill="url(#line-grid)" data-export-exclude="true" pointerEvents="none" />
      )}
      <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`} data-export-viewport="true">
        {/* The printable page boundary. A view aid only: it lives inside the
            viewport group so it tracks pan/zoom, but is marked
            data-export-exclude so it never reaches PNG/SVG/PDF output. */}
        {showPageOutline && (() => {
          const box = pageBoundsInWorld(page);
          return (
            <g data-export-exclude="true" pointerEvents="none">
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill="none"
                stroke="var(--ink-soft)"
                strokeWidth={1.5 / view.scale}
                strokeDasharray={`${8 / view.scale} ${6 / view.scale}`}
                opacity={0.6}
              />
            </g>
          );
        })()}
        {/*
          Everything that is actual drawing content (and should end up in an
          exported image) lives inside this group. Export measures this
          group's own geometric bounding box (unaffected by the current
          pan/zoom) to crop tightly around the molecule, and clones only this
          group's contents when rasterizing — so transient UI like previews,
          the marquee, and the background grid (marked with
          data-export-exclude, or living outside this group entirely) never
          leak into exported files.
        */}
        <MoleculeContent
          molecule={molecule}
          selected={selected}
          showHydrogens={showHydrogens}
          showAromaticityOverlay={showAromaticityOverlay}
          showComputedStereo={showComputedStereo}
          showReactionInterpretation={showReactionInterpretation}
          atomLabelRevealTargets={atomLabelRevealTargets}
          svgRef={svgRef}
          annotations={annotations}
          selectedAnnotationIds={selectedAnnotationIds}
          selectedCycleId={selectedCycleId}
          editingTextId={editingTextId}
          viewScale={view.scale}
          linkedAtomId={linkedAtomId}
        />
        {/* Smart alignment guides for the annotation currently being dragged.
            Widths and overhangs are divided by the view scale so the line
            keeps the same visual weight at any zoom, like a screen-space
            overlay even though it lives in the world-space content group. */}
        {alignmentGuides.length > 0 && (
          <g
            stroke="var(--accent)"
            strokeWidth={1.25 / view.scale}
            strokeDasharray={`${4 / view.scale} ${3 / view.scale}`}
            pointerEvents="none"
            data-export-exclude="true"
          >
            {alignmentGuides.map((guide, i) =>
              guide.axis === "x" ? (
                <line
                  key={`x-${i}`}
                  x1={guide.position}
                  y1={guide.start - 6 / view.scale}
                  x2={guide.position}
                  y2={guide.end + 6 / view.scale}
                />
              ) : (
                <line
                  key={`y-${i}`}
                  x1={guide.start - 6 / view.scale}
                  y1={guide.position}
                  x2={guide.end + 6 / view.scale}
                  y2={guide.position}
                />
              ),
            )}
          </g>
        )}
        {arrowPreview && (
          <>
            <line
              x1={arrowPreview.x1}
              y1={arrowPreview.y1}
              x2={arrowPreview.x2}
              y2={arrowPreview.y2}
              stroke="var(--accent)"
              strokeWidth={1.6}
              opacity={0.65}
              markerEnd={`url(#${arrowBarb === "single" ? "arrowhead-fishhook" : `arrowhead-${arrowHeadSize}`})`}
              pointerEvents="none"
              data-export-exclude="true"
            />
            <DragReadout from={{ x: arrowPreview.x1, y: arrowPreview.y1 }} to={{ x: arrowPreview.x2, y: arrowPreview.y2 }} />
          </>
        )}
        {cyclePreview && (
          // Cycle-tool drag preview: a plain ring that becomes the real
          // cycle's circle on release. Transient, so never exported.
          <circle
            cx={cyclePreview.centre.x}
            cy={cyclePreview.centre.y}
            r={cyclePreview.radius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.6}
            strokeDasharray="6 4"
            opacity={0.7}
            pointerEvents="none"
            data-export-exclude="true"
          />
        )}
        {bracketPairPreview && (() => {
          // Same layout math the store's addBracketPair uses to commit the
          // real pair on release, so the preview always matches exactly
          // what gets placed.
          const { left, right, top, height } = bracketPairLayout(
            { x: bracketPairPreview.x1, y: bracketPairPreview.y1 },
            { x: bracketPairPreview.x2, y: bracketPairPreview.y2 }
          );
          const open: BracketAnnotation = { id: "__preview_open__", kind: "bracket", x: left - DEFAULT_BRACKET_WIDTH, y: top, width: DEFAULT_BRACKET_WIDTH, height, variant: bracketVariant, facing: "open" };
          const close: BracketAnnotation = { id: "__preview_close__", kind: "bracket", x: right, y: top, width: DEFAULT_BRACKET_WIDTH, height, variant: bracketVariant, facing: "close" };
          return (
            <g stroke="var(--accent)" opacity={0.65} fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" data-export-exclude="true">
              <path d={bracketPath(open)} />
              <path d={bracketPath(close)} />
            </g>
          );
        })()}
        {shapePreview && (() => {
          // Shape-tool drag preview — ghost of what addShapeAnnotation will
          // commit, in the currently-picked shape variant/fill.
          const { x1, y1, x2, y2 } = shapePreview;
          const x = Math.min(x1, x2);
          const y = Math.min(y1, y2);
          const w = Math.abs(x2 - x1);
          const h = Math.abs(y2 - y1);
          const color = "var(--accent)";
          const fill = shapeFilled ? color : "none";
          return (
            <g opacity={0.65} pointerEvents="none" data-export-exclude="true" style={{ color }}>
              {shapeVariant === "rectangle" && <rect x={x} y={y} width={w} height={h} fill={fill} stroke={color} strokeWidth={1.6} strokeLinejoin="round" fillOpacity={0.4} />}
              {shapeVariant === "ellipse" && <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={color} strokeWidth={1.6} fillOpacity={0.4} />}
              {shapeVariant === "line" && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.6} strokeLinecap="round" />}
            </g>
          );
        })()}
        {orbitalPreview && (() => {
          // Orbital-tool drag preview — the nucleus stays pinned where the
          // drag started; the current point sets the axis direction and lobe
          // length, exactly what addOrbitalAnnotation will commit.
          const { cx, cy, x, y } = orbitalPreview;
          const size = Math.max(8, Math.min(400, Math.hypot(x - cx, y - cy)));
          const angle = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
          const color = "var(--accent)";
          return (
            <g opacity={0.65} pointerEvents="none" data-export-exclude="true">
              <g transform={`translate(${cx} ${cy}) rotate(${orbitalVariant === "s" ? 0 : angle})`}>
                {orbitalVariant === "s" ? (
                  <circle r={size * 0.55} fill={orbitalFilled ? color : "none"} fillOpacity={0.4} stroke={color} strokeWidth={1.6} />
                ) : (
                  <>
                    <path d={orbitalLobePath(size)} fill={orbitalFilled ? color : "none"} fillOpacity={0.4} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
                    {orbitalVariant === "p" && (
                      <path d={orbitalLobePath(size)} fill={orbitalFilled ? color : "none"} fillOpacity={0.4} stroke={color} strokeWidth={1.6} strokeLinejoin="round" transform="rotate(180)" />
                    )}
                  </>
                )}
              </g>
              <circle cx={cx} cy={cy} r={3} fill={color} />
            </g>
          );
        })()}
        {tlcPreview && (() => {
          // TLC-tool drag preview — the plate outline only; spots come after
          // placement, by clicking with the same tool.
          const { x1, y1, x2, y2 } = tlcPreview;
          const x = Math.min(x1, x2);
          const y = Math.min(y1, y2);
          const w = Math.abs(x2 - x1);
          const h = Math.abs(y2 - y1);
          return (
            <g opacity={0.65} pointerEvents="none" data-export-exclude="true">
              <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinejoin="round" />
              <line x1={x} y1={y + h * 0.88} x2={x + w} y2={y + h * 0.88} stroke="var(--accent)" strokeWidth={1.2} />
              <line x1={x} y1={y + h * 0.1} x2={x + w} y2={y + h * 0.1} stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="4 3" />
            </g>
          );
        })()}
        {bondPreview && molecule.atoms[bondPreview.from] && (
          <g style={{ color: "var(--accent)" }} opacity={0.55} pointerEvents="none" data-export-exclude="true">
            <BondView
              bond={{
                id: "__preview__",
                a1: bondPreview.from,
                a2: "__preview_atom__",
                order: tool === "bond-2" ? 2 : tool === "bond-3" ? 3 : 1,
                stereo: tool === "wedge" ? "wedge" : tool === "dash" ? "dash" : tool === "wavy" ? "wavy" : tool === "bold" ? "bold" : tool === "bold-hash" ? "boldHash" : tool === "dashed" ? "dashed" : "none",
                doubleSide: "center",
              }}
              a1={molecule.atoms[bondPreview.from]}
              a2={{ id: "__preview_atom__", x: bondPreview.to.x, y: bondPreview.to.y, element: "C", charge: 0 }}
              r1={atomLabelRadius(molecule, bondPreview.from, showHydrogens, atomLabelRevealTargets.has(bondPreview.from))}
            />
            {!bondPreview.targetAtomId && (
              <circle cx={bondPreview.to.x} cy={bondPreview.to.y} r={3.5} fill="var(--accent)" />
            )}
            {!bondPreview.targetAtomId && <DragReadout from={molecule.atoms[bondPreview.from]} to={bondPreview.to} />}
            {bondPreview.targetAtomId && molecule.atoms[bondPreview.targetAtomId] && (
              // The endpoint has snapped exactly onto this atom - a solid
              // ring around it (vs. the dashed idle-hover ring below) makes
              // that commitment clear, distinct from just hovering nearby.
              <circle
                cx={molecule.atoms[bondPreview.targetAtomId].x}
                cy={molecule.atoms[bondPreview.targetAtomId].y}
                r={11}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                opacity={0.9}
              />
            )}
            {bondPreview.targetBondId && molecule.bonds[bondPreview.targetBondId] &&
              molecule.atoms[molecule.bonds[bondPreview.targetBondId].a1] &&
              molecule.atoms[molecule.bonds[bondPreview.targetBondId].a2] && (
                <line
                  x1={molecule.atoms[molecule.bonds[bondPreview.targetBondId].a1].x}
                  y1={molecule.atoms[molecule.bonds[bondPreview.targetBondId].a1].y}
                  x2={molecule.atoms[molecule.bonds[bondPreview.targetBondId].a2].x}
                  y2={molecule.atoms[molecule.bonds[bondPreview.targetBondId].a2].y}
                  stroke="var(--accent)"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  opacity={0.5}
                />
              )}
          </g>
        )}
        {atomMoveAnchor && molecule.atoms[atomMoveAnchor.atomId] && (
          <DragReadout from={atomMoveAnchor.neighborPos} to={molecule.atoms[atomMoveAnchor.atomId]} />
        )}
        {chainPreview && chainPreview.points.length > 0 && (
          <g style={{ color: "var(--accent)" }} opacity={0.55} pointerEvents="none" data-export-exclude="true">
            {chainPreview.points.map((p, i) => {
              const isFirst = i === 0;
              const prevPoint = isFirst ? chainPreview.anchor : chainPreview.points[i - 1];
              // The very first segment may start from a real, already-drawn
              // atom (r1 clears its label) — every other vertex here is
              // just a bare preview point (radius 0, nothing to clear).
              const a1 =
                isFirst && chainPreview.from && molecule.atoms[chainPreview.from]
                  ? molecule.atoms[chainPreview.from]
                  : { id: "__chain_preview_prev__", x: prevPoint.x, y: prevPoint.y, element: "C" as const, charge: 0 };
              const r1 =
                isFirst && chainPreview.from
                  ? atomLabelRadius(molecule, chainPreview.from, showHydrogens, atomLabelRevealTargets.has(chainPreview.from))
                  : 0;
              return (
                <BondView
                  key={i}
                  bond={{ id: `__chain_preview_${i}__`, a1: "a", a2: "b", order: 1, stereo: "none", doubleSide: "center" }}
                  a1={a1}
                  a2={{ id: "__chain_preview_next__", x: p.x, y: p.y, element: "C", charge: 0 }}
                  r1={r1}
                />
              );
            })}
            <circle
              cx={chainPreview.points[chainPreview.points.length - 1].x}
              cy={chainPreview.points[chainPreview.points.length - 1].y}
              r={3.5}
              fill="var(--accent)"
            />
          </g>
        )}
        {tool === "atom" && hoverPoint && (
          hoverAtomId && molecule.atoms[hoverAtomId] ? (
            // Hovering an existing atom: clicking relabels it in place, so
            // highlight that atom rather than showing a "new atom" ghost.
            <circle
              cx={molecule.atoms[hoverAtomId].x}
              cy={molecule.atoms[hoverAtomId].y}
              r={11}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.6}
              strokeDasharray="3 2"
              opacity={0.8}
              pointerEvents="none"
              data-export-exclude="true"
            />
          ) : (
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={9}
              fill="var(--accent)"
              fillOpacity={0.16}
              stroke="var(--accent)"
              strokeWidth={1.4}
              strokeDasharray="2 2"
              opacity={0.75}
              pointerEvents="none"
              data-export-exclude="true"
            />
          )
        )}
        {(tool.startsWith("bond") || tool === "wedge" || tool === "dash" || tool === "wavy") &&
          !bondPreview &&
          hoverPoint &&
          (hoverAtomId && molecule.atoms[hoverAtomId] ? (
            // Hovering an existing atom: a click/drag will start a new
            // bond from here (or, on a plain click with no drag, cycle
            // its element/edit as usual) - highlight it so it's clear
            // this is where the bond will originate.
            <circle
              cx={molecule.atoms[hoverAtomId].x}
              cy={molecule.atoms[hoverAtomId].y}
              r={11}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.6}
              strokeDasharray="3 2"
              opacity={0.8}
              pointerEvents="none"
              data-export-exclude="true"
            />
          ) : hoverBondId && molecule.bonds[hoverBondId] &&
            molecule.atoms[molecule.bonds[hoverBondId].a1] &&
            molecule.atoms[molecule.bonds[hoverBondId].a2] ? (
            // Hovering an existing bond: clicking it changes its
            // order/stereo in place rather than starting a new one -
            // highlight the whole bond so that's clear before the click.
            <line
              x1={molecule.atoms[molecule.bonds[hoverBondId].a1].x}
              y1={molecule.atoms[molecule.bonds[hoverBondId].a1].y}
              x2={molecule.atoms[molecule.bonds[hoverBondId].a2].x}
              y2={molecule.atoms[molecule.bonds[hoverBondId].a2].y}
              stroke="var(--accent)"
              strokeWidth={3.5}
              strokeLinecap="round"
              opacity={0.55}
              pointerEvents="none"
              data-export-exclude="true"
            />
          ) : (
            // Empty canvas: a click/drag here places a fresh atom to
            // bond from.
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={9}
              fill="var(--accent)"
              fillOpacity={0.16}
              stroke="var(--accent)"
              strokeWidth={1.4}
              strokeDasharray="2 2"
              opacity={0.75}
              pointerEvents="none"
              data-export-exclude="true"
            />
          ))}
        {ringPreviewLoops && (
          <g opacity={0.6} pointerEvents="none" data-export-exclude="true">
            {ringPreviewLoops.map((loop, i) => (
              <polygon
                key={i}
                points={loop.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="var(--accent)"
                fillOpacity={0.08}
                stroke="var(--accent)"
                strokeWidth={1.4}
                strokeDasharray="3 2"
              />
            ))}
            {hoverAtomId && molecule.atoms[hoverAtomId] && (
              <circle
                cx={molecule.atoms[hoverAtomId].x}
                cy={molecule.atoms[hoverAtomId].y}
                r={9}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.8}
              />
            )}
            {hoverBondId && molecule.bonds[hoverBondId] && molecule.atoms[molecule.bonds[hoverBondId].a1] && molecule.atoms[molecule.bonds[hoverBondId].a2] && (
              <line
                x1={molecule.atoms[molecule.bonds[hoverBondId].a1].x}
                y1={molecule.atoms[molecule.bonds[hoverBondId].a1].y}
                x2={molecule.atoms[molecule.bonds[hoverBondId].a2].x}
                y2={molecule.atoms[molecule.bonds[hoverBondId].a2].y}
                stroke="var(--accent)"
                strokeWidth={3.5}
                strokeLinecap="round"
                opacity={0.6}
              />
            )}
          </g>
        )}
        {functionalGroupPreviewSegments && (
          <g opacity={0.6} pointerEvents="none" data-export-exclude="true">
            {functionalGroupPreviewSegments.map((seg, i) => (
              <line
                key={i}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="var(--accent)"
                strokeWidth={1.6}
                strokeDasharray="3 2"
                strokeLinecap="round"
              />
            ))}
            {hoverAtomId && molecule.atoms[hoverAtomId] && (
              <circle
                cx={molecule.atoms[hoverAtomId].x}
                cy={molecule.atoms[hoverAtomId].y}
                r={9}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.8}
              />
            )}
          </g>
        )}
        {rotateHandle && (
          <g data-export-exclude="true">
            <line
              x1={rotateHandle.center.x}
              y1={rotateHandle.boxTopY}
              x2={rotateHandle.handle.x}
              y2={rotateHandle.handle.y}
              stroke="var(--accent)"
              strokeWidth={1.2}
              strokeDasharray="2 2"
              opacity={0.7}
              pointerEvents="none"
            />
            <circle
              cx={rotateHandle.handle.x}
              cy={rotateHandle.handle.y}
              r={7}
              fill="var(--panel)"
              stroke="var(--accent)"
              strokeWidth={1.6}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => onRotateHandleDown(e, [...selected], rotateHandle.center)}
            />
          </g>
        )}
        {marqueeRect && (
          <rect
            x={marqueeRect.x}
            y={marqueeRect.y}
            width={marqueeRect.w}
            height={marqueeRect.h}
            fill="var(--accent)"
            fillOpacity={0.12}
            stroke="var(--accent)"
            strokeWidth={1.2}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            data-export-exclude="true"
          />
        )}
        {lassoPath && lassoPath.length > 1 && (
          <polygon
            points={lassoPath.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="var(--accent)"
            fillOpacity={0.12}
            stroke="var(--accent)"
            strokeWidth={1.2}
            strokeDasharray="4 3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            data-export-exclude="true"
          />
        )}
        {keyboardDrawing && keyboardCursor && (
          // Keyboard drawing cursor. Sized in screen pixels (divided by the
          // view scale, like the alignment guides) so the crosshair stays
          // readable at every zoom, and excluded from exports.
          <g
            pointerEvents="none"
            data-export-exclude="true"
            stroke="var(--accent)"
            fill="none"
            strokeLinecap="round"
          >
            <circle
              cx={keyboardCursor.x}
              cy={keyboardCursor.y}
              r={10 / view.scale}
              strokeWidth={1.5 / view.scale}
              strokeDasharray={`${3 / view.scale} ${2 / view.scale}`}
            />
            <path
              d={`M ${keyboardCursor.x - 14 / view.scale} ${keyboardCursor.y} H ${keyboardCursor.x - 4 / view.scale} M ${keyboardCursor.x + 4 / view.scale} ${keyboardCursor.y} H ${keyboardCursor.x + 14 / view.scale} M ${keyboardCursor.x} ${keyboardCursor.y - 14 / view.scale} V ${keyboardCursor.y - 4 / view.scale} M ${keyboardCursor.x} ${keyboardCursor.y + 4 / view.scale} V ${keyboardCursor.y + 14 / view.scale}`}
              strokeWidth={1.5 / view.scale}
            />
          </g>
        )}
      </g>
    </svg>
    <AnnotationToolbar />
    </>
  );
});

interface MoleculeContentProps {
  molecule: Molecule;
  selected: Set<string>;
  showHydrogens: boolean;
  atomLabelRevealTargets: Set<string>;
  svgRef: React.RefObject<SVGSVGElement>;
  annotations: Record<string, Annotation>;
  selectedAnnotationIds: Set<string>;
  /** The catalytic cycle the canvas is treating as selected; see selectedCycleId. */
  selectedCycleId: string | null;
  editingTextId: string | null;
  viewScale: number;
  /** The atom the 3D panel's link tool points at; see linkedAtomId in the store. */
  linkedAtomId: string | null;
  /** Outline each ring with its aromaticity verdict; see showAromaticityOverlay. */
  showAromaticityOverlay: boolean;
  /** Overlay OpenChemLib-computed (R)/(S) and E/Z labels; see showComputedStereo. */
  showComputedStereo: boolean;
  /** Label reaction roles on the canvas; see showReactionInterpretation. */
  showReactionInterpretation: boolean;
}

/**
 * Everything inside the `data-export-content` group — the atoms, bonds and
 * annotations that are actual drawing content, as opposed to the transient
 * hover/preview/marquee UI MoleculeCanvas draws around them.
 *
 * Split out and memoized purely for performance. Nothing in here depends on
 * pointer position, but MoleculeCanvas above subscribes to hoverAtomId /
 * hoverBondId / hoverPoint / the various previews — all of which change on
 * every single mouse move. Without this boundary, sweeping the cursor across
 * a large structure re-rendered every atom and every bond in the document on
 * each move, which is the dominant cost while merely *looking* at a drawing
 * rather than editing it.
 *
 * Every prop is deliberately a stable identity for as long as it's
 * meaningfully unchanged (a molecule object, a Set the store only replaces on
 * real change, a ref), so the shallow compare React.memo does actually hits.
 * That in turn lets the React.memo'd AtomView/BondView below bail out on
 * edits that only touch one atom: model/molecule.ts rebuilds the atoms/bonds
 * maps immutably but reuses the individual atom and bond objects it didn't
 * touch, so an unchanged atom arrives here as the very same object.
 */
const MoleculeContent = memo(function MoleculeContent({
  molecule,
  selected,
  showHydrogens,
  atomLabelRevealTargets,
  svgRef,
  annotations,
  selectedAnnotationIds,
  selectedCycleId,
  editingTextId,
  viewScale,
  linkedAtomId,
  showAromaticityOverlay,
  showComputedStereo,
  showReactionInterpretation,
}: MoleculeContentProps) {
  // Aromatic ring circles the person has toggled on (see
  // AromaticRingDisplay's own doc comment) -- one memo for which bonds
  // should skip their own double-line rendering, one for the circles
  // themselves to draw on top. Both are derived purely from the molecule,
  // so they belong here rather than in MoleculeCanvas: they'd only ever
  // recompute on a real edit, and hovering shouldn't invalidate them.
  const aromaticCircleBondIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of Object.values(molecule.aromaticRingDisplays)) {
      for (const bid of ringBondIds(molecule, r.atomIds)) ids.add(bid);
    }
    return ids;
  }, [molecule]);
  const aromaticCircles = useMemo(
    () =>
      Object.values(molecule.aromaticRingDisplays)
        .map((r) => ({ id: r.id, geometry: ringCircleGeometry(molecule, r.atomIds) }))
        .filter((c): c is { id: string; geometry: NonNullable<ReturnType<typeof ringCircleGeometry>> } => !!c.geometry),
    [molecule]
  );

  // Per-atom label/lone-pair geometry, hoisted out of AtomView so it doesn't
  // have to take the whole molecule as a prop (which would be a new object on
  // every edit, defeating its React.memo). Unchanged atoms get their previous
  // context object back by reference, so editing one atom only re-renders
  // that one.
  const atomContexts = useAtomRenderContexts(molecule, showHydrogens, atomLabelRevealTargets, linkedAtomId);

  return (
    <g data-export-content="true">
      {Object.values(molecule.bonds).map((b) => (
        <g key={b.id} data-bond-id={b.id}>
          <BondView
            bond={b}
            a1={molecule.atoms[b.a1]}
            a2={molecule.atoms[b.a2]}
            resolvedSide={b.order === 2 ? resolveDoubleBondSide(molecule, b) : undefined}
            hideForAromaticCircle={aromaticCircleBondIds.has(b.id)}
            r1={atomContexts.get(b.a1)?.labelRadius ?? 0}
            r2={atomContexts.get(b.a2)?.labelRadius ?? 0}
          />
        </g>
      ))}
      {aromaticCircles.map(({ id, geometry }) => (
        <circle
          key={id}
          cx={geometry.cx}
          cy={geometry.cy}
          r={geometry.r}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          pointerEvents="none"
        />
      ))}
      {showAromaticityOverlay && <AromaticityOverlay molecule={molecule} />}
      {showComputedStereo && <ComputedStereoOverlay molecule={molecule} />}
      {/* Catalytic cycles sit above ring circles but below the atoms, so an
          intermediate's ink always covers the arc it sits on. Geometry is
          derived from the atoms' current positions on every render. */}
      {(sortByZOrder(molecule.cycles ?? [])).map((cycle) => (
        <CycleView
          key={cycle.id}
          cycle={cycle}
          molecule={molecule}
          selected={selectedCycleId === cycle.id}
        />
      ))}
      {Object.values(molecule.hapticBonds).map((hb) => (
        <HapticBondView
          key={hb.id}
          metal={molecule.atoms[hb.metalAtomId]}
          ringAtoms={hb.ringAtomIds.map((id) => molecule.atoms[id]).filter((a): a is Atom => !!a)}
          r1={atomContexts.get(hb.metalAtomId)?.labelRadius ?? 0}
        />
      ))}
      {Object.values(molecule.atoms).map((a) => {
        const ctx = atomContexts.get(a.id);
        if (!ctx) return null;
        return <AtomView key={a.id} atom={a} ctx={ctx} selected={selected.has(a.id)} overValent={isOverValent(molecule, a.id)} svgRef={svgRef} />;
      })}
      {sortByZOrder(Object.values(annotations)).map((ann) =>
        ann.kind === "arrow" ? (
          <ArrowAnnotationView key={ann.id} annotation={ann} selected={selectedAnnotationIds.has(ann.id)} viewScale={viewScale} />
        ) : ann.kind === "bracket" ? (
          <BracketAnnotationView key={ann.id} annotation={ann} selected={selectedAnnotationIds.has(ann.id)} viewScale={viewScale} />
        ) : ann.kind === "shape" ? (
          <ShapeAnnotationView key={ann.id} annotation={ann} selected={selectedAnnotationIds.has(ann.id)} viewScale={viewScale} />
        ) : ann.kind === "orbital" ? (
          <OrbitalAnnotationView key={ann.id} annotation={ann} selected={selectedAnnotationIds.has(ann.id)} viewScale={viewScale} />
        ) : ann.kind === "tlc" ? (
          <TlcPlateAnnotationView key={ann.id} annotation={ann} selected={selectedAnnotationIds.has(ann.id)} viewScale={viewScale} />
        ) : (
          <TextAnnotationView
            key={ann.id}
            annotation={ann}
            selected={selectedAnnotationIds.has(ann.id)}
            editing={editingTextId === ann.id}
            viewScale={viewScale}
          />
        )
      )}
      {showReactionInterpretation && (
        <ReactionRoleOverlay molecule={molecule} annotations={annotations} />
      )}
      <SGroupOverlay molecule={molecule} annotations={annotations} />
    </g>
  );
});
