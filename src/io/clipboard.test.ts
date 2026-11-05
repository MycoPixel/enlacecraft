// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { writeClipboardText, writeClipboardPayload, CLIPBOARD_FRAGMENT_FORMAT } from "./clipboard";

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

/** Minimal ClipboardItem stand-in — jsdom doesn't provide the real one.
 * Matches the surface writeClipboardPayload uses: constructor with a
 * representations record, `types`, and getType(). */
class FakeClipboardItem {
  private entries: Record<string, Blob | Promise<Blob>>;
  constructor(entries: Record<string, Blob | Promise<Blob>>) {
    this.entries = entries;
  }
  get types(): string[] {
    return Object.keys(this.entries);
  }
  getType(type: string): Promise<Blob> {
    const entry = this.entries[type];
    if (!entry) return Promise.reject(new Error(`no representation: ${type}`));
    return Promise.resolve(entry);
  }
}

const originalClipboardItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;

/** Installs a fake async Clipboard API (write + ClipboardItem) for the rich
 * payload tests, returning the spies. */
function setRichClipboard() {
  (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeClipboardItem;
  const written: { types: string[]; item: FakeClipboardItem }[] = [];
  const write = vi.fn(async (items: FakeClipboardItem[]) => {
    for (const item of items) written.push({ types: [...item.types], item });
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { write, writeText: vi.fn(async () => {}) },
    configurable: true,
  });
  return { write, written };
}

describe("writeClipboardPayload", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = originalClipboardItem;
  });

  test("writes every requested representation through one ClipboardItem", async () => {
    const { write, written } = setRichClipboard();
    const png = new Blob(["png"], { type: "image/png" });

    const result = await writeClipboardPayload({ png, svg: "<svg/>", cdxml: "<CDXML/>", json: "{}" });

    expect(result).toBe("web-rich");
    expect(write).toHaveBeenCalledTimes(1);
    const types = written[0].types.sort();
    expect(types).toEqual(["image/png", "text/html", "text/plain", CLIPBOARD_FRAGMENT_FORMAT].sort());
  });

  test("the HTML flavor carries the SVG as a data-URI img, not live markup", async () => {
    const { written } = setRichClipboard();
    await writeClipboardPayload({ svg: `<svg><script>alert(1)</script></svg>`, text: "fallback" });
    const item = written[0].item;
    const html = await item.getType("text/html").then((b) => b.text());
    expect(html).toContain(`<img `);
    expect(html).toContain(`src="data:image/svg+xml;base64,`);
    // The script tag survives only inside the inert base64 payload — it is
    // never emitted as an HTML element of its own.
    expect(html.trim().startsWith("<img")).toBe(true);
  });

  test("text/plain defaults to cdxml → molfile → smiles", async () => {
    const { written } = setRichClipboard();
    await writeClipboardPayload({ cdxml: "<CDXML/>", molfile: "MOL", smiles: "CCO" });
    const text = await written[0].item.getType("text/plain").then((b) => b.text());
    expect(text).toBe("<CDXML/>");

    await writeClipboardPayload({ molfile: "MOL", smiles: "CCO" });
    expect(await written[1].item.getType("text/plain").then((b) => b.text())).toBe("MOL");

    await writeClipboardPayload({ smiles: "CCO" });
    expect(await written[2].item.getType("text/plain").then((b) => b.text())).toBe("CCO");
  });

  test("falls back to PNG-only when the rich write rejects", async () => {
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeClipboardItem;
    const write = vi
      .fn<(items: FakeClipboardItem[]) => Promise<void>>()
      .mockRejectedValueOnce(new DOMException("bad type", "NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
    const png = new Blob(["png"], { type: "image/png" });

    const result = await writeClipboardPayload({ png, text: "x" });

    expect(result).toBe("png");
    expect(write).toHaveBeenCalledTimes(2);
  });

  test("falls back to plain text when no ClipboardItem path works", async () => {
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeClipboardItem;
    const write = vi.fn(async () => { throw new Error("denied"); });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { write, writeText }, configurable: true });

    const result = await writeClipboardPayload({ cdxml: "<CDXML/>" });

    expect(result).toBe("text");
    expect(writeText).toHaveBeenCalledWith("<CDXML/>");
  });

  test("throws when there is nothing at all to write", async () => {
    setRichClipboard();
    await expect(writeClipboardPayload({})).rejects.toThrow("Clipboard is not available");
  });

  test("prefers the Electron rich bridge when present", async () => {
    const rich = vi.fn(async (_payload: { text?: string; html?: string; png?: Uint8Array }) => true);
    Object.defineProperty(window, "electron", {
      value: { writeClipboardText: vi.fn(), writeClipboardRich: rich },
      configurable: true,
      writable: true,
    });
    const { write } = setRichClipboard();
    const png = new Blob(["png"], { type: "image/png" });

    const result = await writeClipboardPayload({ png, text: "CCO" });

    expect(result).toBe("electron-rich");
    const arg = rich.mock.calls[0][0];
    expect(arg.text).toBe("CCO");
    expect(arg.png?.[0]).toBe("p".charCodeAt(0));
    expect(write).not.toHaveBeenCalled();
  });

  test("the electron-rich write carries text, HTML and PNG together — the desktop copy must land as a picture AND editable text", async () => {
    // Regression: a canvas copy used to write text alone through this
    // bridge (no png/svg in the payload), so pasting outside the app
    // found nothing picture-shaped. All three flavors must ride along.
    const rich = vi.fn(async (_payload: { text?: string; html?: string; png?: Uint8Array }) => true);
    Object.defineProperty(window, "electron", {
      value: { writeClipboardText: vi.fn(), writeClipboardRich: rich },
      configurable: true,
      writable: true,
    });
    const { write } = setRichClipboard();
    const png = new Blob(["png-bytes"], { type: "image/png" });

    const result = await writeClipboardPayload({ png, svg: "<svg><g/></svg>", cdxml: "<CDXML/>" });

    expect(result).toBe("electron-rich");
    const arg = rich.mock.calls[0][0];
    expect(arg.text).toBe("<CDXML/>");
    // The HTML flavor prefers the PNG data URI: Office's HTML importer
    // renders a base64 PNG reliably, while an SVG data URI pastes as an
    // empty frame in Word 2016/2019 ("copy to Word did nothing").
    expect(arg.html).toContain("data:image/png;base64,");
    expect(arg.html).not.toContain("data:image/svg+xml");
    expect(arg.html).toContain(`base64,${btoa("png-bytes")}`);
    expect(new TextDecoder().decode(arg.png!)).toBe("png-bytes");
    expect(write).not.toHaveBeenCalled();
  });

  test("the web-path HTML flavor also prefers the PNG data URI over the SVG one", async () => {
    const { written } = setRichClipboard();
    const png = new Blob(["png-bytes"], { type: "image/png" });

    await writeClipboardPayload({ png, svg: "<svg><g/></svg>", text: "x" });

    const html = await written[0].item.getType("text/html").then((b) => b.text());
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain(`base64,${btoa("png-bytes")}`);
    expect(html).not.toContain("data:image/svg+xml");
  });

  test("with no PNG in the payload the HTML flavor falls back to the SVG data URI", async () => {
    const { written } = setRichClipboard();
    await writeClipboardPayload({ svg: "<svg><g/></svg>", text: "x" });
    const html = await written[0].item.getType("text/html").then((b) => b.text());
    expect(html).toContain("data:image/svg+xml;base64,");
  });

  test("a PNG whose bytes cannot be read degrades to the SVG HTML flavor instead of failing the copy", async () => {
    const rich = vi.fn(async (_payload: { text?: string; html?: string; png?: Uint8Array }) => true);
    Object.defineProperty(window, "electron", {
      value: { writeClipboardText: vi.fn(), writeClipboardRich: rich },
      configurable: true,
      writable: true,
    });
    setRichClipboard();
    // A blob that lies about being a stream: arrayBuffer() rejects.
    const brokenPng = {
      type: "image/png",
      arrayBuffer: () => Promise.reject(new Error("stream dead")),
    } as unknown as Blob;

    const result = await writeClipboardPayload({ png: brokenPng, svg: "<svg/>", text: "x" });

    expect(result).toBe("electron-rich");
    const arg = rich.mock.calls[0][0];
    expect(arg.png).toBeUndefined();
    expect(arg.html).toContain("data:image/svg+xml;base64,");
  });
});
