import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, X } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { ArrowShapePicker } from "../Sidebar/ArrowVariantPicker";
import { detectIdentifierKind, fetchCompoundByIdentifier, PubChemError } from "../../io/pubchem";
import { fetchNameToStructureLocal } from "../../io/iupacFallback";
import { importSmiles, SmilesImportError } from "../../io/smilesImport";
import { computeReactionBalance, formatBalanceDifferences } from "../../engine/reactionBalance";
import type { ArrowVariant, Molecule } from "../../types/chemistry";

interface ReactionBuilderDialogProps {
  onClose: () => void;
}

interface ComponentDraft {
  text: string;
  coefficient: string;
}

const emptyDraft = (): ComponentDraft => ({ text: "", coefficient: "" });

class ComponentResolveError extends Error {
  constructor(
    readonly text: string,
    readonly reason: unknown
  ) {
    super("Could not resolve reaction component");
  }
}

/**
 * Builds one reaction row from text instead of from drawing tools.
 *
 * Each reactant/product is its own box, so the plus signs are implicit in the
 * author's intent (two boxes = two structures joined by "+") rather than
 * something they have to type. A box accepts a compound name (resolved through
 * the same PubChem/local-OPSIN path as the top-bar search) or a SMILES string
 * (resolved locally, so it works offline).
 *
 * Resolution is deliberately sequential and all-or-nothing: PubChem asks
 * clients to stay around a few requests per second, and a half-drawn reaction
 * would be worse than an error naming the box that failed.
 */
export function ReactionBuilderDialog({ onClose }: ReactionBuilderDialogProps) {
  const t = useT();
  const buildReaction = useMoleculeStore((s) => s.buildReaction);
  const setStatus = useMoleculeStore((s) => s.setStatus);

  const [reactants, setReactants] = useState<ComponentDraft[]>([emptyDraft()]);
  const [products, setProducts] = useState<ComponentDraft[]>([emptyDraft()]);
  const [conditionsAbove, setConditionsAbove] = useState("");
  const [conditionsBelow, setConditionsBelow] = useState("");
  const [arrowVariant, setArrowVariant] = useState<ArrowVariant>("forward");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    // Reset first: StrictMode runs setup -> cleanup -> setup on mount, and
    // the cleanup below marks the dialog cancelled. Without this line that
    // simulated unmount would leave the flag true for the real session and
    // a finished lookup would silently never commit.
    cancelledRef.current = false;
    firstInputRef.current?.focus();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const updateList = (
    setter: React.Dispatch<React.SetStateAction<ComponentDraft[]>>,
    index: number,
    patch: Partial<ComponentDraft>
  ) => {
    setter((list) => list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
    setError(null);
  };

  const addBox = (setter: React.Dispatch<React.SetStateAction<ComponentDraft[]>>) => {
    setter((list) => [...list, emptyDraft()]);
  };

  const removeBox = (setter: React.Dispatch<React.SetStateAction<ComponentDraft[]>>, index: number) => {
    setter((list) => (list.length <= 1 ? [emptyDraft()] : list.filter((_, i) => i !== index)));
  };

  const resolveOne = async (text: string, cache: Map<string, Molecule>): Promise<Molecule> => {
    const key = text.trim();
    const cached = cache.get(key);
    if (cached) return cached;

    let molecule: Molecule;
    if (detectIdentifierKind(key) === "smiles") {
      molecule = importSmiles(key).molecule;
    } else {
      try {
        molecule = (await fetchCompoundByIdentifier(key, "auto")).molecule;
      } catch (err) {
        // Offline / not in PubChem: give the local name parser a chance, the
        // same second chance the top-bar search gives a NOT_FOUND name.
        const canTryLocal =
          err instanceof PubChemError && (err.code === "NOT_FOUND" || err.code === "NETWORK");
        if (!canTryLocal) throw err;
        const local = await fetchNameToStructureLocal(key);
        if (!local) throw err;
        molecule = local;
      }
    }
    cache.set(key, molecule);
    return molecule;
  };

  const messageForError = (failure: ComponentResolveError): string => {
    const err = failure.reason;
    if (err instanceof SmilesImportError) {
      return t("reactionBuilder.errorSmiles", { name: failure.text, reason: err.message });
    }
    if (err instanceof PubChemError) {
      if (err.code === "NOT_FOUND") return t("reactionBuilder.errorNotFound", { name: failure.text });
      if (err.code === "NETWORK") return t("reactionBuilder.errorNetwork", { name: failure.text });
      return t("reactionBuilder.errorResolve", { name: failure.text, reason: err.code });
    }
    return t("reactionBuilder.errorResolve", {
      name: failure.text,
      reason: err instanceof Error ? err.message : String(err),
    });
  };

  const submit = async () => {
    if (busy) return;
    cancelledRef.current = false;
    const reactantDrafts = reactants
      .map((entry) => ({ text: entry.text.trim(), coefficient: entry.coefficient.trim() }))
      .filter((entry) => entry.text);
    const productDrafts = products
      .map((entry) => ({ text: entry.text.trim(), coefficient: entry.coefficient.trim() }))
      .filter((entry) => entry.text);
    if (reactantDrafts.length === 0 || productDrafts.length === 0) {
      setError(t("reactionBuilder.errorEmpty"));
      return;
    }

    setBusy(true);
    setError(null);
    const total = reactantDrafts.length + productDrafts.length;
    let done = 0;
    const cache = new Map<string, Molecule>();

    try {
      const resolveAll = async (
        list: { text: string; coefficient: string }[]
      ): Promise<{ molecule: Molecule; coefficient?: string }[]> => {
        const out: { molecule: Molecule; coefficient?: string }[] = [];
        for (const entry of list) {
          setProgress({ current: done + 1, total });
          try {
            out.push({
              molecule: await resolveOne(entry.text, cache),
              ...(entry.coefficient ? { coefficient: entry.coefficient } : {}),
            });
          } catch (err) {
            throw new ComponentResolveError(entry.text, err);
          }
          done += 1;
        }
        return out;
      };

      const resolvedReactants = await resolveAll(reactantDrafts);
      const resolvedProducts = await resolveAll(productDrafts);
      if (cancelledRef.current) return;

      const schemeId = buildReaction({
        reactants: resolvedReactants,
        products: resolvedProducts,
        arrowVariant,
        conditionsAbove,
        conditionsBelow,
      });
      if (!schemeId) {
        setError(t("reactionBuilder.errorEmpty"));
        return;
      }

      // The row is now on the canvas. Report its atom balance too: a scheme
      // built from names looks finished even when a species is missing, so
      // the status line is the natural place to flag it.
      const balance = computeReactionBalance(resolvedReactants, resolvedProducts);
      const counts = {
        reactants: String(resolvedReactants.length),
        products: String(resolvedProducts.length),
      };
      if (balance.status === "balanced") {
        setStatus(t("status.reactionBuiltBalanced", counts));
      } else if (balance.status === "unbalanced") {
        setStatus(
          t("status.reactionBuiltUnbalanced", {
            ...counts,
            details: formatBalanceDifferences(balance.differences),
          })
        );
      } else {
        setStatus(t("status.reactionBuiltUnchecked", counts));
      }
      onClose();
    } catch (err) {
      if (cancelledRef.current) return;
      setError(
        err instanceof ComponentResolveError
          ? messageForError(err)
          : t("reactionBuilder.errorGeneric")
      );
    } finally {
      if (!cancelledRef.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const renderList = (
    label: string,
    values: ComponentDraft[],
    setter: React.Dispatch<React.SetStateAction<ComponentDraft[]>>,
    addLabel: string,
    firstRef?: React.RefObject<HTMLInputElement | null>
  ) => (
    <div className="reaction-builder-section">
      <div className="reaction-builder-label">{label}</div>
      {values.map((draft, index) => (
        <div className="reaction-builder-row" key={index}>
          <input
            className="reaction-builder-coefficient"
            type="text"
            inputMode="decimal"
            value={draft.coefficient}
            placeholder={t("reactionBuilder.coefficientPlaceholder")}
            title={t("reactionBuilder.coefficient")}
            aria-label={t("reactionBuilder.coefficient")}
            maxLength={8}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => updateList(setter, index, { coefficient: e.target.value })}
            onKeyDown={onKeyDown}
          />
          <input
            ref={index === 0 ? firstRef : undefined}
            type="text"
            value={draft.text}
            placeholder={t("reactionBuilder.componentPlaceholder")}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => updateList(setter, index, { text: e.target.value })}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="reaction-builder-remove"
            title={t("reactionBuilder.remove")}
            aria-label={t("reactionBuilder.remove")}
            disabled={busy || values.length <= 1}
            onClick={() => removeBox(setter, index)}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="reaction-builder-add"
        disabled={busy}
        onClick={() => addBox(setter)}
      >
        <Plus size={13} />
        <span>{addLabel}</span>
      </button>
    </div>
  );

  return createPortal(
    <div className="paste-overlay" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        className="paste-dialog reaction-builder-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("reactionBuilder.title")}
      >
        <div className="paste-dialog__header">
          <h2>{t("reactionBuilder.title")}</h2>
          <button
            type="button"
            className="paste-dialog__close"
            onClick={onClose}
            disabled={busy}
            aria-label={t("shortcuts.close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="paste-dialog__body">
          <p className="reaction-builder-hint">{t("reactionBuilder.intro")}</p>

          {renderList(t("reactionBuilder.reactants"), reactants, setReactants, t("reactionBuilder.addReactant"), firstInputRef)}
          {renderList(t("reactionBuilder.products"), products, setProducts, t("reactionBuilder.addProduct"))}

          <div className="reaction-builder-condition-grid">
            <label className="reaction-builder-field">
              <span>{t("reactionBuilder.conditionsAbove")}</span>
              <input
                type="text"
                value={conditionsAbove}
                placeholder={t("reactionBuilder.conditionsPlaceholder")}
                disabled={busy}
                onChange={(e) => setConditionsAbove(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </label>
            <label className="reaction-builder-field">
              <span>{t("reactionBuilder.conditionsBelow")}</span>
              <input
                type="text"
                value={conditionsBelow}
                placeholder={t("reactionBuilder.conditionsPlaceholder")}
                disabled={busy}
                onChange={(e) => setConditionsBelow(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </label>
          </div>

          <div className="reaction-builder-section">
            <div className="reaction-builder-label">{t("reactionBuilder.arrow")}</div>
            <ArrowShapePicker
              value={arrowVariant}
              onChange={setArrowVariant}
              active
              barb="full"
            />
          </div>

          <p className="reaction-builder-hint">{t("reactionBuilder.layoutHint")}</p>

          {error && <div className="paste-dialog__error">{error}</div>}
        </div>

        <div className="paste-dialog__footer">
          <button type="button" className="paste-dialog__cancel" onClick={onClose} disabled={busy}>
            {t("confirm.cancel")}
          </button>
          <button type="button" className="paste-dialog__add" onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 size={14} className="compound-search__spinner" />}
            <span>
              {busy
                ? progress
                  ? t("reactionBuilder.progress", {
                      current: String(progress.current),
                      total: String(progress.total),
                    })
                  : t("reactionBuilder.building")
                : t("reactionBuilder.build")}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
