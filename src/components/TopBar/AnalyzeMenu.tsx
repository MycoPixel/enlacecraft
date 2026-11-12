import { Box, Check, Microscope } from "lucide-react";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { hasIgnoredValenceAtoms } from "../../model/valence";
import { useT } from "../../i18n/useT";
import { StructureSearchButton } from "./StructureSearchButton";
import { IupacNameButton } from "./IupacNameButton";
import { NmrPredictionButton } from "./NmrPredictionButton";
import { MassSpecButton } from "./MassSpecButton";
import { IrSpectrumButton } from "./IrSpectrumButton";
import { AromaticityButton } from "./AromaticityButton";
import { PropertiesButton } from "./PropertiesButton";
import { MoleculeInfoButton } from "./MoleculeInfoButton";

/**
 * One entry point for the analyses that used to occupy six unlabeled icon
 * buttons beside the search box (and Properties/Info/3D further down the
 * action strip). Each row still opens that analysis' own panel — the panel
 * components keep their network/loading state, and ToolDropdown's shared
 * active-menu signal makes sure only one result panel is on screen at a time.
 *
 * Deliberately a menu of rows rather than a tabbed dock: the panels vary a
 * lot in size (a name is one line, an NMR report is a long table), so
 * replacing the list with the selected panel would make the menu jump around
 * and hide the other options.
 */
export function AnalyzeMenu() {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const show3DView = useMoleculeStore((s) => s.show3DView);
  const toggle3DView = useMoleculeStore((s) => s.toggle3DView);
  const blocked3D = hasIgnoredValenceAtoms(molecule);

  return (
    <ToolDropdown
      title={t("analyze.button")}
      active={false}
      variant="labeled"
      label={t("analyze.button")}
      triggerClassName="analyze-menu__trigger"
      renderContent={(close) => (
        <div className="analyze-menu">
          <div className="analyze-menu__section">{t("analyze.tools")}</div>
          <StructureSearchButton variant="menu-row" label={t("analyze.structureSearch")} menuId="analysis.structure" />
          <IupacNameButton variant="menu-row" label={t("analyze.iupac")} menuId="analysis.iupac" />
          <NmrPredictionButton variant="menu-row" label={t("analyze.nmr")} menuId="analysis.nmr" />
          <MassSpecButton variant="menu-row" label={t("analyze.massSpec")} menuId="analysis.massSpec" />
          <IrSpectrumButton variant="menu-row" label={t("analyze.ir")} menuId="analysis.ir" />
          <AromaticityButton variant="menu-row" label={t("analyze.aromaticity")} menuId="analysis.aromaticity" />
          <PropertiesButton variant="menu-row" label={t("analyze.properties")} menuId="analysis.properties" />
          <div className="analyze-menu__divider" />
          <MoleculeInfoButton variant="menu-row" label={t("analyze.moleculeInfo")} menuId="analysis.info" />
          <button
            type="button"
            className={`tool-dropdown__row${show3DView ? " tool-dropdown__row--active" : ""}`}
            title={blocked3D ? t("tool.view3dBlocked") : t("tool.view3d")}
            aria-pressed={show3DView}
            disabled={blocked3D}
            onClick={() => { toggle3DView(); close(); }}
          >
            <span className="tool-dropdown__row-icon"><Box size={16} /></span>
            <span className="tool-dropdown__row-label">{t("analyze.view3d")}</span>
            {show3DView && <Check size={14} className="tool-dropdown__row-check" />}
          </button>
        </div>
      )}
    >
      <Microscope size={17} />
    </ToolDropdown>
  );
}
