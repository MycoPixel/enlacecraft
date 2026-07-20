import { useMemo, useRef, useState } from "react";
import {
  MousePointer2, Hand, Eraser, Plus, Minus, RotateCcw, RotateCw, ZoomIn, ZoomOut, MoveDiagonal, Type, Brackets, Group,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Wand2, Bookmark, BookmarkPlus,
} from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton, SectionLabel, SubsectionLabel } from "./ToolButton";
import { BondGlyph } from "./BondGlyphs";
import { ElementPicker } from "./ElementPicker";
import { GroupPicker } from "./GroupPicker";
import { IsotopePicker } from "./IsotopePicker";
import { RingPicker, RingIcon } from "./RingPicker";
import { FunctionalGroupPicker } from "./FunctionalGroupPicker";
import { StructureTemplatePicker, StructureTemplateIcon } from "./StructureTemplatePicker";
import { UserTemplatePicker } from "./UserTemplatePicker";
import { STRUCTURE_TEMPLATES } from "../../model/structureTemplates";
import { connectedComponents } from "../../model/molecule";
import { ArrowShapePicker, ArrowHeadSizePicker, MiniArrow } from "./ArrowVariantPicker";
import { BracketVariantPicker } from "./BracketVariantPicker";
import { ToolDropdown } from "./ToolDropdown";
import { ClearDrawingButton } from "../common/ClearDrawingButton";
import { useT } from "../../i18n/useT";
import type { ArrowHeadSize, ArrowVariant, BracketVariant } from "../../types/chemistry";

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
  const functionalGroupTemplateId = useMoleculeStore((s) => s.functionalGroupTemplateId);
  const setFunctionalGroupTemplateId = useMoleculeStore((s) => s.setFunctionalGroupTemplateId);
  const pasteFragment = useMoleculeStore((s) => s.pasteFragment);
  const view = useMoleculeStore((s) => s.view);
  const setView = useMoleculeStore((s) => s.setView);
  const rotateSelection = useMoleculeStore((s) => s.rotateSelection);
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const alignSelection = useMoleculeStore((s) => s.alignSelection);
  const distributeSelection = useMoleculeStore((s) => s.distributeSelection);
  const cleanUpSelection = useMoleculeStore((s) => s.cleanUpSelection);
  // "Align"/"Distribute" operate on whole connected fragments (a fully
  // selected ring, a lone atom, etc.), not individual atoms — see
  // alignAtoms's doc comment for why — so whether they're usable depends
  // on the fragment count, not the raw atom count.
  const selectedFragmentCount = useMemo(
    () => connectedComponents(molecule, [...selected]).length,
    [molecule, selected]
  );
  const userTemplates = useMoleculeStore((s) => s.userTemplates);
  const saveUserTemplate = useMoleculeStore((s) => s.saveUserTemplate);
  const deleteUserTemplate = useMoleculeStore((s) => s.deleteUserTemplate);
  const [newTemplateName, setNewTemplateName] = useState("");
  const arrowVariant = useMoleculeStore((s) => s.arrowVariant);
  const setArrowVariant = useMoleculeStore((s) => s.setArrowVariant);
  const arrowBarb = useMoleculeStore((s) => s.arrowBarb);
  const setArrowBarb = useMoleculeStore((s) => s.setArrowBarb);
  const arrowHeadSize = useMoleculeStore((s) => s.arrowHeadSize);
  const setArrowHeadSize = useMoleculeStore((s) => s.setArrowHeadSize);
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
  const annotations = useMoleculeStore((s) => s.annotations);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const hasSelectionToSave = selected.size > 0 || selectedAnnotationIds.size > 0;
  const setArrowVariantOf = useMoleculeStore((s) => s.setArrowVariantOf);
  const setArrowBarbOf = useMoleculeStore((s) => s.setArrowBarbOf);
  const setArrowHeadSizeOf = useMoleculeStore((s) => s.setArrowHeadSizeOf);
  const singleSelectedAnnotationId = selectedAnnotationIds.size === 1 ? [...selectedAnnotationIds][0] : null;
  const selectedArrowId =
    singleSelectedAnnotationId && annotations[singleSelectedAnnotationId]?.kind === "arrow" ? singleSelectedAnnotationId : null;

  // Sets both the shape and barb a *newly drawn* arrow will use. But if an
  // existing arrow is selected when you pick one — the whole reason the
  // picker is even reachable while a placed arrow is selected — that arrow
  // itself needs to actually change too, not just silently wait for the
  // next arrow you draw from scratch. Picking "curved" here is exactly how
  // you'd turn an already-placed straight fishhook into a curved one.
  const chooseArrow = (variant: ArrowVariant, barb: "full" | "single") => {
    setArrowVariant(variant);
    setArrowBarb(barb);
    setTool("arrow");
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
    setTool("arrow");
    if (selectedArrowId) {
      setArrowHeadSizeOf(selectedArrowId, headSize);
      setArrowBarbOf(selectedArrowId, "full");
    }
  };

  const bracketVariant = useMoleculeStore((s) => s.bracketVariant);
  const setBracketVariant = useMoleculeStore((s) => s.setBracketVariant);

  const onBracketChange = (v: BracketVariant) => {
    setBracketVariant(v);
    setTool("bracket");
  };

  const addReagentText = useMoleculeStore((s) => s.addReagentText);
  const canAddReagentText = !!selectedArrowId;

  const zoomBy = (factor: number) =>
    setView({ ...view, scale: Math.min(4, Math.max(0.25, view.scale * factor)) });
  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      {/* Tools: how you interact with the canvas itself (as opposed to what
          you draw with it) — select/move, pan, erase. */}
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

      <div className="sidebar-divider" />

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
      <ToolButton title={t("tool.chain")} active={tool === "chain"} onClick={() => setTool("chain")}>
        {BondGlyph.chain}
      </ToolButton>

      <div className="sidebar-divider" />

      {/* Atom: everything that configures what gets placed on an atom —
          element, abbreviated/functional groups, isotopes, and the small
          marks (charge, lone pairs, radicals, stereo labels). These used to
          be four separate top-level sections; grouping them under one
          header with lighter sub-labels makes it read as one place to go
          for "atom stuff" instead of four unrelated stops. */}
      <SectionLabel>{t("section.atom")}</SectionLabel>
      <ElementPicker
        value={atomElement}
        onChange={(el) => { setAtomElement(el); setTool("atom"); }}
        active={tool === "atom" && !atomGroup && !atomIsotope}
      />

      <SubsectionLabel>{t("section.groups")}</SubsectionLabel>
      <div className="row">
        <ToolDropdown
          title={t("tool.groups")}
          active={(tool === "atom" && !!atomGroup) || tool === "functional-group"}
          renderContent={(close) => (
            <div className="groups-menu">
              <SectionLabel>{t("section.groupsAbbreviated")}</SectionLabel>
              <GroupPicker
                value={atomGroup}
                onChange={(g) => { setAtomGroup(g); setTool("atom"); close(); }}
                active={tool === "atom" && !!atomGroup}
              />
              <SectionLabel>{t("section.groupsFunctional")}</SectionLabel>
              <FunctionalGroupPicker
                value={functionalGroupTemplateId}
                onChange={(id) => { setFunctionalGroupTemplateId(id); setTool("functional-group"); close(); }}
                active={tool === "functional-group"}
              />
              <p className="groups-menu__hint">{t("fgroup.rotateHint")}</p>
            </div>
          )}
        >
          <Group size={18} />
        </ToolDropdown>
      </div>

      <SubsectionLabel>{t("section.isotope")}</SubsectionLabel>
      <IsotopePicker
        value={atomIsotope}
        onChange={(p) => { setAtomIsotope(p); setTool("atom"); }}
        active={tool === "atom" && !!atomIsotope}
      />

      <SubsectionLabel>{t("section.charge")}</SubsectionLabel>
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

      <div className="sidebar-divider" />

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
        {STRUCTURE_TEMPLATES.length > 0 && (
          <ToolDropdown title={t("tool.structures")} active={false} renderContent={(close) => (
            <StructureTemplatePicker
              onChoose={(id) => {
                const tmpl = STRUCTURE_TEMPLATES.find((s) => s.id === id);
                if (tmpl) pasteFragment({ molecule: tmpl.molecule, annotations: tmpl.annotations });
                close();
              }}
            />
          )}>
            <StructureTemplateIcon />
          </ToolDropdown>
        )}
        <ToolDropdown title={t("tool.userTemplates")} active={false} renderContent={(close) => (
          <UserTemplatePicker
            templates={userTemplates}
            onChoose={(id) => {
              const tmpl = userTemplates.find((s) => s.id === id);
              if (tmpl) pasteFragment({ molecule: tmpl.molecule, annotations: tmpl.annotations });
              close();
            }}
            onDelete={deleteUserTemplate}
          />
        )}>
          <Bookmark size={18} />
        </ToolDropdown>
        <ToolDropdown
          title={hasSelectionToSave ? t("tool.saveTemplate") : t("tool.saveTemplateDisabled")}
          active={false}
          renderContent={(close) => (
            <div className="save-template-menu">
              {hasSelectionToSave ? (
                <>
                  <input
                    className="save-template-menu__input"
                    type="text"
                    autoFocus
                    placeholder={t("userTemplate.namePlaceholder")}
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTemplateName.trim()) {
                        saveUserTemplate(newTemplateName.trim());
                        setNewTemplateName("");
                        close();
                      }
                    }}
                  />
                  <button
                    className="save-template-menu__save"
                    disabled={newTemplateName.trim().length === 0}
                    onClick={() => {
                      saveUserTemplate(newTemplateName.trim());
                      setNewTemplateName("");
                      close();
                    }}
                  >
                    {t("userTemplate.save")}
                  </button>
                </>
              ) : (
                <p className="align-menu__hint">{t("userTemplate.needSelection")}</p>
              )}
            </div>
          )}
        >
          <BookmarkPlus size={18} />
        </ToolDropdown>
      </div>

      <div className="sidebar-divider" />

      {/* Annotations: everything drawn on top of the molecule rather than
          part of it — text, reaction arrows, brackets, and (folded in here
          rather than kept as their own "Reaction scheme" section, since
          they're just two more annotation types) the reactant/product plus
          sign and reagent text. */}
      <SectionLabel>{t("section.annotations")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.text")} active={tool === "text"} onClick={() => setTool("text")}>
          <Type size={18} />
        </ToolButton>
        <ToolDropdown
          title={t("tool.arrowFull")}
          active={tool === "arrow" && arrowBarb === "full"}
          renderContent={(close) => (
            <div>
              <ArrowShapePicker
                value={arrowBarb === "full" ? arrowVariant : "curved"}
                barb="full"
                headSize={arrowHeadSize}
                active={tool === "arrow" && arrowBarb === "full"}
                onChange={(v) => { chooseArrow(v, "full"); close(); }}
              />
              <ArrowHeadSizePicker
                value={arrowHeadSize}
                active={tool === "arrow" && arrowBarb === "full"}
                onChange={(s) => { chooseArrowHeadSize(s); close(); }}
              />
            </div>
          )}
        >
          <MiniArrow variant={arrowBarb === "full" ? arrowVariant : "curved"} barb="full" headSize={arrowHeadSize} />
        </ToolDropdown>
        <ToolDropdown
          title={t("tool.arrowFishhook")}
          active={tool === "arrow" && arrowBarb === "single"}
          renderContent={(close) => (
            <ArrowShapePicker
              value={arrowBarb === "single" ? arrowVariant : "curved"}
              barb="single"
              active={tool === "arrow" && arrowBarb === "single"}
              onChange={(v) => { chooseArrow(v, "single"); close(); }}
            />
          )}
        >
          <MiniArrow variant={arrowBarb === "single" ? arrowVariant : "curved"} barb="single" />
        </ToolDropdown>
        <ToolDropdown title={t("tool.bracket")} active={tool === "bracket"} renderContent={(close) => (
          <BracketVariantPicker variant={bracketVariant} onChange={(v) => { onBracketChange(v); close(); }} active={tool === "bracket"} />
        )}>
          <Brackets size={18} />
        </ToolDropdown>
        <ToolButton title={t("tool.plus")} active={tool === "plus"} onClick={() => setTool("plus")}>
          <Plus size={18} />
        </ToolButton>
        <ToolButton title={t("tool.addReagentText")} disabled={!canAddReagentText} onClick={() => addReagentText()}>
          <ReagentTextIcon />
        </ToolButton>
      </div>

      <div className="sidebar-divider" />

      <SectionLabel>{t("section.transform")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.rotateCCW")} onClick={() => rotateSelection(-30)}>
          <RotateCcw size={17} />
        </ToolButton>
        <ToolButton title={t("tool.rotateCW")} onClick={() => rotateSelection(30)}>
          <RotateCw size={17} />
        </ToolButton>
        <ToolDropdown
          title={t("tool.align")}
          active={false}
          renderContent={(close) => (
            <div className="align-menu">
              <SectionLabel>{t("section.align")}</SectionLabel>
              <div className="row">
                <ToolButton title={t("tool.alignLeft")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("left"); close(); }}>
                  <AlignStartVertical size={16} />
                </ToolButton>
                <ToolButton title={t("tool.alignCenterX")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("centerX"); close(); }}>
                  <AlignCenterVertical size={16} />
                </ToolButton>
                <ToolButton title={t("tool.alignRight")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("right"); close(); }}>
                  <AlignEndVertical size={16} />
                </ToolButton>
                <ToolButton title={t("tool.alignTop")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("top"); close(); }}>
                  <AlignStartHorizontal size={16} />
                </ToolButton>
                <ToolButton title={t("tool.alignCenterY")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("centerY"); close(); }}>
                  <AlignCenterHorizontal size={16} />
                </ToolButton>
                <ToolButton title={t("tool.alignBottom")} disabled={selectedFragmentCount < 2} onClick={() => { alignSelection("bottom"); close(); }}>
                  <AlignEndHorizontal size={16} />
                </ToolButton>
              </div>

              <SectionLabel>{t("section.distribute")}</SectionLabel>
              <div className="row">
                <ToolButton title={t("tool.distributeHorizontal")} disabled={selectedFragmentCount < 3} onClick={() => { distributeSelection("horizontal"); close(); }}>
                  <AlignHorizontalDistributeCenter size={16} />
                </ToolButton>
                <ToolButton title={t("tool.distributeVertical")} disabled={selectedFragmentCount < 3} onClick={() => { distributeSelection("vertical"); close(); }}>
                  <AlignVerticalDistributeCenter size={16} />
                </ToolButton>
              </div>

              {selectedFragmentCount < 2 && <p className="align-menu__hint">{t("align.needAtoms")}</p>}
              {selectedFragmentCount === 2 && <p className="align-menu__hint">{t("distribute.needAtoms")}</p>}
            </div>
          )}
        >
          <AlignCenterVertical size={18} />
        </ToolDropdown>
      </div>
      <ToolButton title={t("tool.cleanUp")} onClick={cleanUpSelection}>
        <Wand2 size={17} />
        <span className="btn-label">{t("tool.cleanUpLabel")}</span>
      </ToolButton>

      <div className="spacer" />

      <SectionLabel>{t("section.view")}</SectionLabel>
      <div className="row">
        <ToolButton title={t("tool.zoomIn")} onClick={() => zoomBy(1.2)}><ZoomIn size={17} /></ToolButton>
        <ToolButton title={t("tool.zoomOut")} onClick={() => zoomBy(1 / 1.2)}><ZoomOut size={17} /></ToolButton>
        <ToolButton title={t("tool.resetView")} onClick={resetView}><MoveDiagonal size={17} /></ToolButton>
      </div>

      {/* A hairline before Clear sets it apart as the one destructive
          action down here among view controls, so it doesn't read as just
          another view button. */}
      <div className="sidebar-divider" />
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
