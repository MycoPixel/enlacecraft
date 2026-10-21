import { Molecule as OCLMolecule } from "openchemlib";
import { importMol } from "./molfile";
import type { Molecule } from "../types/chemistry";

/**
 * SMILES *import* — the read half of `io/smiles.ts`'s write-only
 * `exportSmiles`. Parsing SMILES properly (ring closures, aromaticity,
 * stereochemistry, bracket atoms) is exactly the kind of chemistry that is
 * too easy to get subtly wrong hand-rolled, and the app already ships
 * OpenChemLib for the 3D panel and descriptors — so this bridges through it
 * instead of maintaining a second parser:
 *
 *   SMILES text → OCL `Molecule.fromSmiles` → OCL `toMolfile` (V2000, with
 *   real 2D coordinates OCL generates itself) → the *existing* `importMol`.
 *
 * The last step is the important design choice: `importMol` already
 * self-calibrates the coordinate scale, strips redundant explicit terminal
 * hydrogens, reads wedge/dash stereo codes and `M  CHG` charges, and is the
 * most battle-tested parser in the codebase (26 io test files feed it). By
 * landing in it, an imported SMILES gets exactly the same treatment as a
 * PubChem search result or a dropped .mol file — one code path, no drift.
 *
 * Stereo round-trip: OCL emits MDL stereo parity codes (1/6) from SMILES
 * `@`/`@@` chirality, which `importMol` reads back as wedge/dash bonds —
 * so `C[C@H](O)Cl` lands on the canvas as the same drawn structure a user
 * would have sketched by hand.
 */

/** Raised for any SMILES-level failure (empty input, unparseable string).
 * The message is meant for the UI status line / paste dialog, so it carries
 * a short human-readable reason, not an OCL class-name dump. */
export class SmilesImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmilesImportError";
  }
}

/**
 * Everything OCL might consider a SMILES character. Used only as a cheap
 * pre-check by `detectStructureText` (and for picking candidate tokens) —
 * real validation is OCL's job. Notably absent: whitespace (a single SMILES
 * never spans tokens) and anything XML/markup-like.
 */
const SMILES_CHARSET = /^[A-Za-z0-9@+\-[\]()=#$%/.\\*'":]+$/;

/** Upper bound on a SMILES string we're willing to hand to OCL. Real
 * molecules are a few hundred characters; anything near this is more
 * likely a pasted paragraph or a corrupted file, and OCL's parse cost is
 * superlinear enough that a megabyte of "C"s would hang the dialog. */
const MAX_SMILES_CHARS = 100_000;

/** OCL parse errors look like "Class$S18: SmilesParser: unknown element
 * label found. Position:2" — the Emscripten exception wrapper prepends a
 * class token nobody needs in a status bar. Strip it and collapse the rest
 * to the human part. */
function cleanOclError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const cleaned = raw.replace(/^Class\$\w+:\s*/, "").trim();
  return cleaned.length > 0 ? cleaned : "invalid SMILES";
}

/**
 * Pulls the SMILES candidate(s) out of arbitrary pasted/loaded text.
 *
 * Real-world SMILES text rarely arrives pristine: .smi files conventionally
 * carry one molecule per line, often as "SMILES name" or "name SMILES"
 * (PubChem's SDG "canonical SMILES" dumps, citation managers, and lecture
 * notes all mix both), and clipboard pastes pick up surrounding whitespace.
 *
 * Order matters, and it's driven by two facts: SMILES grammar itself never
 * contains whitespace, and OCL's parser is *lenient* about trailing junk —
 * `fromSmiles("CCO ethanol")` succeeds and silently returns just the CCO,
 * rather than reporting that part of the line wasn't understood. So for a
 * whitespace-containing line the charset-valid TOKENS are tried first (each
 * either genuinely parses or throws — no silent truncation), and the whole
 * line goes last purely so its OCL error message is what surfaces when
 * nothing parses. A clean single-token line behaves exactly like
 * `parse(one line)`.
 */
function smilesCandidates(text: string): string[] {
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return [];
  if (SMILES_CHARSET.test(firstLine)) return [firstLine];
  if (!/\s/.test(firstLine)) return [firstLine];
  const tokens = firstLine
    .split(/\s+/)
    .filter((t) => t.length > 0 && t.length <= MAX_SMILES_CHARS && SMILES_CHARSET.test(t));
  return [...tokens, firstLine];
}

/**
 * Parses `text` as SMILES and returns the imported molecule plus the
 * exact candidate string that succeeded (so the UI can echo back what was
 * understood — useful when a "name SMILES" line needed token-picking).
 * Throws `SmilesImportError` when nothing parses; the message reports the
 * first attempt's reason, which is the closest to what the user typed.
 */
export function importSmiles(text: string): { molecule: Molecule; smiles: string } {
  const candidates = smilesCandidates(text);
  if (candidates.length === 0) {
    throw new SmilesImportError("no SMILES text found");
  }
  let firstError: unknown = null;
  for (const candidate of candidates) {
    if (candidate.length > MAX_SMILES_CHARS) {
      if (firstError === null) firstError = new Error("SMILES text too long");
      continue;
    }
    try {
      // fromSmiles generates real 2D coordinates (OCL's internal depiction
      // layout) — no coordinate-generation step is needed on our side.
      const ocl = OCLMolecule.fromSmiles(candidate);
      // toMolfile() emits a standard V2000 block (title/program/comment/
      // counts) with parity codes for chiral centers, which importMol maps
      // to wedge/dash. Charges ride the `M  CHG` property line OCL writes.
      const molfile = ocl.toMolfile();
      return { molecule: importMol(molfile), smiles: candidate };
    } catch (err) {
      if (firstError === null) firstError = err;
      // Token attempts after a whole-line failure are expected to miss
      // (names, labels) — keep going until something parses.
    }
  }
  throw new SmilesImportError(cleanOclError(firstError));
}

/**
 * Sniffs already-read text content and guesses which parser it's for.
 * Used by two callers: the paste dialog (no filename to go on at all) and
 * file import for content-agnostic extensions like .txt, where the name
 * can't be trusted to say what's inside.
 *
 * Returns "mol" | "cdxml" | "smiles", or null when nothing matches — null
 * means "unknown", and callers decide whether to fall back to a default
 * parser (file import, preserving its old behavior) or refuse (paste
 * dialog). Deliberately *not* returned for project files: .enlacecraft is
 * dispatched by extension before sniffing ever runs.
 */
export type StructureTextKind = "mol" | "cdxml" | "smiles";

export function detectStructureText(content: string): StructureTextKind | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;
  // CDXML is XML with a fixed root element — the '<?xml' prolog alone
  // isn't proof, so look for the root tag itself (also catches prolog-less
  // fragments some tools emit).
  if (trimmed.startsWith("<?xml") || /<CDXML[\s>]/.test(trimmed)) return "cdxml";
  // A molfile's fingerprints: the counts line's format tag (V2000/V3000)
  // or the property-block terminator. Both survive every writer this app
  // targets (MDL spec, PubChem SDF, OCL, ChemDraw's own MOL export).
  if (/\bV[23]000\b/.test(trimmed) || /M  END/.test(trimmed)) return "mol";
  // SMILES: a first line of nothing but SMILES-charset characters. Permissive
  // on purpose; OCL is the real validator, this just decides *which* parser
  // to try. Two shapes pass:
  //  - any uppercase letter (every non-aromatic element symbol has one —
  //    "CCO", "C[C@H](O)Cl"), or
  //  - lowercase-only aromatic notation ("c1ccccc1") — which needs both an
  //    aromatic atom letter (b/c/n/o/p/s) AND a structural signal (ring
  //    digit, branch, bond, or bracket) so ordinary words ("ethanol",
  //    "hello") stay out while bare benzene stays in.
  const firstLine = trimmed.split(/\r?\n/, 1)[0].trim();
  if (firstLine.length > MAX_SMILES_CHARS || !SMILES_CHARSET.test(firstLine)) return null;
  if (/[A-Z]/.test(firstLine)) return "smiles";
  const aromaticish = /[bcnops]/.test(firstLine);
  const structural = /[\d()[\]#=@+$%]/.test(firstLine);
  return aromaticish && structural ? "smiles" : null;
}
