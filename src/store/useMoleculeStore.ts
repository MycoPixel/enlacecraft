import { create } from "zustand";
import type {
  Annotation, ArrowAnnotation, ArrowPreview, ArrowVariant, BondOrder, BondPreview, BondStereo, BracketAnnotation, BracketFacing, BracketVariant, CanvasBackground, ChainPreview, Element, MarqueeRect, Molecule, Point, RingAttachment, RingTemplate, TextAnnotation, Theme, ToolId, ViewTransform,
} from "../types/chemistry";
import type { Lang } from "../i18n/translations";
import * as M from "../model/molecule";
import { nextId } from "../model/id";
import { placeRing as placeRingImpl } from "../engine/ringPlacement";
import { bracketPairLayout } from "../model/geometry";
import { DEFAULT_BRACKET_WIDTH, DEFAULT_BRACKET_HEIGHT, ISOTOPE_PRESETS } from "../model/constants";

const HISTORY_LIMIT = 100;

const LANG_STORAGE_KEY = "enlacecraft-lang";
const SIDEBAR_WIDTH_STORAGE_KEY = "enlacecraft-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 112;
const MIN_SIDEBAR_WIDTH = 88;
const MAX_SIDEBAR_WIDTH = 280;

/** Everything undo/redo restores together. */
interface Snapshot {
  molecule: Molecule;
  annotations: Record<string, Annotation>;
}

const DEFAULT_TEXT_WIDTH = 160;
const DEFAULT_TEXT_HEIGHT = 26;
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;

// Sizing for the reaction-scheme "+" stamp — small and squarish (unlike the
// wide default text box) since it's just holding one bold glyph, and sized
// so a 22px bold "+" doesn't feel cramped inside it.
const PLUS_BOX_WIDTH = 26;
const PLUS_BOX_HEIGHT = 30;
const PLUS_FONT_SIZE = 22;

// How far above a reaction arrow's midpoint "Add reagent text" drops the
// new (empty) text box — the conventional place to write reagents/conditions.
const REAGENT_TEXT_GAP_ABOVE_ARROW = 6;

function detectInitialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // localStorage unavailable (e.g. privacy mode) — fall through to browser language.
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

function detectInitialSidebarWidth(): number {
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const n = saved ? parseInt(saved, 10) : NaN;
    if (Number.isFinite(n)) return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, n));
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

interface MoleculeStore {
  // --- structural state ---
  molecule: Molecule;
  past: Snapshot[];
  future: Snapshot[];

  // --- annotation state (reaction arrows / text boxes) ---
  annotations: Record<string, Annotation>;
  selectedAnnotationIds: Set<string>;
  editingTextId: string | null;
  arrowVariant: ArrowVariant;
  arrowBarb: "full" | "single";
  arrowPreview: ArrowPreview | null;
  /** Live drag-to-place preview for the paired open/close bracket tool (see addBracketPair). */
  bracketPairPreview: ArrowPreview | null;
  bracketVariant: BracketVariant;
  bracketFacing: BracketFacing;

  // --- UI / tool state ---
  tool: ToolId;
  atomElement: Element;
  atomGroup: string | null;
  atomIsotope: string | null;
  atomEditTarget: string | null;
  hoverAtomId: string | null;
  /** Bond currently under the cursor (only tracked when nothing's being
   * dragged and the cursor isn't over an atom) — used for the ring tool's
   * "fuse onto this bond" hover preview. */
  hoverBondId: string | null;
  /** Cursor's current world position, kept live for tools (atom, ring)
   * that show a live preview of where the next thing will be placed. */
  hoverPoint: Point | null;
  atomLabelRevealTargets: Set<string>;
  ringTemplateId: string;
  selected: Set<string>;
  view: ViewTransform;
  theme: Theme;
  /** The drawing canvas's own background — separate from the light/dark
   * app theme; see CanvasBackground's doc comment. */
  canvasBackground: CanvasBackground;
  language: Lang;
  /** Desktop sidebar's width in px, user-resizable by dragging its edge;
   * persisted across sessions like language. Unused on mobile (which uses
   * MobileToolbar instead). */
  sidebarWidth: number;
  status: string;
  bondPreview: BondPreview | null;
  /** Live drag-to-grow preview for the chain tool; see engine/chainPlacement.ts. */
  chainPreview: ChainPreview | null;
  marqueeRect: MarqueeRect | null;
  showHydrogens: boolean;
  monochromeAtoms: boolean;
  /** Current on-screen pixel size of the canvas <svg>, kept in sync by MoleculeCanvas via ResizeObserver. */
  canvasSize: { width: number; height: number };

  // --- setters ---
  setTool: (t: ToolId) => void;
  setAtomElement: (e: Element) => void;
  setAtomGroup: (g: string | null) => void;
  setAtomIsotope: (presetId: string | null) => void;
  setAtomEditTarget: (id: string | null) => void;
  setHoverAtomId: (id: string | null) => void;
  setHoverBondId: (id: string | null) => void;
  setHoverPoint: (p: Point | null) => void;
  setAtomLabelRevealTargets: (targets: Set<string>) => void;
  setRingTemplateId: (id: string) => void;
  setSelected: (s: Set<string>) => void;
  setView: (v: ViewTransform | ((v: ViewTransform) => ViewTransform)) => void;
  toggleTheme: () => void;
  toggleCanvasBackground: () => void;
  toggleLanguage: () => void;
  setSidebarWidth: (w: number) => void;
  setStatus: (s: string) => void;
  setBondPreview: (p: BondPreview | null) => void;
  setChainPreview: (p: ChainPreview | null) => void;
  setMarqueeRect: (r: MarqueeRect | null) => void;
  toggleShowHydrogens: () => void;
  toggleMonochromeAtoms: () => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // --- annotation setters / actions ---
  setSelectedAnnotationIds: (ids: Set<string>) => void;
  setEditingTextId: (id: string | null) => void;
  setArrowVariant: (v: ArrowVariant) => void;
  setArrowBarb: (b: "full" | "single") => void;
  setArrowPreview: (p: ArrowPreview | null) => void;
  setBracketPairPreview: (p: ArrowPreview | null) => void;
  setBracketVariant: (v: BracketVariant) => void;
  setBracketFacing: (f: BracketFacing) => void;
  addTextAnnotation: (p: Point) => string;
  addArrowAnnotation: (p1: Point, p2: Point, variant: ArrowVariant, barb?: "full" | "single") => string;
  addBracketAnnotation: (p: Point, variant: BracketVariant, facing: BracketFacing) => string;
  addBracketPair: (corner1: Point, corner2: Point, variant: BracketVariant) => { openId: string; closeId: string };
  addPlusAnnotation: (p: Point) => string;
  addReagentText: () => string | null;
  updateTextHtml: (id: string, html: string) => void;
  updateTextSize: (id: string, width: number, height: number) => void;
  updateTextFontSize: (id: string, fontSize: number) => void;
  stepTextFontSize: (id: string, delta: number) => void;
  updateBracketSize: (id: string, width: number, height: number) => void;
  setBracketStyleOf: (id: string, variant: BracketVariant, facing: BracketFacing) => void;
  moveAnnotationTransient: (id: string, p: Point) => void;
  moveAnnotationsTransient: (origins: Record<string, Annotation>, dx: number, dy: number) => void;
  updateArrowEndpointTransient: (id: string, which: "start" | "end", p: Point) => void;
  updateArrowCurvatureTransient: (id: string, curvature: number) => void;
  setArrowVariantOf: (id: string, variant: ArrowVariant) => void;
  deleteAnnotation: (id: string) => void;
  deleteAnnotations: (ids: Set<string>) => void;
  snapshotBefore: () => Snapshot;

  // --- structural actions (committed to history) ---
  addAtom: (p: Point, element: Element, group?: string, isotope?: number) => string;
  addBond: (a1: string, a2: string, order?: BondOrder, stereo?: BondStereo) => void;
  /**
   * Adds a whole carbon chain in one undo step. If `fromAtomId` is null, a
   * fresh unbonded carbon is first created at `anchor` (this alone is what
   * a plain click with the chain tool does, `points` empty); each point in
   * `points` then becomes a new carbon bonded to the previous one, in
   * order. See the chain tool in useCanvasInteractions.ts.
   */
  addChain: (fromAtomId: string | null, anchor: Point, points: Point[]) => void;
  setAtomElementOf: (id: string, element: Element) => void;
  setAtomGroupOf: (id: string, group: string) => void;
  setAtomIsotopeOf: (id: string, presetId: string) => void;
  clearAtomIsotopeOf: (id: string) => void;
  cycleAtomStereoLabel: (id: string) => void;
  setAtomCharge: (id: string, delta: number) => void;
  setAtomChargeOffset: (id: string, dx: number, dy: number) => void;
  setAtomLonePairsOffset: (id: string, dx: number, dy: number) => void;
  setAtomRadicalOffset: (id: string, dx: number, dy: number) => void;
  setAtomStereoLabelOffset: (id: string, dx: number, dy: number) => void;
  cycleAtomLonePairs: (id: string) => void;
  toggleAtomRadical: (id: string) => void;
  setBondOrder: (id: string, order: BondOrder) => void;
  setBondStereo: (id: string, stereo: BondStereo) => void;
  cycleDoubleBondSide: (id: string) => void;
  deleteAtom: (id: string) => void;
  deleteBond: (id: string) => void;
  deleteSelection: () => void;
  placeRing: (template: RingTemplate, center: Point, attachment: RingAttachment) => void;
  loadMolecule: (mol: Molecule) => void;
  /** Reopens a full saved project (molecule + annotations + view), unlike
   * loadMolecule which is also used for MOL/CDXML/PubChem imports that
   * intentionally only ever bring in a molecule. See io/project.ts. */
  loadProject: (data: { molecule: Molecule; annotations: Record<string, Annotation>; view: ViewTransform }) => void;
  importCompound: (mol: Molecule) => void;
  pasteFragment: (fragment: { molecule: Molecule; annotations: Annotation[] }) => void;
  rotateSelection: (deltaDeg: number) => void;
  clear: () => void;
  /** Whether anything's changed since the last "clean" point (page load,
   * Clear, or opening/saving a .enlacecraft project file) — drives the
   * close/reload warning; see App.tsx's beforeunload handler. */
  hasUnsavedChanges: boolean;
  /** Marks the current state as saved (called after a successful "Save
   * project"), without otherwise touching anything. */
  markProjectSaved: () => void;

  // --- drag support (position updates without spamming history) ---
  moveAtomsTransient: (moves: Record<string, Point>) => void;
  commitCheckpoint: (before: Snapshot) => void;

  // --- history ---
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/**
 * The canvas background actually rendered, once the dark/light theme is
 * factored in: dark theme's atom/bond/text colors are calibrated to sit on
 * a dark background (light ink on dark canvas), so forcing a plain white
 * canvas underneath them (the "white" canvasBackground setting, meant for
 * light-theme screenshots) would make the whole molecule unreadable.
 * "white" only ever applies in light theme; dark theme always uses its own
 * themed background regardless of the stored preference. Shared by App.tsx
 * (which sets the data-canvas-bg attribute) and MoleculeCanvas (which
 * decides whether to draw the grid-dot pattern), so both agree.
 */
export function effectiveCanvasBackground(theme: Theme, canvasBackground: CanvasBackground): CanvasBackground {
  return theme === "dark" ? "theme" : canvasBackground;
}

export const useMoleculeStore = create<MoleculeStore>((set, get) => {
  /** Applies a structural edit, pushing the previous state onto the undo stack. */
  const commit = (mutate: (mol: Molecule) => Molecule) => {
    set((s) => {
      const next = mutate(s.molecule);
      if (next === s.molecule) return s;
      return {
        molecule: next,
        past: [...s.past, { molecule: s.molecule, annotations: s.annotations }].slice(-HISTORY_LIMIT),
        future: [],
        hasUnsavedChanges: true,
      };
    });
  };

  /** Same as `commit`, but for the annotations map (arrows/text boxes). */
  const commitAnnotations = (mutate: (anns: Record<string, Annotation>) => Record<string, Annotation>) => {
    set((s) => {
      const next = mutate(s.annotations);
      if (next === s.annotations) return s;
      return {
        annotations: next,
        past: [...s.past, { molecule: s.molecule, annotations: s.annotations }].slice(-HISTORY_LIMIT),
        future: [],
        hasUnsavedChanges: true,
      };
    });
  };

  return {
    molecule: M.emptyMolecule(),
    past: [],
    hasUnsavedChanges: false,
    future: [],

    annotations: {},
    selectedAnnotationIds: new Set(),
    editingTextId: null,
    arrowVariant: "forward",
    arrowBarb: "full",
    arrowPreview: null,
    bracketPairPreview: null,
    bracketVariant: "paren",
    bracketFacing: "open",

    tool: "select",
    atomElement: "C",
    atomGroup: null,
    atomIsotope: null,
    atomEditTarget: null,
    hoverAtomId: null,
    hoverBondId: null,
    hoverPoint: null,
    atomLabelRevealTargets: new Set(),
    ringTemplateId: "benzene",
    selected: new Set(),
    view: { scale: 1, tx: 0, ty: 0 },
    theme: "light",
    // Defaults to a plain white canvas (screenshot-ready out of the box);
    // "theme" restores the normal off-white/dark themed background + grid.
    canvasBackground: "white",
    language: detectInitialLanguage(),
    sidebarWidth: detectInitialSidebarWidth(),
    status: "status.ready",
    bondPreview: null,
    chainPreview: null,
    marqueeRect: null,
    showHydrogens: false,
    monochromeAtoms: false,
    canvasSize: { width: 800, height: 600 },

    setTool: (t) => set({ tool: t }),
    setAtomElement: (e) => set({ atomElement: e, atomGroup: null, atomIsotope: null }),
    setAtomGroup: (g) => set({ atomGroup: g, atomIsotope: null }),
    setAtomIsotope: (presetId) => set({ atomIsotope: presetId, atomGroup: null }),
    setAtomEditTarget: (id) => set({ atomEditTarget: id }),
    setHoverAtomId: (id) => set({ hoverAtomId: id }),
    setHoverBondId: (id) => set({ hoverBondId: id }),
    setHoverPoint: (p) => set({ hoverPoint: p }),
    setAtomLabelRevealTargets: (targets) => set({ atomLabelRevealTargets: targets }),
    setRingTemplateId: (id) => set({ ringTemplateId: id }),
    setSelected: (s) => set({ selected: s }),
    setView: (v) => set((s) => ({ view: typeof v === "function" ? v(s.view) : v })),
    toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    toggleCanvasBackground: () => set((s) => ({ canvasBackground: s.canvasBackground === "white" ? "theme" : "white" })),
    toggleLanguage: () =>
      set((s) => {
        const next: Lang = s.language === "en" ? "es" : "en";
        try {
          localStorage.setItem(LANG_STORAGE_KEY, next);
        } catch {
          // ignore — persistence is a nicety, not a requirement
        }
        return { language: next };
      }),
    setSidebarWidth: (w) => {
      const clamped = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(w)));
      try {
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
      } catch {
        // ignore — persistence is a nicety, not a requirement
      }
      set({ sidebarWidth: clamped });
    },
    setStatus: (s) => set({ status: s }),
    setBondPreview: (p) => set({ bondPreview: p }),
    setChainPreview: (p) => set({ chainPreview: p }),
    setMarqueeRect: (r) => set({ marqueeRect: r }),
    toggleShowHydrogens: () => set((s) => ({ showHydrogens: !s.showHydrogens })),
    toggleMonochromeAtoms: () => set((s) => ({ monochromeAtoms: !s.monochromeAtoms })),
    setCanvasSize: (size) => set({ canvasSize: size }),
    selectAll: () => set((s) => ({ selected: new Set(Object.keys(s.molecule.atoms)) })),
    clearSelection: () => set({ selected: new Set() }),

    setSelectedAnnotationIds: (ids) => set({ selectedAnnotationIds: ids }),
    setEditingTextId: (id) => set({ editingTextId: id }),
    setArrowVariant: (v) => set({ arrowVariant: v }),
    setArrowBarb: (b) => set({ arrowBarb: b }),
    setArrowPreview: (p) => set({ arrowPreview: p }),
    setBracketPairPreview: (p) => set({ bracketPairPreview: p }),
    setBracketVariant: (v) => set({ bracketVariant: v }),
    setBracketFacing: (f) => set({ bracketFacing: f }),

    addAtom: (p, element, group, isotope) => {
      const id = nextId();
      commit((mol) => M.addAtom(mol, id, p, element, group, isotope));
      return id;
    },

    addBond: (a1, a2, order = 1, stereo = "none") => {
      commit((mol) => M.addBond(mol, nextId(), a1, a2, order, stereo));
    },

    addChain: (fromAtomId, anchor, points) => {
      if (fromAtomId === null && points.length === 0) {
        // Plain click on empty canvas: just the one new carbon, same as
        // the atom tool — no bonds, nothing else to grow yet.
        get().addAtom(anchor, "C");
        return;
      }
      if (fromAtomId !== null && points.length === 0) return; // click on an existing atom with no drag: no-op
      commit((mol) => {
        let next = mol;
        let prevId = fromAtomId;
        if (prevId === null) {
          prevId = nextId();
          next = M.addAtom(next, prevId, anchor, "C");
        }
        for (const p of points) {
          const atomId = nextId();
          next = M.addAtom(next, atomId, p, "C");
          next = M.addBond(next, nextId(), prevId, atomId, 1, "none");
          prevId = atomId;
        }
        return next;
      });
    },

    setAtomElementOf: (id, element) => commit((mol) => M.setAtomElement(mol, id, element)),
    setAtomGroupOf: (id, group) => commit((mol) => M.setAtomGroup(mol, id, group)),
    setAtomIsotopeOf: (id, presetId) => {
      const preset = ISOTOPE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      commit((mol) => M.setAtomIsotope(mol, id, preset.element, preset.massNumber));
    },
    clearAtomIsotopeOf: (id) => commit((mol) => M.clearAtomIsotope(mol, id)),
    cycleAtomStereoLabel: (id) => commit((mol) => M.cycleAtomStereoLabel(mol, id)),
    setAtomCharge: (id, delta) => commit((mol) => M.setAtomCharge(mol, id, delta)),
    setAtomChargeOffset: (id, dx, dy) => commit((mol) => M.setAtomChargeOffset(mol, id, dx, dy)),
    setAtomLonePairsOffset: (id, dx, dy) => commit((mol) => M.setAtomLonePairsOffset(mol, id, dx, dy)),
    setAtomRadicalOffset: (id, dx, dy) => commit((mol) => M.setAtomRadicalOffset(mol, id, dx, dy)),
    setAtomStereoLabelOffset: (id, dx, dy) => commit((mol) => M.setAtomStereoLabelOffset(mol, id, dx, dy)),
    cycleAtomLonePairs: (id) => commit((mol) => M.cycleAtomLonePairs(mol, id)),
    toggleAtomRadical: (id) => commit((mol) => M.toggleAtomRadical(mol, id)),
    setBondOrder: (id, order) => commit((mol) => M.setBondOrder(mol, id, order)),
    setBondStereo: (id, stereo) => commit((mol) => M.setBondStereo(mol, id, stereo)),
    cycleDoubleBondSide: (id) => commit((mol) => M.cycleDoubleBondSide(mol, id)),
    deleteAtom: (id) => commit((mol) => M.deleteAtom(mol, id)),
    deleteBond: (id) => commit((mol) => M.deleteBond(mol, id)),

    deleteSelection: () => {
      const { selected } = get();
      if (selected.size === 0) return;
      commit((mol) => {
        let next = mol;
        selected.forEach((id) => { next = M.deleteAtom(next, id); });
        return next;
      });
      set({ selected: new Set() });
    },

    placeRing: (template, center, attachment) => {
      commit((mol) => placeRingImpl(mol, template, center, attachment));
    },

    loadMolecule: (mol) => set({ molecule: mol, past: [], future: [], selected: new Set(), hasUnsavedChanges: true }),
    loadProject: (data) => set({
      molecule: data.molecule,
      annotations: data.annotations,
      view: data.view,
      past: [],
      future: [],
      selected: new Set(),
      selectedAnnotationIds: new Set(),
      // Just opened exactly what's on disk — nothing to save yet.
      hasUnsavedChanges: false,
    }),
    markProjectSaved: () => set({ hasUnsavedChanges: false }),

    importCompound: (mol) => {
      if (Object.keys(mol.atoms).length === 0) return;
      const { molecule, view, canvasSize } = get();
      const baseBox = M.boundingBox(molecule);
      const incomingBox = M.boundingBox(mol);
      let dx = 0;
      let dy = 0;
      if (incomingBox) {
        if (baseBox) {
          // Drop the new compound just to the right of whatever's already drawn.
          const margin = 60;
          dx = baseBox.maxX + margin - incomingBox.minX;
          dy = (baseBox.minY + baseBox.maxY) / 2 - (incomingBox.minY + incomingBox.maxY) / 2;
        } else {
          // Canvas is empty: center the new compound on whatever's actually
          // visible right now, not the world origin — the origin sits at the
          // canvas's top-left corner (view starts at tx=0, ty=0), not its
          // middle, so centering there could drop the molecule half off-screen.
          const viewCenterX = (canvasSize.width / 2 - view.tx) / view.scale;
          const viewCenterY = (canvasSize.height / 2 - view.ty) / view.scale;
          dx = viewCenterX - (incomingBox.minX + incomingBox.maxX) / 2;
          dy = viewCenterY - (incomingBox.minY + incomingBox.maxY) / 2;
        }
      }
      const before: Snapshot = { molecule, annotations: get().annotations };
      const { mol: merged, newAtomIds } = M.insertMolecule(molecule, mol, dx, dy);
      set({
        molecule: merged,
        past: [...get().past, before].slice(-HISTORY_LIMIT),
        future: [],
        selected: new Set(newAtomIds),
      });
    },

    clear: () =>
      set({
        molecule: M.emptyMolecule(),
        annotations: {},
        past: [],
        future: [],
        selected: new Set(),
        selectedAnnotationIds: new Set(),
        editingTextId: null,
        hasUnsavedChanges: false,
      }),

    pasteFragment: (fragment) => {
      const hasAtoms = Object.keys(fragment.molecule.atoms).length > 0;
      const hasAnnotations = fragment.annotations.length > 0;
      if (!hasAtoms && !hasAnnotations) return;

      const { molecule, annotations, view, canvasSize } = get();

      // Bounding box of the incoming fragment across both atoms and
      // annotation anchor points, so placement works even for an
      // annotation-only copy (e.g. just a reaction arrow, no structure).
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const a of Object.values(fragment.molecule.atoms)) {
        minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
        minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
      }
      for (const ann of fragment.annotations) {
        if (ann.kind === "arrow") {
          minX = Math.min(minX, ann.x1, ann.x2); maxX = Math.max(maxX, ann.x1, ann.x2);
          minY = Math.min(minY, ann.y1, ann.y2); maxY = Math.max(maxY, ann.y1, ann.y2);
        } else {
          minX = Math.min(minX, ann.x); maxX = Math.max(maxX, ann.x + ann.width);
          minY = Math.min(minY, ann.y); maxY = Math.max(maxY, ann.y + ann.height);
        }
      }

      const baseBox = M.boundingBox(molecule);
      let dx = 0;
      let dy = 0;
      if (baseBox) {
        // Drop the pasted fragment just to the right of whatever's already drawn.
        const margin = 60;
        dx = baseBox.maxX + margin - minX;
        dy = (baseBox.minY + baseBox.maxY) / 2 - (minY + maxY) / 2;
      } else {
        // Canvas is empty: center on whatever's actually visible right now.
        const viewCenterX = (canvasSize.width / 2 - view.tx) / view.scale;
        const viewCenterY = (canvasSize.height / 2 - view.ty) / view.scale;
        dx = viewCenterX - (minX + maxX) / 2;
        dy = viewCenterY - (minY + maxY) / 2;
      }

      const before: Snapshot = { molecule, annotations };
      const { mol: mergedMol, newAtomIds } = M.insertMolecule(molecule, fragment.molecule, dx, dy);

      const nextAnnotations: Record<string, Annotation> = { ...annotations };
      const newAnnotationIds: string[] = [];
      for (const ann of fragment.annotations) {
        const id = nextId();
        newAnnotationIds.push(id);
        if (ann.kind === "arrow") {
          nextAnnotations[id] = { ...ann, id, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy };
        } else {
          nextAnnotations[id] = { ...ann, id, x: ann.x + dx, y: ann.y + dy };
        }
      }

      set({
        molecule: mergedMol,
        annotations: nextAnnotations,
        past: [...get().past, before].slice(-HISTORY_LIMIT),
        future: [],
        selected: new Set(newAtomIds),
        selectedAnnotationIds: new Set(newAnnotationIds),
        hasUnsavedChanges: true,
      });
    },

    rotateSelection: (deltaDeg) => {
      const { molecule, selected } = get();
      const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
      if (ids.length === 0) return;
      let sx = 0;
      let sy = 0;
      for (const id of ids) {
        sx += molecule.atoms[id].x;
        sy += molecule.atoms[id].y;
      }
      const center = { x: sx / ids.length, y: sy / ids.length };
      commit((mol) => M.rotateAtoms(mol, ids, center, (deltaDeg * Math.PI) / 180));
    },

    moveAtomsTransient: (moves) => {
      set((s) => ({ molecule: M.moveAtoms(s.molecule, moves), hasUnsavedChanges: true }));
    },

    commitCheckpoint: (before) => {
      set((s) => ({ past: [...s.past, before].slice(-HISTORY_LIMIT), future: [] }));
    },

    snapshotBefore: () => {
      const { molecule, annotations } = get();
      return { molecule, annotations };
    },

    addTextAnnotation: (p) => {
      const id = nextId();
      const ann: TextAnnotation = {
        id,
        kind: "text",
        x: p.x,
        y: p.y,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT,
        html: "",
        fontSize: DEFAULT_FONT_SIZE,
      };
      commitAnnotations((anns) => ({ ...anns, [id]: ann }));
      return id;
    },

    addArrowAnnotation: (p1, p2, variant, barb) => {
      const id = nextId();
      const curvature = Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.22;
      const ann: ArrowAnnotation = { id, kind: "arrow", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, variant, curvature, barb };
      commitAnnotations((anns) => ({ ...anns, [id]: ann }));
      return id;
    },

    addBracketAnnotation: (p, variant, facing) => {
      const id = nextId();
      const ann: BracketAnnotation = {
        id,
        kind: "bracket",
        x: p.x,
        y: p.y,
        width: DEFAULT_BRACKET_WIDTH,
        height: DEFAULT_BRACKET_HEIGHT,
        variant,
        facing,
      };
      commitAnnotations((anns) => ({ ...anns, [id]: ann }));
      return id;
    },

    /**
     * Places an open + close bracket as a matched pair from one drag gesture:
     * the dragged rectangle becomes the enclosed region, with an open
     * bracket hugging its left edge and a close bracket hugging its right
     * edge (both hooking inward), sized to the rectangle's height. A
     * near-zero drag (an effective click) falls back to a reasonable
     * default gap/height instead of a degenerate sliver-sized pair — same
     * reasoning as the single arrow tool's near-zero-drag fallback.
     * The two are otherwise ordinary independent annotations from this
     * point on — each has its own id, and its own resize handle/drag once
     * placed, with no ongoing link between them.
     */
    addBracketPair: (corner1, corner2, variant) => {
      const { left, right, top, height } = bracketPairLayout(corner1, corner2);

      const openId = nextId();
      const closeId = nextId();
      const open: BracketAnnotation = {
        id: openId, kind: "bracket",
        x: left - DEFAULT_BRACKET_WIDTH, y: top, width: DEFAULT_BRACKET_WIDTH, height,
        variant, facing: "open",
      };
      const close: BracketAnnotation = {
        id: closeId, kind: "bracket",
        x: right, y: top, width: DEFAULT_BRACKET_WIDTH, height,
        variant, facing: "close",
      };
      commitAnnotations((anns) => ({ ...anns, [openId]: open, [closeId]: close }));
      return { openId, closeId };
    },

    /**
     * The reaction-scheme "+" stamp: an ordinary bold text annotation (not
     * a new annotation kind) placed centered on the click point, for
     * joining reactants/products in a scheme ("A + B -> C"). Left as a
     * plain, independently-editable text box afterward — same as any other
     * text annotation.
     */
    addPlusAnnotation: (p) => {
      const id = nextId();
      const ann: TextAnnotation = {
        id,
        kind: "text",
        x: p.x - PLUS_BOX_WIDTH / 2,
        y: p.y - PLUS_BOX_HEIGHT / 2,
        width: PLUS_BOX_WIDTH,
        height: PLUS_BOX_HEIGHT,
        html: "<b>+</b>",
        fontSize: PLUS_FONT_SIZE,
      };
      commitAnnotations((anns) => ({ ...anns, [id]: ann }));
      return id;
    },

    /**
     * Creates an empty, immediately-editable text box positioned just above
     * the midpoint of the single currently-selected reaction arrow — the
     * conventional place to write reagents/conditions. This is a one-time
     * positioning convenience: the new text box is an ordinary independent
     * text annotation with no lasting link to the arrow, so moving the
     * arrow afterward won't drag the text with it. No-op (returns null)
     * unless exactly one arrow annotation is selected.
     */
    addReagentText: () => {
      const { annotations, selectedAnnotationIds } = get();
      if (selectedAnnotationIds.size !== 1) return null;
      const [onlyId] = selectedAnnotationIds;
      const arrow = annotations[onlyId];
      if (!arrow || arrow.kind !== "arrow") return null;

      const midX = (arrow.x1 + arrow.x2) / 2;
      const midY = (arrow.y1 + arrow.y2) / 2;
      const id = nextId();
      const ann: TextAnnotation = {
        id,
        kind: "text",
        x: midX - DEFAULT_TEXT_WIDTH / 2,
        y: midY - DEFAULT_TEXT_HEIGHT - REAGENT_TEXT_GAP_ABOVE_ARROW,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT,
        html: "",
        fontSize: DEFAULT_FONT_SIZE,
      };
      commitAnnotations((anns) => ({ ...anns, [id]: ann }));
      set({ selectedAnnotationIds: new Set([id]), editingTextId: id });
      return id;
    },

    updateTextHtml: (id, html) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "text") return s;
        return { annotations: { ...s.annotations, [id]: { ...ann, html } } };
      });
    },

    updateTextSize: (id, width, height) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "text") return s;
        if (ann.width === width && ann.height === height) return s;
        return { annotations: { ...s.annotations, [id]: { ...ann, width, height } } };
      });
    },

    updateTextFontSize: (id, fontSize) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "text") return anns;
        return { ...anns, [id]: { ...ann, fontSize } };
      });
    },

    stepTextFontSize: (id, delta) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "text") return anns;
        const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, ann.fontSize + delta));
        if (next === ann.fontSize) return anns;
        return { ...anns, [id]: { ...ann, fontSize: next } };
      });
    },

    updateBracketSize: (id, width, height) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "bracket") return s;
        if (ann.width === width && ann.height === height) return s;
        return { annotations: { ...s.annotations, [id]: { ...ann, width, height } } };
      });
    },

    setBracketStyleOf: (id, variant, facing) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "bracket") return anns;
        return { ...anns, [id]: { ...ann, variant, facing } };
      });
    },

    moveAnnotationTransient: (id, p) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann) return s;
        if (ann.kind === "text" || ann.kind === "bracket") {
          return { annotations: { ...s.annotations, [id]: { ...ann, x: p.x, y: p.y } } };
        }
        // Arrow: `p` here is the new position of the arrow's start point;
        // the whole segment translates together, keeping its shape.
        const dx = p.x - ann.x1;
        const dy = p.y - ann.y1;
        return {
          annotations: {
            ...s.annotations,
            [id]: { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy },
          },
        };
      });
    },

    /**
     * Moves several annotations together as a group while dragging (e.g.
     * one is grabbed while multiple are selected). `origins` is a snapshot
     * of each annotation as it was at drag start, and (dx, dy) is the total
     * offset from that start — computing from the fixed origin each call
     * (rather than accumulating deltas) avoids any drift across renders.
     */
    moveAnnotationsTransient: (origins, dx, dy) => {
      set((s) => {
        const next = { ...s.annotations };
        for (const id in origins) {
          if (!(id in next)) continue;
          const orig = origins[id];
          next[id] =
            orig.kind === "arrow"
              ? { ...orig, x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy }
              : { ...orig, x: orig.x + dx, y: orig.y + dy };
        }
        return { annotations: next };
      });
    },

    updateArrowEndpointTransient: (id, which, p) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "arrow") return s;
        return {
          annotations: {
            ...s.annotations,
            [id]: which === "start" ? { ...ann, x1: p.x, y1: p.y } : { ...ann, x2: p.x, y2: p.y },
          },
        };
      });
    },

    updateArrowCurvatureTransient: (id, curvature) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "arrow") return s;
        return { annotations: { ...s.annotations, [id]: { ...ann, curvature } } };
      });
    },

    setArrowVariantOf: (id, variant) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "arrow") return anns;
        return { ...anns, [id]: { ...ann, variant } };
      });
    },

    deleteAnnotation: (id) => {
      commitAnnotations((anns) => {
        if (!(id in anns)) return anns;
        const next = { ...anns };
        delete next[id];
        return next;
      });
      set((s) => {
        const nextSelected = new Set(s.selectedAnnotationIds);
        nextSelected.delete(id);
        return {
          selectedAnnotationIds: nextSelected,
          editingTextId: s.editingTextId === id ? null : s.editingTextId,
        };
      });
    },

    deleteAnnotations: (ids) => {
      if (ids.size === 0) return;
      commitAnnotations((anns) => {
        let changed = false;
        const next = { ...anns };
        ids.forEach((id) => {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : anns;
      });
      set((s) => ({
        selectedAnnotationIds: new Set(),
        editingTextId: s.editingTextId && ids.has(s.editingTextId) ? null : s.editingTextId,
      }));
    },

    undo: () => {
      const { past, molecule, annotations, future } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({
        molecule: prev.molecule,
        annotations: prev.annotations,
        past: past.slice(0, -1),
        future: [{ molecule, annotations }, ...future],
      });
    },

    redo: () => {
      const { future, molecule, annotations, past } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({
        molecule: next.molecule,
        annotations: next.annotations,
        future: future.slice(1),
        past: [...past, { molecule, annotations }],
      });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  };
});
