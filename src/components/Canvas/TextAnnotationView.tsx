import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Annotation, Molecule, TextAnnotation, Point } from "../../types/chemistry";
import { useMoleculeStore } from "../../store/useMoleculeStore";

interface TextAnnotationViewProps {
  annotation: TextAnnotation;
  selected: boolean;
  editing: boolean;
  viewScale: number;
}

type Snapshot = { molecule: Molecule; annotations: Record<string, Annotation> };

const MIN_WIDTH = 40;

export function TextAnnotationView({ annotation, selected, editing, viewScale }: TextAnnotationViewProps) {
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const setEditingTextId = useMoleculeStore((s) => s.setEditingTextId);
  const updateTextHtml = useMoleculeStore((s) => s.updateTextHtml);
  const updateTextSize = useMoleculeStore((s) => s.updateTextSize);
  const moveAnnotationTransient = useMoleculeStore((s) => s.moveAnnotationTransient);
  const moveAnnotationsTransient = useMoleculeStore((s) => s.moveAnnotationsTransient);
  const commitCheckpoint = useMoleculeStore((s) => s.commitCheckpoint);
  const deleteAnnotation = useMoleculeStore((s) => s.deleteAnnotation);

  const divRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(annotation.width);
  const dragRef = useRef<
    | { kind: "move"; startClient: Point; origin: Point; before: Snapshot }
    | { kind: "group"; startClient: Point; origins: Record<string, Annotation>; before: Snapshot }
    | { kind: "resize"; startClient: Point; startWidth: number; before: Snapshot }
    | null
  >(null);
  const editBeforeRef = useRef<Snapshot | null>(null);

  useEffect(() => {
    widthRef.current = annotation.width;
  }, [annotation.width]);

  // Keep the (uncontrolled, contentEditable) div's DOM content in sync with
  // the store — but only while this box isn't the one actively being typed
  // into, otherwise we'd blow away the caret position on every keystroke.
  useEffect(() => {
    const div = divRef.current;
    if (!div || editing) return;
    if (div.innerHTML !== annotation.html) div.innerHTML = annotation.html;
  }, [annotation.html, editing]);

  // Measure and persist the rendered size so the <foreignObject> and hit
  // area stay matched to the visible box as text wraps/grows.
  useLayoutEffect(() => {
    const div = divRef.current;
    if (!div) return;
    const ro = new ResizeObserver(() => {
      const h = Math.max(24, div.scrollHeight + 8);
      const w = Math.max(MIN_WIDTH, widthRef.current);
      updateTextSize(annotation.id, w, h);
    });
    ro.observe(div);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotation.id]);

  const onInput = useCallback(() => {
    const div = divRef.current;
    if (!div) return;
    updateTextHtml(annotation.id, div.innerHTML);
  }, [annotation.id, updateTextHtml]);

  const beginEdit = useCallback(() => {
    const store = useMoleculeStore.getState();
    editBeforeRef.current = store.snapshotBefore();
    setSelectedAnnotationIds(new Set([annotation.id]));
    setEditingTextId(annotation.id);
  }, [annotation.id, setSelectedAnnotationIds, setEditingTextId]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    beginEdit();
    requestAnimationFrame(() => divRef.current?.focus());
  }, [beginEdit]);

  const onBlur = useCallback(() => {
    setEditingTextId(null);
    if (editBeforeRef.current) {
      commitCheckpoint(editBeforeRef.current);
      editBeforeRef.current = null;
    }
  }, [setEditingTextId, commitCheckpoint]);

  const onBodyPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (editing) return; // let the browser place the caret / select text normally
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
  }, [annotation.id, annotation.x, annotation.y, deleteAnnotation, editing, setSelectedAnnotationIds]);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const store = useMoleculeStore.getState();
    dragRef.current = { kind: "resize", startClient: { x: e.clientX, y: e.clientY }, startWidth: annotation.width, before: store.snapshotBefore() };
  }, [annotation.width]);

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
    const dw = (e.clientX - drag.startClient.x) / viewScale;
    updateTextSize(annotation.id, Math.max(MIN_WIDTH, drag.startWidth + dw), annotation.height);
  }, [annotation.id, annotation.height, moveAnnotationTransient, moveAnnotationsTransient, updateTextSize, viewScale]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    commitCheckpoint(drag.before);
  }, [commitCheckpoint]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editing && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      deleteAnnotation(annotation.id);
    }
    if (e.key === "Escape" && editing) {
      divRef.current?.blur();
    }
  }, [annotation.id, deleteAnnotation, editing]);

  return (
    <foreignObject x={annotation.x} y={annotation.y} width={annotation.width + 16} height={annotation.height + 16} style={{ overflow: "visible" }} data-annotation-id={annotation.id}>
      <div
        className={`annotation-text-wrap ${selected ? "annotation-text-wrap--selected" : ""} ${editing ? "annotation-text-wrap--editing" : ""}`}
        style={{ width: annotation.width }}
      >
        <div
          ref={divRef}
          className="annotation-text"
          contentEditable={editing}
          suppressContentEditableWarning
          spellCheck={false}
          style={{ fontSize: annotation.fontSize }}
          onPointerDown={onBodyPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          onInput={onInput}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          data-placeholder="Reaction conditions…"
        />
        {selected && !editing && (
          <div className="annotation-resize-handle" onPointerDown={onResizePointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
        )}
      </div>
    </foreignObject>
  );
}
