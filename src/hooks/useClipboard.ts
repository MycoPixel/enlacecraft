import { useCallback, useEffect } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { useT } from "../i18n/useT";
import * as M from "../model/molecule";
import { exportSelectionPNGBlob } from "../io/exportImage";
import { sanitizeAnnotationList } from "../io/sanitizeHtml";
import type { Annotation, Molecule } from "../types/chemistry";

/**
 * A private clipboard format for round-tripping a copied fragment back into
 * this app. The "web " prefix is Chrome/Electron's mechanism for custom
 * clipboard formats: browsers only expose it to code that explicitly asks
 * for this exact type, so it never shows up as generic pasteable text in
 * other apps (Word, LibreOffice, OnlyOffice, Slack, etc.) — those only ever
 * see the "image/png" entry written alongside it. An earlier version of
 * this put the fragment JSON in "text/plain" instead, which worked for
 * pasting a picture into LibreOffice (it prefers the image) but broke in
 * OnlyOffice (which prefers text/plain when both are present) — it would
 * paste the raw JSON as text instead of the image.
 */
const CUSTOM_FORMAT = "web text/x-enlacecraft-fragment";

interface ClipboardFragment {
  molecule: Molecule;
  annotations: Annotation[];
}

/**
 * In-memory fallback clipboard, alongside the real OS clipboard.
 *
 * The OS clipboard path (CUSTOM_FORMAT via the async Clipboard API) turns
 * out to be unreliable in practice across browsers in a way no amount of
 * error handling on our end can fix:
 *  - Firefox has never supported custom/arbitrary clipboard MIME types at
 *    all (only a fixed set: text/plain, text/html, image/png) — writing a
 *    ClipboardItem with our custom type either drops that entry or rejects
 *    the whole write silently, so there's simply nothing for a later paste
 *    to find, permissions aside entirely.
 *  - Some Chromium-based browsers (observed in Vivaldi) deny
 *    clipboard-read outright with no permission prompt at all, unlike
 *    Chrome/Brave/Edge which prompt the user and then work.
 * Keeping our own copy in memory means same-session copy/paste (by far the
 * common case — duplicating part of the current drawing) always works
 * regardless of any of that, while the OS clipboard remains a bonus for
 * genuinely cross-app or cross-tab pasting on browsers that support it.
 * Resets on reload, same as any other in-memory state.
 */
let internalClipboard: ClipboardFragment | null = null;

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/**
 * Copy/paste for the canvas selection.
 *
 * Driven directly off keydown for Ctrl/Cmd+C and Ctrl/Cmd+V, not the native
 * `copy`/`paste` browser events — those only fire when there's a real
 * text/DOM selection (an input's selected text, a contenteditable range,
 * etc.), and our "selection" is just internal app state (a Set of
 * atom/annotation ids), so Chromium never dispatches them here at all.
 * Calling the async Clipboard API ourselves from the keydown handler works
 * regardless.
 *
 *  - Copy: write the selected atoms/bonds *and* every selected annotation
 *    (arrow/text/bracket) as JSON under a private custom format (see
 *    CUSTOM_FORMAT above), plus a rendered PNG under the normal
 *    "image/png" — so pasting back into this app restores an editable
 *    structure, while pasting into any other app just gets a clean picture.
 *    Also always kept in an in-memory fallback (see internalClipboard)
 *    since the OS clipboard path is unreliable across browsers.
 *  - Paste: look for that private format on the OS clipboard first; if
 *    it's missing, unsupported, or blocked, fall back to the in-memory
 *    copy from the last copy in this same session. If neither has
 *    anything, say so via a status message rather than doing nothing with
 *    no explanation.
 */
export function useClipboard(svgRef: React.RefObject<SVGSVGElement | null>) {
  const selected = useMoleculeStore((s) => s.selected);
  const molecule = useMoleculeStore((s) => s.molecule);
  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const pasteFragment = useMoleculeStore((s) => s.pasteFragment);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const t = useT();

  /** Returns true if there was actually something to copy. */
  const copySelection = useCallback((): boolean => {
    const selectedAnnotations = [...selectedAnnotationIds].map((id) => annotations[id]).filter(Boolean);
    const svg = svgRef.current;
    if (!svg) return false;

    const moleculeFragment: Molecule = M.subMolecule(molecule, selected);
    if (Object.keys(moleculeFragment.atoms).length === 0 && selectedAnnotations.length === 0) return false;

    const fragment: ClipboardFragment = { molecule: moleculeFragment, annotations: selectedAnnotations };
    internalClipboard = fragment;
    const text = JSON.stringify(fragment);
    const bondIds = new Set(Object.keys(moleculeFragment.bonds));
    const annotationIds = new Set(selectedAnnotations.map((a) => a.id));

    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const pngPromise = exportSelectionPNGBlob(svg, selected, bondIds, annotationIds, null).then(
        (blob) => blob ?? new Blob([], { type: "image/png" })
      );
      navigator.clipboard
        .write([
          new ClipboardItem({
            "image/png": pngPromise,
            [CUSTOM_FORMAT]: new Blob([text], { type: CUSTOM_FORMAT }),
          }),
        ])
        .catch(async (err) => {
          // Some browsers reject the *entire* write() call if they don't
          // recognize one of a ClipboardItem's representations — Firefox
          // in particular only accepts a short fixed whitelist of MIME
          // types (see internalClipboard's doc comment), so bundling our
          // custom format in with the image can take the image down with
          // it, breaking even pasting into another app. Retry with just
          // the image alone so that still works even when the custom
          // format doesn't.
          console.warn("Clipboard write with custom format failed, retrying with image only", err);
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
          } catch (err2) {
            console.warn("Clipboard image-only write also failed", err2);
          }
        });
    }
    return true;
  }, [selected, molecule, annotations, selectedAnnotationIds, svgRef]);

  const pasteFromClipboard = useCallback(async () => {
    /** Tries the in-memory fallback; returns whether it actually pasted something. */
    const tryInternalFallback = (): boolean => {
      if (!internalClipboard) return false;
      pasteFragment(internalClipboard);
      return true;
    };

    if (!navigator.clipboard?.read) {
      // Notably: Firefox has never implemented reading (or, as it turns
      // out, writing) arbitrary clipboard formats — see
      // internalClipboard's doc comment for why that's exactly what the
      // fallback below is for.
      if (!tryInternalFallback()) setStatus(t("clipboard.readUnsupported"));
      return;
    }

    // A very common real-world cause of clipboard.read() rejecting is
    // simply that the document/window doesn't have focus yet — e.g.
    // right after switching back to an installed PWA window. Nudge focus
    // first rather than immediately failing on something self-correctable.
    if (!document.hasFocus()) {
      window.focus();
    }

    let items: ClipboardItems;
    try {
      items = await navigator.clipboard.read();
    } catch (err) {
      if (tryInternalFallback()) return;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setStatus(t("clipboard.permissionDenied"));
      } else if (!document.hasFocus()) {
        setStatus(t("clipboard.notFocused"));
      } else {
        setStatus(t("clipboard.readFailed"));
      }
      console.warn("Clipboard read failed", err);
      return;
    }

    for (const item of items) {
      if (!item.types.includes(CUSTOM_FORMAT)) continue;
      try {
        const blob = await item.getType(CUSTOM_FORMAT);
        const text = await blob.text();
        const fragment = JSON.parse(text) as ClipboardFragment;
        // The OS clipboard is a shared, system-wide resource — anything
        // else running on the machine (another app, another browser tab)
        // could have written this exact custom MIME type, so treat its
        // contents as untrusted the same way importProject() does for a
        // file. See io/sanitizeHtml.ts's doc comment for what this guards
        // against.
        fragment.annotations = sanitizeAnnotationList(fragment.annotations);
        pasteFragment(fragment);
      } catch (err) {
        if (tryInternalFallback()) return;
        setStatus(t("clipboard.pasteFailed"));
        console.warn("Pasted clipboard data wasn't a valid fragment", err);
      }
      return;
    }
    // Our format wasn't found on the OS clipboard — try our own
    // in-memory copy before giving up (see internalClipboard's doc
    // comment for why the OS clipboard alone can't be relied on).
    if (tryInternalFallback()) return;
    setStatus(t("clipboard.nothingToPaste"));
  }, [pasteFragment, setStatus, t]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        if (copySelection()) e.preventDefault();
      } else if (key === "v") {
        e.preventDefault();
        void pasteFromClipboard();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [copySelection, pasteFromClipboard]);

  // Exposed so other entry points into the same copy/paste behavior (the
  // right-click context menu) can call it directly instead of needing to
  // synthesize a fake Ctrl+C/V keydown.
  return { copySelection, pasteFromClipboard };
}
