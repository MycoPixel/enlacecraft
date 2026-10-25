import { describe, expect, it } from "vitest";
import { RING_TEMPLATES } from "./constants";
import { translations, type Lang } from "../i18n/translations";

/**
 * Guards the ring picker's data. Two real bugs are easy to reintroduce by
 * copy-pasting an entry: a duplicate id (naphthalene was listed twice) and
 * a translation key that doesn't match the template id, which makes the
 * picker's `t(\`ring.${id}\`)` lookup miss and display the raw key
 * ("ring.1,3,5-triazine") as the tooltip instead of the compound's name.
 */
describe("ring templates", () => {
  it("have unique ids", () => {
    const seen = new Set<string>();
    const duplicates = RING_TEMPLATES
      .map((t) => t.id)
      .filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(duplicates).toEqual([]);
  });

  it("each have a translation key matching their id in every language", () => {
    const missing: string[] = [];
    for (const template of RING_TEMPLATES) {
      for (const lang of Object.keys(translations) as Lang[]) {
        const key = `ring.${template.id}`;
        if (!(key in translations[lang])) missing.push(`${lang}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
