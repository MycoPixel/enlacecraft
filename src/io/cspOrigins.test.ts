import { describe, it, expect } from "vitest";

/**
 * The Content-Security-Policy `connect-src` allowlist has to name every origin
 * the app fetches from. Missing an entry is invisible in `npm run dev` — the
 * CSP plugin is `apply: "build"` — and ships as "every request to that host
 * fails" in the released app.
 *
 * That is not hypothetical: MassBank was added to src/io without being added
 * to the CSP, and the symptom was a bare "Failed to fetch" that reads exactly
 * like being offline. This test derives the required origin list from the
 * source itself, so a future src/io client can't be added without also being
 * allowed by the CSP.
 */
const viteConfig = import.meta.glob("../../vite.config.ts", {
  query: "?raw",
  import: "default",
  eager: true,
})["../../vite.config.ts"] as string;

const ioFiles = import.meta.glob("./*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("CSP connect-src covers every origin used in src/io", () => {
  const connectSrc = /"connect-src ([^"]+)"/.exec(viteConfig)?.[1] ?? "";

  it("finds a connect-src directive to check", () => {
    expect(connectSrc).not.toBe("");
  });

  const origins = new Set<string>();
  for (const [path, raw] of Object.entries(ioFiles)) {
    // Tests contain example origins that are never actually requested.
    if (path.endsWith(".test.ts")) continue;

    // XML namespace URIs and DOCTYPE SYSTEM ids are identifiers, not network
    // targets — the browser never requests them, so they need no CSP entry.
    // Strip them before scanning or every SVG/DTD-emitting module becomes a
    // false positive (w3.org/2000/svg, cambridgesoft.com/.../cdxml.dtd).
    const network = raw
      .replace(/xmlns(:\w+)?\s*=\s*["'][^"']*["']/g, "")
      .replace(/setAttribute\(\s*["']xmlns[^"']*["']\s*,\s*["'][^"']*["']\s*\)/g, "")
      // A namespace constant (e.g. `const SVG_NS = "http://www.w3.org/..."`)
      // is passed to createElementNS, not fetched.
      .replace(/(?:const|let|var)\s+[A-Z_]*NS\s*=\s*["'][^"']*["']/g, "")
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      // Comments mention origins that aren't fetched.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    for (const m of network.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) {
      origins.add(m[0]);
    }
  }

  it("finds origins to check", () => {
    expect(origins.size).toBeGreaterThan(0);
  });

  for (const origin of [...origins].sort()) {
    it(`allows ${origin}`, () => {
      expect(connectSrc).toContain(origin);
    });
  }
});