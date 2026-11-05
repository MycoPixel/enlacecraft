import { translations, type Lang } from "./translations";

/** Plain-function version of translation lookup, usable outside React components. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let str = translations[lang][key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const k in vars) {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(vars[k]));
    }
  }
  return str;
}
