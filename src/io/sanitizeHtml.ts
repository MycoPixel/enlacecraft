import DOMPurify from "dompurify";
import type { Annotation } from "../types/chemistry";

/**
 * Restricts a TextAnnotation's `html` to the small subset the annotation
 * toolbar actually produces (see AnnotationToolbar.tsx and TextAnnotation's
 * own doc comment in types/chemistry.ts): bold/italic/sub/superscript, line
 * breaks, and inline font-size spans.
 *
 * MUST run on any `html` that didn't just come straight out of this app's
 * own contentEditable `onInput` handler in the current session — imported
 * project files (`io/project.ts`), restored autosave snapshots (which go
 * through the same import path), and clipboard fragments (our own private
 * MIME type, readable/writable by anything else on the system, not just
 * this app — see `hooks/useClipboard.ts`) are all untrusted input. Without
 * this, a crafted `.enlacecraft` file or clipboard payload could smuggle
 * something like `<img src=x onerror="...">` straight into the renderer-
 * context `div.innerHTML = annotation.html` write in
 * `components/Canvas/TextAnnotationView.tsx`.
 *
 * `div` is allowed alongside `br` because Chromium's contentEditable wraps
 * a typed Enter in a `<div>` by default (no `defaultParagraphSeparator`
 * override is set anywhere in this app) — without it, multi-line
 * annotations imported from an old save would visually collapse onto one
 * line. `style` is the only attribute kept (and only ever holds
 * `font-size` in practice, from the toolbar's size stepper); DOMPurify
 * still sanitizes the attribute's contents against CSS-based injection
 * (`url(...)`, `expression(...)`, etc.) even though the attribute name
 * itself is allowed.
 */
const ALLOWED_TAGS = ["b", "i", "sub", "sup", "span", "br", "div"];
const ALLOWED_ATTR = ["style"];

/**
 * The only two CSS properties the annotation toolbar (or this type's own
 * intended use — see the "font-size/color" mention in TextAnnotation's doc
 * comment in types/chemistry.ts) ever needs on a `style` attribute, each
 * with a value pattern narrow enough to rule out anything else smuggled in
 * alongside it. Matched one declaration at a time (see sanitizeStyleValue)
 * rather than trusting DOMPurify's general-purpose CSS sanitization alone:
 * a `background: url(javascript:...)` or `behavior: url(...)` payload on
 * an otherwise-allowed `style` attribute isn't reliably executable in a
 * modern browser, but there's no reason to depend on that staying true
 * rather than just not letting arbitrary CSS through in the first place.
 */
const SAFE_STYLE_DECLARATION = /^(font-size:\s*\d+(\.\d+)?(px|pt|em|rem)|color:\s*(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-zA-Z]+))$/;

function sanitizeStyleValue(value: string): string {
  return value
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => SAFE_STYLE_DECLARATION.test(decl))
    .join("; ");
}

let styleHookInstalled = false;
/** Installed once on DOMPurify's shared instance (this module is the only
 * caller, so there's no risk of these rules leaking into an unrelated
 * sanitize elsewhere) rather than per-call, since addHook has no matching
 * "add for one call only" API. */
function ensureStyleHook() {
  if (styleHookInstalled) return;
  styleHookInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName !== "style") return;
    data.attrValue = sanitizeStyleValue(data.attrValue);
    if (!data.attrValue) data.keepAttr = false;
  });
}

export function sanitizeAnnotationHtml(html: string): string {
  if (typeof html !== "string") return "";
  ensureStyleHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

/** Applies sanitizeAnnotationHtml to one annotation if it's a TextAnnotation,
 * leaving arrow/bracket annotations (which have no `html` field) untouched. */
export function sanitizeAnnotation<T extends Annotation>(annotation: T): T {
  if (annotation.kind !== "text") return annotation;
  return { ...annotation, html: sanitizeAnnotationHtml(annotation.html) };
}

/** Same as sanitizeAnnotation, applied to every value in an id-keyed
 * annotations record (the shape project files / store state use). */
export function sanitizeAnnotationsRecord(annotations: Record<string, Annotation>): Record<string, Annotation> {
  const out: Record<string, Annotation> = {};
  for (const [id, ann] of Object.entries(annotations)) out[id] = sanitizeAnnotation(ann);
  return out;
}

/** Same as sanitizeAnnotation, applied to a plain array (the shape the
 * clipboard's ClipboardFragment uses). */
export function sanitizeAnnotationList(annotations: Annotation[]): Annotation[] {
  return annotations.map(sanitizeAnnotation);
}
