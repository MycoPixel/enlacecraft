import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";

export function StatusBar() {
  const status = useMoleculeStore((s) => s.status);
  const view = useMoleculeStore((s) => s.view);
  const t = useT();

  return (
    <div className="status-bar">
      {/* Status is either a translation key (e.g. "status.ready") or an
          already-composed message (e.g. a search result summary); t()
          transparently passes the latter through unchanged. */}
      <span>{t(status)}</span>
      <span className="zoom-readout">{Math.round(view.scale * 100)}%</span>
    </div>
  );
}
