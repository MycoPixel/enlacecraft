import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Element } from "../../types/chemistry";
import { COMMON_ELEMENTS, ELEMENT_COLOR } from "../../model/constants";
import { useT } from "../../i18n/useT";
import { PeriodicTableModal } from "./PeriodicTableModal";

interface ElementPickerProps {
  value: Element;
  onChange: (el: Element) => void;
  active: boolean;
}

export function ElementPicker({ value, onChange, active }: ElementPickerProps) {
  const t = useT();
  const [modalOpen, setModalOpen] = useState(false);

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
      <button
        className={`element-btn element-btn--more ${active && !COMMON_ELEMENTS.includes(value) ? "element-btn--active" : ""}`}
        onClick={() => setModalOpen(true)}
        title={t("element.more")}
      >
        <MoreHorizontal size={14} />
      </button>
      <PeriodicTableModal
        open={modalOpen}
        value={value}
        onSelect={onChange}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
