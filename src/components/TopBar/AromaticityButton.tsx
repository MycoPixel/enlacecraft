import { Hexagon } from "lucide-react";
import { ToolDropdown, type ToolDropdownTriggerProps } from "../Sidebar/ToolDropdown";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useAromaticity } from "../../hooks/useAromaticity";
import { useT } from "../../i18n/useT";
import { AromaticityPanel } from "./AromaticityPanel";

/**
 * Top-bar entry point for the aromaticity analysis.
 *
 * A top-bar button rather than another block inside MoleculeInfo for the same
 * reason NMR and mass spectrometry get their own: Info already carries
 * formula/MW/SMILES/InChI plus eight descriptors, and this is a different kind
 * of output — a per-ring-system list with reasoning, not a flat table of
 * scalar properties.
 *
 * Unlike the other two panels this needs no backend and no network request, so
 * it works identically on the web build and needs no loading state.
 */
export function AromaticityButton({ variant, label, menuId }: ToolDropdownTriggerProps = {}) {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const results = useAromaticity();

  const hasContent = Object.keys(molecule.atoms).length > 0;
  const ringCount = results.reduce((n, r) => n + r.systems.length, 0);

  return (
    <ToolDropdown
      title={hasContent ? t("aromaticity.button") : t("aromaticity.buttonDisabled")}
      // Deliberately not tracking our own open state to drive this. ToolDropdown
      // fires onOpen() from inside its own setOpen updater, i.e. during its
      // render — so setting state from an onOpen handler throws React's
      // "cannot update a component while rendering a different component".
      // NmrPredictionButton and MassSpecButton pass active={false} for the same
      // reason.
      active={false}
      variant={variant}
      label={label}
      menuId={menuId}
      renderContent={(close) => (
        <div className="aromaticity-dropdown">
          <div className="aromaticity-dropdown__head">
            <span className="aromaticity-dropdown__title">{t("aromaticity.title")}</span>
            {ringCount > 0 && (
              <span className="aromaticity-dropdown__count">
                {t("aromaticity.systemCount", { count: ringCount })}
              </span>
            )}
          </div>
          <AromaticityPanel />
          <button type="button" className="aromaticity-dropdown__close" onClick={close}>
            {t("aromaticity.close")}
          </button>
        </div>
      )}
    >
      <Hexagon size={18} />
    </ToolDropdown>
  );
}