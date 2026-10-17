import type { IrBand } from "../../model/irBands";

/**
 * The IR spectrum's plotting and peak-labelling logic, shared by the compact
 * dropdown panel and the full-screen report so the two can't disagree about
 * where a peak is or what it's called.
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
export const WAVE_MAX = 4000;
export const WAVE_MIN = 400;
/** FWHM of a drawn peak, cm⁻¹. Gas-phase lines are sharp; real condensed
 *  spectra are broader, and this sits between the two so peaks stay
 *  distinguishable in a small plot. */
const LINE_WIDTH = 9;
/** Peak absorbance of the strongest band, so it reads as a deep dip rather
 *  than clipping through the floor. */
const MAX_ABSORBANCE = 1.15;

export interface IrBandHit {
  band: IrBand;
  /** How many instances of that group the drawn structure has. */
  count: number;
}

export interface Plot {
  /** One transmittance value per sample, left to right. */
  transmittance: number[];
}

/** The wavenumber window a plot covers, ascending: [low, high]. */
export type WaveRange = [number, number];

export const NATURAL_RANGE: WaveRange = [WAVE_MIN, WAVE_MAX];

/**
 * Samples `modes` across `range` as a transmittance curve.
 *
 * The range is a parameter rather than fixed to the full 400-4000 window so the
 * same function draws both the panel's whole spectrum and a zoomed slice of it,
 * and so the two cannot disagree about where a peak sits.
 */
export function buildPlot(
  modes: { wavenumber: number; intensityKmMol: number }[],
  samples = 360,
  range: WaveRange = NATURAL_RANGE,
): Plot {
  const [lo, hi] = range;
  const span = hi - lo || 1;
  const strongest = modes.reduce((max, m) => Math.max(max, m.intensityKmMol), 0) || 1;
  const step = span / samples;
  const transmittance: number[] = [];
  for (let i = 0; i < samples; i++) {
    // Descending, left to right: high wavenumber on the left is the IR
    // convention, and the panel's original behaviour.
    const wn = hi - i * step;
    let absorbance = 0;
    for (const mode of modes) {
      const delta = (wn - mode.wavenumber) / LINE_WIDTH;
      // Lorentzian: real IR bands have this shape rather than a Gaussian's.
      absorbance += (mode.intensityKmMol / strongest) * MAX_ABSORBANCE / (1 + delta * delta);
    }
    transmittance.push(10 ** -absorbance);
  }
  return { transmittance };
}

/**
 * Round wavenumber ticks spanning `range`, at a step that stays readable.
 *
 * Picks from the 1-2-5 sequence so labels land on numbers a reader recognises,
 * and always returns at least the two ends - a zoomed window narrower than one
 * step would otherwise come back with no labels at all.
 */
export function axisTicks([lo, hi]: WaveRange): number[] {
  const span = hi - lo;
  const target = 8;
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
    ticks.push(Math.round(t));
  }
  return ticks;
}

/**
 * The zoom window a drag selected, or null if the drag was too short to mean
 * one.
 *
 * A short drag is a click, not a zoom: someone aiming at a peak on a
 * touchscreen moves a few pixels before lifting, and treating that as a window
 * would collapse the spectrum to a sliver every time they tried to point at
 * something.
 *
 * `startX`/`endX` are measured from the plot's LEFT EDGE, not from the viewport.
 * That distinction is the whole reason this is a separate function rather than
 * done inline: the pointer events hand out viewport coordinates, and subtracting
 * `rect.left` is what makes them agree with the selection rectangle drawn on
 * screen. Mixing the two spaces puts the zoom on a different part of the
 * spectrum than the one dragged, which is exactly what it did.
 */
export function draggedRange(
  startX: number,
  endX: number,
  rectWidth: number,
  current: WaveRange,
): WaveRange | null {
  const travelPx = Math.abs(endX - startX);
  const MIN_DRAG_PX = 8;
  if (travelPx < MIN_DRAG_PX || rectWidth <= 0) return null;
  const [lo, hi] = current;
  const span = hi - lo || 1;
  const toWn = (x: number) => hi - (x / rectWidth) * span;
  const a = toWn(startX);
  const b = toWn(endX);
  // Never let a zoom invert the axis, and never collapse it to nothing.
  const next: WaveRange = [Math.min(a, b), Math.max(a, b)];
  if (next[1] - next[0] < 1) return null;
  return next;
}

/** Which diagnostic ranges a computed wavenumber lands inside, keeping the
 *  group count so a diketone can say "2 × C=O stretch" rather than just "C=O". */
export function bandsAt(bands: IrBandHit[], wavenumber: number): IrBandHit[] {
  return bands.filter(({ band }) => wavenumber >= band.min && wavenumber <= band.max);
}

/**
 * "C–O stretch", or "2 × C=O ketone stretch" for a molecule with two of them.
 *
 * The motion word is appended only for bands that are a bond stretching; the
 * bend bands carry it in their own label already ("CH₃ bend", "Ar C–H oop"),
 * so appending "bend" there would just say it twice.
 */
export function formatBand(
  hit: IrBandHit,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const label = t(`ir.band.${hit.band.key}`);
  const motion = hit.band.motion ? ` ${t(`ir.motion.${hit.band.motion}`)}` : "";
  const prefix = hit.count > 1 ? t("ir.timesCount", { count: hit.count }) : "";
  return `${prefix}${label}${motion}`;
}