/**
 * Text clipboard writes that work in both the web and desktop builds.
 *
 * `navigator.clipboard.writeText` is the normal path, but it is not always
 * available or permitted:
 *
 *  - The packaged Electron app runs from a `file:` URL. Chromium exposes the
 *    async Clipboard API there, but a failed focus/permission check can make
 *    every write reject even though the app's permission handler allows it.
 *    The preload bridge therefore offers a native write through Electron's
 *    main process, which is what the OS clipboard menu itself uses.
 *  - Some browsers and embedded webviews do not expose the async API at all.
 *    `document.execCommand("copy")` is deprecated but still the only
 *    synchronous fallback in a real user gesture, and a click handler is
 *    exactly that.
 *
 * Callers still own the final fallback (downloading a file), so a thrown
 * error here means "the clipboard really was not usable".
 */
export async function writeClipboardText(text: string): Promise<void> {
  const bridge = typeof window === "undefined" ? undefined : window.electron;
  if (bridge?.writeClipboardText) {
    const written = await bridge.writeClipboardText(text);
    if (written) return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path rather than giving up: a denied
      // permission does not always mean the user cannot copy.
    }
  }

  if (!legacyCopy(text)) throw new Error("Clipboard is not available");
}

/**
 * The private clipboard format EnlaceCraft uses to round-trip a copied
 * fragment back into itself (JSON, sanitized on paste). Lives here rather
 * than in the useClipboard hook so both the copy side and the paste side —
 * and the tests — agree on the exact type string. See useClipboard.ts for
 * why the "web " prefix exists (Chrome/Electron's custom-format mechanism).
 */
export const CLIPBOARD_FRAGMENT_FORMAT = "web text/x-enlacecraft-fragment";

/** Everything a "Copy" can offer the OS clipboard, per representation.
 * Every field is optional; writeClipboardPayload writes whichever ones are
 * present through the best channel available. */
export interface ClipboardPayload {
  /** Full SVG markup — carried as text/html (an <img> with a data: URI, so
   * Word/PowerPoint/LibreOffice paste it as a picture) and, where the
   * browser allows it, as image/svg+xml. */
  svg?: string;
  /** Raster fallback — the representation every target app accepts. */
  png?: Blob;
  /** Chemical markup, for chemistry-aware paste targets (ChemDraw reads
   * CDXML straight off the clipboard). */
  cdxml?: string;
  /** MDL molfile (V2000 or V3000). */
  molfile?: string;
  /** Daylight SMILES. */
  smiles?: string;
  /** What lands in text/plain. Defaults to cdxml → molfile → smiles, so a
   * chemistry-aware target (or another EnlaceCraft instance) gets something
   * editable rather than a picture. */
  text?: string;
  /** The private EnlaceCraft fragment JSON (see
   * CLIPBOARD_FRAGMENT_FORMAT) for app-to-app editable paste. */
  json?: string;
}

export type ClipboardWriteResult = "electron-rich" | "web-rich" | "png" | "text";

/** Wraps SVG markup in an HTML <img> with a base64 data URI — the fallback
 * HTML flavor when no PNG could be produced (Word/PowerPoint support for
 * SVG data URIs is unreliable; LibreOffice and browsers render them). */
function svgToHtmlImg(svg: string): string {
  const encoded = window.btoa(unescape(encodeURIComponent(svg)));
  return `<img alt="chemistry drawing" src="data:image/svg+xml;base64,${encoded}">`;
}

/** Wraps raw PNG bytes in the same shape — the picture flavor every paste
 * target renders. Office's HTML importer (Word 2016/2019 in particular)
 * commonly shows an empty frame for SVG data-URI images, which reads as
 * "paste did nothing", while a base64 PNG <img> is what Word, PowerPoint,
 * LibreOffice, OnlyOffice and Google Docs all render from a clipboard
 * paste. Bytes are base64'd in 32k chunks because String.fromCharCode on a
 * whole multi-hundred-KB raster blows the argument limit. */
function pngBytesToHtmlImg(png: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < png.length; i += CHUNK) {
    binary += String.fromCharCode(...png.subarray(i, i + CHUNK));
  }
  return `<img alt="chemistry drawing" src="data:image/png;base64,${window.btoa(binary)}">`;
}

/**
 * Writes a rich copy payload: as many representations as the platform
 * allows, with graceful degradation.
 *
 * Channel order (each falls back to the next):
 *  1. Electron's native clipboard (`clipboard:write-rich`) in the packaged
 *     build — it can carry text + HTML + a bitmap across all platforms,
 *     which the web async API cannot guarantee.
 *  2. One ClipboardItem with every standard web representation at once
 *     (image/png, text/html, text/plain). Non-standard types are left out
 *     because Firefox rejects the whole write() if it doesn't recognize a
 *     type — the same reason the private fragment format historically
 *     broke image copies (see useClipboard.ts). On failure, retry with
 *     PNG alone, then text alone.
 *  3. writeClipboardText (Electron bridge → async API → execCommand) with
 *     the text representation.
 *
 * Callers own the final fallback beyond that (e.g. downloading a file).
 */
export async function writeClipboardPayload(payload: ClipboardPayload): Promise<ClipboardWriteResult> {
  const text = payload.text ?? payload.cdxml ?? payload.molfile ?? payload.smiles ?? "";

  // The PNG bytes, read once — they feed both the native bitmap flavor and
  // the HTML flavor below.
  let pngBytes: Uint8Array | undefined;
  if (payload.png) {
    try {
      pngBytes = new Uint8Array(await payload.png.arrayBuffer());
    } catch {
      pngBytes = undefined;
    }
  }

  // The HTML flavor: a base64 PNG <img> whenever the payload has a bitmap —
  // the one picture flavor Word, PowerPoint, LibreOffice and OnlyOffice all
  // render from a paste — falling back to the SVG data URI only when no PNG
  // could be produced. (Regression context: this flavor used to always
  // carry the SVG; Word 2016/2019 pasted that as an empty frame, which read
  // as "copying to Word does nothing at all".)
  let html: string | undefined;
  if (pngBytes) html = pngBytesToHtmlImg(pngBytes);
  else if (payload.svg) html = svgToHtmlImg(payload.svg);

  const bridge = typeof window === "undefined" ? undefined : window.electron;
  if (bridge?.writeClipboardRich) {
    try {
      const written = await bridge.writeClipboardRich({
        text: text || undefined,
        html,
        png: pngBytes,
      });
      if (written) return "electron-rich";
    } catch {
      // Fall through to the web paths.
    }
  }

  if (typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && navigator.clipboard?.write) {
    const representations: Record<string, Blob | Promise<Blob>> = {};
    if (payload.png) representations["image/png"] = payload.png;
    if (html) representations["text/html"] = new Blob([html], { type: "text/html" });
    if (text) representations["text/plain"] = new Blob([text], { type: "text/plain" });
    if (payload.json) representations[CLIPBOARD_FRAGMENT_FORMAT] = new Blob([payload.json], { type: CLIPBOARD_FRAGMENT_FORMAT });

    if (Object.keys(representations).length > 0) {
      try {
        await navigator.clipboard.write([new ClipboardItem(representations)]);
        return "web-rich";
      } catch (err) {
        console.warn("Rich clipboard write failed; retrying with fewer representations", err);
        // PNG alone is the most universally accepted picture flavor.
        if (payload.png) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": payload.png })]);
            return "png";
          } catch (err2) {
            console.warn("Clipboard PNG-only write failed", err2);
          }
        }
      }
    }
  }

  if (text) {
    await writeClipboardText(text);
    return "text";
  }
  throw new Error("Clipboard is not available");
}

/**
 * Synchronous fallback for browsers without the async Clipboard API. A
 * temporary off-screen textarea is selected and copied through the browser's
 * own copy command, then removed. Returns false if the command was refused.
 */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
