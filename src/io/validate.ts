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
  OrbitalAnnotation,
  Point,
  ShapeAnnotation,
  TextAnnotation,
  TlcPlateAnnotation,
  TlcSpot,
  ViewTransform,
  AtomQueryProps,
  BondQueryProps,
  ReactionScheme,
  ReactionStep,
  PageSetup,
  SGroup,
} from "../types/chemistry";
import type { UserTemplate } from "../model/userTemplates";
import { PERIODIC_TABLE } from "../model/constants";
import { DEFAULT_BOND_LENGTH, DEFAULT_MARGIN_WIDTH } from "../model/pageSetup";
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
  maxReactionSchemes: 500,
  maxReactionSteps: 5_000,
  maxSgroups: 500,
  /** Largest page dimension or page origin accepted in a project file, in
   * CDXML points (about 278 inches — far past any real paper size). */
  maxPageDimension: 20_000,
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

/** Like idList, but for whole-molecule collections (an S-group can span far
 * more than 64 atoms in a polymer). */
const largeIdList: Parser<string[]> = (v) => {
  if (!Array.isArray(v) || v.length > LIMITS.maxAtoms) return BAD;
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

// Custom parsers for new fields
const stereoGroupParser: Parser<{ type: "and" | "or"; groupId: number }> = (v) => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return BAD;
  const g = v as { type: string; groupId: number };
  if (typeof g.type !== "string") return BAD;
  if (g.type !== "and" && g.type !== "or") return BAD;
  if (typeof g.groupId !== "number") return BAD;
  return { type: g.type, groupId: g.groupId };
};

const atomQueryPropsParser: Parser<AtomQueryProps> = (v) => {
  if (typeof v !== "string") return BAD;
  const p = v.toLowerCase();
  if (p === "1" || p === "2" || p === "3" || p === "1 2" || p === "1 2 3") return v as AtomQueryProps;
  if (p === "aromatic" || p === "any") return v as AtomQueryProps;
  return BAD;
};

const bondQueryPropsParser: Parser<BondQueryProps> = (v) => {
  if (typeof v !== "string") return BAD;
  const p = v.toLowerCase();
  if (p === "1" || p === "2" || p === "3" || p === "1 2" || p === "1 2 3") return { order: v } as BondQueryProps;
  if (p === "aromatic" || p === "any") return { order: "aromatic" } as BondQueryProps;
  if (p === "ring" || p === "chain" || p === "either") return { topology: p } as BondQueryProps;
  return BAD;
};

const booleanParser: Parser<boolean> = (v) => (v === "true" || v === true ? true : v === "false" || v === false ? false : BAD);

/** A plain string-to-string map (SGroup data fields), bounded so a hostile
 * project can't smuggle in an unbounded object. */
const stringRecord: Parser<Record<string, string>> = (v) => {
  if (!isPlainObject(v)) return BAD;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (key.length === 0 || key.length > 128 || typeof value !== "string" || value.length > 2_000) return BAD;
    out[key] = value;
  }
  return out;
};

const pointList: Parser<{ x: number; y: number }[]> = (v) => {
  if (!Array.isArray(v) || v.length > 64) return BAD;
  const out: { x: number; y: number }[] = [];
  for (const p of v) {
    if (!isPlainObject(p)) return BAD;
    const x = COORD(p.x);
    const y = COORD(p.y);
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
  stereoGroup: stereoGroupParser,
  queryProps: atomQueryPropsParser,
  z: integer(-LIMITS.maxCoord, LIMITS.maxCoord),
};

const ATOM_REQUIRED = ["x", "y", "element"] as const;

const BOND_SPEC: Spec<Bond> = {
  id: ID,
  a1: ID,
  a2: ID,
  order: bondOrder,
  stereo: oneOf("none", "wedge", "dash", "wavy", "bold", "boldHash", "dashed", "boldDouble", "dashedDouble", "hollowWedge"),
  doubleSide: oneOf("auto", "center", "left", "right"),
  highlightColor: hexColor,
  dative: flag,
  hollow: booleanParser,
  queryProps: bondQueryPropsParser,
};
const BOND_REQUIRED = ["a1", "a2", "order"] as const;

const HAPTIC_SPEC: Spec<HapticBond> = { id: ID, metalAtomId: ID, ringAtomIds: idList };
const HAPTIC_REQUIRED = ["metalAtomId", "ringAtomIds"] as const;

const RING_DISPLAY_SPEC: Spec<AromaticRingDisplay> = { id: ID, atomIds: idList };
const RING_DISPLAY_REQUIRED = ["atomIds"] as const;

const SGROUP_SPEC: Spec<SGroup> = {
  id: ID,
  type: oneOf("SRU", "MON", "MER", "COP", "CRO", "MOD", "GRA", "COM", "SUP", "MUL", "DAT", "ANY"),
  atomIds: largeIdList,
  bondIds: largeIdList,
  bracketStyle: oneOf("square", "curly", "round", "none"),
  bracketCoords: pointList,
  subscript: text(64),
  label: text(256),
  data: stringRecord,
  parentId: ID,
  componentIds: largeIdList,
  bracketAnnotationIds: largeIdList,
};
const SGROUP_REQUIRED = ["type", "atomIds"] as const;

const ARROW_SPEC: Spec<ArrowAnnotation> = {
  id: ID,
  kind: oneOf("arrow"),
  x1: COORD,
  y1: COORD,
  x2: COORD,
  y2: COORD,
  variant: oneOf("forward", "equilibrium", "resonance", "retrosynthetic", "curved", "curvedReverse", "dashed", "double", "bold", "openHead", "circleHead", "diamondHead", "tailed"),
  curvature: finite(-10_000, 10_000),
  barb: oneOf("full", "single"),
  headSize: oneOf("small", "medium", "large"),
  dashed: flag,
  headStyle: oneOf("full", "half", "open", "circle", "diamond", "retro"),
  tailStyle: oneOf("none", "full", "half", "open"),
  shaftStyle: oneOf("solid", "dashed", "bold", "double"),
};
const ARROW_REQUIRED = ["x1", "y1", "x2", "y2"] as const;

const BRACKET_SPEC: Spec<BracketAnnotation> = {
  id: ID,
  kind: oneOf("bracket"),
  x: COORD,
  y: COORD,
  width: SIZE,
  height: SIZE,
  variant: oneOf("paren", "square", "curly"),
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

const parsePoints = (v: unknown): Point[] => {
  if (typeof v !== "string") return [];
  const str = v as string;
  const parts = str.trim().split(/\s+/).map((p) => parseFloat(p));
  if (parts.length % 2 !== 0) return [];
  const out: Point[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    out.push({ x: parts[i], y: parts[i + 1] });
  }
  return out;
};

const SHAPE_SPEC: Spec<ShapeAnnotation> = {
  id: ID,
  kind: oneOf("shape"),
  x: COORD,
  y: COORD,
  width: SIZE,
  height: SIZE,
  variant: oneOf("rectangle", "ellipse", "line", "polygon", "arc", "curve", "polyline", "roundedRect", "triangle", "hexagon"),
  filled: flag,
  fillPattern: oneOf("solid", "hatch", "crosshatch", "dots"),
  lineStyle: oneOf("solid", "dashed", "dotted", "dashdot"),
  lineCap: oneOf("round", "square", "butt"),
  lineJoin: oneOf("miter", "round", "bevel"),
  sides: integer(3, 12),
  startAngle: finite(-360, 360),
  points: parsePoints,
};
const SHAPE_REQUIRED = ["x", "y", "width", "height"] as const;

const ORBITAL_SPEC: Spec<OrbitalAnnotation> = {
  id: ID,
  kind: oneOf("orbital"),
  x: COORD,
  y: COORD,
  size: finite(1, LIMITS.maxCoord),
  angle: finite(-3_600, 3_600),
  variant: oneOf("s", "p", "lobe"),
  filled: flag,
};
const ORBITAL_REQUIRED = ["x", "y", "size", "angle"] as const;

const TLC_SPOT_SPEC: Spec<TlcSpot> = {
  fx: finite(0, 1),
  fy: finite(0, 1),
  r: finite(0.5, 200),
  color: hexColor,
  label: text(128),
  uv: oneOf("254", "365", "both"),
  stain: oneOf("iodine", "ninhydrin", "kMnO4", "vanillin", "p-anisaldehyde", "dragendorff"),
};
const TLC_SPOT_REQUIRED = ["fx", "fy"] as const;

/** TLC spots have their own nested sanitizer (fractional coords + optional
 * size/color). A spot that fails validation is SKIPPED rather than failing
 * the whole plate — one hand-edited bad coordinate shouldn't throw away
 * twenty good measurements, and the plate itself stays intact. */
const tlcSpots: Parser<TlcSpot[]> = (v) => {
  if (!Array.isArray(v) || v.length > LIMITS.maxAnnotations) return BAD;
  const out: TlcSpot[] = [];
  for (const e of v) {
    if (!isPlainObject(e)) continue;
    const spot = parseFields<TlcSpot>(e, TLC_SPOT_SPEC, TLC_SPOT_REQUIRED, newRepairReport());
    // parseFields validates the required fx/fy are present (returns null
    // otherwise), so the cast only narrows away the optional-field noise.
    if (spot) out.push(spot as TlcSpot);
  }
  return out;
};

const parseCommaSeparatedNumbers = (v: string): number[] => {
  if (typeof v !== "string") return [];
  return v.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
};

const parseCommaSeparatedStrings = (v: string): string[] => {
  if (typeof v !== "string") return [];
  return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
};

const uvWavelengthsParser: Parser<("254" | "365")[]> = (v: unknown): ("254" | "365")[] | typeof BAD => {
  if (typeof v !== "string") return BAD;
  const wavelengths = parseCommaSeparatedNumbers(v as string);
  const valid: number[] = wavelengths.filter((w) => w === 254 || w === 365);
  if (valid.length === 0) return BAD;
  return (valid as unknown as ("254" | "365")[]);
};

const solventFrontFractionsParser: Parser<number[]> = (v) => {
  if (typeof v !== "string") return BAD;
  return parseCommaSeparatedNumbers(v);
};

const laneLabelsParser: Parser<string[]> = (v) => {
  if (typeof v !== "string") return BAD;
  return parseCommaSeparatedStrings(v);
};

const TLC_SPEC: Spec<TlcPlateAnnotation> = {
  id: ID,
  kind: oneOf("tlc"),
  x: COORD,
  y: COORD,
  width: SIZE,
  height: SIZE,
  spots: tlcSpots,
  baselineFraction: finite(0, 1),
  solventFrontFractions: solventFrontFractionsParser,
  showUV: flag,
  uvWavelengths: uvWavelengthsParser,
  stainType: oneOf("iodine", "ninhydrin", "kMnO4", "vanillin", "p-anisaldehyde", "dragendorff"),
  laneLabels: laneLabelsParser,
  laneCount: integer(1, 12),
  plateSize: oneOf("20x20", "10x10", "5x20", "custom"),
  showRfValues: flag,
};
const TLC_REQUIRED = ["x", "y", "width", "height", "spots"] as const;

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

/** Ids inside a reaction scheme are plain arrays, not record keys, but they
 * still have to be bounded and non-empty before they can be looked up. */
const reactionIdList =
  (max: number): Parser<string[]> =>
  (v) => {
    if (!Array.isArray(v) || v.length > max) return BAD;
    const out: string[] = [];
    for (const e of v) {
      if (typeof e !== "string" || e.length === 0 || e.length > LIMITS.maxIdChars) return BAD;
      out.push(e);
    }
    return out;
  };

/** Returns an id that neither this document's schemes nor a previous
 * fallback has already used, without disturbing the caller's set. Prefixed
 * so a fallback can never collide with a numeric atom/bond/annotation id. */
function freshSchemeId(used: ReadonlySet<string>, prefix: "scheme-" | "step-"): string {
  let id = `${prefix}${nextId()}`;
  while (used.has(id)) id = `${prefix}${nextId()}`;
  return id;
}

/**
 * Validates `Molecule.schemes` (ChemDraw reaction-step grouping). Scheme and
 * step ids are regenerated only when missing/duplicated; atom ids are
 * filtered to atoms that actually survived sanitization. Arrow ids are left
 * alone here — `sanitizeMolecule` has no access to the annotation map, so
 * project.ts prunes those after it has sanitized both halves of a tab.
 */
function sanitizeReactionSchemes(
  raw: unknown,
  atoms: Record<string, Atom>,
  report: RepairReport
): ReactionScheme[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new ImportValidationError("schemes: expected an array");
  if (raw.length > LIMITS.maxReactionSchemes) {
    throw new ImportValidationError(`schemes: too many entries (${raw.length} > ${LIMITS.maxReactionSchemes})`);
  }

  const usedSchemeIds = new Set<string>();
  const usedStepIds = new Set<string>();
  const out: ReactionScheme[] = [];

  for (const rawScheme of raw) {
    if (!isPlainObject(rawScheme) || !Array.isArray(rawScheme.steps)) {
      report.droppedOther++;
      continue;
    }
    if (rawScheme.steps.length > LIMITS.maxReactionSteps) {
      throw new ImportValidationError(`scheme: too many steps (${rawScheme.steps.length} > ${LIMITS.maxReactionSteps})`);
    }

    const rawSchemeId = rawScheme.id;
    const schemeId =
      typeof rawSchemeId === "string" &&
      rawSchemeId.length > 0 &&
      rawSchemeId.length <= LIMITS.maxIdChars &&
      !usedSchemeIds.has(rawSchemeId)
        ? rawSchemeId
        : freshSchemeId(usedSchemeIds, "scheme-");
    usedSchemeIds.add(schemeId);

    const steps: ReactionStep[] = [];
    for (const rawStep of rawScheme.steps) {
      if (!isPlainObject(rawStep)) {
        report.droppedOther++;
        continue;
      }
      const reactantParsed =
        rawStep.reactantAtomIds === undefined ? [] : reactionIdList(LIMITS.maxAtoms)(rawStep.reactantAtomIds);
      const productParsed =
        rawStep.productAtomIds === undefined ? [] : reactionIdList(LIMITS.maxAtoms)(rawStep.productAtomIds);
      const arrowsParsed =
        rawStep.arrowIds === undefined ? [] : reactionIdList(LIMITS.maxAnnotations)(rawStep.arrowIds);
      if (reactantParsed === BAD || productParsed === BAD || arrowsParsed === BAD) {
        report.droppedOther++;
        continue;
      }

      const reactantAtomIds = [...new Set(reactantParsed)].filter((id) => hasOwn(atoms, id));
      const productAtomIds = [...new Set(productParsed)].filter((id) => hasOwn(atoms, id));
      if (reactantAtomIds.length === 0 && productAtomIds.length === 0) {
        report.droppedOther++;
        continue;
      }

      const rawStepId = rawStep.id;
      const stepId =
        typeof rawStepId === "string" &&
        rawStepId.length > 0 &&
        rawStepId.length <= LIMITS.maxIdChars &&
        !usedStepIds.has(rawStepId)
          ? rawStepId
          : freshSchemeId(usedStepIds, "step-");
      usedStepIds.add(stepId);

      steps.push({
        id: stepId,
        reactantAtomIds,
        productAtomIds,
        arrowIds: [...new Set(arrowsParsed)],
      });
    }

    if (steps.length === 0) {
      report.droppedOther++;
      continue;
    }
    out.push({ id: schemeId, steps });
  }

  return out.length > 0 ? out : undefined;
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

  const sgroups: Record<string, SGroup> = {};
  for (const [key, value] of optionalRecordEntries(raw.sgroups, "sgroups", LIMITS.maxSgroups)) {
    const parsed = keyOk(key) ? parseFields<SGroup>(value, SGROUP_SPEC, SGROUP_REQUIRED, report) : null;
    if (!parsed) {
      report.droppedOther++;
      continue;
    }
    const atomIds = [...new Set(parsed.atomIds)].filter((id) => hasOwn(atoms, id));
    if (atomIds.length === 0) {
      report.droppedOther++;
      continue;
    }
    const clean: SGroup = { ...parsed, id: key, type: parsed.type!, atomIds };
    const bondIds = parsed.bondIds ? [...new Set(parsed.bondIds)].filter((id) => hasOwn(bonds, id)) : [];
    if (bondIds.length > 0) clean.bondIds = bondIds;
    else delete clean.bondIds;
    const componentIds = parsed.componentIds ? [...new Set(parsed.componentIds)] : [];
    if (componentIds.length > 0) clean.componentIds = componentIds;
    else delete clean.componentIds;
    const bracketAnnotationIds = parsed.bracketAnnotationIds ? [...new Set(parsed.bracketAnnotationIds)] : [];
    if (bracketAnnotationIds.length > 0) clean.bracketAnnotationIds = bracketAnnotationIds;
    else delete clean.bracketAnnotationIds;
    sgroups[key] = clean;
  }
  // A parent reference is only meaningful while that parent survived.
  for (const sg of Object.values(sgroups)) {
    if (sg.parentId && !hasOwn(sgroups, sg.parentId)) delete sg.parentId;
  }

  const schemes = sanitizeReactionSchemes(raw.schemes, atoms, report);
  return {
    atoms,
    bonds,
    hapticBonds,
    aromaticRingDisplays,
    ...(Object.keys(sgroups).length > 0 ? { sgroups } : {}),
    ...(schemes ? { schemes } : {}),
  };
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
  if (kind === "shape") {
    const p = parseFields<ShapeAnnotation>(raw, SHAPE_SPEC, SHAPE_REQUIRED, report);
    return p ? ({ variant: "rectangle", ...p, kind: "shape", id: forcedId ?? p.id ?? nextId() } as ShapeAnnotation) : null;
  }
  if (kind === "orbital") {
    const p = parseFields<OrbitalAnnotation>(raw, ORBITAL_SPEC, ORBITAL_REQUIRED, report);
    return p ? ({ variant: "p", angle: 0, ...p, kind: "orbital", id: forcedId ?? p.id ?? nextId() } as OrbitalAnnotation) : null;
  }
  if (kind === "tlc") {
    const p = parseFields<TlcPlateAnnotation>(raw, TLC_SPEC, TLC_REQUIRED, report);
    return p ? ({ spots: [], ...p, kind: "tlc", id: forcedId ?? p.id ?? nextId() } as TlcPlateAnnotation) : null;
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

/**
 * Validates a tab's PageSetup from a project file or autosave snapshot.
 *
 * A missing page is normal (every save before page setup existed) and returns
 * undefined so the caller can substitute its own default. A malformed *page
 * box* is dropped as a unit — without a usable width/height the box means
 * nothing — while an out-of-range bond length or margin falls back to
 * ChemDraw's default rather than discarding an otherwise good page.
 */
export function sanitizePageSetup(raw: unknown, report: RepairReport = newRepairReport()): PageSetup | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isPlainObject(raw)) {
    report.droppedOther++;
    return undefined;
  }

  const origin = finite(-LIMITS.maxPageDimension, LIMITS.maxPageDimension);
  const dimension = finite(50, LIMITS.maxPageDimension);
  const x = raw.x === undefined ? 0 : origin(raw.x);
  const y = raw.y === undefined ? 0 : origin(raw.y);
  const width = dimension(raw.width);
  const height = dimension(raw.height);
  if (x === BAD || y === BAD || width === BAD || height === BAD) {
    report.droppedOther++;
    return undefined;
  }

  const bondLength = raw.bondLength === undefined ? DEFAULT_BOND_LENGTH : finite(1, 1_000)(raw.bondLength);
  const marginWidth = raw.marginWidth === undefined ? DEFAULT_MARGIN_WIDTH : finite(0, 1_000)(raw.marginWidth);

  return {
    x,
    y,
    width,
    height,
    bondLength: bondLength === BAD ? DEFAULT_BOND_LENGTH : bondLength,
    marginWidth: marginWidth === BAD ? DEFAULT_MARGIN_WIDTH : marginWidth,
  };
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
