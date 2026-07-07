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
