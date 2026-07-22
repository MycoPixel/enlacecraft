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

function normalize(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\u2080-\u2089]/g, (d) => SUBSCRIPT_DIGITS[d] ?? d);
}

export type ParsedAtomLabel =
  /** A single recognized element symbol ("Cl", "n") — sets the atom's
   * real `element`, same as the existing single-keystroke shortcut. */
  | { kind: "element"; element: Element }
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
    const twoCap = two.length === 2 ? two[0].toUpperCase() + two[1].toLowerCase() : "";
    const oneCap = s[i].toUpperCase();
    let matched: string | null = null;
    if (twoCap && KNOWN_ELEMENTS.has(twoCap)) matched = twoCap;
    else if (KNOWN_ELEMENTS.has(oneCap)) matched = oneCap;
    if (!matched) return null;
    i += matched.length;
    let numStr = "";
    while (i < s.length && /[0-9]/.test(s[i])) { numStr += s[i]; i++; }
    tokens.push({ el: matched as Element, count: numStr ? parseInt(numStr, 10) : 1 });
  }
  return tokens.length > 0 ? tokens : null;
}

/** A placeholder label has to at least look hand-typed on purpose: starts
 * with a letter, short, and built only from letters/digits/prime marks
 * (the conventional way to distinguish R, R', R'' ...). Anything else
 * (stray punctuation, very long input) is rejected rather than guessed
 * at — see the "invalid" case. */
const GENERIC_LABEL_RE = /^[A-Za-z][A-Za-z0-9'\u2032\u2033]{0,7}$/;

export function parseAtomLabel(raw: string): ParsedAtomLabel {
  const s = normalize(raw);
  if (!s) return { kind: "invalid" };

  const presetId = GROUP_ID_BY_LOWER.get(s.toLowerCase());
  if (presetId) return { kind: "presetGroup", groupId: presetId };

  const tokens = tokenizeFormula(s);
  if (tokens) {
    if (tokens.length === 1 && tokens[0].count === 1) {
      return { kind: "element", element: tokens[0].el };
    }
    const formula = tokens.map((t) => t.el + (t.count > 1 ? t.count : "")).join("");
    return { kind: "formula", formula };
  }

  if (GENERIC_LABEL_RE.test(s)) return { kind: "generic", text: s };

  return { kind: "invalid" };
}
