import type { Atom, Molecule } from "../../types/chemistry";
import { atomLabelInfo, neighborAngles } from "../../model/valence";
import { defaultLonePairPosition } from "../../model/lonePairs";
import { ELEMENT_COLOR } from "../../model/constants";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo, type RefObject } from "react";

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
  const clearLonePairOffset = useMoleculeStore((s) => s.clearLonePairOffset);
  const setAtomRadicalOffset = useMoleculeStore((s) => s.setAtomRadicalOffset);
  const setAtomStereoLabelOffset = useMoleculeStore((s) => s.setAtomStereoLabelOffset);
  const labelEditTarget = useMoleculeStore((s) => s.labelEditTarget);
  const setLabelEditTarget = useMoleculeStore((s) => s.setLabelEditTarget);
  const setAtomLabelOf = useMoleculeStore((s) => s.setAtomLabelOf);
  const editing = labelEditTarget === atom.id;
  const { visible: showLabel, text, hSuffix, isotopePrefix } = atomLabelInfo(mol, atom.id, showHydrogens, atomLabelRevealTargets.has(atom.id));
  const color = overValent ? "var(--danger)" : monochrome ? "var(--ink)" : ELEMENT_COLOR[atom.element] || "var(--ink)";
  const labelParts = useMemo(() => formatLabelWithSubscripts(text), [text]);
  const hSuffixParts = useMemo(() => (hSuffix ? formatLabelWithSubscripts(hSuffix) : []), [hSuffix]);
  // The suffix always renders straight out to one side, along the
  // horizontal (see its <text> below) — normally the right, matching
  // convention ("OH", "NH2"). But if a bond happens to leave this atom
  // in roughly that same direction, the suffix lands right on top of
  // it — this is the "H ends up inside the bond" problem: it only ever
  // showed up when the molecule was rotated/drawn so the bond pointed
  // rightward out of a heteroatom, e.g. "-OH" on the left end of a
  // chain. Rather than a manual flip control, this just checks the
  // atom's actual bond angle(s) and mirrors the suffix to the empty
  // side automatically - "HO" instead of "OH" - whenever a bond is
  // within ~60° of due east. Bonds elsewhere (left, up, down) leave
  // the conventional right-side placement alone.
  const suffixOnLeft = useMemo(() => {
    if (!hSuffix) return false;
    return neighborAngles(mol, atom.id).some((a) => Math.cos(a) > 0.5);
  }, [hSuffix, mol, atom.id]);
  // The element symbol's *actual* rendered half-width, measured via
  // getBBox rather than estimated from character count — a flat
  // per-character estimate badly undershoots for some glyphs (an "O" is
  // much wider than the ~4px/char guess this used to use), which crowded
  // the implicit-H suffix right up against the symbol with almost no gap
  // and made the whole "OH"/"NH"/"SH" cluster read as off-center from the
  // true atom position. Falls back to a rough character-count estimate
  // only until the first measurement lands (getBBox needs the text to
  // already be in the DOM), and only every re-runs when the label text
  // actually changes.
  const mainTextRef = useRef<SVGTextElement>(null);
  const [measuredHalfWidth, setMeasuredHalfWidth] = useState(() => (text.length * 4) / 2);
  useLayoutEffect(() => {
    if (!hSuffix) return;
    const el = mainTextRef.current;
    if (!el) return;
    try {
      const width = el.getBBox().width;
      if (width > 0) setMeasuredHalfWidth(width / 2);
    } catch {
      // getBBox can throw if the element isn't actually rendered yet
      // (e.g. an ancestor with display:none) — keep the estimate.
    }
  }, [hSuffix, text]);

  // Full visible label length (element + implicit-H suffix) — for things
  // that anchor off the label's total width (charge badge, isotope
  // prefix). Unlike the label rendering itself below, those don't need to
  // distinguish the two parts, just how much horizontal space they take
  // up together.
  const fullTextLength = text.length + (hSuffix?.length ?? 0);
  // NOTE: this sits at the upper-left regardless of suffixOnLeft below -
  // an isotope-labeled heteroatom whose implicit-H suffix also flips to
  // the left (e.g. a rotated "18OH") can crowd the two together. Rare
  // enough in practice (needs both an isotope label and a rightward
  // bond on the same atom) that it's left alone for now rather than
  // adding a second positioning mode here.
  const isotopeOffsetX = -(fullTextLength * 3.6) / 2 - 4.5;
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

  // Opens the free-text label editor without touching double-click, which
  // is already spoken for (selects the whole connected fragment — see
  // useCanvasInteractions' onDoubleClick). Two triggers, matched to how
  // each input actually works:
  //  - middle mouse button: fires instantly on pointerdown, no drag risk
  //    since nothing else uses the middle button here.
  //  - touch: a press-and-hold, the standard "more options" gesture on a
  //    touchscreen, cancelled on release/movement so it doesn't fight a
  //    real drag. Its own pointerup then swallows the tap that would
  //    otherwise also fire on release once the hold has already opened
  //    the editor.
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const onAtomPointerDown = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (e.pointerType === "mouse") {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        setLabelEditTarget(atom.id);
      }
      return;
    }
    if (e.pointerType === "touch") {
      longPressFiredRef.current = false;
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
        setLabelEditTarget(atom.id);
      }, 550);
    }
  }, [atom.id, setLabelEditTarget]);

  const onAtomPointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    const start = longPressStartRef.current;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) clearLongPress();
  }, [clearLongPress]);

  const onAtomPointerUp = useCallback((e: React.PointerEvent<SVGGElement>) => {
    clearLongPress();
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      e.stopPropagation();
    }
  }, [clearLongPress]);

  return (
    <g
      transform={`translate(${atom.x},${atom.y})`}
      data-atom-id={atom.id}
      onPointerDown={onAtomPointerDown}
      onPointerMove={onAtomPointerMove}
      onPointerUp={onAtomPointerUp}
      onPointerLeave={clearLongPress}
    >
      {selected && <circle r="15" fill="var(--selection)" data-export-exclude="true" />}
      {overValent && (
        <circle r="13" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeDasharray="3 2" data-export-exclude="true" />
      )}
      {showLabel && !editing ? (
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
            ref={mainTextRef}
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
          {hSuffix && (
            <text
              // Starts just past the (centered, unaffected) element
              // symbol's *measured* edge instead of being centered as
              // part of one combined string — see hSuffix's doc comment
              // in valence.ts for why: otherwise the element glyph
              // itself would sit visibly off the atom's true (x, y),
              // which is where bonds and lone pairs correctly anchor.
              // measuredHalfWidth (not a char-count guess) is what keeps
              // this gap looking right regardless of which element
              // symbol it is. Mirrors to the left (see suffixOnLeft
              // above) when a bond occupies the conventional right-side
              // spot instead, so the suffix never renders on top of a
              // bond line.
              x={suffixOnLeft ? -(measuredHalfWidth + 1.5) : measuredHalfWidth + 1.5}
              textAnchor={suffixOnLeft ? "end" : "start"}
              dominantBaseline="central"
              fontSize="14.5"
              fontWeight="500"
              fill={color}
              className="atom-label"
            >
              {hSuffixParts.map((part, i) => (
                <tspan
                  key={i}
                  dy={part.subscript ? 4 : i === 0 ? 0 : -4}
                  fontSize={part.subscript ? "10" : "14.5"}
                >
                  {part.text}
                </tspan>
              ))}
            </text>
          )}
        </>
      ) : !editing ? (
        <circle r="2" fill={color} className="atom-vertex" data-export-exclude="true" />
      ) : null}
      {editing && (
        <AtomLabelEditor
          atom={atom}
          onCommit={(raw) => { setAtomLabelOf(atom.id, raw); setLabelEditTarget(null); }}
          onCancel={() => setLabelEditTarget(null)}
        />
      )}
      {chargeLabel && (
        <g
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          style={{ cursor: "grab" }}
        >
          <circle
            cx={(showLabel ? fullTextLength * 4 + 4 : 6) + (atom.chargeOffsetX ?? 0) + 3}
            cy={-8 + (atom.chargeOffsetY ?? 0) - 3}
            r="9"
            fill="transparent"
            data-export-exclude="true"
          />
          <text
            x={(showLabel ? fullTextLength * 4 + 4 : 6) + (atom.chargeOffsetX ?? 0)}
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
            onDoubleClick={(e) => { e.stopPropagation(); clearLonePairOffset(atom.id, i); }}
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

/**
 * Free-text label editor for one atom — a plain HTML `<input>` inside a
 * `<foreignObject>` nested in the same locally-translated `<g>` as the
 * rest of the atom, so it automatically pans/zooms with the canvas
 * exactly like TextAnnotationView's contentEditable div does, with no
 * manual screen-coordinate math needed.
 *
 * Pre-filled with the atom's current typed-editable value: its group
 * label if it has one (whether a registry preset, a custom formula, or a
 * generic placeholder), otherwise its plain element symbol. Commits on
 * Enter or blur, cancels on Escape without touching the atom.
 */
function initialLabelEditorValue(atom: Atom): string {
  const core = atom.group ?? (atom.isotope ? `${atom.isotope}${atom.element}` : atom.element);
  const chargeSuffix = atom.charge === 0 ? "" : (atom.charge > 0 ? "+" : "-").repeat(Math.abs(atom.charge));
  return core + chargeSuffix;
}

function AtomLabelEditor({ atom, onCommit, onCancel }: { atom: Atom; onCommit: (raw: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(() => initialLabelEditorValue(atom));
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = value.trim();
    if (trimmed) onCommit(trimmed);
    else onCancel();
  };

  return (
    <foreignObject x={-35} y={-13} width={70} height={26} style={{ overflow: "visible" }} data-export-exclude="true">
      <input
        ref={inputRef}
        className="atom-label-editor"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); committedRef.current = true; onCancel(); }
        }}
      />
    </foreignObject>
  );
}

