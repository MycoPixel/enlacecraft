import { useMemo, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { MassSpecPanel } from "./MassSpecPanel";
import { SpectrumLookup } from "./SpectrumLookup";
import { fetchInChI, PubChemError } from "../../io/pubchem";
import { exportSmiles } from "../../io/smiles";

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
  const [inchikey, setInchikey] = useState<string | undefined>(undefined);
  const [keyState, setKeyState] = useState<"idle" | "loading" | "error" | "busy">("idle");
  // Which structure the current key belongs to. Without this the key survives
  // edits and the panel would keep showing the previous molecule's spectra
  // under a newly drawn structure. Tracked for manual keys too, so reopening
  // the tab can't quietly replace a pasted key with a failed PubChem lookup.
  const keyFor = useRef<{ smiles: string; key: string } | null>(null);

  const disabled = !hasContent;

  /**
   * Resolved on demand rather than on mount: the popover may never be opened,
   * and an InChIKey nobody looks up shouldn't be a PubChem request. Keyed on
   * the molecule so a new structure discards the previous key — otherwise
   * caffeine's spectra would keep showing under whatever was drawn next.
   */
  async function openSpectra() {
    setTab("spectra");
    const smiles = exportSmiles(useMoleculeStore.getState().molecule);
    if (!smiles.trim()) {
      setInchikey(undefined);
      keyFor.current = null;
      setKeyState("error");
      return;
    }
    if (keyFor.current?.smiles === smiles && inchikey) return;

    setKeyState("loading");
    try {
      const { inchikey: key } = await fetchInChI(smiles);
      setInchikey(key);
      keyFor.current = { smiles, key };
      setKeyState("idle");
    } catch (e) {
      // PubChem being overloaded is not the molecule's fault and saying
      // "could not resolve this structure" would be a lie — it is transient
      // and worth retrying, so it gets its own message.
      const busy = e instanceof PubChemError && e.code === "BUSY";
      setInchikey(undefined);
      keyFor.current = null;
      setKeyState(busy ? "busy" : "error");
    }
  }

  /** Accepts a hand-entered InChIKey, for when PubChem can't be reached. */
  function useManualKey(key: string) {
    setInchikey(key);
    keyFor.current = { smiles: exportSmiles(useMoleculeStore.getState().molecule), key };
    setKeyState("idle");
  }

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
          onRetryKey={openSpectra}
          onUseManualKey={useManualKey}
        />
      ),
    [tab, molecule, inchikey, keyState],
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
      <FlaskConical size={18} />
    </ToolDropdown>
  );
}