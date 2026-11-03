import { describe, expect, test } from "vitest";
import { buildHtmlViewer } from "./htmlViewer";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

describe("standalone HTML viewer", () => {
  test("embeds the exported SVG verbatim", () => {
    const html = buildHtmlViewer(SVG, { title: "Ethanol" });
    expect(html).toContain(SVG);
    expect(html).toContain("<title>Ethanol</title>");
    expect(html).toContain('role="img"');
  });

  test("has no external stylesheets, scripts or font requests", () => {
    const html = buildHtmlViewer(SVG, { title: "Ethanol" });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/@import/i);
    // The SVG's own namespace declaration is the only URL it may contain.
    expect(html.match(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/g)).toBeNull();
  });

  test("escapes caller-supplied title and language", () => {
    const html = buildHtmlViewer(SVG, {
      title: '"><script>alert(1)</script>',
      lang: 'en" onload="x',
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('lang="en&quot; onload=&quot;x"');
  });

  test("falls back to white for an unusable background value", () => {
    const html = buildHtmlViewer(SVG, { title: "x", background: "red;}</style><script>alert(1)</script>" });
    expect(html).toContain("background: #ffffff;");
    expect(html).not.toContain("alert(1)");
  });

  test("keeps a valid theme background", () => {
    expect(buildHtmlViewer(SVG, { title: "x", background: "#17191e" })).toContain("background: #17191e;");
  });

  test("uses EnlaceCraft when the title is blank", () => {
    expect(buildHtmlViewer(SVG, { title: "   " })).toContain("<title>EnlaceCraft</title>");
  });
});
