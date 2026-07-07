import { forwardRef, useEffect } from "react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useCanvasInteractions } from "../../hooks/useCanvasInteractions";
import { AtomView } from "./AtomView";
import { BondView } from "./BondView";
import { ArrowAnnotationView } from "./ArrowAnnotationView";
import { TextAnnotationView } from "./TextAnnotationView";
import { BracketAnnotationView } from "./BracketAnnotationView";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { atomLabelRadius, isOverValent } from "../../model/valence";
import { resolveDoubleBondSide } from "../../engine/doubleBondSide";

export const MoleculeCanvas = forwardRef<SVGSVGElement>(function MoleculeCanvas(_props, ref) {
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const view = useMoleculeStore((s) => s.view);
  const bondPreview = useMoleculeStore((s) => s.bondPreview);
  const marqueeRect = useMoleculeStore((s) => s.marqueeRect);
  const tool = useMoleculeStore((s) => s.tool);
  const showHydrogens = useMoleculeStore((s) => s.showHydrogens);
  const atomLabelRevealTargets = useMoleculeStore((s) => s.atomLabelRevealTargets);
  const setCanvasSize = useMoleculeStore((s) => s.setCanvasSize);
  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const editingTextId = useMoleculeStore((s) => s.editingTextId);
  const arrowPreview = useMoleculeStore((s) => s.arrowPreview);

  const svgRef = ref as React.RefObject<SVGSVGElement>;
  const { onPointerDown, onPointerMove, onPointerUp, onWheel, onDoubleClick } = useCanvasInteractions(svgRef);

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

  const cursor = tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";

  return (
    <>
    <svg
      ref={ref}
      className="canvas"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
    >      <defs>
        <pattern id="grid" width={24} height={24} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={1} fill="var(--grid-dot)" />
        </pattern>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>
      <rect x="-6000" y="-6000" width="12000" height="12000" fill="url(#grid)" data-export-exclude="true" />
      <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`} data-export-viewport="true">
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
        <g data-export-content="true">
          {Object.values(molecule.bonds).map((b) => (
            <g key={b.id} data-bond-id={b.id}>
              <BondView
                bond={b}
                a1={molecule.atoms[b.a1]}
                a2={molecule.atoms[b.a2]}
                resolvedSide={b.order === 2 ? resolveDoubleBondSide(molecule, b) : undefined}
                r1={atomLabelRadius(molecule, b.a1, showHydrogens, atomLabelRevealTargets.has(b.a1))}
                r2={atomLabelRadius(molecule, b.a2, showHydrogens, atomLabelRevealTargets.has(b.a2))}
              />
            </g>
          ))}
          {Object.values(molecule.atoms).map((a) => (
            <AtomView key={a.id} atom={a} mol={molecule} selected={selected.has(a.id)} overValent={isOverValent(molecule, a.id)} />
          ))}
          {Object.values(annotations).map((ann) =>
            ann.kind === "arrow" ? (
              <ArrowAnnotationView key={ann.id} annotation={ann} selected={selectedAnnotationIds.has(ann.id)} viewScale={view.scale} />
            ) : ann.kind === "bracket" ? (
              <BracketAnnotationView key={ann.id} annotation={ann} selected={selectedAnnotationIds.has(ann.id)} viewScale={view.scale} />
            ) : (
              <TextAnnotationView
                key={ann.id}
                annotation={ann}
                selected={selectedAnnotationIds.has(ann.id)}
                editing={editingTextId === ann.id}
                viewScale={view.scale}
              />
            )
          )}
        </g>
        {arrowPreview && (
          <line
            x1={arrowPreview.x1}
            y1={arrowPreview.y1}
            x2={arrowPreview.x2}
            y2={arrowPreview.y2}
            stroke="var(--accent)"
            strokeWidth={1.6}
            opacity={0.65}
            markerEnd="url(#arrowhead)"
            pointerEvents="none"
            data-export-exclude="true"
          />
        )}
        {bondPreview && molecule.atoms[bondPreview.from] && (
          <g style={{ color: "var(--accent)" }} opacity={0.55} pointerEvents="none" data-export-exclude="true">
            <BondView
              bond={{
                id: "__preview__",
                a1: bondPreview.from,
                a2: "__preview_atom__",
                order: tool === "bond-2" ? 2 : tool === "bond-3" ? 3 : 1,
                stereo: tool === "wedge" ? "wedge" : tool === "dash" ? "dash" : "none",
                doubleSide: "center",
              }}
              a1={molecule.atoms[bondPreview.from]}
              a2={{ id: "__preview_atom__", x: bondPreview.to.x, y: bondPreview.to.y, element: "C", charge: 0 }}
              r1={atomLabelRadius(molecule, bondPreview.from, showHydrogens, atomLabelRevealTargets.has(bondPreview.from))}
            />
            {!bondPreview.targetAtomId && (
              <circle cx={bondPreview.to.x} cy={bondPreview.to.y} r={3.5} fill="var(--accent)" />
            )}
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
      </g>
    </svg>
    <AnnotationToolbar />
    </>
  );
});
