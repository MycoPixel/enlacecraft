import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Element } from "../../types/chemistry";
import { COMMON_ELEMENTS, EXTENDED_ELEMENTS, ELEMENT_COLOR } from "../../model/constants";
import { useT } from "../../i18n/useT";

interface ElementPickerProps {
  value: Element;
  onChange: (el: Element) => void;
  active: boolean;
}

export function ElementPicker({ value, onChange, active }: ElementPickerProps) {
  const t = useT();
  // Stays expanded once opened for as long as the currently-picked element
  // is one of the "more" ones — so choosing, say, Si doesn't immediately
  // hide the very button that's now active.
  const [expanded, setExpanded] = useState(() => EXTENDED_ELEMENTS.includes(value));

  const renderButton = (el: Element) => (
    <button
      key={el}
      className={`element-btn ${active && value === el ? "element-btn--active" : ""}`}
      style={{ color: ELEMENT_COLOR[el] }}
      onClick={() => onChange(el)}
      title={t("element.place", { element: el })}
    >
      {el}
    </button>
  );

  return (
    <div className="element-grid">
      {COMMON_ELEMENTS.map(renderButton)}
      {expanded
        ? EXTENDED_ELEMENTS.map(renderButton)
        : (
          <button
            className="element-btn element-btn--more"
            onClick={() => setExpanded(true)}
            title={t("element.more")}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
    </div>
  );
}
