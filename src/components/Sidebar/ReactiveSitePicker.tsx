import { REACTIVE_SITE_PRESETS } from "../../model/constants";
import { useT } from "../../i18n/useT";

interface ReactiveSitePickerProps {
  value: string | null;
  onChange: (presetId: string) => void;
  active: boolean;
}

/** What's actually drawn for each preset — a colon for a shown lone pair,
 * a superscript sign for a shown charge, matching how these placeholders
 * are conventionally handwritten in mechanism-arrow diagrams. */
const DISPLAY: Record<string, string> = {
  Nu: "Nu",
  "Nu-lp": "Nu:",
  "Nu-lp-neg": "Nu:\u207B",
  E: "E",
  "E-plus": "E\u207A",
};

/**
 * Generic nucleophile/electrophile placeholders (REACTIVE_SITE_PRESETS) —
 * a separate button next to Groups rather than folded into it, since
 * these aren't real substituents with a formula, just mechanism-diagram
 * shorthand that happens to reuse the same single-labeled-vertex
 * mechanism (see Atom.group's doc comment).
 */
export function ReactiveSitePicker({ value, onChange, active }: ReactiveSitePickerProps) {
  const t = useT();
  return (
    <div className="element-grid">
      {REACTIVE_SITE_PRESETS.map((p) => (
        <button
          key={p.id}
          className={`element-btn group-btn ${active && value === p.id ? "element-btn--active" : ""}`}
          onClick={() => onChange(p.id)}
          title={t("reactiveSite.place", { label: DISPLAY[p.id] })}
        >
          {DISPLAY[p.id]}
        </button>
      ))}
    </div>
  );
}
