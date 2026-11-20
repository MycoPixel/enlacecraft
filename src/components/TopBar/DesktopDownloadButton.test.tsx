// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { DesktopDownloadButton } from "./DesktopDownloadButton";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The download menu is the web build's only pointer to the desktop installers,
 * so it has to query the same repo electron-builder publishes to. It once
 * checked a separate `enlacecraft-releases` repo; when distribution moved to
 * the app's own public repo, a stale query here would leave every visitor on
 * "Couldn't reach GitHub" with a link to the wrong place.
 *
 * Only one test in this file: the release cache is module-level (deliberately,
 * to spare the GitHub rate limit), so a second render would reuse this
 * response instead of exercising the fetch again.
 */

const WINDOWS_URL = "https://github.com/MycoPixel/enlacecraft/releases/download/v1.18.0/EnlaceCraft-Setup-1.18.0.exe";
const LINUX_URL = "https://github.com/MycoPixel/enlacecraft/releases/download/v1.18.0/EnlaceCraft-1.18.0.AppImage";

let container: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMoleculeStore.setState({ language: "en" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          tag_name: "v1.18.0",
          assets: [
            { name: "EnlaceCraft-Setup-1.18.0.exe", browser_download_url: WINDOWS_URL },
            { name: "EnlaceCraft-1.18.0.AppImage", browser_download_url: LINUX_URL },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("DesktopDownloadButton", () => {
  test("checks and links to releases on the app's own public repo", async () => {
    await act(async () => {
      root.render(<DesktopDownloadButton />);
    });

    const trigger = container.querySelector("button");
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(fetch).toHaveBeenCalledWith("https://api.github.com/repos/MycoPixel/enlacecraft/releases/latest");

    const menu = document.body.querySelector<HTMLDivElement>(".desktop-download-menu");
    expect(menu).not.toBeNull();
    const hrefs = [...menu!.querySelectorAll<HTMLAnchorElement>("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([WINDOWS_URL, LINUX_URL, "https://github.com/MycoPixel/enlacecraft/releases/latest"]);
    expect(menu!.textContent).toContain("v1.18.0");
  });
});
