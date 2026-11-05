import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const security = require("./security.cjs");
const { createProjectSaveTarget, validateSaveToRequest } = security;

describe("isSafeExternalUrl", () => {
  test.each([
    "https://github.com/MycoPixel/enlacecraft-releases/releases",
    "https://pubchem.ncbi.nlm.nih.gov/compound/241",
    "mailto:someone@example.com",
  ])("allows %s", (url) => expect(security.isSafeExternalUrl(url)).toBe(true));

  test.each([
    "file:///C:/Windows/System32/calc.exe",
    "file:///etc/passwd",
    "smb://attacker.example/share/x",
    "ms-msdt:/id PCWDiagnostic /skip force /param \"IT_RebrowseForFile=?\"",
    "search-ms:query=x&crumb=location:\\\\attacker\\share",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "http://example.com", // plain http is not forwarded
    "https://github.com@evil.example/", // credentials-in-URL phishing trick
    "https://user:pw@example.com/",
    "not a url",
    "",
    "https://" + "a".repeat(3000) + ".example",
  ])("refuses %s", (url) => expect(security.isSafeExternalUrl(url)).toBe(false));

  test("refuses non-strings", () => {
    for (const v of [null, undefined, 42, {}, ["https://example.com"]]) expect(security.isSafeExternalUrl(v)).toBe(false);
  });
});

describe("isShareToken", () => {
  test("accepts the two token prefixes this app writes", () => {
    expect(security.isShareToken("c.eJzNVE2L2zAQ")).toBe(true);
    expect(security.isShareToken("u.SGVsbG8td29ybGQ")).toBe(true);
  });

  test.each([
    ["missing prefix", "eJzNVE2L2zAQ"],
    ["unknown prefix", "x.eJzNVE2L2zAQ"],
    ["empty payload", "c."],
    ["whitespace", "c.eJz NVE2"],
    ["path characters", "c.../../../etc/passwd"],
    ["a query-looking token", "c.abc?x=1"],
    ["an over-long token", "c." + "A".repeat(security.MAX_SHARE_TOKEN_LENGTH)],
  ])("refuses %s", (_label, token) => expect(security.isShareToken(token)).toBe(false));

  test("refuses non-strings", () => {
    for (const v of [null, undefined, 42, {}, ["c.abc"]]) expect(security.isShareToken(v)).toBe(false);
  });
});

describe("createTrustedUrlChecker", () => {
  const distDir = path.resolve(os.tmpdir(), "enlacecraft-app", "dist");
  const fileUrl = (...parts) => pathToFileURL(path.join(distDir, ...parts)).href;

  test("packaged/preview: only files inside dist/ are trusted", () => {
    const trusted = security.createTrustedUrlChecker({ devServerUrl: undefined, distDir });
    expect(trusted(fileUrl("index.html"))).toBe(true);
    expect(trusted(fileUrl("assets", "app.js"))).toBe(true);
    expect(trusted(fileUrl("index.html") + "#/x?y=1")).toBe(true);
    expect(trusted(pathToFileURL(path.join(distDir, "..", "evil.html")).href)).toBe(false); // sibling of dist
    expect(trusted(pathToFileURL(path.join(distDir, "..", "dist-evil", "index.html")).href)).toBe(false); // same prefix, different dir
    expect(trusted(fileUrl("..", "..", "etc", "passwd"))).toBe(false); // traversal
    expect(trusted(pathToFileURL(distDir).href)).toBe(false); // dist itself
    expect(trusted("https://example.com/")).toBe(false);
    expect(trusted("http://localhost:5173/")).toBe(false);
    expect(trusted("about:blank")).toBe(false);
    expect(trusted("")).toBe(false);
    expect(trusted(undefined)).toBe(false);
    expect(trusted("::::")).toBe(false);
  });

  test("dev: only the dev-server origin is trusted (and no file: pages)", () => {
    const trusted = security.createTrustedUrlChecker({ devServerUrl: "http://localhost:5173", distDir });
    expect(trusted("http://localhost:5173/")).toBe(true);
    expect(trusted("http://localhost:5173/src/main.tsx?t=1")).toBe(true);
    expect(trusted("http://localhost:5174/")).toBe(false);
    expect(trusted("http://127.0.0.1:5173/")).toBe(false);
    expect(trusted("https://localhost:5173/")).toBe(false);
    expect(trusted("http://localhost:5173.evil.example/")).toBe(false);
    expect(trusted(fileUrl("index.html"))).toBe(false);
  });

  test("a malformed dev URL trusts nothing rather than everything", () => {
    const trusted = security.createTrustedUrlChecker({ devServerUrl: "not a url", distDir });
    expect(trusted("http://localhost:5173/")).toBe(false);
    expect(trusted(fileUrl("index.html"))).toBe(false);
  });
});

describe("isTrustedSender", () => {
  const trusted = (u) => u === "file:///app/dist/index.html";
  test("accepts the top-level frame of a trusted page", () => {
    expect(security.isTrustedSender({ senderFrame: { url: "file:///app/dist/index.html", parent: null } }, trusted)).toBe(true);
  });
  test("rejects sub-frames, untrusted URLs, and missing frames", () => {
    expect(security.isTrustedSender({ senderFrame: { url: "file:///app/dist/index.html", parent: {} } }, trusted)).toBe(false);
    expect(security.isTrustedSender({ senderFrame: { url: "https://evil.example/", parent: null } }, trusted)).toBe(false);
    expect(security.isTrustedSender({ senderFrame: null }, trusted)).toBe(false);
    expect(security.isTrustedSender({}, trusted)).toBe(false);
    expect(security.isTrustedSender(undefined, trusted)).toBe(false);
  });
});

describe("permission handlers", () => {
  const trusted = (u) => u === "file:///app/dist/index.html";
  const h = security.createPermissionHandlers(trusted);
  const ok = { requestingUrl: "file:///app/dist/index.html" };
  const bad = { requestingUrl: "https://evil.example/" };
  const wc = { getURL: () => "file:///app/dist/index.html" };
  const ask = (perm, details) => {
    let result;
    h.request(wc, perm, (v) => (result = v), details);
    return result;
  };

  test("clipboard read/write allowed for our pages only", () => {
    expect(ask("clipboard-read", ok)).toBe(true);
    expect(ask("clipboard-sanitized-write", ok)).toBe(true);
    expect(ask("clipboard-read", bad)).toBe(false);
    expect(h.check(wc, "clipboard-read", "file://", ok)).toBe(true);
    expect(h.check(wc, "clipboard-read", "https://evil.example", bad)).toBe(false);
  });

  test.each(["media", "geolocation", "notifications", "midi", "openExternal", "fullscreen", "pointerLock", "display-capture", "hid", "serial", "usb"])(
    "%s is always denied",
    (perm) => {
      expect(ask(perm, ok)).toBe(false);
      expect(h.check(wc, perm, "file://", ok)).toBe(false);
    },
  );

  test("falls back to the webContents URL when details are missing", () => {
    expect(ask("clipboard-read", undefined)).toBe(true);
  });
});

describe("save/open helpers", () => {
  test("sanitizeSaveName strips paths and reserved characters and forces the extension", () => {
    expect(security.sanitizeSaveName("molecule.enlacecraft")).toBe("molecule.enlacecraft");
    expect(security.sanitizeSaveName("Aspirin.ENLACECRAFT")).toBe("Aspirin.ENLACECRAFT");
    expect(security.sanitizeSaveName("../../Windows/System32/evil.exe")).toBe("evil.exe.enlacecraft");
    expect(security.sanitizeSaveName("C:\\Users\\me\\..\\x")).toBe("x.enlacecraft");
    expect(security.sanitizeSaveName('a<b>c:d"e|f?g*h')).toBe("a_b_c_d_e_f_g_h.enlacecraft");
    expect(security.sanitizeSaveName("  ..  ")).toBe("molecule.enlacecraft");
    expect(security.sanitizeSaveName("")).toBe("molecule.enlacecraft");
    expect(security.sanitizeSaveName(undefined)).toBe("molecule.enlacecraft");
    expect(security.sanitizeSaveName({ toString: () => "x" })).toBe("molecule.enlacecraft");
    expect(security.sanitizeSaveName("x".repeat(500)).length).toBeLessThanOrEqual(100 + ".enlacecraft".length);
    expect(security.sanitizeSaveName("nul\u0000byte")).not.toContain("\u0000");
  });

  test("ensureProjectExtension", () => {
    expect(security.ensureProjectExtension("/tmp/x")).toBe("/tmp/x.enlacecraft");
    expect(security.ensureProjectExtension("/tmp/x.enlacecraft")).toBe("/tmp/x.enlacecraft");
    expect(security.ensureProjectExtension("/tmp/x.ENLACECRAFT")).toBe("/tmp/x.ENLACECRAFT");
  });

  test("validateSaveRequest", () => {
    expect(security.validateSaveRequest({ defaultName: "a", content: "{}" })).toEqual({ ok: true, defaultName: "a.enlacecraft", content: "{}" });
    for (const bad of [undefined, null, "str", 5, {}, { content: 5 }, { content: null }, { content: {} }]) {
      expect(security.validateSaveRequest(bad).ok).toBe(false);
    }
    const tooBig = "x".repeat(security.MAX_FILE_BYTES + 1);
    expect(security.validateSaveRequest({ content: tooBig }).ok).toBe(false);
  });

  test("size limit counts bytes, not characters", () => {
    const multibyte = "é".repeat(Math.floor(security.MAX_FILE_BYTES / 2) + 10); // 2 bytes each -> over the cap
    expect(security.validateSaveRequest({ content: multibyte }).ok).toBe(false);
  });

  test("isOpenableFile", () => {
    for (const f of ["a.enlacecraft", "a.MOL", "b.cdxml", "/x/y/z.CDXML"]) expect(security.isOpenableFile(f)).toBe(true);
    for (const f of ["a.exe", "a.txt", "a", "a.enlacecraft.exe", "", "a.js"]) expect(security.isOpenableFile(f)).toBe(false);
  });
});

describe("file IO helpers (real temp dir)", () => {
  let dir;
  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "enlacecraft-sec-"));
  });
  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  test("writeFileAtomic writes, replaces, and leaves no temp files", async () => {
    const target = path.join(dir, "p.enlacecraft");
    await security.writeFileAtomic(fsp, target, "one");
    await security.writeFileAtomic(fsp, target, "two");
    expect(await fsp.readFile(target, "utf-8")).toBe("two");
    expect(await fsp.readdir(dir)).toEqual(["p.enlacecraft"]);
  });

  test("a failed write leaves the previous file untouched and cleans up", async () => {
    const target = path.join(dir, "p.enlacecraft");
    await fsp.writeFile(target, "precious");
    const failing = { ...fsp, writeFile: async () => { throw new Error("disk full"); } };
    await expect(security.writeFileAtomic(failing, target, "new")).rejects.toThrow("disk full");
    expect(await fsp.readFile(target, "utf-8")).toBe("precious");
    expect(await fsp.readdir(dir)).toEqual(["p.enlacecraft"]);
  });

  test("falls back to a direct write when rename is refused (EPERM)", async () => {
    const target = path.join(dir, "p.enlacecraft");
    await fsp.writeFile(target, "old");
    const eperm = { ...fsp, rename: async () => { throw Object.assign(new Error("locked"), { code: "EPERM" }); } };
    await security.writeFileAtomic(eperm, target, "new");
    expect(await fsp.readFile(target, "utf-8")).toBe("new");
    expect(await fsp.readdir(dir)).toEqual(["p.enlacecraft"]);
  });

  test("readOpenableFile enforces type and size, and returns the file name", async () => {
    const ok = path.join(dir, "a.mol");
    await fsp.writeFile(ok, "hello");
    expect(await security.readOpenableFile(fsp, ok)).toEqual({ fileName: "a.mol", content: "hello" });

    const sdf = path.join(dir, "library.sdf");
    await fsp.writeFile(sdf, "$$$$");
    expect(await security.readOpenableFile(fsp, sdf)).toEqual({ fileName: "library.sdf", content: "$$$$" });

    const exe = path.join(dir, "a.exe");
    await fsp.writeFile(exe, "x");
    await expect(security.readOpenableFile(fsp, exe)).rejects.toThrow(/unsupported/i);

    const dirLike = path.join(dir, "folder.mol");
    await fsp.mkdir(dirLike);
    await expect(security.readOpenableFile(fsp, dirLike)).rejects.toThrow(/regular file/i);

    const big = path.join(dir, "big.cdxml");
    await fsp.writeFile(big, "");
    await fsp.truncate(big, security.MAX_FILE_BYTES + 1); // sparse: no real 25 MB written
    await expect(security.readOpenableFile(fsp, big)).rejects.toThrow(/too large/i);
  });

  test("rotateLogIfNeeded moves an oversized log aside and ignores a missing one", async () => {
    const log = path.join(dir, "app.log");
    security.rotateLogIfNeeded(fs, log); // missing: must not throw
    await fsp.writeFile(log, "x".repeat(2000));
    security.rotateLogIfNeeded(fs, log, 1000);
    expect((await fsp.readdir(dir)).sort()).toEqual(["app.old.log"]);
    await fsp.writeFile(log, "small");
    security.rotateLogIfNeeded(fs, log, 1000);
    expect((await fsp.readdir(dir)).sort()).toEqual(["app.log", "app.old.log"]);
  });
});

describe("createProjectSaveTarget", () => {
  test("starts with no destination, so a first Save falls back to Save As", () => {
    expect(createProjectSaveTarget().get()).toBeNull();
  });

  test("remembers a path the user chose, and returns it for later Saves", () => {
    const t = createProjectSaveTarget();
    t.remember("/home/u/notes/molecule.enlacecraft");
    expect(t.get()).toBe("/home/u/notes/molecule.enlacecraft");
  });

  test("ignores non-.enlacecraft paths so a plain Save can never clobber one", () => {
    // Opening a .mol and pressing Save must not overwrite that .mol: it is a
    // different format and writing a project over it would destroy it.
    const t = createProjectSaveTarget();
    t.remember("/home/u/notes/important.mol");
    expect(t.get()).toBeNull();
    t.remember("/home/u/notes/chem.drawing.cdxml");
    expect(t.get()).toBeNull();
  });

  test("is case-insensitive about the extension", () => {
    const t = createProjectSaveTarget();
    t.remember("/home/u/Molecule.ENLACECRAFT");
    expect(t.get()).toBe("/home/u/Molecule.ENLACECRAFT");
  });

  test("ignores non-strings rather than storing them", () => {
    const t = createProjectSaveTarget();
    t.remember(123);
    t.remember(null);
    t.remember(undefined);
    t.remember({ toString: () => "/evil/path.enlacecraft" });
    expect(t.get()).toBeNull();
  });

  test("a later remember replaces the earlier one, as Save As should", () => {
    const t = createProjectSaveTarget();
    t.remember("/a/one.enlacecraft");
    t.remember("/b/two.enlacecraft");
    expect(t.get()).toBe("/b/two.enlacecraft");
  });

  test("clear() forgets the destination", () => {
    const t = createProjectSaveTarget();
    t.remember("/a/one.enlacecraft");
    t.clear();
    expect(t.get()).toBeNull();
  });

  test("targets are independent instances, so no state leaks between them", () => {
    const a = createProjectSaveTarget();
    const b = createProjectSaveTarget();
    a.remember("/a/one.enlacecraft");
    expect(b.get()).toBeNull();
  });
});

describe("validateSaveToRequest", () => {
  test("accepts a string payload", () => {
    expect(validateSaveToRequest({ content: "{}" }).ok).toBe(true);
  });

  test("rejects a missing or non-string body", () => {
    expect(validateSaveToRequest({}).ok).toBe(false);
    expect(validateSaveToRequest({ content: 42 }).ok).toBe(false);
    expect(validateSaveToRequest(null).ok).toBe(false);
  });

  test("enforces the same size limit as the dialog-based save", () => {
    const big = "x".repeat(26 * 1024 * 1024);
    expect(validateSaveToRequest({ content: big }).ok).toBe(false);
  });

  test("does not accept a renderer-supplied path at all", () => {
    // The whole point of the capability design: the main process ignores
    // whatever path arrives in the payload and uses its own record. A test
    // that passes today must keep passing if someone later "helpfully"
    // starts honouring this field.
    const result = validateSaveToRequest({ content: "{}", filePath: "/etc/passwd" });
    expect(result.ok).toBe(true);
    expect("filePath" in result).toBe(false);
  });
});
