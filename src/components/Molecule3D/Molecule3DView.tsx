import { useEffect, useRef, useState } from "react";
import { X, RotateCcw, Loader2, AlertTriangle, Ruler, Triangle, Eraser } from "lucide-react";
import * as $3Dmol from "3dmol";
import type { GLShape } from "3dmol/build/types/GLShape";
import type { Label } from "3dmol/build/types/Label";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { embedMolecule3D, Embed3DError } from "../../io/embed3d";
import { refineWithXtb, XtbRefineError } from "../../io/xtbRefine";
import { distanceAngstrom, angleDegrees, type Point3 } from "./measure";
import { ToolButton } from "../Sidebar/ToolButton";
import { useT } from "../../i18n/useT";

// How long to wait after the last molecule edit before (re)generating the
// 3D structure. Conformer generation + MMFF94 minimisation is real work
// (tens of ms to a few hundred, depending on molecule size) — debouncing
// means a burst of edits (dragging an atom, typing a label) doesn't queue
// up dozens of redundant embeds while the user is still mid-edit. The
// "xtb" method additionally waits on a network round-trip to a real
// quantum-chemistry calculation (seconds, not ms) on top of this same
// debounce — see runEmbed below.
const REGEN_DEBOUNCE_MS = 450;

// Shared accent for everything the measurement tool draws (pending-atom
// highlight spheres, distance/angle cylinders, value labels) — one
// consistent color keeps it visually distinct from the molecule's own
// element-colored sticks/spheres, and the label text itself (Å vs °)
// already disambiguates distance from angle, so there's no need for two
// different colors on top of that.
const MEASURE_COLOR = "#f5a623";

type ViewState =
  | { phase: "empty" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; method: "quick" | "mmff94" | "xtb"; energyKcalMol?: number; converged?: boolean };

type MeasureMode = "off" | "distance" | "angle";

interface PendingAtom extends Point3 {
  serial: number;
}

interface Measurement {
  id: number;
  text: string;
  shapes: GLShape[];
  label: Label;
}

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
  // Matters more than usual for "xtb", where a run can take seconds -
  // easily long enough for several more edits to happen first.
  const runIdRef = useRef(0);

  const [state, setState] = useState<ViewState>({ phase: "empty" });

  // --- Measurement tool state -------------------------------------
  // pendingRef holds atoms clicked so far for the *in-progress*
  // measurement (2 for distance, 3 for angle: atom → vertex → atom).
  // It's a ref rather than React state because it's mutated from
  // inside 3Dmol's imperative click callback, outside React's render
  // cycle — pendingCount mirrors its length purely so the hint text
  // below the buttons can re-render.
  const [measureMode, setMeasureMode] = useState<MeasureMode>("off");
  const pendingRef = useRef<PendingAtom[]>([]);
  const pendingShapesRef = useRef<GLShape[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const nextMeasurementId = useRef(1);

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

  function clearPendingMarkers() {
    const viewer = viewerRef.current;
    if (viewer) {
      for (const shape of pendingShapesRef.current) viewer.removeShape(shape);
    }
    pendingShapesRef.current = [];
    pendingRef.current = [];
    setPendingCount(0);
  }

  function clearAllMeasurements() {
    const viewer = viewerRef.current;
    clearPendingMarkers();
    if (viewer) {
      viewer.removeAllShapes();
      viewer.removeAllLabels();
      viewer.render();
    }
    setMeasurements([]);
  }

  function removeMeasurement(id: number) {
    const viewer = viewerRef.current;
    setMeasurements((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found && viewer) {
        for (const shape of found.shapes) viewer.removeShape(shape);
        viewer.removeLabel(found.label);
        viewer.render();
      }
      return prev.filter((m) => m.id !== id);
    });
  }

  function finalizeMeasurement(mode: "distance" | "angle", atoms: PendingAtom[]) {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // The pending highlight spheres get replaced by the finished
    // measurement's own cylinders/label — clear them without touching
    // pendingRef (already about to be reset by the caller).
    for (const shape of pendingShapesRef.current) viewer.removeShape(shape);
    pendingShapesRef.current = [];

    const shapes: GLShape[] = [];
    let text: string;
    let labelPos: Point3;

    if (mode === "distance") {
      const [a, b] = atoms;
      const value = distanceAngstrom(a, b);
      shapes.push(viewer.addCylinder({ start: a, end: b, radius: 0.05, dashed: true, color: MEASURE_COLOR }));
      labelPos = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      text = `${value.toFixed(2)} \u00c5`;
    } else {
      const [a, vertex, b] = atoms;
      const value = angleDegrees(a, vertex, b);
      shapes.push(viewer.addCylinder({ start: vertex, end: a, radius: 0.05, dashed: true, color: MEASURE_COLOR }));
      shapes.push(viewer.addCylinder({ start: vertex, end: b, radius: 0.05, dashed: true, color: MEASURE_COLOR }));
      labelPos = vertex;
      text = `${value.toFixed(1)}\u00b0`;
    }

    const label = viewer.addLabel(text, {
      position: labelPos,
      backgroundColor: MEASURE_COLOR,
      backgroundOpacity: 0.9,
      fontColor: "#1b1e24",
      fontSize: 12,
      borderThickness: 0,
      inFront: true,
    });

    viewer.render();
    setMeasurements((prev) => [...prev, { id: nextMeasurementId.current++, text, shapes, label }]);
  }

  // Re-registers (or clears) 3Dmol's atom click handler whenever the
  // measurement mode changes, and again every time a freshly-generated
  // model finishes loading (state.phase flips to "ready") — a new
  // addModel call needs its own clickable atoms re-bound, since they're
  // a fresh set of atom objects. onAtomClick is defined inline so its
  // closure always sees the measureMode this effect just ran with,
  // rather than a stale one from an earlier registration.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (measureMode === "off") {
      viewer.setClickable({}, false, () => {});
      viewer.render();
      return;
    }

    const needed = measureMode === "distance" ? 2 : 3;

    viewer.setClickable({}, true, (atom: PendingAtom) => {
      if (pendingRef.current.some((a) => a.serial === atom.serial)) return; // ignore re-clicking the same atom

      // Fixed radius rather than scaled to the clicked atom's own
      // element — but has to comfortably clear the *largest* rendered
      // atom sphere in the model to be visible at all, not just an
      // "average" one. The molecule's own atom spheres are each
      // element's van der Waals radius × 0.28 (see the stick/sphere
      // style below); even a big organic atom like sulfur or iodine
      // tops out well under 0.6 Å at that scale, so a 0.7 Å halo clears
      // every element actually likely to appear here — a fixed 0.35 Å
      // used to work fine for small hydrogen spheres but was fully
      // swallowed inside carbon/oxygen's larger ones, invisible.
      // Wireframe (rather than solid) keeps the underlying atom's own
      // color/shape visible through the halo instead of just painting
      // over it.
      const sphere = viewer.addSphere({
        center: atom,
        radius: 0.7,
        color: MEASURE_COLOR,
        wireframe: true,
      });
      pendingShapesRef.current.push(sphere);
      pendingRef.current.push({ serial: atom.serial, x: atom.x, y: atom.y, z: atom.z });
      setPendingCount(pendingRef.current.length);
      viewer.render();

      if (pendingRef.current.length === needed) {
        const finished = pendingRef.current;
        pendingRef.current = [];
        setPendingCount(0);
        finalizeMeasurement(measureMode, finished);
      }
    });
    // setClickable only marks the model for a rebuild internally
    // (GLModel.setClickable sets molObj = null) — the actual
    // intersection-shape geometry raycasting needs to detect clicks is
    // only regenerated on the next render(). Without this, clicks
    // silently hit nothing at all: the callback above is correctly
    // registered, but there's no clickable geometry yet for a raycast
    // to ever intersect.
    viewer.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureMode, state.phase]);

  // Switching mode (including back to "off") abandons any in-progress
  // selection rather than carrying it into the new mode — a pending
  // atom for "distance" doesn't mean anything as the start of an
  // "angle" measurement.
  function selectMeasureMode(next: MeasureMode) {
    clearPendingMarkers();
    viewerRef.current?.render();
    setMeasureMode((prev) => (prev === next ? "off" : next));
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!hasAtoms) {
      setState({ phase: "empty" });
      viewerRef.current?.removeAllModels();
      viewerRef.current?.removeAllShapes();
      viewerRef.current?.removeAllLabels();
      viewerRef.current?.render();
      pendingRef.current = [];
      pendingShapesRef.current = [];
      setPendingCount(0);
      setMeasurements([]);
      return;
    }

    setState({ phase: "loading" });
    const thisRun = ++runIdRef.current;

    debounceRef.current = setTimeout(() => {
      runEmbed(molecule, method)
        .then((result) => {
          if (runIdRef.current !== thisRun) return; // superseded by a newer edit

          const viewer = viewerRef.current;
          if (viewer) {
            viewer.removeAllModels();
            // Old measurements/pending selections reference coordinates
            // from the *previous* geometry — regenerating invalidates
            // them, so they're cleared here rather than left stale and
            // silently wrong.
            viewer.removeAllShapes();
            viewer.removeAllLabels();
            viewer.addModel(result.molfile, "mol");
            viewer.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.28 } });
            viewer.zoomTo();
            viewer.render();
          }
          pendingRef.current = [];
          pendingShapesRef.current = [];
          setPendingCount(0);
          setMeasurements([]);
          setState({
            phase: "ready",
            method,
            energyKcalMol: result.energyKcalMol,
            converged: result.converged,
          });
        })
        .catch((err) => {
          if (runIdRef.current !== thisRun) return;
          viewerRef.current?.removeAllModels();
          viewerRef.current?.removeAllShapes();
          viewerRef.current?.removeAllLabels();
          viewerRef.current?.render();
          setState({ phase: "error", message: embedErrorMessage(err, t) });
        });
    }, REGEN_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [molecule, method, hasAtoms]);

  const recenter = () => viewerRef.current?.zoomTo();

  const measureHint =
    measureMode === "distance"
      ? t("view3d.measureHintDistance", { n: pendingCount })
      : measureMode === "angle"
        ? t("view3d.measureHintAngle", { n: pendingCount })
        : null;

  return (
    <div className="molecule-3d-panel">
      <div className="molecule-3d-panel__header">
        <span className="molecule-3d-panel__title">{t("view3d.title")}</span>
        <div className="molecule-3d-panel__method">
          <MethodButton active={method === "quick"} onClick={() => setMethod("quick")} label={t("view3d.methodQuick")} />
          <MethodButton active={method === "mmff94"} onClick={() => setMethod("mmff94")} label={t("view3d.methodMmff94")} />
          <MethodButton active={method === "xtb"} onClick={() => setMethod("xtb")} label={t("view3d.methodXtb")} />
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

      <div className="molecule-3d-panel__measure-row">
        <div className="molecule-3d-panel__method">
          <ToolButton
            title={t("view3d.measureDistance")}
            active={measureMode === "distance"}
            disabled={state.phase !== "ready"}
            onClick={() => selectMeasureMode("distance")}
          >
            <Ruler size={15} />
          </ToolButton>
          <ToolButton
            title={t("view3d.measureAngle")}
            active={measureMode === "angle"}
            disabled={state.phase !== "ready"}
            onClick={() => selectMeasureMode("angle")}
          >
            <Triangle size={15} />
          </ToolButton>
        </div>
        {measureHint && <span className="molecule-3d-panel__measure-hint">{measureHint}</span>}
        {measurements.length > 0 && (
          <button type="button" className="molecule-3d-panel__measure-clear" onClick={clearAllMeasurements}>
            <Eraser size={13} />
            {t("view3d.measureClear", { n: measurements.length })}
          </button>
        )}
      </div>

      {measurements.length > 0 && (
        <ul className="molecule-3d-panel__measure-list">
          {measurements.map((m) => (
            <li key={m.id}>
              <span>{m.text}</span>
              <button type="button" onClick={() => removeMeasurement(m.id)} title={t("view3d.measureRemoveOne")}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="molecule-3d-panel__viewport" ref={containerRef}>
        {state.phase === "empty" && (
          <div className="molecule-3d-panel__overlay">{t("view3d.empty")}</div>
        )}
        {state.phase === "loading" && (
          <div className="molecule-3d-panel__overlay">
            <Loader2 size={16} className="compound-search__spinner" />
            {method === "xtb" ? t("view3d.loadingXtb") : t("view3d.loading")}
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
        {state.phase === "ready" && state.method === "quick" && <span>{t("view3d.quickHint")}</span>}
        {state.phase === "ready" && state.method === "mmff94" && state.energyKcalMol !== undefined && (
          <span title={t("view3d.energyHint")}>
            {t("view3d.energy", { value: state.energyKcalMol.toFixed(1) })}
          </span>
        )}
        {state.phase === "ready" && state.method === "xtb" && state.energyKcalMol !== undefined && (
          <span title={t("view3d.energyXtbHint")}>
            {t("view3d.energyXtb", { value: state.energyKcalMol.toFixed(1) })}
            {state.converged === false && <> — {t("view3d.notConverged")}</>}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The "xtb" method is a two-step chain rather than something
 * embedMolecule3D itself does: first get a real MMFF94-optimized
 * starting geometry entirely client-side (fast, no network dependency),
 * then send *that* to structure3d_server for GFN2-xTB refinement (see
 * io/xtbRefine.ts). Starting xtb from an already-sane geometry converges
 * faster and more reliably than handing it a bare distance-geometry
 * guess would.
 */
async function runEmbed(
  molecule: Parameters<typeof embedMolecule3D>[0],
  method: "quick" | "mmff94" | "xtb",
): Promise<{ molfile: string; energyKcalMol?: number; converged?: boolean }> {
  if (method !== "xtb") {
    return embedMolecule3D(molecule, method);
  }

  const starting = await embedMolecule3D(molecule, "mmff94");
  const totalCharge = Object.values(molecule.atoms).reduce((sum, a) => sum + a.charge, 0);
  const refined = await refineWithXtb(starting.molfile, totalCharge);
  return { molfile: refined.molfile, energyKcalMol: refined.energyKcalMol, converged: refined.converged };
}

function embedErrorMessage(err: unknown, t: ReturnType<typeof useT>): string {
  if (err instanceof Embed3DError) {
    switch (err.code) {
      case "EMPTY": return t("view3d.empty");
      case "ABBREVIATED_GROUP": return t("view3d.errorAbbreviatedGroup");
      case "DISCONNECTED_OR_UNSUPPORTED": return t("view3d.errorUnsupported");
      case "EMBED_FAILED": return t("view3d.errorEmbedFailed");
    }
  }
  if (err instanceof XtbRefineError) {
    switch (err.code) {
      case "NETWORK": return t("view3d.errorXtbNetwork");
      case "TIMEOUT": return t("view3d.errorXtbTimeout");
      case "HTTP": return t("view3d.errorXtbHttp", { status: String(err.params.status) });
    }
  }
  return t("view3d.errorGeneric");
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
