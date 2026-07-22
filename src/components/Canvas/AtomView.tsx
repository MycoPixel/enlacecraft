import type { Atom, Molecule } from "../../types/chemistry";
import { atomLabelInfo } from "../../model/valence";
import { defaultLonePairPosition } from "../../model/lonePairs";
import { ELEMENT_COLOR } from "../../model/constants";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useCallback, useEffect, useRef, useMemo, type RefObject } from "react";

interface AtomViewProps {
  atom: Atom;
  mol: Molecule;
  selected: boolean;
  overValent: boolean;
  svgRef: RefObject<SVGSVGElement>;
}

/** Formats atom label text with numbers rendered as subscripts. */
function formatLabelWithSubscripts(text: string): Array<{ text: string; subscript: boolean }> {
  const parts: Array<{ text: string; subscript: boolean }> = [];
  let current = "";
  let inNumber = false;
  
  for (const char of text) {
    const isDigit = /\d/.test(char);
    if (isDigit !== inNumber) {
      if (current) {
        parts.push({ text: current, subscript: inNumber });
      }
      current = char;
      inNumber = isDigit;
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push({ text: current, subscript: inNumber });
  }
  
  return parts;
}

export function AtomView({ atom, mol, selected, overValent, svgRef }: AtomViewProps) {
  const showHydrogens = useMoleculeStore((s) => s.showHydrogens);
  const atomLabelRevealTargets = useMoleculeStore((s) => s.atomLabelRevealTargets);
  const monochrome = useMoleculeStore((s) => s.monochromeAtoms);
  const view = useMoleculeStore((s) => s.view);
  const setAtomChargeOffset = useMoleculeStore((s) => s.setAtomChargeOffset);
  const setLonePairOffset = useMoleculeStore((s) => s.setLonePairOffset);
  const setAtomRadicalOffset = useMoleculeStore((s) => s.setAtomRadicalOffset);
  const setAtomStereoLabelOffset = useMoleculeStore((s) => s.setAtomStereoLabelOffset);
  const { visible: showLabel, text, isotopePrefix } = atomLabelInfo(mol, atom.id, showHydrogens, atomLabelRevealTargets.has(atom.id));
  const color = overValent ? "var(--danger)" : monochrome ? "var(--ink)" : ELEMENT_COLOR[atom.element] || "var(--ink)";
  const labelParts = useMemo(() => formatLabelWithSubscripts(text), [text]);
  const isotopeOffsetX = -(text.length * 3.6) / 2 - 4.5;
  const isotopeOffsetY = -8.5;
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const lonePairDragRef = useRef<{ index: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const radicalDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const stereoLabelDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.tx) / view.scale,
      y: (clientY - rect.top - view.ty) / view.scale,
    };
  }, [svgRef, view]);

  const chargeLabel =
    atom.charge === 0 ? "" :
    atom.charge > 0 ? (atom.charge === 1 ? "+" : `${atom.charge}+`) :
    atom.charge === -1 ? "\u2212" : `${Math.abs(atom.charge)}\u2212`;

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!chargeLabel) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const worldPos = clientToWorld(e.clientX, e.clientY);
    dragRef.current = {
      startX: worldPos.x,
      startY: worldPos.y,
      originX: atom.chargeOffsetX ?? 0,
      originY: atom.chargeOffsetY ?? 0,
    };
  }, [atom.chargeOffsetX, atom.chargeOffsetY, chargeLabel, clientToWorld]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current || !chargeLabel) return;
    const worldPos = clientToWorld(e.clientX, e.clientY);
    const dx = worldPos.x - dragRef.current.startX;
    const dy = worldPos.y - dragRef.current.startY;
    setAtomChargeOffset(atom.id, dragRef.current.originX + dx, dragRef.current.originY + dy);
  }, [atom.id, chargeLabel, setAtomChargeOffset, clientToWorld]);

  const handleLonePairPointerDown = useCallback((index: number, current: { x: number; y: number }) =>
    (e: React.PointerEvent<SVGGElement>) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const worldPos = clientToWorld(e.clientX, e.clientY);
      lonePairDragRef.current = {
        index,
        startX: worldPos.x,
        startY: worldPos.y,
        originX: current.x,
        originY: current.y,
      };
    }, [clientToWorld]);

  const handleLonePairPointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!lonePairDragRef.current) return;
    const worldPos = clientToWorld(e.clientX, e.clientY);
    const dx = worldPos.x - lonePairDragRef.current.startX;
    const dy = worldPos.y - lonePairDragRef.current.startY;
    setLonePairOffset(
      atom.id,
      lonePairDragRef.current.index,
      lonePairDragRef.current.originX + dx,
      lonePairDragRef.current.originY + dy
    );
  }, [atom.id, setLonePairOffset, clientToWorld]);

  const handleRadicalPointerDown = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!atom.radical) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const worldPos = clientToWorld(e.clientX, e.clientY);
    radicalDragRef.current = {
      startX: worldPos.x,
      startY: worldPos.y,
      originX: atom.radicalOffsetX ?? 0,
      originY: atom.radicalOffsetY ?? 0,
    };
  }, [atom.radical, atom.radicalOffsetX, atom.radicalOffsetY, clientToWorld]);

  const handleRadicalPointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!radicalDragRef.current || !atom.radical) return;
    const worldPos = clientToWorld(e.clientX, e.clientY);
    const dx = worldPos.x - radicalDragRef.current.startX;
    const dy = worldPos.y - radicalDragRef.current.startY;
    setAtomRadicalOffset(atom.id, radicalDragRef.current.originX + dx, radicalDragRef.current.originY + dy);
  }, [atom.id, atom.radical, setAtomRadicalOffset, clientToWorld]);

  const handleStereoLabelPointerDown = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!atom.stereoLabel) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const worldPos = clientToWorld(e.clientX, e.clientY);
    stereoLabelDragRef.current = {
      startX: worldPos.x,
      startY: worldPos.y,
      originX: atom.stereoLabelOffsetX ?? 0,
      originY: atom.stereoLabelOffsetY ?? 0,
    };
  }, [atom.stereoLabel, atom.stereoLabelOffsetX, atom.stereoLabelOffsetY, clientToWorld]);

  const handleStereoLabelPointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!stereoLabelDragRef.current || !atom.stereoLabel) return;
    const worldPos = clientToWorld(e.clientX, e.clientY);
    const dx = worldPos.x - stereoLabelDragRef.current.startX;
    const dy = worldPos.y - stereoLabelDragRef.current.startY;
    setAtomStereoLabelOffset(atom.id, stereoLabelDragRef.current.originX + dx, stereoLabelDragRef.current.originY + dy);
  }, [atom.id, atom.stereoLabel, setAtomStereoLabelOffset, clientToWorld]);

  useEffect(() => {
    const onPointerUp = () => {
      dragRef.current = null;
      lonePairDragRef.current = null;
      radicalDragRef.current = null;
      stereoLabelDragRef.current = null;
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, []);

  return (
    <g transform={`translate(${atom.x},${atom.y})`} data-atom-id={atom.id}>
      {selected && <circle r="15" fill="var(--selection)" data-export-exclude="true" />}
      {overValent && (
        <circle r="13" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeDasharray="3 2" data-export-exclude="true" />
      )}
      {showLabel ? (
        <>
          {isotopePrefix && (
            <text
              x={isotopeOffsetX}
              y={isotopeOffsetY}
              textAnchor="end"
              fontSize="8.8"
              fontWeight="500"
              fill={color}
              className="atom-label"
            >
              {isotopePrefix}
            </text>
          )}
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="14.5"
            fontWeight="500"
            fill={color}
            className="atom-label"
          >
            {labelParts.map((part, i) => (
              <tspan
                key={i}
                dy={part.subscript ? 4 : i === 0 ? 0 : -4}
                fontSize={part.subscript ? "10" : "14.5"}
              >
                {part.text}
              </tspan>
            ))}
          </text>
        </>
      ) : (
        <circle r="2" fill={color} className="atom-vertex" data-export-exclude="true" />
      )}
      {chargeLabel && (
        <g
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          style={{ cursor: "grab" }}
        >
          <circle
            cx={(showLabel ? text.length * 4 + 4 : 6) + (atom.chargeOffsetX ?? 0) + 3}
            cy={-8 + (atom.chargeOffsetY ?? 0) - 3}
            r="9"
            fill="transparent"
            data-export-exclude="true"
          />
          <text
            x={(showLabel ? text.length * 4 + 4 : 6) + (atom.chargeOffsetX ?? 0)}
            y={-8 + (atom.chargeOffsetY ?? 0)}
            fontSize="13"
            fontWeight="700"
            fill={color}
            style={{ pointerEvents: "none" }}
          >
            {chargeLabel}
          </text>
        </g>
      )}
      {!!atom.lonePairs && Array.from({ length: atom.lonePairs }, (_, i) => {
        const override = atom.lonePairOffsets?.[i];
        const pos = override ?? defaultLonePairPosition(mol, atom.id, i, atom.lonePairs!);
        return (
          <g
            key={i}
            onPointerDown={handleLonePairPointerDown(i, pos)}
            onPointerMove={handleLonePairPointerMove}
            style={{ cursor: "grab" }}
          >
            {/* Larger invisible hit area — the visible dots are tiny — so
                this is what actually gets grabbed. */}
            <circle cx={pos.x} cy={pos.y} r="7" fill="transparent" data-export-exclude="true" />
            <LonePairDots x={pos.x} y={pos.y} color={color} />
          </g>
        );
      })}
      {atom.radical && (
        <g
          onPointerDown={handleRadicalPointerDown}
          onPointerMove={handleRadicalPointerMove}
          style={{ cursor: "grab" }}
        >
          <RadicalDot
            base={defaultLonePairPosition(mol, atom.id, atom.lonePairs ?? 0, (atom.lonePairs ?? 0) + 1)}
            color={color}
            offsetX={atom.radicalOffsetX ?? 0}
            offsetY={atom.radicalOffsetY ?? 0}
          />
        </g>
      )}
      {atom.stereoLabel && (
        <g
          onPointerDown={handleStereoLabelPointerDown}
          onPointerMove={handleStereoLabelPointerMove}
          style={{ cursor: "grab" }}
        >
          <circle
            cx={atom.stereoLabelOffsetX ?? 0}
            cy={15 + (atom.stereoLabelOffsetY ?? 0) - 4}
            r="10"
            fill="transparent"
            data-export-exclude="true"
          />
          <text
            x={(atom.stereoLabelOffsetX ?? 0)}
            y={15 + (atom.stereoLabelOffsetY ?? 0)}
            textAnchor="middle"
            fontSize="9.5"
            fontStyle="italic"
            fontWeight="600"
            fill={color}
            className="atom-label"
            style={{ pointerEvents: "none" }}
          >
            ({atom.stereoLabel})
          </text>
        </g>
      )}
    </g>
  );
}

/** Renders one lone pair's two dots at local position (x, y), splitting
 * them tangentially (perpendicular to the direction from the atom center
 * out to that position) rather than always horizontally or vertically —
 * this is what makes a pair look correctly "rotated" no matter which way
 * around the atom it's been placed, instead of only ever looking right
 * when it happens to sit exactly on top, right, bottom, or left. */
function LonePairDots({ x, y, color }: { x: number; y: number; color: string }) {
  const angle = Math.atan2(y, x);
  const perp = angle + Math.PI / 2;
  const dx = Math.cos(perp) * 2.6;
  const dy = Math.sin(perp) * 2.6;
  return (
    <g>
      <circle cx={x - dx} cy={y - dy} r="1.3" fill={color} />
      <circle cx={x + dx} cy={y + dy} r="1.3" fill={color} />
    </g>
  );
}

function RadicalDot({ base, color, offsetX = 0, offsetY = 0 }: { base: { x: number; y: number }; color: string; offsetX?: number; offsetY?: number }) {
  const x = base.x + offsetX;
  const y = base.y + offsetY;
  return (
    <>
      {/* Larger invisible hit area — the visible dot alone (r=1.6) is too small to reliably grab. */}
      <circle cx={x} cy={y} r="8" fill="transparent" data-export-exclude="true" />
      <circle cx={x} cy={y} r="1.6" fill={color} style={{ pointerEvents: "none" }} />
    </>
  );
}
