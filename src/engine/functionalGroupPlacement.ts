import type { FunctionalGroupAttachment, FunctionalGroupTemplate, Molecule, Point } from "../types/chemistry";
import { addAtom, addBond, setAtomCharge } from "../model/molecule";
import { angleOf } from "../model/geometry";
import { neighborAngles } from "../model/valence";
import { nextId } from "../model/id";

function rotate(p: Point, cos: number, sin: number): Point {
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/**
 * Resolves the rigid rotation+translation that carries a functional group
 * template's local layout into world space, honoring `attachment` — shared
 * by placeFunctionalGroup (which turns this into real atoms/bonds) and
 * previewFunctionalGroupSegments (which just draws it), so the hover
 * preview always matches exactly where the group will actually land.
 *
 * `desiredDir` (radians), when given, is used directly as the group's
 * growth direction instead of the automatic "point away from existing
 * bonds" default — the angle a person drags out before releasing, the
 * same press-drag-release interaction drawing a bond already uses (see
 * useCanvasInteractions' "functional-group" drag mode, which is also
 * responsible for snapping it to 30° unless freeform). Pass null for the
 * plain automatic orientation (e.g. a click with no drag).
 */
function resolveFunctionalGroupTransform(
  mol: Molecule,
  template: FunctionalGroupTemplate,
  center: Point,
  attachment: FunctionalGroupAttachment,
  desiredDir: number | null
): { worldOf: (p: Point) => Point; attachAtomId: string | null } {
  const local: Record<string, Point> = {};
  for (const a of template.atoms) local[a.key] = { x: a.x, y: a.y };

  const growthBond = template.bonds.find((b) => b.from === template.attachKey || b.to === template.attachKey);
  const neighborKey = growthBond ? (growthBond.from === template.attachKey ? growthBond.to : growthBond.from) : null;
  // The direction (in local space) this group extends away from its own
  // attachment point — by authoring convention this is always 0° (+x),
  // but it's computed from the actual data rather than assumed, so a
  // future template with a different layout still places correctly.
  const localGrowthAngle = neighborKey ? angleOf(local[template.attachKey], local[neighborKey]) : 0;

  let theta: number;
  let tx: number;
  let ty: number;
  let attachAtomId: string | null = null;

  if (attachment.type === "atom") {
    const atom = mol.atoms[attachment.atomId];
    const existingAngles = neighborAngles(mol, attachment.atomId);
    const dir = desiredDir ?? (existingAngles.length ? existingAngles[0] + Math.PI : -Math.PI / 2);
    theta = dir - localGrowthAngle;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rotatedAttachPos = rotate(local[template.attachKey], cos, sin);
    tx = atom.x - rotatedAttachPos.x;
    ty = atom.y - rotatedAttachPos.y;
    attachAtomId = attachment.atomId;
  } else {
    // No existing atom to point away from: default to pointing "up",
    // matching every other template/tool's empty-canvas default in this
    // app (rings, chains, ...), unless a direction was explicitly dragged.
    const dir = desiredDir ?? -Math.PI / 2;
    theta = dir - localGrowthAngle;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rotatedAttachPos = rotate(local[template.attachKey], cos, sin);
    tx = center.x - rotatedAttachPos.x;
    ty = center.y - rotatedAttachPos.y;
  }

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const worldOf = (p: Point): Point => {
    const rp = rotate(p, cos, sin);
    return { x: tx + rp.x, y: ty + rp.y };
  };
  return { worldOf, attachAtomId };
}

/**
 * Places a functional group template, either fused onto an existing atom
 * (extending away from its existing bonds, same convention as a
 * single-ring RingTemplate's atom attachment — see
 * engine/ringPlacement.ts) or dropped on an empty-canvas click.
 * `desiredDir` is the manually-dragged angle described in
 * resolveFunctionalGroupTransform's doc comment; pass null (the default)
 * for the plain automatic orientation.
 *
 * On an empty canvas, the template's attachKey position isn't
 * materialized as a real atom at all — the group is placed as if
 * attachKey's own slot were simply left unfilled, which (via ordinary
 * implicit-hydrogen valence math) draws exactly the group's own parent
 * compound: an unattached "carboxylic acid" group is formic acid, an
 * unattached "amine" is ammonia, and so on. That's a deliberate, correct
 * default rather than an edge case to special-case around.
 */
export function placeFunctionalGroup(
  mol: Molecule,
  template: FunctionalGroupTemplate,
  center: Point,
  attachment: FunctionalGroupAttachment,
  desiredDir: number | null = null
): Molecule {
  const { worldOf, attachAtomId } = resolveFunctionalGroupTransform(mol, template, center, attachment, desiredDir);

  let working = mol;
  const ids: Record<string, string> = {};
  for (const a of template.atoms) {
    if (a.key === template.attachKey) {
      // Reuse the existing atom's identity (leave its element untouched),
      // or — on an empty canvas — skip creating anything for this slot at
      // all; see this function's own doc comment for why that's correct.
      if (attachAtomId) ids[a.key] = attachAtomId;
      continue;
    }
    const id = nextId();
    working = addAtom(working, id, worldOf({ x: a.x, y: a.y }), a.element);
    if (a.charge) working = setAtomCharge(working, id, a.charge);
    ids[a.key] = id;
  }

  for (const b of template.bonds) {
    const a1 = ids[b.from];
    const a2 = ids[b.to];
    if (!a1 || !a2) continue; // one endpoint was the skipped empty-canvas attachKey slot
    // addBond is a no-op if a1/a2 are already bonded (relevant when
    // attaching directly onto an existing atom that happens to already
    // share a bond with... in practice this never collides for these
    // single-point-attachment templates, but the no-op safety matches how
    // placeRing treats a reused attach atom too).
    working = addBond(working, nextId(), a1, a2, b.order, "none");
  }

  return working;
}

/**
 * Computes the line segments a functional group template would produce for
 * `attachment` and `desiredDir`, without touching the molecule — for the
 * functional-group tool's hover/drag preview. Each segment is a plain
 * world-space line (bond order isn't distinguished visually here — a
 * single translucent line per bond is enough for a placement preview,
 * unlike the real BondView rendering).
 */
export function previewFunctionalGroupSegments(
  mol: Molecule,
  template: FunctionalGroupTemplate,
  center: Point,
  attachment: FunctionalGroupAttachment,
  desiredDir: number | null = null
): { x1: number; y1: number; x2: number; y2: number }[] {
  const { worldOf, attachAtomId } = resolveFunctionalGroupTransform(mol, template, center, attachment, desiredDir);
  const local: Record<string, Point> = {};
  for (const a of template.atoms) local[a.key] = { x: a.x, y: a.y };

  return template.bonds
    .filter((b) => attachAtomId || (b.from !== template.attachKey && b.to !== template.attachKey))
    .map((b) => {
      const p1 = b.from === template.attachKey && attachAtomId ? mol.atoms[attachAtomId] : worldOf(local[b.from]);
      const p2 = b.to === template.attachKey && attachAtomId ? mol.atoms[attachAtomId] : worldOf(local[b.to]);
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    });
}
