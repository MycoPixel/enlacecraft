import { create } from "zustand";
import type {
  Annotation, ArrowAnnotation, ArrowHeadSize, ArrowPreview, ArrowVariant, AtomMoveAnchor, BondOrder, BondPreview, BondStereo, BracketAnnotation, BracketFacing, BracketVariant, CanvasBackground, ChainPreview, Element, FunctionalGroupAttachment, FunctionalGroupTemplate, MarqueeRect, Molecule, Point, RingAttachment, RingTemplate, TextAnnotation, Theme, ToolId, ViewTransform,
} from "../types/chemistry";
import type { Lang } from "../i18n/translations";
import { translate } from "../i18n/translate";
import * as M from "../model/molecule";
import { nextId } from "../model/id";
import { placeRing as placeRingImpl } from "../engine/ringPlacement";
import { placeFunctionalGroup as placeFunctionalGroupImpl } from "../engine/functionalGroupPlacement";
import { bracketPairLayout } from "../model/geometry";
import { DEFAULT_BRACKET_WIDTH, DEFAULT_BRACKET_HEIGHT, ISOTOPE_PRESETS } from "../model/constants";
import { type UserTemplate, loadUserTemplates, addUserTemplate, removeUserTemplate, addImportedUserTemplates } from "../model/userTemplates";
import { parseAtomLabel } from "../model/atomLabelParser";

const HISTORY_LIMIT = 100;

const DEFAULT_VIEW: ViewTransform = { scale: 1, tx: 0, ty: 0 };

/** The very first tab every session starts with — there must always be at
 * least one, so this exists outside the store's own id generation flow. */
const INITIAL_TAB_ID = `tab-${nextId()}`;

const LANG_STORAGE_KEY = "enlacecraft-lang";
const SIDEBAR_WIDTH_STORAGE_KEY = "enlacecraft-sidebar-width";
const ONBOARDING_STORAGE_KEY = "enlacecraft-onboarding-seen";
const DEFAULT_SIDEBAR_WIDTH = 112;
const MIN_SIDEBAR_WIDTH = 88;
const MAX_SIDEBAR_WIDTH = 280;

/** Everything undo/redo restores together. */
interface Snapshot {
  molecule: Molecule;
  annotations: Record<string, Annotation>;
}

/**
 * A whole tab's worth of document state — everything Snapshot covers, plus
 * the pan/zoom and undo/redo history, which are also naturally per-document
 * (switching tabs shouldn't let you undo into a different drawing, and
 * each drawing should reopen at whatever pan/zoom it was left at).
 *
 * Only INACTIVE tabs are stored this way, in `tabDocuments`; the active
 * tab's copy of this same data instead lives directly in the store's
 * top-level `molecule`/`annotations`/`view`/`past`/`future` fields — which
 * is what every existing action/component already reads and writes, so
 * none of that code needed to change to support multiple tabs. addTab /
 * switchToTab / closeTab move data between the two representations at the
 * moment of switching, rather than keeping tabDocuments continuously
 * synced (which would mean re-serializing on every keystroke for no
 * benefit, since nothing reads an inactive tab's data in between).
 */
interface TabDocument {
  molecule: Molecule;
  annotations: Record<string, Annotation>;
  view: ViewTransform;
  past: Snapshot[];
  future: Snapshot[];
  hasUnsavedChanges: boolean;
}

/** What the tab strip UI needs for every tab, active or not. */
export interface TabInfo {
  id: string;
  title: string;
}

/** One tab's full data as it appears in a saved .enlacecraft project file
 * (or is handed back out when saving one) — see io/project.ts. */
export interface SavedTab {
  id: string;
  title: string;
  molecule: Molecule;
  annotations: Record<string, Annotation>;
  view: ViewTransform;
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

function detectHasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    // localStorage unavailable — default to showing the welcome tour once,
    // same as a genuinely first-ever visit; worst case it reappears next
    // session too, which is harmless.
    return false;
  }
}

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

  // --- tabs: multiple drawings within one project. Only the active tab's
  // document lives in the top-level molecule/annotations/view/past/future
  // fields above/below (see TabDocument's doc comment); tabDocuments holds
  // the rest. ---
  tabs: TabInfo[];
  activeTabId: string;
  tabDocuments: Record<string, TabDocument>;

  // --- annotation state (reaction arrows / text boxes) ---
  annotations: Record<string, Annotation>;
  selectedAnnotationIds: Set<string>;
  editingTextId: string | null;
  arrowVariant: ArrowVariant;
  arrowBarb: "full" | "single";
  /** Full-arrowhead size for newly-drawn arrows; see ArrowAnnotation.headSize. */
  arrowHeadSize: ArrowHeadSize;
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
  /** Atom currently showing the free-text label editor (see
   * AtomLabelEditor / model/atomLabelParser.ts) — at most one at a time,
   * opened by middle-clicking an atom, press-and-holding it on touch, or
   * pressing Enter while it's the sole target, closed on
   * commit/Escape/blur. */
  labelEditTarget: string | null;
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
  functionalGroupTemplateId: string;
  /** Manual rotation offset (radians), adjustable by scrolling while
   * hovering the canvas with the functional-group tool active, applied on
   * top of the automatic "point away from existing bonds" orientation —
   * see engine/functionalGroupPlacement.ts. Resets to 0 whenever a
   * different template is picked. */
  /** Explicit angle (radians) for the pending functional-group placement,
   * set by dragging out from the attach point/click before releasing —
   * the same press-drag-release interaction as drawing a bond (see
   * useCanvasInteractions' "functional-group" drag mode). Null means no
   * explicit angle was dragged, so placement falls back to the automatic
   * "point away from existing bonds" orientation — see
   * engine/functionalGroupPlacement.ts. Reset to null after every
   * placement and whenever a different template is picked. */
  functionalGroupDesiredAngle: number | null;
  /** Set for the duration of a functional-group drag (see
   * useCanvasInteractions' "functional-group" drag mode) to the attach
   * point/atom fixed at press time — mirrors bond-dragging keeping its
   * `from` atom fixed while only the angle changes as the cursor moves.
   * MoleculeCanvas's hover/drag preview uses this instead of the live
   * hover position while it's set, so the preview doesn't jump to a
   * different atom if the cursor happens to drift over one mid-drag. Null
   * whenever nothing's being dragged (a plain hover, or not using the
   * tool at all). */
  functionalGroupPendingPlacement: { template: FunctionalGroupTemplate; attachment: FunctionalGroupAttachment; center: Point } | null;
  selected: Set<string>;
  view: ViewTransform;
  theme: Theme;
  /** The drawing canvas's own background — separate from the light/dark
   * app theme; see CanvasBackground's doc comment. */
  canvasBackground: CanvasBackground;
  /** Overlay square grid lines on the canvas — independent of
   * canvasBackground (works with either a white or themed background).
   * Off by default; purely a visual drawing aid, no effect on the model. */
  showGrid: boolean;
  language: Lang;
  /** Desktop sidebar's width in px, user-resizable by dragging its edge;
   * persisted across sessions like language. Unused on mobile (which uses
   * MobileToolbar instead). */
  sidebarWidth: number;
  status: string;
  bondPreview: BondPreview | null;
  /** See AtomMoveAnchor — set only while dragging a single, singly-bonded
   * atom without Shift held, so MoleculeCanvas can show the same
   * length/angle readout drawing a bond shows. */
  atomMoveAnchor: AtomMoveAnchor | null;
  /** Live drag-to-grow preview for the chain tool; see engine/chainPlacement.ts. */
  chainPreview: ChainPreview | null;
  marqueeRect: MarqueeRect | null;
  showHydrogens: boolean;
  /** Draws every carbon's implicit hydrogens as real bonds + "H" labels
   * fanned out around it — a full "expanded structural formula" view, as
   * opposed to showHydrogens which only adds compact "CH3"-style text to
   * existing atom labels. Carbon-only: heteroatoms already spell out their
   * own H count in their label ("OH", "NH2", ...) regardless of this
   * toggle, so there's nothing more for it to add there — see
   * engine/explicitHydrogens.ts. Purely a rendering toggle: never touches
   * the actual Molecule, so it has no effect on undo/redo, valence checks,
   * or any export format other than making the extra bonds/labels visible
   * in it too. */
  showExpandedFormula: boolean;
  monochromeAtoms: boolean;
  /** Current on-screen pixel size of the canvas <svg>, kept in sync by MoleculeCanvas via ResizeObserver. */
  canvasSize: { width: number; height: number };

  // --- setters ---
  setTool: (t: ToolId) => void;
  setAtomElement: (e: Element) => void;
  setAtomGroup: (g: string | null) => void;
  setAtomIsotope: (presetId: string | null) => void;
  setAtomEditTarget: (id: string | null) => void;
  setLabelEditTarget: (id: string | null) => void;
  setHoverAtomId: (id: string | null) => void;
  setHoverBondId: (id: string | null) => void;
  setHoverPoint: (p: Point | null) => void;
  setAtomLabelRevealTargets: (targets: Set<string>) => void;
  setRingTemplateId: (id: string) => void;
  setFunctionalGroupTemplateId: (id: string) => void;
  setFunctionalGroupDesiredAngle: (angle: number | null) => void;
  setFunctionalGroupPendingPlacement: (p: { template: FunctionalGroupTemplate; attachment: FunctionalGroupAttachment; center: Point } | null) => void;
  setSelected: (s: Set<string>) => void;
  setView: (v: ViewTransform | ((v: ViewTransform) => ViewTransform)) => void;
  toggleTheme: () => void;
  toggleCanvasBackground: () => void;
  toggleShowGrid: () => void;
  toggleLanguage: () => void;
  setSidebarWidth: (w: number) => void;
  setStatus: (s: string) => void;
  setBondPreview: (p: BondPreview | null) => void;
  setAtomMoveAnchor: (a: AtomMoveAnchor | null) => void;
  setChainPreview: (p: ChainPreview | null) => void;
  setMarqueeRect: (r: MarqueeRect | null) => void;
  toggleShowHydrogens: () => void;
  toggleShowExpandedFormula: () => void;
  toggleMonochromeAtoms: () => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // --- annotation setters / actions ---
  setSelectedAnnotationIds: (ids: Set<string>) => void;
  setEditingTextId: (id: string | null) => void;
  setArrowVariant: (v: ArrowVariant) => void;
  setArrowBarb: (b: "full" | "single") => void;
  setArrowHeadSize: (s: ArrowHeadSize) => void;
  setArrowPreview: (p: ArrowPreview | null) => void;
  setBracketPairPreview: (p: ArrowPreview | null) => void;
  setBracketVariant: (v: BracketVariant) => void;
  setBracketFacing: (f: BracketFacing) => void;
  addTextAnnotation: (p: Point) => string;
  addArrowAnnotation: (p1: Point, p2: Point, variant: ArrowVariant, barb?: "full" | "single", headSize?: ArrowHeadSize) => string;
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
  setArrowBarbOf: (id: string, barb: "full" | "single") => void;
  setArrowHeadSizeOf: (id: string, headSize: ArrowHeadSize) => void;
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
  /** Parses free-typed text (model/atomLabelParser.ts) and applies
   * whichever result it resolves to — a real element, a preset group, a
   * custom condensed formula, or a generic placeholder label. Invalid
   * input leaves the atom untouched and sets a status message instead. */
  setAtomLabelOf: (id: string, raw: string) => void;
  setAtomIsotopeOf: (id: string, presetId: string) => void;
  clearAtomIsotopeOf: (id: string) => void;
  cycleAtomStereoLabel: (id: string) => void;
  setAtomCharge: (id: string, delta: number) => void;
  setAtomChargeOffset: (id: string, dx: number, dy: number) => void;
  setLonePairOffset: (id: string, index: number, x: number, y: number) => void;
  clearLonePairOffset: (id: string, index: number) => void;
  setAtomRadicalOffset: (id: string, dx: number, dy: number) => void;
  setAtomStereoLabelOffset: (id: string, dx: number, dy: number) => void;
  cycleAtomLonePairs: (id: string) => void;
  toggleAtomRadical: (id: string) => void;
  setBondOrder: (id: string, order: BondOrder) => void;
  setBondStereo: (id: string, stereo: BondStereo) => void;
  /** Swaps a wedge/dash bond's narrow and wide ends in place. */
  flipBondDirection: (id: string) => void;
  cycleDoubleBondSide: (id: string) => void;
  deleteAtom: (id: string) => void;
  deleteBond: (id: string) => void;
  /**
   * Same deletions as deleteAtom/deleteBond, but without pushing an undo
   * step each time — for the erase tool's click-and-drag, which erases
   * everything under the cursor as you drag and should undo as one single
   * stroke (via commitCheckpoint), not one step per atom/bond touched. See
   * moveAtomsTransient for the same pattern applied to dragging atoms.
   */
  deleteAtomTransient: (id: string) => void;
  deleteBondTransient: (id: string) => void;
  deleteSelection: () => void;
  placeRing: (template: RingTemplate, center: Point, attachment: RingAttachment) => void;
  placeFunctionalGroup: (template: FunctionalGroupTemplate, center: Point, attachment: FunctionalGroupAttachment) => void;
  loadMolecule: (mol: Molecule) => void;
  /** Reopens a full saved project — every tab it had, unlike loadMolecule
   * which is also used for MOL/CDXML/PubChem imports that intentionally
   * only ever bring in a molecule into the current tab. See io/project.ts. */
  loadProject: (data: { activeTabId: string; tabs: SavedTab[] }) => void;
  /** Assembles every tab's current data (the active tab's from the live
   * top-level fields, everything else from tabDocuments) for "Save
   * project" to write out — see io/project.ts. */
  getAllTabsForSave: () => SavedTab[];
  /** Adds a new, blank tab and switches to it. */
  addTab: () => void;
  /** Switches to a tab that already exists (a no-op if `id` isn't one of `tabs`). */
  switchToTab: (id: string) => void;
  /** Closes a tab. Refuses to close the last remaining one — there must
   * always be something to draw on — so callers should hide/disable the
   * close affordance when `tabs.length <= 1`. Closing the active tab
   * switches to a neighbor first. Doesn't ask for confirmation itself;
   * that's on the caller (TabBar), the same way ClearDrawingButton owns
   * its own confirmation rather than the store deciding when to prompt. */
  closeTab: (id: string) => void;
  renameTab: (id: string, title: string) => void;
  importCompound: (mol: Molecule) => void;
  pasteFragment: (fragment: { molecule: Molecule; annotations: Annotation[] }) => void;
  userTemplates: UserTemplate[];
  /** See detectHasSeenOnboarding — whether the first-run welcome tour has
   * already been shown (and dismissed/completed) at least once. */
  hasSeenOnboarding: boolean;
  markOnboardingSeen: () => void;
  /** Extracts whatever's currently selected (atoms + any selected
   * annotations) into a new saved template under the given name. A no-op
   * if nothing's selected. */
  saveUserTemplate: (label: string) => void;
  deleteUserTemplate: (id: string) => void;
  /** Merges templates from an imported .enlacebookmarks file (see
   * io/templateBookmarks.ts) into the saved list — always additive
   * (fresh ids per addImportedUserTemplates), never overwrites. */
  importUserTemplates: (templates: UserTemplate[]) => void;
  rotateSelection: (deltaDeg: number) => void;
  alignSelection: (mode: M.AlignMode) => void;
  distributeSelection: (axis: M.DistributeAxis) => void;
  cleanUpSelection: () => void;
  clear: () => void;
  /** Resets pan/zoom — to the app's default starting view when the canvas
   * is empty, or fit-and-centered on whatever's actually drawn otherwise.
   * Doesn't touch the molecule/annotations themselves; see clear() for
   * that. */
  resetView: () => void;
  /** Whether the *active tab* has changed since its last "clean" point
   * (page load, Clear, or opening/saving a .enlacecraft project file).
   * Inactive tabs track the same thing in their own tabDocuments entry.
   * App.tsx's close/reload warning (and Electron's) checks both — this
   * alone, plus every tabDocuments entry, since either can be dirty. */
  hasUnsavedChanges: boolean;
  /** Marks the active tab AND every other tab as saved (called after a
   * successful "Save project", which writes out all of them at once). */
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

  /** Tab titles default to "Tab N"; N counts up from however many tabs
   * have ever existed this session (not the current tab count), so
   * closing "Tab 2" and adding a new one doesn't confusingly reuse the
   * name of a tab that's still open elsewhere. */
  let tabNumberCounter = 1;

  /** Packages the active tab's live top-level fields into the same shape
   * tabDocuments stores inactive tabs in — used when a tab stops being
   * active (see addTab/switchToTab/closeTab). */
  const snapshotActiveDocument = (s: MoleculeStore): TabDocument => ({
    molecule: s.molecule,
    annotations: s.annotations,
    view: s.view,
    past: s.past,
    future: s.future,
    hasUnsavedChanges: s.hasUnsavedChanges,
  });

  /** Selection/hover/in-progress-edit state is inherently tied to whatever
   * tab it was set in (it's all atom/annotation ids, or a preview anchored
   * to one) — carrying it across a tab switch would either point at
   * nothing or, worse, at a same-numbered id that means something
   * different in the new tab. Every tab switch clears all of it. */
  const transientResetFields = () => ({
    selected: new Set<string>(),
    selectedAnnotationIds: new Set<string>(),
    hoverAtomId: null,
    hoverBondId: null,
    hoverPoint: null,
    atomEditTarget: null,
    labelEditTarget: null,
    editingTextId: null,
    atomLabelRevealTargets: new Set<string>(),
    bondPreview: null,
    atomMoveAnchor: null,
    arrowPreview: null,
  });

  return {
    molecule: M.emptyMolecule(),
    past: [],
    hasUnsavedChanges: false,
    future: [],

    tabs: [{ id: INITIAL_TAB_ID, title: translate(detectInitialLanguage(), "tab.defaultTitle", { n: 1 }) }],
    activeTabId: INITIAL_TAB_ID,
    tabDocuments: {},

    annotations: {},
    selectedAnnotationIds: new Set(),
    editingTextId: null,
    arrowVariant: "forward",
    arrowBarb: "full",
    arrowHeadSize: "medium",
    arrowPreview: null,
    bracketPairPreview: null,
    bracketVariant: "paren",
    bracketFacing: "open",

    tool: "select",
    atomElement: "C",
    atomGroup: null,
    atomIsotope: null,
    atomEditTarget: null,
    labelEditTarget: null,
    hoverAtomId: null,
    hoverBondId: null,
    hoverPoint: null,
    atomLabelRevealTargets: new Set(),
    ringTemplateId: "benzene",
    functionalGroupTemplateId: "carboxylic-acid",
    functionalGroupDesiredAngle: null,
    functionalGroupPendingPlacement: null,
    selected: new Set(),
    view: { scale: 1, tx: 0, ty: 0 },
    theme: "light",
    // Defaults to a plain white canvas (screenshot-ready out of the box);
    // "theme" restores the normal off-white/dark themed background + grid.
    canvasBackground: "white",
    showGrid: false,
    language: detectInitialLanguage(),
    sidebarWidth: detectInitialSidebarWidth(),
    userTemplates: loadUserTemplates(),
    hasSeenOnboarding: detectHasSeenOnboarding(),
    status: "status.ready",
    bondPreview: null,
    atomMoveAnchor: null,
    chainPreview: null,
    marqueeRect: null,
    showHydrogens: false,
    showExpandedFormula: false,
    monochromeAtoms: false,
    canvasSize: { width: 800, height: 600 },

    setTool: (t) => set({ tool: t }),
    setAtomElement: (e) => set({ atomElement: e, atomGroup: null, atomIsotope: null }),
    setAtomGroup: (g) => set({ atomGroup: g, atomIsotope: null }),
    setAtomIsotope: (presetId) => set({ atomIsotope: presetId, atomGroup: null }),
    setAtomEditTarget: (id) => set({ atomEditTarget: id }),
    setLabelEditTarget: (id) => set({ labelEditTarget: id }),
    setHoverAtomId: (id) => set({ hoverAtomId: id }),
    setHoverBondId: (id) => set({ hoverBondId: id }),
    setHoverPoint: (p) => set({ hoverPoint: p }),
    setAtomLabelRevealTargets: (targets) => set({ atomLabelRevealTargets: targets }),
    setRingTemplateId: (id) => set({ ringTemplateId: id }),
    setFunctionalGroupTemplateId: (id) => set({ functionalGroupTemplateId: id, functionalGroupDesiredAngle: null }),
    setFunctionalGroupDesiredAngle: (angle) => set({ functionalGroupDesiredAngle: angle }),
    setFunctionalGroupPendingPlacement: (p) => set({ functionalGroupPendingPlacement: p }),
    setSelected: (s) => set({ selected: s }),
    setView: (v) => set((s) => ({ view: typeof v === "function" ? v(s.view) : v })),
    toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    toggleCanvasBackground: () => set((s) => ({ canvasBackground: s.canvasBackground === "white" ? "theme" : "white" })),
    toggleShowGrid: () => set((s) => ({ showGrid: !s.showGrid })),
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
    setAtomMoveAnchor: (a) => set({ atomMoveAnchor: a }),
    setChainPreview: (p) => set({ chainPreview: p }),
    setMarqueeRect: (r) => set({ marqueeRect: r }),
    toggleShowHydrogens: () => set((s) => ({ showHydrogens: !s.showHydrogens })),
    toggleShowExpandedFormula: () => set((s) => ({ showExpandedFormula: !s.showExpandedFormula })),
    toggleMonochromeAtoms: () => set((s) => ({ monochromeAtoms: !s.monochromeAtoms })),
    setCanvasSize: (size) => set({ canvasSize: size }),
    selectAll: () => set((s) => ({ selected: new Set(Object.keys(s.molecule.atoms)) })),
    clearSelection: () => set({ selected: new Set() }),

    setSelectedAnnotationIds: (ids) => set({ selectedAnnotationIds: ids }),
    setEditingTextId: (id) => set({ editingTextId: id }),
    setArrowVariant: (v) => set({ arrowVariant: v }),
    setArrowBarb: (b) => set({ arrowBarb: b }),
    setArrowHeadSize: (s) => set({ arrowHeadSize: s }),
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
    setAtomLabelOf: (id, raw) => {
      const parsed = parseAtomLabel(raw);
      if (parsed.kind === "invalid") {
        set({ status: "status.invalidLabel" });
        return;
      }
      commit((mol) => {
        let next = mol;
        switch (parsed.kind) {
          case "element":
            next = M.setAtomElement(next, id, parsed.element);
            break;
          case "isotope":
            next = M.setAtomIsotope(next, id, parsed.element, parsed.massNumber);
            break;
          case "presetGroup":
            next = M.setAtomGroup(next, id, parsed.groupId);
            break;
          case "formula":
            next = M.setAtomCustomGroup(next, id, parsed.formula, parsed.formula);
            break;
          case "generic":
            next = M.setAtomCustomGroup(next, id, parsed.text, undefined);
            break;
        }
        return M.setAtomChargeAbsolute(next, id, parsed.charge);
      });
    },
    setAtomIsotopeOf: (id, presetId) => {
      const preset = ISOTOPE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      commit((mol) => M.setAtomIsotope(mol, id, preset.element, preset.massNumber));
    },
    clearAtomIsotopeOf: (id) => commit((mol) => M.clearAtomIsotope(mol, id)),
    cycleAtomStereoLabel: (id) => commit((mol) => M.cycleAtomStereoLabel(mol, id)),
    setAtomCharge: (id, delta) => commit((mol) => M.setAtomCharge(mol, id, delta)),
    setAtomChargeOffset: (id, dx, dy) => commit((mol) => M.setAtomChargeOffset(mol, id, dx, dy)),
    setLonePairOffset: (id, index, x, y) => commit((mol) => M.setLonePairOffset(mol, id, index, x, y)),
    clearLonePairOffset: (id, index) => commit((mol) => M.clearLonePairOffset(mol, id, index)),
    setAtomRadicalOffset: (id, dx, dy) => commit((mol) => M.setAtomRadicalOffset(mol, id, dx, dy)),
    setAtomStereoLabelOffset: (id, dx, dy) => commit((mol) => M.setAtomStereoLabelOffset(mol, id, dx, dy)),
    cycleAtomLonePairs: (id) => commit((mol) => M.cycleAtomLonePairs(mol, id)),
    toggleAtomRadical: (id) => commit((mol) => M.toggleAtomRadical(mol, id)),
    setBondOrder: (id, order) => commit((mol) => M.setBondOrder(mol, id, order)),
    setBondStereo: (id, stereo) => commit((mol) => M.setBondStereo(mol, id, stereo)),
    flipBondDirection: (id) => commit((mol) => M.flipBondDirection(mol, id)),
    cycleDoubleBondSide: (id) => commit((mol) => M.cycleDoubleBondSide(mol, id)),
    deleteAtom: (id) => commit((mol) => M.deleteAtom(mol, id)),
    deleteBond: (id) => commit((mol) => M.deleteBond(mol, id)),
    deleteAtomTransient: (id) => {
      set((s) => ({ molecule: M.deleteAtom(s.molecule, id), hasUnsavedChanges: true }));
    },
    deleteBondTransient: (id) => {
      set((s) => ({ molecule: M.deleteBond(s.molecule, id), hasUnsavedChanges: true }));
    },

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
    placeFunctionalGroup: (template, center, attachment) => {
      commit((mol) => placeFunctionalGroupImpl(mol, template, center, attachment, get().functionalGroupDesiredAngle));
    },

    loadMolecule: (mol) => set({ molecule: mol, past: [], future: [], selected: new Set(), hasUnsavedChanges: true }),
    loadProject: (data) => {
      const active = data.tabs.find((tb) => tb.id === data.activeTabId) ?? data.tabs[0];
      const tabDocuments: Record<string, TabDocument> = {};
      for (const tb of data.tabs) {
        if (tb.id === active.id) continue; // lives in the top-level fields below instead
        tabDocuments[tb.id] = { molecule: tb.molecule, annotations: tb.annotations, view: tb.view, past: [], future: [], hasUnsavedChanges: false };
      }
      set({
        tabs: data.tabs.map((tb) => ({ id: tb.id, title: tb.title })),
        activeTabId: active.id,
        tabDocuments,
        molecule: active.molecule,
        annotations: active.annotations,
        view: active.view,
        past: [],
        future: [],
        // Just opened exactly what's on disk — nothing to save yet, in this
        // tab or any other.
        hasUnsavedChanges: false,
        ...transientResetFields(),
      });
    },
    getAllTabsForSave: () => {
      const s = get();
      return s.tabs.map((tb) => {
        if (tb.id === s.activeTabId) return { id: tb.id, title: tb.title, molecule: s.molecule, annotations: s.annotations, view: s.view };
        const doc = s.tabDocuments[tb.id];
        return {
          id: tb.id,
          title: tb.title,
          molecule: doc?.molecule ?? M.emptyMolecule(),
          annotations: doc?.annotations ?? {},
          view: doc?.view ?? DEFAULT_VIEW,
        };
      });
    },
    addTab: () => {
      tabNumberCounter += 1;
      const id = `tab-${nextId()}`;
      const title = translate(get().language, "tab.defaultTitle", { n: tabNumberCounter });
      set((s) => ({
        tabs: [...s.tabs, { id, title }],
        tabDocuments: {
          ...s.tabDocuments,
          [s.activeTabId]: snapshotActiveDocument(s),
          [id]: { molecule: M.emptyMolecule(), annotations: {}, view: DEFAULT_VIEW, past: [], future: [], hasUnsavedChanges: false },
        },
        activeTabId: id,
        molecule: M.emptyMolecule(),
        annotations: {},
        view: DEFAULT_VIEW,
        past: [],
        future: [],
        hasUnsavedChanges: false,
        ...transientResetFields(),
      }));
    },
    switchToTab: (id) => {
      const s = get();
      if (id === s.activeTabId || !s.tabs.some((tb) => tb.id === id)) return;
      const incoming = s.tabDocuments[id];
      if (!incoming) return;
      set((s2) => ({
        tabDocuments: { ...s2.tabDocuments, [s2.activeTabId]: snapshotActiveDocument(s2) },
        activeTabId: id,
        molecule: incoming.molecule,
        annotations: incoming.annotations,
        view: incoming.view,
        past: incoming.past,
        future: incoming.future,
        hasUnsavedChanges: incoming.hasUnsavedChanges,
        ...transientResetFields(),
      }));
    },
    closeTab: (id) => {
      const s = get();
      if (s.tabs.length <= 1) return; // there must always be at least one tab
      const idx = s.tabs.findIndex((tb) => tb.id === id);
      if (idx === -1) return;

      if (id !== s.activeTabId) {
        // Closing a tab that isn't the active one doesn't touch the
        // top-level fields at all — just drop its stored data.
        set((s2) => {
          const tabDocuments = { ...s2.tabDocuments };
          delete tabDocuments[id];
          return { tabs: s2.tabs.filter((tb) => tb.id !== id), tabDocuments };
        });
        return;
      }

      // Closing the active tab: step to its neighbor (preferring the one
      // before it, so closing rightmost tabs steps left — the direction
      // most browsers/editors use) before dropping it, the same way
      // switchToTab would, since there's no "no tab active" state.
      const neighborId = s.tabs[idx > 0 ? idx - 1 : idx + 1].id;
      const incoming = s.tabDocuments[neighborId];
      if (!incoming) return;
      set((s2) => {
        const tabDocuments = { ...s2.tabDocuments };
        delete tabDocuments[id];
        return {
          tabs: s2.tabs.filter((tb) => tb.id !== id),
          tabDocuments,
          activeTabId: neighborId,
          molecule: incoming.molecule,
          annotations: incoming.annotations,
          view: incoming.view,
          past: incoming.past,
          future: incoming.future,
          hasUnsavedChanges: incoming.hasUnsavedChanges,
          ...transientResetFields(),
        };
      });
    },
    renameTab: (id, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      set((s) => ({ tabs: s.tabs.map((tb) => (tb.id === id ? { ...tb, title: trimmed } : tb)) }));
    },
    markProjectSaved: () =>
      set((s) => ({
        hasUnsavedChanges: false,
        tabDocuments: Object.fromEntries(Object.entries(s.tabDocuments).map(([id, doc]) => [id, { ...doc, hasUnsavedChanges: false }])),
      })),

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

    resetView: () => {
      const { molecule, annotations, canvasSize } = get();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const a of Object.values(molecule.atoms)) {
        minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
        minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
      }
      for (const ann of Object.values(annotations)) {
        if (ann.kind === "arrow") {
          minX = Math.min(minX, ann.x1, ann.x2); maxX = Math.max(maxX, ann.x1, ann.x2);
          minY = Math.min(minY, ann.y1, ann.y2); maxY = Math.max(maxY, ann.y1, ann.y2);
        } else {
          minX = Math.min(minX, ann.x); maxX = Math.max(maxX, ann.x + ann.width);
          minY = Math.min(minY, ann.y); maxY = Math.max(maxY, ann.y + ann.height);
        }
      }
      if (minX === Infinity) {
        // Nothing drawn — back to exactly where the app opens.
        set({ view: DEFAULT_VIEW });
        return;
      }
      // Fit the content's bounding box into the canvas with some breathing
      // room, capped at 2x so a single lonely atom doesn't blow up huge.
      const PADDING = 60;
      const contentW = Math.max(1, maxX - minX);
      const contentH = Math.max(1, maxY - minY);
      const availW = Math.max(50, canvasSize.width - PADDING * 2);
      const availH = Math.max(50, canvasSize.height - PADDING * 2);
      const scale = Math.min(2, availW / contentW, availH / contentH);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      set({
        view: {
          scale,
          tx: canvasSize.width / 2 - centerX * scale,
          ty: canvasSize.height / 2 - centerY * scale,
        },
      });
    },

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

    saveUserTemplate: (label) => {
      const { molecule, annotations, selected, selectedAnnotationIds, userTemplates } = get();
      const trimmed = label.trim();
      if (selected.size === 0 && selectedAnnotationIds.size === 0) return;
      if (trimmed.length === 0) return;
      const fragmentMolecule = M.extractFragment(molecule, selected);
      const fragmentAnnotations = Object.values(annotations).filter((a) => selectedAnnotationIds.has(a.id));
      set({ userTemplates: addUserTemplate(userTemplates, trimmed, fragmentMolecule, fragmentAnnotations) });
    },

    deleteUserTemplate: (id) => {
      set({ userTemplates: removeUserTemplate(get().userTemplates, id) });
    },

    importUserTemplates: (templates) => {
      set({ userTemplates: addImportedUserTemplates(get().userTemplates, templates) });
    },

    markOnboardingSeen: () => {
      set({ hasSeenOnboarding: true });
      try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
      } catch {
        // localStorage unavailable — the tour will just reappear next
        // session, which is a harmless (if mildly repetitive) fallback.
      }
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

    // Align/distribute, unlike rotate, don't fall back to "the whole
    // molecule" when nothing's selected — snapping every fragment in the
    // drawing onto one line is a drastic, surprising thing to do by
    // accident. The sidebar disables these buttons until enough separate
    // fragments are selected (2+ to align, 3+ to distribute); these are a
    // no-op below that anyway (see alignAtoms/distributeAtoms), so this is
    // just an extra guard against calling them too early.
    alignSelection: (mode) => {
      const { molecule, selected } = get();
      if (M.connectedComponents(molecule, [...selected]).length < 2) return;
      commit((mol) => M.alignAtoms(mol, [...selected], mode));
    },

    distributeSelection: (axis) => {
      const { molecule, selected } = get();
      if (M.connectedComponents(molecule, [...selected]).length < 3) return;
      commit((mol) => M.distributeAtoms(mol, [...selected], axis));
    },

    cleanUpSelection: () => {
      const { molecule, selected } = get();
      const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
      if (ids.length === 0) return;
      commit((mol) => M.cleanUpAtoms(mol, ids));
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

    addArrowAnnotation: (p1, p2, variant, barb, headSize) => {
      const id = nextId();
      const curvature = Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.22;
      const ann: ArrowAnnotation = { id, kind: "arrow", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, variant, curvature, barb, headSize };
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

    setArrowBarbOf: (id, barb) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "arrow") return anns;
        return { ...anns, [id]: { ...ann, barb } };
      });
    },

    setArrowHeadSizeOf: (id, headSize) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "arrow") return anns;
        return { ...anns, [id]: { ...ann, headSize } };
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
