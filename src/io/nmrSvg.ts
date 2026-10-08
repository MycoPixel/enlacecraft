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
 *    user last happened to be zoomed.
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
import type { SimulatedPeakGroup } from "./nmrSpectrum";

/** Figure size in px. Fixed so output is identical on every machine. */
const SVG_WIDTH = 760;
const SVG_HEIGHT = 420;
/** Left inset, enough for a 3-digit ppm label like "100". */
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 46;
const PAD_BOTTOM = 44;
/** Height of the integral trace band, and where its baseline sits. */
const INTEGRAL_HEIGHT = 46;
const AXIS_Y = PAD_TOP + SVG_HEIGHT - PAD_TOP - PAD_BOTTOM - INTEGRAL_HEIGHT;
const PLOT_W = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = AXIS_Y - PAD_TOP;

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
 */
export function spectrumToSvg(
  peakGroups: SimulatedPeakGroup[],
  nucleus: Nucleus,
  title: string,
  naturalRange: [number, number],
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

  // Normalise to the tallest line so a weak signal next to a strong one is
  // still visible - the same rule the interactive plot uses.
  const maxIntensity = Math.max(
    ...peakGroups.flatMap((g) => g.lines.map((l) => l.intensity)),
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
      `<text x="${x.toFixed(2)}" y="${AXIS_Y + 19}" fill="#5b6472" font-size="11" ` +
        `font-family="${FONT}" text-anchor="middle">${fmt(t, tickDecimals)}</text>`,
    );
  }

  // --- TMS reference -----------------------------------------------------
  if (minPpm <= 0 && maxPpm >= 0) {
    const x = ppmToX(0);
    parts.push(
      `<line x1="${x.toFixed(2)}" y1="${PAD_TOP}" x2="${x.toFixed(2)}" y2="${AXIS_Y}" ` +
        `stroke="#2f5d8a" stroke-width="1" stroke-dasharray="3 3"/>`,
      `<text x="${(x + 4).toFixed(2)}" y="${PAD_TOP + 12}" fill="#2f5d8a" font-size="10" ` +
        `font-family="${FONT}">TMS</text>`,
    );
  }

  // --- peaks -------------------------------------------------------------
  // Drawn with a real stroke width in px, since a linewidth in ppm would render
  // at a different visual weight than on screen. Illustrative-splitting peaks
  // are dashed and labelled, matching the on-screen convention.
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

  // --- integral trace ----------------------------------------------------
  const integrals = peakGroups.map((g) => ({
    centerPpm: g.centerPpm,
    value: g.totalIntegration,
  }));
  const maxIntegral = Math.max(...integrals.map((i) => i.value), 1e-9);
  const integralTop = AXIS_Y + 10;
  parts.push(
    `<line x1="${PAD_LEFT}" y1="${integralTop + INTEGRAL_HEIGHT}" x2="${PAD_LEFT + PLOT_W}" ` +
      `y2="${integralTop + INTEGRAL_HEIGHT}" stroke="#8a919c" stroke-width="1"/>`,
  );
  let d = "";
  integrals
    .slice()
    .sort((a, b) => b.centerPpm - a.centerPpm)
    .forEach((item, i, arr) => {
      const x = ppmToX(item.centerPpm);
      const y = integralTop + INTEGRAL_HEIGHT - (INTEGRAL_HEIGHT * item.value) / maxIntegral;
      if (i === 0) {
        d += `M ${x.toFixed(2)} ${(integralTop + INTEGRAL_HEIGHT).toFixed(2)}`;
      } else {
        // Rise at the midpoint between adjacent peaks, matching nmrIntegralTrace:
        // landing on a peak would attribute the wrong area to the wrong signal.
        const prevX = ppmToX(arr[i - 1].centerPpm);
        const mid = (prevX + x) / 2;
        d += ` L ${mid.toFixed(2)} ${(integralTop + INTEGRAL_HEIGHT).toFixed(2)}`;
        d += ` L ${mid.toFixed(2)} ${y.toFixed(2)}`;
      }
      d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    });
  d += ` L ${PAD_LEFT + PLOT_W} ${(integralTop + INTEGRAL_HEIGHT).toFixed(2)}`;
  parts.push(`<path d="${d}" fill="none" stroke="#2f5d8a" stroke-width="1.5" stroke-linejoin="round"/>`);
  parts.push(
    `<text x="${PAD_LEFT + PLOT_W}" y="${integralTop + INTEGRAL_HEIGHT + 14}" fill="#5b6472" ` +
      `font-size="10" font-family="${FONT}" text-anchor="end">integral</text>`,
  );

  // --- titles ------------------------------------------------------------
  parts.push(
    `<text x="${PAD_LEFT + PLOT_W / 2}" y="${AXIS_Y + 38}" fill="#1b2027" font-size="12" ` +
      `font-family="${FONT}" text-anchor="middle">\u03b4 (ppm)</text>`,
    `<text x="${(PAD_LEFT - 34).toFixed(2)}" y="${(PAD_TOP + PLOT_H / 2).toFixed(2)}" ` +
      `fill="#1b2027" font-size="12" font-family="${FONT}" text-anchor="middle" ` +
      `transform="rotate(-90 ${(PAD_LEFT - 34).toFixed(2)} ${(PAD_TOP + PLOT_H / 2).toFixed(2)})">` +
      `${nucleus === "h1" ? "\u00b9H" : "\u00b9\u00b3C"}</text>`,
  );
  if (title) {
    parts.push(
      `<text x="${PAD_LEFT}" y="26" fill="#1b2027" font-size="14" font-weight="600" ` +
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
    `<text x="${PAD_LEFT}" y="${SVG_HEIGHT - 8}" fill="#5b6472" font-size="10" ` +
      `font-family="${FONT}">${esc(caveat)}</text>`,
  );

  parts.push("</svg>");
  return parts.join("\n");
}