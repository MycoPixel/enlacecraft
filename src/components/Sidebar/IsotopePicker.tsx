import { ISOTOPE_PRESETS } from "../../model/constants";
import { useT } from "../../i18n/useT";

interface IsotopePickerProps {
  value: string | null;
  onChange: (presetId: string) => void;
  active: boolean;
}

export function IsotopePicker({ value, onChange, active }: IsotopePickerProps) {
  const t = useT();
  return (
    <div className="element-grid">
      {ISOTOPE_PRESETS.map((p) => (
        <button
          key={p.id}
          className={`element-btn group-btn ${active && value === p.id ? "element-btn--active" : ""}`}
          onClick={() => onChange(p.id)}
          title={t("isotope.place", { isotope: p.label, element: p.element })}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
