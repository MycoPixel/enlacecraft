import { useState } from "react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useUpdaterStatus } from "../../hooks/useUpdaterStatus";
import { useT } from "../../i18n/useT";

export function StatusBar() {
  const status = useMoleculeStore((s) => s.status);
  const view = useMoleculeStore((s) => s.view);
  const resetView = useMoleculeStore((s) => s.resetView);
  const t = useT();
  const updater = useUpdaterStatus();
  const [installing, setInstalling] = useState(false);

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
      <button type="button" className="zoom-readout" onClick={resetView} title={t("tool.resetView")}>
        {Math.round(view.scale * 100)}%
      </button>
    </div>
  );
}
