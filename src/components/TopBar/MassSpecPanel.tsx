import { useMemo, useState } from "react";
import type { Molecule } from "../../types/chemistry";
import {
  adductIon,
  allAdductIons,
  degreeOfUnsaturation,
  elementCounts,
  exactMass,
  isotopePattern,
  neutralLossesByMass,
  ADDUCTS,
} from "../../model/massSpec";
import { computeFormula } from "../../model/valence";
import { hasPlaceholderLabels } from "../../model/valence";
import { useT } from "../../i18n/useT";

/**
 * Mass-spectrometry panel: what a molecule weighs exactly, which ions it will
 * actually show up as, what its isotope pattern looks like, and which neutral
 * losses to expect.
 *
 * Everything here is arithmetic on the structure, so it appears the moment the
 * popover opens with no network round-trip — the same reasoning as the
 * formula and MW readouts next to it, and the reason this can be trusted in a
 * way a predicted *spectrum* would not be.
 */
export function MassSpecPanel({ molecule }: { molecule: Molecule }) {
  const t = useT();
  const [showAllAdducts, setShowAllAdducts] = useState(false);

  // A generic placeholder label ("R", "R1", "X") has no known composition, so
  // every number below would be wrong in a way that still looks like a number.
  // Saying so is far better than printing a confident wrong mass.
  const hasPlaceholder = hasPlaceholderLabels(molecule);

  const data = useMemo(() => {
    if (Object.keys(molecule.atoms).length === 0) return null;
    const counts = elementCounts(molecule);
    const ions = allAdductIons(molecule);
    return {
      formula: computeFormula(molecule),
      exactMass: exactMass(molecule),
      dbe: degreeOfUnsaturation(counts),
      ions,
      pattern: isotopePattern(molecule, 4),
    };
  }, [molecule]);

  if (!data) return <p className="align-menu__hint">{t("moleculeInfo.empty")}</p>;

  if (hasPlaceholder) {
    return (
      <>
        <p className="align-menu__hint">{t("massSpec.placeholderWarning")}</p>
        {/* Formula is still right; the masses are not, so they are withheld
            rather than shown as if they were. */}
        <div className="molecule-info__row">
          <span>{t("massSpec.formula")}</span>
          <span className="molecule-info__mw">{data.formula}</span>
        </div>
      </>
    );
  }

  const positive = data.ions.filter((i) => i.adduct.polarity === "positive");
  const negative = data.ions.filter((i) => i.adduct.polarity === "negative");
  const shown = showAllAdducts ? data.ions : [...positive.slice(0, 2), ...negative.slice(0, 1)];

  return (
    <div className="mass-spec">
      <div className="molecule-info__row">
        <span>{t("massSpec.exactMass")}</span>
        <span className="molecule-info__mw">{data.exactMass.toFixed(4)} Da</span>
      </div>
      <div className="molecule-info__row">
        <span>{t("massSpec.dbe")}</span>
        <span className="molecule-info__mw">{data.dbe ?? t("massSpec.dbeUnknown")}</span>
      </div>

      <div className="mass-spec__sub">{t("massSpec.adducts")}</div>
      {shown.map((ion) => (
        <div className="molecule-info__row" key={ion.adduct.id}>
          <span>{ion.adduct.label}</span>
          <span className="molecule-info__mw">{ion.mz.toFixed(4)}</span>
        </div>
      ))}
      {!showAllAdducts && data.ions.length > shown.length && (
        <button className="mass-spec__more" onClick={() => setShowAllAdducts(true)}>
          {t("massSpec.showAllAdducts", { count: data.ions.length })}
        </button>
      )}

      <div className="mass-spec__sub">{t("massSpec.isotopePattern")}</div>
      <svg className="mass-spec__pattern" viewBox="0 0 160 56" role="img" aria-label={t("massSpec.isotopePattern")}>
        {data.pattern.map((peak) => {
          const h = Math.max(2, peak.relativeIntensity * 44);
          const x = 6 + peak.offset * 38;
          return (
            <g key={peak.offset}>
              <line x1={x} y1={52} x2={x} y2={52 - h} stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
              <text x={x} y={55} fontSize="7" textAnchor="middle" fill="var(--ink-soft)">
                M{peak.offset === 0 ? "" : `+${peak.offset}`}
              </text>
              <text x={x} y={50 - h} fontSize="6" textAnchor="middle" fill="var(--ink-soft)">
                {(peak.relativeIntensity * 100).toFixed(0)}
              </text>
            </g>
          );
        })}
        <line x1={4} y1={53} x2={156} y2={53} stroke="var(--panel-border)" strokeWidth={1} />
      </svg>
      <p className="align-menu__hint">
        {t("massSpec.isotopeHint", { base: data.pattern[0]?.mz.toFixed(3) ?? "—" })}
      </p>

      <div className="mass-spec__sub">{t("massSpec.neutralLosses")}</div>
      <div className="mass-spec__losses">
        {neutralLossesByMass().slice(0, 6).map((loss) => (
          <div className="mass-spec__loss" key={loss.id} title={loss.note}>
            <span className="mass-spec__loss-mass">−{loss.mass.toFixed(3)}</span>
            <span className="mass-spec__loss-formula">{loss.formula}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Exported for tests: the adduct table's ion for a molecule, without the
 * component. Keeps the chemistry assertions out of the rendering. */
export function adductsFor(molecule: Molecule) {
  return ADDUCTS.map((adduct) => adductIon(molecule, adduct));
}