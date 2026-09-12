/**
 * PubChem's name search is indexed overwhelmingly in English (plus IUPAC/CAS
 * names), so a Spanish query like "cafeína" or "ácido acético" usually won't
 * resolve directly. Rather than require the user to already know the English
 * name, we resolve Spanish -> English before (re-)querying PubChem:
 *
 *  1. A small curated dictionary of common compound names (fast, no network,
 *     and correct by construction — no risk of a bad machine translation of
 *     a chemical name).
 *  2. A live translation fallback (MyMemory's free, keyless, CORS-enabled
 *     API) for anything not in the dictionary, so arbitrary Spanish names
 *     still have a reasonable shot at resolving.
 *
 * This only kicks in when the raw query doesn't resolve on PubChem as-is —
 * see fetchCompoundByName in ./pubchem.ts.
 */

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (á -> a, ó -> o, ñ handled below)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Common Spanish compound names -> English names PubChem will recognize. */
const ES_TO_EN: Record<string, string> = {
  "agua": "water",
  "sal": "sodium chloride",
  "sal comun": "sodium chloride",
  "cloruro de sodio": "sodium chloride",
  "azucar": "sucrose",
  "sacarosa": "sucrose",
  "glucosa": "glucose",
  "fructosa": "fructose",
  "lactosa": "lactose",
  "almidon": "starch",
  "celulosa": "cellulose",
  "etanol": "ethanol",
  "alcohol etilico": "ethanol",
  "metanol": "methanol",
  "alcohol metilico": "methanol",
  "isopropanol": "isopropyl alcohol",
  "alcohol isopropilico": "isopropyl alcohol",
  "acido acetico": "acetic acid",
  "vinagre": "acetic acid",
  "acido sulfurico": "sulfuric acid",
  "acido clorhidrico": "hydrochloric acid",
  "acido nitrico": "nitric acid",
  "acido fosforico": "phosphoric acid",
  "acido citrico": "citric acid",
  "acido folico": "folic acid",
  "acido ascorbico": "ascorbic acid",
  "vitamina c": "ascorbic acid",
  "acido lactico": "lactic acid",
  "acido oxalico": "oxalic acid",
  "acido benzoico": "benzoic acid",
  "benzoato de sodio": "sodium benzoate",
  "aspirina": "aspirin",
  "acido acetilsalicilico": "aspirin",
  "cafeina": "caffeine",
  "ibuprofeno": "ibuprofen",
  "paracetamol": "acetaminophen",
  "acetaminofen": "acetaminophen",
  "morfina": "morphine",
  "nicotina": "nicotine",
  "cocaina": "cocaine",
  "heroina": "heroin",
  "glicerina": "glycerol",
  "glicerol": "glycerol",
  "benceno": "benzene",
  "tolueno": "toluene",
  "xileno": "xylene",
  "propano": "propane",
  "butano": "butane",
  "metano": "methane",
  "etano": "ethane",
  "eteno": "ethylene",
  "etileno": "ethylene",
  "propeno": "propylene",
  "propileno": "propylene",
  "acetileno": "acetylene",
  "acetona": "acetone",
  "formaldehido": "formaldehyde",
  "urea": "urea",
  "colesterol": "cholesterol",
  "adrenalina": "epinephrine",
  "dopamina": "dopamine",
  "serotonina": "serotonin",
  "melatonina": "melatonin",
  "histamina": "histamine",
  "penicilina": "penicillin",
  "insulina": "insulin",
  "amoniaco": "ammonia",
  "amonio": "ammonia",
  "dioxido de carbono": "carbon dioxide",
  "monoxido de carbono": "carbon monoxide",
  "peroxido de hidrogeno": "hydrogen peroxide",
  "agua oxigenada": "hydrogen peroxide",
  "cianuro de hidrogeno": "hydrogen cyanide",
  "sulfuro de hidrogeno": "hydrogen sulfide",
  "oxido nitroso": "nitrous oxide",
  "ozono": "ozone",
  "cloroformo": "chloroform",
  "naftalina": "naphthalene",
  "naftaleno": "naphthalene",
  "fenol": "phenol",
  "anilina": "aniline",
  "piridina": "pyridine",
  "testosterona": "testosterone",
  "estrogeno": "estrogen",
  "progesterona": "progesterone",
  "sacarina": "saccharin",
  "aspartamo": "aspartame",
  "glutamato monosodico": "monosodium glutamate",
  "grafito": "graphite",
  "diamante": "diamond",
};

export function lookupSpanishDictionary(query: string): string | null {
  return ES_TO_EN[normalizeText(query)] ?? null;
}

/**
 * Prefix-matches `query` against the curated dictionary's Spanish keys —
 * and each individual word within a multi-word key, so typing "acetico"
 * alone still matches "acido acetico" — returning up to `limit` of their
 * English targets, deduplicated. Used to feed Spanish input into the
 * compound-search suggestions dropdown, which would otherwise only ever
 * suggest from PubChem's English/IUPAC autocomplete dictionary.
 */
export function suggestSpanishDictionaryMatches(query: string, limit = 8): string[] {
  const q = normalizeText(query);
  if (!q) return [];
  const seen = new Set<string>();
  const results: string[] = [];
  for (const [key, en] of Object.entries(ES_TO_EN)) {
    if (seen.has(en)) continue;
    const words = key.split(" ");
    if (key.startsWith(q) || words.some((w) => w.startsWith(q))) {
      seen.add(en);
      results.push(en);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * A short list of names whose Spanish spelling is genuinely irregular —
 * not a mechanical transform of the English one (e.g. "benzene" ->
 * "benceno" changes z to c; nothing else here would produce that).
 * Checked first, as whole substrings, before the general digraph/suffix
 * rules below. Deliberately not word-boundary-anchored: real IUPAC names
 * fuse these together with no separator ("chlorobenzene",
 * "methylbenzaldehyde"), so a \b-anchored match would miss most real uses.
 * Everything regular (chain lengths, cyclo-, -yl, -one, -ate, ...) is
 * handled by the general rules further down instead of being listed here,
 * so this stays short and still covers names of any chain length.
 */
const IRREGULAR_CHEM_ES: [string, string][] = [
  ["benzaldehyde", "benzaldehído"],
  ["benzyl", "bencil"],
  ["benzene", "benceno"],
  ["styrene", "estireno"],
  ["aniline", "anilina"],
  ["pyrimidine", "pirimidina"],
  ["pyridine", "piridina"],
  ["pyrrole", "pirrol"],
  ["furan", "furano"],
];

/** General suffix substitutions, applied after the irregular dictionary
 * and the digraph/prefix reductions below. These are what let this
 * function handle a parent chain of *any* length (undecane, dodecanoic
 * acid, ...) without needing an entry for each one. */
const SUFFIX_SUBS: [RegExp, string][] = [
  [/carboxylic/gi, "carboxilic"],
  [/hydroxy/gi, "hidroxi"],
  [/carbonitrile/gi, "carbonitrilo"],
  [/nitrile/gi, "nitrilo"],
  [/diamine/gi, "diamina"],
  [/amine/gi, "amina"],
  [/amide/gi, "amida"],
  [/chloride/gi, "cloruro"],
  [/bromide/gi, "bromuro"],
  [/fluoride/gi, "fluoruro"],
  [/iodide/gi, "yoduro"],
  [/iodo/gi, "yodo"],
  // Order matters below: the alkane/ene/yne parent-chain ending only
  // appears in full when nothing else follows in the same word (a
  // further suffix like -ol/-one/-oic elides the trailing e in both
  // languages identically, e.g. "propan-2-ol"/"propan-2-ol"), so these
  // are word-boundary-anchored. "-one" and "-yl" fuse mid-word with
  // whatever comes next ("cyclohexanone", "methylbenzene") and so are
  // deliberately left unanchored.
  [/ane\b/gi, "ano"],
  [/ene\b/gi, "eno"],
  [/yne\b/gi, "ino"],
  [/one/gi, "ona"],
  [/yl/gi, "il"],
];

function applyChemistryRules(input: string): string {
  let s = input;
  for (const [en, es] of IRREGULAR_CHEM_ES) s = s.replace(new RegExp(en, "gi"), es);
  // "cyclo-" and the ph/th/ch digraphs simplify the same way wherever
  // they appear (cyclohexane -> ciclohexano, methyl -> metil, phenyl ->
  // fenil, chloro -> cloro), so these run unconditionally before the
  // suffix rules above get a chance to touch what's left.
  s = s.replace(/cyclo/gi, "ciclo").replace(/ph/gi, "f").replace(/th/gi, "t").replace(/ch/gi, "c");
  // Grammatical, not chemical: PubChem's name for a multi-component query
  // (e.g. selecting two disconnected molecules and looking up one combined
  // name — see lookupIupacName's doc comment) joins the pieces with the
  // English word "and". Nothing above touches connective words, only
  // chemical vocabulary, so without this "and" passed straight through
  // into the "Spanish" result untranslated. Word-boundary-anchored so it
  // can't misfire inside a chemical name that happens to contain "and" as
  // a substring — "androstane" has no word boundary between the "d" and
  // the "r", so \band\b doesn't match there.
  s = s.replace(/\band\b/gi, "y");
  for (const [re, replacement] of SUFFIX_SUBS) s = s.replace(re, replacement);
  return s;
}

/**
 * Best-effort English IUPAC name -> Spanish transliteration, for showing
 * alongside PubChem's (English-only) IUPACName lookup when the app is in
 * Spanish mode. IUPAC nomenclature in Spanish uses the same locants and
 * multiplying prefixes (di/tri/tetra...) as English — the differences are
 * mostly mechanical spelling changes (see applyChemistryRules above) plus,
 * for carboxylic acids and esters, a word-order change handled specially
 * below ("acetic acid" -> "ácido acético"; "methyl acetate" -> "acetato de
 * metilo").
 *
 * This is NOT a validated nomenclature engine: it won't add accent marks
 * (renders "acetico" rather than "acético"), won't reorder anything beyond
 * the two patterns below, and can misfire on unusual names. It's meant to
 * give a genuinely useful approximation for the common structures a
 * student draws — the English/IUPAC name PubChem returns should always be
 * treated as the authoritative one, and this result is shown labeled as
 * approximate for that reason.
 */
export function approximateSpanishIupacName(englishName: string): string {
  const trimmed = englishName.trim();

  // Multi-component names ("ethanol and propan-1-ol", from looking up two
  // disconnected structures at once — see lookupIupacName's doc comment)
  // skip the ester/acid pattern checks below entirely: both those regexes
  // are anchored across the *whole* trimmed string, so on a multi-component
  // name they can span right across the "and" and misfire — e.g. "ethanol
  // and acetic acid" ends in " acid", which the acid regex would otherwise
  // match with its entire "ethanol and acetic" prefix treated as if that
  // were a single stem. Falling through to the plain applyChemistryRules
  // case below (which now translates "and" -> "y" — see that function)
  // isn't a perfect per-component translation, but it's never wrong in the
  // way a misapplied ester/acid restructuring would be.
  const isMultiComponent = /\band\b/i.test(trimmed);

  if (!isMultiComponent) {
    // Simple esters: "<alkyl>yl <acyl>ate" -> "<acyl>ato de <alkyl>ilo"
    // (e.g. "methyl acetate" -> "acetato de metilo", "ethyl butanoate" ->
    // "butanoato de etilo" — note the stem doesn't always end in "o" before
    // "ate": acetate = acet+ate, butanoate = butano+ate).
    const esterMatch = /^(\S*yl)\s+(\S+)ate$/i.exec(trimmed);
    if (esterMatch) {
      const alkyl = applyChemistryRules(esterMatch[1]); // e.g. "methyl" -> "metil"
      const acylStem = applyChemistryRules(esterMatch[2]);
      return `${acylStem}ato de ${alkyl}o`;
    }

    // Carboxylic acids: "<stem>ic acid" -> "ácido <stem>ico"
    const acidMatch = /^(.*)\s+acid$/i.exec(trimmed);
    if (acidMatch) {
      let stem = applyChemistryRules(acidMatch[1]);
      stem = stem.replace(/ic$/i, "ico");
      return `ácido ${stem}`;
    }
  }

  return applyChemistryRules(trimmed);
}

/** Live fallback translation via MyMemory (free, no API key, CORS-enabled). */
export async function translateSpanishToEnglish(query: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=es|en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.responseStatus !== 200) return null;
    const translated: string | undefined = data?.responseData?.translatedText;
    if (!translated) return null;
    return normalizeText(translated) === normalizeText(query) ? null : translated;
  } catch {
    return null;
  }
}
