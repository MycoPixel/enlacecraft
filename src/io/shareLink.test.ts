// @vitest-environment jsdom
//
// jsdom for the same reason project.test.ts needs it: decoding goes through
// importProject(), which sanitizes annotation HTML with DOMPurify.
import { afterEach, describe, expect, test, vi } from "vitest";
import { emptyMolecule } from "../model/molecule";
import type { ProjectFile } from "./project";
import {
  MAX_SHARE_TOKEN_LENGTH,
  ShareLinkError,
  buildShareUrl,
  createEmbedCodeForTab,
  decodeShareProject,
  encodeShareProject,
  projectForShareTab,
  readShareTokenFromLocation,
} from "./shareLink";

function sampleProject(): ProjectFile {
  const molecule = emptyMolecule();
  molecule.atoms.a1 = { id: "a1", x: 0, y: 0, element: "C", charge: 0 };
  molecule.atoms.a2 = { id: "a2", x: 1.5, y: 0, element: "O", charge: 0 };
  molecule.bonds.b1 = {
    id: "b1",
    a1: "a1",
    a2: "a2",
    order: 1,
    stereo: "none",
    doubleSide: "center",
  };
  return {
    version: 2,
    activeTabId: "tab-1",
    tabs: [
      {
        id: "tab-1",
        title: "Ethanol-ish",
        molecule,
        annotations: {},
        view: { scale: 1.25, tx: 12, ty: -4 },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("share token round-trip", () => {
  test("decodes to the same active tab, title, atoms and view", async () => {
    const token = await encodeShareProject(sampleProject());
    const decoded = await decodeShareProject(token);

    expect(decoded.activeTabId).toBe("tab-1");
    expect(decoded.tabs).toHaveLength(1);
    expect(decoded.tabs[0].title).toBe("Ethanol-ish");
    expect(decoded.tabs[0].molecule.atoms.a1.element).toBe("C");
    expect(decoded.tabs[0].molecule.bonds.b1.order).toBe(1);
    expect(decoded.tabs[0].view).toEqual({ scale: 1.25, tx: 12, ty: -4 });
  });

  test("uses the compressed prefix when the platform streams are available", async () => {
    const token = await encodeShareProject(sampleProject());
    expect(token.startsWith("c.")).toBe(true);
    await expect(decodeShareProject(token)).resolves.toMatchObject({ activeTabId: "tab-1" });
  });

  test("falls back to an uncompressed token when CompressionStream is missing", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const token = await encodeShareProject(sampleProject());
    expect(token.startsWith("u.")).toBe(true);
    await expect(decodeShareProject(token)).resolves.toMatchObject({ activeTabId: "tab-1" });
  });

  test("refuses a token larger than the share limit", async () => {
    // Uncompressed, so the length check sees the raw payload; a repetitive
    // title would otherwise compress to almost nothing.
    vi.stubGlobal("CompressionStream", undefined);
    const huge = sampleProject();
    huge.tabs[0].title = "x".repeat(MAX_SHARE_TOKEN_LENGTH);
    await expect(encodeShareProject(huge)).rejects.toMatchObject({ code: "too-large" });
  });

  test("rejects malformed and over-long tokens with typed errors", async () => {
    await expect(decodeShareProject("")).rejects.toBeInstanceOf(ShareLinkError);
    await expect(decodeShareProject("nope")).rejects.toMatchObject({ code: "invalid" });
    await expect(decodeShareProject("c.***")).rejects.toMatchObject({ code: "invalid" });
    await expect(decodeShareProject(`u.${"A".repeat(MAX_SHARE_TOKEN_LENGTH + 1)}`)).rejects.toMatchObject({
      code: "too-large",
    });
  });

  test("rejects compressed data when the browser cannot inflate it", async () => {
    const token = await encodeShareProject(sampleProject());
    vi.stubGlobal("DecompressionStream", undefined);
    await expect(decodeShareProject(token)).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("share URL handling", () => {
  test("reads only a #view= fragment", () => {
    expect(readShareTokenFromLocation("#view=abc")).toBe("abc");
    expect(readShareTokenFromLocation("#view=")).toBeNull();
    expect(readShareTokenFromLocation("#other=abc")).toBeNull();
    expect(readShareTokenFromLocation("")).toBeNull();
  });

  test("replaces any existing hash but preserves query parameters", () => {
    expect(buildShareUrl("abc", "https://example.test/app/?embed=1#old")).toBe(
      "https://example.test/app/?embed=1#view=abc",
    );
  });

  test("explains why file:// URLs cannot be shared", () => {
    expect(() => buildShareUrl("abc", "file:///opt/enlacecraft/index.html")).toThrow(
      expect.objectContaining({ code: "not-web" }),
    );
  });

  test("one-tab project keeps only the tab being shared", () => {
    const project = sampleProject();
    const second = { ...project.tabs[0], id: "tab-2", title: "Second" };
    const shared = projectForShareTab(second);
    expect(shared.activeTabId).toBe("tab-2");
    expect(shared.tabs.map((tb) => tb.id)).toEqual(["tab-2"]);
  });
});

describe("embed code", () => {
  test("points at the share URL with embed=1 and escapes the title", async () => {
    const tab = sampleProject().tabs[0];
    const code = await createEmbedCodeForTab(tab, "https://example.test/app/", 'A "quoted" <title>');
    expect(code).toContain('src="https://example.test/app/?embed=1#view=');
    expect(code).toContain('title="A &quot;quoted&quot; &lt;title&gt;"');
    expect(code).toContain('width="720"');
  });
});
