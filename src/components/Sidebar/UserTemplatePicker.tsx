import { useRef, useState } from "react";
import { X, Download, Upload } from "lucide-react";
import type { UserTemplate } from "../../model/userTemplates";
import { exportBookmarks, importBookmarks, BOOKMARKS_FILE_EXTENSION, BookmarksParseError } from "../../io/templateBookmarks";
import { downloadBlob } from "../../io/exportImage";
import { LIMITS } from "../../io/validate";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";

interface UserTemplatePickerProps {
  templates: UserTemplate[];
  onChoose: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Mirrors the built-in template grid, but for the user's own saved
 * templates (see model/userTemplates.ts) — each row adds a delete button
 * and a selection checkbox, since unlike the built-ins these are the
 * user's to manage and to export/back up. Clicking a row's label still
 * inserts it immediately (unchanged); the checkbox is a separate
 * target purely for building up a selection to export.
 *
 * Export writes a .enlacebookmarks file (io/templateBookmarks.ts) —
 * deliberately not .enlacecraft (a full drawing's state), so opening one
 * as the other isn't a trap. Import merges a file's templates into the
 * saved list (always additive, fresh ids — see addImportedUserTemplates).
 */
export function UserTemplatePicker({ templates, onChoose, onDelete }: UserTemplatePickerProps) {
  const t = useT();
  const importUserTemplates = useMoleculeStore((s) => s.importUserTemplates);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = templates.length > 0 && selected.size === templates.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(templates.map((tm) => tm.id)));

  const doExport = (which: UserTemplate[]) => {
    const json = exportBookmarks(which);
    downloadBlob(new Blob([json], { type: "application/json" }), `bookmarks${BOOKMARKS_FILE_EXTENSION}`);
  };

  const doImportFile = (file: File) => {
    if (file.size > LIMITS.maxFileChars) {
      setStatus(t("status.fileTooLarge", { name: file.name }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importBookmarks(String(reader.result));
        importUserTemplates(imported);
        setStatus(t("status.bookmarksImported", { count: imported.length }));
      } catch (err) {
        setStatus(t(err instanceof BookmarksParseError ? "status.bookmarksImportError" : "status.importError", { name: file.name }));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="user-template-picker">
      {templates.length === 0 ? (
        <p className="align-menu__hint">{t("userTemplate.empty")}</p>
      ) : (
        <>
          <label className="user-template-picker__select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            {t("userTemplate.selectAll")}
          </label>
          <div className="structure-list">
            {templates.map((tmpl) => (
              <div key={tmpl.id} className="user-template-list__row">
                <input
                  type="checkbox"
                  checked={selected.has(tmpl.id)}
                  onChange={() => toggle(tmpl.id)}
                  onClick={(e) => e.stopPropagation()}
                />
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
        </>
      )}
      <div className="user-template-picker__actions">
        <button
          className="user-template-picker__action-btn"
          disabled={selected.size === 0}
          onClick={() => doExport(templates.filter((tm) => selected.has(tm.id)))}
        >
          <Download size={13} />
          {t("userTemplate.exportSelected", { count: selected.size })}
        </button>
        <button
          className="user-template-picker__action-btn"
          disabled={templates.length === 0}
          onClick={() => doExport(templates)}
        >
          <Download size={13} />
          {t("userTemplate.exportAll")}
        </button>
        <button className="user-template-picker__action-btn" onClick={() => fileInputRef.current?.click()}>
          <Upload size={13} />
          {t("userTemplate.import")}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={BOOKMARKS_FILE_EXTENSION}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) doImportFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
