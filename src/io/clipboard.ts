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
