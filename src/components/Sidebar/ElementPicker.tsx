import type { Element } from "../../types/chemistry";
import { ELEMENTS, ELEMENT_COLOR } from "../../model/constants";
import { useT } from "../../i18n/useT";

interface ElementPickerProps {
  value: Element;
  onChange: (el: Element) => void;
  active: boolean;
}

export function ElementPicker({ value, onChange, active }: ElementPickerProps) {
  const t = useT();
  return (
    <div className="element-grid">
      {ELEMENTS.map((el) => (
        <button
          key={el}
          className={`element-btn ${active && value === el ? "element-btn--active" : ""}`}
          style={{ color: ELEMENT_COLOR[el] }}
          onClick={() => onChange(el)}
          title={t("element.place", { element: el })}
        >
          {el}
        </button>
      ))}
    </div>
  );
}
