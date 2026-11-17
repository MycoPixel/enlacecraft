import { useEffect, useRef, type RefObject } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { exportProject, importProject, type ProjectTab } from "../io/project";
import { importCdxmlDocument } from "../io/cdxml";
import { importMol, importSdf } from "../io/molfile";
import { detectStructureText, importSmiles } from "../io/smilesImport";
import { exportPNGBlob, serializeExportSVG } from "../io/exportImage";
import { defaultPageSetup } from "../model/pageSetup";
import { emptyMolecule } from "../model/molecule";
import {
  EMBED_OPS,
  embedOriginAllowed,
  isEmbedRequest,
  runEmbedCommand,
  type EmbedEvent,
  type EmbedHost,
} from "../io/embedBridge";
import { APP_VERSION } from "../version";
import type { Annotation, Molecule, PageSetup, Theme } from "../types/chemistry";

const DEFAULT_VIEW = { scale: 1, tx: 0, ty: 0 };

function annotationsById(list: Annotation[]): Record<string, Annotation> {
  const out: Record<string, Annotation> = {};
  for (const annotation of list) out[annotation.id] = annotation;
  return out;
}

function tabFrom(
  molecule: Molecule,
  annotations: Record<string, Annotation>,
  page: PageSetup | undefined,
  title: string
): ProjectTab {
  return {
    id: `tab-${Date.now().toString(36)}`,
    title,
    molecule,
    annotations,
    view: DEFAULT_VIEW,
    page: page ?? defaultPageSetup(),
  };
}

/** Blob → base64 without the data: URL prefix, in chunks so a large PNG
 * doesn't blow the argument limit of String.fromCharCode. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return window.btoa(binary);
}

/** Replaces the active document from text in any format the editor reads. */
function replaceFromText(text: string, format?: string): void {
  const store = useMoleculeStore.getState();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("The drawing is empty.");

  let kind = format && format !== "auto" ? format : "";
  if (!kind) {
    if (trimmed.startsWith("{") && /"tabs"\s*:/.test(trimmed)) kind = "json";
    else if (trimmed.includes("$$$$")) kind = "sdf";
    else kind = detectStructureText(trimmed) ?? "json";
  }

  if (kind === "json") {
    const project = importProject(trimmed);
    store.loadProject({ activeTabId: project.activeTabId, tabs: project.tabs });
    return;
  }

  if (kind === "cdxml") {
    const doc = importCdxmlDocument(trimmed);
    const tab = tabFrom(doc.molecule, annotationsById(doc.annotations), doc.page, "Imported");
    store.loadProject({ activeTabId: tab.id, tabs: [tab] });
    return;
  }

  if (kind === "sdf") {
    const result = importSdf(trimmed);
    const first = result.records[0];
    if (!first) throw new Error("The drawing is empty.");
    const tab = tabFrom(first.molecule, {}, undefined, first.title || "Imported");
    store.loadProject({ activeTabId: tab.id, tabs: [tab] });
    return;
  }

  if (kind === "smiles") {
    const { molecule } = importSmiles(trimmed);
    const tab = tabFrom(molecule, {}, undefined, "Imported");
    store.loadProject({ activeTabId: tab.id, tabs: [tab] });
    return;
  }

  if (kind === "mol") {
    const tab = tabFrom(importMol(trimmed), {}, undefined, "Imported");
    store.loadProject({ activeTabId: tab.id, tabs: [tab] });
    return;
  }

  // Unknown: let the project parser produce its own, more specific error.
  const project = importProject(trimmed);
  store.loadProject({ activeTabId: project.activeTabId, tabs: project.tabs });
}

interface EmbedBridgeOptions {
  enabled: boolean;
  /** `origin` query parameter, comma-separated. Empty = answer anyone. */
  origins: string[];
}

/**
 * Wires the embedding protocol to the live editor.
 *
 * Kept out of `App.tsx` because it is a host-facing concern with its own
 * lifecycle: the listener must exist before the host's first command, must
 * stop the moment the editor unmounts, and must never answer a page that
 * wasn't allowed by `?origin=`.
 */
export function useEmbedBridge(svgRef: RefObject<SVGSVGElement | null>, { enabled, origins }: EmbedBridgeOptions) {
  // The allowlist is a mount-time decision: re-registering the listener on
  // every render would be wasteful and could drop a reply mid-flight.
  const originsRef = useRef(origins);
  useEffect(() => {
    originsRef.current = origins;
  }, [origins]);

  useEffect(() => {
    if (!enabled) return;

    const post = (message: unknown, targetOrigin: string) => {
      // `targetOrigin` is the sender's own origin, so the drawing never
      // travels to an unrelated frame that happens to share the window.
      try {
        window.parent.postMessage(message, targetOrigin === "null" ? "*" : targetOrigin);
      } catch {
        // A closed parent is not an editor error.
      }
    };

    const host: EmbedHost = {
      documentJson: () => {
        const s = useMoleculeStore.getState();
        return exportProject({ activeTabId: s.activeTabId, tabs: s.getAllTabsForSave() });
      },
      molecule: () => useMoleculeStore.getState().molecule,
      annotations: () => Object.values(useMoleculeStore.getState().annotations),
      page: () => useMoleculeStore.getState().page,
      selection: () => [...useMoleculeStore.getState().selected],
      replace: replaceFromText,
      svg: () => {
        const svg = svgRef.current;
        if (!svg) throw new Error("The canvas is not ready.");
        const s = useMoleculeStore.getState();
        const background = s.canvasBackground === "white" ? "#ffffff" : null;
        return serializeExportSVG(svg, background);
      },
      png: async (scale) => {
        const svg = svgRef.current;
        if (!svg) throw new Error("The canvas is not ready.");
        if (Object.keys(useMoleculeStore.getState().molecule.atoms).length === 0) {
          throw new Error("The sheet is empty.");
        }
        const blob = await exportPNGBlob(svg, "#ffffff", scale, 8000);
        if (!blob) throw new Error("Could not render the drawing.");
        return blobToBase64(blob);
      },
      setTheme: (theme: Theme) => useMoleculeStore.getState().setTheme(theme),
      getTheme: () => useMoleculeStore.getState().theme,
      setReadOnly: (on: boolean) => useMoleculeStore.getState().setEmbedReadOnly(on),
      isSaved: () => !useMoleculeStore.getState().hasUnsavedChanges,
      markSaved: () => useMoleculeStore.getState().markProjectSaved(),
      version: () => APP_VERSION,
    };

    const onMessage = (event: MessageEvent) => {
      if (!originsRef.current.length) {
        // No allowlist: only a real parent frame may command the editor.
        if (event.source !== window.parent) return;
      } else if (!embedOriginAllowed(originsRef.current, event.origin)) {
        return;
      }
      if (!isEmbedRequest(event.data)) return;

      const { id, op, args } = event.data;
      runEmbedCommand(op, args ?? {}, host).then(
        (result) => post({ enlacecraft: 1, id, ok: true, result }, event.origin),
        (err: unknown) =>
          post(
            { enlacecraft: 1, id, ok: false, error: err instanceof Error ? err.message : String(err) },
            event.origin
          )
      );
    };

    window.addEventListener("message", onMessage);

    // Announce once the listener is live. A timer, not requestAnimationFrame:
    // a host frame that never paints (a background tab, a plugin window behind
    // another) would otherwise never see "ready" and would wait forever.
    const readyTimer = window.setTimeout(() => {
      try {
        window.parent.postMessage(
          { enlacecraft: 1, event: "ready", ops: [...EMBED_OPS] } satisfies EmbedEvent,
          originsRef.current.length === 1 ? originsRef.current[0] : "*"
        );
      } catch {
        // no parent / opaque origin
      }
    }, 0);

    // Keep the host informed without flooding it: pointer moves and hover
    // state change the store many times per second, and only real document
    // edits should produce a change event.
    let lastMolecule: unknown = null;
    let lastAnnotations: unknown = null;
    let lastSelection: unknown = null;
    let changeTimer = 0;
    const unsubscribe = useMoleculeStore.subscribe((state) => {
      if (state.molecule !== lastMolecule || state.annotations !== lastAnnotations) {
        lastMolecule = state.molecule;
        lastAnnotations = state.annotations;
        window.clearTimeout(changeTimer);
        changeTimer = window.setTimeout(() => {
          try {
            window.parent.postMessage(
              { enlacecraft: 1, event: "change" } satisfies EmbedEvent,
              originsRef.current.length === 1 ? originsRef.current[0] : "*"
            );
          } catch {
            // ignore
          }
        }, 120);
      }
      if (state.selected !== lastSelection) {
        lastSelection = state.selected;
        try {
          window.parent.postMessage(
            { enlacecraft: 1, event: "selection" } satisfies EmbedEvent,
            originsRef.current.length === 1 ? originsRef.current[0] : "*"
          );
        } catch {
          // ignore
        }
      }
    });

    return () => {
      window.removeEventListener("message", onMessage);
      unsubscribe();
      window.clearTimeout(changeTimer);
      window.clearTimeout(readyTimer);
    };
  }, [enabled, svgRef]);
}

/** Exported for tests: the mapping from embedded text to a fresh molecule. */
export const __testing = { tabFrom, replaceFromText, annotationsById, emptyMolecule };
