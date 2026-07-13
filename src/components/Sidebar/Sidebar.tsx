import { useRef } from "react";
import { MousePointer2, Hand, Eraser, Plus, Minus, RotateCcw, RotateCw, ZoomIn, ZoomOut, MoveDiagonal, Type, MoveRight, Brackets } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton, SectionLabel } from "./ToolButton";
import { BondGlyph } from "./BondGlyphs";
import { ElementPicker } from "./ElementPicker";
import { GroupPicker } from "./GroupPicker";
import { IsotopePicker } from "./IsotopePicker";
import { RingPicker, RingIcon } from "./RingPicker";
import { ArrowVariantPicker } from "./ArrowVariantPicker";
import { BracketVariantPicker } from "./BracketVariantPicker";
import { ToolDropdown } from "./ToolDropdown";
import { ClearDrawingButton } from "../common/ClearDrawingButton";
import { useT } from "../../i18n/useT";
import type { ArrowVariant, BracketVariant } from "../../types/chemistry";

export function Sidebar() {
  const tool = useMoleculeStore((s) => s.tool);
  const setTool = useMoleculeStore((s) => s.setTool);
  const atomElement = useMoleculeStore((s) => s.atomElement);
  const atomGroup = useMoleculeStore((s) => s.atomGroup);
  const setAtomGroup = useMoleculeStore((s) => s.setAtomGroup);
  const atomIsotope = useMoleculeStore((s) => s.atomIsotope);
  const setAtomIsotope = useMoleculeStore((s) => s.setAtomIsotope);
  const setAtomElement = useMoleculeStore((s) => s.setAtomElement);
  const ringTemplateId = useMoleculeStore((s) => s.ringTemplateId);
  const setRingTemplateId = useMoleculeStore((s) => s.setRingTemplateId);
  const view = useMoleculeStore((s) => s.view);
  const setView = useMoleculeStore((s) => s.setView);
  const rotateSelection = useMoleculeStore((s) => s.rotateSelection);
  const arrowVariant = useMoleculeStore((s) => s.arrowVariant);
  const setArrowVariant = useMoleculeStore((s) => s.setArrowVariant);
  const arrowBarb = useMoleculeStore((s) => s.arrowBarb);
  const setArrowBarb = useMoleculeStore((s) => s.setArrowBarb);
  const t = useT();
  const sidebarWidth = useMoleculeStore((s) => s.sidebarWidth);
  const setSidebarWidth = useMoleculeStore((s) => s.setSidebarWidth);
  const resizeDrag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    resizeDrag.current = { startX: e.clientX, startWidth: sidebarWidth };
  };
  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDrag.current) return;
    setSidebarWidth(resizeDrag.current.startWidth + (e.clientX - resizeDrag.current.startX));
  };
  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    resizeDrag.current = null;
    if ((e.currentTarget as Element).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
  };

  const onArrowVariantChange = (v: ArrowVariant) => {
    setArrowVariant(v);
    setTool("arrow");
  };

  const bracketVariant = useMoleculeStore((s) => s.bracketVariant);
  const setBracketVariant = useMoleculeStore((s) => s.setBracketVariant);

  const onBracketChange = (v: BracketVariant) => {
    setBracketVariant(v);
    setTool("bracket");
  };

  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const addReagentText = useMoleculeStore((s) => s.addReagentText);
  const singleSelectedAnnotationId = selectedAnnotationIds.size === 1 ? [...selectedAnnotationIds][0] : null;
  const canAddReagentText = !!singleSelectedAnnotationId && annotations[singleSelectedAnnotationId]?.kind === "arrow";

  const zoomBy = (factor: number) =>
    setView({ ...view, scale: Math.min(4, Math.max(0.25, view.scale * factor)) });
  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <SectionLabel>{t("section.select")}</SectionLabel>
      <ToolButton title={t("tool.selectHint")} active={tool === "select"} onClick={() => setTool("select")}>
        <MousePointer2 size={18} />
      </ToolButton>
      <ToolButton title={t("tool.pan")} active={tool === "pan"} onClick={() => setTool("pan")}>
        <Hand size={18} />
      </ToolButton>
      <ToolButton title={t("tool.erase")} active={tool === "erase"} onClick={() => setTool("erase")}>
        <Eraser size={18} />
      </ToolButton>

      <SectionLabel>{t("section.bonds")}</SectionLabel>
      <ToolButton title={t("tool.bondSingle")} active={tool === "bond-1"} onClick={() => setTool("bond-1")}>
        {BondGlyph.single}
      </ToolButton>
      <ToolButton title={t("tool.bondDouble")} active={tool === "bond-2"} onClick={() => setTool("bond-2")}>
        {BondGlyph.double}
      </ToolButton>
      <ToolButton title={t("tool.bondTriple")} active={tool === "bond-3"} onClick={() => setTool("bond-3")}>
        {BondGlyph.triple}
      </ToolButton>
      <ToolButton title={t("tool.wedge")} active={tool === "wedge"} onClick={() => setTool("wedge")}>
        {BondGlyph.wedge}
      </ToolButton>
      <ToolButton title={t("tool.dash")} active={tool === "dash"} onClick={() => setTool("dash")}>
        {BondGlyph.dash}
      </ToolButton>
      <ToolButton title={t("tool.wavy")} active={tool === "wavy"} onClick={() => setTool("wavy")}>
        {BondGlyph.wavy}
      </ToolButton>

      <SectionLabel>{t("section.atom")}</SectionLabel>
      <ElementPicker
        value={atomElement}
        onChange={(el) => { setAtomElement(el); setTool("atom"); }}
        active={tool === "atom" && !atomGroup && !atomIsotope}
      />

      <SectionLabel>{t("section.groups")}</SectionLabel>
      <GroupPicker
        value={atomGroup}
        onChange={(g) => { setAtomGroup(g); setTool("atom"); }}
        active={tool === "atom" && !!atomGroup}
      />

      <SectionLabel>{t("section.isotope")}</SectionLabel>
      <IsotopePicker
        value={atomIsotope}
        onChange={(p) => { setAtomIsotope(p); setTool("atom"); }}
        active={tool === "atom" && !!atomIsotope}
      />

      <SectionLabel>{t("section.charge")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.chargePlus")} active={tool === "charge-plus"} onClick={() => setTool("charge-plus")}>
          <Plus size={16} />
        </ToolButton>
        <ToolButton title={t("tool.chargeMinus")} active={tool === "charge-minus"} onClick={() => setTool("charge-minus")}>
          <Minus size={16} />
        </ToolButton>
        <ToolButton title={t("tool.lonePair")} active={tool === "lone-pair"} onClick={() => setTool("lone-pair")}>
          <LonePairIcon />
        </ToolButton>
        <ToolButton title={t("tool.radical")} active={tool === "radical"} onClick={() => setTool("radical")}>
          <RadicalIcon />
        </ToolButton>
        <ToolButton title={t("tool.stereoLabel")} active={tool === "stereo-label"} onClick={() => setTool("stereo-label")}>
          <StereoLabelIcon />
        </ToolButton>
      </div>

      <SectionLabel>{t("section.rings")}</SectionLabel>
      <div className="row">
        <ToolDropdown title={t("tool.ring")} active={tool === "ring"} renderContent={(close) => (
          <RingPicker
            value={ringTemplateId}
            onChange={(id) => { setRingTemplateId(id); setTool("ring"); close(); }}
            active={tool === "ring"}
          />
        )}>
          <RingIcon templateId={ringTemplateId} />
        </ToolDropdown>
      </div>

      <SectionLabel>{t("section.annotations")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.text")} active={tool === "text"} onClick={() => setTool("text")}>
          <Type size={18} />
        </ToolButton>
        <ToolDropdown title={t("tool.arrow")} active={tool === "arrow"} renderContent={(close) => (
          <ArrowVariantPicker value={arrowVariant} onChange={(v) => { onArrowVariantChange(v); close(); }} active={tool === "arrow"} barb={arrowBarb} onBarbChange={(b) => { setArrowBarb(b); setTool("arrow"); close(); }} />
        )}>
          <MoveRight size={18} />
        </ToolDropdown>
        <ToolDropdown title={t("tool.bracket")} active={tool === "bracket"} renderContent={(close) => (
          <BracketVariantPicker variant={bracketVariant} onChange={(v) => { onBracketChange(v); close(); }} active={tool === "bracket"} />
        )}>
          <Brackets size={18} />
        </ToolDropdown>
      </div>

      <SectionLabel>{t("section.reactionScheme")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.plus")} active={tool === "plus"} onClick={() => setTool("plus")}>
          <Plus size={18} />
        </ToolButton>
        <ToolButton title={t("tool.addReagentText")} disabled={!canAddReagentText} onClick={() => addReagentText()}>
          <ReagentTextIcon />
        </ToolButton>
      </div>

      <SectionLabel>{t("section.transform")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.rotateCCW")} onClick={() => rotateSelection(-30)}>
          <RotateCcw size={17} />
        </ToolButton>
        <ToolButton title={t("tool.rotateCW")} onClick={() => rotateSelection(30)}>
          <RotateCw size={17} />
        </ToolButton>
      </div>

      <div className="spacer" />

      <SectionLabel>{t("section.view")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.zoomIn")} onClick={() => zoomBy(1.2)}><ZoomIn size={17} /></ToolButton>
        <ToolButton title={t("tool.zoomOut")} onClick={() => zoomBy(1 / 1.2)}><ZoomOut size={17} /></ToolButton>
        <ToolButton title={t("tool.resetView")} onClick={resetView}><MoveDiagonal size={17} /></ToolButton>
      </div>
      <ClearDrawingButton withLabel />
      <div
        className="sidebar-resize-handle"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        title={t("tool.resizeSidebar")}
      />
    </aside>
  );
}

/** Two small dots — represents a lone pair (matches how one is actually drawn on an atom). */
function LonePairIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle cx="5.5" cy="8" r="1.6" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** A single dot — represents an unpaired (radical) electron. */
function RadicalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

/** "R/S" text, matching how the label itself actually renders (italic, in parens). */
function StereoLabelIcon() {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16">
      <text x="10" y="12" textAnchor="middle" fontSize="10" fontStyle="italic" fontWeight="700" fill="currentColor">
        R/S
      </text>
    </svg>
  );
}

/** A reaction arrow with a couple of short lines above it, standing in for
 * reagent/condition text written over the arrow — the layout the "Add
 * reagent text" button reproduces. */
function ReagentTextIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18">
      <line x1="2" y1="4" x2="9" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="13" x2="14.5" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13,10 L17,13 L13,16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
