import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, Copy, Check, AlertTriangle, Loader2 } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useFormulaDisplay } from "../../hooks/useFormulaDisplay";
import { hasPlaceholderLabels } from "../../model/valence";
import { Formula } from "../common/Formula";
import { exportSmiles } from "../../io/smiles";
import { fetchInChI, PubChemError } from "../../io/pubchem";
import { ToolButton } from "../Sidebar/ToolButton";
import { useT } from "../../i18n/useT";

type InchiState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "result"; inchi: string; inchikey: string };

/**
 * Formula/MW/SMILES used to sit permanently in the top bar, which meant a
 * number was always on screen whether or not anyone cared about it right
 * now. This puts the same data behind a button instead — same portal +
 * fixed-position pattern as ExportMenu, so it can't be clipped by the top
 * bar's horizontally-scrolling toolstrip.
 *
 * SMILES is always for the *whole* canvas (exportSmiles doesn't take a
 * subset), even when a selection narrows the formula/MW above it — same
 * scope as the existing "Copy SMILES" export action.
 *
 * InChI/InChIKey (fetchInChI) are the one part of this popover that needs
 * a network round-trip, so — unlike formula/MW/SMILES, which are all
 * free and shown immediately — they're behind their own "Get InChI"
 * button inside here rather than fetched every time the popover opens.
 */
export function MoleculeInfoButton() {
  const [open, setOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<null | "smiles" | "inchi" | "inchikey">(null);
  const [inchiState, setInchiState] = useState<InchiState | null>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const { fragments } = useFormulaDisplay();
  const hasAnyAtoms = Object.keys(molecule.atoms).length > 0;
  const hasPlaceholder = hasPlaceholderLabels(molecule);

  const reposition = () => {
    const btn = btnWrapRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCopiedField(null);
    setInchiState(null);
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReposition = () => reposition();
    document.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const smiles = hasAnyAtoms ? exportSmiles(molecule) : "";

  const copyField = async (text: string, field: "smiles" | "inchi" | "inchikey") => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard API");
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
    } catch {
      // Ignore — the text is still shown/selectable in the popover.
    }
  };

  const messageForError = (err: unknown): string => {
    if (err instanceof PubChemError) {
      switch (err.code) {
        case "EMPTY_QUERY": return t("iupac.errorEmpty");
        case "NOT_FOUND":
        case "NO_STRUCTURE": return t("iupac.errorNotFound");
        case "NETWORK": return t("search.errorNetwork");
        case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
      }
    }
    return err instanceof Error ? err.message : "Lookup failed";
  };

  const runInchiLookup = async () => {
    if (!hasAnyAtoms || hasPlaceholder) return;
    setInchiState({ phase: "loading" });
    try {
      const result = await fetchInChI(smiles);
      setInchiState({ phase: "result", inchi: result.inchi, inchikey: result.inchikey });
    } catch (err) {
      setInchiState({ phase: "error", message: messageForError(err) });
    }
  };

  return (
    <div className="molecule-info" ref={btnWrapRef}>
      <ToolButton title={t("tool.moleculeInfo")} active={open} onClick={() => setOpen((o) => !o)}>
        <Info size={18} />
        {hasPlaceholder && <AlertTriangle size={10} className="molecule-info__badge" />}
      </ToolButton>
      {open && coords &&
        createPortal(
          <div className="molecule-info-dropdown" ref={dropdownRef} style={{ top: coords.top, right: coords.right }}>
            <div className="molecule-info__label">
              {selected.size > 0 ? t("moleculeInfo.selection") : t("moleculeInfo.molecule")}
            </div>
            {fragments.length === 0 ? (
              <div className="molecule-info__empty">{t("moleculeInfo.empty")}</div>
            ) : (
              <div className="molecule-info__fragments">
                {fragments.map((f, i) => (
                  <div className="molecule-info__row" key={i}>
                    <span className="molecule-info__formula">
                      <Formula formula={f.formula} />
                    </span>
                    {f.mw > 0 && <span className="molecule-info__mw">{f.mw.toFixed(2)} g/mol</span>}
                  </div>
                ))}
              </div>
            )}
            {hasPlaceholder && (
              <div className="molecule-info__warning">
                <AlertTriangle size={13} />
                <span>{t("moleculeInfo.placeholderWarning")}</span>
              </div>
            )}
            <div className="molecule-info__divider" />
            <div className="molecule-info__label">{t("moleculeInfo.smiles")}</div>
            <div className="molecule-info__smiles-row">
              <code className="molecule-info__smiles">{smiles || "\u2014"}</code>
              {smiles && (
                <button className="molecule-info__copy" onClick={() => copyField(smiles, "smiles")} title={t("tool.exportSmiles")}>
                  {copiedField === "smiles" ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>

            <div className="molecule-info__divider" />
            <div className="molecule-info__label">{t("moleculeInfo.inchi")}</div>
            {!inchiState && (
              <button
                className="molecule-info__inchi-btn"
                disabled={!hasAnyAtoms || hasPlaceholder}
                title={hasPlaceholder ? t("moleculeInfo.placeholderWarning") : undefined}
                onClick={runInchiLookup}
              >
                {t("moleculeInfo.getInchi")}
              </button>
            )}
            {inchiState?.phase === "loading" && (
              <div className="structure-search-menu__loading">
                <Loader2 size={14} className="compound-search__spinner" />
                {t("iupac.loading")}
              </div>
            )}
            {inchiState?.phase === "error" && <p className="align-menu__hint">{inchiState.message}</p>}
            {inchiState?.phase === "result" && (
              <>
                <div className="molecule-info__smiles-row">
                  <code className="molecule-info__smiles">{inchiState.inchi}</code>
                  <button className="molecule-info__copy" onClick={() => copyField(inchiState.inchi, "inchi")} title={t("moleculeInfo.copyInchi")}>
                    {copiedField === "inchi" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="molecule-info__label">{t("moleculeInfo.inchikey")}</div>
                <div className="molecule-info__smiles-row">
                  <code className="molecule-info__smiles">{inchiState.inchikey}</code>
                  <button className="molecule-info__copy" onClick={() => copyField(inchiState.inchikey, "inchikey")} title={t("moleculeInfo.copyInchikey")}>
                    {copiedField === "inchikey" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
