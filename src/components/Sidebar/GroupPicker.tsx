import { ABBREVIATED_GROUPS } from "../../model/constants";
import { useT } from "../../i18n/useT";

interface GroupPickerProps {
  value: string | null;
  onChange: (groupId: string) => void;
  active: boolean;
}

export function GroupPicker({ value, onChange, active }: GroupPickerProps) {
  const t = useT();
  return (
    <div className="element-grid">
      {ABBREVIATED_GROUPS.map((g) => (
        <button
          key={g.id}
          className={`element-btn group-btn ${active && value === g.id ? "element-btn--active" : ""}`}
          onClick={() => onChange(g.id)}
          title={t("group.place", { group: g.label, formula: g.formula })}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
