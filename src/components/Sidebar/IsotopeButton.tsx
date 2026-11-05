import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Radiation } from "lucide-react";
import { IsotopePicker } from "./IsotopePicker";
import { useT } from "../../i18n/useT";

interface IsotopeButtonProps {
  value: string | null;
  onChange: (presetId: string) => void;
  active: boolean;
}

/**
 * Isotope selection used to be its own always-expanded section under the
 * element picker — thirteen preset buttons permanently taking up sidebar
 * height whether or not anyone was using them. This is the same content
 * (IsotopePicker, unchanged) behind one compact button sized to match the
 * element grid it sits in, right after the "more elements" button —
 * "isotope" reads as one more thing you can set on an atom, in the same
 * row as the atoms themselves, not a separate destination — and
 * deliberately not folded into PeriodicTableModal, which is about
 * picking an element, a different question from picking an isotope of
 * whichever element is already chosen.
 */
export function IsotopeButton({ value, onChange, active }: IsotopeButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const btn = btnWrapRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({ top: rect.top, left: rect.right + 8 });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onReposition = () => reposition();
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div ref={btnWrapRef} style={{ display: "contents" }}>
      <button
        className={`element-btn element-btn--more ${active ? "element-btn--active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={t("section.isotope")}
      >
        <Radiation size={14} />
      </button>
      {open &&
        createPortal(
          <div className="tool-dropdown" ref={popoverRef} style={{ top: coords?.top, left: coords?.left }}>
            <IsotopePicker
              value={value}
              onChange={(id) => { onChange(id); setOpen(false); }}
              active={active}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
