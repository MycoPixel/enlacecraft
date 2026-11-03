import { describe, expect, test } from "vitest";
import type { Atom, Bond, Molecule } from "../types/chemistry";
import {
  buildPropertyRows,
  escapeCsvCell,
  formatPropertyValue,
  propertiesToCsv,
  propertyRowToSdfFields,
} from "./propertiesTable";

function atom(id: string, element: Atom["element"], x: number, extra: Partial<Atom> = {}): Atom {
  return { id, x, y: 0, element, charge: 0, ...extra };
}

function bond(id: string, a1: string, a2: string): Bond {
  return { id, a1, a2, order: 1, stereo: "none", doubleSide: "auto" };
}

function molecule(atoms: Atom[], bonds: Bond[] = []): Molecule {
  return {
    atoms: Object.fromEntries(atoms.map((a) => [a.id, a])),
    bonds: Object.fromEntries(bonds.map((b) => [b.id, b])),
    hapticBonds: {},
    aromaticRingDisplays: {},
  };
}

describe("buildPropertyRows", () => {
  test("makes one row per connected structure, left to right", () => {
    const mol = molecule(
      [atom("o", "O", 300), atom("c1", "C", 0), atom("c2", "C", 42)],
      [bond("cc", "c1", "c2")],
    );
    const rows = buildPropertyRows(mol);

    expect(rows).toHaveLength(2);
    expect(rows[0].index).toBe(1);
    expect(rows[0].atomIds.sort()).toEqual(["c1", "c2"]);
    expect(rows[0].formula).toBe("C2H6");
    expect(rows[0].molecularWeight).toBeCloseTo(30.07, 1);
    expect(rows[0].exactMass).toBeCloseTo(30.04695, 4);
    expect(rows[0].charge).toBe(0);
    expect(rows[0].atomCount).toBe(2);
    expect(rows[0].heavyAtomCount).toBe(2);
    expect(rows[0].bondCount).toBe(1);
    expect(rows[0].smiles).toBe("CC");

    expect(rows[1].index).toBe(2);
    expect(rows[1].formula).toBe("H2O");
    expect(rows[1].molecularWeight).toBeCloseTo(18.02, 1);
    expect(rows[1].atomCount).toBe(1);
    expect(rows[1].heavyAtomCount).toBe(1);
    expect(rows[1].bondCount).toBe(0);
    expect(rows[1].smiles).toBe("O");
  });

  test("keeps per-fragment masses separate rather than summing the canvas", () => {
    const mol = molecule(
      [atom("c1", "C", 0), atom("c2", "C", 42), atom("o", "O", 300)],
      [bond("cc", "c1", "c2")],
    );
    const rows = buildPropertyRows(mol);

    expect(rows.map((row) => row.formula)).toEqual(["C2H6", "H2O"]);
    expect(rows[0].molecularWeight + rows[1].molecularWeight).toBeCloseTo(48.09, 1);
  });

  test("sums formal charges per fragment", () => {
    const mol = molecule([atom("n", "N", 0, { charge: 1 })]);
    const [row] = buildPropertyRows(mol);

    expect(row.charge).toBe(1);
    expect(formatPropertyValue(row, "charge")).toBe("+1");
  });

  test("reports why descriptors are unavailable instead of dropping the row", () => {
    const placeholder = buildPropertyRows(
      molecule([atom("r", "C", 0, { group: "R" })]),
    )[0];
    expect(placeholder.formula).toBe("");
    expect(placeholder.descriptors).toBeNull();
    expect(placeholder.descriptorsUnavailable).toBe("ABBREVIATED_GROUP");

    const ignored = buildPropertyRows(
      molecule([atom("x", "Fe", 0, { ignoreValence: true })]),
    )[0];
    expect(ignored.descriptors).toBeNull();
    expect(ignored.descriptorsUnavailable).toBe("IGNORED_VALENCE");
  });

  test("computes descriptors for an ordinary structure", () => {
    const [row] = buildPropertyRows(molecule([atom("c1", "C", 0), atom("c2", "C", 42)], [bond("cc", "c1", "c2")]));

    expect(row.descriptorsUnavailable).toBeNull();
    expect(row.descriptors).not.toBeNull();
    expect(Number.isFinite(row.descriptors!.logP)).toBe(true);
  });

  test("returns no rows for an empty canvas", () => {
    expect(buildPropertyRows(molecule([]))).toEqual([]);
  });
});

describe("CSV serialization", () => {
  test("quotes cells containing commas, quotes or newlines", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("two\nlines")).toBe('"two\nlines"');
  });

  test("writes localised headers and one line per row with CRLF endings", () => {
    const rows = buildPropertyRows(
      molecule([atom("c1", "C", 0), atom("c2", "C", 42), atom("o", "O", 300)], [bond("cc", "c1", "c2")]),
    );
    const csv = propertiesToCsv(rows, [
      { key: "index", header: "#" },
      { key: "formula", header: "Fórmula" },
      { key: "smiles", header: "SMILES" },
    ]);

    expect(csv).toBe("#,Fórmula,SMILES\r\n1,C2H6,CC\r\n2,H2O,O\r\n");
  });

  test("includes PubChem enrichment values where available", () => {
    const rows = buildPropertyRows(molecule([atom("c1", "C", 0), atom("c2", "C", 42)], [bond("cc", "c1", "c2")]));
    const csv = propertiesToCsv(
      rows,
      [
        { key: "pubchemCid", header: "CID" },
        { key: "pubchemName", header: "Name" },
        { key: "inchikey", header: "InChIKey" },
      ],
      { CC: { cid: 6324, name: 'ethane, "pure"', inchikey: "OTMSDBZUPAUEDD-UHFFFAOYSA-N" } },
    );

    // The name has both a comma and quotes, so the whole cell must be quoted
    // and every embedded quote doubled.
    expect(csv).toContain('6324,"ethane, ""pure""",OTMSDBZUPAUEDD-UHFFFAOYSA-N');
  });

  test("writes an empty cell, not an em dash, when a value is unavailable", () => {
    const rows = buildPropertyRows(molecule([atom("c1", "C", 0), atom("c2", "C", 42)], [bond("cc", "c1", "c2")]));
    const csv = propertiesToCsv(rows, [
      { key: "pubchemCid", header: "CID" },
      { key: "formula", header: "Formula" },
    ]);

    expect(csv).toBe("CID,Formula\r\n,C2H6\r\n");
    expect(formatPropertyValue(rows[0], "pubchemCid")).toBe("");
  });
});

describe("SDF property fields", () => {
  test("uses stable English tags and omits unavailable values", () => {
    const [row] = buildPropertyRows(molecule([atom("c1", "C", 0), atom("c2", "C", 42)], [bond("cc", "c1", "c2")]));
    const fields = propertyRowToSdfFields(row);

    expect(fields.Formula).toBe("C2H6");
    expect(fields["Molecular Weight"]).toBe("30.07");
    expect(fields.SMILES).toBe("CC");
    expect(fields.logP).toBeDefined();
    // A value the descriptor engine couldn't produce is omitted entirely,
    // rather than written as a blank field a downstream query would match.
    expect(Object.values(fields).every((value) => value !== "")).toBe(true);
  });

  test("does not emit descriptor tags when descriptors are unavailable", () => {
    const [row] = buildPropertyRows(molecule([atom("r", "C", 0, { group: "R" })]));
    const fields = propertyRowToSdfFields(row);

    expect(fields.logP).toBeUndefined();
    expect(fields.Formula).toBeUndefined();
  });
});
