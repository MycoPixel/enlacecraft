/**
 * Client for structure3d_server's GFN2-xTB refinement endpoint (see
 * python/structure3d_server/main.py) — the network half of the 3D
 * panel's "High accuracy" method. Mirrors io/nmrPredict.ts's
 * fetch/error-handling shape for consistency with the rest of the
 * app's network calls, including the same "just point at localhost,
 * no env-var wiring yet" caveat that file documents.
 *
 * Deliberately a thin refine-only client: it takes an already-generated
 * starting molfile (produced locally by io/embed3d.ts's "mmff94" method
 * — see Molecule3DView.tsx for how the two are chained) rather than
 * taking a bare molecule and re-deriving a starting geometry
 * server-side. Keeps this service's job to exactly one thing.
 */

const XTB_API_BASE = "http://localhost:8001";

// Real xtb runs can take a while on a slow machine or a larger
// molecule — long enough that the default browser fetch timeout (there
// isn't one) is fine, but a *stuck* server (hung subprocess, etc.)
// should still eventually surface as an error rather than spinning
// forever. Generous on purpose; py backend's own XTB_TIMEOUT_SECONDS
// (main.py) is the tighter, authoritative limit — this is just a
// backstop for a server that's stopped responding entirely.
const FETCH_TIMEOUT_MS = 120_000;

export type XtbRefineErrorCode = "NETWORK" | "HTTP" | "TIMEOUT";

export class XtbRefineError extends Error {
  code: XtbRefineErrorCode;
  params: Record<string, string | number>;
  constructor(code: XtbRefineErrorCode, params: Record<string, string | number> = {}) {
    super(code);
    this.name = "XtbRefineError";
    this.code = code;
    this.params = params;
  }
}

export interface XtbRefineResult {
  molfile: string;
  /** GFN2-xTB total electronic energy in kcal/mol — NOT comparable to
   * the MMFF94 method's energy (a small relative strain number on a
   * completely different scale/reference point). See
   * python/structure3d_server/README.md's note on this. */
  energyKcalMol: number;
  converged: boolean;
}

/**
 * Refines `startingMolfile` (a V2000 molfile with a starting 3D
 * conformer and explicit hydrogens — exactly what embed3d.ts's
 * "mmff94" method already produces) against GFN2-xTB.
 */
export async function refineWithXtb(startingMolfile: string, charge: number): Promise<XtbRefineResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${XTB_API_BASE}/embed3d/xtb`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ molfile: startingMolfile, charge }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new XtbRefineError("TIMEOUT");
    }
    throw new XtbRefineError("NETWORK");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new XtbRefineError("HTTP", { status: res.status });
  }

  const data = (await res.json()) as { molfile: string; energy_kcal_mol: number; converged: boolean };
  return { molfile: data.molfile, energyKcalMol: data.energy_kcal_mol, converged: data.converged };
}
