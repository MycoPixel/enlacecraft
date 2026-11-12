import { useState } from "react";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useUpdaterStatus } from "../../hooks/useUpdaterStatus";
import { useT } from "../../i18n/useT";

export function StatusBar() {
  const status = useMoleculeStore((s) => s.status);
  const view = useMoleculeStore((s) => s.view);
  const setView = useMoleculeStore((s) => s.setView);
  const resetView = useMoleculeStore((s) => s.resetView);
  const fixedBondLength = useMoleculeStore((s) => s.fixedBondLength);
  const fixedAngle = useMoleculeStore((s) => s.fixedAngle);
  const snapAngleDegrees = useMoleculeStore((s) => s.snapAngleDegrees);
  const freeAngle = useMoleculeStore((s) => s.freeAngle);
  const toggleFixedBondLength = useMoleculeStore((s) => s.toggleFixedBondLength);
  const toggleFixedAngle = useMoleculeStore((s) => s.toggleFixedAngle);
  const t = useT();
  const updater = useUpdaterStatus();
  const [installing, setInstalling] = useState(false);

  const zoomBy = (factor: number) =>
    setView({ ...view, scale: Math.min(4, Math.max(0.25, view.scale * factor)) });

  const handleRestartToUpdate = () => {
    // Guards against a double click re-firing the request while the
    // app is already in the process of quitting - quitAndInstall()
    // should make this whole window moot within a second or two
    // regardless, but there's no reason not to disable the button too.
    if (installing) return;
    setInstalling(true);
    window.electron?.quitAndInstallUpdate().catch(() => setInstalling(false));
    // Deliberately no success handling: a successful call means the
    // app is about to quit and relaunch, so there's nothing left to
    // update in this window's state.
  };

  return (
    <div className="status-bar">
      {/* Status is either a translation key (e.g. "status.ready") or an
          already-composed message (e.g. a search result summary); t()
          transparently passes the latter through unchanged. */}
      <span>{t(status)}</span>
      {/* Drawing-constraint indicators: the same two toggles the sidebar's
          DrawingConstraints buttons control, mirrored here so the current
          snapping behaviour is visible no matter how far the sidebar is
          scrolled. Clicking one here flips it, exactly like the sidebar
          button. The angle chip also reflects the snap-angle picker's
          current value, since that's what "fixed angle" locks to. */}
      {fixedBondLength && (
        <button type="button" className="status-bar__constraint" onClick={toggleFixedBondLength} title={t("tool.fixedBondLength")}>
          {t("tool.fixedBondLength")}
        </button>
      )}
      {fixedAngle && (
        <button type="button" className="status-bar__constraint" onClick={toggleFixedAngle} title={t("tool.fixedAngle")}>
          {t("tool.fixedAngle")} · {snapAngleDegrees}°
        </button>
      )}
      {!fixedAngle && freeAngle && (
        <span className="status-bar__constraint status-bar__constraint--muted">{t("snapAngle.freeAngle")}</span>
      )}
      {updater.state === "downloading" && (
        <span className="status-bar__updater">
          {t("updater.downloading")}
          {updater.percent !== null ? ` ${updater.percent}%` : ""}
        </span>
      )}
      {updater.state === "downloaded" && (
        <button type="button" className="status-bar__update-btn" onClick={handleRestartToUpdate} disabled={installing}>
          {installing ? t("updater.installing") : t("updater.restartToUpdate")}
        </button>
      )}
      <div className="status-bar__zoom">
        <button type="button" className="status-bar__zoom-btn" onClick={() => zoomBy(1 / 1.2)} title={t("tool.zoomOut")} aria-label={t("tool.zoomOut")}>
          <ZoomOut size={12} />
        </button>
        <button type="button" className="zoom-readout" onClick={resetView} title={t("tool.resetView")}>
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" className="status-bar__zoom-btn" onClick={() => zoomBy(1.2)} title={t("tool.zoomIn")} aria-label={t("tool.zoomIn")}>
          <ZoomIn size={12} />
        </button>
        <button type="button" className="status-bar__zoom-btn" onClick={resetView} title={t("tool.resetView")} aria-label={t("tool.resetView")}>
          <Maximize size={12} />
        </button>
      </div>
    </div>
  );
}
