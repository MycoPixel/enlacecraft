/**
 * Export and comparison input for the predicted NMR spectrum.
 *
 * WHY THIS EXISTS
 * ---------------
 * The spectrum could be read and nothing could be done with it. There was no
 * way to get the numbers out, and no way to put a real spectrum next to the
 * prediction - even though comparing a prediction against an actual spectrum is
 * the entire reason to have a prediction. So the feature stopped at the screen.
 *
 * Three exports, for three different jobs:
 *
 *  - CSV  - the peak list. Opens in any spreadsheet, which is what most people
 *           actually want from a prediction, and is the format an assignment or
 *           a write-up needs.
 *  - JCAMP-DX - the interchange format for NMR data (Bruker/Jeol/ASCII
 *           convention). This is what lets a predicted spectrum be opened in
 *           MestreNova, nmrglue, or any other tool, rather than being locked
 *           inside this app.
 *  - SVG  - the plot as vector graphics, for putting in a report or slide.
 *
 * Plus a peak-list PARSER for the other direction: paste a measured spectrum's
 * peak list and overlay it on the plot.
 */

import type { ShiftPrediction, H1ShiftPrediction } from "./nmrPredict";

/** Which spectrum an export or comparison refers to. Defined here rather than
 *  in the view component so this io module doesn't have to import from the UI
 *  layer - NmrSpectrumView imports THIS from here instead. */
export type Nucleus = "h1" | "c13";

/** One row of a peak list, used by both the CSV export and the overlay. */
export interface PeakListRow {
  /** Chemical shift in ppm. */
  shiftPpm: number;
  /** Relative integral / area. */
  integral: number;
  /** Multiplicity code ("s", "d", "t", ...) when known. */
  multiplicity: string;
  /** Atom labels for this signal, e.g. "H1, H2". */
  atoms: string;
  /** Raw coupling detail, when the prediction supplied one. */
  detail: string;
}

/**
 * A quoted CSV field.
 *
 * Quote anything containing a comma, quote or newline, and escape embedded
 * quotes by doubling - per RFC 4180. The atom-label column is the reason this
 * matters: "H1, H2, H3" would otherwise split into three columns and silently
 * shift every field after it.
 */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Builds the peak list for one nucleus, ready to export.
 *
 * Built from the raw predictions rather than the simulated groups, so the
 * numbers here are exactly what the service returned - no dependency on the
 * display layer's grouping or its synthetic splitting.
 */
export function buildPeakList(
  predictions: ShiftPrediction[],
  predictionsH1: H1ShiftPrediction[],
  nucleus: Nucleus,
  labelFor: (atomIndex: number) => string,
): PeakListRow[] {
  if (nucleus === "h1") {
    return predictionsH1
      .map((p) => ({
        shiftPpm: p.predictedShiftPpm,
        integral: p.numHs,
        multiplicity: p.multiplicity,
        atoms: labelFor(p.atomIndex),
        detail: p.multiplicityDetail,
      }))
      .sort((a, b) => b.shiftPpm - a.shiftPpm);
  }
  // 13C peaks are singlets with no proton count, so each row's integral is the
  // single carbon it represents. Keeping it 1 rather than 0 means the column
  // stays numeric and a spreadsheet doesn't render the whole column as text.
  return predictions
    .map((p) => ({
      shiftPpm: p.predictedShiftPpm,
      integral: 1,
      multiplicity: "s",
      atoms: labelFor(p.atomIndex),
      detail: "",
    }))
    .sort((a, b) => b.shiftPpm - a.shiftPpm);
}

/**
 * The peak list as CSV text.
 *
 * `ppm` descending, the conventional order for a peak table. Header row is
 * English-only on purpose: a CSV with a translated header is harder to
 * consume programmatically, and the column meaning is fixed regardless of UI
 * language.
 */
export function peakListToCsv(rows: PeakListRow[]): string {
  const lines = ["shift_ppm,integral,multiplicity,atoms,coupling_detail"];
  for (const row of rows) {
    lines.push(
      [
        row.shiftPpm.toFixed(3),
        String(row.integral),
        csvField(row.multiplicity),
        csvField(row.atoms),
        csvField(row.detail),
      ].join(","),
    );
  }
  return lines.join("\n");
}

/**
 * The peak list as JCAMP-DX text.
 *
 * The `##XYDATA` form carries (X, Y) pairs directly, which is what we have -
 * this module synthesises a spectrum rather than measuring one, so there is no
 * FID or time axis to convert. Nucleus and proton frequency go in the header as
 * required by the spec; the frequency is the conventional ~400 MHz for 1H and
 * ~100 MHz for 13C, since the exact field strength isn't tracked anywhere in
 * the app and a wrong-but-typical value keeps the file readable by tools that
 * expect it.
 *
 * Intensity is normalised to 99, as the spec's peak-picked form conventionally
 * does (values are 0-65535 in a real file; 0-100 is the readable subset).
 */
export function peakListToJcamp(
  rows: PeakListRow[],
  nucleus: Nucleus,
  title: string,
): string {
  const nucleusName = nucleus === "h1" ? "1H" : "13C";
  const protonFreq = nucleus === "h1" ? 400.13 : 100.6;
  const maxIntegral = Math.max(...rows.map((r) => r.integral), 1e-6);

  const xydata = rows
    .map((r) => `${r.shiftPpm.toFixed(3)}\t${((r.integral / maxIntegral) * 99).toFixed(2)}`)
    .join("\n");

  return [
    "##TITLE=" + title,
    "##JCAMP-DX",
    "##DATATYPE=SPECTRUM",
    "##FORMAT=XYDATA",
    `##NUCLEUS=${nucleusName}`,
    `##FUNC=EM(BRUKE 1H)`,
    `##PROTONSFREQ=${protonFreq.toFixed(2)}`,
    "##SF=400.13",
    "##SI=0.5",
    "##OFFSET=0",
    "##SPTYPE=FT",
    "##XYDATA=(X(X(PPM),Y(INTS))",
    xydata,
    "##END",
    "",
  ].join("\n");
}

/**
 * Whether a token is a multiplicity code.
 *
 * An explicit list rather than a character class, because the plausible tokens
 * overlap heavily and the two mistakes are both silent:
 *
 *  - Too narrow and "dd" (a doublet of doublets - extremely common in real
 *    spectra) stops being a multiplicity and gets read as an atom label.
 *  - Too loose and "J" from "J = 7.2 Hz" becomes the multiplicity, or "ppm"
 *    does. Both overwrite the real value.
 *
 * So: runs built from the s/d/t/q/m letters, plus the spelled-out and
 * "broad" forms that peak pickers actually emit. "J" is deliberately absent -
 * in a peak list it introduces a coupling constant, not a multiplicity.
 */
function isMultiplicity(token: string): boolean {
  return /^(s|d|t|q|m)(s|d|t|q|m)*$/.test(token.toLowerCase()) ||
    /^(bs|br|wide|quintet|quint|sextet|sext|heptet|hept|octet|oct|multiplet|multi|septet|sept)$/.test(
      token.toLowerCase(),
    );
}

/**
 * Splits one pasted line into tokens, respecting double-quoted fields.
 *
 * Handles the comma, semicolon, tab and whitespace separators people paste
 * between, and keeps a quoted run together as one token (with the quotes
 * stripped). A line with no quotes takes the cheap path.
 */
function splitTokens(line: string): string[] {
  const cleaned = line.replace(/[()[\]]/g, " ");
  if (!cleaned.includes('"')) {
    return cleaned.split(/[,;\t]+|\s+/).map((t) => t.trim()).filter(Boolean);
  }
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of cleaned) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /[,;\t\s]/.test(ch)) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Parses a pasted peak list back into rows.
 *
 * Deliberately permissive about input, because people paste these from
 * wherever they measured them: a spreadsheet column, a JCAMP XYDATA block, a
 * plain "shift" list with no other columns, or peak-picker output with
 * assignments attached.
 *
 * What it will NOT do is guess. A line with no parsable number is skipped
 * rather than turned into a zero, and the count of skipped lines is returned
 * so the caller can tell the user how much of their paste was ignored - a
 * silently-dropped line is worse than a partial import, because it looks like
 * the whole thing worked.
 *
 * Recognised per line, in order of preference:
 *   - `8.42 t 1H1`        whitespace-separated ppm then optional extras
 *   - `8.42,3,t,H1`        CSV
 *   - `(X(PPM),Y(INTS))`  JCAMP XYDATA, opened or closed
 * and a bare `8.42` counts as ppm with no extras.
 */
export function parsePeakList(text: string): { rows: PeakListRow[]; skippedLines: number } {
  const rows: PeakListRow[] = [];
  let skippedLines = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // JCAMP wrapper lines carry no data.
    if (/^##/.test(line) || /^##XYDATA/.test(line) || line === "##END") continue;

    // Strip JCAMP's structural punctuation, keeping the inner pairs.
    const jcampPair = /\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/.exec(line);
    if (jcampPair) {
      rows.push({
        shiftPpm: Number(jcampPair[1]),
        integral: Number(jcampPair[2]),
        multiplicity: "",
        atoms: "",
        detail: "",
      });
      continue;
    }

    // Quote-aware split. A CSV field can legitimately contain the separators
    // we split on - "H1, H2, H3" is one field, and splitting it naively both
    // loses it and shifts every token after it. This is what makes the
    // export -> spreadsheet -> paste-back round trip actually work.
    const tokens = splitTokens(line);

    if (tokens.length === 0) continue;

    const ppm = Number(tokens[0]);
    if (!Number.isFinite(ppm)) {
      skippedLines++;
      continue;
    }

    // The first token after ppm that looks like a multiplicity code, and the
    // first that isn't a number, are the extras. Whichever a pasted line
    // happens to include, in either order.
    let integral = 1;
    let integralSeen = false;
    let multiplicity = "";
    let atoms = "";
    // Anything past the first unrecognised token is coupling prose ("J=7.2 Hz").
    const leftovers: string[] = [];
    for (const token of tokens.slice(1)) {
      const asNumber = Number(token);
      if (Number.isFinite(asNumber)) {
        // Only the FIRST number after ppm is the integral. Without this guard a
        // line like "2.09 2 t J = 7.2 Hz" has its integral overwritten by the
        // 7.2 from the coupling, silently reporting a 2H doublet as a 7.2H one.
        if (!integralSeen) {
          integral = asNumber;
          integralSeen = true;
        } else {
          leftovers.push(token);
        }
      } else if (isMultiplicity(token)) {
        multiplicity = token.toLowerCase();
      } else if (!atoms) {
        atoms = token;
      } else {
        leftovers.push(token);
      }
    }

    rows.push({
      shiftPpm: ppm,
      integral,
      multiplicity,
      atoms,
      detail: leftovers.join(" "),
    });
  }

  return { rows, skippedLines };
}

/**
 * Filename for an exported peak list, e.g. "nmr-aspirin-1H.csv".
 *
 * Keeps the structure name in the filename because a downloaded peak list with
 * no indication of which structure it came from is close to useless once it's
 * in a downloads folder.
 */
export function peakListFilename(structureName: string, nucleus: Nucleus, extension: string): string {
  const safe = structureName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `nmr-${safe || "structure"}-${nucleus === "h1" ? "1H" : "13C"}.${extension}`;
}

/**
 * Range and count of a measured peak list, for the "n peaks from x to y ppm"
 * summary shown above the overlaid plot. Empty in, zeroes out - the caller
 * renders it only when a list is loaded, but it should never produce NaN if
 * that changes.
 */
export function describeExperimentalSpread(rows: PeakListRow[]): { min: number; max: number; count: number } {
  if (rows.length === 0) return { min: 0, max: 0, count: 0 };
  const shifts = rows.map((r) => r.shiftPpm);
  return { min: Math.min(...shifts), max: Math.max(...shifts), count: rows.length };
}
