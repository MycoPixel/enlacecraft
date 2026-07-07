import { useMoleculeStore } from "../../store/useMoleculeStore";
import { computeFormula } from "../../model/valence";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useT } from "../../i18n/useT";

export function StatusBar() {
  const molecule = useMoleculeStore((s) => s.molecule);
  const status = useMoleculeStore((s) => s.status);
  const view = useMoleculeStore((s) => s.view);
  const isMobile = useIsMobile();
  const t = useT();
  const formula = computeFormula(molecule);

  return (
    <div className="status-bar">
      {/* Status is either a translation key (e.g. "status.ready") or an
          already-composed message (e.g. a search result summary); t()
          transparently passes the latter through unchanged. */}
      <span>{t(status)}</span>
      {isMobile && <span className="formula formula--mobile">{formula || "\u2014"}</span>}
      <span className="zoom-readout">{Math.round(view.scale * 100)}%</span>
    </div>
  );
}
