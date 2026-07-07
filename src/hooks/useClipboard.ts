import { useEffect } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import * as M from "../model/molecule";
import { exportSelectionPNGBlob } from "../io/exportImage";
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
const CUSTOM_FORMAT = "web text/x-molsketch-fragment";

interface ClipboardFragment {
  molecule: Molecule;
  annotations: Annotation[];
}

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
 *  - Paste: look for that private format and, if present, drop the
 *    fragment onto the canvas via pasteFragment (fresh ids, offset next to
 *    whatever's already drawn). If it's absent — clipboard holds something
 *    else entirely — do nothing, rather than guessing.
 */
export function useClipboard(svgRef: React.RefObject<SVGSVGElement>) {
  const selected = useMoleculeStore((s) => s.selected);
  const molecule = useMoleculeStore((s) => s.molecule);
  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const pasteFragment = useMoleculeStore((s) => s.pasteFragment);

  useEffect(() => {
    /** Returns true if there was actually something to copy. */
    const copySelection = (): boolean => {
      const selectedAnnotations = [...selectedAnnotationIds].map((id) => annotations[id]).filter(Boolean);
      const svg = svgRef.current;
      if (!svg) return false;

      const moleculeFragment: Molecule = M.subMolecule(molecule, selected);
      if (Object.keys(moleculeFragment.atoms).length === 0 && selectedAnnotations.length === 0) return false;

      const fragment: ClipboardFragment = { molecule: moleculeFragment, annotations: selectedAnnotations };
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
          .catch((err) => {
            console.warn("Clipboard write failed", err);
          });
      }
      return true;
    };

    const pasteFromClipboard = async () => {
      if (!navigator.clipboard?.read) return;
      let items: ClipboardItems;
      try {
        items = await navigator.clipboard.read();
      } catch (err) {
        console.warn("Clipboard read failed", err);
        return;
      }
      for (const item of items) {
        if (!item.types.includes(CUSTOM_FORMAT)) continue;
        try {
          const blob = await item.getType(CUSTOM_FORMAT);
          const text = await blob.text();
          const fragment = JSON.parse(text) as ClipboardFragment;
          pasteFragment(fragment);
        } catch {
          // Present but not valid fragment JSON after all — ignore rather than throw.
        }
        return;
      }
      // Our format wasn't found — clipboard holds something else entirely; do nothing.
    };

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
  }, [selected, molecule, annotations, selectedAnnotationIds, pasteFragment, svgRef]);
}
