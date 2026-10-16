import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Subscript, Superscript, Minus, Plus, X } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";

const FONT_STEP = 2;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;

const clampSize = (n: number) => Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(n)));

/** Re-dispatches a native "input" event so React's onInput handler (which
 * syncs the div's innerHTML back into the store) fires even for DOM
 * mutations we made programmatically rather than by the user typing.
 *
 * `el` matters for the font-size path: the number field takes real focus
 * (you have to be able to type into it), so document.activeElement is the
 * field, not the text box being edited — notifying the wrong element
 * silently drops the edit. Defaults to the focused element for the
 * formatting commands, which never move focus. */
function notifyInput(el?: HTMLElement | null) {
  const target = el ?? document.activeElement;
  if (target instanceof HTMLElement) target.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Font size (in px) of wherever the caret/selection currently sits, read off the DOM. */
function currentSelectionFontSize(fallback: number): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return fallback;
  const node = sel.getRangeAt(0).startContainer;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  if (!el) return fallback;
  const px = parseFloat(window.getComputedStyle(el).fontSize);
  return Number.isFinite(px) ? px : fallback;
}

/**
 * Small floating toolbar for formatting the text inside an annotation box
 * while it's being edited: bold, italic, subscript, superscript, and a
 * font-size control (number field + steppers). Shown while a text annotation
 * is actively focused (see `editingTextId`), positioned just above that box.
 *
 * It also appears — font size only — when one or more text boxes are
 * *selected* without being edited. That's the case this control really earns
 * its keep in: matching the type between two condition boxes, which is
 * otherwise guesswork, since a box's size is a property of the box and
 * nothing on screen states it.
 *
 * Buttons use onMouseDown + preventDefault (not onClick) so the browser
 * never shifts focus away from the contentEditable div — that would
 * collapse the text selection the formatting command needs to act on. The
 * number field is the one control that genuinely needs focus (you have to
 * be able to type a number into it), so it captures the current range on
 * mousedown and restores it when committing — see savedRangeRef.
 */
export function AnnotationToolbar() {
  const annotations = useMoleculeStore((s) => s.annotations);
  const editingTextId = useMoleculeStore((s) => s.editingTextId);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const view = useMoleculeStore((s) => s.view);
  const stepTextFontSize = useMoleculeStore((s) => s.stepTextFontSize);
  const updateTextFontSize = useMoleculeStore((s) => s.updateTextFontSize);
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const t = useT();

  const ann = editingTextId ? annotations[editingTextId] : null;
  const editing = !!ann && ann.kind === "text" ? ann : null;

  // Every text box currently selected (as opposed to being edited).
  const selectedText = [...selectedAnnotationIds]
    .map((id) => annotations[id])
    .filter((a): a is Extract<typeof a, { kind: "text" }> => !!a && a.kind === "text");

  // Not editing, but a text box (or several) is selected: font size only.
  const multi = !editing && selectedText.length > 0;

  // The font size shown while editing: the caret's own size, which can
  // differ from the box's (part of the text may have been resized
  // individually). Tracked through selectionchange so moving the caret
  // across differently-sized runs updates the readout.
  const [caretSize, setCaretSize] = useState<number>(() =>
    editing ? clampSize(currentSelectionFontSize(editing.fontSize)) : 14
  );
  useEffect(() => {
    if (!editing) return;
    const onSelectionChange = () => setCaretSize(clampSize(currentSelectionFontSize(editing.fontSize)));
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [editing]);

  // Draft text typed into the number field, so a half-typed "1" on the way
  // to "18" isn't yanked back out from under the caret. null = show the
  // real current value.
  const [draft, setDraft] = useState<string | null>(null);
  // Mirror of `draft` that updates synchronously. Enter and blur both try to
  // commit, and they run within the same tick (Enter's handler blurs the
  // field, which fires onBlur immediately) — before React has re-rendered
  // with draft cleared. Reading the stale `draft` state there applied the
  // size twice, wrapping the same text in a second nested span each time.
  const draftRef = useRef<string | null>(null);
  // The text selection as it was before the number field took focus.
  const savedRangeRef = useRef<Range | null>(null);

  if (!editing && !multi) return null;

  const anchor = editing ?? selectedText[0];
  const left = anchor.x * view.scale + view.tx;
  const top = anchor.y * view.scale + view.ty - 8;

  /** The box being edited, located by its annotation id. */
  const editorEl = (): HTMLElement | null =>
    editing
      ? document.querySelector<HTMLElement>(`[data-annotation-id="${editing.id}"] .annotation-text`)
      : null;

  const runCommand = (cmd: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.execCommand(cmd);
    notifyInput();
  };

  // Reaction conditions conventionally use Δ for "heat"/reflux over an
  // arrow (e.g. "Δ, EtOH"), which isn't a character most keyboards can
  // type directly — insertText both replaces a selection (matching what
  // typing a character would do) and inserts at the caret otherwise.
  const insertSymbol = (symbol: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.execCommand("insertText", false, symbol);
    notifyInput();
  };

  /**
   * Wraps the current text selection in a span of the given size, or — when
   * nothing is selected — resizes the whole box. Shared by the steppers and
   * the number field so both behave identically.
   */
  const applySizeToSelectionOrBox = (next: number) => {
    if (!editing) return;
    const sel = window.getSelection();
    const editor = editorEl();
    const range = savedRangeRef.current;
    const usableRange =
      range && editor && editor.contains(range.startContainer) ? range : sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0) : null;

    if (usableRange && sel) {
      sel.removeAllRanges();
      sel.addRange(usableRange);
      const span = document.createElement("span");
      span.style.fontSize = `${next}px`;
      try {
        usableRange.surroundContents(span);
      } catch {
        const contents = usableRange.extractContents();
        span.appendChild(contents);
        usableRange.insertNode(span);
      }
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(span);
      sel.addRange(r);
      notifyInput(editor);
    } else {
      stepTextFontSize(editing.id, next - editing.fontSize);
    }
    setCaretSize(next);
  };

  /** Applies a size to every selected text box (the multi-select mode). */
  const applySizeToSelected = (next: number) => {
    for (const a of selectedText) updateTextFontSize(a.id, next);
  };

  /** The size shown in the number field: the caret's while editing, or the
   *  common size of the selection — blank when the boxes disagree, which is
   *  itself the answer to "are these two the same?". */
  const selectedCommonSize = commonSize(selectedText);
  const mixedSizes = !editing && selectedCommonSize === null;
  const shownSize = editing ? caretSize : (selectedCommonSize ?? 0);
  const stepper = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (multi) {
      // From a blank/mixed readout, step relative to the smallest selected
      // box so repeated clicks converge instead of jumping around.
      const base = shownSize || Math.min(...selectedText.map((a) => a.fontSize));
      applySizeToSelected(clampSize(base + delta));
    } else {
      applySizeToSelectionOrBox(clampSize(shownSize + delta));
    }
  };

  const captureRange = () => {
    const sel = window.getSelection();
    const editor = editorEl();
    savedRangeRef.current =
      sel && sel.rangeCount > 0 && !sel.isCollapsed && editor && editor.contains(sel.getRangeAt(0).startContainer)
        ? sel.getRangeAt(0).cloneRange()
        : null;
  };

  /** Commits what's typed in the number field, if it's a usable size. */
  const commitTypedSize = () => {
    const value = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (value === null) return;
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    if (multi) applySizeToSelected(clampSize(n));
    else applySizeToSelectionOrBox(clampSize(n));
  };

  const setDraftValue = (value: string) => {
    draftRef.current = value;
    setDraft(value);
  };

  const numberField = (
    <input
      type="number"
      className="annotation-toolbar__font-size"
      value={draft ?? (mixedSizes ? "" : String(shownSize))}
      min={MIN_FONT_SIZE}
      max={MAX_FONT_SIZE}
      step={1}
      placeholder="—"
      aria-label={multi ? t("annotation.fontSizeAll") : t("annotation.fontSize")}
      title={multi ? t("annotation.fontSizeAll") : t("annotation.fontSize")}
      onMouseDown={captureRange}
      onChange={(e) => setDraftValue(e.target.value)}
      onBlur={() => { commitTypedSize(); savedRangeRef.current = null; }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitTypedSize();
          // Focus goes back to the text being edited rather than nowhere:
          // the field exists to type a number into, not to be left sitting
          // in. (This also blurs the field, whose onBlur then finds nothing
          // left to commit.)
          editorEl()?.focus();
        } else if (e.key === "Escape") {
          // Abandon the edit, and hand focus back to the text being edited.
          draftRef.current = null;
          setDraft(null);
          savedRangeRef.current = null;
          editorEl()?.focus();
        }
        // Keep the app's global shortcuts (element keys, tool letters) from
        // reacting to digits typed here.
        e.stopPropagation();
      }}
    />
  );

  // Multi-select mode: only the size control (the bold/italic commands need
  // a caret inside one box, so offering them here would be a lie).
  if (multi) {
    return (
      <div
        className="annotation-toolbar"
        style={{ left, top }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button onMouseDown={stepper(-FONT_STEP)} title={t("annotation.decreaseFontSize")} aria-label={t("annotation.decreaseFontSize")}>
          <Minus size={14} />
        </button>
        {numberField}
        <button onMouseDown={stepper(FONT_STEP)} title={t("annotation.increaseFontSize")} aria-label={t("annotation.increaseFontSize")}>
          <Plus size={14} />
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            setSelectedAnnotationIds(new Set());
          }}
          title={t("annotation.closeFontSize")}
          aria-label={t("annotation.closeFontSize")}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="annotation-toolbar" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <button onMouseDown={runCommand("bold")} title={t("annotation.bold")} aria-label={t("annotation.bold")}>
        <Bold size={14} />
      </button>
      <button onMouseDown={runCommand("italic")} title={t("annotation.italic")} aria-label={t("annotation.italic")}>
        <Italic size={14} />
      </button>
      <button onMouseDown={runCommand("subscript")} title={t("annotation.subscript")} aria-label={t("annotation.subscript")}>
        <Subscript size={14} />
      </button>
      <button onMouseDown={runCommand("superscript")} title={t("annotation.superscript")} aria-label={t("annotation.superscript")}>
        <Superscript size={14} />
      </button>
      <span className="annotation-toolbar__divider" />
      <button onMouseDown={insertSymbol("\u0394")} className="annotation-toolbar__symbol" title={t("annotation.insertDelta")} aria-label={t("annotation.insertDelta")}>
        {"\u0394"}
      </button>
      <span className="annotation-toolbar__divider" />
      <button onMouseDown={stepper(-FONT_STEP)} title={t("annotation.decreaseFontSize")} aria-label={t("annotation.decreaseFontSize")}>
        <Minus size={14} />
      </button>
      {numberField}
      <button onMouseDown={stepper(FONT_STEP)} title={t("annotation.increaseFontSize")} aria-label={t("annotation.increaseFontSize")}>
        <Plus size={14} />
      </button>
    </div>
  );
}

/** The one size every selected box shares, or null when they differ. */
function commonSize(boxes: { fontSize: number }[]): number | null {
  if (boxes.length === 0) return null;
  const first = boxes[0].fontSize;
  return boxes.every((b) => b.fontSize === first) ? first : null;
}
