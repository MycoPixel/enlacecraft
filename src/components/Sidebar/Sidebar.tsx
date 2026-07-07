import { MousePointer2, Hand, Eraser, Plus, Minus, RotateCcw, RotateCw, ZoomIn, ZoomOut, MoveDiagonal, Trash2, Type, MoveRight, Brackets } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton, SectionLabel } from "./ToolButton";
import { BondGlyph } from "./BondGlyphs";
import { ElementPicker } from "./ElementPicker";
import { RingPicker } from "./RingPicker";
import { ArrowVariantPicker } from "./ArrowVariantPicker";
import { BracketVariantPicker } from "./BracketVariantPicker";
import { useT } from "../../i18n/useT";
import type { ArrowVariant, BracketFacing, BracketVariant } from "../../types/chemistry";

export function Sidebar() {
  const tool = useMoleculeStore((s) => s.tool);
  const setTool = useMoleculeStore((s) => s.setTool);
  const atomElement = useMoleculeStore((s) => s.atomElement);
  const setAtomElement = useMoleculeStore((s) => s.setAtomElement);
  const ringTemplateId = useMoleculeStore((s) => s.ringTemplateId);
  const setRingTemplateId = useMoleculeStore((s) => s.setRingTemplateId);
  const view = useMoleculeStore((s) => s.view);
  const setView = useMoleculeStore((s) => s.setView);
  const clear = useMoleculeStore((s) => s.clear);
  const rotateSelection = useMoleculeStore((s) => s.rotateSelection);
  const arrowVariant = useMoleculeStore((s) => s.arrowVariant);
  const setArrowVariant = useMoleculeStore((s) => s.setArrowVariant);
  const setArrowVariantOf = useMoleculeStore((s) => s.setArrowVariantOf);
  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const t = useT();

  const selectedArrow =
    selectedAnnotationIds.size === 1 ? annotations[[...selectedAnnotationIds][0]] : null;
  const arrowPickerValue = selectedArrow?.kind === "arrow" ? selectedArrow.variant : arrowVariant;
  const onArrowVariantChange = (v: ArrowVariant) => {
    if (selectedArrow?.kind === "arrow") setArrowVariantOf(selectedArrow.id, v);
    else setArrowVariant(v);
    setTool("arrow");
  };

  const bracketVariant = useMoleculeStore((s) => s.bracketVariant);
  const bracketFacing = useMoleculeStore((s) => s.bracketFacing);
  const setBracketVariant = useMoleculeStore((s) => s.setBracketVariant);
  const setBracketFacing = useMoleculeStore((s) => s.setBracketFacing);
  const setBracketStyleOf = useMoleculeStore((s) => s.setBracketStyleOf);

  const selectedBracket = selectedArrow?.kind === "bracket" ? selectedArrow : null;
  const bracketPickerVariant = selectedBracket?.kind === "bracket" ? selectedBracket.variant : bracketVariant;
  const bracketPickerFacing = selectedBracket?.kind === "bracket" ? selectedBracket.facing : bracketFacing;
  const onBracketChange = (v: BracketVariant, f: BracketFacing) => {
    if (selectedBracket?.kind === "bracket") setBracketStyleOf(selectedBracket.id, v, f);
    else { setBracketVariant(v); setBracketFacing(f); }
    setTool("bracket");
  };

  const zoomBy = (factor: number) =>
    setView({ ...view, scale: Math.min(4, Math.max(0.25, view.scale * factor)) });
  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  const onClear = () => {
    if (confirm(t("confirm.clearDrawing"))) clear();
  };

  return (
    <aside className="sidebar">
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

      <SectionLabel>{t("section.atom")}</SectionLabel>
      <ElementPicker
        value={atomElement}
        onChange={(el) => { setAtomElement(el); setTool("atom"); }}
        active={tool === "atom"}
      />

      <SectionLabel>{t("section.charge")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.chargePlus")} active={tool === "charge-plus"} onClick={() => setTool("charge-plus")}>
          <Plus size={16} />
        </ToolButton>
        <ToolButton title={t("tool.chargeMinus")} active={tool === "charge-minus"} onClick={() => setTool("charge-minus")}>
          <Minus size={16} />
        </ToolButton>
      </div>

      <SectionLabel>{t("section.rings")}</SectionLabel>
      <RingPicker
        value={ringTemplateId}
        onChange={(id) => { setRingTemplateId(id); setTool("ring"); }}
        active={tool === "ring"}
      />

      <SectionLabel>{t("section.annotations")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.text")} active={tool === "text"} onClick={() => setTool("text")}>
          <Type size={18} />
        </ToolButton>
        <ToolButton title={t("tool.arrow")} active={tool === "arrow"} onClick={() => setTool("arrow")}>
          <MoveRight size={18} />
        </ToolButton>
        <ToolButton title={t("tool.bracket")} active={tool === "bracket"} onClick={() => setTool("bracket")}>
          <Brackets size={18} />
        </ToolButton>
      </div>
      <ArrowVariantPicker value={arrowPickerValue} onChange={onArrowVariantChange} active={tool === "arrow" || selectedArrow?.kind === "arrow"} />
      <BracketVariantPicker
        variant={bracketPickerVariant}
        facing={bracketPickerFacing}
        onChange={onBracketChange}
        active={tool === "bracket" || selectedBracket !== null}
      />

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
      <ToolButton title={t("tool.clearDrawing")} onClick={onClear}>
        <Trash2 size={17} />
        <span className="btn-label">{t("tool.clearLabel")}</span>
      </ToolButton>
    </aside>
  );
}
