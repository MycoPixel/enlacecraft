import { useEffect, useState, type FormEvent } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import {
  searchSpectra,
  fetchSpectrum,
  MassBankError,
  type MassBankSpectrum,
  type SpectrumRef,
  type SpectraSearchResult,
  isValidInChIKey,
} from "../../io/massBank";
import { useT } from "../../i18n/useT";

/**
 * Shows experimentally measured MS/MS spectra for a molecule, from MassBank.
 *
 * Needs an InChIKey, which the caller already obtains via PubChem for the
 * InChI/InChIKey row in MoleculeInfo — so this only ever adds one lookup that
 * reuses a key the app has already paid for. Nothing is fetched until an
 * InChIKey actually exists, and no InChIKey means this stays collapsed and
 * says so.
 *
 * Attribution is not optional here. MassBank is a collection of separately
 * licensed contributions (this caffeine record is `dl-de/by-2-0`), so the
 * licence is rendered next to every spectrum and the link points back at the
 * record page the user can verify.
 */
export function SpectrumLookup({
  inchikey,
  pendingKey = false,
  keyError = false,
  keyBusy = false,
  onRetryKey,
  onUseManualKey,
}: {
  inchikey?: string;
  /** Still resolving the InChIKey from PubChem — distinct from "no results". */
  pendingKey?: boolean;
  keyError?: boolean;
  /** PubChem is overloaded. Transient, so this offers a retry instead of
   *  implying the molecule itself could not be resolved. */
  keyBusy?: boolean;
  onRetryKey?: () => void;
  /** Accepts a hand-entered InChIKey, so the feature still works when the
   *  InChIKey lookup service is unreachable. */
  onUseManualKey?: (key: string) => void;
}) {
  const t = useT();
  const [refs, setRefs] = useState<SpectrumRef[] | null>(null);
  const [stereoFallback, setStereoFallback] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error" | "none">("idle");
  const [selected, setSelected] = useState<MassBankSpectrum | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Manual InChIKey entry is always reachable, not just when the automatic
  // lookup fails — someone who already knows their compound's key shouldn't
  // have to break PubChem first to use it. Starts open when there's no key to
  // show (that's when it's the only way forward) and collapsed otherwise so it
  // doesn't crowd the spectra list.
  const [showManual, setShowManual] = useState(!inchikey);

  // A new molecule means the previous molecule's hits are stale — without
  // this, switching structures would show the old compound's spectra.
  useEffect(() => {
    setRefs(null);
    setSelected(null);
    setStereoFallback(false);
    setState("idle");
    setShowAll(false);
    if (!inchikey) return;

    let cancelled = false;
    setState("loading");
    searchSpectra(inchikey)
      .then((result: SpectraSearchResult) => {
        if (cancelled) return;
        const hits = result.refs;
        setRefs(hits);
        setStereoFallback(result.stereochemistryFallback);
        setState(hits.length === 0 ? "none" : "idle");
        // Auto-open the first spectrum: the common case is "show me the
        // measured data", not "let me pick from 122 near-identical entries".
        if (hits.length > 0) openRecord(hits[0].accession);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState(e instanceof MassBankError && e.code === "NETWORK" ? "error" : "none");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inchikey]);

  async function openRecord(accession: string) {
    setLoadingRecord(true);
    try {
      const spec = await fetchSpectrum(accession);
      setSelected(spec);
    } catch {
      setSelected(null);
    } finally {
      setLoadingRecord(false);
    }
  }

  const manualSection =
    onUseManualKey &&
    (showManual ? (
      <ManualKeyForm
        onSubmit={(key) => {
          setShowManual(false);
          onUseManualKey(key);
        }}
      />
    ) : (
      <button className="mass-spec__more" onClick={() => setShowManual(true)}>
        {t("massSpec.manualKeyToggle")}
      </button>
    ));

  if (pendingKey) {
    return (
      <div className="structure-search-menu__loading">
        <Loader2 size={14} className="compound-search__spinner" />
        {t("massSpec.keyLoading")}
      </div>
    );
  }

  if (!inchikey) {
    return (
      <>
        <p className="align-menu__hint">
          {keyBusy
            ? t("massSpec.lookupKeyBusy")
            : keyError
              ? t("massSpec.lookupKeyError")
              : t("massSpec.lookupNeedsKey")}
        </p>
        {keyBusy && onRetryKey && (
          <button className="mass-spec__more" onClick={onRetryKey}>
            {t("massSpec.retryKey")}
          </button>
        )}
        {manualSection}
      </>
    );
  }

  if (state === "loading") {
    return (
      <>
        <div className="structure-search-menu__loading">
          <Loader2 size={14} className="compound-search__spinner" />
          {t("massSpec.lookupLoading")}
        </div>
        {manualSection}
      </>
    );
  }

  if (state === "none") {
    return (
      <>
        <p className="align-menu__hint">{t("massSpec.lookupNone")}</p>
        {manualSection}
      </>
    );
  }

  if (state === "error") {
    // Previously this state was set on a network failure but never rendered,
    // so a connection problem fell through and claimed the molecule had zero
    // spectra -- the same false "no data" the changelog fixed for PubChem.
    return (
      <>
        <p className="align-menu__hint">{t("massSpec.lookupError")}</p>
        {manualSection}
      </>
    );
  }

  const hits = refs ?? [];
  const listed = showAll ? hits : hits.slice(0, 5);

  return (
    <div className="mass-spec">
      <div className="mass-spec__sub">{t("massSpec.measuredSpectra", { count: hits.length })}</div>
      {stereoFallback && <p className="mass-spec__stereo-note">{t("massSpec.stereoFallback")}</p>}

      {listed.map((h) => (
        <button
          key={h.accession}
          className={`mass-spec__hit${selected?.accession === h.accession ? " is-active" : ""}`}
          onClick={() => openRecord(h.accession)}
        >
          {h.accession}
        </button>
      ))}
      {!showAll && hits.length > listed.length && (
        <button className="mass-spec__more" onClick={() => setShowAll(true)}>
          {t("massSpec.showAllSpectra", { count: hits.length })}
        </button>
      )}

      {loadingRecord && !selected && (
        <div className="structure-search-menu__loading">
          <Loader2 size={14} className="compound-search__spinner" />
          {t("massSpec.lookupLoading")}
        </div>
      )}

      {selected && (
        <>
          <div className="mass-spec__sub">{selected.name}</div>
          <div className="mass-spec__meta">
            {[selected.msType, selected.ionMode, selected.instrumentType].filter(Boolean).join(" · ")}
          </div>
          <div className="mass-spec__meta">
            {selected.precursorMz !== undefined &&
              t("massSpec.precursor", {
                mz: selected.precursorMz.toFixed(4),
                type: selected.precursorType ?? "",
              })}
          </div>
          {selected.collisionEnergy && (
            <div className="mass-spec__meta">{t("massSpec.ce", { value: selected.collisionEnergy })}</div>
          )}
          <SpectrumPlot spectrum={selected} />
          <a
            className="mass-spec__attrib"
            href={selected.recordUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("massSpec.attribution", { license: selected.license })}
            <ExternalLink size={11} />
          </a>
        </>
      )}
      {manualSection}
    </div>
  );
}

/**
 * Escape hatch for when the InChIKey lookup can't run at all — PubChem being
 * down shouldn't make the whole panel useless for someone who knows their
 * compound's InChIKey. Validated locally first, because MassBank replies to an
 * unrecognised key with an empty result rather than an error, which would make
 * a typo indistinguishable from "this molecule has no spectra".
 */
function ManualKeyForm({ onSubmit }: { onSubmit: (key: string) => void }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const key = value.trim().toUpperCase();
    if (!isValidInChIKey(key)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSubmit(key);
  }

  return (
    <form className="mass-spec__manual" onSubmit={submit}>
      <label className="mass-spec__manual-label" htmlFor="massbank-inchikey">
        {t("massSpec.manualKeyLabel")}
      </label>
      <div className="mass-spec__manual-row">
        <input
          id="massbank-inchikey"
          className="mass-spec__manual-input"
          value={value}
          placeholder="BSYNRYMUTXBXSQ-UHFFFAOYSA-N"
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="mass-spec__manual-submit">
          {t("massSpec.manualKeySubmit")}
        </button>
      </div>
      {invalid && <p className="mass-spec__manual-error">{t("massSpec.manualKeyInvalid")}</p>}
    </form>
  );
}

/** Stick plot of the measured fragment peaks. */
function SpectrumPlot({ spectrum }: { spectrum: MassBankSpectrum }) {
  const t = useT();
  const W = 260;
  const H = 70;
  const pad = 4;

  const maxMz = Math.max(...spectrum.peaks.map((p) => p.mz), 1);
  const minMz = 0;
  // Relative intensity, defensively: a record with a zero or missing base peak
  // must not collapse the plot into a flat line at the floor.
  const base = Math.max(...spectrum.peaks.map((p) => p.rel ?? p.intensity ?? 0), 0.0001);

  return (
    <svg
      className="mass-spec__measured"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t("massSpec.measuredPlotLabel")}
    >
      <line x1={pad} y1={H - 12} x2={W - pad} y2={H - 12} stroke="var(--panel-border)" strokeWidth={1} />
      {spectrum.peaks.map((p, i) => {
        const rel = p.rel ?? p.intensity ?? 0;
        const x = pad + ((p.mz - minMz) / (maxMz - minMz || 1)) * (W - 2 * pad);
        const h = Math.max(1.5, (rel / base) * (H - 18));
        return (
          <line
            key={i}
            x1={x}
            y1={H - 12}
            x2={x}
            y2={H - 12 - h}
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <title>{`m/z ${p.mz.toFixed(4)} — ${rel.toFixed(1)}%`}</title>
          </line>
        );
      })}
      <text x={pad} y={H - 2} fontSize="8" fill="var(--ink-soft)">
        0
      </text>
      <text x={W - pad} y={H - 2} fontSize="8" textAnchor="end" fill="var(--ink-soft)">
        {maxMz.toFixed(0)} m/z
      </text>
    </svg>
  );
}