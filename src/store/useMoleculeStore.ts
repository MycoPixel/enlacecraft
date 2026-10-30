import { create } from "zustand";
import type {
  Annotation, ArrowAnnotation, ArrowHeadSize, ArrowPreview, ArrowVariant, Atom, AtomMoveAnchor, BondOrder, BondPreview, BondStereo, BracketAnnotation, BracketFacing, BracketVariant, CanvasBackground, ChainPreview, Element, FunctionalGroupAttachment, FunctionalGroupTemplate, MarqueeRect, Molecule, OrbitalAnnotation, OrbitalDragPreview, OrbitalVariant, PageSetup, Point, RingAttachment, RingTemplate, RotationSession, SGroup, SGroupType, ShapeAnnotation, ShapeVariant, TextAnnotation, Theme, ToolId, TlcPlateAnnotation, TlcSpot, ViewTransform,
} from "../types/chemistry";
import type { Lang } from "../i18n/translations";
import { translate } from "../i18n/translate";
import * as M from "../model/molecule";
import { nextId, reserveIds } from "../model/id";
import { placeRing as placeRingImpl } from "../engine/ringPlacement";
import { placeFunctionalGroup as placeFunctionalGroupImpl } from "../engine/functionalGroupPlacement";
import { addExplicitHydrogens } from "../engine/explicitHydrogens";
import { bracketPairLayout, tlcPointToFractions, tlcSpotPosition, pointInRect, dist } from "../model/geometry";
import { DEFAULT_BRACKET_WIDTH, DEFAULT_BRACKET_HEIGHT, BOND_LEN, ISOTOPE_PRESETS, REACTIVE_SITE_PRESETS } from "../model/constants";
import { type UserTemplate, loadUserTemplates, addUserTemplate, removeUserTemplate, addImportedUserTemplates } from "../model/userTemplates";
import { parseAtomLabel } from "../model/atomLabelParser";
import { collapseToGroup, findCollapsibleGroups } from "../model/groupCollapse";
import { pruneSchemeArrowIds } from "../model/reactionSchemes";
import { DEFAULT_SGROUP_SUBSCRIPT, pruneSGroupAnnotationIds, sgroupBondIds, sgroupBondsTouching } from "../model/sgroups";
import { defaultPageSetup } from "../model/pageSetup";
import type { Embed3DMethod } from "../io/embed3d";
import {
  STRUCTURE3D_STYLES,
  STRUCTURE3D_COLOR_SCHEMES,
  STRUCTURE3D_SURFACES,
  DEFAULT_STRUCTURE3D_SURFACE_OPACITY,
  MIN_STRUCTURE3D_SURFACE_OPACITY,
  MAX_STRUCTURE3D_SURFACE_OPACITY,
  clampSurfaceOpacity,
  type Structure3DStyle,
  type Structure3DColorScheme,
  type Structure3DSurface,
} from "../components/Molecule3D/structureStyle";
import { THEME_IDS, nextTheme } from "../styles/themes";

const HISTORY_LIMIT = 100;

/** Default size for a shape placed by a near-zero drag (a plain click):
 * a ChemDraw-ish starting box you resize from, not a degenerate sliver. */
const DEFAULT_SHAPE_WIDTH = 72;
const DEFAULT_SHAPE_HEIGHT = 48;
/** Default lobe length for a click-placed orbital (matches a bond-length
 * and a half, so a p orbital spans a bond's width readably). */
const DEFAULT_ORBITAL_SIZE = 42;
/** Default TLC plate for a click: portrait, like a real microscope slide. */
const DEFAULT_TLC_WIDTH = 90;
const DEFAULT_TLC_HEIGHT = 130;
/** TLC spot defaults: radius in world px and the click-grab radius for
 * removing one (world px, matching the annotation hit tolerances). */
const DEFAULT_TLC_SPOT_R = 4;
export const TLC_SPOT_GRAB_RADIUS = 12;
/** Minimum sizes the shape/bracket resize handles enforce (a zero-width
 * shape can't be re-selected or resized back). */
const MIN_SHAPE_SIZE = 4;
const MIN_ORBITAL_SIZE = 8;
const MAX_ORBITAL_SIZE = 400;

const DEFAULT_VIEW: ViewTransform = { scale: 1, tx: 0, ty: 0 };

/** The very first tab every session starts with — there must always be at
 * least one, so this exists outside the store's own id generation flow. */
const INITIAL_TAB_ID = `tab-${nextId()}`;

const LANG_STORAGE_KEY = "enlacecraft-lang";
const SIDEBAR_WIDTH_STORAGE_KEY = "enlacecraft-sidebar-width";
const ONBOARDING_STORAGE_KEY = "enlacecraft-onboarding-seen";
const AUTO_IUPAC_STORAGE_KEY = "enlacecraft-auto-iupac";
const STRUCTURE3D_STYLE_STORAGE_KEY = "enlacecraft-structure3d-style";
const STRUCTURE3D_COLOR_STORAGE_KEY = "enlacecraft-structure3d-color";
const STRUCTURE3D_SURFACE_STORAGE_KEY = "enlacecraft-structure3d-surface";
const STRUCTURE3D_SURFACE_OPACITY_STORAGE_KEY = "enlacecraft-structure3d-surface-opacity";
const COMPUTED_STEREO_STORAGE_KEY = "enlacecraft-computed-stereo";
const SNAP_ANGLE_STORAGE_KEY = "enlacecraft-snap-angle";
const THEME_STORAGE_KEY = "enlacecraft-theme";
const CANVAS_BG_STORAGE_KEY = "enlacecraft-canvas-bg";

/** The selectable angle-snapping increments, in degrees. 0 is "Off" and maps
 * onto snapAngle's non-positive "don't snap" behaviour. Stored as the number
 * itself so the value in the store is directly usable as radians via
 * SNAP_ANGLE_OPTIONS / snapStepRadians. */
export const SNAP_ANGLE_OPTIONS = [0, 15, 30, 45, 60] as const;
export type SnapAngleDegrees = (typeof SNAP_ANGLE_OPTIONS)[number];

/** Converts a stored snap-angle preference into the radians step the pure
 * geometry/engine helpers take. 0 stays 0, which snapAngle treats as "don't
 * snap" rather than dividing by zero. */
export function snapStepRadians(degrees: number): number {
  return degrees > 0 ? (degrees * Math.PI) / 180 : 0;
}

/** Reads the persisted angle-snapping preference, rejecting anything not in
 * SNAP_ANGLE_OPTIONS so a hand-edited or stale value can't put the snapping
 * into a state the UI has no way to represent (or undo). */
function detectSnapAngle(): SnapAngleDegrees {
  try {
    const saved = parseInt(localStorage.getItem(SNAP_ANGLE_STORAGE_KEY) ?? "", 10);
    if ((SNAP_ANGLE_OPTIONS as readonly number[]).includes(saved)) return saved as SnapAngleDegrees;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return 30;
}

/** Reads a persisted view preference (a 3D representation, or the app
 * theme), guarding against both an unavailable localStorage and a
 * stale/unknown value from an older build (someone who had a theme or
 * representation that has since been removed, or hand-edited the key).
 * Falls back to the default in both cases. */
function detectStoredPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved && (allowed as readonly string[]).includes(saved)) return saved as T;
  } catch {
    // localStorage unavailable (e.g. privacy mode) — fall through to default.
  }
  return fallback;
}

/** Same fail-soft reader for a numeric preference (the 3D surface opacity),
 * clamping anything out of range instead of trusting it. */
function detectStoredNumberPreference(key: string, min: number, max: number, fallback: number): number {
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isFinite(saved) && localStorage.getItem(key) !== null) {
      return Math.min(max, Math.max(min, saved));
    }
  } catch {
    // localStorage unavailable — fall through to default.
  }
  return fallback;
}

/** Boolean preferences are persisted as the strings "true"/"false". */
function detectStoredBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "true") return true;
    if (saved === "false") return false;
  } catch {
    // localStorage unavailable — fall through to default.
  }
  return fallback;
}

/**
 * The theme a session starts in: whatever the user last picked.
 *
 * Persisted rather than always starting on light — the five themes are a
 * working-environment choice (dark room, OLED panel, ChemDraw familiarity),
 * not a per-moment toggle, so re-picking on every reload would just train
 * people back to the default. Validated against THEME_IDS so a theme that
 * no longer exists, or a hand-edited key, degrades to light instead of
 * leaving an unstyleable page (see detectStoredPreference).
 */
function detectInitialTheme(): Theme {
  return detectStoredPreference(THEME_STORAGE_KEY, THEME_IDS, "light");
}

/**
 * The store patch both theme actions return: the new theme, already written
 * to localStorage. Kept in one place so setTheme and toggleTheme can't drift
 * on persistence — and so the store update stays a pure function of the
 * argument, with the (potentially throwing) storage write outside it.
 */
function persistTheme(theme: Theme): { theme: Theme } {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (e.g. privacy mode) — the theme just won't
    // survive a reload. Same call-it-a-nicety position every other
    // persisted preference in this store takes.
  }
  return { theme };
}

/** The canvas background to start a session with: the last one explicitly
 *  chosen, else a plain white canvas (screenshot-ready out of the box).
 *
 *  Persisted for the same reason the theme is. Without it, anyone who
 *  deliberately switched to a dark theme's own canvas would silently get a
 *  white one back on every reload, since the white default would win again
 *  each time — so the setting would look like it had stopped working.
 */
function detectInitialCanvasBackground(): CanvasBackground {
  return detectStoredPreference(CANVAS_BG_STORAGE_KEY, ["white", "theme"], "white");
}

/** Persists the canvas background alongside the change itself; see
 *  persistTheme for why the write lives outside the store update. */
function persistCanvasBackground(canvasBackground: CanvasBackground): { canvasBackground: CanvasBackground } {
  try {
    localStorage.setItem(CANVAS_BG_STORAGE_KEY, canvasBackground);
  } catch {
    // localStorage unavailable — the setting just won't survive a reload.
  }
  return { canvasBackground };
}

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
  /** Page geometry for this tab (see PageSetup). Unlike `view`, this is not
   * undoable: it describes the paper, not the drawing. */
  page: PageSetup;
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
  /** Optional so tabs restored from older saves (and the many tests that
   * build a SavedTab by hand) keep working; loadProject substitutes the
   * default when it is absent. */
  page?: PageSetup;
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
/** addChargeBracket layout: gap beyond the atoms' bounding box before the
 * bracket glyphs start, gap between the close bracket and the charge
 * label, and the label's own box size (a short ionic charge like "3+" or
 * "2\u2212", not a paragraph). */
const CHARGE_BRACKET_PADDING = 24;
const CHARGE_LABEL_GAP = 2;
const CHARGE_LABEL_WIDTH = 40;
const CHARGE_LABEL_HEIGHT = 22;

// How far above a reaction arrow's midpoint "Add reagent text" drops the
// new (empty) text box — the conventional place to write reagents/conditions.
const REAGENT_TEXT_GAP_ABOVE_ARROW = 6;

// Off by default: this drives a PubChem request per structural edit (even
// debounced), so it should be something the user opts into rather than
// something that starts silently calling out to a third-party API.
function detectAutoIupacName(): boolean {
  try {
    return localStorage.getItem(AUTO_IUPAC_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

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
  /** Dashed-shaft flag for newly-drawn arrows; see ArrowAnnotation.dashed. */
  arrowDashed: boolean;
  arrowPreview: ArrowPreview | null;
  /** Live drag-to-place preview for the paired open/close bracket tool (see addBracketPair). */
  bracketPairPreview: ArrowPreview | null;
  /** Live drag-to-place preview for the shape tool (corners of the dragged rectangle). */
  shapePreview: ArrowPreview | null;
  /** Live drag-to-place preview for the orbital tool (nucleus + current drag point). */
  orbitalPreview: OrbitalDragPreview | null;
  /** Live drag-to-place preview for the TLC tool (the plate's corner rectangle). */
  tlcPreview: ArrowPreview | null;
  bracketVariant: BracketVariant;
  bracketFacing: BracketFacing;
  /** Shape tool defaults for the next shape drawn; see ShapeAnnotation. */
  shapeVariant: ShapeVariant;
  shapeFilled: boolean;
  /** Orbital tool defaults for the next orbital placed; see OrbitalAnnotation. */
  orbitalVariant: OrbitalVariant;
  orbitalFilled: boolean;

  // --- UI / tool state ---
  tool: ToolId;
  atomElement: Element;
  atomGroup: string | null;
  atomIsotope: string | null;
  /** Selected REACTIVE_SITE_PRESETS id (Nu, Nu:, Nu:-, E, E+) for the next
   * atom the "atom" tool places or relabels — mutually exclusive with
   * atomGroup/atomIsotope, same pattern as those two. */
  atomReactiveSite: string | null;
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
  /** Page/paper setup for the active tab (see PageSetup); the inactive tabs'
   * copies live in tabDocuments. */
  page: PageSetup;
  theme: Theme;
  /** The drawing canvas's own background — separate from the app theme;
   * see CanvasBackground's doc comment. */
  canvasBackground: CanvasBackground;
  /** Overlay square grid lines on the canvas — independent of
   * canvasBackground (works with either a white or themed background).
   * Off by default; purely a visual drawing aid, no effect on the model. */
  showGrid: boolean;
  /** When on, the live IUPAC name panel re-resolves the name automatically
   * (debounced) as the molecule/selection changes, instead of requiring a
   * manual lookup via IupacNameButton. Off by default and persisted like
   * language — see detectAutoIupacName's doc comment for why the default
   * is off. */
  autoIupacName: boolean;
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
  /** Live drag-to-grow path (world coords) for the freeform ("lasso")
   * selection tool; null when not actively dragging one. */
  lassoPath: Point[] | null;
  /** The atom waiting for its pair while the map-number tool is active
   * (set by a first click, consumed — and cleared — by a second click on
   * a different atom, which assigns both the same new number). Null when
   * nothing's armed. */
  pendingMapAtom: string | null;
  /** The in-progress (or most recently finished) rotate-handle drag
   * "streak" for whichever selection last used it — see RotationSession's
   * own doc comment. Read by the rotate handle's grab/drag handling for
   * shift-snap's baseline, and by resetRotation. */
  rotationSession: RotationSession | null;
  /** The open right-click context menu, if any — screen coordinates
   * (matches ToolDropdown's own portal-positioning convention) plus
   * whichever atom/bond, if either, was under the cursor when it opened. */
  contextMenu: { x: number; y: number; atomId: string | null; bondId: string | null } | null;
  showHydrogens: boolean;
  monochromeAtoms: boolean;
  /**
   * Whether to outline each ring on the canvas with its aromaticity verdict
   * (engine/aromaticity.ts) — green for aromatic, red for antiaromatic, grey
   * for non-aromatic.
   *
   * Plain transient UI state alongside showHydrogens, deliberately NOT part of
   * the Molecule: it must not be written into a saved project, and toggling it
   * must not create an undo step, since it changes nothing about the
   * structure.
   */
  showAromaticityOverlay: boolean;
  /**
   * Sticky equivalent of holding Shift while drawing: disables the 30-degree
   * angle snap so bonds, chains, arrows and functional groups can be drawn at
   * any angle.
   *
   * Shift does double duty as a transient modifier (see the snap sites in
   * useCanvasInteractions), which works fine for a mouse but is unreachable
   * on touch — there is no second hand to hold a key with, so every
   * touch-drawn bond was forced onto the 30-degree grid. This is the
   * same capability made persistent and toggleable, so a finger can reach it.
   *
   * Only affects *angle* decisions. Shift+click's selection-toggle meaning is
   * deliberately left alone: that's a discrete click action, not a drawing
   * modifier, and binding both to one flag would make a tap unexpectedly
   * start drawing at free angles.
   */
  freeAngle: boolean;
  /** Angle-snapping increment in degrees for newly drawn bonds/chains, 0 =
   * off. Separate from freeAngle: that's a momentary per-drag Shift
   * override, this is a persistent preference. Threaded into the pure
   * model/engine helpers as radians (snapStepRadians) so those stay free of
   * store access. */
  snapAngleDegrees: SnapAngleDegrees;
  setSnapAngleDegrees: (deg: SnapAngleDegrees) => void;
  /** Whether the 3D structure panel is docked next to the 2D canvas. Off
   * by default (a secondary view most edits don't need open) and never
   * persisted — always starts closed, same as any other transient panel
   * state. See components/Molecule3D/Molecule3DView.tsx. */
  show3DView: boolean;
  /** The atom (by 2D id) currently linked between the 3D view and the 2D
   * canvas — set by clicking an atom in the 3D panel's link tool, or by
   * selecting an atom on the canvas while the panel has it open. The canvas
   * draws a ring on it so the correspondence is visible on both sides at
   * once. See components/Molecule3D/atomLink.ts for how a 3D serial is
   * resolved back to a 2D atom. */
  linkedAtomId: string | null;
  setLinkedAtomId: (id: string | null) => void;
  /** Which 3D generation method the panel uses — see io/embed3d.ts.
   * "quick" is a fast, collision-free conformer with no energy
   * minimisation; "mmff94" additionally relaxes it against a real force
   * field for geometry closer to a true energy minimum. Sticky across
   * panel toggles/molecule edits within a session, same as any other view
   * preference here. */
  embed3DMethod: Embed3DMethod;
  /** How the 3D structure is drawn (ball-and-stick, space-filling, ...).
   * Unlike the generation method this is a pure view preference, so unlike
   * show3DView it *is* persisted — someone who always wants space-filling
   * shouldn't have to re-pick it every session. See
   * components/Molecule3D/structureStyle.ts. */
  structure3DStyle: Structure3DStyle;
  /** Element coloring used by the 3D viewer; see structureStyle.ts. */
  structure3DColorScheme: Structure3DColorScheme;
  /** Which molecular surface (VDW / solvent-accessible / solvent-excluded)
   * the 3D viewer overlays, or "none" for the plain stick/sphere view. A
   * pure view preference like the style above, so it persists. */
  structure3DSurface: Structure3DSurface;
  setStructure3DSurface: (surface: Structure3DSurface) => void;
  /** Opacity of that surface, 0..1. Persisted and clamped on read/write. */
  structure3DSurfaceOpacity: number;
  setStructure3DSurfaceOpacity: (opacity: number) => void;
  /** When on, the canvas overlays computed (R)/(S) and E/Z descriptors on
   *  the drawing (see engine/stereo.ts). Purely a view aid: it never changes
   *  the molecule, so it isn't undoable and isn't written to project files.
   *  Persisted, like the 3D style preferences. */
  showComputedStereo: boolean;
  toggleComputedStereo: () => void;
  /** Current on-screen pixel size of the canvas <svg>, kept in sync by MoleculeCanvas via ResizeObserver. */
  canvasSize: { width: number; height: number };

  // --- setters ---
  setTool: (t: ToolId) => void;
  setAtomElement: (e: Element) => void;
  setAtomGroup: (g: string | null) => void;
  setAtomIsotope: (presetId: string | null) => void;
  setAtomReactiveSite: (presetId: string | null) => void;
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
  /** Applies one specific theme and persists it — what the ThemePicker
   *  calls. See toggleTheme for the sequential alternative. */
  setTheme: (theme: Theme) => void;
  /** Steps to the next theme in presentation order, wrapping around. */
  toggleTheme: () => void;
  toggleCanvasBackground: () => void;
  toggleShowGrid: () => void;
  toggleAutoIupacName: () => void;
  toggleLanguage: () => void;
  setSidebarWidth: (w: number) => void;
  setStatus: (s: string) => void;
  setBondPreview: (p: BondPreview | null) => void;
  setAtomMoveAnchor: (a: AtomMoveAnchor | null) => void;
  setChainPreview: (p: ChainPreview | null) => void;
  setMarqueeRect: (r: MarqueeRect | null) => void;
  setLassoPath: (p: Point[] | null) => void;
  /** Handles one atom click while the map-number tool is active — see
   * pendingMapAtom's doc comment for the click/click pairing behavior,
   * and clicking an already-numbered atom clears its number instead. */
  handleMapNumberClick: (atomId: string) => void;
  clearAllMapNumbers: () => void;
  setRotationSession: (s: RotationSession | null) => void;
  /** Rotates the current selection back to its position from the start
   * of the current rotation "streak" (see RotationSession) — a no-op if
   * nothing in this exact selection has an active session, e.g. after a
   * selection change. */
  resetRotation: () => void;
  setContextMenu: (m: { x: number; y: number; atomId: string | null; bondId: string | null } | null) => void;
  setAtomHighlightColor: (id: string, color: string | null) => void;
  /** Toggles Atom.ignoreValence for one atom — see its doc comment. */
  toggleAtomIgnoreValence: (id: string) => void;
  setBondHighlightColor: (id: string, color: string | null) => void;
  /** Copies the current selection and immediately re-pastes it offset a
   * little down-and-right of the original, selecting the new copy — the
   * one-step "Duplicate" a right-click menu needs, as opposed to
   * copy-then-separately-paste. */
  duplicateSelection: () => void;
  /** Collapses every recognizable abbreviated group in the current
   * selection into a single labeled vertex, one group per connected
   * fragment. Returns how many were collapsed so the UI can report it (and
   * stay silent when there was nothing to do). See model/groupCollapse.ts —
   * matching is by topology *and* implicit-hydrogen count, never by formula. */
  collapseSelectionToGroups: () => number;
  toggleShowHydrogens: () => void;
  /** See showAromaticityOverlay. */
  toggleAromaticityOverlay: () => void;
  toggleFreeAngle: () => void;
  /** Real structural edit, not a view toggle: on the atom count going up
   * (i.e. hasExplicitHydrogens(molecule) is currently false), adds a real
   * terminal H atom + bond for every implicit hydrogen on every carbon
   * (engine/explicitHydrogens.ts's addExplicitHydrogens) -- otherwise
   * strips them back down (model/molecule.ts's stripExplicitHydrogens).
   * Either direction goes through commit(), so it's a normal undoable
   * edit like drawing or deleting an atom by hand, and shows up in
   * export/formula/valence exactly the same way. There's deliberately no
   * separate boolean tracking "on/off" here -- which direction the next
   * click goes is read straight from the molecule's own current content
   * (see hasExplicitHydrogens), the same way the toggle itself no longer
   * has a hidden state independent of what's actually drawn. */
  toggleExplicitHydrogens: () => void;
  toggleMonochromeAtoms: () => void;
  toggle3DView: () => void;
  setEmbed3DMethod: (method: Embed3DMethod) => void;
  setStructure3DStyle: (style: Structure3DStyle) => void;
  setStructure3DColorScheme: (scheme: Structure3DColorScheme) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // --- annotation setters / actions ---
  setSelectedAnnotationIds: (ids: Set<string>) => void;
  setEditingTextId: (id: string | null) => void;
  setArrowVariant: (v: ArrowVariant) => void;
  setArrowBarb: (b: "full" | "single") => void;
  setArrowHeadSize: (s: ArrowHeadSize) => void;
  setArrowDashed: (d: boolean) => void;
  setArrowPreview: (p: ArrowPreview | null) => void;
  setBracketPairPreview: (p: ArrowPreview | null) => void;
  setShapePreview: (p: ArrowPreview | null) => void;
  setOrbitalPreview: (p: OrbitalDragPreview | null) => void;
  setTlcPreview: (p: ArrowPreview | null) => void;
  setBracketVariant: (v: BracketVariant) => void;
  setBracketFacing: (f: BracketFacing) => void;
  setShapeVariant: (v: ShapeVariant) => void;
  setShapeFilled: (f: boolean) => void;
  setOrbitalVariant: (v: OrbitalVariant) => void;
  setOrbitalFilled: (f: boolean) => void;
  addTextAnnotation: (p: Point) => string;
  addArrowAnnotation: (p1: Point, p2: Point, variant: ArrowVariant, barb?: "full" | "single", headSize?: ArrowHeadSize) => string;
  addBracketAnnotation: (p: Point, variant: BracketVariant, facing: BracketFacing) => string;
  addBracketPair: (corner1: Point, corner2: Point, variant: BracketVariant) => { openId: string; closeId: string };
  /** Places a graphics-primitive shape (rectangle/ellipse/line) from the
   * dragged rectangle's corners. A near-zero drag falls back to a sensible
   * default (like the arrow/bracket tools) instead of a degenerate sliver. */
  addShapeAnnotation: (corner1: Point, corner2: Point, variant: ShapeVariant, filled: boolean) => string;
  /** Places an orbital from the drag vector: nucleus at `center`, size and
   * axis from the vector to `point` (a near-zero drag falls back to the
   * default size/axis, like the arrow tool). */
  addOrbitalAnnotation: (center: Point, point: Point, variant: OrbitalVariant, filled: boolean) => string;
  /** Places a TLC plate from the dragged rectangle's corners; a near-zero
   * drag falls back to a default portrait plate. */
  addTlcPlate: (corner1: Point, corner2: Point) => string;
  /** Adds a spot at the given point inside the plate (fractional coords);
   * returns the spot or null if the point is outside the plate. */
  addTlcSpot: (id: string, p: Point) => TlcSpot | null;
  /** Removes the spot nearest to `p` (within a small grab radius); returns
   * true when a spot was removed. */
  removeNearestTlcSpot: (id: string, p: Point) => boolean;
  /** Removes one spot by index (the per-spot × button and Shift+click on a
   * spot both use this); returns true when a spot was removed. */
  removeTlcSpot: (id: string, spotIndex: number) => boolean;
  /** Moves an existing spot to canvas point `p` (fractional coords recomputed
   * and clamped to the plate); used to drag a spotted sample around. */
  moveTlcSpot: (id: string, spotIndex: number, p: Point) => void;
  /** The "wrap this in [ ]^charge" convenience for coordination complexes
   * / polyatomic ions: an open+close square bracket pair sized around
   * atomIds' current positions, plus an empty, immediately-editable text
   * label at the close bracket's top-right corner for the charge (e.g.
   * type "3+"). One undo step; null if atomIds is empty. See its
   * implementation for why this needed its own action rather than just
   * composing addBracketPair + addTextAnnotation from a caller. */
  addChargeBracket: (atomIds: Iterable<string>) => { openId: string; closeId: string; labelId: string } | null;
  /**
   * Creates an S-group (ChemDraw polymer/mixture bracket) around `atomIds`.
   * Unless `bracketAnnotationIds` names existing bracket glyphs, a square
   * open+close pair is placed around the selection's bounding box in the
   * same undo step. Returns the new group's id, or null if no atom survived.
   */
  createSGroup: (
    atomIds: Iterable<string>,
    type: SGroupType,
    opts?: {
      subscript?: string;
      label?: string;
      bracketAnnotationIds?: string[];
      bracketVariant?: BracketVariant;
    },
  ) => string | null;
  /** Edits the fields the info panel exposes. Empty strings clear optional
   * fields (repeat count / label). */
  updateSGroup: (id: string, patch: { type?: SGroupType; subscript?: string; label?: string }) => void;
  /** Removes the group metadata only; its brackets stay on the drawing as
   * ordinary annotations. */
  deleteSGroup: (id: string) => void;
  /** Adds the current atom selection to an existing group. */
  addSelectionToSGroup: (id: string) => void;
  /** Removes the current atom selection from a group; an empty group is
   * deleted. */
  removeSelectionFromSGroup: (id: string) => void;
  /** Adds a haptic (\u03b7) bond if the selection resolves to one metal atom +
   * \u22652 ligand atoms and none exists between them yet, or removes it if one
   * already does \u2014 see model/molecule.ts's resolveHapticSelection and
   * findHapticBond for the exact rule. False if the selection doesn't
   * resolve at all (nothing was done). */
  toggleHapticBond: (atomIds: Iterable<string>) => boolean;
  /** Toggles the inscribed-circle display for the ring at atomIds: adds
   * one if this exact ring doesn't have it yet, removes it if it does.
   * Purely a rendering choice (see AromaticRingDisplay's own doc
   * comment) -- callers are expected to have already confirmed the ring
   * is eligible (see engine/aromaticRings.ts's resolveEligibleRingForBond),
   * since this just records the toggle for whatever atom set it's given. */
  toggleAromaticRingDisplay: (atomIds: string[]) => void;
  addPlusAnnotation: (p: Point) => string;
  addReagentText: () => string | null;
  updateTextHtml: (id: string, html: string) => void;
  updateTextSize: (id: string, width: number, height: number) => void;
  updateTextFontSize: (id: string, fontSize: number) => void;
  stepTextFontSize: (id: string, delta: number) => void;
  updateBracketSize: (id: string, width: number, height: number) => void;
  setBracketStyleOf: (id: string, variant: BracketVariant, facing: BracketFacing) => void;
  updateShapeSize: (id: string, width: number, height: number) => void;
  updateTlcSize: (id: string, width: number, height: number) => void;
  setShapeStyleOf: (id: string, variant: ShapeVariant, filled: boolean) => void;
  /** Live rotate/resize of an orbital: `size` is the lobe length, `angle`
   * the axis in degrees (both clamped); committed by the view's checkpoint. */
  updateOrbitalTransformTransient: (id: string, size: number, angle: number) => void;
  setOrbitalStyleOf: (id: string, variant: OrbitalVariant, filled: boolean) => void;
  moveAnnotationTransient: (id: string, p: Point) => void;
  moveAnnotationsTransient: (origins: Record<string, Annotation>, dx: number, dy: number) => void;
  updateArrowEndpointTransient: (id: string, which: "start" | "end", p: Point) => void;
  updateArrowCurvatureTransient: (id: string, curvature: number) => void;
  setArrowVariantOf: (id: string, variant: ArrowVariant) => void;
  setArrowBarbOf: (id: string, barb: "full" | "single") => void;
  setArrowHeadSizeOf: (id: string, headSize: ArrowHeadSize) => void;
  setArrowDashedOf: (id: string, dashed: boolean) => void;
  deleteAnnotation: (id: string) => void;
  deleteAnnotations: (ids: Set<string>) => void;
  snapshotBefore: () => Snapshot;

  // --- structural actions (committed to history) ---
  addAtom: (p: Point, element: Element, group?: string, isotope?: number) => string;
  /** Places a new atom with a whole REACTIVE_SITE_PRESETS entry applied
   * (label, charge, lone pairs) in one commit/undo step. */
  addReactiveSiteAtom: (p: Point, presetId: string) => string | null;
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
  setAtomReactiveSiteOf: (id: string, presetId: string) => void;
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
  setAtomMapNumberOffset: (id: string, dx: number, dy: number) => void;
  cycleAtomLonePairs: (id: string) => void;
  toggleAtomRadical: (id: string) => void;
  setBondOrder: (id: string, order: BondOrder) => void;
  setBondStereo: (id: string, stereo: BondStereo) => void;
  setBondDative: (id: string, dative: boolean) => void;
  /** Applies (color) or clears (null) an emphasis color across the
   * current selection — every selected atom, plus every bond whose both
   * endpoints are selected. No-op with nothing selected. */
  highlightSelection: (color: string | null) => void;
  /**
   * Toggles Atom.ignoreValence across the whole selection as ONE undo step.
   *
   * The per-atom toggleAtomIgnoreValence is still what the context menu uses,
   * since it knows exactly which atom was under the cursor. This exists for
   * the mobile toolbar, which has no cursor: there, the selection is the only
   * sensible target, and applying it atom-by-atom would push one undo entry
   * per atom for what the user thinks of as a single action.
   *
   * The new value is decided from the FIRST selected atom and applied to all
   * of them, so a mixed selection resolves predictably (toggling makes
   * everything match the first atom) rather than flipping each atom
   * independently and leaving a mess.
   */
  toggleIgnoreValenceForSelection: () => void;
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
   * which is also used for PubChem imports that intentionally only ever
   * bring in a molecule into the current tab. See io/project.ts. */
  loadProject: (data: { activeTabId: string; tabs: SavedTab[] }) => void;
  /** Brings in an imported MOL/CDXML molecule as a brand-new tab instead of
   * overwriting whatever's in the current one — used by the toolbar Import
   * button, so importing a file never destroys the active drawing. CDXML
   * files can also carry arrows/text/brackets around the molecule; those
   * come in through the optional `annotations` record (already sanitized
   * and id-fresh — minted through nextId() during parsing, same as the
   * molecule's own ids, so no reserveIds() dance is needed here, unlike
   * the project-restore paths which install ids verbatim). CDXML imports
   * also pass the file's own `page` setup so its paper size/bond length
   * survives the trip. */
  importMoleculeAsNewTab: (mol: Molecule, title?: string, annotations?: Record<string, Annotation>, page?: PageSetup) => void;
  /** Brings in a full saved .enlacecraft project as additional new tabs
   * alongside whatever tabs already exist, instead of replacing them —
   * used by the toolbar Import button. */
  importProjectAsNewTabs: (data: { activeTabId: string; tabs: SavedTab[] }) => void;
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
  /** Display-only name of the file this project was last saved to or opened
   * from, or null while it's unsaved. Purely so the UI can say "Saving to
   * X.enlacecraft" and confirm Save is going where the user thinks.
   *
   * NOT the authority on where a save lands. In the desktop build the main
   * process keeps its own record of the path it handed out from a dialog (see
   * electron/security.cjs's createProjectSaveTarget) and a plain Save is
   * written there; this is just what the renderer happens to know, kept in
   * step with it for display. Session-scoped and never persisted, so a
   * launch always starts needing a Save As. */
  projectFileName: string | null;
  setProjectFileName: (name: string | null) => void;

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
 * Every id a set of project documents already occupies: atoms, bonds, haptics,
 * ring displays and annotations across all tabs.
 *
 * Collected purely to feed reserveIds - see its doc comment for why a restore
 * has to do this. Iterating documents rather than just the active one because
 * a background tab's atoms get switched into and then added to.
 */
function idsUsedByDocuments(
  tabs: { molecule: Molecule; annotations: Record<string, Annotation> }[],
): string[] {
  const ids: string[] = [];
  for (const tb of tabs) {
    ids.push(...Object.keys(tb.molecule.atoms));
    ids.push(...Object.keys(tb.molecule.bonds));
    ids.push(...Object.keys(tb.molecule.hapticBonds));
    ids.push(...Object.keys(tb.molecule.aromaticRingDisplays));
    // Scheme/step ids are minted by nextId() too, and their arrow references
    // are annotation ids that may be stale; reserve every one so a restored
    // document can't mint a colliding id later.
    for (const scheme of tb.molecule.schemes ?? []) {
      ids.push(scheme.id);
      for (const step of scheme.steps) {
        ids.push(step.id);
        ids.push(...step.arrowIds);
      }
    }
    // Values, not keys. Annotation records are keyed by the annotation's own
    // id and both come from nextId(), so the keys would work too - but reading
    // the id off the value keeps this correct if the keying ever diverges,
    // and reserveIds ignores anything non-numeric anyway.
    ids.push(...Object.values(tb.annotations).map((a) => a.id));
  }
  return ids;
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
  /**
   * Why the live annotation mutators set hasUnsavedChanges without committing.
   *
   * updateTextHtml, updateTextSize, moveAnnotationTransient and friends fire per
   * keystroke while typing into a reagent box and per pointermove while dragging
   * a text box. An undo checkpoint each time would flood the history, so undo
   * integrity is handled separately: snapshotBefore() on interaction start, then
   * commitCheckpoint() on blur/pointerup (see TextAnnotationView).
   *
   * The dirty flag asks a different question - "does unsaved work exist?" - and
   * it simply was not being answered by these five. Typing "conc. H2SO4, 80 C"
   * into a text box and closing the tab inside the autosave debounce produced no
   * dirty dot and no beforeunload prompt, so the text was lost with nothing
   * warning about it. Structurally identical edits at least triggered the prompt;
   * annotation-only edits got nothing.
   *
   * So they set the flag and skip commitAnnotations. hasUnsavedChanges is
   * cleared by markProjectSaved, not by undo, so staying true is correct.
   */

  const commitAnnotations = (mutate: (anns: Record<string, Annotation>) => Record<string, Annotation>) => {
    set((s) => {
      const next = mutate(s.annotations);
      if (next === s.annotations) return s;
      // A scheme's arrow ids point into this map, so deleting an arrow has
      // to drop the reference in the same undo step — otherwise a later
      // save writes a step pointing at an annotation that no longer exists.
      // S-groups name their bracket glyphs the same way.
      const schemes = pruneSchemeArrowIds(s.molecule.schemes, next);
      const sgroups = pruneSGroupAnnotationIds(s.molecule.sgroups, next);
      let molecule = s.molecule;
      if (schemes !== s.molecule.schemes || sgroups !== s.molecule.sgroups) {
        molecule = { ...s.molecule };
        if (schemes) molecule.schemes = schemes;
        else delete molecule.schemes;
        if (sgroups) molecule.sgroups = sgroups;
        else delete molecule.sgroups;
      }
      return {
        ...(molecule === s.molecule ? {} : { molecule }),
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
    page: s.page,
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
    // The 3D<->2D atom link is a transient view link like the rest of these:
    // it points at an atom id in one specific drawing, so carrying it across
    // a tab switch would point at nothing (or, worse, at an unrelated atom
    // that happens to share the id).
    linkedAtomId: null,
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
    arrowDashed: false,
    arrowPreview: null,
    bracketPairPreview: null,
    shapePreview: null,
    orbitalPreview: null,
    tlcPreview: null,
    bracketVariant: "paren",
    bracketFacing: "open",
    shapeVariant: "rectangle",
    shapeFilled: false,
    orbitalVariant: "p",
    orbitalFilled: false,

    tool: "select",
    atomElement: "C",
    atomGroup: null,
    atomIsotope: null,
    atomReactiveSite: null,
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
    page: defaultPageSetup(),
    theme: detectInitialTheme(),
    // Plain white canvas (screenshot-ready) until someone picks otherwise;
    // "theme" restores the normal themed background + grid. Persisted — see
    // detectInitialCanvasBackground.
    canvasBackground: detectInitialCanvasBackground(),
    showGrid: false,
    autoIupacName: detectAutoIupacName(),
    language: detectInitialLanguage(),
    sidebarWidth: detectInitialSidebarWidth(),
    userTemplates: loadUserTemplates(),
    hasSeenOnboarding: detectHasSeenOnboarding(),
    status: "status.ready",
    bondPreview: null,
    atomMoveAnchor: null,
    chainPreview: null,
    marqueeRect: null,
    lassoPath: null,
    pendingMapAtom: null,
    rotationSession: null,
    contextMenu: null,
    showHydrogens: false,
    showAromaticityOverlay: false,
  freeAngle: false,
    snapAngleDegrees: detectSnapAngle(),
    monochromeAtoms: true,
    show3DView: false,
    linkedAtomId: null,
    projectFileName: null,
    embed3DMethod: "quick",
    structure3DStyle: detectStoredPreference(STRUCTURE3D_STYLE_STORAGE_KEY, STRUCTURE3D_STYLES.map((s) => s.id), "ball-and-stick"),
    structure3DColorScheme: detectStoredPreference(STRUCTURE3D_COLOR_STORAGE_KEY, STRUCTURE3D_COLOR_SCHEMES, "element"),
    structure3DSurface: detectStoredPreference(STRUCTURE3D_SURFACE_STORAGE_KEY, STRUCTURE3D_SURFACES, "none"),
    structure3DSurfaceOpacity: detectStoredNumberPreference(
      STRUCTURE3D_SURFACE_OPACITY_STORAGE_KEY,
      MIN_STRUCTURE3D_SURFACE_OPACITY,
      MAX_STRUCTURE3D_SURFACE_OPACITY,
      DEFAULT_STRUCTURE3D_SURFACE_OPACITY
    ),
    showComputedStereo: detectStoredBooleanPreference(COMPUTED_STEREO_STORAGE_KEY, false),
    canvasSize: { width: 800, height: 600 },

    setTool: (t) => set((s) => ({ tool: t, pendingMapAtom: s.tool === "map-number" && t !== "map-number" ? null : s.pendingMapAtom })),
    setAtomElement: (e) => set({ atomElement: e, atomGroup: null, atomIsotope: null, atomReactiveSite: null }),
    setAtomGroup: (g) => set({ atomGroup: g, atomIsotope: null, atomReactiveSite: null }),
    setAtomIsotope: (presetId) => set({ atomIsotope: presetId, atomGroup: null, atomReactiveSite: null }),
    setAtomReactiveSite: (presetId) => set({ atomReactiveSite: presetId, atomGroup: null, atomIsotope: null }),
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
    toggleTheme: () => set((s) => persistTheme(nextTheme(s.theme))),
    setTheme: (theme) => set(() => persistTheme(theme)),
    toggleCanvasBackground: () => set((s) => persistCanvasBackground(s.canvasBackground === "white" ? "theme" : "white")),
    toggleShowGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleAutoIupacName: () =>
      set((s) => {
        const next = !s.autoIupacName;
        try {
          localStorage.setItem(AUTO_IUPAC_STORAGE_KEY, next ? "1" : "0");
        } catch {
          // localStorage unavailable — persistence is a nicety, not a requirement
        }
        return { autoIupacName: next };
      }),
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
    setLassoPath: (p) => set({ lassoPath: p }),
    handleMapNumberClick: (atomId) => {
      const { molecule, pendingMapAtom } = get();
      const atom = molecule.atoms[atomId];
      if (!atom) return;
      if (atom.mapNumber != null) {
        // Already numbered: this click clears it. If it was the armed
        // pending atom, un-arm too rather than leaving a dangling
        // reference to an atom that's no longer mapped.
        commit((mol) => M.setAtomMapNumber(mol, atomId, null));
        if (pendingMapAtom === atomId) set({ pendingMapAtom: null });
        return;
      }
      if (pendingMapAtom == null) {
        set({ pendingMapAtom: atomId });
        return;
      }
      if (pendingMapAtom === atomId) {
        // Clicked the same atom again: cancel, don't pair it with itself.
        set({ pendingMapAtom: null });
        return;
      }
      const n = M.nextMapNumber(molecule);
      commit((mol) => M.setAtomMapNumber(M.setAtomMapNumber(mol, pendingMapAtom, n), atomId, n));
      set({ pendingMapAtom: null });
    },
    clearAllMapNumbers: () => {
      set({ pendingMapAtom: null });
      commit((mol) => M.clearAllMapNumbers(mol));
    },
    setRotationSession: (s) => set({ rotationSession: s }),
    resetRotation: () => {
      const { selected, rotationSession } = get();
      if (!rotationSession) return;
      const key = [...selected].sort().join(",");
      if (rotationSession.key !== key) return;
      commit((mol) => {
        const atoms = { ...mol.atoms };
        for (const id of selected) {
          const orig = rotationSession.original[id];
          if (orig && atoms[id]) atoms[id] = { ...atoms[id], x: orig.x, y: orig.y };
        }
        return { ...mol, atoms };
      });
    },
    setContextMenu: (m) => set({ contextMenu: m }),
    setAtomHighlightColor: (id, color) => commit((mol) => M.setAtomHighlight(mol, id, color)),
    toggleAtomIgnoreValence: (id) => commit((mol) => {
      const a = mol.atoms[id];
      if (!a) return mol;
      return M.setAtomIgnoreValence(mol, id, !a.ignoreValence);
    }),
    setBondHighlightColor: (id, color) => commit((mol) => M.setBondHighlight(mol, id, color)),
    duplicateSelection: () => {
      const { molecule, selected, annotations } = get();
      if (selected.size === 0) return;
      const fragment = M.subMolecule(molecule, selected);
      if (Object.keys(fragment.atoms).length === 0) return;
      const before: Snapshot = { molecule, annotations };
      const { mol: merged, newAtomIds } = M.insertMolecule(molecule, fragment, 24, 24);
      set({
        molecule: merged,
        past: [...get().past, before].slice(-HISTORY_LIMIT),
        future: [],
        selected: new Set(newAtomIds),
      });
    },
    toggleShowHydrogens: () => set((s) => ({ showHydrogens: !s.showHydrogens })),
    toggleAromaticityOverlay: () => set((s) => ({ showAromaticityOverlay: !s.showAromaticityOverlay })),
    toggleFreeAngle: () => set((s) => ({ freeAngle: !s.freeAngle })),
    toggleExplicitHydrogens: () => {
      const { molecule } = get();
      if (M.hasExplicitHydrogens(molecule)) {
        commit((mol) => M.stripExplicitHydrogens(mol));
      } else {
        commit((mol) => addExplicitHydrogens(mol));
      }
    },
    toggleMonochromeAtoms: () => set((s) => ({ monochromeAtoms: !s.monochromeAtoms })),
    toggle3DView: () => set((s) => ({ show3DView: !s.show3DView })),
    collapseSelectionToGroups: () => {
      const { molecule, selected, annotations } = get();
      const ids = [...selected];
      if (ids.length === 0) return 0;
      const matches = findCollapsibleGroups(molecule, { candidateIds: ids });
      if (matches.length === 0) return 0;
      const before: Snapshot = { molecule, annotations };
      // Largest match per component first, so a Boc isn't partially eaten by
      // an OMe matched inside it on an earlier pass.
      let next = molecule;
      for (const match of matches) next = collapseToGroup(next, match);
      set({ molecule: next, selected: new Set<string>(), linkedAtomId: null, past: [...get().past, before], future: [] });
      return matches.length;
    },
    setProjectFileName: (name) => set({ projectFileName: name }),
    setLinkedAtomId: (id) => set({ linkedAtomId: id }),
    setSnapAngleDegrees: (deg) => {
      set({ snapAngleDegrees: deg });
      try {
        localStorage.setItem(SNAP_ANGLE_STORAGE_KEY, String(deg));
      } catch {
        // localStorage unavailable — preference just won't survive a reload.
      }
    },
    setEmbed3DMethod: (method) => set({ embed3DMethod: method }),
    setStructure3DStyle: (style) => {
      set({ structure3DStyle: style });
      try {
        localStorage.setItem(STRUCTURE3D_STYLE_STORAGE_KEY, style);
      } catch {
        // localStorage unavailable — preference just won't survive a reload.
      }
    },
    setStructure3DColorScheme: (scheme) => {
      set({ structure3DColorScheme: scheme });
      try {
        localStorage.setItem(STRUCTURE3D_COLOR_STORAGE_KEY, scheme);
      } catch {
        // localStorage unavailable — preference just won't survive a reload.
      }
    },
    setStructure3DSurface: (surface) => {
      set({ structure3DSurface: surface });
      try {
        localStorage.setItem(STRUCTURE3D_SURFACE_STORAGE_KEY, surface);
      } catch {
        // localStorage unavailable — preference just won't survive a reload.
      }
    },
    setStructure3DSurfaceOpacity: (opacity) => {
      const clamped = clampSurfaceOpacity(opacity);
      set({ structure3DSurfaceOpacity: clamped });
      try {
        localStorage.setItem(STRUCTURE3D_SURFACE_OPACITY_STORAGE_KEY, String(clamped));
      } catch {
        // localStorage unavailable — preference just won't survive a reload.
      }
    },
    toggleComputedStereo: () =>
      set((s) => {
        const showComputedStereo = !s.showComputedStereo;
        try {
          localStorage.setItem(COMPUTED_STEREO_STORAGE_KEY, String(showComputedStereo));
        } catch {
          // localStorage unavailable — preference just won't survive a reload.
        }
        return { showComputedStereo };
      }),
    setCanvasSize: (size) => set({ canvasSize: size }),
    // Annotations are part of "everything" — a reaction scheme is mostly
    // arrows and condition text, so selecting only the atoms and leaving
    // the annotations behind made Ctrl+A useless for exactly the drawings
    // it most looked like it was for: a following copy/paste, rotate, or
    // Delete took the molecule and silently dropped the scheme around it.
    // (The Delete shortcut already covers both sets — see
    // useKeyboardShortcuts — so this doesn't strand anything half-selected.)
    selectAll: () =>
      set((s) => ({
        selected: new Set(Object.keys(s.molecule.atoms)),
        selectedAnnotationIds: new Set(Object.keys(s.annotations)),
      })),
    clearSelection: () => set({ selected: new Set() }),

    setSelectedAnnotationIds: (ids) => set({ selectedAnnotationIds: ids }),
    setEditingTextId: (id) => set({ editingTextId: id }),
    setArrowVariant: (v) => set({ arrowVariant: v }),
    setArrowBarb: (b) => set({ arrowBarb: b }),
    setArrowHeadSize: (s) => set({ arrowHeadSize: s }),
    setArrowDashed: (d) => set({ arrowDashed: d }),
    setArrowPreview: (p) => set({ arrowPreview: p }),
    setBracketPairPreview: (p) => set({ bracketPairPreview: p }),
    setShapePreview: (p) => set({ shapePreview: p }),
    setOrbitalPreview: (p) => set({ orbitalPreview: p }),
    setTlcPreview: (p) => set({ tlcPreview: p }),
    setBracketVariant: (v) => set({ bracketVariant: v }),
    setBracketFacing: (f) => set({ bracketFacing: f }),
    setShapeVariant: (v) => set({ shapeVariant: v }),
    setShapeFilled: (f) => set({ shapeFilled: f }),
    setOrbitalVariant: (v) => set({ orbitalVariant: v }),
    setOrbitalFilled: (f) => set({ orbitalFilled: f }),

    addAtom: (p, element, group, isotope) => {
      const id = nextId();
      commit((mol) => M.addAtom(mol, id, p, element, group, isotope));
      return id;
    },

    addReactiveSiteAtom: (p, presetId) => {
      const preset = REACTIVE_SITE_PRESETS.find((pr) => pr.id === presetId);
      if (!preset) return null;
      const id = nextId();
      commit((mol) => {
        let next = M.addAtom(mol, id, p, "C", preset.label);
        next = M.setAtomChargeAbsolute(next, id, preset.charge);
        next = M.setAtomLonePairs(next, id, preset.lonePairs);
        return next;
      });
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
    setAtomReactiveSiteOf: (id, presetId) => {
      const preset = REACTIVE_SITE_PRESETS.find((pr) => pr.id === presetId);
      if (!preset) return;
      commit((mol) => M.setAtomReactiveSite(mol, id, preset.label, preset.charge, preset.lonePairs));
    },
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
    setAtomMapNumberOffset: (id, dx, dy) => commit((mol) => M.setAtomMapNumberOffset(mol, id, dx, dy)),
    cycleAtomLonePairs: (id) => commit((mol) => M.cycleAtomLonePairs(mol, id)),
    toggleAtomRadical: (id) => commit((mol) => M.toggleAtomRadical(mol, id)),
    setBondOrder: (id, order) => commit((mol) => M.setBondOrder(mol, id, order)),
    setBondStereo: (id, stereo) => commit((mol) => M.setBondStereo(mol, id, stereo)),
    setBondDative: (id, dative) => commit((mol) => M.setBondDative(mol, id, dative)),
    highlightSelection: (color) => {
      const { selected } = get();
      commit((mol) => M.setHighlightForSelection(mol, selected, color));
    },
    toggleIgnoreValenceForSelection: () => {
      const { molecule, selected } = get();
      if (selected.size === 0) return;
      const first = [...selected][0];
      const target = !molecule.atoms[first]?.ignoreValence;
      commit((mol) => {
        let next = mol;
        for (const id of selected) next = M.setAtomIgnoreValence(next, id, target);
        return next;
      });
    },
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
      // Documents are installed verbatim, so their ids come from whichever
      // session last saved them - while nextId() restarts at 1 for this page.
      // Without this, the first atom drawn after a restore overwrote an
      // existing atom and left its bonds pointing at the replacement.
      reserveIds(idsUsedByDocuments(data.tabs));
      const active = data.tabs.find((tb) => tb.id === data.activeTabId) ?? data.tabs[0];
      const tabDocuments: Record<string, TabDocument> = {};
      for (const tb of data.tabs) {
        if (tb.id === active.id) continue; // lives in the top-level fields below instead
        tabDocuments[tb.id] = {
          molecule: tb.molecule,
          annotations: tb.annotations,
          view: tb.view,
          page: tb.page ?? defaultPageSetup(),
          past: [],
          future: [],
          hasUnsavedChanges: false,
        };
      }
      set({
        tabs: data.tabs.map((tb) => ({ id: tb.id, title: tb.title })),
        activeTabId: active.id,
        tabDocuments,
        molecule: active.molecule,
        annotations: active.annotations,
        view: active.view,
        page: active.page ?? defaultPageSetup(),
        past: [],
        future: [],
        // Just opened exactly what's on disk — nothing to save yet, in this
        // tab or any other.
        hasUnsavedChanges: false,
        ...transientResetFields(),
      });
    },
    importMoleculeAsNewTab: (mol, title, annotations = {}, page = defaultPageSetup()) => {
      tabNumberCounter += 1;
      const id = `tab-${nextId()}`;
      const tabTitle = title ?? translate(get().language, "tab.defaultTitle", { n: tabNumberCounter });
      set((s) => ({
        tabs: [...s.tabs, { id, title: tabTitle }],
        tabDocuments: {
          ...s.tabDocuments,
          [s.activeTabId]: snapshotActiveDocument(s),
        },
        activeTabId: id,
        molecule: mol,
        annotations,
        view: DEFAULT_VIEW,
        page,
        past: [],
        future: [],
        hasUnsavedChanges: true,
        ...transientResetFields(),
      }));
    },
    importProjectAsNewTabs: (data) => {
      reserveIds(idsUsedByDocuments(data.tabs));
      const activeSaved = data.tabs.find((tb) => tb.id === data.activeTabId) ?? data.tabs[0];
      const idMap = new Map<string, string>();
      const newTabInfos: TabInfo[] = [];
      const newTabDocuments: Record<string, TabDocument> = {};
      for (const tb of data.tabs) {
        const newId = `tab-${nextId()}`;
        idMap.set(tb.id, newId);
        newTabInfos.push({ id: newId, title: tb.title });
        if (tb.id === activeSaved.id) continue; // lives in the top-level fields below instead
        newTabDocuments[newId] = {
          molecule: tb.molecule,
          annotations: tb.annotations,
          view: tb.view,
          page: tb.page ?? defaultPageSetup(),
          past: [],
          future: [],
          hasUnsavedChanges: true,
        };
      }
      const newActiveId = idMap.get(activeSaved.id)!;
      set((s) => ({
        tabs: [...s.tabs, ...newTabInfos],
        tabDocuments: { ...s.tabDocuments, [s.activeTabId]: snapshotActiveDocument(s), ...newTabDocuments },
        activeTabId: newActiveId,
        molecule: activeSaved.molecule,
        annotations: activeSaved.annotations,
        view: activeSaved.view,
        page: activeSaved.page ?? defaultPageSetup(),
        past: [],
        future: [],
        hasUnsavedChanges: true,
        ...transientResetFields(),
      }));
    },
    getAllTabsForSave: () => {
      const s = get();
      return s.tabs.map((tb) => {
        if (tb.id === s.activeTabId) {
          return { id: tb.id, title: tb.title, molecule: s.molecule, annotations: s.annotations, view: s.view, page: s.page };
        }
        const doc = s.tabDocuments[tb.id];
        return {
          id: tb.id,
          title: tb.title,
          molecule: doc?.molecule ?? M.emptyMolecule(),
          annotations: doc?.annotations ?? {},
          view: doc?.view ?? DEFAULT_VIEW,
          page: doc?.page ?? defaultPageSetup(),
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
          [id]: { molecule: M.emptyMolecule(), annotations: {}, view: DEFAULT_VIEW, page: defaultPageSetup(), past: [], future: [], hasUnsavedChanges: false },
        },
        activeTabId: id,
        molecule: M.emptyMolecule(),
        annotations: {},
        view: DEFAULT_VIEW,
        page: defaultPageSetup(),
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
        page: incoming.page,
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
          page: incoming.page,
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
        } else if (ann.kind === "orbital") {
          // The one annotation anchored at a center instead of a corner: its
          // extent is the nucleus ± the lobe length (roundly generous for
          // the lobes' width, which is fine for a fit-to-content box).
          minX = Math.min(minX, ann.x - ann.size); maxX = Math.max(maxX, ann.x + ann.size);
          minY = Math.min(minY, ann.y - ann.size); maxY = Math.max(maxY, ann.y + ann.size);
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
        } else if (ann.kind === "orbital") {
          minX = Math.min(minX, ann.x - ann.size); maxX = Math.max(maxX, ann.x + ann.size);
          minY = Math.min(minY, ann.y - ann.size); maxY = Math.max(maxY, ann.y + ann.size);
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
      commit((mol) => M.cleanUpAtoms(mol, ids, snapStepRadians(get().snapAngleDegrees)));
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
     * Places a graphics-primitive shape (rectangle/ellipse/line) from the
     * dragged rectangle's corners, normalized so width/height are always
     * positive regardless of drag direction. For "line" the box stores the
     * two endpoints' relative offset, so a dragged diagonal survives exactly
     * (see ShapeAnnotation's doc comment). A near-zero drag (a plain click)
     * falls back to a sensible default box/horizontal line — same reasoning
     * as the arrow/bracket tools' fallbacks.
     */
    addShapeAnnotation: (corner1, corner2, variant, filled) => {
      const id = nextId();
      const dragged = Math.hypot(corner2.x - corner1.x, corner2.y - corner1.y) > 8;
      let x: number, y: number, width: number, height: number;
      if (!dragged) {
        // Click: a default box centered on the click (or a default-length
        // horizontal line, since a line's "box" is its endpoint offset).
        if (variant === "line") {
          x = corner1.x - (BOND_LEN * 1.5) / 2;
          y = corner1.y;
          width = BOND_LEN * 1.5;
          height = 0;
        } else {
          x = corner1.x - DEFAULT_SHAPE_WIDTH / 2;
          y = corner1.y - DEFAULT_SHAPE_HEIGHT / 2;
          width = DEFAULT_SHAPE_WIDTH;
          height = DEFAULT_SHAPE_HEIGHT;
        }
      } else {
        x = Math.min(corner1.x, corner2.x);
        y = Math.min(corner1.y, corner2.y);
        width = Math.abs(corner2.x - corner1.x);
        height = Math.abs(corner2.y - corner1.y);
      }
      const ann: ShapeAnnotation = { id, kind: "shape", x, y, width, height, variant, filled };
      commitAnnotations((anns) => ({ ...anns, [id]: ann }));
      return id;
    },

    /**
     * Places an orbital from the drag gesture: the nucleus sits where the
     * drag started, and the vector to the release point sets both the lobe
     * length (clamped) and the axis angle — one gesture places a correctly
     * oriented orbital, the same way an arrow drag sets length + direction.
     * A near-zero drag falls back to the default size pointing right.
     */
    addOrbitalAnnotation: (center, point, variant, filled) => {
      const id = nextId();
      const dragged = dist(center, point) > 8;
      const size = dragged ? Math.min(MAX_ORBITAL_SIZE, Math.max(MIN_ORBITAL_SIZE, dist(center, point))) : DEFAULT_ORBITAL_SIZE;
      const angle = dragged && variant !== "s" ? (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI : 0;
      const ann: OrbitalAnnotation = { id, kind: "orbital", x: center.x, y: center.y, size, angle, variant, filled };
      commitAnnotations((anns) => ({ ...anns, [id]: ann }));
      return id;
    },

    /**
     * Places a TLC plate from the dragged rectangle's corners, normalized to
     * positive width/height. A near-zero drag falls back to a default
     * portrait plate centered on the click — the shape you'd start from on a
     * real bench, not a sliver.
     */
    addTlcPlate: (corner1, corner2) => {
      const id = nextId();
      const dragged = Math.hypot(corner2.x - corner1.x, corner2.y - corner1.y) > 8;
      const x = dragged ? Math.min(corner1.x, corner2.x) : corner1.x - DEFAULT_TLC_WIDTH / 2;
      const y = dragged ? Math.min(corner1.y, corner2.y) : corner1.y - DEFAULT_TLC_HEIGHT / 2;
      const width = dragged ? Math.max(MIN_SHAPE_SIZE, Math.abs(corner2.x - corner1.x)) : DEFAULT_TLC_WIDTH;
      const height = dragged ? Math.max(MIN_SHAPE_SIZE, Math.abs(corner2.y - corner1.y)) : DEFAULT_TLC_HEIGHT;
      const ann: TlcPlateAnnotation = { id, kind: "tlc", x, y, width, height, spots: [] };
      commitAnnotations((anns) => ({ ...anns, [id]: ann }));
      return id;
    },

    /**
     * Spots a TLC plate at the given canvas point (converted to the plate's
     * fractional spot coordinates). Outside the plate — even slightly —
     * returns null and places nothing: a spot on the bench top is a
     * mistake, not a wish.
     */
    addTlcSpot: (id, p) => {
      const ann = get().annotations[id];
      if (!ann || ann.kind !== "tlc") return null;
      if (!pointInRect(p, ann)) return null;
      const { fx, fy } = tlcPointToFractions(ann, p);
      const spot: TlcSpot = { fx, fy, r: DEFAULT_TLC_SPOT_R };
      commitAnnotations((anns) => {
        const plate = anns[id];
        if (!plate || plate.kind !== "tlc") return anns;
        return { ...anns, [id]: { ...plate, spots: [...plate.spots, spot] } };
      });
      return spot;
    },

    /** Removes the spot nearest to `p` (within TLC_SPOT_GRAB_RADIUS), so a
     * click with the right modifier undoes a misplaced spotting without
     * needing pixel-perfect aim. Returns whether anything was removed. */
    removeNearestTlcSpot: (id, p) => {
      const ann = get().annotations[id];
      if (!ann || ann.kind !== "tlc" || ann.spots.length === 0) return false;
      let bestIdx = -1;
      let bestD = Infinity;
      ann.spots.forEach((spot, i) => {
        const pos = tlcSpotPosition(ann, spot);
        const d = dist(pos, p);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      });
      if (bestIdx < 0 || bestD > TLC_SPOT_GRAB_RADIUS) return false;
      commitAnnotations((anns) => {
        const plate = anns[id];
        if (!plate || plate.kind !== "tlc") return anns;
        return { ...anns, [id]: { ...plate, spots: plate.spots.filter((_, i) => i !== bestIdx) } };
      });
      return true;
    },

    /** Removes one spot by index. The per-spot × button and Shift+click on
     * a spot both use this; returns true when a spot was removed. */
    removeTlcSpot: (id, spotIndex) => {
      const ann = get().annotations[id];
      if (!ann || ann.kind !== "tlc" || !ann.spots[spotIndex]) return false;
      commitAnnotations((anns) => {
        const plate = anns[id];
        if (!plate || plate.kind !== "tlc" || !plate.spots[spotIndex]) return anns;
        return { ...anns, [id]: { ...plate, spots: plate.spots.filter((_, i) => i !== spotIndex) } };
      });
      return true;
    },

    /** Moves an existing TLC spot to canvas point `p`, recomputing its
     * fractional coordinates (clamped to the plate). Used to drag a spotted
     * sample around after it's been placed. */
    moveTlcSpot: (id, spotIndex, p) => {
      const ann = get().annotations[id];
      if (!ann || ann.kind !== "tlc") return;
      const spot = ann.spots[spotIndex];
      if (!spot) return;
      const { fx, fy } = tlcPointToFractions(ann, p);
      commitAnnotations((anns) => {
        const plate = anns[id];
        if (!plate || plate.kind !== "tlc" || !plate.spots[spotIndex]) return anns;
        const next = [...plate.spots];
        next[spotIndex] = { ...spot, fx, fy };
        return { ...anns, [id]: { ...plate, spots: next } };
      });
    },

    /**
     * Deliberately doesn't just call addBracketPair() + addTextAnnotation()
     * in sequence \u2014 each of those calls commitAnnotations itself, which
     * would split this into two separate undo steps (the person would need
     * two undos to remove one charge bracket). Building all three
     * annotations here and committing them together keeps it atomic, same
     * reasoning as addBracketPair batching its open+close pair.
     *
     * Padding and label position are fixed defaults, not configurable \u2014
     * same as every other annotation this store creates (addPlusAnnotation,
     * addReagentText, ...): a reasonable starting point the person can drag
     * to taste afterward, not a placement the store needs to get exactly
     * right up front.
     */
    addChargeBracket: (atomIds) => {
      const { molecule } = get();
      const atoms: Atom[] = [...atomIds].map((id) => molecule.atoms[id]).filter((a): a is Atom => !!a);
      if (atoms.length === 0) return null;

      const minX = Math.min(...atoms.map((a) => a.x));
      const maxX = Math.max(...atoms.map((a) => a.x));
      const minY = Math.min(...atoms.map((a) => a.y));
      const maxY = Math.max(...atoms.map((a) => a.y));

      const { left, right, top, height } = bracketPairLayout(
        { x: minX - CHARGE_BRACKET_PADDING, y: minY - CHARGE_BRACKET_PADDING },
        { x: maxX + CHARGE_BRACKET_PADDING, y: maxY + CHARGE_BRACKET_PADDING },
      );

      const openId = nextId();
      const closeId = nextId();
      const labelId = nextId();
      const open: BracketAnnotation = {
        id: openId, kind: "bracket",
        x: left - DEFAULT_BRACKET_WIDTH, y: top, width: DEFAULT_BRACKET_WIDTH, height,
        variant: "square", facing: "open",
      };
      const close: BracketAnnotation = {
        id: closeId, kind: "bracket",
        x: right, y: top, width: DEFAULT_BRACKET_WIDTH, height,
        variant: "square", facing: "close",
      };
      const label: TextAnnotation = {
        id: labelId,
        kind: "text",
        x: right + DEFAULT_BRACKET_WIDTH + CHARGE_LABEL_GAP,
        y: top - CHARGE_LABEL_HEIGHT * 0.7,
        width: CHARGE_LABEL_WIDTH,
        height: CHARGE_LABEL_HEIGHT,
        html: "",
        fontSize: DEFAULT_FONT_SIZE,
      };

      commitAnnotations((anns) => ({ ...anns, [openId]: open, [closeId]: close, [labelId]: label }));
      set({ selectedAnnotationIds: new Set([labelId]), editingTextId: labelId });
      return { openId, closeId, labelId };
    },

    createSGroup: (atomIds, type, opts) => {
      const { molecule, annotations } = get();
      const ids = [...new Set(atomIds)].filter((id) => !!molecule.atoms[id]);
      if (ids.length === 0) return null;
      const atomSet = new Set(ids);
      const bondIds = sgroupBondIds(molecule, atomSet);

      let nextAnnotations = annotations;
      let bracketIds = (opts?.bracketAnnotationIds ?? []).filter(
        (id) => annotations[id]?.kind === "bracket",
      );
      if (bracketIds.length === 0) {
        const atoms = ids.map((id) => molecule.atoms[id]);
        const minX = Math.min(...atoms.map((a) => a.x));
        const maxX = Math.max(...atoms.map((a) => a.x));
        const minY = Math.min(...atoms.map((a) => a.y));
        const maxY = Math.max(...atoms.map((a) => a.y));
        const padding = 24;
        const { left, right, top, height } = bracketPairLayout(
          { x: minX - padding, y: minY - padding },
          { x: maxX + padding, y: maxY + padding },
        );
        const variant = opts?.bracketVariant ?? "square";
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
        nextAnnotations = { ...annotations, [openId]: open, [closeId]: close };
        bracketIds = [openId, closeId];
      }

      const id = nextId();
      const variant = opts?.bracketVariant ?? "square";
      const group: SGroup = {
        id,
        type,
        atomIds: ids,
        bracketStyle: variant === "paren" ? "round" : variant === "curly" ? "curly" : "square",
        bracketAnnotationIds: bracketIds,
      };
      if (bondIds.length > 0) group.bondIds = bondIds;
      const subscript = opts?.subscript ?? DEFAULT_SGROUP_SUBSCRIPT[type];
      if (subscript) group.subscript = subscript;
      if (opts?.label) group.label = opts.label;

      set((s) => ({
        molecule: { ...s.molecule, sgroups: { ...s.molecule.sgroups, [id]: group } },
        annotations: nextAnnotations,
        past: [...s.past, { molecule: s.molecule, annotations: s.annotations }].slice(-HISTORY_LIMIT),
        future: [],
        hasUnsavedChanges: true,
        selected: atomSet,
        selectedAnnotationIds: new Set(bracketIds),
      }));
      return id;
    },

    updateSGroup: (id, patch) => {
      commit((mol) => {
        const sg = mol.sgroups?.[id];
        if (!sg) return mol;
        const next: SGroup = { ...sg };
        if (patch.type !== undefined) next.type = patch.type;
        if (patch.subscript !== undefined) {
          if (patch.subscript) next.subscript = patch.subscript;
          else delete next.subscript;
        }
        if (patch.label !== undefined) {
          if (patch.label) next.label = patch.label;
          else delete next.label;
        }
        if (next.type === sg.type && next.subscript === sg.subscript && next.label === sg.label) return mol;
        return { ...mol, sgroups: { ...mol.sgroups, [id]: next } };
      });
    },

    deleteSGroup: (id) => {
      commit((mol) => {
        if (!mol.sgroups?.[id]) return mol;
        const sgroups = { ...mol.sgroups };
        delete sgroups[id];
        if (Object.keys(sgroups).length > 0) return { ...mol, sgroups };
        const next = { ...mol };
        delete next.sgroups;
        return next;
      });
    },

    addSelectionToSGroup: (id) => {
      const { selected } = get();
      if (selected.size === 0) return;
      commit((mol) => {
        const sg = mol.sgroups?.[id];
        if (!sg) return mol;
        const atomIds = [...new Set([...sg.atomIds, ...selected])].filter((atomId) => !!mol.atoms[atomId]);
        if (atomIds.length === sg.atomIds.length) return mol;
        const bondIds = sgroupBondsTouching(mol, atomIds, sg.bondIds ?? []);
        const next: SGroup = { ...sg, atomIds };
        if (bondIds.length > 0) next.bondIds = bondIds;
        else delete next.bondIds;
        return { ...mol, sgroups: { ...mol.sgroups, [id]: next } };
      });
    },

    removeSelectionFromSGroup: (id) => {
      const { selected } = get();
      if (selected.size === 0) return;
      commit((mol) => {
        const sg = mol.sgroups?.[id];
        if (!sg) return mol;
        const atomIds = sg.atomIds.filter((atomId) => !selected.has(atomId));
        if (atomIds.length === sg.atomIds.length) return mol;
        if (atomIds.length === 0) {
          const sgroups = { ...mol.sgroups };
          delete sgroups[id];
          if (Object.keys(sgroups).length > 0) return { ...mol, sgroups };
          const next = { ...mol };
          delete next.sgroups;
          return next;
        }
        const bondIds = sgroupBondsTouching(mol, atomIds, sg.bondIds ?? []);
        const next: SGroup = { ...sg, atomIds };
        if (bondIds.length > 0) next.bondIds = bondIds;
        else delete next.bondIds;
        return { ...mol, sgroups: { ...mol.sgroups, [id]: next } };
      });
    },

    toggleHapticBond: (atomIds) => {
      const { molecule } = get();
      const resolved = M.resolveHapticSelection(molecule, atomIds);
      if (!resolved) return false;
      const existing = M.findHapticBond(molecule, resolved.metalAtomId, resolved.ringAtomIds);
      if (existing) {
        commit((mol) => M.deleteHapticBond(mol, existing.id));
      } else {
        commit((mol) => M.addHapticBond(mol, nextId(), resolved.metalAtomId, resolved.ringAtomIds));
      }
      return true;
    },

    toggleAromaticRingDisplay: (atomIds) => {
      const { molecule } = get();
      const existing = M.findAromaticRingDisplay(molecule, atomIds);
      if (existing) {
        commit((mol) => M.deleteAromaticRingDisplay(mol, existing.id));
      } else {
        commit((mol) => M.addAromaticRingDisplay(mol, nextId(), atomIds));
      }
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
        return {
          annotations: { ...s.annotations, [id]: { ...ann, html } },
          // See hasUnsavedChangesInTransientAnnotationEdit above.
          hasUnsavedChanges: true,
        };
      });
    },

    updateTextSize: (id, width, height) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "text") return s;
        if (ann.width === width && ann.height === height) return s;
        return {
          annotations: { ...s.annotations, [id]: { ...ann, width, height } },
          // See hasUnsavedChangesInTransientAnnotationEdit above.
          hasUnsavedChanges: true,
        };
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
        return {
          annotations: { ...s.annotations, [id]: { ...ann, width, height } },
          // See hasUnsavedChangesInTransientAnnotationEdit above.
          hasUnsavedChanges: true,
        };
      });
    },

    setBracketStyleOf: (id, variant, facing) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "bracket") return anns;
        return { ...anns, [id]: { ...ann, variant, facing } };
      });
    },

    updateShapeSize: (id, width, height) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "shape") return s;
        const w = Math.max(MIN_SHAPE_SIZE, width);
        const h = Math.max(MIN_SHAPE_SIZE, height);
        if (ann.width === w && ann.height === h) return s;
        return {
          annotations: { ...s.annotations, [id]: { ...ann, width: w, height: h } },
          // See hasUnsavedChangesInTransientAnnotationEdit above.
          hasUnsavedChanges: true,
        };
      });
    },

    /** TLC plate resize — same transient contract as updateShapeSize, but
     * for the plate (whose spots ride along in fractional coordinates). */
    updateTlcSize: (id, width, height) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "tlc") return s;
        const w = Math.max(MIN_SHAPE_SIZE, width);
        const h = Math.max(MIN_SHAPE_SIZE, height);
        if (ann.width === w && ann.height === h) return s;
        return {
          annotations: { ...s.annotations, [id]: { ...ann, width: w, height: h } },
          hasUnsavedChanges: true,
        };
      });
    },

    setShapeStyleOf: (id, variant, filled) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "shape") return anns;
        return { ...anns, [id]: { ...ann, variant, filled } };
      });
    },

    /** Live orbital rotate/resize from the view's one handle: the handle
     * sits at the orbital's axis tip, so one drag does both (angle from the
     * handle's direction, size from its distance). "s" orbitals are round —
     * their angle is normalized to 0 so it can't drift meaninglessly. */
    updateOrbitalTransformTransient: (id, size, angle) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann || ann.kind !== "orbital") return s;
        const nextSize = Math.min(MAX_ORBITAL_SIZE, Math.max(MIN_ORBITAL_SIZE, size));
        const nextAngle = ann.variant === "s" ? 0 : angle;
        if (ann.size === nextSize && ann.angle === nextAngle) return s;
        return {
          annotations: { ...s.annotations, [id]: { ...ann, size: nextSize, angle: nextAngle } },
          // See hasUnsavedChangesInTransientAnnotationEdit above.
          hasUnsavedChanges: true,
        };
      });
    },

    setOrbitalStyleOf: (id, variant, filled) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "orbital") return anns;
        // Switching to/from "s" resets the angle — a circle has no axis, and
        // coming back from "s" at angle 0 is the natural restart.
        const angle = variant === "s" ? 0 : ann.angle;
        return { ...anns, [id]: { ...ann, variant, filled, angle } };
      });
    },

    moveAnnotationTransient: (id, p) => {
      set((s) => {
        const ann = s.annotations[id];
        if (!ann) return s;
        // Everything anchored at an (x, y) origin — text boxes, brackets,
        // shapes, TLC plates (spots ride along in fractional coords), and
        // orbitals (x/y is the nucleus) — just translates.
        if (ann.kind !== "arrow") {
          return {
            annotations: { ...s.annotations, [id]: { ...ann, x: p.x, y: p.y } },
            // See hasUnsavedChangesInTransientAnnotationEdit above.
            hasUnsavedChanges: true,
          };
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
        return {
          annotations: { ...s.annotations, [id]: { ...ann, curvature } },
          // See hasUnsavedChangesInTransientAnnotationEdit above.
          hasUnsavedChanges: true,
        };
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

    setArrowDashedOf: (id, dashed) => {
      commitAnnotations((anns) => {
        const ann = anns[id];
        if (!ann || ann.kind !== "arrow") return anns;
        return { ...anns, [id]: { ...ann, dashed } };
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
