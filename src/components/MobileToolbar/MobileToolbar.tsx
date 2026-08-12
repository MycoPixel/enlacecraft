import { useMemo, useState } from "react";
import {
  MousePointer2, Lasso, Hand, Eraser, Undo2, Redo2, Type as TypeIcon, Hexagon, RotateCcw, RotateCw, AlignLeft, Brackets, Plus,
  MoreHorizontal, Group, Bookmark, BookmarkPlus, Wand2, AlignCenterVertical,
  AlignStartVertical, AlignEndVertical, AlignStartHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Minus, ZoomIn, ZoomOut, MoveDiagonal, Hash, Trash2,
} from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton, SectionLabel, SubsectionLabel } from "../Sidebar/ToolButton";
import { BondGlyph } from "../Sidebar/BondGlyphs";
import { ElementPicker } from "../Sidebar/ElementPicker";
import { GroupPicker } from "../Sidebar/GroupPicker";
import { FunctionalGroupPicker } from "../Sidebar/FunctionalGroupPicker";
import { IsotopePicker } from "../Sidebar/IsotopePicker";
import { ReactiveSitePicker } from "../Sidebar/ReactiveSitePicker";
import { RingPicker } from "../Sidebar/RingPicker";
import { StructureTemplatePicker } from "../Sidebar/StructureTemplatePicker";
import { UserTemplatePicker } from "../Sidebar/UserTemplatePicker";
import { STRUCTURE_TEMPLATES } from "../../model/structureTemplates";
import { connectedComponents } from "../../model/molecule";
import { ArrowShapePicker, ArrowHeadSizePicker, MiniArrow } from "../Sidebar/ArrowVariantPicker";
import { BracketVariantPicker } from "../Sidebar/BracketVariantPicker";
import { LonePairIcon, RadicalIcon, StereoLabelIcon, ReagentTextIcon } from "../Sidebar/MarkIcons";
import { HighlightColorPicker } from "../Sidebar/HighlightColorPicker";
import { useT } from "../../i18n/useT";
import type { ArrowHeadSize, ArrowVariant, ToolId } from "../../types/chemistry";

type MobilePanel = "bonds" | "atoms" | "rings" | "arrowsFull" | "arrowsFishhook" | "brackets" | "more" | null;

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

  // --- state/actions only needed for the "More" panel ---
  const atomGroup = useMoleculeStore((s) => s.atomGroup);
  const setAtomGroup = useMoleculeStore((s) => s.setAtomGroup);
  const atomIsotope = useMoleculeStore((s) => s.atomIsotope);
  const setAtomIsotope = useMoleculeStore((s) => s.setAtomIsotope);
  const atomReactiveSite = useMoleculeStore((s) => s.atomReactiveSite);
  const setAtomReactiveSite = useMoleculeStore((s) => s.setAtomReactiveSite);
  const functionalGroupTemplateId = useMoleculeStore((s) => s.functionalGroupTemplateId);
  const setFunctionalGroupTemplateId = useMoleculeStore((s) => s.setFunctionalGroupTemplateId);
  const molecule = useMoleculeStore((s) => s.molecule);
  const clearAllMapNumbers = useMoleculeStore((s) => s.clearAllMapNumbers);
  const hasMapNumbers = useMemo(() => Object.values(molecule.atoms).some((a) => a.mapNumber != null), [molecule.atoms]);
  const selected = useMoleculeStore((s) => s.selected);
  const alignSelection = useMoleculeStore((s) => s.alignSelection);
  const distributeSelection = useMoleculeStore((s) => s.distributeSelection);
  const cleanUpSelection = useMoleculeStore((s) => s.cleanUpSelection);
  const highlightSelection = useMoleculeStore((s) => s.highlightSelection);
  // Same reasoning as the sidebar's identical computation: align/distribute
  // operate on whole connected fragments, not raw atom count.
  const selectedFragmentCount = useMemo(
    () => connectedComponents(molecule, [...selected]).length,
    [molecule, selected]
  );
  const userTemplates = useMoleculeStore((s) => s.userTemplates);
  const saveUserTemplate = useMoleculeStore((s) => s.saveUserTemplate);
  const deleteUserTemplate = useMoleculeStore((s) => s.deleteUserTemplate);
  const pasteFragment = useMoleculeStore((s) => s.pasteFragment);
  const [newTemplateName, setNewTemplateName] = useState("");
  const hasSelectionToSave = selected.size > 0 || selectedAnnotationIds.size > 0;
  const addReagentText = useMoleculeStore((s) => s.addReagentText);
  const canAddReagentText = !!selectedArrowId;
  const view = useMoleculeStore((s) => s.view);
  const setView = useMoleculeStore((s) => s.setView);
  const resetView = useMoleculeStore((s) => s.resetView);
  const zoomBy = (factor: number) =>
    setView({ ...view, scale: Math.min(4, Math.max(0.25, view.scale * factor)) });

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
          {panel === "more" && (
            <div className="mobile-more">
              <SectionLabel>{t("section.charge")}</SectionLabel>
              <div className="row">
                <ToolButton big title={t("tool.chargePlus")} active={tool === "charge-plus"} onClick={() => choose("charge-plus")}>
                  <Plus size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.chargeMinus")} active={tool === "charge-minus"} onClick={() => choose("charge-minus")}>
                  <Minus size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.lonePair")} active={tool === "lone-pair"} onClick={() => choose("lone-pair")}>
                  <LonePairIcon />
                </ToolButton>
                <ToolButton big title={t("tool.radical")} active={tool === "radical"} onClick={() => choose("radical")}>
                  <RadicalIcon />
                </ToolButton>
                <ToolButton big title={t("tool.stereoLabel")} active={tool === "stereo-label"} onClick={() => choose("stereo-label")}>
                  <StereoLabelIcon />
                </ToolButton>
                <ToolButton big title={t("tool.mapNumber")} active={tool === "map-number"} onClick={() => choose("map-number")}>
                  <Hash size={18} />
                </ToolButton>
                {hasMapNumbers && (
                  <ToolButton big title={t("tool.clearMapNumbers")} onClick={() => { clearAllMapNumbers(); setPanel(null); }}>
                    <Trash2 size={18} />
                  </ToolButton>
                )}
              </div>

              <SubsectionLabel>{t("section.groupsAbbreviated")}</SubsectionLabel>
              <GroupPicker value={atomGroup} onChange={(g) => { setAtomGroup(g); choose("atom"); }} active={tool === "atom" && !!atomGroup} />
              <SubsectionLabel>{t("section.groupsFunctional")}</SubsectionLabel>
              <FunctionalGroupPicker
                value={functionalGroupTemplateId}
                onChange={(id) => { setFunctionalGroupTemplateId(id); choose("functional-group"); }}
                active={tool === "functional-group"}
              />
              <SubsectionLabel>{t("section.isotope")}</SubsectionLabel>
              <IsotopePicker value={atomIsotope} onChange={(p) => { setAtomIsotope(p); choose("atom"); }} active={tool === "atom" && !!atomIsotope} />
              <SubsectionLabel>{t("tool.reactiveSites")}</SubsectionLabel>
              <ReactiveSitePicker
                value={atomReactiveSite}
                onChange={(id) => { setAtomReactiveSite(id); choose("atom"); }}
                active={tool === "atom" && !!atomReactiveSite}
              />

              {STRUCTURE_TEMPLATES.length > 0 && (
                <>
                  <SectionLabel>{t("tool.structures")}</SectionLabel>
                  <StructureTemplatePicker
                    onChoose={(id) => {
                      const tmpl = STRUCTURE_TEMPLATES.find((s) => s.id === id);
                      if (tmpl) pasteFragment({ molecule: tmpl.molecule, annotations: tmpl.annotations });
                      setPanel(null);
                    }}
                  />
                </>
              )}
              <SectionLabel>{t("tool.userTemplates")}</SectionLabel>
              <UserTemplatePicker
                templates={userTemplates}
                onChoose={(id) => {
                  const tmpl = userTemplates.find((s) => s.id === id);
                  if (tmpl) pasteFragment({ molecule: tmpl.molecule, annotations: tmpl.annotations });
                  setPanel(null);
                }}
                onDelete={deleteUserTemplate}
              />
              {hasSelectionToSave && (
                <div className="save-template-menu">
                  <input
                    className="save-template-menu__input"
                    type="text"
                    placeholder={t("userTemplate.namePlaceholder")}
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                  <button
                    className="save-template-menu__save"
                    disabled={newTemplateName.trim().length === 0}
                    onClick={() => { saveUserTemplate(newTemplateName.trim()); setNewTemplateName(""); }}
                  >
                    {t("userTemplate.save")}
                  </button>
                </div>
              )}

              <SectionLabel>{t("section.select")}</SectionLabel>
              <div className="row">
                <ToolButton big title={t("tool.selectHint")} active={tool === "select"} onClick={() => { choose("select"); setPanel(null); }}>
                  <MousePointer2 size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.lasso")} active={tool === "lasso"} onClick={() => { choose("lasso"); setPanel(null); }}>
                  <Lasso size={18} />
                </ToolButton>
              </div>

              <SectionLabel>{t("section.transform")}</SectionLabel>
              <div className="row">
                <ToolButton big title={t("tool.alignLeft")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("left"); setPanel(null); }}>
                  <AlignStartVertical size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.alignCenterX")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("centerX"); setPanel(null); }}>
                  <AlignCenterVertical size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.alignRight")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("right"); setPanel(null); }}>
                  <AlignEndVertical size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.alignTop")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("top"); setPanel(null); }}>
                  <AlignStartHorizontal size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.alignBottom")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("bottom"); setPanel(null); }}>
                  <AlignEndHorizontal size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.distributeHorizontal")} disabled={selectedFragmentCount < 3} onClick={() => { distributeSelection("horizontal"); setPanel(null); }}>
                  <AlignHorizontalDistributeCenter size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.distributeVertical")} disabled={selectedFragmentCount < 3} onClick={() => { distributeSelection("vertical"); setPanel(null); }}>
                  <AlignVerticalDistributeCenter size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.cleanUpLabel")} onClick={() => { cleanUpSelection(); setPanel(null); }}>
                  <Wand2 size={18} />
                </ToolButton>
              </div>

              <SectionLabel>{t("section.highlight")}</SectionLabel>
              <HighlightColorPicker
                disabled={selected.size === 0}
                onChoose={(color) => { highlightSelection(color); setPanel(null); }}
              />
              {selected.size === 0 && <p className="align-menu__hint">{t("highlight.needSelection")}</p>}

              <SectionLabel>{t("section.annotations")}</SectionLabel>
              <div className="row">
                <ToolButton big title={t("tool.addReagentText")} disabled={!canAddReagentText} onClick={() => { addReagentText(); setPanel(null); }}>
                  <ReagentTextIcon />
                </ToolButton>
              </div>

              <SectionLabel>{t("section.view")}</SectionLabel>
              <div className="row">
                <ToolButton big title={t("tool.zoomIn")} onClick={() => zoomBy(1.2)}>
                  <ZoomIn size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.zoomOut")} onClick={() => zoomBy(1 / 1.2)}>
                  <ZoomOut size={18} />
                </ToolButton>
                <ToolButton big title={t("tool.resetView")} onClick={() => { resetView(); setPanel(null); }}>
                  <MoveDiagonal size={18} />
                </ToolButton>
              </div>
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
        <ToolButton big title={t("mobile.more")} active={panel === "more"} onClick={() => setPanel(panel === "more" ? null : "more")}>
          <MoreHorizontal size={20} />
        </ToolButton>
      </div>
    </div>
  );
}
