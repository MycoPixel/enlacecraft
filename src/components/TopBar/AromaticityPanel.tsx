import { useMemo } from "react";
import { Hexagon, Info } from "lucide-react";
import { useAromaticity } from "../../hooks/useAromaticity";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import type { AromaticitySystem } from "../../engine/aromaticity";

/**
 * Aromaticity panel: one card per ring system, with the verdict, the π
 * electron count it came from, and the reasoning.
 *
 * Deliberately shows its work rather than printing a bare label. A student
 * looking at "aromatic" with no number behind it learns nothing, whereas
 * "6 π electrons, 4n+2 with n=1" is the thing that transfers to a ring they
 * haven't met yet.
 *
 * The reasoning line matters just as much: the two non-aromatic verdicts mean
 * quite different things. "Not conjugated" means there's no π system to count
 * (cyclohexane, and cyclopentadiene, which is the case people most often get
 * wrong); "4 π electrons" means there is one and it's unstable.
 */
export function AromaticityPanel() {
  const t = useT();
  const selected = useMoleculeStore((s) => s.selected);
  const results = useAromaticity();

  const fragmentCount = results.length;
  const totalSystems = useMemo(() => results.reduce((n, r) => n + r.systems.length, 0), [results]);

  // Shown on every branch, not just the one with cards. Selecting two atoms of
  // a ring and being told "no rings in this structure" otherwise reads as a
  // claim about the whole molecule, which is the opposite of what was asked.
  const scope = selected.size > 0 ? <p className="aromaticity__scope">{t("aromaticity.scopeSelection", { count: selected.size })}</p> : null;

  if (fragmentCount === 0) {
    return (
      <>
        {scope}
        <p className="align-menu__hint">{t("aromaticity.noStructure")}</p>
      </>
    );
  }

  if (totalSystems === 0) {
    return (
      <>
        {scope}
        <p className="align-menu__hint">{t("aromaticity.empty")}</p>
        {selected.size > 0 && <p className="aromaticity__note">{t("aromaticity.selectionHint")}</p>}
      </>
    );
  }

  return (
    <div className="aromaticity-panel">
      {scope}

      {results.map((result, i) =>
        result.systems.length === 0 ? null : (
          <section key={i} className="aromaticity-panel__group">
            {/* More than one disconnected fragment on screen: label which one
                this block of cards belongs to, so a verdict can't be read as
                describing the whole drawing. */}
            {fragmentCount > 1 && <h4 className="aromaticity-panel__groupTitle">{t("aromaticity.fragment", { i: i + 1 })}</h4>}
            {result.systems.map((system, j) => (
              <SystemCard key={j} system={system} />
            ))}
          </section>
        ),
      )}

      <p className="aromaticity__note">
        <Info size={12} /> {t("aromaticity.crossCheckNote")}
      </p>
      <p className="aromaticity__note">
        <Info size={12} /> {t("aromaticity.geometryNote")}
      </p>
    </div>
  );
}

function SystemCard({ system }: { system: AromaticitySystem }) {
  const t = useT();
  const fused = system.rings.length > 1;
  const sizes = system.rings.map((r) => r.length).sort((a, b) => a - b);

  return (
    <div className={`aromaticity-card aromaticity-card--${system.verdict}`}>
      <div className="aromaticity-card__head">
        <span className="aromaticity-card__ring">
          <Hexagon size={13} />
          {fused ? t("aromaticity.rings", { sizes: sizes.join(" + ") }) : t("aromaticity.ring", { size: sizes[0] })}
        </span>
        <span className={`aromaticity-badge aromaticity-badge--${system.verdict}`}>
          {t(`aromaticity.verdict.${system.verdict}`)}
        </span>
      </div>

      <div className="aromaticity-card__body">
        {system.piElectrons !== null && (
          <span className="aromaticity-card__pi">
            {t("aromaticity.pi", { count: system.piElectrons })}
            {system.n !== null && (
              <>
                {" · "}
                {system.verdict === "aromatic"
                  ? t("aromaticity.huckel4n2", { n: system.n })
                  : t("aromaticity.huckel4n", { n: system.n })}
              </>
            )}
          </span>
        )}
        <span className="aromaticity-card__reason">{t(`aromaticity.reason.${system.reason}`)}</span>
      </div>

      {fused && <p className="aromaticity-card__note">{t("aromaticity.fusedNote")}</p>}
      <CrossCheck system={system} />
    </div>
  );
}

/**
 * OpenChemLib's verdict, shown as corroboration rather than as a second
 * answer. It is an entirely separate aromaticity implementation, so agreement
 * between the two is worth something — and disagreement is worth showing too,
 * rather than hiding a model the user might reasonably trust.
 *
 * It can only ever answer "aromatic / not aromatic": it has no antiaromatic
 * category, so a false next to an antiaromatic verdict means "OCL also doesn't
 * call this aromatic", not a competing claim about instability.
 */
function CrossCheck({ system }: { system: AromaticitySystem }) {
  const t = useT();
  if (system.crossCheck === null) return null;

  const values = system.crossCheck.filter((v): v is boolean => v !== null);
  if (values.length === 0) return null;

  const expectAromatic = system.verdict === "aromatic";
  const agrees = values.every((v) => v === expectAromatic);

  return (
    <p className={`aromaticity-card__cross${agrees ? "" : " is-disagree"}`}>
      {t("aromaticity.crossCheck")}: {t(agrees ? "aromaticity.crossCheckAgree" : "aromaticity.crossCheckDisagree")}
    </p>
  );
}