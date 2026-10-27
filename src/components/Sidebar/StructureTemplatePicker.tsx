import { STRUCTURE_TEMPLATES } from "../../model/structureTemplates";
import { useT } from "../../i18n/useT";

interface StructureTemplatePickerProps {
  /** Called with the chosen template's full fragment, ready to hand
   * straight to the store's pasteFragment — same shape, same placement
   * behavior as an ordinary clipboard paste. */
  onChoose: (id: string) => void;
}

/** Category display order — anything not listed here (shouldn't normally
 * happen) falls back to appearing after all of these, in whatever order
 * Object.keys gives it, rather than being silently dropped. */
const CATEGORY_ORDER = [
  "aminoAcids",
  "carbohydrates",
  "nucleotides",
  "nucleobases",
  "steroids",
  "terpenes",
  "ligands",
];

export function StructureTemplatePicker({ onChoose }: StructureTemplatePickerProps) {
  const t = useT();
  const byCategory = new Map<string, typeof STRUCTURE_TEMPLATES>();
  for (const tmpl of STRUCTURE_TEMPLATES) {
    const list = byCategory.get(tmpl.category) ?? [];
    list.push(tmpl);
    byCategory.set(tmpl.category, list);
  }
  const categories = [...byCategory.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? CATEGORY_ORDER.length : ia) - (ib === -1 ? CATEGORY_ORDER.length : ib);
  });
  return (
    <div className="structure-list">
      {categories.map((category) => (
        <div key={category} className="structure-list__group">
          <div className="structure-list__group-label">{t(`structureCategory.${category}`)}</div>
          {byCategory.get(category)!.map((tmpl) => (
            <button key={tmpl.id} className="structure-list__item" onClick={() => onChoose(tmpl.id)}>
              {tmpl.label}
            </button>
          ))}
        </div>
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
