import type { Element } from "../types/chemistry";
import { ATOMIC_WEIGHT, ABBREVIATED_GROUPS } from "./constants";

/** Every element symbol the app currently recognizes — sourced from
 * ATOMIC_WEIGHT rather than duplicated here, so expanding the periodic
 * table (adding entries to ELEMENTS/ATOMIC_WEIGHT/VALENCE in constants.ts)
 * automatically expands what this parser accepts too. */
const KNOWN_ELEMENTS = new Set(Object.keys(ATOMIC_WEIGHT));

/** Registry group ids, matched case-insensitively so "ome"/"OMe"/"OME" all
 * resolve to the canonical "OMe" preset — see ABBREVIATED_GROUPS. */
const GROUP_ID_BY_LOWER = new Map(ABBREVIATED_GROUPS.map((g) => [g.id.toLowerCase(), g.id]));

/** Unicode subscript digits (₀-₉), so a label can be typed either as
 * plain "CH3" or with real subscript characters "CH₃" and parse
 * identically — display always renders the digits as subscript either
 * way (see AtomView's formatLabelWithSubscripts), so this is purely
 * about accepting either input form. */
const SUBSCRIPT_DIGITS: Record<string, string> = {
  "\u2080": "0", "\u2081": "1", "\u2082": "2", "\u2083": "3", "\u2084": "4",
  "\u2085": "5", "\u2086": "6", "\u2087": "7", "\u2088": "8", "\u2089": "9",
};

/** Unicode superscript digits/signs (⁰-⁹, ⁺, ⁻) — the conventional way to
 * hand-write a mass number ("¹³C") or a charge ("²⁺"). Normalized to
 * plain ASCII before parsing, same reasoning as SUBSCRIPT_DIGITS. */
const SUPERSCRIPT_CHARS: Record<string, string> = {
  "\u2070": "0", "\u00b9": "1", "\u00b2": "2", "\u00b3": "3", "\u2074": "4",
  "\u2075": "5", "\u2076": "6", "\u2077": "7", "\u2078": "8", "\u2079": "9",
  "\u207a": "+", "\u207b": "-",
};

function normalize(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\u2080-\u2089]/g, (d) => SUBSCRIPT_DIGITS[d] ?? d)
    .replace(/[\u2070\u00b9\u00b2\u00b3\u2074-\u2079\u207a\u207b]/g, (c) => SUPERSCRIPT_CHARS[c] ?? c);
}

export type ParsedAtomLabelCore =
  /** A single recognized element symbol ("Cl", "n") — sets the atom's
   * real `element`, same as the existing single-keystroke shortcut. */
  | { kind: "element"; element: Element }
  /** Standard isotope notation: a leading mass number then a recognized
   * element symbol ("13C", "32P", "2H") — or the two conventional bare
   * shorthands "D"/"T" for deuterium/tritium. Sets both the atom's real
   * `element` and its isotope mass number. */
  | { kind: "isotope"; element: Element; massNumber: number }
  /** Matches an ABBREVIATED_GROUPS preset id (case-insensitively) —
   * reuses the existing fixed-registry group mechanism unchanged. */
  | { kind: "presetGroup"; groupId: string }
  /** Fully tokenizes into known element symbols with more than one atom
   * total ("CH3", "COOH", "NH2", "CF3") — a condensed/custom group with
   * its own formula contribution. `formula` and `display` share the same
   * canonical-cased string. */
  | { kind: "formula"; formula: string }
  /** Doesn't parse as chemistry at all — a placeholder substituent label
   * ("R", "R'", "R''", "R1", "R2", "X", "Ar", "Nu", ...). Accepted as
   * literal text with no formula/MW contribution; flagged elsewhere via
   * model/valence.ts's isPlaceholderLabel for a warning. */
  | { kind: "generic"; text: string }
  /** Empty, or contains characters that can't reasonably be a label
   * (spaces aside, already stripped) — rejected outright rather than
   * silently guessed at. */
  | { kind: "invalid" };

/** `charge` is always present (0 when nothing was typed) and applies
 * uniformly across every kind — WYSIWYG: retyping a label without a
 * charge suffix resets the atom to neutral, same as it already resets
 * isotope/group when switching kinds. Meaningless (always 0) on
 * "invalid", which never gets applied. */
export type ParsedAtomLabel = ParsedAtomLabelCore & { charge: number };

/** Greedily tokenizes `s` into known element symbols, preferring the
 * longer of a 2-letter/1-letter match at each position (so "Cl" reads as
 * chlorine, not carbon-then-"l"), case-insensitively, each optionally
 * followed by a digit run (its count). Returns null on the first
 * character that can't start a known symbol — including a stray leading
 * digit — so a partial/garbled formula never silently parses as
 * something else. */
function tokenizeFormula(s: string): { el: Element; count: number }[] | null {
  const tokens: { el: Element; count: number }[] = [];
  let i = 0;
  while (i < s.length) {
    if (/[0-9]/.test(s[i])) return null;
    const two = s.slice(i, i + 2);
    let matched: string | null = null;
    if (two.length === 2) {
      if (KNOWN_ELEMENTS.has(two)) {
        // Typed with its real, exact case ("Cl", "Co", "Hf", ...) —
        // always honored, whatever it is.
        matched = two;
      } else if (two[1] === two[1].toLowerCase()) {
        // Casual whole-word-lowercase typing ("cl" -> Cl) is fine for
        // nearly every two-letter symbol, but a handful collide with an
        // everyday *two separate atoms* sequence — Co vs C+O (COOH!),
        // Nh vs N+H (NH2, NH4+...), Hf vs H+F (HF), Po vs P+O
        // (phosphate), and similar (see AMBIGUOUS_TWO_LETTER). For
        // those, casual lowercase input falls through to the
        // single-letter reading instead; the real element is still
        // reachable by typing its actual case or via the periodic table
        // picker, which has no such ambiguity to begin with.
        const twoCap = two[0].toUpperCase() + two[1];
        if (KNOWN_ELEMENTS.has(twoCap) && !AMBIGUOUS_TWO_LETTER.has(twoCap)) matched = twoCap;
      }
    }
    if (!matched) {
      const oneCap = s[i].toUpperCase();
      if (KNOWN_ELEMENTS.has(oneCap)) matched = oneCap;
    }
    if (!matched) return null;
    i += matched.length;
    let numStr = "";
    while (i < s.length && /[0-9]/.test(s[i])) { numStr += s[i]; i++; }
    tokens.push({ el: matched as Element, count: numStr ? parseInt(numStr, 10) : 1 });
  }
  return tokens.length > 0 ? tokens : null;
}

/** Real two-letter element symbols that collide with a sequence chemists
 * routinely type as two separate atoms — almost always the intended
 * reading is the common pair, not the (mostly obscure/synthetic, some
 * just rarely written in this exact adjacency) element: Nh/Co/Cn/No/Po
 * (amines, carbonyls/COOH, nitriles, nitroso, phosphate — all very
 * common), Hf/Bh (HF, borohydride BH4), Sn/Os/Cs/In/Ho/Sc (real,
 * reasonably common elements, but the two-atom reading is at least as
 * likely when lowercase-typed and unhelped by any other context). See
 * tokenizeFormula's case handling for how this is used — it doesn't
 * block these symbols outright, just their case-insensitive shorthand;
 * typing the real case ("Co", "Nh", ...) still reaches the element. */
const AMBIGUOUS_TWO_LETTER = new Set([
  "Nh", "Co", "Cn", "No", "Po", "Hf", "Bh", "Sn", "Os", "Cs", "In", "Ho", "Sc",
]);

/** Reads a leading isotope mass number ("13" off "13C", "125" off
 * "125I"): the element symbol immediately after the digits must be a
 * complete, exact match with nothing left over — otherwise this isn't
 * isotope notation (returns null and normal formula/generic parsing
 * takes over, so e.g. "2H2" — a formula meaning two H2 units, however
 * unlikely — isn't misread as an isotope). */
function tryLeadingIsotope(s: string): { element: Element; massNumber: number } | null {
  const m = /^([0-9]{1,3})([A-Za-z]{1,2})$/.exec(s);
  if (!m) return null;
  const [, massStr, symRaw] = m;
  const cap = symRaw.length === 2
    ? symRaw[0].toUpperCase() + symRaw[1].toLowerCase()
    : symRaw.toUpperCase();
  if (!KNOWN_ELEMENTS.has(cap)) return null;
  return { element: cap as Element, massNumber: parseInt(massStr, 10) };
}

/** A placeholder label has to at least look hand-typed on purpose: starts
 * with a letter, short, and built only from letters/digits/prime marks
 * (the conventional way to distinguish R, R', R'' ...). Anything else
 * (stray punctuation, very long input) is rejected rather than guessed
 * at — see the "invalid" case. */
const GENERIC_LABEL_RE = /^[A-Za-z][A-Za-z0-9'\u2032\u2033]{0,7}$/;

/** Strips a trailing charge notation off the end of `s` — one or more
 * repeated `+`/`-` characters ("+", "-", "++", "--", ...) — returning the
 * remainder and the signed integer it represents (0 if there wasn't
 * one). Checked before everything else parses the remainder, so charge
 * reads the same regardless of what the rest of the label turns out to
 * be — a bare element ("N+"), a formula ("NH4+", "SO4--"), or an isotope
 * ("13C+", unusual but not wrong).
 *
 * Deliberately doesn't support the "count-then-sign" charge shorthand
 * ("2+", "3-") some notations use — appended straight after a formula
 * that itself ends in a digit, it's genuinely ambiguous with the
 * formula's own trailing atom count. "N3-" has to mean azide (three
 * nitrogens, charge -1, i.e. tokenizeFormula's "N3" plus a lone trailing
 * "-") and not a hypothetical single nitride at charge -3 — repeated
 * signs ("N3--" for -2) are the unambiguous way to write anything past
 * ±1 here.
 */
function stripCharge(s: string): { rest: string; charge: number } {
  const m = /^(.*?)([+-]+)$/.exec(s);
  if (m) {
    const [, rest, signs] = m;
    if (rest) return { rest, charge: signs.length * (signs[0] === "+" ? 1 : -1) };
  }
  return { rest: s, charge: 0 };
}

export function parseAtomLabel(raw: string): ParsedAtomLabel {
  const normalized = normalize(raw);
  if (!normalized) return { kind: "invalid", charge: 0 };

  const { rest: s, charge } = stripCharge(normalized);
  if (!s) return { kind: "invalid", charge: 0 };

  if (/^d$/i.test(s)) return { kind: "isotope", element: "H", massNumber: 2, charge };
  if (/^t$/i.test(s)) return { kind: "isotope", element: "H", massNumber: 3, charge };

  const isotope = tryLeadingIsotope(s);
  if (isotope) return { kind: "isotope", element: isotope.element, massNumber: isotope.massNumber, charge };

  const presetId = GROUP_ID_BY_LOWER.get(s.toLowerCase());
  if (presetId) return { kind: "presetGroup", groupId: presetId, charge };

  const tokens = tokenizeFormula(s);
  if (tokens) {
    if (tokens.length === 1 && tokens[0].count === 1) {
      return { kind: "element", element: tokens[0].el, charge };
    }
    const formula = tokens.map((t) => t.el + (t.count > 1 ? t.count : "")).join("");
    return { kind: "formula", formula, charge };
  }

  if (GENERIC_LABEL_RE.test(s)) return { kind: "generic", text: s, charge };

  return { kind: "invalid", charge: 0 };
}
