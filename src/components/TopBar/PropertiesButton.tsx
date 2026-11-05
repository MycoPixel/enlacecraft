import { useCallback, useMemo, useState } from "react";
import { Copy, Download, Loader2, Search, Table2 } from "lucide-react";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import {
  buildPropertyRows,
  formatPropertyValue,
  propertiesToCsv,
  type PropertyColumn,
  type PropertyRow,
} from "../../io/propertiesTable";
import {
  fetchCompoundIdentifiersBySmiles,
  PubChemError,
  type CompoundIdentifiers,
} from "../../io/pubchem";
import { downloadBlob } from "../../io/exportImage";

/**
 * Space between batch PubChem requests. PubChem asks for no more than roughly
 * five requests per second; 220 ms leaves a little headroom and is still fast
 * enough that a handful of structures feels immediate.
 */
const ENRICH_INTERVAL_MS = 220;

type EnrichState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; done: number; total: number; found: number; error: string | null };

/** A short pause that also works in test environments without fake timers. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enrichErrorMessage(err: unknown, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (err instanceof PubChemError) {
    switch (err.code) {
      case "NETWORK":
        return t("search.errorNetwork");
      case "HTTP":
        return t("search.errorHttp", { status: String(err.params.status) });
      case "NOT_FOUND":
      case "NO_STRUCTURE":
        return t("properties.lookupNotFound");
      case "BUSY":
        return t("massSpec.lookupKeyBusy");
      case "EMPTY_QUERY":
        return t("properties.emptySmiles");
    }
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Property table for the whole canvas.
 *
 * Kept out of MoleculeInfoButton deliberately: that popover is already a long
 * single-structure readout (formula, mass, SMILES, InChI, descriptors), while
 * this is the opposite view — one row per connected structure, meant to be
 * compared and copied out. A separate top-bar entry also gives CSV export and
 * PubChem enrichment somewhere to live without making the info popover grow a
 * second scrollbar.
 *
 * Enrichment runs only when asked for. The drawing itself needs no network,
 * and a canvas nobody enriches shouldn't cost a PubChem request per fragment.
 */
export function PropertiesButton() {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const setStatus = useMoleculeStore((s) => s.setStatus);

  const [open, setOpen] = useState(false);
  // Descriptor computation is not free, and the top bar mounts this button on
  // every drawing. Gate the rows on the dropdown actually being open (and drop
  // them again on close) so an unused panel never walks every fragment through
  // OpenChemLib on each keystroke or drag.
  const rows = useMemo(() => (open ? buildPropertyRows(molecule) : []), [molecule, open]);
  const [identifiers, setIdentifiers] = useState<Record<string, CompoundIdentifiers | null>>({});
  const [enrich, setEnrich] = useState<EnrichState>({ status: "idle" });
  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);

  const columns: PropertyColumn[] = [
    { key: "index", header: "#" },
    { key: "formula", header: t("properties.col.formula") },
    { key: "molecularWeight", header: t("properties.col.molecularWeight") },
    { key: "exactMass", header: t("properties.col.exactMass") },
    { key: "charge", header: t("properties.col.charge") },
    { key: "atoms", header: t("properties.col.atoms") },
    { key: "heavyAtoms", header: t("properties.col.heavyAtoms") },
    { key: "bonds", header: t("properties.col.bonds") },
    { key: "smiles", header: t("properties.col.smiles") },
    { key: "logP", header: t("properties.col.logP") },
    { key: "logS", header: t("properties.col.logS") },
    { key: "tpsa", header: t("properties.col.tpsa") },
    { key: "hBondDonors", header: t("properties.col.hBondDonors") },
    { key: "hBondAcceptors", header: t("properties.col.hBondAcceptors") },
    { key: "rotatableBonds", header: t("properties.col.rotatableBonds") },
    { key: "stereocenters", header: t("properties.col.stereocenters") },
  ];
  // Identifier columns appear only once the user has enriched the table, so
  // an offline/no-network table doesn't reserve three permanently-empty
  // columns. CSV export uses this same list, keeping file and screen aligned.
  if (Object.values(identifiers).some(Boolean)) {
    columns.push(
      { key: "pubchemCid", header: t("properties.col.pubchemCid") },
      { key: "pubchemName", header: t("properties.col.pubchemName") },
      { key: "inchikey", header: t("properties.col.inchikey") },
    );
  }

  const csv = () => propertiesToCsv(rows, columns, identifiers);

  const copyCsv = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard API");
      await navigator.clipboard.writeText(csv());
      setStatus(t("status.propertiesCsvCopied"));
    } catch {
      setStatus(t("status.propertiesCopyFailed"));
    }
  };

  const downloadCsv = () => {
    downloadBlob(new Blob([csv()], { type: "text/csv;charset=utf-8" }), "properties.csv");
    setStatus(t("status.propertiesCsvDownloaded"));
  };

  /**
   * Sequential, not parallel: PubChem's rate guidance is a few requests per
   * second in total, and a canvas with ten fragments fired at once is the
   * quickest way to get throttled. NOT_FOUND is expected for a fragment
   * PubChem doesn't know (a made-up intermediate, say) and doesn't stop the
   * run; a network/HTTP failure does, since repeating it would only produce
   * the same error for every remaining row.
   */
  const runEnrichment = async () => {
    const targets = rows.filter((row) => row.smiles);
    if (targets.length === 0 || enrich.status === "running") return;

    setEnrich({ status: "running", done: 0, total: targets.length });
    const found: Record<string, CompoundIdentifiers | null> = {};
    let foundCount = 0;
    let doneCount = 0;
    let stopError: string | null = null;

    for (const row of targets) {
      try {
        const result = await fetchCompoundIdentifiersBySmiles(row.smiles);
        found[row.smiles] = result;
        if (result.cid !== undefined || result.name || result.inchikey) foundCount++;
      } catch (err) {
        found[row.smiles] = null;
        if (!(err instanceof PubChemError && err.code === "NOT_FOUND")) {
          stopError = enrichErrorMessage(err, t);
        }
      }
      doneCount++;
      setEnrich({ status: "running", done: doneCount, total: targets.length });
      if (stopError) break;
      if (doneCount < targets.length) await delay(ENRICH_INTERVAL_MS);
    }

    setIdentifiers((previous) => ({ ...previous, ...found }));
    setEnrich({
      status: "done",
      done: doneCount,
      total: targets.length,
      found: foundCount,
      error: stopError,
    });
  };

  const renderCell = (row: PropertyRow, key: PropertyColumn["key"]) => {
    const value = formatPropertyValue(row, key, identifiers);
    // Descriptor cells share the reason a whole row's descriptors are blank,
    // so hovering one explains it instead of leaving an unexplained dash.
    const unavailableHint =
      row.descriptorsUnavailable &&
      (key === "logP" || key === "logS" || key === "tpsa" || key === "hBondDonors" ||
        key === "hBondAcceptors" || key === "rotatableBonds" || key === "stereocenters")
        ? t(`moleculeInfo.descriptorsUnavailable.${row.descriptorsUnavailable}`)
        : undefined;
    const title = key === "smiles" || key === "pubchemName" ? value : unavailableHint;
    return (
      <td
        key={key}
        className={
          key === "smiles"
            ? "properties-table__smiles"
            : key === "pubchemName"
              ? "properties-table__name"
              : undefined
        }
        title={title || undefined}
      >
        {value || "\u2014"}
      </td>
    );
  };

  return (
    <ToolDropdown
      title={t("tool.properties")}
      active={open}
      onOpen={openPanel}
      onClose={closePanel}
      renderContent={() => (
        <div className="properties-panel">
          <div className="properties-panel__head">
            <div>
              <div className="properties-panel__title">{t("properties.title")}</div>
              <div className="properties-panel__hint">
                {t("properties.hint", { count: rows.length })}
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="align-menu__hint">{t("properties.empty")}</p>
          ) : (
            <>
              <div className="properties-panel__actions">
                <button className="properties-panel__action" onClick={() => void copyCsv()}>
                  <Copy size={14} />
                  {t("properties.copyCsv")}
                </button>
                <button className="properties-panel__action" onClick={downloadCsv}>
                  <Download size={14} />
                  {t("properties.downloadCsv")}
                </button>
                <button
                  className="properties-panel__action properties-panel__action--primary"
                  disabled={enrich.status === "running"}
                  onClick={() => void runEnrichment()}
                >
                  {enrich.status === "running" ? (
                    <Loader2 size={14} className="compound-search__spinner" />
                  ) : (
                    <Search size={14} />
                  )}
                  {enrich.status === "running"
                    ? t("properties.enriching", { done: enrich.done, total: enrich.total })
                    : t("properties.enrich")}
                </button>
              </div>

              {enrich.status === "done" && (
                <div className={`properties-panel__status${enrich.error ? " is-error" : ""}`}>
                  {enrich.error
                    ? t("properties.enrichStopped", {
                        done: enrich.done,
                        total: enrich.total,
                        error: enrich.error,
                      })
                    : t("properties.enriched", { found: enrich.found, total: enrich.total })}
                </div>
              )}

              <div className="properties-panel__scroll">
                <table className="properties-table">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key}>{column.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.index}>{columns.map((column) => renderCell(row, column.key))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="properties-panel__note">{t("properties.note")}</p>
            </>
          )}
        </div>
      )}
    >
      <Table2 size={18} />
    </ToolDropdown>
  );
}
