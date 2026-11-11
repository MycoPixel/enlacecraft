import { useCallback, useMemo, useState } from "react";
import { ChartNoAxesColumn } from "lucide-react";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { MassSpecPanel } from "./MassSpecPanel";
import { SpectrumLookup } from "./SpectrumLookup";
import { useInChIKey } from "../../hooks/useInChIKey";

/**
 * Mass spectrometry lives behind its own top-bar button rather than inside the
 * Molecule Info popover. Info is already carrying formula/MW/SMILES/InChI plus
 * eight drug-likeness descriptors, and bolting two plots and a spectrum list
 * onto the end of that made the popover long enough that people had to scroll
 * it to reach anything — a scroll inside an already-crowded popover is worse
 * than a second entry point. It also matches how NMR already works: a top-bar
 * button that owns its own panel.
 *
 * Tabs rather than one long column, because the two halves answer different
 * questions. "Mass" is arithmetic on the structure and is available
 * instantly; "Spectra" is measured data that needs an InChIKey from PubChem
 * and then a network round-trip, so it must not be mounted until asked for.
 */
export function MassSpecButton() {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const hasContent = Object.keys(molecule.atoms).length > 0;
  const [tab, setTab] = useState<"mass" | "spectra">("mass");
  const { inchikey, state: keyState, resolve: resolveKey, useManualKey } = useInChIKey();

  const disabled = !hasContent;

  /**
   * Resolved on demand rather than on mount: the popover may never be opened,
   * and an InChIKey nobody looks up shouldn't be a PubChem request. The
   * resolution chain itself lives in useInChIKey so every panel that needs a
   * key shares one implementation.
   */
  const openSpectra = useCallback(() => {
    setTab("spectra");
    resolveKey();
  }, [resolveKey]);

  const body = useMemo(
    () =>
      tab === "mass" ? (
        <MassSpecPanel molecule={molecule} />
      ) : (
        <SpectrumLookup
          inchikey={inchikey}
          pendingKey={keyState === "loading"}
          keyError={keyState === "error"}
          keyBusy={keyState === "busy"}
          keyUnsupported={keyState === "unsupported"}
          onRetryKey={openSpectra}
          onUseManualKey={useManualKey}
        />
      ),
    [tab, molecule, inchikey, keyState, openSpectra, useManualKey],
  );

  return (
    <ToolDropdown
      title={disabled ? t("massSpec.buttonDisabled") : t("massSpec.button")}
      active={false}
      onOpen={disabled ? undefined : tab === "spectra" ? openSpectra : undefined}
      renderContent={() => (
        <div className="mass-spec-panel">
          <div className="mass-spec-panel__tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "mass"}
              className={`mass-spec-panel__tab${tab === "mass" ? " is-active" : ""}`}
              onClick={() => setTab("mass")}
            >
              {t("massSpec.tabMass")}
            </button>
            <button
              role="tab"
              aria-selected={tab === "spectra"}
              className={`mass-spec-panel__tab${tab === "spectra" ? " is-active" : ""}`}
              onClick={openSpectra}
            >
              {t("massSpec.tabSpectra")}
            </button>
          </div>
          {body}
        </div>
      )}
    >
      <ChartNoAxesColumn size={18} />
    </ToolDropdown>
  );
}