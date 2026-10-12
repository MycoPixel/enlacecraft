import { useEffect, useRef, useState } from "react";
import { X, RotateCcw, Loader2, AlertTriangle, Ruler, Triangle, Eraser, Rotate3d, Activity, Play, Pause, Repeat, Download, Palette, Shuffle, Link2, Upload } from "lucide-react";
import * as $3Dmol from "3dmol";
import type { GLShape } from "3dmol/build/types/GLShape";
import type { Label } from "3dmol/build/types/Label";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { embedMolecule3DWithMethod, refineStructure3D, mmff94SinglePointEnergy, Embed3DError } from "../../io/embed3d";
import type { Embed3DMethod } from "../../io/embed3d";
import { XtbRefineError } from "../../io/xtbRefine";
import { exportXyz } from "../../io/xyz";
import { downloadBlob } from "../../io/exportImage";
import { distanceAngstrom, angleDegrees, type Point3 } from "./measure";
import { parseV2000, serializeV2000, findRotatableHalf, rotateHalf, type XyzAtom, type XyzBond } from "./rotateBond";
import { scanTorsion, summarizeTorsionScan, type TorsionPoint, type TorsionSummary } from "./torsionScan";
import { TorsionEnergyChart } from "./TorsionEnergyChart";
import { atomIdForSerial, buildSerialToAtomId } from "./atomLink";
import { importStructure3D } from "../../io/importStructure3d";
import {
  buildStructureStyle,
  STRUCTURE3D_STYLES,
  STRUCTURE3D_COLOR_SCHEMES,
  styleLabelKey,
  colorLabelKey,
  type Structure3DStyle,
  type Structure3DColorScheme,
} from "./structureStyle";
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
// Separate accent for the rotate-bond tool's axis markers, distinct from
// the measurement color so the two tools' overlays never look
// ambiguous if a person switches between them within one session.
const ROTATE_COLOR = "#4fb3ff";

// The rotate-bond tool's 4 selectable auto-rotate speeds, in degrees per
// second — chosen so the slowest is easy to follow frame by frame (a
// full 360° pass takes 24s) and the fastest still reads as continuous
// rotation rather than a blur (3s per pass). Labeled as plain
// multipliers (×1/×2/×4/×8) rather than words like "slow"/"fast" so
// there's nothing to translate and the relationship between the options
// is obvious at a glance.
const ROTATE_SPEEDS = [
  { label: "\u00d71", degPerSec: 15 },
  { label: "\u00d72", degPerSec: 30 },
  { label: "\u00d74", degPerSec: 60 },
  { label: "\u00d78", degPerSec: 120 },
] as const;

// How often the auto-rotate loop advances the angle. Reuses the exact
// same state (rotateState.angle) and effect that a manual slider drag
// does, rather than a separate fast imperative redraw path — at 20
// updates/sec a full MMFF94 single-point re-score (see the angle effect
// below) is cheap enough per tick not to matter for the small
// substituents this tool is meant for, and re-using the normal pipeline
// means the live energy readout and torsion chart's angle marker need
// no animation-specific handling at all.
const ANIMATE_TICK_MS = 50;

// The rotate-bond slider's tick marks/snap points — every 30°, 0
// through 360 inclusive (13 stops), matching the input's step={30}.
const ROTATE_TICK_ANGLES = Array.from({ length: 13 }, (_, i) => i * 30);

type ViewState =
  | { phase: "empty" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; method: "quick" | "mmff94" | "xtb"; energyKcalMol?: number; converged?: boolean };

type ToolMode = "off" | "distance" | "angle" | "rotate" | "link";

interface PendingAtom extends Point3 {
  serial: number;
}

interface Measurement {
  id: number;
  text: string;
  shapes: GLShape[];
  label: Label;
}

type RotateState =
  | { phase: "picking" }
  | { phase: "active"; axisA: number; axisB: number; half: number[]; baseAtoms: XyzAtom[]; bonds: XyzBond[]; angle: number };

// State for the rotate-bond tool's "Scan rotation" action, which sweeps
// the picked bond through a full turn and scores each rigid rotamer with
// MMFF94 (see torsionScan.ts) to find how much less stable the worst
// rotation is than the best one.
type ScanState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "done"; points: TorsionPoint[]; summary: TorsionSummary }
  | { phase: "no-data" };

/** "+2.9" / "-1.3" / "0.0" — a signed one-decimal kcal/mol delta. */
function formatSignedDelta(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

/** Applies the currently-selected representation + coloring to whatever
 * model is loaded. Kept as a module-level function taking the viewer
 * explicitly (rather than reading the store) so the several call sites —
 * after a regenerate, after a style change, and after the rotate-bond tool
 * swaps the model out — all share one definition of "what the user's chosen
 * style looks like" and none of them can drift from the others. */
function applyCurrentStyle(
  viewer: ReturnType<typeof $3Dmol.createViewer>,
  style: Structure3DStyle,
  colorScheme: Structure3DColorScheme
) {
  viewer.setStyle({}, buildStructureStyle(style, colorScheme));
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
  const style = useMoleculeStore((s) => s.structure3DStyle);
  const setStyle = useMoleculeStore((s) => s.setStructure3DStyle);
  const colorScheme = useMoleculeStore((s) => s.structure3DColorScheme);
  const linkedAtomId = useMoleculeStore((s) => s.linkedAtomId);
  const setLinkedAtomId = useMoleculeStore((s) => s.setLinkedAtomId);
  const setSelected = useMoleculeStore((s) => s.setSelected);
  const setColorScheme = useMoleculeStore((s) => s.setStructure3DColorScheme);
  // Mirrors of the two style preferences, so the several imperative call
  // sites below (rotate-bond's model swap, the debounced regenerate — neither
  // of which re-runs on a style change) can apply whatever the *current*
  // preference is rather than whatever it happened to be when they were
  // defined. The dedicated effect further down is what makes a change visible
  // without waiting for the next regenerate.
  const styleRef = useRef(style);
  const colorSchemeRef = useRef(colorScheme);
  styleRef.current = style;
  colorSchemeRef.current = colorScheme;

  // Which conformer to generate: 0 is the most likely torsion set, and each
  // press of "new conformer" advances to the next genuinely distinct one.
  // Deliberately not persisted — a remembered index from a previous session
  // would silently make the first structure drawn differ from what this user
  // saw last time, for no reason they could explain.
  const [conformerIndex, setConformerIndex] = useState(0);
  // Set when the generator runs out of distinct torsion sets for this
  // structure, so the button can say so instead of silently doing nothing.
  const [conformersExhausted, setConformersExhausted] = useState(false);
  // Transient feedback for the link tool — e.g. that the clicked atom was a
  // generated hydrogen with no 2D counterpart. Kept local rather than in the
  // store because it's purely about the last click.
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  // Set when the displayed structure came from an imported file rather than
  // being generated from the 2D drawing. An imported structure has no 2D
  // atom counterpart at all, so both the regenerate-on-edit path and the
  // 3D<->2D link are suppressed while it's showing — otherwise the panel
  // would silently throw the import away on the next edit. Cleared by
  // dismissing the banner.
  const [importedName, setImportedName] = useState<string | null>(null);
  /** True while a method click is refining an imported structure rather than
   * re-embedding the drawing. Shares the seeding flag's spinner. */
  // Conformer search can take a while, and unlike the debounced
  // regenerate-from-an-edit there's no ongoing edit driving it — the button
  // explicitly asks for this work, so it's worth a brief disabled state so a
  // double-click can't queue two expensive embeddings.
  const [seeding, setSeeding] = useState(false);
  const nextConformer = () => {
    setSeeding(true);
    setConformersExhausted(false);
    setConformerIndex((prev) => prev + 1);
  };
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
  // The base (unrotated) molfile the currently-shown structure came
  // from — the rotate-bond tool parses this to get real connectivity
  // and coordinates for whichever bond gets picked as an axis. Not
  // React state: nothing needs to re-render when it changes on its own.
  const lastMolfileRef = useRef<string | null>(null);
  // 2D atom ids in the order exportMol wrote them, which is what the 3D
  // model's serials index into. Rebuilt alongside each embed; see
  // atomLink.ts for why this positional correspondence holds.
  const serialToAtomIdRef = useRef<string[]>([]);

  const [state, setState] = useState<ViewState>({ phase: "empty" });
  const [toolMode, setToolMode] = useState<ToolMode>("off");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);

  // Clear the seeding flag once the new conformer has actually landed, so the
  // button re-enables whether the run succeeded or failed. Tied to
  // state.phase rather than the promise so a run superseded by a newer edit
  // (see runIdRef) can't leave the button stuck disabled.
  useEffect(() => {
    if (state.phase === "ready" || state.phase === "error") setSeeding(false);
  }, [state.phase]);

  // --- Measurement tool state -------------------------------------
  // pendingRef holds atoms clicked so far for the *in-progress*
  // measurement (2 for distance, 3 for angle: atom → vertex → atom).
  // It's a ref rather than React state because it's mutated from
  // inside 3Dmol's imperative click callback, outside React's render
  // cycle — pendingCount mirrors its length purely so the hint text
  // below the buttons can re-render.
  const pendingRef = useRef<PendingAtom[]>([]);
  const pendingShapesRef = useRef<GLShape[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const nextMeasurementId = useRef(1);

  // --- Rotate-bond tool state --------------------------------------
  const [rotateState, setRotateState] = useState<RotateState>({ phase: "picking" });
  const rotatePendingRef = useRef<PendingAtom[]>([]);
  const [rotatePendingCount, setRotatePendingCount] = useState(0);
  const [rotateError, setRotateError] = useState<string | null>(null);
  // Axis-marker highlight spheres — created as soon as each atom is
  // clicked during picking, and (unlike the measurement tool's pending
  // markers) kept on screen for the whole "active" phase afterward, as
  // a constant reminder of which bond is being spun.
  const axisShapesRef = useRef<GLShape[]>([]);

  // --- Rotate-bond tool: live per-angle energy + full-scan state ----
  // rotateEnergy is the single-point MMFF94 energy of whatever angle the
  // slider is *currently* at (recomputed async on every tick — see the
  // angle-driven effect below); rotateBaseEnergy is that same quantity
  // captured once at angle 0° the moment a bond is picked, so the live
  // readout can also show a delta against that fixed reference point.
  // rotateEnergyRunId guards both against out-of-order async resolution
  // during a fast slider drag.
  const [rotateEnergy, setRotateEnergy] = useState<{ angle: number; kcalMol: number } | null>(null);
  const [rotateBaseEnergy, setRotateBaseEnergy] = useState<number | null>(null);
  const rotateEnergyRunId = useRef(0);
  const [scan, setScan] = useState<ScanState>({ phase: "idle" });
  const scanRunIdRef = useRef(0);

  // --- Rotate-bond tool: auto-rotate animation state ----------------
  // animating drives the setInterval effect further down; loopMode and
  // speedIndex are kept as their own state (rather than folded into one
  // "animating" variant type) so they can be changed live, mid-animation,
  // without needing to stop and restart — the effect just picks up the
  // new value on its next tick.
  const [animating, setAnimating] = useState(false);
  const [loopMode, setLoopMode] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);

  /** Clears everything to do with the rotate tool's energy readout and
   * any in-flight or finished scan — called whenever the picked bond
   * changes (or is abandoned), since both are only meaningful for the
   * specific bond they were computed against. */
  function resetRotateEnergyState() {
    rotateEnergyRunId.current++;
    scanRunIdRef.current++;
    setRotateEnergy(null);
    setRotateBaseEnergy(null);
    setScan({ phase: "idle" });
    setAnimating(false);
  }

  // Create the viewer once. 3Dmol reads its container's size at creation
  // and on resize(), so this only needs the div to exist and be sized —
  // CSS gives the panel a fixed layout height, so there's no race with
  // the panel still being 0x0 on first paint.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewer = $3Dmol.createViewer(container, {
      backgroundColor: theme === "dark" ? "#1b1e24" : "#ffffff",
    });
    viewerRef.current = viewer;

    // Observe the *container*, not just the window. This panel is docked
    // next to the 2D canvas and is drag-resizable (App.tsx owns
    // panel3DWidth), so its width changes without any window resize event
    // ever firing. Listening only to window resize left the WebGL canvas at
    // its old size while the surrounding panel resized, so dragging the
    // divider cropped or offset the molecule until the window itself was
    // resized. A ResizeObserver catches every way the container can change
    // size — divider drag, window resize, sidebar collapse — and is the same
    // approach MoleculeCanvas already uses to track the 2D canvas.
    //
    // The initial observation fires immediately with the same size
    // createViewer already read, which is a harmless no-op resize.
    const observer = new ResizeObserver(() => viewer.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
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

  // Switching representation or coloring is a pure view change — it must
  // take effect immediately rather than waiting for the next molecule edit
  // to trigger a regenerate (which would needlessly re-embed the structure
  // and throw away the current camera angle). setStyle replaces the style of
  // the already-loaded model in place, so this is cheap.
  //
  // Skipped when a rotate-bond rotation is applied: that effect already
  // re-adds the rotated model styled with the current preference on every
  // angle tick, and letting this one also fire would just redraw twice.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || state.phase !== "ready") return;
    if (toolMode === "rotate" && rotateState.phase === "active") return;
    applyCurrentStyle(viewer, style, colorScheme);
    viewer.render();
  }, [style, colorScheme, state.phase, toolMode, rotateState.phase]);

  const hasAtoms = Object.keys(molecule.atoms).length > 0;

  /** Loads a structure file into the viewer in place of the generated one. */
  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const molfile = importStructure3D(file.name, text);
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.removeAllModels();
      viewer.removeAllShapes();
      viewer.removeAllLabels();
      viewer.addModel(molfile, "mol");
      applyCurrentStyle(viewer, styleRef.current, colorSchemeRef.current);
      viewer.zoomTo();
      viewer.render();
      lastMolfileRef.current = molfile;
      // An imported structure isn't derived from the 2D drawing, so there is
      // no serial correspondence to offer and no conformer seed to re-roll.
      serialToAtomIdRef.current = [];
      setImportedName(file.name);
      setLinkedAtomId(null);
      setState({ phase: "ready", method });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Discards an imported structure and returns to the generated one. Clearing
   * importedName alone isn't enough — the regenerate effect has no other
   * dependency that would change to make it re-run — so a zero-length seed
   * bump forces it. */
  function dismissImport() {
    setState({ phase: "empty" });
    setImportedName(null);
    setConformerIndex((prev) => prev + 1);
  }

  function clearPendingMarkers() {
    const viewer = viewerRef.current;
    if (viewer) {
      for (const shape of pendingShapesRef.current) viewer.removeShape(shape);
    }
    pendingShapesRef.current = [];
    pendingRef.current = [];
    setPendingCount(0);
  }

  function clearAxisMarkers() {
    const viewer = viewerRef.current;
    if (viewer) {
      for (const shape of axisShapesRef.current) viewer.removeShape(shape);
    }
    axisShapesRef.current = [];
    rotatePendingRef.current = [];
    setRotatePendingCount(0);
    setRotateError(null);
    resetRotateEnergyState();
  }

  function restoreBaseStructure(atoms: XyzAtom[], bonds: XyzBond[]) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.removeAllModels();
    viewer.addModel(serializeV2000(atoms, bonds), "mol");
    applyCurrentStyle(viewer, styleRef.current, colorSchemeRef.current);
    viewer.render();
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
  // tool mode changes, and again every time a freshly-generated model
  // finishes loading (state.phase flips to "ready") — a new addModel
  // call needs its own clickable atoms re-bound, since they're a fresh
  // set of atom objects. Deliberately keyed on rotateState.phase rather
  // than the whole rotateState object — the angle field changes on
  // every slider tick while phase stays "active" the whole time, and
  // re-registering the click handler on every tick would be pure waste
  // (see the separate angle-driven effect further down for that path).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (toolMode === "off" || (toolMode === "rotate" && rotateState.phase === "active")) {
      viewer.setClickable({}, false, () => {});
      viewer.render();
      return;
    }

    if (toolMode === "distance" || toolMode === "angle") {
      const needed = toolMode === "distance" ? 2 : 3;
      viewer.setClickable({}, true, (atom: PendingAtom) => {
        if (pendingRef.current.some((a) => a.serial === atom.serial)) return; // ignore re-clicking the same atom

        const sphere = viewer.addSphere({ center: atom, radius: 0.7, color: MEASURE_COLOR, wireframe: true });
        pendingShapesRef.current.push(sphere);
        pendingRef.current.push({ serial: atom.serial, x: atom.x, y: atom.y, z: atom.z });
        setPendingCount(pendingRef.current.length);
        viewer.render();

        if (pendingRef.current.length === needed) {
          const finished = pendingRef.current;
          pendingRef.current = [];
          setPendingCount(0);
          finalizeMeasurement(toolMode, finished);
        }
      });
      viewer.render();
      return;
    }

    // toolMode === "link": click an atom to select its counterpart on the
    // 2D canvas. Purely a selection bridge — no geometry is drawn in 3D
    // here; the canvas is what renders the highlight. Clicking the same atom
    // again clears the link, since a link you can only set but not unset is
    // a trap when you're comparing atoms.
    if (toolMode === "link") {
      viewer.setClickable({}, true, (atom: PendingAtom) => {
        const atomId = atomIdForSerial(serialToAtomIdRef.current, atom.serial);
        if (!atomId) {
          // A generated hydrogen has no 2D counterpart; saying so beats
          // silently doing nothing.
          setLinkMessage(t("view3d.linkNoMatch"));
          return;
        }
        setLinkMessage(null);
        // Clicking the already-linked atom unlinks it, so the mode has a way
        // back to "nothing highlighted" without needing a separate clear.
        const clearing = linkedAtomId === atomId;
        setLinkedAtomId(clearing ? null : atomId);
        setSelected(clearing ? new Set() : new Set([atomId]));
      });
      viewer.render();
      return;
    }

    // toolMode === "rotate" && rotateState.phase === "picking"
    viewer.setClickable({}, true, (atom: PendingAtom) => {
      if (rotatePendingRef.current.some((a) => a.serial === atom.serial)) return;

      setRotateError(null);
      const sphere = viewer.addSphere({ center: atom, radius: 0.7, color: ROTATE_COLOR, wireframe: true });
      axisShapesRef.current.push(sphere);
      rotatePendingRef.current.push({ serial: atom.serial, x: atom.x, y: atom.y, z: atom.z });
      setRotatePendingCount(rotatePendingRef.current.length);
      viewer.render();

      if (rotatePendingRef.current.length !== 2) return;

      const [pickA, pickB] = rotatePendingRef.current;
      rotatePendingRef.current = [];
      setRotatePendingCount(0);

      const molfile = lastMolfileRef.current;
      const parsed = molfile ? parseV2000(molfile) : null;
      const result = parsed ? findRotatableHalf(parsed.bonds, parsed.atoms.length, pickA.serial, pickB.serial) : null;

      if (!parsed || !result || !result.ok) {
        const reason = !result || result.ok ? "UNKNOWN" : result.reason;
        setRotateError(
          reason === "RING_BOND"
            ? t("view3d.rotateErrorRingBond")
            : reason === "MULTIPLE_BOND"
              ? t("view3d.rotateErrorMultipleBond")
              : t("view3d.rotateErrorNotBonded"),
        );
        for (const shape of axisShapesRef.current) viewer.removeShape(shape);
        axisShapesRef.current = [];
        viewer.render();
        return;
      }

      setRotateState({
        phase: "active",
        axisA: pickA.serial,
        axisB: pickB.serial,
        half: result.half,
        baseAtoms: parsed.atoms,
        bonds: parsed.bonds,
        angle: 0,
      });
    });
    viewer.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolMode, rotateState.phase, state.phase]);

  // Recomputes the rigidly-rotated structure and pushes it to the
  // viewer whenever the rotate tool's angle (or the axis/half it's
  // rotating around) changes. Kept as its own effect, separate from the
  // click-registration one above, so a slider drag doesn't also
  // re-touch the click handler on every tick.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || rotateState.phase !== "active") return;

    const rotated = rotateHalf(
      rotateState.baseAtoms,
      rotateState.half,
      rotateState.baseAtoms[rotateState.axisA],
      rotateState.baseAtoms[rotateState.axisB],
      rotateState.angle,
    );
    const molfile = serializeV2000(rotated, rotateState.bonds);
    viewer.removeAllModels();
    viewer.addModel(molfile, "mol");
    applyCurrentStyle(viewer, styleRef.current, colorSchemeRef.current);
    // No zoomTo() here, deliberately - this redraws the same structure
    // at a new angle, not a new structure; keeping the camera exactly
    // where it was is what makes the rotation actually readable as
    // motion instead of a jump-cut on every tick.
    viewer.render();

    // Scores this exact rigid rotamer with MMFF94 (no minimisation —
    // see mmff94SinglePointEnergy's docstring) so the panel can show a
    // live "how strained is *this* rotation" readout while dragging.
    // Async and debounced only by runIdRef-style guarding rather than a
    // timer: a single-point evaluation is cheap enough to run on every
    // tick, but a fast drag can still fire several of these before any
    // resolve, so only the most recently *requested* one is allowed to
    // update state.
    const thisRun = ++rotateEnergyRunId.current;
    const angleAtRequest = rotateState.angle;
    mmff94SinglePointEnergy(molfile).then((energy) => {
      if (rotateEnergyRunId.current !== thisRun || energy === null) return;
      setRotateEnergy({ angle: angleAtRequest, kcalMol: energy });
      if (angleAtRequest === 0) setRotateBaseEnergy(energy);
    });
  }, [rotateState]);

  // Drives the "auto-rotate" play/loop controls: on a fixed tick,
  // advances rotateState.angle by this speed's degrees-per-tick, wrapping
  // past 360° back to 0° in loop mode or stopping exactly at 360° in
  // "once" mode. Deliberately goes through the same setRotateState the
  // slider's onChange uses (see the angle effect above) rather than a
  // separate fast/imperative redraw path — see ANIMATE_TICK_MS's comment
  // for why that's fine performance-wise, and it means this effect needs
  // no awareness of energy scoring, the torsion chart, or anything else
  // that already reacts to rotateState.angle changing.
  //
  // `angle` and `mode` are captured once, from the render that starts
  // this effect, into plain local variables rather than read from
  // rotateState/loopMode on every tick — so a mid-flight speed or loop
  // toggle (both in the dependency array) cleanly restarts the loop from
  // wherever the animation currently is, instead of fighting the
  // previous instance.
  useEffect(() => {
    if (!animating || rotateState.phase !== "active") return;

    let angle = rotateState.angle;
    const mode = loopMode ? "loop" : "once";
    const degPerTick = (ROTATE_SPEEDS[speedIndex].degPerSec * ANIMATE_TICK_MS) / 1000;

    const interval = setInterval(() => {
      angle += degPerTick;
      let finished = false;
      if (angle >= 360) {
        if (mode === "once") {
          angle = 360;
          finished = true;
        } else {
          angle -= 360;
        }
      }
      setRotateState((prev) => (prev.phase === "active" ? { ...prev, angle } : prev));
      if (finished) setAnimating(false);
    }, ANIMATE_TICK_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animating, loopMode, speedIndex, rotateState.phase]);

  /** Sweeps the currently-picked bond through a full turn, scoring each
   * rigid rotamer with MMFF94, so the panel can report how much less
   * stable the worst rotation it finds is than the best one (e.g.
   * eclipsed vs. staggered ethane) rather than requiring the person to
   * drag the slider and read off two values by hand. */
  async function runTorsionScan() {
    if (rotateState.phase !== "active") return;
    const { baseAtoms, half, axisA, axisB, bonds } = rotateState;
    const thisRun = ++scanRunIdRef.current;
    setScan({ phase: "scanning" });

    const points = await scanTorsion(baseAtoms, half, baseAtoms[axisA], baseAtoms[axisB], bonds, 10);
    if (scanRunIdRef.current !== thisRun) return; // bond changed (or reset) mid-scan

    const summary = summarizeTorsionScan(points);
    setScan(summary ? { phase: "done", points, summary } : { phase: "no-data" });
  }

  // Switching tool (including back to "off") abandons whatever the
  // previous tool had in progress: a pending measurement atom doesn't
  // carry over into a different mode, and an actively-applied bond
  // rotation gets reverted back to the real, unrotated structure rather
  // than silently left on screen with no obvious way back to it.
  function selectToolMode(next: ToolMode) {
    if (toolMode === "rotate" && rotateState.phase === "active") {
      restoreBaseStructure(rotateState.baseAtoms, rotateState.bonds);
    }
    clearPendingMarkers();
    clearAxisMarkers();
    setRotateState({ phase: "picking" });
    setToolMode((prev) => (prev === next ? "off" : next));
  }

  function pickDifferentBond() {
    if (rotateState.phase === "active") {
      restoreBaseStructure(rotateState.baseAtoms, rotateState.bonds);
    }
    clearAxisMarkers();
    setRotateState({ phase: "picking" });
  }

  /** Abandons every in-progress tool interaction: pending atom picks,
   * measurements, and any rotate-bond axis selection.
   *
   * Hoisted out of the regenerate effect because three callers need it now —
   * the effect, handleImportFile, and refineImport — and as a nested function
   * it was invisible to the other two.
   */
  function resetToolState() {
    pendingRef.current = [];
    pendingShapesRef.current = [];
    setPendingCount(0);
    setMeasurements([]);
    rotatePendingRef.current = [];
    axisShapesRef.current = [];
    setRotatePendingCount(0);
    setRotateError(null);
    setRotateState({ phase: "picking" });
    resetRotateEnergyState();
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);

    // An imported structure isn't tied to the 2D drawing, so a molecule edit
    // must not regenerate over it — that would replace the import with a
    // generated structure without being asked.
    if (importedName) return;

    if (!hasAtoms) {
      setState({ phase: "empty" });
      lastMolfileRef.current = null;
      serialToAtomIdRef.current = [];
      viewerRef.current?.removeAllModels();
      viewerRef.current?.removeAllShapes();
      viewerRef.current?.removeAllLabels();
      viewerRef.current?.render();
      resetToolState();
      return;
    }

    setState({ phase: "loading" });
    const thisRun = ++runIdRef.current;

    debounceRef.current = setTimeout(() => {
      embedMolecule3DWithMethod(molecule, method, conformerIndex)
        .then((result) => {
          if (runIdRef.current !== thisRun) return; // superseded by a newer edit

          const viewer = viewerRef.current;
          if (viewer) {
            viewer.removeAllModels();
            // Old measurements/pending selections/rotation axis picks
            // all reference coordinates from the *previous* geometry —
            // regenerating invalidates them, so they're cleared here
            // rather than left stale and silently wrong.
            viewer.removeAllShapes();
            viewer.removeAllLabels();
            viewer.addModel(result.molfile, "mol");
            applyCurrentStyle(viewer, styleRef.current, colorSchemeRef.current);
            viewer.zoomTo();
            viewer.render();
          }
          lastMolfileRef.current = result.molfile;
          // Rebuild the 2D<->3D serial mapping alongside the structure it
          // describes; a stale mapping would highlight the wrong atom.
          serialToAtomIdRef.current = buildSerialToAtomId(molecule).serialToAtomId;
          // The generator returns its best available conformer once its
          // torsion sets run out, so an index past the end is not an error —
          // but it is worth telling the user the button has nothing left to
          // give rather than leaving them pressing it for no change.
          setConformersExhausted(conformerIndex > 0 && result.conformerIndexAchieved < conformerIndex);
          resetToolState();
          setState({
            phase: "ready",
            method,
            energyKcalMol: result.energyKcalMol,
            converged: result.converged,
          });
        })
        .catch((err) => {
          if (runIdRef.current !== thisRun) return;
          lastMolfileRef.current = null;
          serialToAtomIdRef.current = [];
          viewerRef.current?.removeAllModels();
          viewerRef.current?.removeAllShapes();
          viewerRef.current?.removeAllLabels();
          viewerRef.current?.render();
          resetToolState();
          setState({ phase: "error", message: embedErrorMessage(err, t) });
        });
    }, REGEN_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [molecule, method, hasAtoms, conformerIndex, importedName]);

  const recenter = () => viewerRef.current?.zoomTo();

  const onImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice in a row still fires a
    // change event (browsers won't re-fire for an unchanged value).
    e.target.value = "";
    if (file) void handleImportFile(file);
  };

  // Closes the export / style dropdowns on an outside click, and each menu
  // opening closes the other — they're both absolutely-positioned dropdowns
  // anchored to the header's action buttons, so neither needs a portal.
  // Whichever is open is the one that stays open; clicking its own trigger
  // button is handled by that button's onClick toggling it shut.
  useEffect(() => {
    if (!exportMenuOpen && !styleMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
      if (!styleMenuRef.current?.contains(e.target as Node)) setStyleMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [exportMenuOpen, styleMenuOpen]);

  /** The molfile for whatever geometry is actually on screen right now —
   * if the rotate-bond tool has an active rotation applied, that rotated
   * conformation (not the underlying unrotated structure it's layered
   * on top of); otherwise whatever embed3d.ts/xtbRefine.ts last produced.
   * Mirrors the exact same rotation math the viewport-redraw effect
   * above uses, so what gets exported always matches what's visible. */
  function currentMolfile(): string | null {
    if (rotateState.phase === "active") {
      const rotated = rotateHalf(
        rotateState.baseAtoms,
        rotateState.half,
        rotateState.baseAtoms[rotateState.axisA],
        rotateState.baseAtoms[rotateState.axisB],
        rotateState.angle,
      );
      return serializeV2000(rotated, rotateState.bonds);
    }
    return lastMolfileRef.current;
  }

  /**
   * Re-refines the imported structure with a different method. Separate from
   * the regenerate effect, which is deliberately inert while an import is
   * showing (there is no drawing to embed) — this runs the same force fields
   * over the coordinates that came from the file.
   */
  async function refineImport(nextMethod: Embed3DMethod) {
    const source = lastMolfileRef.current;
    if (!source) return;
    setMethod(nextMethod);
    setSeeding(true);
    setState({ phase: "loading" });
    try {
      const refined = await refineStructure3D(source, nextMethod);
      const viewer = viewerRef.current;
      if (viewer) {
        viewer.removeAllModels();
        // Geometry is unchanged in identity but different in fact, so any
        // measurement or axis pick made against the old coordinates is stale.
        viewer.removeAllShapes();
        viewer.removeAllLabels();
        viewer.addModel(refined.molfile, "mol");
        applyCurrentStyle(viewer, styleRef.current, colorSchemeRef.current);
        viewer.zoomTo();
        viewer.render();
      }
      lastMolfileRef.current = refined.molfile;
      resetToolState();
      setState({
        phase: "ready",
        method: nextMethod,
        energyKcalMol: refined.energyKcalMol,
        converged: refined.converged,
      });
    } catch (err) {
      setState({ phase: "error", message: embedErrorMessage(err, t) });
    }
  }


  function doExportMol3D() {
    const molfile = currentMolfile();
    if (!molfile) return;
    downloadBlob(new Blob([molfile], { type: "chemical/x-mdl-molfile" }), "molecule_3d.mol");
  }

  function doExportXyz() {
    const molfile = currentMolfile();
    if (!molfile) return;
    const { atoms } = parseV2000(molfile);
    downloadBlob(new Blob([exportXyz(atoms, "Generated by EnlaceCraft")], { type: "chemical/x-xyz" }), "molecule_3d.xyz");
  }

  const measureHint =
    toolMode === "distance"
      ? t("view3d.measureHintDistance", { n: pendingCount })
      : toolMode === "angle"
        ? t("view3d.measureHintAngle", { n: pendingCount })
        : null;

  return (
    <div className="molecule-3d-panel">
      <div className="molecule-3d-panel__header">
        <span className="molecule-3d-panel__title">{t("view3d.title")}</span>
        <div className="molecule-3d-panel__method">
          {/* With a drawing behind them these choose how it becomes 3D. With
              an imported structure on screen there is no drawing to embed, so
              they instead re-refine the imported coordinates — which is the
              genuinely useful thing to do with a structure you brought in,
              and is why they aren't simply disabled here. */}
          <MethodButton
            active={method === "quick"}
            onClick={() => (importedName ? refineImport("quick") : setMethod("quick"))}
            label={t("view3d.methodQuick")}
            title={importedName ? t("view3d.methodRefinesImport") : undefined}
          />
          <MethodButton
            active={method === "mmff94"}
            onClick={() => (importedName ? refineImport("mmff94") : setMethod("mmff94"))}
            label={t("view3d.methodMmff94")}
            title={importedName ? t("view3d.methodRefinesImport") : undefined}
          />
          <MethodButton
            active={method === "xtb"}
            onClick={() => (importedName ? refineImport("xtb") : setMethod("xtb"))}
            label={t("view3d.methodXtb")}
            title={importedName ? t("view3d.methodRefinesImport") : undefined}
          />
        </div>
        <div className="molecule-3d-panel__actions">
          <ToolButton
            title={
              importedName
                ? t("view3d.newConformerUnavailable")
                : conformersExhausted
                  ? t("view3d.newConformerExhausted")
                  : t("view3d.newConformer")
            }
            disabled={state.phase !== "ready" || seeding || !!importedName || conformersExhausted}
            onClick={nextConformer}
          >
            {seeding ? <Loader2 size={15} className="compound-search__spinner" /> : <Shuffle size={15} />}
          </ToolButton>
          <div className="molecule-3d-export-menu" ref={styleMenuRef}>
            <ToolButton
              title={t("view3d.style")}
              active={styleMenuOpen}
              disabled={state.phase !== "ready"}
              onClick={() => { setExportMenuOpen(false); setStyleMenuOpen((o) => !o); }}
            >
              <Palette size={15} />
            </ToolButton>
            {styleMenuOpen && (
              <div className="molecule-3d-export-menu__dropdown molecule-3d-export-menu__dropdown--wide">
                <div className="molecule-3d-panel__style-section">
                  <span className="molecule-3d-panel__style-label">{t("view3d.styleRepresentation")}</span>
                  <div className="molecule-3d-panel__method">
                    {STRUCTURE3D_STYLES.map((s) => (
                      <MethodButton
                        key={s.id}
                        active={style === s.id}
                        onClick={() => setStyle(s.id)}
                        label={t(styleLabelKey(s.id))}
                      />
                    ))}
                  </div>
                </div>
                <div className="molecule-3d-panel__style-section">
                  <span className="molecule-3d-panel__style-label">{t("view3d.styleColorScheme")}</span>
                  <div className="molecule-3d-panel__method">
                    {STRUCTURE3D_COLOR_SCHEMES.map((scheme) => (
                      <MethodButton
                        key={scheme}
                        active={colorScheme === scheme}
                        onClick={() => setColorScheme(scheme)}
                        label={t(colorLabelKey(scheme))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <ToolButton title={t("view3d.recenter")} onClick={recenter}>
            <RotateCcw size={15} />
          </ToolButton>
          <div className="molecule-3d-export-menu" ref={exportMenuRef}>
            <ToolButton
              title={t("view3d.export")}
              disabled={state.phase !== "ready"}
              onClick={() => { setStyleMenuOpen(false); setExportMenuOpen((o) => !o); }}
            >
              <Download size={15} />
            </ToolButton>
            {exportMenuOpen && (
              <div className="molecule-3d-export-menu__dropdown">
                <button
                  type="button"
                  className="export-dropdown__item"
                  onClick={() => { doExportXyz(); setExportMenuOpen(false); }}
                >
                  {t("view3d.exportXyz")}
                </button>
                <button
                  type="button"
                  className="export-dropdown__item"
                  onClick={() => { doExportMol3D(); setExportMenuOpen(false); }}
                >
                  {t("view3d.exportMol3D")}
                </button>
              </div>
            )}
          </div>
          <ToolButton title={t("view3d.close")} onClick={onClose}>
            <X size={15} />
          </ToolButton>
        </div>
      </div>

      <div className="molecule-3d-panel__measure-row">
        <label className="molecule-3d-panel__import">
          <Upload size={13} />
          {t("view3d.importStructure")}
          <input type="file" accept=".xyz,.pdb,.ent,.mol,.sdf" onChange={onImportChange} />
        </label>
        {importedName && (
          <span className="molecule-3d-panel__import-banner">
            {t("view3d.importedBanner", { name: importedName })}
            <span className="molecule-3d-panel__import-note">{t("view3d.importedRefineHint")}</span>
            <button type="button" onClick={dismissImport} title={t("view3d.dismissImport")}>
              <X size={12} />
            </button>
          </span>
        )}
        <div className="molecule-3d-panel__method">
          <ToolButton
            title={t("view3d.measureDistance")}
            active={toolMode === "distance"}
            disabled={state.phase !== "ready"}
            onClick={() => selectToolMode("distance")}
          >
            <Ruler size={15} />
          </ToolButton>
          <ToolButton
            title={t("view3d.measureAngle")}
            active={toolMode === "angle"}
            disabled={state.phase !== "ready"}
            onClick={() => selectToolMode("angle")}
          >
            <Triangle size={15} />
          </ToolButton>
          <ToolButton
            title={t("view3d.rotateBond")}
            active={toolMode === "rotate"}
            disabled={state.phase !== "ready"}
            onClick={() => selectToolMode("rotate")}
          >
            <Rotate3d size={15} />
          </ToolButton>
          <ToolButton
            title={t("view3d.linkAtom")}
            active={toolMode === "link"}
            disabled={state.phase !== "ready"}
            onClick={() => selectToolMode("link")}
          >
            <Link2 size={15} />
          </ToolButton>
        </div>
        {toolMode === "link" && (
          <span className="molecule-3d-panel__measure-hint">
            {linkMessage ?? t("view3d.linkHint")}
          </span>
        )}
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

      {toolMode === "rotate" && (
        <div className="molecule-3d-panel__rotate-row">
          {rotateState.phase === "picking" && (
            <span className={rotateError ? "molecule-3d-panel__rotate-error" : undefined}>
              {rotateError ?? t("view3d.rotateHintPicking", { n: rotatePendingCount })}
            </span>
          )}
          {rotateState.phase === "active" && (
            <div className="molecule-3d-panel__rotate-active">
              <div className="molecule-3d-panel__rotate-slider-line">
                <span className="molecule-3d-panel__rotate-angle">
                  {t("view3d.rotateAngleLabel", { value: Math.round(rotateState.angle) })}
                </span>
                <div className="molecule-3d-panel__rotate-slider-wrap">
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={30}
                    list="rotate-tick-marks"
                    value={rotateState.angle}
                    disabled={animating}
                    onChange={(e) =>
                      setRotateState((prev) => (prev.phase === "active" ? { ...prev, angle: Number(e.target.value) } : prev))
                    }
                  />
                  <datalist id="rotate-tick-marks">
                    {ROTATE_TICK_ANGLES.map((angle) => (
                      <option key={angle} value={angle} />
                    ))}
                  </datalist>
                  <div className="molecule-3d-panel__rotate-ticks">
                    {ROTATE_TICK_ANGLES.map((angle) => (
                      <span key={angle}>{`${angle}\u00b0`}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="molecule-3d-panel__rotate-buttons-line">
                <button
                  type="button"
                  className="molecule-3d-panel__measure-clear"
                  disabled={animating}
                  onClick={() => setRotateState((prev) => (prev.phase === "active" ? { ...prev, angle: 0 } : prev))}
                >
                  {t("view3d.rotateReset")}
                </button>
                <button
                  type="button"
                  className="molecule-3d-panel__measure-clear"
                  onClick={runTorsionScan}
                  disabled={scan.phase === "scanning" || animating}
                  title={t("view3d.rotateScanHint")}
                >
                  {scan.phase === "scanning" ? (
                    <Loader2 size={12} className="compound-search__spinner" />
                  ) : (
                    <Activity size={12} />
                  )}
                  {t("view3d.rotateScan")}
                </button>
                <button type="button" className="molecule-3d-panel__measure-clear" onClick={pickDifferentBond}>
                  {t("view3d.rotatePickDifferent")}
                </button>
              </div>

              <div className="molecule-3d-panel__rotate-buttons-line">
                <button
                  type="button"
                  className="molecule-3d-panel__measure-clear"
                  onClick={() => setAnimating((prev) => !prev)}
                  title={animating ? t("view3d.rotatePause") : t("view3d.rotatePlay")}
                >
                  {animating ? <Pause size={12} /> : <Play size={12} />}
                  {animating ? t("view3d.rotatePause") : t("view3d.rotatePlay")}
                </button>
                <ToolButton title={t("view3d.rotateLoop")} active={loopMode} onClick={() => setLoopMode((prev) => !prev)}>
                  <Repeat size={13} />
                </ToolButton>
                <div className="molecule-3d-panel__method">
                  {ROTATE_SPEEDS.map((speed, i) => (
                    <button
                      key={speed.label}
                      type="button"
                      className={`molecule-3d-panel__method-btn ${speedIndex === i ? "molecule-3d-panel__method-btn--active" : ""}`}
                      aria-pressed={speedIndex === i}
                      title={t("view3d.rotateSpeedHint")}
                      onClick={() => setSpeedIndex(i)}
                    >
                      {speed.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {rotateState.phase === "active" && (
        <div className="molecule-3d-panel__rotate-energy" title={t("view3d.rotateEnergyHint")}>
          {rotateEnergy ? (
            <>
              {t("view3d.rotateEnergyLive", { value: rotateEnergy.kcalMol.toFixed(1) })}
              {rotateBaseEnergy !== null && rotateEnergy.angle !== 0 && (
                <span
                  className={
                    rotateEnergy.kcalMol - rotateBaseEnergy > 0
                      ? "molecule-3d-panel__rotate-energy-delta--worse"
                      : "molecule-3d-panel__rotate-energy-delta--better"
                  }
                >
                  {" "}
                  ·{" "}
                  {t("view3d.rotateEnergyDelta", { value: formatSignedDelta(rotateEnergy.kcalMol - rotateBaseEnergy) })}
                </span>
              )}
            </>
          ) : (
            // Reserves the same line height as the live readout so the
            // viewport below doesn't grow/shrink while the first
            // MMFF94 point is still in flight - see the box's CSS
            // min-height for the other half of this.
            "\u00A0"
          )}
        </div>
      )}

      {rotateState.phase === "active" && scan.phase === "no-data" && (
        <div className="molecule-3d-panel__scan-row">
          <span className="molecule-3d-panel__scan-error">{t("view3d.rotateScanNoData")}</span>
        </div>
      )}

      {rotateState.phase === "active" && scan.phase === "done" && (
        <div className="molecule-3d-panel__scan-row">
          <TorsionEnergyChart points={scan.points} summary={scan.summary} currentAngle={rotateState.angle} />
          <span className="molecule-3d-panel__scan-summary">
            {t("view3d.rotateScanSummary", {
              worseAngle: scan.summary.leastStable.angle,
              betterAngle: scan.summary.mostStable.angle,
              value: scan.summary.barrierKcalMol.toFixed(1),
            })}
          </span>
        </div>
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

function MethodButton({
  active,
  onClick,
  label,
  disabled,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  /** Shown as a native tooltip; also the accessible description when the
   * button is disabled and so cannot explain itself on hover. */
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`molecule-3d-panel__method-btn ${active ? "molecule-3d-panel__method-btn--active" : ""}`}
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
