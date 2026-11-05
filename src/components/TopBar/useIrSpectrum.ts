import { useCallback, useState } from "react";
import type { Molecule } from "../../types/chemistry";
import { embedMolecule3D, Embed3DError } from "../../io/embed3d";
import { fetchIrSpectrum, IrSpectrumError, type IrMode } from "../../io/irSpectrum";
import { useT } from "../../i18n/useT";

export type IrState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; modes: IrMode[]; imaginaryCount: number }
  | { phase: "error"; message: string };

/**
 * Owns the one IR calculation, so the compact dropdown panel and the
 * full-screen report are always showing the same spectrum. Lifting this out of
 * the panel is what lets the report exist at all: it would otherwise have to
 * re-run the calculation, or be handed a copy that can drift from the panel's.
 *
 * Same shape as NmrPredictionButton's own state, for the same reason — the two
 * top-bar tools that need a backend and offer a full view both work this way.
 */
export function useIrSpectrum(molecule: Molecule) {
  const t = useT();
  const [state, setState] = useState<IrState>({ phase: "idle" });

  const run = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      // MMFF94 first, for the same reason the 3D panel does: the Hessian is
      // only meaningful at a real minimum, and starting from 2D coordinates
      // would often land in the wrong basin on a flexible molecule.
      const starting = await embedMolecule3D(molecule, "mmff94");
      const charge = Object.values(molecule.atoms).reduce((sum, a) => sum + a.charge, 0);
      const result = await fetchIrSpectrum(starting.molfile, charge);
      setState({ phase: "done", modes: result.modes, imaginaryCount: result.imaginaryCount });
    } catch (err) {
      if (err instanceof IrSpectrumError) {
        if (err.code === "UNAVAILABLE") setState({ phase: "error", message: t("ir.errorUnavailable") });
        else if (err.code === "TIMEOUT") setState({ phase: "error", message: t("ir.errorTimeout") });
        else setState({ phase: "error", message: t("ir.errorNetwork") });
        return;
      }
      // Embed3DError carries a specific reason worth surfacing — "no
      // force-field parameters for part of this structure" and "could not
      // parse this structure" call for completely different user actions, and
      // collapsing both into one generic line sends people looking in the
      // wrong place.
      if (err instanceof Embed3DError) {
        const known: Record<string, string> = {
          EMPTY: "ir.errorEmpty",
          ABBREVIATED_GROUP: "ir.errorAbbreviated",
          EMBED_FAILED: "ir.errorEmbed",
          DISCONNECTED_OR_UNSUPPORTED: "ir.errorParse",
        };
        setState({ phase: "error", message: t(known[err.code] ?? "ir.errorStructure") });
        return;
      }
      setState({ phase: "error", message: t("ir.errorStructure") });
    }
  }, [molecule, t]);

  return { state, run };
}