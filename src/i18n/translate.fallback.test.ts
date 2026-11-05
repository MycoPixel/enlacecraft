import { describe, expect, test, vi } from "vitest";

// A real key can't exercise this branch right now — translate.test.ts's
// parity check confirms "en" and "es" have no gaps between them today — so
// this uses a small controlled fixture instead, isolated to this file via
// vi.mock (translate.test.ts, in the same directory, needs the real
// dictionary for its own tests and would break if this mock applied there
// too).
vi.mock("./translations", () => ({
  translations: {
    en: { "fixture.enOnly": "English only", "fixture.both": "English version" },
    es: { "fixture.both": "Versión en español" },
  },
}));

describe("translate — English fallback", () => {
  test("falls back to the English value when a key is missing from the requested language", async () => {
    const { translate } = await import("./translate");
    expect(translate("es", "fixture.enOnly")).toBe("English only");
  });

  test("uses the requested language's own value when it has one, rather than always preferring English", async () => {
    const { translate } = await import("./translate");
    expect(translate("es", "fixture.both")).toBe("Versión en español");
  });
});
