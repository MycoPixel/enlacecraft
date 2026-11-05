// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { embedCdxmlInSvg, extractCdxmlFromSvg } from "./svgMetadata";

const MINIMAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`;

const MINIMAL_CDXML = `<?xml version="1.0" encoding="utf-8"?><CDXML BondLength="30"><page><n id="1" p="1 1" Element="6"/></page></CDXML>`;

/** A CDXML whose attribute values exercise XML escaping (&, <, quotes). */
const HOSTILE_ATTR_CDXML = `<CDXML Name="a&amp;b<c&quot;d"><page><t p="1 1"><s>ñ &amp; &lt;test&gt;</s></t></page></CDXML>`;

describe("embedCdxmlInSvg", () => {
  test("inserts the metadata block before the svg close tag", () => {
    const out = embedCdxmlInSvg(MINIMAL_SVG, MINIMAL_CDXML);
    expect(out).toContain(`<metadata data-format="chemical/x-cdxml">`);
    expect(out.endsWith("</metadata></svg>")).toBe(true);
    // The payload must be escaped, not raw — a raw `<CDXML>` would break the SVG.
    expect(out).toContain("&lt;CDXML");
    expect(out).not.toContain("><CDXML");
  });

  test("replaces an existing block instead of accumulating copies", () => {
    const once = embedCdxmlInSvg(MINIMAL_SVG, MINIMAL_CDXML);
    const twice = embedCdxmlInSvg(once, MINIMAL_CDXML);
    expect(twice.match(/<metadata /g)).toHaveLength(1);
  });

  test("returns the payload unchanged for non-SVG text or oversized CDXML", () => {
    expect(embedCdxmlInSvg("not an svg", MINIMAL_CDXML)).toBe("not an svg");
    expect(embedCdxmlInSvg(MINIMAL_SVG, "")).toBe(MINIMAL_SVG);
    // Over LIMITS.maxFileChars (25 MB) — bounded work, not a perf test.
    expect(embedCdxmlInSvg(MINIMAL_SVG, "x".repeat(26 * 1024 * 1024))).toBe(MINIMAL_SVG);
  });
});

describe("extractCdxmlFromSvg", () => {
  test("round-trips a payload byte-faithfully, including escaped entities", () => {
    const out = embedCdxmlInSvg(MINIMAL_SVG, HOSTILE_ATTR_CDXML);
    expect(extractCdxmlFromSvg(out)).toBe(HOSTILE_ATTR_CDXML);
  });

  test("returns null for an SVG without metadata", () => {
    expect(extractCdxmlFromSvg(MINIMAL_SVG)).toBeNull();
  });

  test("returns null for metadata without the cdxml data-format", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><metadata id="x">hello</metadata></svg>`;
    expect(extractCdxmlFromSvg(svg)).toBeNull();
  });

  test("returns null for hostile inputs without throwing", () => {
    expect(extractCdxmlFromSvg("")).toBeNull();
    expect(extractCdxmlFromSvg("<<>> not xml")).toBeNull();
    expect(extractCdxmlFromSvg("<svg><metadata></metadata></svg>")).toBeNull();
    // A metadata block claiming cdxml but containing junk is skipped, not parsed.
    const junk = `<svg><metadata data-format="chemical/x-cdxml">not cdxml at all</metadata></svg>`;
    expect(extractCdxmlFromSvg(junk)).toBeNull();
  });

  test("survives an entity-expansion-style hostile document", () => {
    // A few hundred nested-ish entity definitions: DOMParser rejects or
    // ignores DTD entities in most cases; the requirement is only that this
    // returns null instead of hanging or throwing.
    const hostile = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa">]>
<svg xmlns="http://www.w3.org/2000/svg"><metadata data-format="chemical/x-cdxml">&a;&a;&a;</metadata></svg>`;
    expect(extractCdxmlFromSvg(hostile)).toBeNull();
  });
});
