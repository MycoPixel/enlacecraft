import { useMoleculeStore, SNAP_ANGLE_OPTIONS, type SnapAngleDegrees } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";

/**
 * Picks the angle-snapping increment used when drawing new bonds and chains.
 *
 * Lives in the sidebar's view section rather than being buried in settings
 * because it changes how nearly every subsequent drag behaves — someone who
 * needs 15° increments to line up a drawing should not have to go looking
 * for it. "Off" maps onto snapAngle's non-positive step, which returns the
 * angle untouched.
 *
 * Independent of the existing Shift-during-drag free-angle override: that's a
 * momentary per-gesture escape hatch for one bond, this is a persistent
 * default for all of them.
 */
export function SnapAnglePicker() {
  const t = useT();
  const value = useMoleculeStore((s) => s.snapAngleDegrees);
  const setValue = useMoleculeStore((s) => s.setSnapAngleDegrees);

  return (
    <div className="snap-angle-picker">
      <span className="snap-angle-picker__label">{t("snapAngle.label")}</span>
      <div className="snap-angle-picker__options" role="group" aria-label={t("snapAngle.label")}>
        {SNAP_ANGLE_OPTIONS.map((deg) => (
          <button
            key={deg}
            type="button"
            className={`snap-angle-picker__option ${value === deg ? "snap-angle-picker__option--active" : ""}`}
            aria-pressed={value === deg}
            onClick={() => setValue(deg as SnapAngleDegrees)}
          >
            {deg === 0 ? t("snapAngle.off") : `${deg}°`}
          </button>
        ))}
      </div>
    </div>
  );
}