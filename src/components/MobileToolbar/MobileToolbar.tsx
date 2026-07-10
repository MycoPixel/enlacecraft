import { useState } from "react";
import { MousePointer2, Hand, Eraser, Undo2, Redo2, Type as TypeIcon, Hexagon, RotateCcw, RotateCw, MoveRight, AlignLeft, Brackets } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton } from "../Sidebar/ToolButton";
import { BondGlyph } from "../Sidebar/BondGlyphs";
import { ElementPicker } from "../Sidebar/ElementPicker";
import { RingPicker } from "../Sidebar/RingPicker";
import { ArrowVariantPicker } from "../Sidebar/ArrowVariantPicker";
import { BracketVariantPicker } from "../Sidebar/BracketVariantPicker";
import { useT } from "../../i18n/useT";
import type { ToolId } from "../../types/chemistry";

type MobilePanel = "bonds" | "atoms" | "rings" | "arrows" | "brackets" | null;

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
  const bracketVariant = useMoleculeStore((s) => s.bracketVariant);
  const setBracketVariant = useMoleculeStore((s) => s.setBracketVariant);
  const t = useT();

  const choose = (toolId: ToolId) => { setTool(toolId); setPanel(null); };

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
          {panel === "arrows" && (
            <ArrowVariantPicker value={arrowVariant} onChange={(v) => { setArrowVariant(v); choose("arrow"); }} active barb={arrowBarb} onBarbChange={(b) => { setArrowBarb(b); choose("arrow"); }} />
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
        <ToolButton big title={t("tool.arrow")} active={panel === "arrows" || tool === "arrow"} onClick={() => setPanel(panel === "arrows" ? null : "arrows")}>
          <MoveRight size={20} />
        </ToolButton>
        <ToolButton big title={t("tool.bracket")} active={panel === "brackets" || tool === "bracket"} onClick={() => setPanel(panel === "brackets" ? null : "brackets")}>
          <Brackets size={20} />
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
