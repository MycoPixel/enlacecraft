import { STRUCTURE_TEMPLATES } from "../../model/structureTemplates";

interface StructureTemplatePickerProps {
  /** Called with the chosen template's full fragment, ready to hand
   * straight to the store's pasteFragment — same shape, same placement
   * behavior as an ordinary clipboard paste. */
  onChoose: (id: string) => void;
}

export function StructureTemplatePicker({ onChoose }: StructureTemplatePickerProps) {
  return (
    <div className="structure-list">
      {STRUCTURE_TEMPLATES.map((tmpl) => (
        <button key={tmpl.id} className="structure-list__item" onClick={() => onChoose(tmpl.id)}>
          {tmpl.label}
        </button>
      ))}
    </div>
  );
}

/** A small vertical-chain-with-branches glyph — evokes a Fischer
 * projection without committing to any one specific sugar, so it reads
 * sensibly as the trigger icon regardless of which templates exist. */
export function StructureTemplateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="7" y1="7" x2="17" y2="7" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="7" y1="17" x2="17" y2="17" />
    </svg>
  );
}
