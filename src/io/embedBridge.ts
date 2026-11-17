import type { Annotation, Molecule, PageSetup, Theme } from "../types/chemistry";
import { LIMITS } from "./validate";
import { exportCdxmlDocument } from "./cdxml";
import { exportMol } from "./molfile";
import { exportSmiles } from "./smiles";
import { exportRxn, exportSdf, hasExportableReaction } from "./reactionExport";

/**
 * Embedding protocol.
 *
 * An embedding page (an ELN, a course page, the ONLYOFFICE plugin) puts the
 * editor in an `<iframe src="...?embed&origin=https://their.site">` and sends
 * `{enlacecraft: 1, id, op, args}`. The editor answers
 * `{enlacecraft: 1, id, ok: true, result}` or, on failure,
 * `{enlacecraft: 1, id, ok: false, error}`. It also posts
 * `{enlacecraft: 1, event: "ready" | "change" | "selection"}` on its own.
 *
 * The shape deliberately mirrors Reactio Draw's documented embedding API
 * (`EMBEDDING.md`) so the same kind of host code — and the ONLYOFFICE plugin
 * architecture — works against either editor. The names and payloads are
 * EnlaceCraft's own; none of that project's code is required.
 *
 * `runEmbedCommand` is pure apart from the host callbacks, which is what
 * makes the protocol testable without mounting the editor.
 */

export const EMBED_PROTOCOL = "enlacecraft";
export const EMBED_VERSION = 1;

export interface EmbedRequest {
  enlacecraft: typeof EMBED_VERSION;
  id: number;
  op: string;
  args?: Record<string, unknown>;
}

export interface EmbedSuccess {
  enlacecraft: typeof EMBED_VERSION;
  id: number;
  ok: true;
  result: unknown;
}

export interface EmbedFailure {
  enlacecraft: typeof EMBED_VERSION;
  id: number;
  ok: false;
  error: string;
}

export type EmbedReply = EmbedSuccess | EmbedFailure;

export type EmbedEventName = "ready" | "change" | "selection";

export interface EmbedEvent {
  enlacecraft: typeof EMBED_VERSION;
  event: EmbedEventName;
  ops?: string[];
}

/** Every operation the editor answers. Kept small on purpose: this is a
 * stable contract, so adding to it is cheap while changing an existing
 * answer is not. */
export const EMBED_OPS = [
  "set",
  "export",
  "picture",
  "uiTheme",
  "readOnly",
  "selection",
  "saved",
  "markSaved",
  "version",
  "help",
] as const;

export type EmbedTheme = "light" | "dark" | "gray";

export type EmbedExportFormat = "json" | "cdxml" | "svg" | "smiles" | "mol" | "sdf" | "rxn";

export interface EmbedHost {
  /** The whole project as a `.enlacecraft` JSON string (every tab). */
  documentJson(): string;
  molecule(): Molecule;
  annotations(): Annotation[];
  page(): PageSetup;
  /** Selected atom ids. */
  selection(): string[];
  /** Replaces the whole drawing. `format` is detected when omitted. */
  replace(text: string, format?: string): void;
  /** The canvas as SVG markup. */
  svg(): string;
  /** The canvas as base64 PNG, at `scale` device pixels per drawing unit. */
  png(scale: number): Promise<string>;
  setTheme(theme: Theme): void;
  getTheme(): Theme;
  setReadOnly(on: boolean): void;
  isSaved(): boolean;
  markSaved(): void;
  version(): string;
}

const THEME_MAP: Record<EmbedTheme, Theme> = {
  light: "light",
  dark: "dark",
  // ONLYOFFICE's "Gray" theme; the closest built-in look.
  gray: "slate",
};

function asString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function asNumber(value: unknown, name: string, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

function emptySheet(): never {
  // The ONLYOFFICE glue matches this wording to treat "nothing drawn" as a
  // normal cancellation rather than an error to show the user.
  throw new Error("The sheet is empty.");
}

/** Exports in the format the caller asked for, under the key the caller
 * expects (`{ svg }`, `{ cdxml }`, …). */
export function exportEmbedDocument(
  format: EmbedExportFormat,
  host: Pick<EmbedHost, "documentJson" | "molecule" | "annotations" | "page" | "svg">
): Record<string, string> {
  const molecule = host.molecule();
  switch (format) {
    case "json":
      return { json: host.documentJson() };
    case "cdxml":
      return { cdxml: exportCdxmlDocument(molecule, host.annotations(), "molecule", host.page()) };
    case "svg":
      return { svg: host.svg() };
    case "smiles": {
      const smiles = exportSmiles(molecule);
      if (!smiles) emptySheet();
      return { smiles };
    }
    case "mol": {
      if (Object.keys(molecule.atoms).length === 0) emptySheet();
      return { mol: exportMol(molecule) };
    }
    case "sdf": {
      const sdf = exportSdf(molecule);
      if (!sdf) emptySheet();
      return { sdf };
    }
    case "rxn": {
      if (!hasExportableReaction(molecule)) {
        throw new Error("The drawing has no reaction scheme.");
      }
      const rxn = exportRxn(molecule);
      if (!rxn) throw new Error("The drawing has no reaction scheme.");
      return { rxn };
    }
    default:
      throw new Error(`Unsupported export format: ${String(format)}`);
  }
}

export async function runEmbedCommand(
  op: string,
  args: Record<string, unknown>,
  host: EmbedHost
): Promise<unknown> {
  switch (op) {
    case "set": {
      const text = asString(args.text, "text");
      if (text.length > LIMITS.maxFileChars) throw new Error("The drawing is too large.");
      host.replace(text, typeof args.format === "string" ? args.format : undefined);
      return {};
    }

    case "export": {
      const format = (typeof args.format === "string" ? args.format : "json") as EmbedExportFormat;
      return exportEmbedDocument(format, host);
    }

    case "picture": {
      const scale = Math.min(8, Math.max(1, asNumber(args.scale, "scale", 3)));
      const png = await host.png(scale);
      if (!png) emptySheet();
      return { png };
    }

    case "uiTheme":
    case "setTheme": {
      const name = asString(args.theme, "theme") as EmbedTheme;
      const theme = THEME_MAP[name];
      if (!theme) throw new Error(`Unsupported theme: ${name}`);
      host.setTheme(theme);
      return { theme: name };
    }

    case "readOnly": {
      if (typeof args.on !== "boolean") throw new Error("on must be a boolean");
      host.setReadOnly(args.on);
      return { on: args.on };
    }

    case "selection": {
      const atomIds = host.selection();
      const molecule = host.molecule();
      const result: Record<string, unknown> = { atomIds, count: atomIds.length };
      if (atomIds.length > 0) {
        const only: Molecule = { ...molecule, atoms: {}, bonds: {} };
        const keep = new Set(atomIds);
        for (const [id, atom] of Object.entries(molecule.atoms)) {
          if (keep.has(id)) only.atoms[id] = atom;
        }
        for (const [id, bond] of Object.entries(molecule.bonds)) {
          if (keep.has(bond.a1) && keep.has(bond.a2)) only.bonds[id] = bond;
        }
        result.smiles = exportSmiles(only);
      }
      return result;
    }

    case "saved":
      return { saved: host.isSaved() };

    case "markSaved":
      host.markSaved();
      return { saved: true };

    case "version":
      return { name: "EnlaceCraft", version: host.version() };

    case "help":
      return { ops: [...EMBED_OPS] };

    default:
      throw new Error(`Unknown command: ${op}`);
  }
}

/** True when `data` looks like a request this protocol owns. */
export function isEmbedRequest(data: unknown): data is EmbedRequest {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.enlacecraft === EMBED_VERSION && typeof d.id === "number" && Number.isFinite(d.id) && typeof d.op === "string";
}

/** The `origin` query parameter is a comma-separated allowlist. With no
 * entry, the editor answers whoever embedded it; with entries, everyone
 * else is ignored. This is the same rule Reactio Draw documents, and it
 * matters because the editor can read and replace the drawing. */
export function embedOriginAllowed(allowed: string[], origin: string): boolean {
  if (allowed.length === 0) return true;
  return allowed.includes(origin);
}
