import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, Copy, Check, AlertTriangle, Loader2, Trash2, Plus, Minus, Wand2, MapPin, Eye, EyeOff } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useFormulaDisplay } from "../../hooks/useFormulaDisplay";
import { useMoleculeDescriptors } from "../../hooks/useMoleculeDescriptors";
import { useAdvancedMoleculeDescriptors } from "../../hooks/useAdvancedMoleculeDescriptors";
import { useStereoAnalysis } from "../../hooks/useStereoAnalysis";
import type { Molecule, SGroup, SGroupType } from "../../types/chemistry";
import { DEFAULT_SGROUP_SUBSCRIPT, SGROUP_TYPES } from "../../model/sgroups";
import { MIN_HEAVY_ATOMS_FOR_ADVANCED_DESCRIPTORS } from "../../io/moleculeDescriptors";
import { hasPlaceholderLabels } from "../../model/valence";
import { schemeArrowIds, schemeAtomIds, summarizeScheme } from "../../model/reactionSchemes";
import { Formula } from "../common/Formula";
import { exportSmiles } from "../../io/smiles";
import { fetchInChI, PubChemError } from "../../io/pubchem";
import { ToolButton } from "../Sidebar/ToolButton";
import { useT } from "../../i18n/useT";

type InchiState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "result"; inchi: string; inchikey: string };

/**
 * Formula/MW/SMILES used to sit permanently in the top bar, which meant a
 * number was always on screen whether or not anyone cared about it right
 * now. This puts the same data behind a button instead — same portal +
 * fixed-position pattern as ExportMenu, so it can't be clipped by the top
 * bar's horizontally-scrolling toolstrip.
 *
 * SMILES is always for the *whole* canvas (exportSmiles doesn't take a
 * subset), even when a selection narrows the formula/MW above it — same
 * scope as the existing "Copy SMILES" export action.
 *
 * InChI/InChIKey (fetchInChI) are the one part of this popover that needs
 * a network round-trip, so — unlike formula/MW/SMILES, which are all
 * free and shown immediately — they're behind their own "Get InChI"
 * button inside here rather than fetched every time the popover opens.
 */
export function MoleculeInfoButton() {
  const [open, setOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<null | "smiles" | "inchi" | "inchikey">(null);
  const [inchiState, setInchiState] = useState<InchiState | null>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const { fragments } = useFormulaDisplay();
  const descriptorFragments = useMoleculeDescriptors();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const advancedDescriptorFragments = useAdvancedMoleculeDescriptors(showAdvanced);
  const hasAnyAtoms = Object.keys(molecule.atoms).length > 0;
  const hasPlaceholder = hasPlaceholderLabels(molecule);

  const reposition = () => {
    const btn = btnWrapRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCopiedField(null);
    setInchiState(null);
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReposition = () => reposition();
    document.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const smiles = hasAnyAtoms ? exportSmiles(molecule) : "";

  const copyField = async (text: string, field: "smiles" | "inchi" | "inchikey") => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard API");
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
    } catch {
      // Ignore — the text is still shown/selectable in the popover.
    }
  };

  const messageForError = (err: unknown): string => {
    if (err instanceof PubChemError) {
      switch (err.code) {
        case "EMPTY_QUERY": return t("iupac.errorEmpty");
        case "NOT_FOUND":
        case "NO_STRUCTURE": return t("iupac.errorNotFound");
        case "NETWORK": return t("search.errorNetwork");
        case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
      }
    }
    return err instanceof Error ? err.message : "Lookup failed";
  };

  const runInchiLookup = async () => {
    if (!hasAnyAtoms || hasPlaceholder) return;
    setInchiState({ phase: "loading" });
    try {
      const result = await fetchInChI(smiles);
      setInchiState({ phase: "result", inchi: result.inchi, inchikey: result.inchikey });
    } catch (err) {
      setInchiState({ phase: "error", message: messageForError(err) });
    }
  };

  return (
    <div className="molecule-info" ref={btnWrapRef}>
      <ToolButton title={t("tool.moleculeInfo")} active={open} onClick={() => setOpen((o) => !o)}>
        <Info size={18} />
        {hasPlaceholder && <AlertTriangle size={10} className="molecule-info__badge" />}
      </ToolButton>
      {open && coords &&
        createPortal(
          <div className="molecule-info-dropdown" ref={dropdownRef} style={{ top: coords.top, right: coords.right }}>
            <div className="molecule-info__label">
              {selected.size > 0 ? t("moleculeInfo.selection") : t("moleculeInfo.molecule")}
            </div>
            {fragments.length === 0 ? (
              <div className="molecule-info__empty">{t("moleculeInfo.empty")}</div>
            ) : (
              <div className="molecule-info__fragments">
                {fragments.map((f, i) => (
                  <div className="molecule-info__row" key={i}>
                    <span className="molecule-info__formula">
                      <Formula formula={f.formula} />
                    </span>
                    {f.mw > 0 && <span className="molecule-info__mw">{f.mw.toFixed(2)} g/mol</span>}
                  </div>
                ))}
              </div>
            )}
            {hasPlaceholder && (
              <div className="molecule-info__warning">
                <AlertTriangle size={13} />
                <span>{t("moleculeInfo.placeholderWarning")}</span>
              </div>
            )}
            {descriptorFragments.length > 0 && (
              <>
                <div className="molecule-info__divider" />
                <div className="molecule-info__label">{t("moleculeInfo.descriptors")}</div>
                <div className="molecule-info__fragments">
                  {descriptorFragments.map((f, i) => (
                    <div key={i}>
                      {i > 0 && <div className="molecule-info__divider" />}
                      {f.unavailable ? (
                        <p className="align-menu__hint">{t(`moleculeInfo.descriptorsUnavailable.${f.unavailable}`)}</p>
                      ) : (
                        f.descriptors && (
                          <>
                            <div className="molecule-info__row">
                              <span>{t("moleculeInfo.logP")}</span>
                              <span className="molecule-info__mw">{f.descriptors.logP.toFixed(2)}</span>
                            </div>
                            <div className="molecule-info__row">
                              <span>{t("moleculeInfo.logS")}</span>
                              <span className="molecule-info__mw">{f.descriptors.logS.toFixed(2)}</span>
                            </div>
                            <div className="molecule-info__row">
                              <span>{t("moleculeInfo.tpsa")}</span>
                              <span className="molecule-info__mw">{f.descriptors.polarSurfaceArea.toFixed(1)} Å²</span>
                            </div>
                            <div className="molecule-info__row">
                              <span>{t("moleculeInfo.hBondDonors")}</span>
                              <span className="molecule-info__mw">{f.descriptors.hBondDonorCount}</span>
                            </div>
                            <div className="molecule-info__row">
                              <span>{t("moleculeInfo.hBondAcceptors")}</span>
                              <span className="molecule-info__mw">{f.descriptors.hBondAcceptorCount}</span>
                            </div>
                            <div className="molecule-info__row">
                              <span>{t("moleculeInfo.rotatableBonds")}</span>
                              <span className="molecule-info__mw">{f.descriptors.rotatableBondCount}</span>
                            </div>
                            <div className="molecule-info__row">
                              <span>{t("moleculeInfo.stereocenters")}</span>
                              <span className="molecule-info__mw">{f.descriptors.stereoCenterCount}</span>
                            </div>
                            {showAdvanced && (() => {
                              const adv = advancedDescriptorFragments[i];
                              if (!adv || adv.status === "loading") {
                                return (
                                  <div className="structure-search-menu__loading">
                                    <Loader2 size={14} className="compound-search__spinner" />
                                    {t("iupac.loading")}
                                  </div>
                                );
                              }
                              if (adv.status === "error") {
                                return (
                                  <p className="align-menu__hint">
                                    {adv.unavailable === "TOO_SMALL"
                                      ? t("moleculeInfo.descriptorsUnavailable.TOO_SMALL", {
                                          minAtoms: MIN_HEAVY_ATOMS_FOR_ADVANCED_DESCRIPTORS,
                                        })
                                      : t(`moleculeInfo.descriptorsUnavailable.${adv.unavailable ?? "UNSUPPORTED"}`)}
                                  </p>
                                );
                              }
                              const a = adv.descriptors;
                              if (!a) return null;
                              return (
                                <>
                                  <div className="molecule-info__row">
                                    <span>{t("moleculeInfo.druglikeness")}</span>
                                    <span className="molecule-info__mw">{a.druglikeness.toFixed(2)}</span>
                                  </div>
                                  <div className="molecule-info__row">
                                    <span>{t("moleculeInfo.drugScore")}</span>
                                    <span className="molecule-info__mw">{a.drugScore.toFixed(2)}</span>
                                  </div>
                                  <div className="molecule-info__row">
                                    <span>{t("moleculeInfo.mutagenicRisk")}</span>
                                    <span className="molecule-info__mw">{t(`moleculeInfo.riskLevel.${a.mutagenicRisk}`)}</span>
                                  </div>
                                  <div className="molecule-info__row">
                                    <span>{t("moleculeInfo.tumorigenicRisk")}</span>
                                    <span className="molecule-info__mw">{t(`moleculeInfo.riskLevel.${a.tumorigenicRisk}`)}</span>
                                  </div>
                                  <div className="molecule-info__row">
                                    <span>{t("moleculeInfo.irritantRisk")}</span>
                                    <span className="molecule-info__mw">{t(`moleculeInfo.riskLevel.${a.irritantRisk}`)}</span>
                                  </div>
                                  <div className="molecule-info__row">
                                    <span>{t("moleculeInfo.reproductiveRisk")}</span>
                                    <span className="molecule-info__mw">{t(`moleculeInfo.riskLevel.${a.reproductiveRisk}`)}</span>
                                  </div>
                                  <p className="align-menu__hint">{t("moleculeInfo.advancedCaveat")}</p>
                                </>
                              );
                            })()}
                          </>
                        )
                      )}
                    </div>
                  ))}
                </div>
                <button className="molecule-info__inchi-btn" onClick={() => setShowAdvanced((v) => !v)}>
                  {t(showAdvanced ? "moleculeInfo.hideMoreDescriptors" : "moleculeInfo.showMoreDescriptors")}
                </button>
              </>
            )}
            {hasAnyAtoms && <StereoSection molecule={molecule} />}
            <SchemeSection molecule={molecule} />
            <SGroupSection molecule={molecule} />
            <div className="molecule-info__divider" />
            <div className="molecule-info__label">{t("moleculeInfo.smiles")}</div>
            <div className="molecule-info__smiles-row">
              <code className="molecule-info__smiles">{smiles || "\u2014"}</code>
              {smiles && (
                <button className="molecule-info__copy" onClick={() => copyField(smiles, "smiles")} title={t("tool.exportSmiles")}>
                  {copiedField === "smiles" ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>

            <div className="molecule-info__divider" />
            <div className="molecule-info__label">{t("moleculeInfo.inchi")}</div>
            {!inchiState && (
              <button
                className="molecule-info__inchi-btn"
                disabled={!hasAnyAtoms || hasPlaceholder}
                title={hasPlaceholder ? t("moleculeInfo.placeholderWarning") : undefined}
                onClick={runInchiLookup}
              >
                {t("moleculeInfo.getInchi")}
              </button>
            )}
            {inchiState?.phase === "loading" && (
              <div className="structure-search-menu__loading">
                <Loader2 size={14} className="compound-search__spinner" />
                {t("iupac.loading")}
              </div>
            )}
            {inchiState?.phase === "error" && <p className="align-menu__hint">{inchiState.message}</p>}
            {inchiState?.phase === "result" && (
              <>
                <div className="molecule-info__smiles-row">
                  <code className="molecule-info__smiles">{inchiState.inchi}</code>
                  <button className="molecule-info__copy" onClick={() => copyField(inchiState.inchi, "inchi")} title={t("moleculeInfo.copyInchi")}>
                    {copiedField === "inchi" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="molecule-info__label">{t("moleculeInfo.inchikey")}</div>
                <div className="molecule-info__smiles-row">
                  <code className="molecule-info__smiles">{inchiState.inchikey}</code>
                  <button className="molecule-info__copy" onClick={() => copyField(inchiState.inchikey, "inchikey")} title={t("moleculeInfo.copyInchikey")}>
                    {copiedField === "inchikey" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

/**
 * The popover's stereochemistry section. Deliberately a child component
 * mounted only while the popover is open (and something is drawn): the
 * analysis inside it round-trips the molecule through OpenChemLib, and
 * nothing about the top bar needs that unless somebody is actually looking
 * at the panel.
 *
 * Uses the same `analyzeStereochemistry` result the canvas overlay uses,
 * via its molecule-identity cache, so opening the panel after turning the
 * overlay on doesn't repeat the work.
 */
export function StereoSection({ molecule }: { molecule: Molecule }) {
  const t = useT();
  const analysis = useStereoAnalysis(molecule, true);
  const showComputedStereo = useMoleculeStore((s) => s.showComputedStereo);
  const toggleComputedStereo = useMoleculeStore((s) => s.toggleComputedStereo);
  const setSelected = useMoleculeStore((s) => s.setSelected);

  // Stable 1-based drawing order, used only to tell two otherwise-identical
  // "C" rows apart. It is not an IUPAC locant and isn't presented as one.
  const atomIndex = useMemo(() => {
    const map = new Map<string, number>();
    Object.keys(molecule.atoms).forEach((id, i) => map.set(id, i + 1));
    return map;
  }, [molecule]);

  const atomTag = (id: string): string => {
    const atom = molecule.atoms[id];
    return atom ? `${atom.element}${atomIndex.get(id) ?? ""}` : id;
  };
  const bondTag = (bondId: string): string => {
    const bond = molecule.bonds[bondId];
    return bond ? `${atomTag(bond.a1)}=${atomTag(bond.a2)}` : bondId;
  };
  const selectAtom = (id: string) => setSelected(new Set([id]));
  const selectBond = (bondId: string) => {
    const bond = molecule.bonds[bondId];
    if (bond) setSelected(new Set([bond.a1, bond.a2]));
  };

  const ok = analysis?.status === "ok" ? analysis : null;
  const computedByAtom = new Map(ok ? ok.atoms.map((s) => [s.atomId, s.label]) : []);
  // Manual Atom.stereoLabel is the person's own assertion; the overlay
  // deliberately skips those atoms, so a disagreement is surfaced here
  // instead of being allowed to pass silently.
  const conflicts = ok
    ? Object.values(molecule.atoms).filter((a) => {
        const computed = computedByAtom.get(a.id);
        return a.stereoLabel && computed && computed !== a.stereoLabel;
      })
    : [];
  // A manual label on an atom the engine couldn't assign (or on a molecule
  // it can't analyse at all) still belongs in the panel — otherwise setting
  // R/S on an achiral-looking or abbreviated-group structure made the label
  // silently disappear from here even though it's drawn on the canvas.
  const manualOnlyAtoms = Object.values(molecule.atoms).filter(
    (a) => a.stereoLabel && !computedByAtom.has(a.id)
  );

  const issueCount = ok
    ? ok.undefinedAtoms.length + ok.undefinedBonds.length + ok.ambiguousAtoms.length + ok.ambiguousBonds.length
    : 0;
  const computedCount = ok ? ok.atoms.length + ok.bonds.length : 0;

  return (
    <>
      <div className="molecule-info__divider" />
      <div className="molecule-info__stereo-header">
        <span className="molecule-info__label molecule-info__label--flush">{t("moleculeInfo.stereoHeading")}</span>
        <button
          type="button"
          className={`molecule-info__stereo-toggle ${showComputedStereo ? "is-on" : ""}`}
          aria-pressed={showComputedStereo}
          onClick={toggleComputedStereo}
        >
          {t("moleculeInfo.stereoShowOnCanvas")}
        </button>
      </div>

      {analysis?.status === "unavailable" && (
        <p className="align-menu__hint">{t(`moleculeInfo.stereoUnavailable.${analysis.reason}`)}</p>
      )}

      {ok && computedCount === 0 && issueCount === 0 && manualOnlyAtoms.length === 0 && (
        <p className="align-menu__hint">{t("moleculeInfo.stereoNone")}</p>
      )}

      {ok && computedCount > 0 && (
        <>
          <div className="molecule-info__stereo-subhead">{t("moleculeInfo.stereoComputed")}</div>
          <div className="molecule-info__stereo-list">
            {ok.atoms.map(({ atomId, label, relative }) => {
              const manual = molecule.atoms[atomId]?.stereoLabel;
              return (
                <button
                  key={`atom-${atomId}`}
                  type="button"
                  className="molecule-info__stereo-row"
                  onClick={() => selectAtom(atomId)}
                  title={t("moleculeInfo.stereoClickHint")}
                >
                  <span>{atomTag(atomId)}</span>
                  <span className="molecule-info__stereo-value">
                    ({label})
                    {relative && <span className="molecule-info__stereo-note"> \u2248</span>}
                    {manual && (
                      <span className="molecule-info__stereo-note">
                        {" \u00b7 "}
                        {t("moleculeInfo.stereoManual", { label: manual })}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {ok.bonds.map(({ bondId, label, relative }) => (
              <button
                key={`bond-${bondId}`}
                type="button"
                className="molecule-info__stereo-row"
                onClick={() => selectBond(bondId)}
                title={t("moleculeInfo.stereoClickHint")}
              >
                <span>{bondTag(bondId)}</span>
                <span className="molecule-info__stereo-value">
                  ({label})
                  {relative && <span className="molecule-info__stereo-note"> \u2248</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {manualOnlyAtoms.length > 0 && (
        <>
          <div className="molecule-info__stereo-subhead">{t("moleculeInfo.stereoManualAssigned")}</div>
          <div className="molecule-info__stereo-list">
            {manualOnlyAtoms.map((atom) => (
              <button
                key={`manual-atom-${atom.id}`}
                type="button"
                className="molecule-info__stereo-row"
                onClick={() => selectAtom(atom.id)}
                title={t("moleculeInfo.stereoClickHint")}
              >
                <span>{atomTag(atom.id)}</span>
                <span className="molecule-info__stereo-value">({atom.stereoLabel})</span>
              </button>
            ))}
          </div>
        </>
      )}

      {ok && issueCount > 0 && (
        <>
          <div className="molecule-info__stereo-subhead">{t("moleculeInfo.stereoNeedsAttention")}</div>
          <div className="molecule-info__stereo-list">
            {ok.undefinedAtoms.map((atomId) => (
              <button
                key={`undef-atom-${atomId}`}
                type="button"
                className="molecule-info__stereo-row is-issue"
                onClick={() => selectAtom(atomId)}
                title={t("moleculeInfo.stereoClickHint")}
              >
                <span>{atomTag(atomId)}</span>
                <span className="molecule-info__stereo-value">{t("moleculeInfo.stereoUndefined")}</span>
              </button>
            ))}
            {ok.ambiguousAtoms.map((atomId) => (
              <button
                key={`ambig-atom-${atomId}`}
                type="button"
                className="molecule-info__stereo-row is-issue"
                onClick={() => selectAtom(atomId)}
                title={t("moleculeInfo.stereoClickHint")}
              >
                <span>{atomTag(atomId)}</span>
                <span className="molecule-info__stereo-value">{t("moleculeInfo.stereoAmbiguous")}</span>
              </button>
            ))}
            {ok.undefinedBonds.map((bondId) => (
              <button
                key={`undef-bond-${bondId}`}
                type="button"
                className="molecule-info__stereo-row is-issue"
                onClick={() => selectBond(bondId)}
                title={t("moleculeInfo.stereoClickHint")}
              >
                <span>{bondTag(bondId)}</span>
                <span className="molecule-info__stereo-value">{t("moleculeInfo.stereoUndefined")}</span>
              </button>
            ))}
            {ok.ambiguousBonds.map((bondId) => (
              <button
                key={`ambig-bond-${bondId}`}
                type="button"
                className="molecule-info__stereo-row is-issue"
                onClick={() => selectBond(bondId)}
                title={t("moleculeInfo.stereoClickHint")}
              >
                <span>{bondTag(bondId)}</span>
                <span className="molecule-info__stereo-value">{t("moleculeInfo.stereoAmbiguous")}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {conflicts.map((atom) => (
        <div key={`conflict-${atom.id}`} className="molecule-info__warning">
          <AlertTriangle size={13} />
          <span>
            {t("moleculeInfo.stereoConflict", {
              manual: atom.stereoLabel ?? "",
              computed: computedByAtom.get(atom.id) ?? "",
            })}
          </span>
        </div>
      ))}
    </>
  );
}

/**
 * Reaction-scheme authoring and reading controls.
 *
 * ChemDraw schemes are still imported and re-exported as `<scheme>`/`<step>`
 * data, but this section now also creates them from a selection and exposes
 * the reading commands (interpretation, clean-up, mapping). Selecting a row
 * sets both the atom and the annotation selection: the structures on either
 * side are atoms, while the connecting arrows live in the annotation map, and
 * "the reaction" means both.
 */
export function SchemeSection({ molecule }: { molecule: Molecule }) {
  const t = useT();
  const setSelected = useMoleculeStore((s) => s.setSelected);
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const selected = useMoleculeStore((s) => s.selected);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const createSchemeFromSelection = useMoleculeStore((s) => s.createSchemeFromSelection);
  const removeScheme = useMoleculeStore((s) => s.removeScheme);
  const cleanReaction = useMoleculeStore((s) => s.cleanReaction);
  const mapReactionAtoms = useMoleculeStore((s) => s.mapReactionAtoms);
  const clearReactionMap = useMoleculeStore((s) => s.clearReactionMap);
  const validateReactionMap = useMoleculeStore((s) => s.validateReactionMap);
  const showInterpretation = useMoleculeStore((s) => s.showReactionInterpretation);
  const toggleInterpretation = useMoleculeStore((s) => s.toggleReactionInterpretation);
  const setStatus = useMoleculeStore((s) => s.setStatus);

  const schemes = molecule.schemes ?? [];
  const canCreate = selected.size > 0 && selectedAnnotationIds.size > 0;
  if (schemes.length === 0 && !canCreate) return null;

  const selectScheme = (scheme: (typeof schemes)[number]) => {
    setSelected(new Set(schemeAtomIds(scheme)));
    setSelectedAnnotationIds(new Set(schemeArrowIds(scheme)));
  };

  const create = () => {
    const count = createSchemeFromSelection();
    setStatus(count > 0 ? t("status.reactionSchemeCreated", { count }) : t("status.reactionSchemeCreateFailed"));
  };

  const clean = (schemeId: string, augmented: boolean) => {
    const count = cleanReaction(schemeId, { augmented });
    setStatus(count > 0 ? t("status.reactionCleaned") : t("status.reactionCleanFailed"));
  };

  const map = (schemeId: string) => {
    const count = mapReactionAtoms(schemeId);
    if (count === 0) {
      setStatus(t("status.reactionMapFailed"));
      return;
    }
    // Ambiguous atoms are deliberately left for the map-number tool, so say
    // how many are still open instead of implying the map is complete.
    const validation = validateReactionMap(schemeId);
    const unmapped = validation
      ? validation.unmappedReactantAtomIds.length + validation.unmappedProductAtomIds.length
      : 0;
    setStatus(
      unmapped > 0
        ? t("status.reactionMappedPartial", { count, unmapped })
        : t("status.reactionMapped", { count })
    );
  };

  const clearMap = (schemeId: string) => {
    clearReactionMap(schemeId);
    setStatus(t("status.reactionMapCleared"));
  };

  const remove = (schemeId: string) => {
    removeScheme(schemeId);
    setStatus(t("status.reactionSchemeRemoved"));
  };

  return (
    <>
      <div className="molecule-info__divider" />
      <div className="molecule-info__label">{t("moleculeInfo.schemes")}</div>

      <div className="molecule-info__reaction-toolbar">
        {canCreate && (
          <button type="button" className="molecule-info__reaction-action" onClick={create} title={t("moleculeInfo.schemeCreateHint")}>
            <Plus size={13} />
            <span>{t("moleculeInfo.schemeCreate")}</span>
          </button>
        )}
        {schemes.length > 0 && (
          <button
            type="button"
            className={`molecule-info__reaction-action${showInterpretation ? " is-on" : ""}`}
            onClick={toggleInterpretation}
            title={t("moleculeInfo.schemeInterpretHint")}
          >
            {showInterpretation ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>{showInterpretation ? t("moleculeInfo.schemeInterpretHide") : t("moleculeInfo.schemeInterpret")}</span>
          </button>
        )}
      </div>

      {schemes.length > 0 && (
        <div className="molecule-info__stereo-list">
          {schemes.map((scheme, i) => {
            const summary = summarizeScheme(scheme);
            return (
              <div key={scheme.id} className="molecule-info__reaction">
                <button
                  type="button"
                  className="molecule-info__stereo-row"
                  onClick={() => selectScheme(scheme)}
                  title={t("moleculeInfo.schemeClickHint")}
                >
                  <span>{t("moleculeInfo.schemeName", { n: i + 1 })}</span>
                  <span className="molecule-info__stereo-value">
                    {t("moleculeInfo.schemeSummary", {
                      steps: summary.steps,
                      reactants: summary.reactants,
                      products: summary.products,
                    })}
                  </span>
                </button>
                <div className="molecule-info__reaction-actions">
                  <button type="button" title={t("moleculeInfo.schemeCleanHint")} onClick={() => clean(scheme.id, false)}>
                    <Wand2 size={12} />
                  </button>
                  <button type="button" title={t("moleculeInfo.schemeCleanAugmentedHint")} onClick={() => clean(scheme.id, true)}>
                    <Wand2 size={12} />
                    <span className="molecule-info__reaction-plus">+</span>
                  </button>
                  <button type="button" title={t("moleculeInfo.schemeMapHint")} onClick={() => map(scheme.id)}>
                    <MapPin size={12} />
                  </button>
                  <button type="button" title={t("moleculeInfo.schemeClearMapHint")} onClick={() => clearMap(scheme.id)}>
                    <MapPin size={12} />
                    <span className="molecule-info__reaction-slash" />
                  </button>
                  <button type="button" title={t("moleculeInfo.schemeDeleteHint")} onClick={() => remove(scheme.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="align-menu__hint">{t("moleculeInfo.schemeHint")}</p>
    </>
  );
}

/**
 * Editable list of ChemDraw S-groups (polymer/mixture brackets) on the
 * active molecule. Unlike the reaction-scheme section above, this is an
 * authoring surface: type, repeat count and label can be changed here, the
 * current selection can be added to / removed from a group, and the group
 * can be deleted. Creating one happens from the canvas context menu's
 * "Group as S-group" submenu, which is where a selection exists.
 */
export function SGroupSection({ molecule }: { molecule: Molecule }) {
  const t = useT();
  const groups = Object.values(molecule.sgroups ?? {});
  if (groups.length === 0) return null;

  return (
    <>
      <div className="molecule-info__divider" />
      <div className="molecule-info__label">{t("moleculeInfo.sgroups")}</div>
      <div className="molecule-info__sgroup-list">
        {groups.map((group, i) => (
          <SGroupRow key={group.id} group={group} index={i} />
        ))}
      </div>
      <p className="align-menu__hint">{t("moleculeInfo.sgroupHint")}</p>
    </>
  );
}

function SGroupRow({ group, index }: { group: SGroup; index: number }) {
  const t = useT();
  const setSelected = useMoleculeStore((s) => s.setSelected);
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const updateSGroup = useMoleculeStore((s) => s.updateSGroup);
  const deleteSGroup = useMoleculeStore((s) => s.deleteSGroup);
  const addSelectionToSGroup = useMoleculeStore((s) => s.addSelectionToSGroup);
  const removeSelectionFromSGroup = useMoleculeStore((s) => s.removeSelectionFromSGroup);
  const selected = useMoleculeStore((s) => s.selected);

  const selectGroup = () => {
    setSelected(new Set(group.atomIds));
    setSelectedAnnotationIds(new Set(group.bracketAnnotationIds ?? []));
  };

  // Text fields are committed on blur/Enter rather than per keystroke so one
  // edit doesn't flood the undo stack with a checkpoint per character. The
  // inputs are uncontrolled and keyed by the stored value, so an undo or a
  // type-driven default remounts them with the new text.
  const commitRepeat = (raw: string) => {
    const value = raw.trim();
    if (value !== (group.subscript ?? "")) updateSGroup(group.id, { subscript: value });
  };

  const commitLabel = (raw: string) => {
    const value = raw.trim();
    if (value !== (group.label ?? "")) updateSGroup(group.id, { label: value });
  };

  const changeType = (type: SGroupType) => {
    const oldDefault = DEFAULT_SGROUP_SUBSCRIPT[group.type] ?? "";
    const newDefault = DEFAULT_SGROUP_SUBSCRIPT[type] ?? "";
    const patch: { type: SGroupType; subscript?: string } = { type };
    // Only follow the new type's default when the old value was still that
    // type's default — a hand-typed "m" is the person's choice, not ours.
    if ((group.subscript ?? "") === oldDefault) patch.subscript = newDefault;
    updateSGroup(group.id, patch);
  };

  const canRemove = group.atomIds.some((id) => selected.has(id));

  return (
    <div className="molecule-info__sgroup">
      <button
        type="button"
        className="molecule-info__sgroup-head"
        onClick={selectGroup}
        title={t("moleculeInfo.sgroupClickHint")}
      >
        <span>{t("moleculeInfo.sgroupName", { n: index + 1 })}</span>
        <span className="molecule-info__sgroup-meta">
          {group.type} · {t("moleculeInfo.sgroupAtoms", { count: String(group.atomIds.length) })}
        </span>
      </button>
      <div className="molecule-info__sgroup-fields">
        <label className="molecule-info__sgroup-field">
          <span>{t("moleculeInfo.sgroupType")}</span>
          <select
            value={group.type}
            onChange={(e) => changeType(e.target.value as SGroupType)}
          >
            {SGROUP_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`sgroup.type.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="molecule-info__sgroup-field molecule-info__sgroup-field--short">
          <span>{t("moleculeInfo.sgroupRepeat")}</span>
          <input
            key={group.subscript ?? ""}
            defaultValue={group.subscript ?? ""}
            placeholder="n"
            onBlur={(e) => commitRepeat(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <label className="molecule-info__sgroup-field molecule-info__sgroup-field--short">
          <span>{t("moleculeInfo.sgroupLabel")}</span>
          <input
            key={group.label ?? ""}
            defaultValue={group.label ?? ""}
            onBlur={(e) => commitLabel(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
      </div>
      <div className="molecule-info__sgroup-actions">
        <button
          type="button"
          className="molecule-info__sgroup-action"
          disabled={selected.size === 0}
          onClick={() => addSelectionToSGroup(group.id)}
          title={t("moleculeInfo.sgroupAddSelection")}
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          className="molecule-info__sgroup-action"
          disabled={!canRemove}
          onClick={() => removeSelectionFromSGroup(group.id)}
          title={t("moleculeInfo.sgroupRemoveSelection")}
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          className="molecule-info__sgroup-action molecule-info__sgroup-action--danger"
          onClick={() => deleteSGroup(group.id)}
          title={t("moleculeInfo.sgroupDelete")}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
