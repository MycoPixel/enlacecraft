import { describe, expect, it } from "vitest";
import { STRUCTURE_TEMPLATES } from "./structureTemplates";
import { emptyMolecule, insertMolecule } from "./molecule";
import { computeFormula, findConnectedFragments, isOverValent } from "./valence";
import { BOND_LEN } from "./constants";
import { translations } from "../i18n/translations";
import type { Molecule } from "../types/chemistry";

/**
 * Guards every built-in structure template against the class of bug that
 * used to make most of the AI-authored carbohydrate/nucleotide/steroid
 * templates throw on insertion: a bond whose a1/a2 named an atom that
 * didn't exist (typically because the atom's record key and its own `id`
 * field had drifted apart, so a bond written against one didn't match the
 * other). `findConnectedFragments` is what the formula/MW readout calls
 * right after insertion, and it simply indexes `mol.atoms[id]`, so such a
 * dangling reference surfaced as "Cannot read properties of undefined
 * (reading 'x')" rather than as anything template-specific.
 *
 * The formula table below additionally pins each template's composition to
 * the real compound, so a template can't silently lose a carbon, an oxygen
 * or a double bond again while still being internally consistent.
 */
const EXPECTED_FORMULAS: Record<string, string> = {
  cyclopentadienyl: "C5H5",
  gly: "C2H5NO2",
  ala: "C3H7NO2",
  arg: "C6H14N4O2",
  cys: "C3H7NO2S",
  asn: "C4H8N2O3",
  asp: "C4H6NO4",
  gln: "C5H10N2O3",
  glu: "C5H8NO4",
  his: "C6H9N3O2",
  ile: "C6H13NO2",
  leu: "C6H13NO2",
  lys: "C6H14N2O2",
  met: "C5H11NO2S",
  phe: "C9H11NO2",
  pro: "C5H9NO2",
  ser: "C3H7NO3",
  thr: "C4H9NO3",
  trp: "C11H12N2O2",
  tyr: "C9H11NO3",
  val: "C5H11NO2",
  "glucose-fischer": "C6H12O6",
  "l-glucose-fischer": "C6H12O6",
  "glucose-haworth": "C6H12O6",
  maltose: "C12H22O11",
  "galactose-fischer": "C6H12O6",
  "mannose-fischer": "C6H12O6",
  "fructose-fischer": "C6H12O6",
  "ribose-fischer": "C5H10O5",
  deoxyribose: "C5H10O4",
  lactose: "C12H22O11",
  sucrose: "C12H22O11",
  cellobiose: "C12H22O11",
  "cellulose-repeat": "C12H22O11",
  "amylose-repeat": "C12H22O11",
  "chitin-repeat": "C16H28N2O11",
  indole: "C8H7N",
  quinoline: "C9H7N",
  isoquinoline: "C9H7N",
  benzimidazole: "C7H6N2",
  purine: "C5H4N4",
  amp: "C10H14N5O7P",
  gmp: "C10H14N5O8P",
  cmp: "C9H14N3O8P",
  ump: "C9H13N2O9P",
  tmp: "C10H15N2O8P",
  gtp: "C10H16N5O14P3",
  ctp: "C9H16N3O14P3",
  utp: "C9H15N2O15P3",
  adenine: "C5H5N5",
  guanine: "C5H5N5O",
  cytosine: "C4H5N3O",
  thymine: "C5H6N2O2",
  uracil: "C4H4N2O2",
  gonane: "C17H28",
  cholesterol: "C27H46O",
  testosterone: "C19H28O2",
  estradiol: "C18H24O2",
  progesterone: "C21H30O2",
  cortisol: "C21H30O5",
  cholicAcid: "C24H40O5",
  deoxycholicAcid: "C24H40O4",
  lithocholicAcid: "C24H40O3",
  chenodeoxycholicAcid: "C24H40O4",
  limonene: "C10H16",
  caryophyllene: "C15H24",
  retinol: "C20H30O",
  menthol: "C10H20O",
  camphor: "C10H16O",
  artemisinin: "C15H22O5",
  squalene: "C30H50",
  // --- Phase-10 library expansion sets ---
  // Conformations
  "cyclohexane-chair-flipped": "C6H12",
  "ethane-newman-staggered": "C2H6",
  "ethane-newman-eclipsed": "C2H6",
  "butane-newman-anti": "C4H10",
  "butane-newman-gauche": "C4H10",
  // Organometallics (metallocenes' Cp rings carry one explicit H per
  // carbon via implicit-H math; the paddlewheel's four acetates are
  // CH3C(=O)O⁻ bridges)
  ferrocene: "C10H10Fe",
  cobaltocene: "C10H10Co",
  nickelocene: "C10H10Ni",
  "ru2-acetate-paddlewheel": "C8H12O8Ru2",
  // Named aromatics / bicyclics
  anthracene: "C14H10",
  phenanthrene: "C14H10",
  azulene: "C10H8",
  biphenyl: "C12H10",
  fluorene: "C13H10",
  indene: "C9H8",
};

/**
 * Templates containing bonds that are intentionally shorter than the
 * 0.7·BOND_LEN plausibility floor below. The Newman projections' viewing
 * axis (front carbon → back carbon) is drawn as a short stub so the
 * projection stays one connected fragment for the formula/fragment
 * readouts — a Newman's C–C axis isn't really a line in the drawing (the
 * circle edge would stand for it), and the back carbon is deliberately
 * offset a few px instead of coincident (see ringConformations.ts's
 * Newman section). Everything else about these templates still gets the
 * full length check.
 */
const SHORT_STUB_BONDS_OK = new Set([
  "ethane-newman-staggered",
  "ethane-newman-eclipsed",
  "butane-newman-anti",
  "butane-newman-gauche",
]);

function moleculeProblems(name: string, mol: Molecule): string[] {
  const problems: string[] = [];
  const atomIds = new Set(Object.keys(mol.atoms));

  for (const [key, atom] of Object.entries(mol.atoms)) {
    if (atom.id !== key) problems.push(`${name}: atom key ${key} has id ${atom.id}`);
    if (!Number.isFinite(atom.x) || !Number.isFinite(atom.y)) {
      problems.push(`${name}: atom ${key} has non-finite coordinates (${atom.x}, ${atom.y})`);
    }
    if (!atom.element) problems.push(`${name}: atom ${key} has no element`);
  }

  for (const [key, bond] of Object.entries(mol.bonds)) {
    if (!atomIds.has(bond.a1)) problems.push(`${name}: bond ${key} a1 ${bond.a1} does not exist`);
    if (!atomIds.has(bond.a2)) problems.push(`${name}: bond ${key} a2 ${bond.a2} does not exist`);
    if (bond.a1 === bond.a2) problems.push(`${name}: bond ${key} connects atom ${bond.a1} to itself`);
    const a = mol.atoms[bond.a1];
    const b = mol.atoms[bond.a2];
    if (a && b && Number.isFinite(a.x) && Number.isFinite(b.x)) {
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      if (length < BOND_LEN * 0.7 && !SHORT_STUB_BONDS_OK.has(name)) {
        problems.push(`${name}: bond ${key} has implausible length ${length.toFixed(1)}`);
      }
    }
  }

  for (const [key, hb] of Object.entries(mol.hapticBonds)) {
    if (!atomIds.has(hb.metalAtomId)) problems.push(`${name}: haptic bond ${key} metal ${hb.metalAtomId} does not exist`);
    for (const id of hb.ringAtomIds) {
      if (!atomIds.has(id)) problems.push(`${name}: haptic bond ${key} ring atom ${id} does not exist`);
    }
  }

  for (const [key, ring] of Object.entries(mol.aromaticRingDisplays)) {
    for (const id of ring.atomIds) {
      if (!atomIds.has(id)) problems.push(`${name}: aromatic ring display ${key} atom ${id} does not exist`);
    }
  }

  try {
    findConnectedFragments(mol);
  } catch (err) {
    problems.push(`${name}: findConnectedFragments threw: ${String(err)}`);
  }

  return problems;
}

describe("built-in structure templates", () => {
  it("all have internally consistent atoms, bonds, and ring references", () => {
    const problems = STRUCTURE_TEMPLATES.flatMap((t) => moleculeProblems(t.id, t.molecule));
    expect(problems).toEqual([]);
  });

  it("all are one connected molecule with no isolated atoms or over-valent atoms", () => {
    const problems: string[] = [];
    for (const t of STRUCTURE_TEMPLATES) {
      const fragments = findConnectedFragments(t.molecule);
      if (fragments.length !== 1) {
        problems.push(`${t.id}: ${fragments.length} disconnected fragments (${fragments.map((f) => f.length).join(", ")})`);
      }
      for (const [id, atom] of Object.entries(t.molecule.atoms)) {
        if (isOverValent(t.molecule, id)) problems.push(`${t.id}: atom ${id} (${atom.element}) is over-valent`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("all have the molecular formula of the compound they claim to be", () => {
    const problems: string[] = [];
    for (const t of STRUCTURE_TEMPLATES) {
      const expected = EXPECTED_FORMULAS[t.id];
      if (!expected) {
        problems.push(`${t.id}: no expected formula in this test`);
        continue;
      }
      const actual = computeFormula(t.molecule);
      if (actual !== expected) problems.push(`${t.id}: expected ${expected}, got ${actual}`);
    }
    expect(problems).toEqual([]);
  });

  it("polysaccharide repeats are enclosed by a bracket pair with an italic n", () => {
    const problems: string[] = [];
    for (const id of ["cellulose-repeat", "amylose-repeat", "chitin-repeat"]) {
      const template = STRUCTURE_TEMPLATES.find((t) => t.id === id);
      if (!template) {
        problems.push(`${id}: template missing`);
        continue;
      }
      const brackets = template.annotations.filter((a) => a.kind === "bracket");
      if (brackets.length !== 2) problems.push(`${id}: expected 2 brackets, got ${brackets.length}`);
      const facings = brackets.map((b) => (b.kind === "bracket" ? b.facing : "")).sort();
      if (facings.join(",") !== "close,open") problems.push(`${id}: bracket facings ${facings.join(",")}`);
      const label = template.annotations.find((a) => a.kind === "text" && a.html.includes("<i>n</i>"));
      if (!label) problems.push(`${id}: missing italic n label`);
    }
    expect(problems).toEqual([]);
  });

  it("every category has a translated heading in every language", () => {
    const categories = [...new Set(STRUCTURE_TEMPLATES.map((t) => t.category))];
    const problems: string[] = [];
    for (const category of categories) {
      const key = `structureCategory.${category}`;
      for (const lang of ["en", "es"] as const) {
        if (translations[lang][key] == null) problems.push(`${key} is missing from ${lang}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("all survive the same insertMolecule path used by the picker", () => {
    const problems = STRUCTURE_TEMPLATES.flatMap((t) => {
      const { mol } = insertMolecule(emptyMolecule(), t.molecule, 0, 0);
      return moleculeProblems(t.id, mol);
    });
    expect(problems).toEqual([]);
  });

  it("all have unique ids across the whole registry", () => {
    const ids = STRUCTURE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the Phase-10 expansion sets are present under their own categories", () => {
    const byId = new Map(STRUCTURE_TEMPLATES.map((t) => [t.id, t]));
    // Conformations: flipped chair + four Newman projections.
    for (const id of [
      "cyclohexane-chair-flipped",
      "ethane-newman-staggered",
      "ethane-newman-eclipsed",
      "butane-newman-anti",
      "butane-newman-gauche",
    ]) {
      expect(byId.get(id)?.category).toBe("conformations");
    }
    // Organometallics: three metallocenes + the Ru acetate paddlewheel.
    for (const id of ["ferrocene", "cobaltocene", "nickelocene", "ru2-acetate-paddlewheel"]) {
      expect(byId.get(id)?.category).toBe("organometallics");
    }
    // Named aromatics / bicyclics.
    for (const id of ["anthracene", "phenanthrene", "azulene", "biphenyl", "fluorene", "indene"]) {
      expect(byId.get(id)?.category).toBe("namedAromatics");
    }
  });
});
