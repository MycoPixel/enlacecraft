import { useState } from "react";
import { MonitorDown, Loader2, ExternalLink } from "lucide-react";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { useT } from "../../i18n/useT";

const RELEASES_REPO = "MycoPixel/enlacecraft-releases";
const RELEASES_PAGE_URL = `https://github.com/${RELEASES_REPO}/releases/latest`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

type LatestReleaseState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "result"; version: string; windowsUrl: string | null; linuxUrl: string | null };

// Module-level, not component state: the release list doesn't change
// during a session, and this avoids re-hitting the GitHub API's
// unauthenticated rate limit (60 req/hour per IP) every time someone
// re-opens the dropdown — a real concern here specifically, since
// EnlaceCraft's actual traffic pattern is a class of students likely
// browsing from the same university network/IP at once.
let cachedRelease: LatestReleaseState | null = null;

type DetectedOS = "windows" | "linux" | "mac" | "other";

function detectOS(): DetectedOS {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "other";
}

async function fetchLatestRelease(): Promise<LatestReleaseState> {
  const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`);
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const data: { tag_name: string; assets: ReleaseAsset[] } = await res.json();
  // Matched by extension rather than an exact filename: electron-builder's
  // default artifact naming (e.g. spaces in the NSIS installer's name)
  // isn't something to hardcode and re-verify on every release.
  const windowsUrl = data.assets.find((a) => a.name.toLowerCase().endsWith(".exe"))?.browser_download_url ?? null;
  const linuxUrl = data.assets.find((a) => a.name.toLowerCase().endsWith(".appimage"))?.browser_download_url ?? null;
  return { phase: "result", version: data.tag_name, windowsUrl, linuxUrl };
}

/**
 * Hidden entirely when already running inside the desktop app itself
 * (window.electron only exists there — see electron/preload.cjs), since
 * offering to download the desktop app from within the desktop app
 * doesn't make sense.
 */
export function DesktopDownloadButton() {
  const t = useT();
  const [state, setState] = useState<LatestReleaseState | null>(cachedRelease);

  if (window.electron) return null;

  const load = () => {
    if (cachedRelease) {
      setState(cachedRelease);
      return;
    }
    setState({ phase: "loading" });
    fetchLatestRelease()
      .then((result) => {
        cachedRelease = result;
        setState(result);
      })
      .catch(() => {
        // Not cached on failure — worth retrying next time the dropdown
        // opens (a transient network blip shouldn't lock in a dead end
        // for the rest of the session).
        setState({ phase: "error" });
      });
  };

  const detected = detectOS();

  return (
    <div className="desktop-download-trigger">
      <ToolDropdown
        title={t("desktop.button")}
        active={false}
        onOpen={load}
        renderContent={(close) => (
          <div className="desktop-download-menu">
            <div className="desktop-download-menu__title">{t("desktop.title")}</div>

            {(!state || state.phase === "loading") && (
              <div className="desktop-download-menu__status">
                <Loader2 size={13} className="compound-search__spinner" />
                {t("desktop.loading")}
              </div>
            )}

            {state?.phase === "error" && <div className="desktop-download-menu__status">{t("desktop.error")}</div>}

            {state?.phase === "result" && (
              <>
                {state.windowsUrl && (
                  <a
                    href={state.windowsUrl}
                    className={`desktop-download-menu__option ${detected === "windows" ? "desktop-download-menu__option--recommended" : ""}`}
                    onClick={close}
                  >
                    <span>{t("desktop.windows")}</span>
                    {detected === "windows" && <span className="desktop-download-menu__badge">{t("desktop.recommended")}</span>}
                  </a>
                )}
                {state.linuxUrl && (
                  <a
                    href={state.linuxUrl}
                    className={`desktop-download-menu__option ${detected === "linux" ? "desktop-download-menu__option--recommended" : ""}`}
                    onClick={close}
                  >
                    <span>{t("desktop.linux")}</span>
                    {detected === "linux" && <span className="desktop-download-menu__badge">{t("desktop.recommended")}</span>}
                  </a>
                )}
                {detected === "mac" && <div className="desktop-download-menu__note">{t("desktop.macNotAvailable")}</div>}
                <div className="desktop-download-menu__version">{state.version}</div>
              </>
            )}

            <a href={RELEASES_PAGE_URL} target="_blank" rel="noreferrer" className="desktop-download-menu__all-releases" onClick={close}>
              <ExternalLink size={12} />
              {t("desktop.viewAllReleases")}
            </a>
          </div>
        )}
      >
        <MonitorDown size={18} />
      </ToolDropdown>
    </div>
  );
}
