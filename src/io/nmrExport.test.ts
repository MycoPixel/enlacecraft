import { describe, expect, test } from "vitest";
import {
  buildPeakList,
  peakListToCsv,
  peakListToJcamp,
  parsePeakList,
  peakListFilename,
  pickStructureFilename,
  isDefaultTabTitle,
  describeExperimentalSpread,
  type PeakListRow,
} from "./nmrExport";
import type { ShiftPrediction, H1ShiftPrediction } from "./nmrPredict";

/**
 * Spectrum export and experimental-import.
 *
 * The feature stopped at the screen: the numbers couldn't be read out, and a
 * real spectrum couldn't be put next to the prediction - even though comparing
 * the two is the entire reason to have a prediction.
 *
 * The parser is the risky half. It's handed text people pasted from wherever
 * they measured - a spreadsheet column, peak-picker output, a JCAMP block, a
 * bare list of numbers - and it has to be permissive without inventing data.
 * The behaviour that matters most: a line it can't parse is COUNTED and
 * reported rather than silently dropped, because a partial import that looks
 * complete is worse than one that admits what it ignored.
 */

const labelFor = (i: number) => `H${i + 1}`;

const h1 = (atomIndex: number, ppm: number, numHs: number, multiplicity = "s", detail = ""): H1ShiftPrediction => ({
  atomIndex,
  predictedShiftPpm: ppm,
  numHs,
  multiplicity,
  multiplicityDetail: detail,
  couplingHz: [],
  equivalenceGroup: atomIndex,
});

const c13 = (atomIndex: number, ppm: number): ShiftPrediction => ({
  atomIndex,
  predictedShiftPpm: ppm,
  equivalenceGroup: atomIndex,
});

describe("buildPeakList", () => {
  test("1H rows carry the proton count as integral", () => {
    const rows = buildPeakList([], [h1(0, 3.7, 3, "s")], "h1", labelFor);
    expect(rows).toEqual([
      { shiftPpm: 3.7, integral: 3, multiplicity: "s", atoms: "H1", detail: "" },
    ]);
  });

  test("13C rows are singlets with integral 1 and no detail", () => {
    const rows = buildPeakList([c13(0, 30.1)], [], "c13", labelFor);
    expect(rows).toEqual([
      { shiftPpm: 30.1, integral: 1, multiplicity: "s", atoms: "H1", detail: "" },
    ]);
  });

  test("rows come back sorted by descending ppm, the peak-table convention", () => {
    const rows = buildPeakList([c13(0, 20), c13(1, 130), c13(2, 75)], [], "c13", labelFor);
    expect(rows.map((r) => r.shiftPpm)).toEqual([130, 75, 20]);
  });

  test("an empty prediction yields an empty list, not a crash", () => {
    expect(buildPeakList([], [], "h1", labelFor)).toEqual([]);
    expect(buildPeakList([], [], "c13", labelFor)).toEqual([]);
  });

  test("atom labels resolve through the supplied mapper", () => {
    // atomIndex is RDKit's ordering, not this app's; the mapper is what bridges
    // the two, so a wrong mapper silently mislabels every row.
    const rows = buildPeakList([c13(2, 20)], [], "c13", (i) => `C${i + 10}`);
    expect(rows[0].atoms).toBe("C12");
  });
});

describe("peakListToCsv", () => {
  const rows: PeakListRow[] = [
    { shiftPpm: 3.74, integral: 3, multiplicity: "s", atoms: "H1, H2, H3", detail: "" },
    { shiftPpm: 1.2, integral: 1, multiplicity: "d", atoms: "H4", detail: "J = 7.2 Hz" },
  ];

  test("has a header and one line per row", () => {
    const lines = peakListToCsv(rows).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("shift_ppm,integral,multiplicity,atoms,coupling_detail");
  });

  test("quotes an atom list containing a comma so columns don't shift", () => {
    // "H1, H2, H3" unquoted would become three columns and push every later
    // field out of alignment - the classic silent CSV corruption.
    const csv = peakListToCsv(rows);
    expect(csv).toContain('"H1, H2, H3"');
    const secondLine = csv.split("\n")[1];
    // Exactly 5 fields once the quoted comma is handled.
    expect(secondLine.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length).toBe(5);
  });

  test("escapes embedded quotes by doubling them", () => {
    const quoted: PeakListRow[] = [{ shiftPpm: 1, integral: 1, multiplicity: "s", atoms: 'a "b"', detail: "" }];
    expect(peakListToCsv(quoted)).toContain('"a ""b"""');
  });

  test("formats shifts to 3 decimals", () => {
    expect(peakListToCsv(rows).split("\n")[1].startsWith("3.740,")).toBe(true);
  });

  test("an empty list still emits the header", () => {
    // A header-only CSV is a valid, useful file (an empty prediction).
    expect(peakListToCsv([])).toBe("shift_ppm,integral,multiplicity,atoms,coupling_detail");
  });
});

describe("peakListToJcamp", () => {
  const rows: PeakListRow[] = [
    { shiftPpm: 3.74, integral: 3, multiplicity: "s", atoms: "H1", detail: "" },
    { shiftPpm: 1.2, integral: 1, multiplicity: "d", atoms: "H4", detail: "" },
  ];

  test("declares the header fields a reader requires", () => {
    const out = peakListToJcamp(rows, "h1", "aspirin");
    expect(out).toContain("##JCAMP-DX");
    expect(out).toContain("##DATATYPE=SPECTRUM");
    expect(out).toContain("##NUCLEUS=1H");
    expect(out).toContain("##TITLE=aspirin");
    expect(out.trimEnd().endsWith("##END")).toBe(true);
  });

  test("sets 13C nucleus and a plausible carbon frequency", () => {
    const out = peakListToJcamp(rows, "c13", "x");
    expect(out).toContain("##NUCLEUS=13C");
    expect(out).toContain("##PROTONSFREQ=100.60");
  });

  test("normalises intensity into the 0-99 range the form conventionally uses", () => {
    const out = peakListToJcamp(rows, "h1", "x");
    const dataLines = out.split("\n").filter((l) => /^[\d.]+\t[\d.]+$/.test(l));
    expect(dataLines).toHaveLength(2);
    // The tallest (integral 3) normalises to 99.
    expect(dataLines.some((l) => l.endsWith("\t99.00"))).toBe(true);
    // And the weaker one is proportionally smaller.
    expect(dataLines.some((l) => l.endsWith("\t33.00"))).toBe(true);
  });

  test("an all-zero integral list doesn't produce NaN", () => {
    const zeros: PeakListRow[] = [{ shiftPpm: 1, integral: 0, multiplicity: "s", atoms: "H1", detail: "" }];
    expect(peakListToJcamp(zeros, "h1", "x")).not.toMatch(/NaN|Infinity/);
  });
});

describe("parsePeakList", () => {
  test("reads a bare ppm per line", () => {
    const { rows, skippedLines } = parsePeakList("8.42\n7.26\n1.13");
    expect(rows.map((r) => r.shiftPpm)).toEqual([8.42, 7.26, 1.13]);
    expect(skippedLines).toBe(0);
  });

  test("reads whitespace-separated ppm, integral and multiplicity", () => {
    const { rows } = parsePeakList("2.09 3 s");
    expect(rows[0]).toMatchObject({ shiftPpm: 2.09, integral: 3, multiplicity: "s" });
  });

  test("reads CSV rows", () => {
    const { rows } = parsePeakList("3.74,3,s,H1");
    expect(rows[0]).toMatchObject({ shiftPpm: 3.74, integral: 3, multiplicity: "s", atoms: "H1" });
  });

  test("reads a JCAMP XYDATA block, ignoring its wrapper lines", () => {
    const text = [
      "##JCAMP-DX",
      "##XYDATA=(X(PPM),Y(INTS))",
      "7.26 99.00",
      "3.74 30.00",
      "##END",
    ].join("\n");
    const { rows, skippedLines } = parsePeakList(text);
    expect(rows.map((r) => r.shiftPpm)).toEqual([7.26, 3.74]);
    expect(skippedLines).toBe(0);
  });

  test("reads parenthesised JCAMP pairs", () => {
    const { rows } = parsePeakList("7.26 (99.00)");
    expect(rows[0]).toMatchObject({ shiftPpm: 7.26, integral: 99 });
  });

  test("reads compound multiplicities like dd and ddd", () => {
    // "dd" is a doublet of doublets and is everywhere in real spectra. A
    // single-character matcher reads it as an atom label instead.
    expect(parsePeakList("7.826 1 dd H2").rows[0]).toMatchObject({ multiplicity: "dd", atoms: "H2" });
    expect(parsePeakList("6.9 2 ddd").rows[0].multiplicity).toBe("ddd");
    expect(parsePeakList("2.1 6 quintet").rows[0].multiplicity).toBe("quintet");
  });

  test("does not mistake a unit or a coupling label for a multiplicity", () => {
    expect(parsePeakList("7.26 ppm").rows[0].multiplicity).toBe("");
    expect(parsePeakList("2.09 2 t J = 7.2 Hz").rows[0].multiplicity).toBe("t");
  });

  test("counts unparsable lines instead of dropping them silently", () => {
    // The whole point: a partial import that looks complete is worse than one
    // that admits what it ignored.
    const { rows, skippedLines } = parsePeakList("7.26\nnot a number\n--- header ---\n1.13");
    expect(rows.map((r) => r.shiftPpm)).toEqual([7.26, 1.13]);
    expect(skippedLines).toBe(2);
  });

  test("ignores blank lines without counting them as skipped", () => {
    const { rows, skippedLines } = parsePeakList("\n\n7.26\n\n  \n1.13\n");
    expect(rows).toHaveLength(2);
    expect(skippedLines).toBe(0);
  });

  test("tolerates trailing units and punctuation", () => {
    const { rows } = parsePeakList("7.26 ppm");
    expect(rows[0].shiftPpm).toBe(7.26);
  });

  test("keeps trailing prose as detail", () => {
    const { rows } = parsePeakList("2.09 2 t J = 7.2 Hz");
    expect(rows[0].detail).toContain("7.2");
  });

  test("negative and decimal-only ppm parse", () => {
    const { rows } = parsePeakList("-0.5\n0.15");
    expect(rows.map((r) => r.shiftPpm)).toEqual([-0.5, 0.15]);
  });

  test("an empty input yields nothing and no errors", () => {
    expect(parsePeakList("")).toEqual({ rows: [], skippedLines: 0 });
    expect(parsePeakList("   \n\n ")).toEqual({ rows: [], skippedLines: 0 });
  });

  test("rejects a non-numeric first token rather than guessing zero", () => {
    // Turning "n/a" into a peak at 0 ppm would invent data.
    const { rows, skippedLines } = parsePeakList("n/a");
    expect(rows).toHaveLength(0);
    expect(skippedLines).toBe(1);
  });
});

describe("round trip", () => {
  test("a CSV we write parses back to the same peaks", () => {
    // The export exists so the data can leave the app and come back - e.g. into
    // a spreadsheet, edited, and pasted back as the experimental comparison.
    const original: PeakListRow[] = [
      { shiftPpm: 3.74, integral: 3, multiplicity: "s", atoms: "H1, H2, H3", detail: "" },
      { shiftPpm: 1.2, integral: 1, multiplicity: "d", atoms: "H4", detail: "J = 7.2 Hz" },
    ];
    const { rows } = parsePeakList(peakListToCsv(original));
    expect(rows.map((r) => r.shiftPpm)).toEqual([3.74, 1.2]);
    expect(rows[0].integral).toBe(3);
    expect(rows[0].atoms).toBe("H1, H2, H3");
    expect(rows[1].multiplicity).toBe("d");
  });

  test("a JCAMP file we write parses back to the same peaks", () => {
    const rows: PeakListRow[] = [
      { shiftPpm: 7.26, integral: 1, multiplicity: "s", atoms: "", detail: "" },
      { shiftPpm: 3.74, integral: 3, multiplicity: "s", atoms: "", detail: "" },
    ];
    const back = parsePeakList(peakListToJcamp(rows, "h1", "x"));
    expect(back.skippedLines).toBe(0);
    expect(back.rows.map((r) => r.shiftPpm)).toEqual([7.26, 3.74]);
    // Integrals survive as the normalised ratios.
    expect(back.rows.find((r) => r.shiftPpm === 3.74)!.integral).toBe(99);
  });
});

describe("peakListFilename", () => {
  test("slugifies the structure name and names the nucleus", () => {
    expect(peakListFilename("Aspirin", "h1", "csv")).toBe("nmr-aspirin-1H.csv");
    expect(peakListFilename("Aspirin", "c13", "jdx")).toBe("nmr-aspirin-13C.jdx");
  });

  test("strips characters a filename can't safely carry", () => {
    expect(peakListFilename("4-hydroxy-3-methoxy/benzoic?", "h1", "csv")).toBe(
      "nmr-4-hydroxy-3-methoxy-benzoic-1H.csv",
    );
  });

  test("falls back for an empty or unusable name rather than producing 'nmr--1H'", () => {
    expect(peakListFilename("", "h1", "csv")).toBe("nmr-structure-1H.csv");
    expect(peakListFilename("!!!", "h1", "csv")).toBe("nmr-structure-1H.csv");
  });

  test("bounds the length so a long name can't make an unwieldy filename", () => {
    const name = peakListFilename("a".repeat(200), "h1", "csv");
    expect(name.length).toBeLessThan(60);
  });
});

describe("pickStructureFilename", () => {
  test("uses a user-given tab title as-is", () => {
    // The user's own naming of the structure is exactly what belongs in the
    // filename. Also refuses to normalise it into a formula - see below.
    expect(pickStructureFilename("aspirin draft", "C9H8O4")).toBe("aspirin draft");
  });

  test("falls back to the formula when the title is still the app default", () => {
    // Without this, every download was named nmr-tab-1-1H.csv.
    expect(pickStructureFilename("Tab 1", "C9H8O4")).toBe("C9H8O4");
    expect(pickStructureFilename("Pestaña 3", "C9H8O4")).toBe("C9H8O4");
  });

  test("recognises default titles in either language and any case", () => {
    expect(isDefaultTabTitle("Tab 12")).toBe(true);
    expect(isDefaultTabTitle("tab 2")).toBe(true);
    expect(isDefaultTabTitle("  Pestaña 4  ")).toBe(true);
  });

  test("does not treat a real name that merely starts with Tab as default", () => {
    // "Tabernanthine" is a real compound name; stripping it to a formula
    // would discard the one name the user had.
    expect(isDefaultTabTitle("Tabernanthine")).toBe(false);
    expect(pickStructureFilename("Tabernanthine", "C21H22N2O4")).toBe("Tabernanthine");
  });

  test("falls back to 'structure' only when there is nothing at all", () => {
    expect(pickStructureFilename("Tab 1", null)).toBe("structure");
    expect(pickStructureFilename("", null)).toBe("structure");
    expect(pickStructureFilename("   ", "")).toBe("structure");
  });

  test("a formula filename still slugs into a usable name", () => {
    // Formulas contain no slug-illegal characters, but this pins the end-to-end
    // result since that is what actually reaches the downloads folder.
    expect(peakListFilename(pickStructureFilename("Tab 1", "C9H8O4"), "h1", "csv")).toBe(
      "nmr-c9h8o4-1H.csv",
    );
  });
});

describe("describeExperimentalSpread", () => {
  test("reports the range and count for a summary line", () => {
    const rows: PeakListRow[] = [
      { shiftPpm: 7.2, integral: 2, multiplicity: "d", atoms: "", detail: "" },
      { shiftPpm: 1.1, integral: 6, multiplicity: "s", atoms: "", detail: "" },
    ];
    expect(describeExperimentalSpread(rows)).toEqual({ min: 1.1, max: 7.2, count: 2 });
  });

  test("an empty list reports zeroes rather than NaN", () => {
    expect(describeExperimentalSpread([])).toEqual({ min: 0, max: 0, count: 0 });
  });
});