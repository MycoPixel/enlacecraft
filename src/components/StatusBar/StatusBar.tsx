import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useFormulaDisplay } from "../../hooks/useFormulaDisplay";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useT } from "../../i18n/useT";
import { Formula } from "../common/Formula";

export function StatusBar() {
  const status = useMoleculeStore((s) => s.status);
  const view = useMoleculeStore((s) => s.view);
  const isMobile = useIsMobile();
  const t = useT();
  const { fragments } = useFormulaDisplay();

  return (
    <div className="status-bar">
      {/* Status is either a translation key (e.g. "status.ready") or an
          already-composed message (e.g. a search result summary); t()
          transparently passes the latter through unchanged. */}
      <span>{t(status)}</span>
      {isMobile && (
        <span className="formula formula--mobile">
          {fragments.length === 0 && "\u2014"}
          {fragments.map((f, i) => (
            <span className="formula__fragment" key={i}>
              {i > 0 && <span className="formula__sep">{"\u2013"}</span>}
              <Formula formula={f.formula} />
              {f.mw > 0 && ` \u00b7 ${f.mw.toFixed(2)}`}
            </span>
          ))}
        </span>
      )}
      <span className="zoom-readout">{Math.round(view.scale * 100)}%</span>
    </div>
  );
}
