import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";

export function StatusBar() {
  const status = useMoleculeStore((s) => s.status);
  const view = useMoleculeStore((s) => s.view);
  const resetView = useMoleculeStore((s) => s.resetView);
  const t = useT();

  return (
    <div className="status-bar">
      {/* Status is either a translation key (e.g. "status.ready") or an
          already-composed message (e.g. a search result summary); t()
          transparently passes the latter through unchanged. */}
      <span>{t(status)}</span>
      <button type="button" className="zoom-readout" onClick={resetView} title={t("tool.resetView")}>
        {Math.round(view.scale * 100)}%
      </button>
    </div>
  );
}
