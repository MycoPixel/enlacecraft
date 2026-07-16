import { useState } from "react";
import { MousePointer2, Hand, Eraser, Undo2, Redo2, Type as TypeIcon, Hexagon, RotateCcw, RotateCw, AlignLeft, Brackets, Plus } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton } from "../Sidebar/ToolButton";
import { BondGlyph } from "../Sidebar/BondGlyphs";
import { ElementPicker } from "../Sidebar/ElementPicker";
import { RingPicker } from "../Sidebar/RingPicker";
import { ArrowShapePicker, ArrowHeadSizePicker, MiniArrow } from "../Sidebar/ArrowVariantPicker";
import { BracketVariantPicker } from "../Sidebar/BracketVariantPicker";
import { useT } from "../../i18n/useT";
import type { ArrowHeadSize, ArrowVariant, ToolId } from "../../types/chemistry";

type MobilePanel = "bonds" | "atoms" | "rings" | "arrowsFull" | "arrowsFishhook" | "brackets" | null;

export function MobileToolbar() {
  const [panel, setPanel] = useState<MobilePanel>(null);
  const tool = useMoleculeStore((s) => s.tool);
  const setTool = useMoleculeStore((s) => s.setTool);
  const atomElement = useMoleculeStore((s) => s.atomElement);
  const setAtomElement = useMoleculeStore((s) => s.setAtomElement);
  const ringTemplateId = useMoleculeStore((s) => s.ringTemplateId);
  const setRingTemplateId = useMoleculeStore((s) => s.setRingTemplateId);
  const undo = useMoleculeStore((s) => s.undo);
  const redo = useMoleculeStore((s) => s.redo);
  const canUndo = useMoleculeStore((s) => s.canUndo());
  const canRedo = useMoleculeStore((s) => s.canRedo());
  const rotateSelection = useMoleculeStore((s) => s.rotateSelection);
  const arrowVariant = useMoleculeStore((s) => s.arrowVariant);
  const setArrowVariant = useMoleculeStore((s) => s.setArrowVariant);
  const arrowBarb = useMoleculeStore((s) => s.arrowBarb);
  const setArrowBarb = useMoleculeStore((s) => s.setArrowBarb);
  const arrowHeadSize = useMoleculeStore((s) => s.arrowHeadSize);
  const setArrowHeadSize = useMoleculeStore((s) => s.setArrowHeadSize);
  const setArrowVariantOf = useMoleculeStore((s) => s.setArrowVariantOf);
  const setArrowBarbOf = useMoleculeStore((s) => s.setArrowBarbOf);
  const setArrowHeadSizeOf = useMoleculeStore((s) => s.setArrowHeadSizeOf);
  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const singleSelectedAnnotationId = selectedAnnotationIds.size === 1 ? [...selectedAnnotationIds][0] : null;
  const selectedArrowId =
    singleSelectedAnnotationId && annotations[singleSelectedAnnotationId]?.kind === "arrow" ? singleSelectedAnnotationId : null;
  const bracketVariant = useMoleculeStore((s) => s.bracketVariant);
  const setBracketVariant = useMoleculeStore((s) => s.setBracketVariant);
  const t = useT();

  const choose = (toolId: ToolId) => { setTool(toolId); setPanel(null); };

  // Same reasoning as the sidebar's identical helper: this sets what a
  // newly-drawn arrow will look like, but if an arrow is already selected
  // (how you'd reach this panel to begin with, to change an existing
  // arrow's curve/barb rather than draw a new one) that arrow needs to be
  // updated in place too.
  const chooseArrow = (variant: ArrowVariant, barb: "full" | "single") => {
    setArrowVariant(variant);
    setArrowBarb(barb);
    choose("arrow");
    if (selectedArrowId) {
      setArrowVariantOf(selectedArrowId, variant);
      setArrowBarbOf(selectedArrowId, barb);
    }
  };

  // Head size only applies to the full-arrowhead style, so picking one
  // here also switches barb to "full" — otherwise picking a size while a
  // fishhook happened to be the active style would silently do nothing
  // visible, which would look like the picker was broken.
  const chooseArrowHeadSize = (headSize: ArrowHeadSize) => {
    setArrowHeadSize(headSize);
    setArrowBarb("full");
    choose("arrow");
    if (selectedArrowId) {
      setArrowHeadSizeOf(selectedArrowId, headSize);
      setArrowBarbOf(selectedArrowId, "full");
    }
  };

  return (
    <div className="mobile-toolbar">
      {panel && (
        <div className="mobile-panel">
          {panel === "atoms" && (
            <ElementPicker value={atomElement} onChange={(el) => { setAtomElement(el); choose("atom"); }} active />
          )}
          {panel === "rings" && (
            <RingPicker value={ringTemplateId} onChange={(id) => { setRingTemplateId(id); choose("ring"); }} active />
          )}
          {panel === "arrowsFull" && (
            <div>
              <ArrowShapePicker
                value={arrowBarb === "full" ? arrowVariant : "curved"}
                barb="full"
                headSize={arrowHeadSize}
                active
                onChange={(v) => chooseArrow(v, "full")}
              />
              <ArrowHeadSizePicker value={arrowHeadSize} active onChange={chooseArrowHeadSize} />
            </div>
          )}
          {panel === "arrowsFishhook" && (
            <ArrowShapePicker
              value={arrowBarb === "single" ? arrowVariant : "curved"}
              barb="single"
              active
              onChange={(v) => chooseArrow(v, "single")}
            />
          )}
          {panel === "brackets" && (
            <BracketVariantPicker
              variant={bracketVariant}
              onChange={(v) => { setBracketVariant(v); choose("bracket"); }}
              active
            />
          )}
          {panel === "bonds" && (
            <div className="row">
              <ToolButton big title={t("mobile.single")} active={tool === "bond-1"} onClick={() => choose("bond-1")}>{BondGlyph.single}</ToolButton>
              <ToolButton big title={t("mobile.double")} active={tool === "bond-2"} onClick={() => choose("bond-2")}>{BondGlyph.double}</ToolButton>
              <ToolButton big title={t("mobile.triple")} active={tool === "bond-3"} onClick={() => choose("bond-3")}>{BondGlyph.triple}</ToolButton>
              <ToolButton big title={t("mobile.wedge")} active={tool === "wedge"} onClick={() => choose("wedge")}>{BondGlyph.wedge}</ToolButton>
              <ToolButton big title={t("mobile.dash")} active={tool === "dash"} onClick={() => choose("dash")}>{BondGlyph.dash}</ToolButton>
              <ToolButton big title={t("mobile.wavy")} active={tool === "wavy"} onClick={() => choose("wavy")}>{BondGlyph.wavy}</ToolButton>
              <ToolButton big title={t("tool.chain")} active={tool === "chain"} onClick={() => choose("chain")}>{BondGlyph.chain}</ToolButton>
            </div>
          )}
        </div>
      )}
      <div className="mobile-row">
        <ToolButton big title={t("mobile.select")} active={tool === "select"} onClick={() => choose("select")}>
          <MousePointer2 size={20} />
        </ToolButton>
        <ToolButton big title={t("mobile.pan")} active={tool === "pan"} onClick={() => choose("pan")}>
          <Hand size={20} />
        </ToolButton>
        <ToolButton big title={t("mobile.bonds")} active={panel === "bonds"} onClick={() => setPanel(panel === "bonds" ? null : "bonds")}>
          {BondGlyph.single}
        </ToolButton>
        <ToolButton big title={t("mobile.atoms")} active={panel === "atoms"} onClick={() => setPanel(panel === "atoms" ? null : "atoms")}>
          <TypeIcon size={20} />
        </ToolButton>
        <ToolButton big title={t("mobile.rings")} active={panel === "rings"} onClick={() => setPanel(panel === "rings" ? null : "rings")}>
          <Hexagon size={20} />
        </ToolButton>
        <ToolButton big title={t("tool.text")} active={tool === "text"} onClick={() => choose("text")}>
          <AlignLeft size={20} />
        </ToolButton>
        <ToolButton
          big
          title={t("tool.arrowFull")}
          active={(panel === "arrowsFull") || (tool === "arrow" && arrowBarb === "full")}
          onClick={() => setPanel(panel === "arrowsFull" ? null : "arrowsFull")}
        >
          <MiniArrow variant={arrowBarb === "full" ? arrowVariant : "curved"} barb="full" headSize={arrowHeadSize} />
        </ToolButton>
        <ToolButton
          big
          title={t("tool.arrowFishhook")}
          active={(panel === "arrowsFishhook") || (tool === "arrow" && arrowBarb === "single")}
          onClick={() => setPanel(panel === "arrowsFishhook" ? null : "arrowsFishhook")}
        >
          <MiniArrow variant={arrowBarb === "single" ? arrowVariant : "curved"} barb="single" />
        </ToolButton>
        <ToolButton big title={t("tool.bracket")} active={panel === "brackets" || tool === "bracket"} onClick={() => setPanel(panel === "brackets" ? null : "brackets")}>
          <Brackets size={20} />
        </ToolButton>
        <ToolButton big title={t("tool.plus")} active={tool === "plus"} onClick={() => choose("plus")}>
          <Plus size={20} />
        </ToolButton>
        <ToolButton big title={t("mobile.erase")} active={tool === "erase"} onClick={() => choose("erase")}>
          <Eraser size={20} />
        </ToolButton>
        <ToolButton big title={t("mobile.rotateCCW")} onClick={() => rotateSelection(-30)}>
          <RotateCcw size={20} />
        </ToolButton>
        <ToolButton big title={t("mobile.rotateCW")} onClick={() => rotateSelection(30)}>
          <RotateCw size={20} />
        </ToolButton>
        <ToolButton big title={t("mobile.undo")} onClick={undo}>
          <Undo2 size={20} style={{ opacity: canUndo ? 1 : 0.35 }} />
        </ToolButton>
        <ToolButton big title={t("mobile.redo")} onClick={redo}>
          <Redo2 size={20} style={{ opacity: canRedo ? 1 : 0.35 }} />
        </ToolButton>
      </div>
    </div>
  );
}
