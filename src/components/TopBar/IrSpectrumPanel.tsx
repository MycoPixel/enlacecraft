import { useCallback, useMemo, useState } from "react";
import { Loader2, TriangleAlert, Info } from "lucide-react";
import type { Molecule } from "../../types/chemistry";
import { embedMolecule3D, Embed3DError } from "../../io/embed3d";
import { fetchIrSpectrum, IrSpectrumError, type IrMode } from "../../io/irSpectrum";
import { relevantIrBands, type IrBand } from "../../model/irBands";
import { useT } from "../../i18n/useT";

/**
 * IR panel: a computed vibrational spectrum for the drawn structure, drawn the
 * way an IR spectrum is drawn — transmittance against a descending wavenumber
 * axis — with the textbook diagnostic regions for whichever functional groups
 * this molecule actually has shaded behind it.
 *
 * ## Why no scale factor is applied to the frequencies
 *
 * The obvious move is to multiply every wavenumber by a fitted constant so the
 * numbers line up with tables. Measured against a 22-band calibration set, that
 * does not work: the error is strongly mode-type dependent rather than a
 * uniform bias. C-H and C-O stretches come out within ~1% already; C=O is ~3%
 * high; C≡N, C≡C and CO₂ are 7-10% high, which is a different method problem
 * entirely; O-H and ring bends come out 2-5% *low*. Any single factor large
 * enough to help the triple bonds would visibly break the C-H stretches, which
 * are the majority of a teaching spectrum.
 *
 * So the frequencies are reported as computed, and each peak is matched against
 * the diagnostic ranges instead. That way the comparison the student is
 * actually making is visible — "my C=O computes to 1762, and the C=O range is
 * 1710-1720, so this method runs high here" — instead of being hidden behind a
 * constant that makes it look settled.
 */

/** X axis, descending — the convention for IR plots. */
const WAVE_MAX = 4000;
const WAVE_MIN = 400;
/** FWHM of a drawn peak, cm⁻¹. Gas-phase lines are sharp; real condensed
 *  spectra are broader, and this sits between the two so peaks stay
 *  distinguishable in a 320px plot. */
const LINE_WIDTH = 9;
/** Peak absorbance of the strongest band, so it reads as a deep dip rather
 *  than clipping through the floor. */
const MAX_ABSORBANCE = 1.15;

interface Plot {
  /** One transmittance value per sample, left (4000) to right (400). */
  transmittance: number[];
  x0: number;
  x1: number;
}

function buildPlot(modes: IrMode[], samples = 360): Plot {
  const strongest = modes.reduce((max, m) => Math.max(max, m.intensityKmMol), 0) || 1;
  const step = (WAVE_MAX - WAVE_MIN) / samples;
  const transmittance: number[] = [];
  for (let i = 0; i < samples; i++) {
    const wn = WAVE_MAX - i * step;
    let absorbance = 0;
    for (const mode of modes) {
      const delta = (wn - mode.wavenumber) / LINE_WIDTH;
      // Lorentzian: real IR bands have this shape rather than a Gaussian's.
      absorbance += (mode.intensityKmMol / strongest) * MAX_ABSORBANCE / (1 + delta * delta);
    }
    transmittance.push(10 ** -absorbance);
  }
  return { transmittance, x0: 0, x1: 360 };
}

/** Which diagnostic ranges a computed wavenumber lands inside. */
function bandsAt(bands: { band: IrBand }[], wavenumber: number): IrBand[] {
  return bands.map((b) => b.band).filter((b) => wavenumber >= b.min && wavenumber <= b.max);
}

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; modes: IrMode[]; imaginaryCount: number }
  | { phase: "error"; message: string };

export function IrSpectrumPanel({ molecule }: { molecule: Molecule }) {
  const t = useT();
  const [state, setState] = useState<State>({ phase: "idle" });

  const bands = useMemo(() => relevantIrBands(molecule), [molecule]);

  const run = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      // MMFF94 first, for the same reason the 3D panel does: the Hessian is
      // only meaningful at a real minimum, and starting from 2D coordinates
      // would often land in the wrong basin on a flexible molecule.
      const starting = await embedMolecule3D(molecule, "mmff94");
      const charge = Object.values(molecule.atoms).reduce((sum, a) => sum + a.charge, 0);
      const result = await fetchIrSpectrum(starting.molfile, charge);
      setState({ phase: "done", modes: result.modes, imaginaryCount: result.imaginaryCount });
    } catch (err) {
      if (err instanceof IrSpectrumError) {
        if (err.code === "UNAVAILABLE") setState({ phase: "error", message: t("ir.errorUnavailable") });
        else if (err.code === "TIMEOUT") setState({ phase: "error", message: t("ir.errorTimeout") });
        else setState({ phase: "error", message: t("ir.errorNetwork") });
        return;
      }
      // Embed3DError carries a specific reason worth surfacing — "no
      // force-field parameters for part of this structure" and "could not
      // parse this structure" call for completely different user actions, and
      // collapsing both into one generic line sends people looking in the
      // wrong place.
      if (err instanceof Embed3DError) {
        const known: Record<string, string> = {
          EMPTY: "ir.errorEmpty",
          ABBREVIATED_GROUP: "ir.errorAbbreviated",
          EMBED_FAILED: "ir.errorEmbed",
          DISCONNECTED_OR_UNSUPPORTED: "ir.errorParse",
        };
        setState({ phase: "error", message: t(known[err.code] ?? "ir.errorStructure") });
        return;
      }
      setState({ phase: "error", message: t("ir.errorStructure") });
    }
  }, [molecule, t]);

  const hasContent = Object.keys(molecule.atoms).length > 0;

  return (
    <div className="ir-panel">
      <button type="button" className="ir-panel__run" onClick={run} disabled={!hasContent || state.phase === "loading"}>
        {state.phase === "loading" ? (
          <>
            <Loader2 size={13} className="ir-panel__spin" /> {t("ir.calculating")}
          </>
        ) : state.phase === "idle" ? (
          t("ir.calculate")
        ) : (
          t("ir.recalculate")
        )}
      </button>

      {state.phase === "error" && <p className="ir-panel__error">{state.message}</p>}

      {state.phase === "done" && (
        <>
          {state.imaginaryCount > 0 && (
            <p className="ir-panel__warn">
              <TriangleAlert size={12} /> {t("ir.warnImaginary", { count: state.imaginaryCount })}
            </p>
          )}

          <SpectrumPlot modes={state.modes} bands={bands} />

          <p className="ir-panel__note">
            <Info size={12} /> {t("ir.gasPhaseNote")}
          </p>

          <PeakTable modes={state.modes} bands={bands} />
        </>
      )}

      {state.phase === "idle" && <p className="ir-panel__note"><Info size={12} /> {t("ir.intro")}</p>}
    </div>
  );
}

function SpectrumPlot({ modes, bands }: { modes: IrMode[]; bands: { band: IrBand; count: number }[] }) {
  const t = useT();
  const W = 360;
  const H = 110;
  const plot = useMemo(() => buildPlot(modes), [modes]);

  const wnToX = (wn: number) => ((WAVE_MAX - wn) / (WAVE_MAX - WAVE_MIN)) * W;
  const tToY = (transmittance: number) => 6 + (1 - transmittance) * (H - 16);

  const path = plot.transmittance
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (plot.transmittance.length - 1)) * W).toFixed(1)},${tToY(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg className="ir-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("ir.plotLabel")}>
      {/* Shaded diagnostic regions, one lane each so overlapping ranges stay legible. */}
      {bands.map(({ band }, index) => {
        const left = wnToX(band.max);
        const right = wnToX(band.min);
        if (right < 0 || left > W) return null;
        return (
          <g key={band.key}>
            <rect
              x={Math.max(0, left)}
              y={0}
              width={Math.max(1, Math.min(W, right) - Math.max(0, left))}
              height={H}
              className={`ir-plot__band${band.broad ? " is-broad" : ""}`}
            />
            <text x={Math.min(W - 2, Math.max(2, (left + right) / 2))} y={9 + index * 9} className="ir-plot__bandLabel">
              {t(`ir.band.${band.key}`)}
            </text>
          </g>
        );
      })}

      <line x1="0" y1={H - 10} x2={W} y2={H - 10} className="ir-plot__axis" />
      <line x1="0" y1={6} x2={W} y2={6} className="ir-plot__axis" />
      <text x="2" y={H - 1} className="ir-plot__tick">400</text>
      <text x={W / 2} y={H - 1} className="ir-plot__tick" textAnchor="middle">2200</text>
      <text x={W - 2} y={H - 1} className="ir-plot__tick" textAnchor="end">4000 cm⁻¹</text>

      <path d={`${path} L${W},${H - 10} L0,${H - 10} Z`} className="ir-plot__fill" />
      <path d={path} className="ir-plot__line" />
    </svg>
  );
}

function PeakTable({ modes, bands }: { modes: IrMode[]; bands: { band: IrBand; count: number }[] }) {
  const t = useT();
  const strongest = modes.reduce((max, m) => Math.max(max, m.intensityKmMol), 0) || 1;
  const top = [...modes].sort((a, b) => b.intensityKmMol - a.intensityKmMol).slice(0, 12);

  return (
    <div className="ir-table">
      <div className="ir-table__head">
        <span>{t("ir.colWavenumber")}</span>
        <span>{t("ir.colIntensity")}</span>
        <span>{t("ir.colAssignment")}</span>
      </div>
      {top.map((mode) => {
        const hits = bandsAt(bands, mode.wavenumber);
        return (
          <div key={mode.wavenumber} className="ir-table__row">
            <span className="ir-table__wn">{Math.round(mode.wavenumber)}</span>
            <span className="ir-table__intensity">
              <span className="ir-table__bar" style={{ width: `${(mode.intensityKmMol / strongest) * 100}%` }} />
            </span>
            <span className="ir-table__assignment">
              {hits.length ? hits.map((b) => t(`ir.band.${b.key}`)).join(", ") : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}