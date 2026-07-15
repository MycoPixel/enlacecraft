import { Bold, Italic, Subscript, Superscript, Minus, Plus } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";

const FONT_STEP = 2;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;

/** Re-dispatches a native "input" event on the currently-focused element so
 * React's onInput handler (which syncs the div's innerHTML back into the
 * store) fires even for DOM mutations we made programmatically rather than
 * by the user typing. */
function notifyInput() {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.dispatchEvent(new Event("input", { bubbles: true }));
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
 * while it's being edited: bold, italic, subscript, superscript, and
 * font-size +/- steppers. Shown only while a text annotation is actively
 * focused (see `editingTextId`), positioned just above that box.
 *
 * Buttons use onMouseDown + preventDefault (not onClick) so the browser
 * never shifts focus away from the contentEditable div — that would
 * collapse the text selection the formatting command needs to act on.
 */
export function AnnotationToolbar() {
  const annotations = useMoleculeStore((s) => s.annotations);
  const editingTextId = useMoleculeStore((s) => s.editingTextId);
  const view = useMoleculeStore((s) => s.view);
  const stepTextFontSize = useMoleculeStore((s) => s.stepTextFontSize);
  const t = useT();

  const ann = editingTextId ? annotations[editingTextId] : null;
  if (!ann || ann.kind !== "text") return null;

  const left = ann.x * view.scale + view.tx;
  const top = ann.y * view.scale + view.ty - 8;

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

  const stepFontSize = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    const hasRealSelection = !!sel && sel.rangeCount > 0 && !sel.isCollapsed;
    if (hasRealSelection && sel) {
      const current = currentSelectionFontSize(ann.fontSize);
      const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, current + delta));
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.fontSize = `${next}px`;
      try {
        range.surroundContents(span);
      } catch {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
      }
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(span);
      sel.addRange(r);
      notifyInput();
    } else if (editingTextId) {
      stepTextFontSize(editingTextId, delta);
    }
  };

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
      <button onMouseDown={stepFontSize(-FONT_STEP)} title={t("annotation.decreaseFontSize")} aria-label={t("annotation.decreaseFontSize")}>
        <Minus size={14} />
      </button>
      <button onMouseDown={stepFontSize(FONT_STEP)} title={t("annotation.increaseFontSize")} aria-label={t("annotation.increaseFontSize")}>
        <Plus size={14} />
      </button>
    </div>
  );
}
