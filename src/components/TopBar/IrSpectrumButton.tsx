import { FlaskConical } from "lucide-react";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { IrSpectrumPanel } from "./IrSpectrumPanel";

/**
 * Top-bar entry point for the computed IR spectrum. Desktop-only: it needs the
 * bundled xtb backend, same as the 3D panel's "High accuracy" method, so the
 * button explains rather than failing silently when that isn't there.
 */
export function IrSpectrumButton() {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const hasContent = Object.keys(molecule.atoms).length > 0;

  return (
    <ToolDropdown
      title={hasContent ? t("ir.button") : t("ir.buttonDisabled")}
      active={false}
      renderContent={() => (
        <div className="ir-dropdown">
          <div className="ir-dropdown__head">{t("ir.title")}</div>
          <IrSpectrumPanel molecule={molecule} />
        </div>
      )}
    >
      <FlaskConical size={18} />
    </ToolDropdown>
  );
}