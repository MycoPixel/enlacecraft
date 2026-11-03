import { exportProject, importProject, type ProjectFile, type ProjectTab } from "./project";
import { LIMITS } from "./validate";

/**
 * Static, server-less read-only sharing.
 *
 * A link carries the whole drawing in its URL *fragment* (`#view=...`), so
 * the browser never sends it to a server. The payload is the same tab data
 * as a `.enlacecraft` project — molecule, annotations, view and page setup —
 * serialized with the project format and then deflated (when the browser
 * supports `CompressionStream`) so a typical scheme stays short enough to
 * paste into a message.
 *
 * The fragment is only a transport. `importProject` still sanitizes
 * everything it decodes: a hand-edited or hostile link gets the same
 * validation as an untrusted project file, including HTML sanitization for
 * annotation text.
 */

/** The hash key read by the app at startup. */
export const SHARE_HASH_KEY = "view";

/** Prefixes tell the decoder which half of the pipeline produced the bytes. */
const COMPRESSED_PREFIX = "c.";
const UNCOMPRESSED_PREFIX = "u.";

/**
 * Refuse to build links past this length. Browsers and chat clients all
 * disagree about URL limits; rather than pick a browser-specific ceiling,
 * this leaves plenty of room under the conservative 64k mark while still
 * catching the "shared a whole SDF library by accident" case with a useful
 * fallback message.
 */
export const MAX_SHARE_TOKEN_LENGTH = 48_000;

export type ShareLinkErrorCode = "too-large" | "invalid" | "unsupported" | "not-web";

export class ShareLinkError extends Error {
  readonly code: ShareLinkErrorCode;

  constructor(code: ShareLinkErrorCode, message: string) {
    super(message);
    this.name = "ShareLinkError";
    this.code = code;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  // Chunked because spreading a multi-megabyte array into fromCharCode
  // overflows the call stack in every major engine.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new ShareLinkError("invalid", "Invalid share data");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new ShareLinkError("invalid", "Invalid share data");
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(bytes as BodyInit).body;
  if (!body) throw new Error("no response stream");
  const stream = body.pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Reads an inflating stream while refusing to buffer more than `maxBytes`.
 *
 * A 48,000-character token can deflate to tens of megabytes; measuring only
 * after `arrayBuffer()` has already allocated the whole thing would let a
 * crafted link exhaust memory before the size check runs. Cancelling as soon
 * as the running total crosses the limit keeps decompression-bomb cost
 * proportional to the limit, not to the payload.
 */
async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ShareLinkError("too-large", "Shared drawing is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(bytes as BodyInit).body;
  if (!body) throw new Error("no response stream");
  const stream = body.pipeThrough(new DecompressionStream("deflate"));
  return readCapped(stream, LIMITS.maxFileChars);
}

/**
 * Encodes a project as the opaque token that goes after `#view=`.
 *
 * Compression is an optimisation, not a requirement: if the browser lacks
 * `CompressionStream` (or throws for any reason), the token falls back to
 * plain deflate-less base64. The prefix records which one was used so the
 * decoder never has to guess.
 */
export async function encodeShareProject(project: ProjectFile): Promise<string> {
  const json = exportProject(project);
  const bytes = new TextEncoder().encode(json);
  let token: string;
  if (typeof CompressionStream === "function") {
    try {
      token = COMPRESSED_PREFIX + bytesToBase64Url(await deflate(bytes));
    } catch {
      token = UNCOMPRESSED_PREFIX + bytesToBase64Url(bytes);
    }
  } else {
    token = UNCOMPRESSED_PREFIX + bytesToBase64Url(bytes);
  }
  if (token.length > MAX_SHARE_TOKEN_LENGTH) {
    throw new ShareLinkError("too-large", "Drawing is too large for a share link");
  }
  return token;
}

/** Decodes a `#view=` token back into a sanitized one-tab project. */
export async function decodeShareProject(token: string): Promise<ProjectFile> {
  if (!token) throw new ShareLinkError("invalid", "Missing share data");
  if (token.length > MAX_SHARE_TOKEN_LENGTH) {
    throw new ShareLinkError("too-large", "Share link is too large");
  }

  const compressed = token.startsWith(COMPRESSED_PREFIX);
  const prefixLength = compressed ? COMPRESSED_PREFIX.length : token.startsWith(UNCOMPRESSED_PREFIX) ? UNCOMPRESSED_PREFIX.length : 0;
  if (prefixLength === 0) throw new ShareLinkError("invalid", "Unrecognized share data");
  let bytes = base64UrlToBytes(token.slice(prefixLength));

  if (compressed) {
    if (typeof DecompressionStream !== "function") {
      throw new ShareLinkError("unsupported", "This browser cannot open compressed share links");
    }
    try {
      bytes = await inflate(bytes);
    } catch (err) {
      if (err instanceof ShareLinkError) throw err;
      throw new ShareLinkError("invalid", "Share data is corrupted");
    }
  }

  if (bytes.length > LIMITS.maxFileChars) {
    throw new ShareLinkError("too-large", "Shared drawing is too large");
  }

  let json: string;
  try {
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new ShareLinkError("invalid", "Share data is not text");
  }

  try {
    return importProject(json);
  } catch (err) {
    throw new ShareLinkError("invalid", err instanceof Error ? err.message : "Invalid shared drawing");
  }
}

/** The token after `#view=`, or null when the URL is not a share link. */
export function readShareTokenFromLocation(hash?: string): string | null {
  const raw = hash ?? (typeof window === "undefined" ? "" : window.location.hash);
  if (!raw) return null;
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  const prefix = `${SHARE_HASH_KEY}=`;
  if (!normalized.startsWith(prefix)) return null;
  const token = normalized.slice(prefix.length);
  return token.length > 0 ? token : null;
}

/** Builds the full share URL from the current app location. Any existing
 * hash is replaced, while query parameters (e.g. `embed=1`) are preserved. */
export function buildShareUrl(token: string, base?: string): string {
  const href = base ?? (typeof window === "undefined" ? "http://localhost/" : window.location.href);
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new ShareLinkError("not-web", "The app is not running at a shareable URL");
  }
  if (url.protocol === "file:") {
    throw new ShareLinkError("not-web", "Share links need the web version of EnlaceCraft");
  }
  url.hash = `${SHARE_HASH_KEY}=${token}`;
  return url.toString();
}

/** One-tab project for the drawing currently being looked at. */
export function projectForShareTab(tab: ProjectTab): ProjectFile {
  return { version: 2, activeTabId: tab.id, tabs: [tab] };
}

/**
 * Convenience path used by the Share menu: active tab -> token -> URL.
 * Separated from TopBar so the logic is testable without a DOM render.
 */
export async function createShareUrlForTab(tab: ProjectTab, base?: string): Promise<string> {
  return buildShareUrl(await encodeShareProject(projectForShareTab(tab)), base);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

/**
 * Iframe snippet for the embeddable flavour of the viewer. `embed=1` makes
 * SharedViewer hide its header and controls; the drawing itself is the same
 * read-only canvas as the share link.
 */
export async function createEmbedCodeForTab(tab: ProjectTab, base?: string, title = "EnlaceCraft"): Promise<string> {
  const url = new URL(await createShareUrlForTab(tab, base));
  url.searchParams.set("embed", "1");
  return `<iframe src="${escapeHtmlAttribute(url.toString())}" width="720" height="480" style="border:0" loading="lazy" allowfullscreen title="${escapeHtmlAttribute(title)}"></iframe>`;
}
