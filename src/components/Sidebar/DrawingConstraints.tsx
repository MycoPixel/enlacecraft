import { Link2, Magnet, Sparkles } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { ToolButton } from "./ToolButton";

/**
 * Persistent drawing constraints that used to be reachable only by holding a
 * key mid-drag: locked bond length and forced angle snapping. Both are
 * momentary modifiers on desktop (Ctrl/Cmd and Shift), which is unreachable
 * on touch; these toggles make the same behaviour persistent.
 *
 * The third toggle is the optional "clean as I draw" polish: each new
 * stroke's own atoms relax onto hybridisation-ideal geometry as they land
 * (engine/clean2d), with everything already drawn held fixed. Off by
 * default — the plan's explicit-command rule — and never touches placed
 * stereochemistry.
 *
 * Shift still overrides either lock for a single gesture, so the toggles
 * never take away the keyboard escape hatch.
 */
export function DrawingConstraints() {
  const t = useT();
  const fixedBondLength = useMoleculeStore((s) => s.fixedBondLength);
  const fixedAngle = useMoleculeStore((s) => s.fixedAngle);
  const cleanAsIdraw = useMoleculeStore((s) => s.cleanAsIdraw);
  const toggleFixedBondLength = useMoleculeStore((s) => s.toggleFixedBondLength);
  const toggleFixedAngle = useMoleculeStore((s) => s.toggleFixedAngle);
  const toggleCleanAsIdraw = useMoleculeStore((s) => s.toggleCleanAsIdraw);

  return (
    <div className="row">
      <ToolButton title={t("tool.fixedBondLength")} active={fixedBondLength} onClick={toggleFixedBondLength}>
        <Link2 size={17} />
      </ToolButton>
      <ToolButton title={t("tool.fixedAngle")} active={fixedAngle} onClick={toggleFixedAngle}>
        <Magnet size={17} />
      </ToolButton>
      <ToolButton title={t("tool.cleanAsIdraw")} active={cleanAsIdraw} onClick={toggleCleanAsIdraw}>
        <Sparkles size={17} />
      </ToolButton>
    </div>
  );
}
