// @ts-expect-error - node:fs has no types here because tsconfig.json is a
// BROWSER project config: @types/node is deliberately out of `types` so that
// nothing in src/ can accidentally reach for a Node API. This is a test-only
// read of a stylesheet, which runs fine, and pulling Node into the app's
// global types for it would be a much worse trade.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * Text colour on the IR feature's portaled surfaces.
 *
 * `color: var(--ink)` is declared once, on `.app`. Both the top-bar dropdown
 * and the full-screen report are portaled to `document.body`, which is OUTSIDE
 * `.app` — so they inherit nothing, and every element that doesn't set its own
 * colour falls back to the browser default: black. On the dark and navy themes
 * that is black on a near-black panel.
 *
 * It only surfaces on elements that don't set a colour themselves, which is
 * exactly why it survived: most of this feature's text sets `--ink-soft`
 * explicitly, so only two things went black — the dropdown's own heading, and
 * the bold band labels in the report.
 *
 * jsdom applies no stylesheet, so this asserts on the rule rather than on a
 * computed style. That is the right level: the property has to be present on
 * the portal root, and that is a fact about the CSS, not about a render.
 *
 * (`import.meta.glob(..., "?raw")`, which cspOrigins.test.ts uses, returns an
 * empty string for a stylesheet — Vite's CSS transform swallows it. Hence the
 * direct read.)
 */

const css = readFileSync("src/styles/app.css", "utf8");

/** The declaration block for a top-level rule.
 *
 *  Handles both the multi-line form and the single-line `sel { a: b; }` form —
 *  searching for the next `\n}` alone would run straight past a one-line rule
 *  and pick up whatever happened to follow it. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);
  const lineEnd = css.indexOf("\n", start + 1);
  const firstLine = css.slice(start, lineEnd);
  if (firstLine.trimEnd().endsWith("}")) return firstLine;
  return css.slice(start, css.indexOf("\n}", lineEnd));
}

describe("portaled IR surfaces declare their own text colour", () => {
  test("the dropdown does, since it is portaled out of .app", () => {
    expect(rule(".ir-dropdown")).toMatch(/color:\s*var\(--ink\)/);
  });

  test("the full-screen report dialog does too", () => {
    expect(rule(".ir-report-dialog")).toMatch(/color:\s*var\(--ink\)/);
  });

  test("the band labels that went black rely on that default, having none of their own", () => {
    // The label is the bold, primary text, so it should take the dialog's ink
    // rather than --ink-soft. Setting nothing here is deliberate: it is what
    // makes the dialog's declaration load-bearing.
    expect(rule(".ir-report-bands__label")).not.toMatch(/color:/);
  });

  test("secondary text still names --ink-soft explicitly", () => {
    // So the fix is a floor, not a replacement: muted text stays muted.
    expect(rule(".ir-report-bands__range")).toMatch(/color:\s*var\(--ink-soft\)/);
  });
});