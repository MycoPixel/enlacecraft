/**
 * Standalone SVG of the predicted spectrum, for reports, slides and print.
 *
 * WHY NOT SCREENSHOT THE ON-SCREEN PLOT
 * --------------------------------------
 * The obvious implementation is to grab the live <svg> node and serialise it -
 * the app already does something like that for the 3D export (io/exportImage.ts).
 * Three reasons that would be the wrong choice here:
 *
 * 1. THE PLOT'S APPEARANCE LIVES IN CSS, NOT IN THE SVG. Every stroke, fill and
 *    label size in NmrSpectrumView is a class name resolved by app.css. A
 *    serialised DOM carries those class names and nothing else, so the output
 *    renders unstyled in Word, Illustrator, or anything that doesn't load this
 *    app's stylesheet. Presentation attributes have to be inlined.
 *
 * 2. IT CAPTURES WHATEVER IS ON SCREEN. Drag-zoom, intensity zoom, the
 *    experimental overlay and the manual ppm range are all transient view state.
 *    A "figure for a report" should show the full spectrum, not wherever the
 *    user last happened to be zoomed. The curve/sticks choice IS carried over,
 *    though - that isn't transient view state, it's a decision about how the
 *    spectrum should be represented, and exporting sticks when the user was
 *    looking at curves (or the reverse) would be its own surprise.
 *
 * 3. NO LABELS. The on-screen version puts atom names above peaks; a figure
 *    someone will paste into a document needs real axis ticks and units.
 *
 * So this builds the figure from the data instead: a complete, self-contained
 * SVG with inline presentation attributes, a fixed size independent of the
 * browser, and the full natural ppm range. It renders identically everywhere
 * and needs no stylesheet.
 */

import type { Nucleus } from "./nmrExport";
import { niceTickStep, decimalsForStep, ticksForRange } from "./nmrAxisTicks";
import {
  buildCurve,
  DEFAULT_C13_LINEWIDTH_PPM,
  DEFAULT_H1_LINEWIDTH_PPM,
  type SimulatedPeakGroup,
} from "./nmrSpectrum";

/** Which shape the figure draws. Mirrors the on-screen curve/sticks toggle
 *  (NmrSpectrumView's PlotMode) so an export matches what the user was
 *  looking at - see spectrumToSvg. */
export type SpectrumPlotMode = "curve" | "sticks";

/** Figure size in px. Fixed so output is identical on every machine.
 *
 *  WIDE, NOT TALL. The figure's whole job is to show a full 1H range (often
 *  ~8 ppm) in enough horizontal detail that a multiplet's individual lines are
 *  still distinguishable. A 7 Hz coupling at the assumed 400 MHz is 0.0175 ppm,
 *  which at the old 760 px width was about 1.5 px between the lines of a
 *  doublet - narrower than the stroke itself, so every multiplet read as one
 *  spike. Doubling the width gives those lines room (and the same physical
 *  size when the figure is printed/inserted at a usable width). The height
 *  only needs to fit the peaks and labels, so it stays modest; extra height
 *  would not add any horizontal resolution. */
const SVG_WIDTH = 1600;
const SVG_HEIGHT = 460;
/** Left inset, enough for a 3-digit ppm label like "100". */
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 46;
/** Room under the axis for tick labels, the axis title, and the caption.
 *  This was 44 while the integral band shared the same figure; with the band
 *  gone the axis moved down and 44 left the axis title sitting on top of the
 *  caption, so it needs to clear both rather than just the ticks. */
const PAD_BOTTOM = 66;
const AXIS_Y = SVG_HEIGHT - PAD_BOTTOM;
const PLOT_W = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = AXIS_Y - PAD_TOP;

/** Samples across the curve.
 *
 *  This is a resolution limit, not a smoothness knob: the curve is a sum of
 *  narrow Lorentzians (1.5 Hz FWHM for 1H, well under a pixel wide at this
 *  width), so a sample grid coarser than the line spacing can STEP OVER a
 *  multiplet's lines entirely. At the old 480 points across ~8.5 ppm the step
 *  was 0.0177 ppm - almost exactly the 0.0175 ppm splitting of a 7 Hz doublet
 *  at 400 MHz - which is why a doublet could export as a single spike no matter
 *  how far you zoomed in afterwards: the lines were never in the path to begin
 *  with.
 *
 *  Four samples per plot pixel is comfortably finer than any feature the
 *  rasteriser can show, and keeps the peak tops accurate (a line centre can
 *  fall between samples, and a Lorentzian sampled slightly off-centre is
 *  visibly short). */
const CURVE_SAMPLES = PLOT_W * 4;

/** Text styling. A generic sans stack, so no font file has to be embedded. */
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Escape for XML text/attribute content. */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function esc(value: string): string {
  return xml(value);
}

/** Format a number without trailing zeros, for tick labels. */
function fmt(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

/**
 * Builds a complete standalone SVG document for the predicted spectrum.
 *
 * @param peakGroups the simulated signals to draw
 * @param nucleus which spectrum this is - decides the axis title
 * @param title optional heading, e.g. the structure name
 * @param naturalRange the ppm window; callers pass suggestedRange(...) so the
 *   figure always shows the whole spectrum rather than a zoomed slice
 * @param mode which shape to draw - "curve" for the continuous Lorentzian
 *   envelope a real instrument prints, "sticks" for discrete lines. Taken from
 *   the caller so the figure matches the plot the user was actually looking at;
 *   the on-screen zoom is still deliberately not carried over (see the module
 *   docstring), since that's transient view state rather than a choice about
 *   how the spectrum should be represented.
 */
export function spectrumToSvg(
  peakGroups: SimulatedPeakGroup[],
  nucleus: Nucleus,
  title: string,
  naturalRange: [number, number],
  mode: SpectrumPlotMode = "curve",
): string {
  // A zero-width range would divide by zero and emit NaN/Infinity coordinates,
  // which renders as a blank figure with no error anywhere. suggestedRange never
  // produces one for a real molecule, but this is reachable from any caller
  // passing a hand-built range, and a silently blank figure is the worst
  // possible failure for a function whose whole job is to produce a figure.
  let [minPpm, maxPpm] = naturalRange;
  if (!Number.isFinite(minPpm) || !Number.isFinite(maxPpm) || maxPpm <= minPpm) {
    [minPpm, maxPpm] = [0, 1];
  }
  const span = maxPpm - minPpm;
  const ppmToX = (ppm: number) => PAD_LEFT + (PLOT_W * (maxPpm - ppm)) / span;

  // Curve mode samples the same Lorentzian sum the on-screen plot draws, so the
  // exported envelope has the same peak widths and the same relative heights
  // between neighbouring signals - not just a smoothed impression of them.
  const curvePoints =
    mode === "curve"
      ? buildCurve(
          peakGroups,
          minPpm,
          maxPpm,
          CURVE_SAMPLES,
          nucleus === "h1" ? DEFAULT_H1_LINEWIDTH_PPM : DEFAULT_C13_LINEWIDTH_PPM,
        )
      : [];

  // Normalise against whatever is actually being drawn. In curve mode that is
  // the tallest point of the sampled envelope, NOT the tallest single line: a
  // Lorentzian only reaches its nominal intensity exactly at its centre, so
  // normalising against line intensities would leave the curve visibly short of
  // the top of the plot and waste the headroom above it.
  const maxIntensity = Math.max(
    ...(mode === "curve"
      ? curvePoints.map((p) => p.intensity)
      : peakGroups.flatMap((g) => g.lines.map((l) => l.intensity))),
    1e-9,
  );
  const intensityToY = (i: number) => AXIS_Y - (PLOT_H * i) / maxIntensity;

  const tickStep = niceTickStep(span / 8);
  const tickDecimals = decimalsForStep(tickStep);
  const ticks = ticksForRange(minPpm, maxPpm, tickStep);

  // --- axis frame and gridlines -----------------------------------------
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" ` +
      `viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="${esc(title || "predicted NMR spectrum")}">`,
  );
  parts.push(`<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#ffffff"/>`);

  // Gridlines, full height, as on screen.
  for (const t of ticks) {
    const x = ppmToX(t);
    parts.push(
      `<line x1="${x.toFixed(2)}" y1="${PAD_TOP}" x2="${x.toFixed(2)}" y2="${AXIS_Y}" ` +
        `stroke="#d7dbe1" stroke-width="1"/>`,
    );
  }
  parts.push(
    `<line x1="${PAD_LEFT}" y1="${AXIS_Y}" x2="${PAD_LEFT + PLOT_W}" y2="${AXIS_Y}" ` +
      `stroke="#1b2027" stroke-width="1.5"/>`,
    `<line x1="${PAD_LEFT}" y1="${PAD_TOP}" x2="${PAD_LEFT}" y2="${AXIS_Y}" ` +
      `stroke="#1b2027" stroke-width="1.5"/>`,
  );

  // Tick marks and labels along the bottom.
  for (const t of ticks) {
    const x = ppmToX(t);
    parts.push(
      `<line x1="${x.toFixed(2)}" y1="${AXIS_Y}" x2="${x.toFixed(2)}" y2="${AXIS_Y + 5}" ` +
        `stroke="#1b2027" stroke-width="1.5"/>`,
      `<text x="${x.toFixed(2)}" y="${AXIS_Y + 19}" fill="#5b6472" font-size="13" ` +
        `font-family="${FONT}" text-anchor="middle">${fmt(t, tickDecimals)}</text>`,
    );
  }

  // --- TMS reference -----------------------------------------------------
  // 0 ppm is the RIGHT-hand edge of an axis that runs high-to-low, so the label
  // sits to the left of its line. Drawn to the right it overhangs the figure
  // and gets clipped by whatever renders it.
  if (minPpm <= 0 && maxPpm >= 0) {
    const x = ppmToX(0);
    parts.push(
      `<line x1="${x.toFixed(2)}" y1="${PAD_TOP}" x2="${x.toFixed(2)}" y2="${AXIS_Y}" ` +
        `stroke="#2f5d8a" stroke-width="1" stroke-dasharray="3 3"/>`,
      `<text x="${(x - 4).toFixed(2)}" y="${PAD_TOP + 12}" fill="#2f5d8a" font-size="11" ` +
        `font-family="${FONT}" text-anchor="end">TMS</text>`,
    );
  }

  // --- peaks -------------------------------------------------------------
  // Sticks are drawn with a real stroke width in px, since a linewidth in ppm
  // would render at a different visual weight than on screen. Illustrative-
  // splitting peaks are dashed and labelled, matching the on-screen convention.
  if (mode === "sticks") {
    for (const g of peakGroups) {
      for (const line of g.lines) {
        const x = ppmToX(line.ppm);
        const y = intensityToY(line.intensity);
        parts.push(
          `<line x1="${x.toFixed(2)}" y1="${AXIS_Y}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" ` +
            `stroke="#1b2027" stroke-width="1.5"${g.isIllustrative ? ' stroke-dasharray="2 2"' : ""}/>`,
        );
      }
    }
  } else {
    // The continuous envelope. Emitted as a <path> of short line segments
    // rather than a <polyline> for the same reason: the whole point of the SVG
    // is that it renders identically in Word/Illustrator with no stylesheet, and
    // presentation attributes on a polyline are honoured less consistently
    // across those renderers than an explicit path's stroke attributes are.
    const d = curvePoints
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${ppmToX(p.ppm).toFixed(2)} ${intensityToY(p.intensity).toFixed(2)}`,
      )
      .join(" ");
    parts.push(
      `<path d="${d}" fill="none" stroke="#1b2027" stroke-width="1.3" ` +
        `stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  }

  // --- titles ------------------------------------------------------------
  parts.push(
    `<text x="${PAD_LEFT + PLOT_W / 2}" y="${AXIS_Y + 38}" fill="#1b2027" font-size="14" ` +
      `font-family="${FONT}" text-anchor="middle">\u03b4 (ppm)</text>`,
    `<text x="${(PAD_LEFT - 34).toFixed(2)}" y="${(PAD_TOP + PLOT_H / 2).toFixed(2)}" ` +
      `fill="#1b2027" font-size="14" font-family="${FONT}" text-anchor="middle" ` +
      `transform="rotate(-90 ${(PAD_LEFT - 34).toFixed(2)} ${(PAD_TOP + PLOT_H / 2).toFixed(2)})">` +
      `${nucleus === "h1" ? "\u00b9H" : "\u00b9\u00b3C"}</text>`,
  );
  if (title) {
    parts.push(
      `<text x="${PAD_LEFT}" y="28" fill="#1b2027" font-size="18" font-weight="600" ` +
        `font-family="${FONT}">${esc(title)}</text>`,
    );
  }

  // Honest caption. A figure lifted out of the app and pasted into a report
  // loses every caveat the UI carries with it, so it travels with the image.
  const caveat =
    nucleus === "h1"
      ? "Simulated splitting; positions from a prediction model. Not a measured spectrum."
      : "Simulated spectrum; 13C shown proton-decoupled. Not a measured spectrum.";
  parts.push(
    `<text x="${PAD_LEFT}" y="${SVG_HEIGHT - 8}" fill="#5b6472" font-size="12" ` +
      `font-family="${FONT}">${esc(caveat)}</text>`,
  );

  parts.push("</svg>");
  return parts.join("\n");
}