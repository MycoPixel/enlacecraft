import { useMemo, useState } from "react";
import { STRUCTURE_TEMPLATES } from "../../model/structureTemplates";
import type { UserTemplate } from "../../model/userTemplates";
import { UserTemplatePicker } from "./UserTemplatePicker";
import { useT } from "../../i18n/useT";

interface TemplatePaletteProps {
  userTemplates: UserTemplate[];
  onChooseStructure: (id: string) => void;
  onChooseUser: (id: string) => void;
  onDeleteUser: (id: string) => void;
}

/** Category display order — anything not listed here falls back to the end,
 * in whatever order the templates themselves define, rather than being
 * silently dropped. */
const CATEGORY_ORDER = [
  "aminoAcids",
  "carbohydrates",
  "nucleotides",
  "nucleobases",
  "steroids",
  "terpenes",
  "fusedHeterocycles",
  "ligands",
];

const ALL_TAB = "all";
const MINE_TAB = "mine";

/**
 * One palette for every insertable fragment: a tab per built-in category,
 * an "All" tab that keeps the grouped overview, and a "My Templates" tab
 * that hosts the user's saved templates (save/delete/import/export). Rings
 * are deliberately not a tab here — they are a *tool* with their own
 * placement preview, not a paste-able fragment, and keep their dedicated
 * picker next to this one.
 */
export function TemplatePalette({ userTemplates, onChooseStructure, onChooseUser, onDeleteUser }: TemplatePaletteProps) {
  const t = useT();
  const [tab, setTab] = useState<string>(ALL_TAB);
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const seen = new Set(STRUCTURE_TEMPLATES.map((tmpl) => tmpl.category));
    return [...seen].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? CATEGORY_ORDER.length : ia) - (ib === -1 ? CATEGORY_ORDER.length : ib);
    });
  }, []);

  const tabs = [
    { id: ALL_TAB, label: t("templatePalette.all") },
    ...categories.map((category) => ({ id: category, label: t(`structureCategory.${category}`) })),
    { id: MINE_TAB, label: t("templatePalette.mine") },
  ];

  const needle = query.trim().toLowerCase();
  const visible = STRUCTURE_TEMPLATES.filter((tmpl) => {
    if (tab !== ALL_TAB && tmpl.category !== tab) return false;
    return needle.length === 0 || tmpl.label.toLowerCase().includes(needle);
  });

  // Keep the grouped overview on "All"; a single category tab needs no
  // second heading above its grid.
  const groups = tab === ALL_TAB
    ? categories
        .map((category) => ({ category, templates: visible.filter((tmpl) => tmpl.category === category) }))
        .filter((group) => group.templates.length > 0)
    : [{ category: tab, templates: visible }];

  return (
    <div className="template-palette">
      <div className="template-palette__tabs" role="tablist" aria-label={t("templatePalette.tabs")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`template-palette__tab ${tab === item.id ? "template-palette__tab--active" : ""}`}
            onClick={() => { setTab(item.id); setQuery(""); }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === MINE_TAB ? (
        <UserTemplatePicker
          templates={userTemplates}
          onChoose={onChooseUser}
          onDelete={onDeleteUser}
        />
      ) : (
        <>
          <input
            type="search"
            className="template-palette__search"
            placeholder={t("structurePicker.search")}
            aria-label={t("structurePicker.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="template-palette__body">
            {groups.length === 0 ? (
              <p className="template-palette__empty">{t("structurePicker.noResults")}</p>
            ) : (
              groups.map((group) => (
                <div key={group.category} className="template-palette__group">
                  {tab === ALL_TAB && (
                    <div className="template-palette__group-label">{t(`structureCategory.${group.category}`)}</div>
                  )}
                  <div className="template-palette__grid">
                    {group.templates.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        className="template-palette__item"
                        title={tmpl.label}
                        onClick={() => onChooseStructure(tmpl.id)}
                      >
                        {tmpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
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
