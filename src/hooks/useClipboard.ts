import { useCallback, useEffect } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { useT } from "../i18n/useT";
import * as M from "../model/molecule";
import { exportSelectionPNGBlob, exportSelectionSVGString, exportPNGBlob, serializeExportSVG } from "../io/exportImage";
import { writeClipboardPayload, writeClipboardText, CLIPBOARD_FRAGMENT_FORMAT, type ClipboardPayload } from "../io/clipboard";
import { nativeEditCommand, isEditableElement, type NativeEditCommand } from "../io/nativeEdit";
import { extractCdxmlFromSvg } from "../io/svgMetadata";
import { exportCdxml, importCdxml } from "../io/cdxml";
import { exportMol, exportMolV3000, importMol } from "../io/molfile";
import { exportSmiles } from "../io/smiles";
import { importSmiles, detectStructureText } from "../io/smilesImport";
import { LIMITS, sanitizeFragment } from "../io/validate";
import type { Annotation, Molecule } from "../types/chemistry";

/**
 * Chemistry MIME types the paste path understands, per the Office/ChemDraw
 * interop goal: ChemDraw writes CDXML and/or molfile flavors onto the OS
 * clipboard, and an SVG copied from this app (or any SVG with embedded
 * CDXML metadata) round-trips as editable chemistry rather than a picture.
 * Everything read from the clipboard — a system-wide shared resource — goes
 * through the same sanitizing importers as an opened file, never trusted
 * directly. Clipboard HTML is deliberately NOT read: it is the flavor most
 * often spoofed and least often useful here.
 */
const CHEMICAL_MIME_TYPES = {
  cdxml: "chemical/x-cdxml",
  molfile: "chemical/x-mdl-molfile",
  rxnfile: "chemical/x-mdl-rxnfile",
  svg: "image/svg+xml",
} as const;

/** Exported for tests: the paste path's MIME priority list (cdxml →
 * molfile → rxnfile → svg-with-metadata, then text/plain sniffing). */
export const CHEMICAL_MIME_TYPES_SUPPORTED: string[] = Object.values(CHEMICAL_MIME_TYPES);

/** The representations "Copy As" can put straight on the clipboard. */
export type CopyAsFormat = "svg" | "png" | "cdxml" | "mol" | "molV3000" | "smiles" | "inchi";

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

/** Parses pasted clipboard text through the same sanitizing importers the
 * Paste Structure dialog uses, and returns the molecule or null. The sniff
 * order matches detectStructureText: CDXML, then MOL, then SMILES. An empty
 * result (e.g. a truncated molfile the reader tolerates) counts as "not a
 * structure" — callers would refuse it anyway. */
export function parseStructureText(text: string): Molecule | null {
  const kind = detectStructureText(text);
  if (!kind) return null;
  try {
    const mol = kind === "cdxml" ? importCdxml(text) : kind === "smiles" ? importSmiles(text).molecule : importMol(text);
    return Object.keys(mol.atoms).length > 0 ? mol : null;
  } catch {
    return null;
  }
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
 *  - Copy: write every useful representation of the selected atoms/bonds
 *    and annotations at once (see io/clipboard.ts writeClipboardPayload):
 *    the private fragment JSON for editable paste back into this app, a
 *    PNG for any target app, and CDXML + MOL + SMILES in text/plain's
 *    fallback chain so chemistry-aware targets (ChemDraw, or another
 *    EnlaceCraft) get something editable rather than a picture. Also kept
 *    in an in-memory fallback (see internalClipboard) since the OS
 *    clipboard path is unreliable across browsers.
 *  - Paste: the private fragment format first; then chemistry MIME types
 *    (CDXML/molfile/RXN); then an SVG carrying embedded CDXML metadata;
 *    then plain text sniffed as CDXML/MOL/SMILES — the same pipeline as
 *    the Paste Structure dialog, so a SMILES copied out of a paper's SI
 *    pastes straight onto the canvas. If nothing parses, say so via a
 *    status message rather than doing nothing with no explanation.
 */
export function useClipboard(svgRef: React.RefObject<SVGSVGElement | null>) {
  const selected = useMoleculeStore((s) => s.selected);
  const molecule = useMoleculeStore((s) => s.molecule);
  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const pasteFragment = useMoleculeStore((s) => s.pasteFragment);
  const importCompound = useMoleculeStore((s) => s.importCompound);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const t = useT();

  const deleteSelection = useMoleculeStore((s) => s.deleteSelection);

  /** Returns true if there was actually something to copy. */
  const copySelection = useCallback((): boolean => {
    const selectedAnnotations = [...selectedAnnotationIds].map((id) => annotations[id]).filter(Boolean);
    const svg = svgRef.current;
    if (!svg) return false;

    const moleculeFragment: Molecule = M.subMolecule(molecule, selected);
    if (Object.keys(moleculeFragment.atoms).length === 0 && selectedAnnotations.length === 0) return false;

    const fragment: ClipboardFragment = { molecule: moleculeFragment, annotations: selectedAnnotations };
    internalClipboard = fragment;
    const json = JSON.stringify(fragment);
    const bondIds = new Set(Object.keys(moleculeFragment.bonds));
    const annotationIds = new Set(selectedAnnotations.map((a) => a.id));

    // Chemistry text representations of the fragment (empty when the
    // fragment has no atoms — an arrow-only copy still pastes back through
    // the private JSON, but exporting "nothing" as CDXML would be noise).
    const payload: ClipboardPayload = { json };
    if (Object.keys(moleculeFragment.atoms).length > 0) {
      try { payload.cdxml = exportCdxml(moleculeFragment); } catch { /* best effort */ }
      try { payload.molfile = exportMol(moleculeFragment); } catch { /* best effort */ }
      try { payload.smiles = exportSmiles(moleculeFragment); } catch { /* best effort */ }
    }

    // A picture goes on the clipboard too, or the copy is invisible to
    // every non-chemistry target: the electron-rich write (the packaged
    // build's preferred channel) carries exactly what this payload holds,
    // so without svg/png a desktop copy left ONLY text on the OS
    // clipboard — pasting into Word/LibreOffice/GIMP then found nothing
    // picture-shaped, which reads as "copy doesn't work outside the app".
    // Same selection-scoped framing as the fallback's PNG below.
    try { payload.svg = exportSelectionSVGString(svg, selected, bondIds, annotationIds) ?? undefined; } catch { /* best effort */ }

    void (async () => {
      try {
        payload.png = (await exportSelectionPNGBlob(svg, selected, bondIds, annotationIds, null)) ?? undefined;
      } catch { /* best effort — the text flavors are still worth writing */ }
      await writeClipboardPayload(payload);
    })().catch(async (err) => {
      console.warn("Rich copy failed; retrying with the legacy image+JSON path", err);
      // Fall back to the historical shape (PNG + private JSON) so a total
      // payload failure never leaves the user with nothing on the
      // clipboard when the PNG at least could have been written.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const pngPromise = exportSelectionPNGBlob(svg, selected, bondIds, annotationIds, null).then(
          (blob) => blob ?? new Blob([], { type: "image/png" }),
        );
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": pngPromise, [CLIPBOARD_FRAGMENT_FORMAT]: new Blob([json], { type: CLIPBOARD_FRAGMENT_FORMAT }) }),
          ]);
          return;
        } catch (err2) {
          console.warn("Clipboard write with custom format failed, retrying with image only", err2);
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
          } catch (err3) {
            console.warn("Clipboard image-only write also failed", err3);
          }
        }
      }
    });
    return true;
  }, [selected, molecule, annotations, selectedAnnotationIds, svgRef]);

  /** Canvas Cut: a normal copy followed by deleting the selection. The
   * clipboard side is identical to Ctrl+C (picture + editable chemistry);
   * deleteSelection supplies the "remove" half as one undo step. */
  const cutSelection = useCallback((): boolean => {
    const copied = copySelection();
    if (copied) deleteSelection();
    return copied;
  }, [copySelection, deleteSelection]);

  /** Imports an externally-sourced molecule as a new structure next to the
   * existing drawing (the same path the Paste dialog and PubChem results
   * take) and reports it in the status line. */
  const importExternalMolecule = useCallback((parsed: Molecule): boolean => {
    if (Object.keys(parsed.atoms).length === 0) return false;
    importCompound(parsed);
    setStatus(t("status.imported", { count: Object.keys(parsed.atoms).length }));
    return true;
  }, [importCompound, setStatus, t]);

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

    /** Reads a clipboard representation as text, with the shared size cap
     * (anything bigger than a file we'd accept is hostile). */
    const readType = async (item: ClipboardItem, type: string): Promise<string | null> => {
      if (!item.types.includes(type)) return null;
      const blob = await item.getType(type);
      if (blob.size > LIMITS.maxFileChars) throw new Error("Clipboard payload is too large");
      return blob.text();
    };

    for (const item of items) {
      // 1. Our own rich fragment — exact, already-structured, preferred.
      if (item.types.includes(CLIPBOARD_FRAGMENT_FORMAT)) {
        try {
          const text = await readType(item, CLIPBOARD_FRAGMENT_FORMAT);
          // The OS clipboard is a shared, system-wide resource — anything
          // else running on the machine (another app, another browser tab)
          // could have written this exact custom MIME type, so treat its
          // contents as untrusted, exactly like an imported file: the whole
          // fragment (atoms, bonds, annotations, html) is rebuilt through
          // io/validate.ts rather than cast and trusted.
          const fragment = sanitizeFragment(JSON.parse(text!));
          pasteFragment(fragment);
        } catch (err) {
          if (tryInternalFallback()) return;
          setStatus(t("clipboard.pasteFailed"));
          console.warn("Pasted clipboard data wasn't a valid fragment", err);
        }
        return;
      }
      // 2. Chemistry MIME flavors (ChemDraw and friends).
      for (const mime of [CHEMICAL_MIME_TYPES.cdxml, CHEMICAL_MIME_TYPES.molfile, CHEMICAL_MIME_TYPES.rxnfile]) {
        if (!item.types.includes(mime)) continue;
        try {
          const text = await readType(item, mime);
          const parsed = parseStructureText(text!);
          if (parsed && importExternalMolecule(parsed)) return;
        } catch (err) {
          console.warn(`Clipboard ${mime} failed to parse`, err);
        }
      }
      // 3. An SVG — only useful when it carries embedded CDXML metadata
      // (our own exports, or tools that preserve the block). A plain SVG
      // is a picture; importing vector paths is out of scope.
      if (item.types.includes(CHEMICAL_MIME_TYPES.svg)) {
        try {
          const svgText = await readType(item, CHEMICAL_MIME_TYPES.svg);
          const cdxml = extractCdxmlFromSvg(svgText ?? "");
          if (cdxml) {
            const parsed = importCdxml(cdxml);
            if (importExternalMolecule(parsed)) return;
          }
        } catch (err) {
          console.warn("Clipboard SVG metadata failed to parse", err);
        }
      }
      // 4. Plain text — sniffed as CDXML / MOL / SMILES by
      // detectStructureText, exactly like the Paste Structure dialog. A
      // random copied sentence simply doesn't match anything and falls
      // through to the "nothing to paste" message.
      if (item.types.includes("text/plain")) {
        try {
          const text = await readType(item, "text/plain");
          const parsed = text ? parseStructureText(text) : null;
          if (parsed && importExternalMolecule(parsed)) return;
        } catch (err) {
          console.warn("Clipboard text failed to parse as a structure", err);
        }
      }
    }
    // Nothing usable on the OS clipboard — try our own in-memory copy
    // before giving up (see internalClipboard's doc comment for why the
    // OS clipboard alone can't be relied on).
    if (tryInternalFallback()) return;
    setStatus(t("clipboard.nothingToPaste"));
  }, [pasteFragment, importExternalMolecule, setStatus, t]);

  /** Copy As handlers for the export menu / command palette (Phase 9
   * interoperability): each writes ONE deliberate representation to the
   * clipboard. SVG/PNG copy the whole canvas frame; the chemistry formats
   * copy the current atom selection and refuse (return false) when the
   * selection is empty — the menu disables them in that case, and an
   * accidental "copy everything" from a stray click would be worse than a
   * disabled entry (the download entries already export the whole canvas
   * deliberately). */
  const copyAs = useCallback(async (format: "svg" | "png" | "cdxml" | "mol" | "molV3000" | "smiles" | "inchi"): Promise<boolean> => {
    const svg = svgRef.current;
    if (format === "svg" || format === "png") {
      if (!svg) return false;
      if (format === "svg") {
        const markup = serializeExportSVG(svg, null);
        await writeClipboardPayload({ svg: markup, text: markup });
      } else {
        const blob = await exportPNGBlob(svg, null);
        if (!blob) return false;
        await writeClipboardPayload({ png: blob });
      }
      return true;
    }
    if (selected.size === 0) return false;
    const target = M.subMolecule(molecule, selected);
    if (Object.keys(target.atoms).length === 0) return false;
    if (format === "cdxml") {
      await writeClipboardText(exportCdxml(target));
    } else if (format === "mol") {
      await writeClipboardText(exportMol(target));
    } else if (format === "molV3000") {
      await writeClipboardText(exportMolV3000(target));
    } else if (format === "smiles") {
      await writeClipboardText(exportSmiles(target));
    } else {
      // InChI comes from PubChem (the local tooling doesn't generate it);
      // fails soft with the caller's status when offline.
      const { fetchInChI } = await import("../io/pubchem");
      const { inchi } = await fetchInChI(exportSmiles(target));
      await writeClipboardText(inchi);
    }
    return true;
  }, [molecule, selected, svgRef]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) {
        // The desktop Edit menu deliberately does not register its
        // accelerators (registered accelerators swallow Ctrl+C/V/X before
        // the canvas keydown handlers ever see them — see
        // electron/main.cjs), so a text field no longer gets the native
        // commands from the menu either. Forward them through the bridge:
        // Chromium's renderer on Linux/Windows has no built-in binding for
        // these either. No preventDefault — in the plain browser the
        // browser's own bindings still handle the key.
        const key = e.key.toLowerCase();
        if (e.ctrlKey || e.metaKey) {
          if (key === "c") nativeEditCommand("copy");
          else if (key === "x" && !e.shiftKey) nativeEditCommand("cut");
          else if (key === "v") nativeEditCommand("paste");
        }
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        if (copySelection()) e.preventDefault();
      } else if (key === "x" && !e.shiftKey) {
        // Canvas Cut (plain Ctrl/Cmd+X — Ctrl/Cmd+Shift+X stays with the
        // clean-reaction command in useKeyboardShortcuts).
        if (cutSelection()) e.preventDefault();
      } else if (key === "v") {
        e.preventDefault();
        void pasteFromClipboard();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [copySelection, cutSelection, pasteFromClipboard]);

  // The Edit menu's own click handlers (Alt, then Edit → Copy on
  // Linux/Windows; the menu bar on macOS) don't produce a keydown, so the
  // commands arrive over IPC instead. Routed exactly like the keys above:
  // a text-field focus gets the native command, the canvas gets the
  // app-level action. useKeyboardShortcuts subscribes to the same channel
  // for undo/redo/select-all.
  useEffect(() => {
    const bridge = typeof window === "undefined" ? undefined : window.electron;
    if (!bridge?.onEditCommand) return;
    const run = (command: NativeEditCommand): void => {
      if (isEditableElement(document.activeElement)) {
        if (command === "copy" || command === "cut" || command === "paste") nativeEditCommand(command);
        return;
      }
      if (command === "copy") copySelection();
      else if (command === "cut") cutSelection();
      else if (command === "paste") void pasteFromClipboard();
    };
    return bridge.onEditCommand(run);
  }, [copySelection, cutSelection, pasteFromClipboard]);

  // Exposed so other entry points into the same copy/paste behavior (the
  // right-click context menu) can call it directly instead of needing to
  // synthesize a fake Ctrl+C/V keydown.
  return { copySelection, pasteFromClipboard, copyAs };
}
