import type { Atom, Molecule } from "../../types/chemistry";
import { atomLabelInfo } from "../../model/valence";
import { ELEMENT_COLOR } from "../../model/constants";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useCallback, useEffect, useRef } from "react";

interface AtomViewProps {
  atom: Atom;
  mol: Molecule;
  selected: boolean;
  overValent: boolean;
}

export function AtomView({ atom, mol, selected, overValent }: AtomViewProps) {
  const showHydrogens = useMoleculeStore((s) => s.showHydrogens);
  const atomLabelRevealTargets = useMoleculeStore((s) => s.atomLabelRevealTargets);
  const monochrome = useMoleculeStore((s) => s.monochromeAtoms);
  const setAtomChargeOffset = useMoleculeStore((s) => s.setAtomChargeOffset);
  const { visible: showLabel, text } = atomLabelInfo(mol, atom.id, showHydrogens, atomLabelRevealTargets.has(atom.id));
  const color = overValent ? "var(--danger)" : monochrome ? "var(--ink)" : ELEMENT_COLOR[atom.element] || "var(--ink)";
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const chargeLabel =
    atom.charge === 0 ? "" :
    atom.charge > 0 ? (atom.charge === 1 ? "+" : `${atom.charge}+`) :
    atom.charge === -1 ? "\u2212" : `${Math.abs(atom.charge)}\u2212`;

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGTextElement>) => {
    if (!chargeLabel) return;
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: atom.chargeOffsetX ?? 0,
      originY: atom.chargeOffsetY ?? 0,
    };
  }, [atom.chargeOffsetX, atom.chargeOffsetY, chargeLabel]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGTextElement>) => {
    if (!dragRef.current || !chargeLabel) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setAtomChargeOffset(atom.id, dragRef.current.originX + dx / 2, dragRef.current.originY + dy / 2);
  }, [atom.id, chargeLabel, setAtomChargeOffset]);

  useEffect(() => {
    const onPointerUp = () => { dragRef.current = null; };
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
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="14.5"
          fontWeight="500"
          fill={color}
          className="atom-label"
        >
          {text}
        </text>
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
    </g>
  );
}
