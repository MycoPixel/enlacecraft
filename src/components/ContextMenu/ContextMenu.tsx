import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Trash2, Copy, ClipboardPaste, CopyPlus, Plus, Minus, Zap, Palette,
  RotateCcw, RotateCw, Undo2, Wand2, MousePointer2, CheckSquare, Maximize, ChevronLeft, ShieldOff, Check, Brackets, Orbit, Circle,
} from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { HighlightColorPicker } from "../Sidebar/HighlightColorPicker";
import type { BondOrder, BondStereo } from "../../types/chemistry";
import { resolveHapticSelection, findHapticBond, findAromaticRingDisplay } from "../../model/molecule";
import { resolveEligibleRingForBond } from "../../engine/aromaticRings";

interface ContextMenuProps {
  copySelection: () => boolean;
  pasteFromClipboard: () => void | Promise<void>;
}

/**
 * Right-click menu — the same idea as Sidebar/MobileToolbar's tools, just
 * surfaced at the click point instead of requiring a trip to the sidebar
 * or a keyboard shortcut. Content is built from three independent,
 * always-additive sections depending on what's actually true when it
 * opens:
 *  - what's directly under the cursor (an atom, a bond, or neither) —
 *    single-item actions
 *  - whether there's a selection right now at all, regardless of whether
 *    the click happened to land exactly on a selected item — group
 *    actions apply to the *selection*, not to whatever's under the cursor
 *  - general canvas actions, always available
 * Deliberately doesn't select/deselect anything on its own; each action
 * operates directly on whatever it names (a specific atomId/bondId, or
 * the store's existing `selected` set) rather than the menu first
 * mutating selection as a side effect.
 */
export function ContextMenu({ copySelection, pasteFromClipboard }: ContextMenuProps) {
  const t = useT();
  const contextMenu = useMoleculeStore((s) => s.contextMenu);
  const setContextMenu = useMoleculeStore((s) => s.setContextMenu);
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const tool = useMoleculeStore((s) => s.tool);
  const setTool = useMoleculeStore((s) => s.setTool);
  const deleteAtom = useMoleculeStore((s) => s.deleteAtom);
  const deleteBond = useMoleculeStore((s) => s.deleteBond);
  const deleteSelection = useMoleculeStore((s) => s.deleteSelection);
  const setAtomCharge = useMoleculeStore((s) => s.setAtomCharge);
  const toggleAtomRadical = useMoleculeStore((s) => s.toggleAtomRadical);
  const setAtomHighlightColor = useMoleculeStore((s) => s.setAtomHighlightColor);
  const toggleAtomIgnoreValence = useMoleculeStore((s) => s.toggleAtomIgnoreValence);
  const setBondHighlightColor = useMoleculeStore((s) => s.setBondHighlightColor);
  const setBondOrder = useMoleculeStore((s) => s.setBondOrder);
  const setBondStereo = useMoleculeStore((s) => s.setBondStereo);
  const setBondDative = useMoleculeStore((s) => s.setBondDative);
  const highlightSelection = useMoleculeStore((s) => s.highlightSelection);
  const duplicateSelection = useMoleculeStore((s) => s.duplicateSelection);
  const rotateSelection = useMoleculeStore((s) => s.rotateSelection);
  const resetRotation = useMoleculeStore((s) => s.resetRotation);
  const rotationSession = useMoleculeStore((s) => s.rotationSession);
  const cleanUpSelection = useMoleculeStore((s) => s.cleanUpSelection);
  const addChargeBracket = useMoleculeStore((s) => s.addChargeBracket);
  const toggleHapticBond = useMoleculeStore((s) => s.toggleHapticBond);
  const toggleAromaticRingDisplay = useMoleculeStore((s) => s.toggleAromaticRingDisplay);
  const selectAll = useMoleculeStore((s) => s.selectAll);
  const resetView = useMoleculeStore((s) => s.resetView);

  const menuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<"atom-highlight" | "bond-highlight" | "selection-highlight" | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const close = () => setContextMenu(null);

  useEffect(() => {
    setSubmenu(null);
  }, [contextMenu]);

  // Clamp within the viewport the same way ToolDropdown does, using the
  // panel's real measured size once it's mounted (its content varies —
  // atom vs. bond vs. empty-canvas menus are all different heights, and
  // this has to be the *actual* rendered content being measured, not a
  // placeholder — an empty div's height doesn't predict a ~10-item menu's).
  useEffect(() => {
    if (!contextMenu) { setCoords(null); return; }
    const el = menuRef.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 200;
    const left = Math.min(contextMenu.x, window.innerWidth - w - 8);
    const top = Math.min(contextMenu.y, window.innerHeight - h - 8);
    setCoords({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [contextMenu, submenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Closing on scroll/resize (rather than repositioning, unlike
    // ToolDropdown) matches how a right-click menu conventionally behaves
    // — it's tied to a specific point in the drawing, not a toolbar
    // button that's still there after the canvas moves under it.
    document.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu]);

  if (!contextMenu) return null;

  const atom = contextMenu.atomId ? molecule.atoms[contextMenu.atomId] : null;
  const bond = contextMenu.bondId ? molecule.bonds[contextMenu.bondId] : null;
  const hasSelection = selected.size > 0;
  const hapticSelection = resolveHapticSelection(molecule, selected);
  const existingHapticBond = hapticSelection ? findHapticBond(molecule, hapticSelection.metalAtomId, hapticSelection.ringAtomIds) : null;
  const eligibleRing = bond ? resolveEligibleRingForBond(molecule, bond) : null;
  const existingRingDisplay = eligibleRing ? findAromaticRingDisplay(molecule, eligibleRing) : null;
  const canResetRotation = rotationSession != null && rotationSession.key === [...selected].sort().join(",");

  const doOrder = (order: BondOrder) => { if (bond) { setBondOrder(bond.id, order); close(); } };
  const doStereo = (stereo: BondStereo) => { if (bond) { setBondStereo(bond.id, stereo); close(); } };
  const doDative = () => { if (bond) { setBondDative(bond.id, !bond.dative); close(); } };

  // The actual menu content — built once, then rendered twice below: an
  // invisible first pass (so menuRef.offsetWidth/Height above are real
  // measurements of what's about to show, not a placeholder) followed by
  // the real, correctly-clamped one once `coords` comes out of that.
  const content = (
    <>
      {submenu === "atom-highlight" && atom && (
        <>
          <button className="context-menu__item" onClick={() => setSubmenu(null)}>
            <ChevronLeft size={15} /> {t("contextMenu.back")}
          </button>
          <div className="context-menu__label">{t("section.highlight")}</div>
          <HighlightColorPicker disabled={false} onChoose={(c) => { setAtomHighlightColor(atom.id, c); close(); }} />
        </>
      )}
      {submenu === "bond-highlight" && bond && (
        <>
          <button className="context-menu__item" onClick={() => setSubmenu(null)}>
            <ChevronLeft size={15} /> {t("contextMenu.back")}
          </button>
          <div className="context-menu__label">{t("section.highlight")}</div>
          <HighlightColorPicker disabled={false} onChoose={(c) => { setBondHighlightColor(bond.id, c); close(); }} />
        </>
      )}
      {submenu === "selection-highlight" && (
        <>
          <button className="context-menu__item" onClick={() => setSubmenu(null)}>
            <ChevronLeft size={15} /> {t("contextMenu.back")}
          </button>
          <div className="context-menu__label">{t("section.highlight")}</div>
          <HighlightColorPicker disabled={!hasSelection} onChoose={(c) => { highlightSelection(c); close(); }} />
        </>
      )}

      {submenu === null && (
        <>
          {atom && (
            <>
              <div className="context-menu__label">{t("contextMenu.atom")}</div>
              <button className="context-menu__item" onClick={() => { setAtomCharge(atom.id, 1); close(); }}>
                <Plus size={15} /> {t("contextMenu.increaseCharge")}
              </button>
              <button className="context-menu__item" onClick={() => { setAtomCharge(atom.id, -1); close(); }}>
                <Minus size={15} /> {t("contextMenu.decreaseCharge")}
              </button>
              <button className="context-menu__item" onClick={() => { toggleAtomRadical(atom.id); close(); }}>
                <Zap size={15} /> {t("contextMenu.toggleRadical")}
              </button>
              <button className="context-menu__item" onClick={() => setSubmenu("atom-highlight")}>
                <Palette size={15} /> {t("section.highlight")} &rsaquo;
              </button>
              <button className="context-menu__item" onClick={() => { toggleAtomIgnoreValence(atom.id); close(); }}>
                <ShieldOff size={15} /> {t("contextMenu.ignoreValence")}
                {atom.ignoreValence && <Check size={14} className="context-menu__check" />}
              </button>
              <button className="context-menu__item context-menu__item--danger" onClick={() => { deleteAtom(atom.id); close(); }}>
                <Trash2 size={15} /> {t("contextMenu.deleteAtom")}
              </button>
              <div className="context-menu__divider" />
            </>
          )}

          {bond && (
            <>
              <div className="context-menu__label">{t("contextMenu.bond")}</div>
              <div className="context-menu__row">
                <button className="context-menu__chip" title={t("tool.bondSingle")} onClick={() => doOrder(1)}>1</button>
                <button className="context-menu__chip" title={t("tool.bondDouble")} onClick={() => doOrder(2)}>2</button>
                <button className="context-menu__chip" title={t("tool.bondTriple")} onClick={() => doOrder(3)}>3</button>
              </div>
              <div className="context-menu__row">
                <button className="context-menu__chip" title={t("tool.wedge")} onClick={() => doStereo("wedge")}>&#9650;</button>
                <button className="context-menu__chip" title={t("tool.dash")} onClick={() => doStereo("dash")}>&#8944;</button>
                <button className="context-menu__chip" title={t("tool.wavy")} onClick={() => doStereo("wavy")}>&#8993;</button>
                <button className="context-menu__chip" title={t("contextMenu.plainBond")} onClick={() => doStereo("none")}>&mdash;</button>
                <button className="context-menu__chip" title={t("contextMenu.dativeBond")} onClick={doDative}>&#8594;</button>
              </div>
              <button className="context-menu__item" onClick={() => setSubmenu("bond-highlight")}>
                <Palette size={15} /> {t("section.highlight")} &rsaquo;
              </button>
              {eligibleRing && (
                <button className="context-menu__item" onClick={() => { toggleAromaticRingDisplay(eligibleRing); close(); }}>
                  <Circle size={15} /> {t(existingRingDisplay ? "contextMenu.removeAromaticCircle" : "contextMenu.addAromaticCircle")}
                </button>
              )}
              <button className="context-menu__item context-menu__item--danger" onClick={() => { deleteBond(bond.id); close(); }}>
                <Trash2 size={15} /> {t("contextMenu.deleteBond")}
              </button>
              <div className="context-menu__divider" />
            </>
          )}

          {hasSelection && (
            <>
              <div className="context-menu__label">{t("contextMenu.selection", { count: String(selected.size) })}</div>
              <button className="context-menu__item" onClick={() => { copySelection(); close(); }}>
                <Copy size={15} /> {t("contextMenu.copy")}
              </button>
              <button className="context-menu__item" onClick={() => { duplicateSelection(); close(); }}>
                <CopyPlus size={15} /> {t("contextMenu.duplicate")}
              </button>
              <div className="context-menu__row">
                <button className="context-menu__chip" title={t("tool.rotateCCW")} onClick={() => { rotateSelection(-30); close(); }}>
                  <RotateCcw size={14} />
                </button>
                <button className="context-menu__chip" title={t("tool.rotateCW")} onClick={() => { rotateSelection(30); close(); }}>
                  <RotateCw size={14} />
                </button>
                <button className="context-menu__chip" title={t("tool.resetRotation")} disabled={!canResetRotation} onClick={() => { resetRotation(); close(); }}>
                  <Undo2 size={14} />
                </button>
              </div>
              <button className="context-menu__item" onClick={() => setSubmenu("selection-highlight")}>
                <Palette size={15} /> {t("section.highlight")} &rsaquo;
              </button>
              <button className="context-menu__item" onClick={() => { cleanUpSelection(); close(); }}>
                <Wand2 size={15} /> {t("tool.cleanUpLabel")}
              </button>
              <button className="context-menu__item" onClick={() => { addChargeBracket(selected); close(); }}>
                <Brackets size={15} /> {t("contextMenu.addChargeBracket")}
              </button>
              {hapticSelection && (
                <button className="context-menu__item" onClick={() => { toggleHapticBond(selected); close(); }}>
                  <Orbit size={15} /> {t(existingHapticBond ? "contextMenu.removeHapticBond" : "contextMenu.addHapticBond")}
                </button>
              )}
              <button className="context-menu__item context-menu__item--danger" onClick={() => { deleteSelection(); close(); }}>
                <Trash2 size={15} /> {t("contextMenu.deleteSelection")}
              </button>
              <div className="context-menu__divider" />
            </>
          )}

          <button className="context-menu__item" onClick={() => { void pasteFromClipboard(); close(); }}>
            <ClipboardPaste size={15} /> {t("contextMenu.paste")}
          </button>
          <button className="context-menu__item" onClick={() => { selectAll(); close(); }}>
            <CheckSquare size={15} /> {t("contextMenu.selectAll")}
          </button>
          <button className="context-menu__item" onClick={() => { resetView(); close(); }}>
            <Maximize size={15} /> {t("contextMenu.zoomToFit")}
          </button>
          {tool !== "select" && (
            <button className="context-menu__item" onClick={() => { setTool("select"); close(); }}>
              <MousePointer2 size={15} /> {t("contextMenu.switchToSelect")}
            </button>
          )}
        </>
      )}
    </>
  );

  if (!coords) {
    // First pass: the real content, mounted but invisible, purely so the
    // effect above can measure its true offsetWidth/offsetHeight before
    // anything is shown — see that effect's doc comment for why this has
    // to be the actual content and not a placeholder.
    return createPortal(
      <div className="context-menu" ref={menuRef} style={{ top: contextMenu.y, left: contextMenu.x, visibility: "hidden" }}>
        {content}
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="context-menu" ref={menuRef} style={{ top: coords.top, left: coords.left }}>
      {content}
    </div>,
    document.body
  );
}
