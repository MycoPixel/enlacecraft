// @vitest-environment jsdom
//
// sanitizeAnnotationHtml runs DOMPurify, which needs a real DOM (window/
// document) to sanitize against — see cdxml.test.ts for the same override,
// used for the same reason (a browser-only API under plain Node).
import { describe, expect, test } from "vitest";
import { sanitizeAnnotationHtml, sanitizeAnnotation, sanitizeAnnotationsRecord, sanitizeAnnotationList } from "./sanitizeHtml";
import type { ArrowAnnotation, TextAnnotation } from "../types/chemistry";

function textAnnotation(html: string): TextAnnotation {
  return { id: "t1", kind: "text", x: 0, y: 0, width: 100, height: 20, html, fontSize: 14 };
}

describe("sanitizeAnnotationHtml", () => {
  test("keeps the formatting the annotation toolbar actually produces", () => {
    const html = '<b>bold</b> <i>italic</i> <sub>2</sub><sup>+</sup> <span style="font-size: 18px">big</span>';
    expect(sanitizeAnnotationHtml(html)).toBe(html);
  });

  test("keeps the default '+' reaction-scheme annotation", () => {
    expect(sanitizeAnnotationHtml("<b>+</b>")).toBe("<b>+</b>");
  });

  test("strips a script tag entirely", () => {
    const out = sanitizeAnnotationHtml('<script>alert(1)</script>hello');
    expect(out).not.toContain("<script");
    expect(out).toContain("hello");
  });

  test("strips an img onerror handler (the realistic stored-XSS payload)", () => {
    const out = sanitizeAnnotationHtml('<img src="x" onerror="alert(document.cookie)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<img");
  });

  test("strips an iframe/javascript: URL", () => {
    const out = sanitizeAnnotationHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  test("strips disallowed attributes (onclick, class, id) but keeps the tag/text", () => {
    const out = sanitizeAnnotationHtml('<b onclick="evil()" class="x" id="y">ok</b>');
    expect(out).toBe("<b>ok</b>");
  });

  test("strips CSS-based injection inside a style attribute", () => {
    const out = sanitizeAnnotationHtml('<span style="background:url(javascript:alert(1))">x</span>');
    expect(out).not.toContain("javascript:");
  });

  test("non-string input never throws", () => {
    // @ts-expect-error deliberately testing malformed input from an
    // untrusted file (e.g. html: 123 or html: null in a hand-edited JSON)
    expect(sanitizeAnnotationHtml(null)).toBe("");
    // @ts-expect-error same as above
    expect(sanitizeAnnotationHtml(undefined)).toBe("");
  });
});

describe("sanitizeAnnotation / sanitizeAnnotationsRecord / sanitizeAnnotationList", () => {
  test("sanitizeAnnotation only touches text annotations", () => {
    const arrow: ArrowAnnotation = { id: "a1", kind: "arrow", variant: "forward", barb: "full", x1: 0, y1: 0, x2: 1, y2: 1, headSize: "medium" };
    expect(sanitizeAnnotation(arrow)).toEqual(arrow);

    const text = textAnnotation('<img src=x onerror="alert(1)">');
    const cleaned = sanitizeAnnotation(text);
    expect(cleaned.html).not.toContain("onerror");
    expect(cleaned).not.toBe(text); // returns a new object, doesn't mutate
  });

  test("sanitizeAnnotationsRecord cleans every text annotation in a project file's tab", () => {
    const record = {
      t1: textAnnotation('<img src=x onerror="alert(1)">'),
      a1: { id: "a1", kind: "arrow", variant: "forward", barb: "full", x1: 0, y1: 0, x2: 1, y2: 1, headSize: "medium" } as ArrowAnnotation,
    };
    const cleaned = sanitizeAnnotationsRecord(record);
    expect((cleaned.t1 as TextAnnotation).html).not.toContain("onerror");
    expect(cleaned.a1).toEqual(record.a1);
  });

  test("sanitizeAnnotationList cleans every text annotation in a clipboard fragment", () => {
    const list = [textAnnotation('<svg onload="alert(1)"></svg>'), textAnnotation("<b>fine</b>")];
    const cleaned = sanitizeAnnotationList(list);
    expect((cleaned[0] as TextAnnotation).html).not.toContain("onload");
    expect((cleaned[1] as TextAnnotation).html).toBe("<b>fine</b>");
  });
});
