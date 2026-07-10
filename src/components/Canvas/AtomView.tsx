import type { Atom, Molecule } from "../../types/chemistry";
import { atomLabelInfo } from "../../model/valence";
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
  const setAtomLonePairsOffset = useMoleculeStore((s) => s.setAtomLonePairsOffset);
  const setAtomRadicalOffset = useMoleculeStore((s) => s.setAtomRadicalOffset);
  const setAtomStereoLabelOffset = useMoleculeStore((s) => s.setAtomStereoLabelOffset);
  const { visible: showLabel, text, isotopePrefix } = atomLabelInfo(mol, atom.id, showHydrogens, atomLabelRevealTargets.has(atom.id));
  const color = overValent ? "var(--danger)" : monochrome ? "var(--ink)" : ELEMENT_COLOR[atom.element] || "var(--ink)";
  const labelParts = useMemo(() => formatLabelWithSubscripts(text), [text]);
  const isotopeOffsetX = -(text.length * 3.6) / 2 - 4.5;
  const isotopeOffsetY = -8.5;
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const lonePairsDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
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

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGTextElement>) => {
    if (!chargeLabel) return;
    e.stopPropagation();
    const worldPos = clientToWorld(e.clientX, e.clientY);
    dragRef.current = {
      startX: worldPos.x,
      startY: worldPos.y,
      originX: atom.chargeOffsetX ?? 0,
      originY: atom.chargeOffsetY ?? 0,
    };
  }, [atom.chargeOffsetX, atom.chargeOffsetY, chargeLabel, clientToWorld]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGTextElement>) => {
    if (!dragRef.current || !chargeLabel) return;
    const worldPos = clientToWorld(e.clientX, e.clientY);
    const dx = worldPos.x - dragRef.current.startX;
    const dy = worldPos.y - dragRef.current.startY;
    setAtomChargeOffset(atom.id, dragRef.current.originX + dx, dragRef.current.originY + dy);
  }, [atom.id, chargeLabel, setAtomChargeOffset, clientToWorld]);

  const handleLonePairsPointerDown = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!atom.lonePairs) return;
    e.stopPropagation();
    const worldPos = clientToWorld(e.clientX, e.clientY);
    lonePairsDragRef.current = {
      startX: worldPos.x,
      startY: worldPos.y,
      originX: atom.lonePairsOffsetX ?? 0,
      originY: atom.lonePairsOffsetY ?? 0,
    };
  }, [atom.lonePairs, atom.lonePairsOffsetX, atom.lonePairsOffsetY, clientToWorld]);

  const handleLonePairsPointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!lonePairsDragRef.current || !atom.lonePairs) return;
    const worldPos = clientToWorld(e.clientX, e.clientY);
    const dx = worldPos.x - lonePairsDragRef.current.startX;
    const dy = worldPos.y - lonePairsDragRef.current.startY;
    setAtomLonePairsOffset(atom.id, lonePairsDragRef.current.originX + dx, lonePairsDragRef.current.originY + dy);
  }, [atom.id, atom.lonePairs, setAtomLonePairsOffset, clientToWorld]);

  const handleRadicalPointerDown = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    if (!atom.radical) return;
    e.stopPropagation();
    const worldPos = clientToWorld(e.clientX, e.clientY);
    radicalDragRef.current = {
      startX: worldPos.x,
      startY: worldPos.y,
      originX: atom.radicalOffsetX ?? 0,
      originY: atom.radicalOffsetY ?? 0,
    };
  }, [atom.radical, atom.radicalOffsetX, atom.radicalOffsetY, clientToWorld]);

  const handleRadicalPointerMove = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    if (!radicalDragRef.current || !atom.radical) return;
    const worldPos = clientToWorld(e.clientX, e.clientY);
    const dx = worldPos.x - radicalDragRef.current.startX;
    const dy = worldPos.y - radicalDragRef.current.startY;
    setAtomRadicalOffset(atom.id, radicalDragRef.current.originX + dx, radicalDragRef.current.originY + dy);
  }, [atom.id, atom.radical, setAtomRadicalOffset, clientToWorld]);

  const handleStereoLabelPointerDown = useCallback((e: React.PointerEvent<SVGTextElement>) => {
    if (!atom.stereoLabel) return;
    e.stopPropagation();
    const worldPos = clientToWorld(e.clientX, e.clientY);
    stereoLabelDragRef.current = {
      startX: worldPos.x,
      startY: worldPos.y,
      originX: atom.stereoLabelOffsetX ?? 0,
      originY: atom.stereoLabelOffsetY ?? 0,
    };
  }, [atom.stereoLabel, atom.stereoLabelOffsetX, atom.stereoLabelOffsetY, clientToWorld]);

  const handleStereoLabelPointerMove = useCallback((e: React.PointerEvent<SVGTextElement>) => {
    if (!stereoLabelDragRef.current || !atom.stereoLabel) return;
    const worldPos = clientToWorld(e.clientX, e.clientY);
    const dx = worldPos.x - stereoLabelDragRef.current.startX;
    const dy = worldPos.y - stereoLabelDragRef.current.startY;
    setAtomStereoLabelOffset(atom.id, stereoLabelDragRef.current.originX + dx, stereoLabelDragRef.current.originY + dy);
  }, [atom.id, atom.stereoLabel, setAtomStereoLabelOffset, clientToWorld]);

  useEffect(() => {
    const onPointerUp = () => {
      dragRef.current = null;
      lonePairsDragRef.current = null;
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
        <text
          x={(showLabel ? text.length * 4 + 4 : 6) + (atom.chargeOffsetX ?? 0)}
          y={-8 + (atom.chargeOffsetY ?? 0)}
          fontSize="13"
          fontWeight="700"
          fill={color}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          style={{ cursor: "grab" }}
        >
          {chargeLabel}
        </text>
      )}
      <g
        onPointerDown={handleLonePairsPointerDown}
        onPointerMove={handleLonePairsPointerMove}
        style={{ cursor: "grab" }}
        transform={`translate(${atom.lonePairsOffsetX ?? 0},${atom.lonePairsOffsetY ?? 0})`}
      >
        {Array.from({ length: atom.lonePairs ?? 0 }, (_, i) => (
          <LonePairDots key={i} slot={i} color={color} />
        ))}
      </g>
      {atom.radical && (
        <RadicalDot
          slot={atom.lonePairs ?? 0}
          color={color}
          offsetX={atom.radicalOffsetX ?? 0}
          offsetY={atom.radicalOffsetY ?? 0}
          onPointerDown={handleRadicalPointerDown}
          onPointerMove={handleRadicalPointerMove}
        />
      )}
      {atom.stereoLabel && (
        <text
          x={(atom.stereoLabelOffsetX ?? 0)}
          y={15 + (atom.stereoLabelOffsetY ?? 0)}
          textAnchor="middle"
          fontSize="9.5"
          fontStyle="italic"
          fontWeight="600"
          fill={color}
          className="atom-label"
          onPointerDown={handleStereoLabelPointerDown}
          onPointerMove={handleStereoLabelPointerMove}
          style={{ cursor: "grab" }}
        >
          ({atom.stereoLabel})
        </text>
      )}
    </g>
  );
}

/** Cardinal slot positions (top, right, bottom, left) around an atom, used
 * for both lone-pair and radical-dot placement so the two can share a
 * consistent "next free slot" ordering. */
const DOT_SLOTS: { x: number; y: number; axis: "h" | "v" }[] = [
  { x: 0, y: -11, axis: "h" }, // top: pair splits horizontally
  { x: 11, y: 0, axis: "v" },  // right: pair splits vertically
  { x: 0, y: 11, axis: "h" },  // bottom
  { x: -11, y: 0, axis: "v" }, // left
];

function LonePairDots({ slot, color }: { slot: number; color: string }) {
  const { x, y, axis } = DOT_SLOTS[slot % DOT_SLOTS.length];
  const dx = axis === "h" ? 2.6 : 0;
  const dy = axis === "v" ? 2.6 : 0;
  return (
    <g>
      <circle cx={x - dx} cy={y - dy} r="1.3" fill={color} />
      <circle cx={x + dx} cy={y + dy} r="1.3" fill={color} />
    </g>
  );
}

function RadicalDot({ slot, color, offsetX = 0, offsetY = 0, onPointerDown, onPointerMove }: { slot: number; color: string; offsetX?: number; offsetY?: number; onPointerDown?: (e: React.PointerEvent<SVGCircleElement>) => void; onPointerMove?: (e: React.PointerEvent<SVGCircleElement>) => void }) {
  const { x, y } = DOT_SLOTS[slot % DOT_SLOTS.length];
  return (
    <circle
      cx={x + offsetX}
      cy={y + offsetY}
      r="1.6"
      fill={color}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      style={{ cursor: onPointerDown ? "grab" : undefined }}
    />
  );
}
