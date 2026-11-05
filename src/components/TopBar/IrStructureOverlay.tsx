import { useCallback, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import type { Molecule } from "../../types/chemistry";
import { useT } from "../../i18n/useT";
import { diagramBoxSize, diagramExtent, diagramSourceFragment, filterForReportDiagram } from "../../io/structureDiagram";
import { IrStructureDiagram } from "./IrStructureDiagram";

/**
 * The structure, as a floating window over the spectrum: draggable by its body,
 * resizable from its lower-left corner.
 *
 * A window rather than a tab, because the point of showing the structure next to
 * a spectrum is to relate the two, and a tab makes that impossible — you'd be
 * looking at one or the other and would have to remember the correspondence
 * yourself, which is the part a reader can't do reliably.
 *
 * It defaults OFF, and is sized to sit over the plot without burying it: the
 * spectrum is the thing being read, and the structure is a reading aid.
 */

/** Default and smallest sizes, in CSS pixels of drawing box (the window adds
 *  its own chrome on top).
 *
 *  The default is sized to leave the spectrum legible underneath. The floor is
 *  roughly "one atom plus a label"; below that the drawing stops being
 *  information. */
export const STRUCTURE_DEFAULT_SIZE = { width: 300, height: 230 };
export const STRUCTURE_MIN_SIZE = { width: 150, height: 120 };
/** Largest, so a drag can't grow the window off the dialog and strand it. */
export const STRUCTURE_MAX_SIZE = { width: 900, height: 700 };

/** The window's own padding and border, added to the drawing box it contains. */
export const STRUCTURE_CHROME = 16;

/** Where the window rests, from the plot's top-right. */
const STRUCTURE_INSET = 8;

/**
 * Keeps a proposed offset inside the plot area.
 *
 * The window's resting place is a CSS inset from the top-right, so an offset is
 * a translation from there rather than an absolute position - which means the
 * allowed travel has to be measured from that resting place too. Without this
 * the window could be dragged past an edge, where it would either be clipped by
 * the plot or sit out over the rest of the dialog with no way to get it back,
 * both of which read as the window having vanished.
 *
 * Exported as pure arithmetic (rather than only existing inside the component)
 * because every interesting case here is a layout case, and jsdom reports
 * zero-sized rects for everything - so a test driving the real handlers would
 * silently verify nothing at all.
 */
export function clampStructureOffset(
  offset: { x: number; y: number },
  layout: {
    containerWidth: number;
    containerHeight: number;
    panelWidth: number;
    panelHeight: number;
    inset?: number;
  },
): { x: number; y: number } {
  const inset = layout.inset ?? STRUCTURE_INSET;
  const baseLeft = layout.containerWidth - inset - layout.panelWidth;
  const minX = -baseLeft;
  const maxY = layout.containerHeight - inset - layout.panelHeight;
  return {
    // When the window is larger than the plot, a range inverts (maxX below
    // minX, or maxY above minY). Math.min/Math.max then collapse to a single
    // value - the top-left - which is the only place it can sensibly sit.
    x: Math.min(inset, Math.max(minX, offset.x)),
    y: Math.max(-inset, Math.min(maxY, offset.y)),
  };
}

export function IrStructureOverlay({
  molecule,
  containerRef,
}: {
  molecule: Molecule;
  /** The positioned plot container the window is clamped inside. */
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [showHydrogens, setShowHydrogens] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [allowance, setAllowance] = useState(STRUCTURE_DEFAULT_SIZE);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const resizeStart = useRef<{ clientX: number; clientY: number; width: number; height: number } | null>(null);

  // The drawing is fitted to the window's inner box, so growing the window
  // grows the drawing rather than adding padding round a fixed picture.
  const drawingBox = useMemo(() => {
    const drawn = diagramSourceFragment(molecule, showHydrogens);
    const atoms = Object.values(filterForReportDiagram(drawn, showHydrogens).atoms);
    return diagramBoxSize(diagramExtent(atoms), allowance.width, allowance.height, Infinity);
  }, [molecule, showHydrogens, allowance]);

  const panelWidth = drawingBox.width + STRUCTURE_CHROME;
  const panelHeight = drawingBox.height + STRUCTURE_CHROME + 22; // + the control row

  const clamp = useCallback(
    (next: { x: number; y: number }) => {
      const container = containerRef.current;
      if (!container) return next;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return next;
      return clampStructureOffset(next, {
        containerWidth: rect.width,
        containerHeight: rect.height,
        panelWidth,
        panelHeight,
      });
    },
    [containerRef, panelWidth, panelHeight],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only the body drags. The control row and the resize grip have their own
      // handlers, and the H toggle in particular must not be swallowed as the
      // start of a move.
      if ((e.target as HTMLElement).closest(".ir-structure-overlay__resize, .ir-structure-overlay__controls")) return;
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStart.current = { clientX: e.clientX, clientY: e.clientY, x: offset.x, y: offset.y };
      setDragging(true);
    },
    [offset.x, offset.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = dragStart.current;
      if (!start) return;
      setOffset(
        clamp({
          x: start.x + (e.clientX - start.clientX),
          y: start.y + (e.clientY - start.clientY),
        }),
      );
    },
    [clamp],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStart.current = null;
    setDragging(false);
  }, []);

  const onResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      resizeStart.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        width: allowance.width,
        height: allowance.height,
      };
      setResizing(true);
    },
    [allowance.width, allowance.height],
  );

  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = resizeStart.current;
      if (!start) return;
      // The grip is on the lower LEFT, because the window is anchored top-right
      // and widens leftwards, so dragging the grip left grows it. A bottom-right
      // grip would sit pinned while the opposite edge moved, reading as broken.
      const width = start.width - (e.clientX - start.clientX);
      const height = start.height + (e.clientY - start.clientY);
      setAllowance({
        width: Math.round(Math.min(STRUCTURE_MAX_SIZE.width, Math.max(STRUCTURE_MIN_SIZE.width, width))),
        height: Math.round(Math.min(STRUCTURE_MAX_SIZE.height, Math.max(STRUCTURE_MIN_SIZE.height, height))),
      });
    },
    [],
  );

  const endResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    resizeStart.current = null;
    setResizing(false);
  }, []);

  // Arrow keys nudge the window, so it is reachable without a pointer. Escape is
  // deliberately left alone so it still closes the report.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 20 : 4;
      const deltas: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      setOffset((prev) => clamp({ x: prev.x + delta.x, y: prev.y + delta.y }));
    },
    [clamp],
  );

  return (
    <>
      <button
        type="button"
        className={`ir-report-toggle-btn${open ? " is-active" : ""}`}
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t("ir.toggleStructure")}
      </button>

      {open && (
        <div
          className={
            "ir-structure-overlay" +
            (dragging ? " is-dragging" : "") +
            (resizing ? " is-resizing" : "")
          }
          style={{
            width: `${panelWidth}px`,
            transform: `translate(${offset.x}px, ${offset.y}px)`,
          }}
          tabIndex={0}
          role="group"
          aria-label={t("ir.structureMove")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          <div className="ir-structure-overlay__controls" role="group">
            <button
              type="button"
              className={`ir-structure-overlay__btn${showHydrogens ? " is-active" : ""}`}
              aria-pressed={showHydrogens}
              title={t("ir.showHydrogens")}
              aria-label={t("ir.showHydrogens")}
              onClick={() => setShowHydrogens((v) => !v)}
            >
              H
            </button>
          </div>

          <IrStructureDiagram
            molecule={molecule}
            showExplicitHydrogens={showHydrogens}
            boxSize={drawingBox}
          />

          <div
            className="ir-structure-overlay__resize"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("ir.structureResize")}
            title={t("ir.structureResize")}
            tabIndex={0}
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            // Double-click restores the default size, for when the grip has been
            // dragged somewhere unhelpful.
            onDoubleClick={() => setAllowance(STRUCTURE_DEFAULT_SIZE)}
          >
            <GripVertical size={12} />
          </div>
        </div>
      )}
    </>
  );
}