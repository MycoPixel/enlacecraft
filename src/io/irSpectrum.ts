const XTB_API_BASE = "http://localhost:8001";

/**
 * Client for structure3d_server's vibrational-analysis endpoint (see
 * python/structure3d_server/main.py) — the network half of the IR panel.
 * Mirrors io/xtbRefine.ts's fetch/error-handling shape, including the same
 * "just point at localhost, no env-var wiring yet" caveat that file documents.
 *
 * Takes the same already-generated starting molfile the 3D refinement does
 * (a V2000 molfile with a 3D conformer and explicit hydrogens, exactly what
 * io/embed3d.ts's "mmff94" method produces) rather than deriving a geometry
 * itself. The Hessian has to be evaluated at a real minimum, so this service
 * optimizes first internally — but starting from MMFF94's geometry rather
 * than from 2D coordinates is what keeps it from landing in the wrong basin
 * on a flexible molecule.
 */

const FETCH_TIMEOUT_MS = 180_000;

export type IrSpectrumErrorCode = "NETWORK" | "HTTP" | "TIMEOUT" | "UNAVAILABLE";

export class IrSpectrumError extends Error {
  code: IrSpectrumErrorCode;
  params: Record<string, string | number>;
  constructor(code: IrSpectrumErrorCode, params: Record<string, string | number> = {}) {
    super(code);
    this.name = "IrSpectrumError";
    this.code = code;
    this.params = params;
  }
}

export interface IrMode {
  /** Vibrational wavenumber, cm⁻¹. */
  wavenumber: number;
  /** IR intensity, km/mol. Frequencies are the reliable quantity here;
   *  intensities are systematically under-predicted for X–H stretches, which
   *  is a known GFN2-xTB limitation rather than a parsing problem. */
  intensityKmMol: number;
}

export interface IrSpectrumResult {
  modes: IrMode[];
  /** False when xtb didn't exit cleanly. */
  converged: boolean;
  /** Modes with a negative wavenumber — the Hessian says this geometry isn't
   *  a minimum. Non-zero here means every frequency in the result is suspect. */
  imaginaryCount: number;
}

export async function fetchIrSpectrum(startingMolfile: string, charge: number): Promise<IrSpectrumResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${XTB_API_BASE}/ir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ molfile: startingMolfile, charge }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new IrSpectrumError("TIMEOUT");
    }
    throw new IrSpectrumError("NETWORK");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? "";
    } catch {
      // A proxy error page rather than the service's own JSON.
    }
    // 503 is the service telling us the xtb binary isn't there, which is a
    // different remedy from "this molecule failed" — worth its own code so
    // the panel can explain that the feature needs the desktop app.
    if (res.status === 503) throw new IrSpectrumError("UNAVAILABLE", { detail });
    throw new IrSpectrumError("HTTP", { status: res.status, detail });
  }

  const data = (await res.json()) as {
    modes?: { wavenumber?: number; intensity_km_mol?: number }[];
    converged?: boolean;
    imaginary_count?: number;
  };
  const modes = (data.modes ?? []).flatMap((m) =>
    typeof m.wavenumber === "number" && typeof m.intensity_km_mol === "number"
      ? [{ wavenumber: m.wavenumber, intensityKmMol: m.intensity_km_mol }]
      : [],
  );
  if (modes.length === 0) throw new IrSpectrumError("HTTP", { status: res.status });

  return {
    modes,
    converged: data.converged ?? false,
    imaginaryCount: data.imaginary_count ?? 0,
  };
}