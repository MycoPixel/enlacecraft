import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "../../i18n/useT";

interface ShortcutItem {
  keys: string;
  descKey: string;
}

interface ShortcutGroup {
  titleKey: string;
  items: ShortcutItem[];
}

/** The actual shortcut list — kept as one flat source of truth here rather
 * than scattered across whichever hook happens to implement each one, so
 * this stays accurate without needing to cross-reference
 * useKeyboardShortcuts/useCanvasInteractions by hand. Update this list
 * alongside any future shortcut change. */
const GROUPS: ShortcutGroup[] = [
  {
    titleKey: "shortcuts.group.tools",
    items: [
      { keys: "V", descKey: "shortcuts.selectTool" },
      { keys: "B / 1", descKey: "shortcuts.bondSingle" },
      { keys: "2", descKey: "shortcuts.bondDouble" },
      { keys: "3", descKey: "shortcuts.bondTriple" },
      { keys: "C", descKey: "shortcuts.chainTool" },
      { keys: "R", descKey: "shortcuts.ringTool" },
      { keys: "W", descKey: "shortcuts.wedgeTool" },
      { keys: "E", descKey: "shortcuts.eraseTool" },
      { keys: "T", descKey: "shortcuts.textTool" },
      { keys: "A", descKey: "shortcuts.arrowTool" },
      { keys: "K", descKey: "shortcuts.bracketTool" },
      { keys: "+", descKey: "shortcuts.plusTool" },
      { keys: "H", descKey: "shortcuts.toggleHydrogens" },
    ],
  },
  {
    titleKey: "shortcuts.group.editing",
    items: [
      { keys: "C, N, O, Cl...", descKey: "shortcuts.typeElement" },
      { keys: "Click a selected bond", descKey: "shortcuts.cycleBondOrder" },
      { keys: "Double-bond tool + click", descKey: "shortcuts.cycleDoubleBondSide" },
      { keys: "Delete / Backspace", descKey: "shortcuts.delete" },
      { keys: "Ctrl/Cmd + Z", descKey: "shortcuts.undo" },
      { keys: "Ctrl/Cmd + Shift + Z", descKey: "shortcuts.redo" },
      { keys: "Ctrl/Cmd + A", descKey: "shortcuts.selectAll" },
      { keys: "Ctrl/Cmd + C / V", descKey: "shortcuts.copyPaste" },
      { keys: "Escape", descKey: "shortcuts.clearSelection" },
      { keys: "[ / ]", descKey: "shortcuts.rotate30" },
      { keys: "Drag the rotate handle", descKey: "shortcuts.freeRotate" },
      { keys: "Shift", descKey: "shortcuts.shiftSnapRotate" },
      { keys: "Shift while dragging a bond/chain", descKey: "shortcuts.freeAngle" },
    ],
  },
  {
    titleKey: "shortcuts.group.view",
    items: [
      { keys: "Scroll", descKey: "shortcuts.zoom" },
      { keys: "Drag (Functional group tool)", descKey: "shortcuts.rotateFunctionalGroup" },
      { keys: "Middle-click drag", descKey: "shortcuts.panMiddle" },
      { keys: "Right-click", descKey: "shortcuts.rightClickSelect" },
      { keys: "Shift + click", descKey: "shortcuts.addToSelection" },
      { keys: "Drag on empty canvas", descKey: "shortcuts.marquee" },
      { keys: "?", descKey: "shortcuts.thisOverlay" },
    ],
  },
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="shortcuts-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="shortcuts-dialog" role="dialog" aria-modal="true" aria-label={t("shortcuts.title")}>
        <div className="shortcuts-dialog__header">
          <h2>{t("shortcuts.title")}</h2>
          <button type="button" className="shortcuts-dialog__close" onClick={onClose} aria-label={t("shortcuts.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="shortcuts-dialog__body">
          {GROUPS.map((group) => (
            <div key={group.titleKey} className="shortcuts-group">
              <h3>{t(group.titleKey)}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.descKey} className="shortcuts-row">
                    <dt><kbd>{item.keys}</kbd></dt>
                    <dd>{t(item.descKey)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
