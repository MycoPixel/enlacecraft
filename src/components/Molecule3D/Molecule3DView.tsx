import { useEffect, useRef, useState } from "react";
import { X, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import * as $3Dmol from "3dmol";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { embedMolecule3D, Embed3DError } from "../../io/embed3d";
import { ToolButton } from "../Sidebar/ToolButton";
import { useT } from "../../i18n/useT";

// How long to wait after the last molecule edit before (re)generating the
// 3D structure. Conformer generation + MMFF94 minimisation is real work
// (tens of ms to a few hundred, depending on molecule size) — debouncing
// means a burst of edits (dragging an atom, typing a label) doesn't queue
// up dozens of redundant embeds while the user is still mid-edit.
const REGEN_DEBOUNCE_MS = 450;

type ViewState =
  | { phase: "empty" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; energyKcalMol?: number };

/**
 * Docked panel showing a computed 3D structure alongside the 2D canvas —
 * toggled via show3DView in the store (see the TopBar button that flips
 * it). Deliberately a *separate* view rather than something baked into
 * MoleculeCanvas: the 2D editor's coordinates are a drawing convenience,
 * not real geometry, so the 3D structure has to be generated fresh (see
 * io/embed3d.ts) rather than just reprojected.
 *
 * The 3Dmol.js viewer instance is created once per mount and reused for
 * every regeneration (removeAllModels + addModel), rather than tearing
 * down/recreating the WebGL context on every molecule edit.
 */
export function Molecule3DView({ onClose }: { onClose: () => void }) {
  const molecule = useMoleculeStore((s) => s.molecule);
  const theme = useMoleculeStore((s) => s.theme);
  const method = useMoleculeStore((s) => s.embed3DMethod);
  const setMethod = useMoleculeStore((s) => s.setEmbed3DMethod);
  const t = useT();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof $3Dmol.createViewer> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Generation counter guards against a slow embed for an earlier
  // molecule/method resolving after a newer one already started — only
  // the most recently *started* run is allowed to touch state/viewer.
  const runIdRef = useRef(0);

  const [state, setState] = useState<ViewState>({ phase: "empty" });

  // Create the viewer once. 3Dmol reads its container's size at creation
  // and on resize(), so this only needs the div to exist and be sized —
  // CSS gives the panel a fixed layout height, so there's no race with
  // the panel still being 0x0 on first paint.
  useEffect(() => {
    if (!containerRef.current) return;
    const viewer = $3Dmol.createViewer(containerRef.current, {
      backgroundColor: theme === "dark" ? "#1b1e24" : "#ffffff",
    });
    viewerRef.current = viewer;
    const onResize = () => viewer.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      viewerRef.current = null;
      // 3Dmol has no explicit dispose(); dropping the container (this
      // component unmounting) is what releases the WebGL context.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background follows the app theme so the panel doesn't clash with a
  // dark UI around a bright-white 3D canvas.
  useEffect(() => {
    viewerRef.current?.setBackgroundColor(theme === "dark" ? "#1b1e24" : "#ffffff", 1);
    viewerRef.current?.render();
  }, [theme]);

  const hasAtoms = Object.keys(molecule.atoms).length > 0;

  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!hasAtoms) {
      setState({ phase: "empty" });
      viewerRef.current?.removeAllModels();
      viewerRef.current?.render();
      return;
    }

    setState({ phase: "loading" });
    const thisRun = ++runIdRef.current;

    debounceRef.current = setTimeout(() => {
      embedMolecule3D(molecule, method)
        .then((result) => {
          if (runIdRef.current !== thisRun) return; // superseded by a newer edit

          const viewer = viewerRef.current;
          if (viewer) {
            viewer.removeAllModels();
            viewer.addModel(result.molfile, "mol");
            viewer.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.28 } });
            viewer.zoomTo();
            viewer.render();
          }
          setState({ phase: "ready", energyKcalMol: result.energyKcalMol });
        })
        .catch((err) => {
          if (runIdRef.current !== thisRun) return;
          viewerRef.current?.removeAllModels();
          viewerRef.current?.render();
          setState({
            phase: "error",
            message:
              err instanceof Embed3DError
                ? embed3DErrorMessage(err.code, t)
                : t("view3d.errorGeneric"),
          });
        });
    }, REGEN_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [molecule, method, hasAtoms]);

  const recenter = () => viewerRef.current?.zoomTo();

  return (
    <div className="molecule-3d-panel">
      <div className="molecule-3d-panel__header">
        <span className="molecule-3d-panel__title">{t("view3d.title")}</span>
        <div className="molecule-3d-panel__method">
          <MethodButton active={method === "quick"} onClick={() => setMethod("quick")} label={t("view3d.methodQuick")} />
          <MethodButton active={method === "mmff94"} onClick={() => setMethod("mmff94")} label={t("view3d.methodMmff94")} />
        </div>
        <div className="molecule-3d-panel__actions">
          <ToolButton title={t("view3d.recenter")} onClick={recenter}>
            <RotateCcw size={15} />
          </ToolButton>
          <ToolButton title={t("view3d.close")} onClick={onClose}>
            <X size={15} />
          </ToolButton>
        </div>
      </div>

      <div className="molecule-3d-panel__viewport" ref={containerRef}>
        {state.phase === "empty" && (
          <div className="molecule-3d-panel__overlay">{t("view3d.empty")}</div>
        )}
        {state.phase === "loading" && (
          <div className="molecule-3d-panel__overlay">
            <Loader2 size={16} className="compound-search__spinner" />
            {t("view3d.loading")}
          </div>
        )}
        {state.phase === "error" && (
          <div className="molecule-3d-panel__overlay molecule-3d-panel__overlay--error">
            <AlertTriangle size={15} />
            {state.message}
          </div>
        )}
      </div>

      <div className="molecule-3d-panel__footer">
        {state.phase === "ready" && method === "mmff94" && state.energyKcalMol !== undefined && (
          <span title={t("view3d.energyHint")}>
            {t("view3d.energy", { value: state.energyKcalMol.toFixed(1) })}
          </span>
        )}
        {state.phase === "ready" && method === "quick" && <span>{t("view3d.quickHint")}</span>}
      </div>
    </div>
  );
}

function embed3DErrorMessage(code: Embed3DError["code"], t: ReturnType<typeof useT>): string {
  switch (code) {
    case "EMPTY": return t("view3d.empty");
    case "ABBREVIATED_GROUP": return t("view3d.errorAbbreviatedGroup");
    case "DISCONNECTED_OR_UNSUPPORTED": return t("view3d.errorUnsupported");
    case "EMBED_FAILED": return t("view3d.errorEmbedFailed");
  }
}

function MethodButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`molecule-3d-panel__method-btn ${active ? "molecule-3d-panel__method-btn--active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
