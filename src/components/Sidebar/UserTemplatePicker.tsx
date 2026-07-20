import { X } from "lucide-react";
import type { UserTemplate } from "../../model/userTemplates";
import { useT } from "../../i18n/useT";

interface UserTemplatePickerProps {
  templates: UserTemplate[];
  onChoose: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Mirrors StructureTemplatePicker's list, but for the user's own saved
 * templates (see model/userTemplates.ts) — each row adds a delete button,
 * since unlike the built-ins, these are the user's to manage. */
export function UserTemplatePicker({ templates, onChoose, onDelete }: UserTemplatePickerProps) {
  const t = useT();
  if (templates.length === 0) {
    return <p className="align-menu__hint">{t("userTemplate.empty")}</p>;
  }
  return (
    <div className="structure-list">
      {templates.map((tmpl) => (
        <div key={tmpl.id} className="user-template-list__row">
          <button className="structure-list__item" onClick={() => onChoose(tmpl.id)}>
            {tmpl.label}
          </button>
          <button
            className="user-template-list__delete"
            title={t("userTemplate.delete")}
            onClick={(e) => { e.stopPropagation(); onDelete(tmpl.id); }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
