import type {
  Annotation,
  ArrowAnnotation,
  AromaticRingDisplay,
  Atom,
  Bond,
  BondOrder,
  BracketAnnotation,
  Element,
  HapticBond,
  Molecule,
  TextAnnotation,
  ViewTransform,
} from "../types/chemistry";
import type { UserTemplate } from "../model/userTemplates";
import { PERIODIC_TABLE } from "../model/constants";
import { nextId } from "../model/id";
import { sanitizeAnnotationHtml } from "./sanitizeHtml";

/**
 * Validation/repair for every piece of structured data that enters the app
 * from outside this session: `.enlacecraft` project files, autosave and
 * version-history snapshots, clipboard fragments (a system-wide, writable-
 * by-anything MIME type), `.enlacebookmarks` files, saved templates read
 * back from localStorage, and the atoms a MOL/CDXML parser produced.
 *
 * Why this exists: before it, an imported molecule was only checked for
 * "is the field truthy". A bond pointing at an atom that doesn't exist made
 * exportSmiles() throw; a `__proto__` key in the annotations record rewired
 * that object's prototype; coordinates or counts of any size were accepted.
 *
 * Policy:
 *  - STRUCTURE THAT CAN'T BE MEANT (not an object, wrong container type,
 *    over the size limits) -> throw ImportValidationError. The whole file is
 *    refused rather than silently truncated.
 *  - AN INDIVIDUAL BAD ITEM (atom with a non-finite coordinate or unknown
 *    element, bond to a missing atom, out-of-range optional field) -> drop
 *    the item (or just the field, for optional ones) and count it in the
 *    RepairReport so the caller can tell the user something was skipped.
 *  - Output objects are rebuilt from a per-type field table; unknown keys
 *    are never copied, and `__proto__`/`constructor`/`prototype` are never
 *    accepted as record keys.
 *
 * The field tables below are typed as `Spec<Atom>` etc. (a mapped type that
 * requires an entry for EVERY key of the interface), so adding a field to
 * Atom/Bond/an annotation without teaching this file about it is a compile
 * error instead of a silent data-loss bug.
 */

export const LIMITS = {
  /** Max characters of a project/MOL/CDXML file (~25 MB of text). */
  maxFileChars: 25 * 1024 * 1024,
  maxTabs: 100,
  maxAtoms: 20_000,
  maxBonds: 40_000,
  maxAnnotations: 5_000,
  maxTemplates: 500,
  maxTitleChars: 200,
  maxIdChars: 128,
  maxHtmlChars: 20_000,
  /** |x|, |y| bound for anything positioned on the canvas. */
  maxCoord: 1_000_000,
} as const;

/** Thrown for structure that can't be repaired. project.ts turns it into a ProjectParseError. */
export class ImportValidationError extends Error {}

export interface RepairReport {
  droppedAtoms: number;
  droppedBonds: number;
  droppedAnnotations: number;
  /** Haptic bonds, aromatic-ring displays, templates, tabs skipped... */
  droppedOther: number;
  /** Optional fields that were present but invalid and were omitted. */
  fixedFields: number;
}

export function newRepairReport(): RepairReport {
  return { droppedAtoms: 0, droppedBonds: 0, droppedAnnotations: 0, droppedOther: 0, fixedFields: 0 };
}

/** Number of items that were discarded (the part worth telling the user about). */
export function totalDropped(r: RepairReport): number {
  return r.droppedAtoms + r.droppedBonds + r.droppedAnnotations + r.droppedOther;
}

// ---------------------------------------------------------------------------
// Field parsers
// ---------------------------------------------------------------------------

const BAD = Symbol("invalid");
type Parser<T> = (v: unknown) => T | typeof BAD;
type Spec<T> = { [K in keyof T]-?: Parser<NonNullable<T[K]>> };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

const finite =
  (min: number, max: number): Parser<number> =>
  (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : BAD;

const integer =
  (min: number, max: number): Parser<number> =>
  (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : BAD;

const text =
  (maxLen: number): Parser<string> =>
  (v) =>
    typeof v === "string" && v.length <= maxLen ? v : BAD;

const flag: Parser<boolean> = (v) => (typeof v === "boolean" ? v : BAD);

const oneOf =
  <T extends string>(...allowed: readonly T[]): Parser<T> =>
  (v) =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : BAD;

/** Highlight swatches are all `#rrggbb`; nothing else (no url(), no names) is accepted. */
const hexColor: Parser<string> = (v) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : BAD);

const COORD = finite(-LIMITS.maxCoord, LIMITS.maxCoord);
const OFFSET = finite(-10_000, 10_000);
const ID = text(LIMITS.maxIdChars);
const SIZE = finite(0, LIMITS.maxCoord);

const ELEMENTS: ReadonlySet<string> = new Set(PERIODIC_TABLE.map((e) => e.symbol));
/** True if `symbol` is a real element symbol (H..Og). */
export function isKnownElement(symbol: string): symbol is Element {
  return ELEMENTS.has(symbol);
}

const element: Parser<Element> = (v) => (typeof v === "string" && ELEMENTS.has(v) ? (v as Element) : BAD);

const bondOrder: Parser<BondOrder> = (v) => (v === 1 || v === 2 || v === 3 ? v : BAD);

const idList: Parser<string[]> = (v) => {
  if (!Array.isArray(v) || v.length > 64) return BAD;
  return v.every((e) => typeof e === "string" && e.length > 0 && e.length <= LIMITS.maxIdChars) ? (v as string[]) : BAD;
};

const lonePairOffsets: Parser<({ x: number; y: number } | null)[]> = (v) => {
  if (!Array.isArray(v) || v.length > 8) return BAD;
  const out: ({ x: number; y: number } | null)[] = [];
  for (const e of v) {
    if (e === null) {
      out.push(null);
      continue;
    }
    if (!isPlainObject(e)) return BAD;
    const x = OFFSET(e.x);
    const y = OFFSET(e.y);
    if (x === BAD || y === BAD) return BAD;
    out.push({ x, y });
  }
  return out;
};

// ---------------------------------------------------------------------------
// Field tables (one entry per interface key — enforced by the Spec<T> type)
// ---------------------------------------------------------------------------

const ATOM_SPEC: Spec<Atom> = {
  id: ID,
  x: COORD,
  y: COORD,
  element,
  charge: integer(-8, 8),
  chargeOffsetX: OFFSET,
  chargeOffsetY: OFFSET,
  lonePairs: integer(0, 4),
  lonePairOffsets,
  radical: flag,
  radicalOffsetX: OFFSET,
  radicalOffsetY: OFFSET,
  group: text(64),
  groupFormula: text(64),
  isotope: integer(1, 300),
  stereoLabel: oneOf("R", "S"),
  stereoLabelOffsetX: OFFSET,
  stereoLabelOffsetY: OFFSET,
  highlightColor: hexColor,
  mapNumber: integer(0, 9_999),
  mapNumberOffsetX: OFFSET,
  mapNumberOffsetY: OFFSET,
  ignoreValence: flag,
};
const ATOM_REQUIRED = ["x", "y", "element"] as const;

const BOND_SPEC: Spec<Bond> = {
  id: ID,
  a1: ID,
  a2: ID,
  order: bondOrder,
  stereo: oneOf("none", "wedge", "dash", "wavy"),
  doubleSide: oneOf("auto", "center", "left", "right"),
  highlightColor: hexColor,
  dative: flag,
};
const BOND_REQUIRED = ["a1", "a2", "order"] as const;

const HAPTIC_SPEC: Spec<HapticBond> = { id: ID, metalAtomId: ID, ringAtomIds: idList };
const HAPTIC_REQUIRED = ["metalAtomId", "ringAtomIds"] as const;

const RING_DISPLAY_SPEC: Spec<AromaticRingDisplay> = { id: ID, atomIds: idList };
const RING_DISPLAY_REQUIRED = ["atomIds"] as const;

const ARROW_SPEC: Spec<ArrowAnnotation> = {
  id: ID,
  kind: oneOf("arrow"),
  x1: COORD,
  y1: COORD,
  x2: COORD,
  y2: COORD,
  variant: oneOf("forward", "equilibrium", "resonance", "curved", "curvedReverse"),
  curvature: finite(-10_000, 10_000),
  barb: oneOf("full", "single"),
  headSize: oneOf("small", "medium", "large"),
};
const ARROW_REQUIRED = ["x1", "y1", "x2", "y2"] as const;

const BRACKET_SPEC: Spec<BracketAnnotation> = {
  id: ID,
  kind: oneOf("bracket"),
  x: COORD,
  y: COORD,
  width: SIZE,
  height: SIZE,
  variant: oneOf("paren", "square"),
  facing: oneOf("open", "close"),
};
const BRACKET_REQUIRED = ["x", "y", "width", "height"] as const;

const TEXT_SPEC: Spec<TextAnnotation> = {
  id: ID,
  kind: oneOf("text"),
  x: COORD,
  y: COORD,
  width: SIZE,
  height: SIZE,
  html: text(LIMITS.maxHtmlChars),
  fontSize: finite(1, 500),
};
const TEXT_REQUIRED = ["x", "y", "width", "height", "html"] as const;

/**
 * Copies only the fields named in `spec` out of `raw`, each checked by its
 * parser. Returns null if `raw` isn't an object or a `required` field is
 * missing/invalid. An invalid *optional* field is omitted and counted.
 */
function parseFields<T extends object>(
  raw: unknown,
  spec: Spec<T>,
  required: readonly (keyof T)[],
  report: RepairReport,
): Partial<T> | null {
  if (!isPlainObject(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(spec)) {
    if (!hasOwn(raw, key)) continue;
    const value = raw[key];
    if (value === undefined || value === null) continue;
    const parsed = (spec as Record<string, Parser<unknown>>)[key](value);
    if (parsed === BAD) {
      if ((required as readonly string[]).includes(key)) return null;
      report.fixedFields++;
      continue;
    }
    out[key] = parsed;
  }
  for (const key of required as readonly string[]) {
    if (out[key] === undefined) return null;
  }
  return out as Partial<T>;
}

// ---------------------------------------------------------------------------
// Records (id-keyed objects)
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
const keyOk = (k: string) => k.length > 0 && k.length <= LIMITS.maxIdChars && !FORBIDDEN_KEYS.has(k);

function recordEntries(raw: unknown, what: string, max: number): [string, unknown][] {
  if (!isPlainObject(raw)) throw new ImportValidationError(`${what}: expected an object`);
  const keys = Object.keys(raw);
  if (keys.length > max) throw new ImportValidationError(`${what}: too many entries (${keys.length} > ${max})`);
  return keys.map((k) => [k, raw[k]]);
}

function optionalRecordEntries(raw: unknown, what: string, max: number): [string, unknown][] {
  return raw === undefined || raw === null ? [] : recordEntries(raw, what, max);
}

/** Validates and rebuilds a Molecule. Throws ImportValidationError only for unrepairable structure. */
export function sanitizeMolecule(raw: unknown, report: RepairReport = newRepairReport()): Molecule {
  if (!isPlainObject(raw)) throw new ImportValidationError("molecule: expected an object");

  const atoms: Record<string, Atom> = {};
  for (const [key, value] of recordEntries(raw.atoms, "atoms", LIMITS.maxAtoms)) {
    const parsed = keyOk(key) ? parseFields<Atom>(value, ATOM_SPEC, ATOM_REQUIRED, report) : null;
    if (!parsed) {
      report.droppedAtoms++;
      continue;
    }
    atoms[key] = { charge: 0, ...parsed, id: key } as Atom;
  }

  const bonds: Record<string, Bond> = {};
  for (const [key, value] of recordEntries(raw.bonds, "bonds", LIMITS.maxBonds)) {
    const parsed = keyOk(key) ? parseFields<Bond>(value, BOND_SPEC, BOND_REQUIRED, report) : null;
    if (!parsed || parsed.a1 === parsed.a2 || !hasOwn(atoms, parsed.a1!) || !hasOwn(atoms, parsed.a2!)) {
      report.droppedBonds++;
      continue;
    }
    bonds[key] = { stereo: "none", doubleSide: "auto", ...parsed, id: key } as Bond;
  }

  const hapticBonds: Record<string, HapticBond> = {};
  for (const [key, value] of optionalRecordEntries(raw.hapticBonds, "hapticBonds", LIMITS.maxBonds)) {
    const parsed = keyOk(key) ? parseFields<HapticBond>(value, HAPTIC_SPEC, HAPTIC_REQUIRED, report) : null;
    if (!parsed || !hasOwn(atoms, parsed.metalAtomId!)) {
      report.droppedOther++;
      continue;
    }
    const ring = [...new Set(parsed.ringAtomIds!)].filter((id) => id !== parsed.metalAtomId && hasOwn(atoms, id));
    if (ring.length === 0) {
      report.droppedOther++;
      continue;
    }
    hapticBonds[key] = { id: key, metalAtomId: parsed.metalAtomId!, ringAtomIds: ring };
  }

  const aromaticRingDisplays: Record<string, AromaticRingDisplay> = {};
  for (const [key, value] of optionalRecordEntries(raw.aromaticRingDisplays, "aromaticRingDisplays", LIMITS.maxBonds)) {
    const parsed = keyOk(key) ? parseFields<AromaticRingDisplay>(value, RING_DISPLAY_SPEC, RING_DISPLAY_REQUIRED, report) : null;
    const ids = parsed ? [...new Set(parsed.atomIds!)].filter((id) => hasOwn(atoms, id)) : [];
    if (ids.length < 3) {
      report.droppedOther++;
      continue;
    }
    aromaticRingDisplays[key] = { id: key, atomIds: ids };
  }

  return { atoms, bonds, hapticBonds, aromaticRingDisplays };
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

/**
 * Validates one annotation. `forcedId` (the record key) wins over any `id`
 * inside the object; without either, a fresh id is generated. Text `html` is
 * run through DOMPurify (see sanitizeHtml.ts) — the one field that reaches
 * a raw innerHTML write.
 */
export function sanitizeAnnotation(raw: unknown, report: RepairReport, forcedId?: string): Annotation | null {
  if (!isPlainObject(raw)) return null;
  const kind = raw.kind;
  if (kind === "arrow") {
    const p = parseFields<ArrowAnnotation>(raw, ARROW_SPEC, ARROW_REQUIRED, report);
    return p ? ({ variant: "forward", ...p, kind: "arrow", id: forcedId ?? p.id ?? nextId() } as ArrowAnnotation) : null;
  }
  if (kind === "bracket") {
    const p = parseFields<BracketAnnotation>(raw, BRACKET_SPEC, BRACKET_REQUIRED, report);
    return p ? ({ variant: "square", facing: "open", ...p, kind: "bracket", id: forcedId ?? p.id ?? nextId() } as BracketAnnotation) : null;
  }
  if (kind === "text") {
    const p = parseFields<TextAnnotation>(raw, TEXT_SPEC, TEXT_REQUIRED, report);
    if (!p) return null;
    return {
      fontSize: 14,
      ...p,
      kind: "text",
      id: forcedId ?? p.id ?? nextId(),
      html: sanitizeAnnotationHtml(p.html!),
    } as TextAnnotation;
  }
  return null;
}

/** Id-keyed annotations record (the shape project files and store state use). */
export function sanitizeAnnotationRecord(raw: unknown, report: RepairReport = newRepairReport()): Record<string, Annotation> {
  const out: Record<string, Annotation> = {};
  for (const [key, value] of recordEntries(raw, "annotations", LIMITS.maxAnnotations)) {
    const ann = keyOk(key) ? sanitizeAnnotation(value, report, key) : null;
    if (!ann) {
      report.droppedAnnotations++;
      continue;
    }
    out[key] = ann;
  }
  return out;
}

/** Plain-array annotations (clipboard fragments, saved templates). */
export function sanitizeAnnotationArray(raw: unknown, report: RepairReport = newRepairReport()): Annotation[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ImportValidationError("annotations: expected an array");
  if (raw.length > LIMITS.maxAnnotations) throw new ImportValidationError(`annotations: too many entries (${raw.length})`);
  const out: Annotation[] = [];
  for (const item of raw) {
    const ann = sanitizeAnnotation(item, report);
    if (ann) out.push(ann);
    else report.droppedAnnotations++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// View, clipboard fragments, templates
// ---------------------------------------------------------------------------

/** Falls back to the app's default view (same as DEFAULT_VIEW in the store) when anything is off — scale 0 or NaN would make the canvas blank. */
export function sanitizeView(raw: unknown): ViewTransform {
  if (isPlainObject(raw)) {
    const scale = finite(0.01, 100)(raw.scale);
    const tx = finite(-10_000_000, 10_000_000)(raw.tx);
    const ty = finite(-10_000_000, 10_000_000)(raw.ty);
    if (scale !== BAD && tx !== BAD && ty !== BAD) return { scale, tx, ty };
  }
  return { scale: 1, tx: 0, ty: 0 };
}

export function sanitizeFragment(raw: unknown, report: RepairReport = newRepairReport()): { molecule: Molecule; annotations: Annotation[] } {
  if (!isPlainObject(raw)) throw new ImportValidationError("fragment: expected an object");
  return {
    molecule: sanitizeMolecule(raw.molecule, report),
    annotations: sanitizeAnnotationArray(raw.annotations, report),
  };
}

/** Never throws; malformed templates are skipped. Used for localStorage reads and .enlacebookmarks imports. */
export function sanitizeUserTemplates(raw: unknown, report: RepairReport = newRepairReport()): UserTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: UserTemplate[] = [];
  for (const item of raw.slice(0, LIMITS.maxTemplates)) {
    if (!isPlainObject(item) || typeof item.label !== "string" || item.label.trim() === "") {
      report.droppedOther++;
      continue;
    }
    try {
      const molecule = sanitizeMolecule(item.molecule, report);
      const annotations = sanitizeAnnotationArray(item.annotations, report);
      out.push({
        id: typeof item.id === "string" && item.id.length > 0 && item.id.length <= LIMITS.maxIdChars ? item.id : `t${nextId()}`,
        label: item.label.slice(0, LIMITS.maxTitleChars),
        molecule,
        annotations,
        createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      });
    } catch {
      report.droppedOther++;
    }
  }
  return out;
}

/**
 * Final pass for the MOL/CDXML parsers: rebuilds the molecule through
 * sanitizeMolecule (drops unknown fields, clamps out-of-range optional
 * fields like a 1e9 charge) and refuses the file if any ATOM had to be
 * discarded — silently dropping atoms from a structure someone opens would
 * change the chemistry (implicit hydrogens would refill the gaps).
 */
export function finalizeImportedMolecule(mol: Molecule): Molecule {
  const report = newRepairReport();
  const clean = sanitizeMolecule(mol, report);
  if (report.droppedAtoms > 0) throw new ImportValidationError("File contains atoms with invalid data");
  return clean;
}
