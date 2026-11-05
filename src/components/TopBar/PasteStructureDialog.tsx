import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { importMol } from "../../io/molfile";
import { importCdxml } from "../../io/cdxml";
import { importSmiles, detectStructureText, SmilesImportError, type StructureTextKind } from "../../io/smilesImport";
import { LIMITS } from "../../io/validate";
import type { Molecule } from "../../types/chemistry";

interface PasteStructureDialogProps {
  onClose: () => void;
}

/**
 * Paste-to-import: a textarea that accepts a SMILES string, MOL/V2000
 * text, or CDXML and lands the structure on the current canvas.
 *
 * Mounted only while open (TopBar renders it conditionally), so the text
 * and error state initialize fresh every time — a stale SMILES from last
 * time can't be one accidental Enter away from re-importing, and there's
 * no reset-on-open effect to fight React's lint rules over.
 *
 * Why a paste path at all when Import already exists: the most common
 * "get a structure in" flow is copying a SMILES out of a paper's SI, a
 * database page, or a chat message — a file picker in the middle of that
 * flow is pure friction. The dialog is format-agnostic on purpose
 * (`detectStructureText` routes SMILES vs MOL vs CDXML), because the user
 * usually doesn't know or care which format they copied; whatever
 * round-trips through the clipboard should just work.
 *
 * Insertion goes through the store's `importCompound`, the same action
 * CompoundSearch uses: the new structure is merged next to whatever is
 * already drawn (or centered in the visible viewport when the canvas is
 * empty), selected, and undoable as one step — so pasting never destroys
 * work in progress.
 *
 * Detection runs live on every keystroke (it's two cheap regexes) to show
 * what will happen; the actual parse runs once on submit so a huge pasted
 * molecule can't cost a re-parse per keystroke.
 */
export function PasteStructureDialog({ onClose }: PasteStructureDialogProps) {
  const t = useT();
  const importCompound = useMoleculeStore((s) => s.importCompound);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) el.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const kind: StructureTextKind | null = useMemo(
    () => detectStructureText(text),
    [text],
  );

  const canSubmit = kind !== null && text.length <= LIMITS.maxFileChars;

  const submit = () => {
    if (!canSubmit) return;
    try {
      const molecule: Molecule =
        kind === "cdxml" ? importCdxml(text) : kind === "smiles" ? importSmiles(text).molecule : importMol(text);
      if (Object.keys(molecule.atoms).length === 0) {
        setError(t("paste.errorEmpty"));
        return;
      }
      importCompound(molecule);
      setStatus(t("status.imported", { count: Object.keys(molecule.atoms).length }));
      onClose();
    } catch (err) {
      // OCL/MDL parse messages are written for developers ("position: 214",
      // "dangling ring closure") — that specificity is genuinely useful for
      // a mistyped SMILES, so surface the reason, not just a generic blurb.
      const reason = err instanceof SmilesImportError ? err.message : t("paste.errorGeneric");
      setError(t("paste.error", { reason }));
    }
  };

  // Ctrl/Cmd+Enter submits from anywhere in the textarea — Enter alone
  // stays a newline, since MOL text is multi-line and pasting with a
  // trailing newline must not trigger an accidental import.
  const onKeyDownInTextarea = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  return createPortal(
    <div className="paste-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="paste-dialog" role="dialog" aria-modal="true" aria-label={t("paste.title")}>
        <div className="paste-dialog__header">
          <h2>{t("paste.title")}</h2>
          <button type="button" className="paste-dialog__close" onClick={onClose} aria-label={t("shortcuts.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="paste-dialog__body">
          <textarea
            ref={textareaRef}
            className="paste-dialog__textarea"
            value={text}
            placeholder={t("paste.placeholder")}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={onKeyDownInTextarea}
            spellCheck={false}
          />
          <div className="paste-dialog__meta">
            <span className={`paste-dialog__detected ${kind ? "" : "paste-dialog__detected--unknown"}`}>
              {text.trim().length === 0
                ? t("paste.detected.none")
                : kind === "smiles"
                  ? t("paste.detected.smiles")
                  : kind === "mol"
                    ? t("paste.detected.mol")
                    : kind === "cdxml"
                      ? t("paste.detected.cdxml")
                      : t("paste.detected.unknown")}
            </span>
            <span className="paste-dialog__hint">{t("paste.hint")}</span>
          </div>
          {/* Formats deliberately not supported, so the absence of a
              ChemDraw-binary (.cdx) or Office-native (EMF/EPS/TIFF) option
              reads as a documented trade-off rather than an oversight. The
              open text formats above (and SVG with embedded CDXML) cover
              the common Word/PowerPoint/Inkscape/ChemDraw workflows without
              the platform-specific native code those binary formats need. */}
          <div className="paste-dialog__note">{t("paste.formatsNote")}</div>
          {error && <div className="paste-dialog__error">{error}</div>}
        </div>
        <div className="paste-dialog__footer">
          <button type="button" className="paste-dialog__cancel" onClick={onClose}>
            {t("paste.cancel")}
          </button>
          <button type="button" className="paste-dialog__add" disabled={!canSubmit} onClick={submit}>
            {t("paste.add")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
