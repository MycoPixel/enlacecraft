/**
 * Local structure-identity lookups, computed with the RDKit that already ships
 * inside the bundled NMR backend rather than by asking a web service.
 *
 * Why this exists: MassBank records are keyed by InChIKey, and the obvious
 * source is PubChem. But PubChem can only answer for structures someone has
 * already submitted, so for a drawing program's most characteristic input --
 * something the user just invented -- the lookup fails for a reason that has
 * nothing to do with the structure. Computing the key locally removes that
 * dependency.
 *
 * The RDKit lives in a frozen PyInstaller bundle on localhost, so this is only
 * available in the desktop build and only while that backend is running. Every
 * function here therefore fails soft: callers fall back to PubChem, and then to
 * letting the user paste a key.
 */

const NMR_API_BASE = "http://localhost:8000";

/** The local backend is on loopback, so a failure is instant -- but a wedged
 * process would otherwise hang the lookup forever, so it still gets a cap. */
const LOCAL_TIMEOUT_MS = 2500;

export class LocalChemError extends Error {
  /** "unavailable" means no backend; "unsupported" means RDKit refused the
   *  structure. The two call for different fallbacks. */
  code: "unavailable" | "unsupported" | "network";
  constructor(code: "unavailable" | "unsupported" | "network") {
    super(code);
    this.name = "LocalChemError";
    this.code = code;
  }
}

async function postWithTimeout(path: string, body: unknown, signalMs = LOCAL_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), signalMs);
  try {
    return await fetch(`${NMR_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether this build can have a local backend at all.
 *
 * Only the desktop build bundles one. On a web deploy there is nothing on
 * localhost:8000 to find, and probing it anyway is not free: browsers treat a
 * public page reaching into the loopback interface as a local-network request
 * and may put a permission prompt in front of the user for a feature that was
 * never going to work. NmrPredictionButton gates on the same bridge for the
 * same reason, so the two stay consistent.
 */
function hasLocalBackend(): boolean {
  return typeof window !== "undefined" && window.electron?.isElectron === true;
}

/** Whether the bundled backend is up. Cheap; safe to call speculatively. */
export async function isLocalBackendAvailable(): Promise<boolean> {
  if (!hasLocalBackend()) return false;
  try {
    const res = await fetch(`${NMR_API_BASE}/health`, { signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * InChIKey for a SMILES string, computed locally.
 *
 * Returns null when RDKit can parse the structure but cannot standardise it
 * into an InChI (an odd valence, say) -- a normal outcome that should drop the
 * caller to PubChem rather than raise.
 */
export async function fetchLocalInChIKey(smiles: string): Promise<string | null> {
  const trimmed = smiles.trim();
  if (!trimmed) return null;

  // No desktop bridge means no backend: say so without touching the network,
  // so the caller drops straight to PubChem.
  if (!hasLocalBackend()) throw new LocalChemError("unavailable");

  let res: Response;
  try {
    res = await postWithTimeout("/inchikey", { smiles: trimmed });
  } catch {
    // Connection refused or timed out: no backend, or it's wedged.
    throw new LocalChemError("unavailable");
  }

  if (res.status === 400) {
    // RDKit couldn't even parse it. The caller's own SMILES is what PubChem
    // would choke on too, so this is a genuine "cannot identify".
    throw new LocalChemError("unsupported");
  }
  if (!res.ok) throw new LocalChemError("unavailable");

  const data = (await res.json()) as { inchikey?: string | null };
  return data.inchikey ?? null;
}
