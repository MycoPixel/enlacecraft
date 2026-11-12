import { useMemo, useState } from "react";
import { AudioWaveform } from "lucide-react";
import { ToolDropdown, type ToolDropdownTriggerProps } from "../Sidebar/ToolDropdown";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { relevantIrBands } from "../../model/irBands";
import { useT } from "../../i18n/useT";
import { IrSpectrumPanel } from "./IrSpectrumPanel";
import { IrReportView } from "./IrReportView";
import { useIrSpectrum } from "./useIrSpectrum";

/**
 * Top-bar entry point for the computed IR spectrum. Desktop-only: it needs the
 * bundled xtb backend, same as the 3D panel's "High accuracy" method, so the
 * button explains rather than failing silently when that isn't there.
 *
 * The waveform icon is deliberate: this and the mass-spectrometry button used
 * to share FlaskConical, which made two different top-bar tools
 * indistinguishable at a glance. Activity is already taken by NMR prediction.
 *
 * The calculation is owned here rather than by the panel so the compact
 * dropdown and the full-screen report show one spectrum between them, mirroring
 * how NmrPredictionButton holds its own state.
 */
export function IrSpectrumButton({ variant, label, menuId }: ToolDropdownTriggerProps = {}) {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const hasContent = Object.keys(molecule.atoms).length > 0;
  const { state, run } = useIrSpectrum(molecule);
  const [reportOpen, setReportOpen] = useState(false);

  // Which diagnostic ranges this structure has — read from the drawing, so it's
  // known before any calculation and shared by both views.
  const bands = useMemo(() => relevantIrBands(molecule), [molecule]);

  return (
    <>
      <ToolDropdown
        title={hasContent ? t("ir.button") : t("ir.buttonDisabled")}
        active={false}
        variant={variant}
        label={label}
        menuId={menuId}
        renderContent={() => (
          <div className="ir-dropdown">
            <div className="ir-dropdown__head">{t("ir.title")}</div>
            <IrSpectrumPanel
              state={state}
              run={run}
              bands={bands}
              onExpand={() => setReportOpen(true)}
            />
          </div>
        )}
      >
        <AudioWaveform size={18} />
      </ToolDropdown>

      {state.phase === "done" && (
        <IrReportView
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          molecule={molecule}
          modes={state.modes}
          bands={bands}
          imaginaryCount={state.imaginaryCount}
        />
      )}
    </>
  );
}