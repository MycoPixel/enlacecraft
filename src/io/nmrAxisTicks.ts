/**
 * ppm-axis tick spacing and label precision.
 *
 * Extracted from NmrSpectrumView.tsx so the SVG export can share them. Previously
 * the component held the only copy and nmrAxisTicks.test.ts held a second one
 * "kept local so this file has no React import" - which meant a change to the
 * ladder could leave the test passing against a stale copy. One implementation,
 * imported by everything.
 */

/**
 * A tick interval from the 1/2/5 ladder, snapped per decade.
 *
 * Thresholds are the MIDPOINTS between rungs (1.5, 3, 7), not the rungs
 * themselves, so a value is rounded to whichever rung is genuinely nearer rather
 * than always stepping up past its own rung. With rungs as thresholds a 1.25 ppm
 * interval would snap to 2 - nearly double the wanted density - because 1.25
 * merely exceeds 1.
 *
 * Per decade, so 20 ppm stays 20 rather than becoming 2.
 */
export function niceTickStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const snapped = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return snapped * magnitude;
}

/** Decimal places needed to write a label at this step without lying. */
export function decimalsForStep(step: number): number {
  const s = step.toString();
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(4, s.length - dot - 1);
}

/**
 * The tick values covering [minPpm, maxPpm] at this step.
 *
 * Anchored to absolute multiples of the step rather than to minPpm, so the same
 * step yields the same gridlines regardless of which window is showing - which
 * is the whole point of a manually-entered interval is that two plots line up.
 *
 * Float drift is snapped away (0.1 + 0.1 + 0.1 !== 0.3), and MAX_TICKS guards a
 * tiny step over a wide range, which would otherwise emit thousands of labels.
 */
const MAX_TICKS = 60;

export function ticksForRange(minPpm: number, maxPpm: number, step: number): number[] {
  const out: number[] = [];
  if (!Number.isFinite(step) || step <= 0) return out;
  const first = Math.ceil(minPpm / step) * step;
  for (let i = 0, v = first; v <= maxPpm + 1e-9 && i < MAX_TICKS; i++, v = first + step * i) {
    out.push(Number((Math.round(v / step) * step).toFixed(6)));
  }
  return out;
}