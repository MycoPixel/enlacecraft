import { describe, expect, test } from "vitest";
import { translate } from "./translate";
import { translations } from "./translations";

describe("translate", () => {
  test("substitutes a {{placeholder}} with the given value", () => {
    expect(translate("en", "nmr.isomerTab", { index: "2" })).toBe("Isomer 2");
    expect(translate("es", "nmr.isomerTab", { index: "2" })).toBe("Isómero 2");
  });

  test("substitutes multiple different placeholders independently", () => {
    expect(translate("en", "nmr.atomLabelH", { label: "C1", count: "3" })).toBe("C1 (3H)");
  });

  test("returns the key itself when it exists in neither language", () => {
    expect(translate("en", "this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });

  test("a string with no placeholders ignores an unused vars object", () => {
    expect(translate("en", "confirm.cancel", { unused: "x" })).toBe("Cancel");
  });
});

// The English-fallback branch (translations[lang][key] ?? translations.en[key]
// ?? key) can't be exercised with a real key here: as the parity test below
// confirms, "en" and "es" are actually in perfect sync right now, so every
// real key would skip straight past that branch. Covered properly, with a
// controlled fixture, in translate.fallback.test.ts instead.

// Regression test for a real bug: "nmr.isomerTab" and "nmr.isomerSmiles"
// were written with single braces ("Isomer {index}") instead of the
// {{double braces}} translate()'s own interpolation regex requires
// (\{\{key\}\}) — so the placeholder never matched, and the UI showed the
// literal text "Isomer {index}" instead of "Isomer 2". The call sites
// (NmrPredictionButton.tsx, NmrReportView.tsx) were passing the right vars
// all along; only the string templates themselves were wrong, in a way
// that's easy to introduce again in any future key and easy to miss in
// review — a plain string typo, not a logic bug — so this scans every
// value in both translation tables rather than re-testing just the two
// keys that happened to be wrong this time.
describe("translation strings use {{double braces}}, not {single braces}", () => {
  const SINGLE_BRACE_PLACEHOLDER = /(?<!\{)\{[a-zA-Z][a-zA-Z0-9_]*\}(?!\})/;

  for (const lang of Object.keys(translations) as Array<keyof typeof translations>) {
    for (const [key, value] of Object.entries(translations[lang])) {
      test(`${lang}["${key}"] has no single-brace placeholder`, () => {
        expect(value).not.toMatch(SINGLE_BRACE_PLACEHOLDER);
      });
    }
  }
});

// Not something the user reported, but discovered while writing the tests
// above: worth locking in now that it's true, so a future key added to one
// language and forgotten in the other fails a test instead of silently
// falling back to English in the UI.
describe("en/es translation key parity", () => {
  test("every English key has a Spanish counterpart and vice versa", () => {
    const enKeys = new Set(Object.keys(translations.en));
    const esKeys = new Set(Object.keys(translations.es));
    const onlyInEn = [...enKeys].filter((k) => !esKeys.has(k));
    const onlyInEs = [...esKeys].filter((k) => !enKeys.has(k));
    expect(onlyInEn).toEqual([]);
    expect(onlyInEs).toEqual([]);
  });
});
