// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { writeClipboardText } from "./clipboard";

const originalElectron = (window as unknown as { electron?: unknown }).electron;
const originalExecCommand = document.execCommand;

function setBridge(writeClipboardText: (text: string) => Promise<boolean>) {
  Object.defineProperty(window, "electron", {
    value: { writeClipboardText },
    configurable: true,
    writable: true,
  });
}

function setNavigatorClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(window, "electron", { value: originalElectron, configurable: true, writable: true });
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  document.execCommand = originalExecCommand;
  vi.restoreAllMocks();
});

describe("writeClipboardText", () => {
  test("prefers the native Electron bridge when it is present", async () => {
    const bridge = vi.fn(async () => true);
    const navigatorWrite = vi.fn(async () => {});
    setBridge(bridge);
    setNavigatorClipboard(navigatorWrite);

    await writeClipboardText("hello");

    expect(bridge).toHaveBeenCalledWith("hello");
    expect(navigatorWrite).not.toHaveBeenCalled();
  });

  test("falls back to the async Clipboard API when the bridge declines", async () => {
    setBridge(async () => false);
    const navigatorWrite = vi.fn(async () => {});
    setNavigatorClipboard(navigatorWrite);

    await writeClipboardText("hello");

    expect(navigatorWrite).toHaveBeenCalledWith("hello");
  });

  test("falls back to execCommand after a rejected async write", async () => {
    setBridge(async () => false);
    setNavigatorClipboard(async () => {
      throw new Error("denied");
    });
    document.execCommand = vi.fn(() => true);

    await writeClipboardText("fallback");

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    // The temporary textarea must not leak into the document.
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("rejects when no clipboard path is usable", async () => {
    setBridge(async () => false);
    setNavigatorClipboard(undefined);
    document.execCommand = vi.fn(() => false);

    await expect(writeClipboardText("nope")).rejects.toThrow("Clipboard is not available");
  });
});
