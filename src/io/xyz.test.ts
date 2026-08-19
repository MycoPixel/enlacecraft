import { describe, expect, test } from "vitest";
import { exportXyz } from "./xyz";

describe("exportXyz", () => {
  test("the first line is the atom count", () => {
    const text = exportXyz([
      { element: "O", x: 0, y: 0, z: 0 },
      { element: "H", x: 0.96, y: 0, z: 0 },
      { element: "H", x: -0.24, y: 0.93, z: 0 },
    ]);
    expect(text.split("\n")[0]).toBe("3");
  });

  test("the second line is the (possibly empty) comment", () => {
    const withComment = exportXyz([{ element: "C", x: 0, y: 0, z: 0 }], "methane, MMFF94");
    expect(withComment.split("\n")[1]).toBe("methane, MMFF94");

    const withoutComment = exportXyz([{ element: "C", x: 0, y: 0, z: 0 }]);
    expect(withoutComment.split("\n")[1]).toBe("");
  });

  test("each atom becomes one 'Element  x  y  z' line, in input order", () => {
    const text = exportXyz([
      { element: "C", x: 1, y: 2, z: 3 },
      { element: "N", x: -1.5, y: 0, z: 2.25 },
    ]);
    const lines = text.trimEnd().split("\n").slice(2);
    expect(lines[0]).toBe("C  1.000000  2.000000  3.000000");
    expect(lines[1]).toBe("N  -1.500000  0.000000  2.250000");
  });

  test("an empty atom list still produces a valid (zero-atom) file", () => {
    const text = exportXyz([]);
    const lines = text.split("\n");
    expect(lines[0]).toBe("0");
    expect(lines).toHaveLength(3); // count line, comment line, trailing newline's empty entry
  });

  test("ends with a trailing newline", () => {
    const text = exportXyz([{ element: "He", x: 0, y: 0, z: 0 }]);
    expect(text.endsWith("\n")).toBe(true);
  });
});
