/**
 * Chemical-formula digit formatting shared by the reaction builder and by
 * ordinary text annotations.
 *
 * A digit run becomes a subscript only when it directly follows a letter or a
 * closing bracket: `H2SO4` -> H₂SO₄, `C12H22O11`, `Et3N`, `NaBH4`. Quantities,
 * ratios, temperatures and charges are deliberately left alone — `3 h`,
 * `24 h`, `1:1`, `80 °C`, `pH 7.4`, `Fe3+`, `SO4-`.
 */

export interface FormulaSegment {
  text: string;
  /** Rendered as <sub>…</sub> — a digit run inside a chemical formula. */
  sub: boolean;
}

export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function isFormulaLead(ch: string): boolean {
  return /[A-Za-z]/.test(ch) || ch === ")" || ch === "]" || ch === "}";
}

function isChargeSign(ch: string | null): boolean {
  return ch === "+" || ch === "-" || ch === "−" || ch === "–";
}

/**
 * Splits plain text into normal and formula-subscript runs.
 *
 * `sub` segments are still plain text in `text`; the HTML formatter escapes
 * and wraps them. Keeping the split separate from the markup also lets the
 * reaction builder's width measurement use the smaller subscript font.
 */
export function formulaSegments(text: string): FormulaSegment[] {
  const segments: FormulaSegment[] = [];
  let plain = "";
  let i = 0;

  const flushPlain = () => {
    if (plain) {
      segments.push({ text: plain, sub: false });
      plain = "";
    }
  };

  while (i < text.length) {
    const ch = text[i];
    if (!isFormulaLead(ch)) {
      plain += ch;
      i += 1;
      continue;
    }

    flushPlain();
    segments.push({ text: ch, sub: false });
    i += 1;

    const start = i;
    while (i < text.length && /[0-9]/.test(text[i])) i += 1;
    if (i === start) continue;

    const digits = text.slice(start, i);
    const isCharge = isChargeSign(text[i] ?? null);
    segments.push({ text: digits, sub: !isCharge });
  }
  flushPlain();
  return segments;
}

/** HTML for plain text, with chemical-formula digits subscripted. */
export function formatFormulaHtml(text: string): string {
  return formulaSegments(text)
    .map((segment) => (segment.sub ? `<sub>${escapeHtmlText(segment.text)}</sub>` : escapeHtmlText(segment.text)))
    .join("");
}

/** The next visible character after `html[start]`, skipping tags but not
 * whitespace — used to tell a formula digit run from a trailing charge even
 * when the sign sits in its own tag (`Fe3<b>+</b>`). */
function peekVisibleChar(html: string, start: number): string | null {
  let i = start;
  while (i < html.length) {
    if (html[i] === "<") {
      const close = html.indexOf(">", i);
      if (close === -1) return null;
      i = close + 1;
      continue;
    }
    if (html[i] === "&") {
      const semi = html.indexOf(";", i);
      if (semi !== -1) {
        const entity = html.slice(i, semi + 1);
        if (entity === "&nbsp;") return " ";
        if (entity === "&plus;") return "+";
        if (entity === "&minus;") return "-";
        if (entity === "&#43;") return "+";
        if (entity === "&#45;" || entity === "&#8722;") return "-";
        // Any other entity is a single non-sign glyph for our purposes.
        return "&";
      }
    }
    return html[i];
  }
  return null;
}

/**
 * Formats the formula digits in an annotation's HTML while leaving its
 * existing markup alone.
 *
 * The editor stores rich text as a small HTML subset, so a text node can be
 * split across tags (`H<b>2</b>SO4`) or already contain a hand-made
 * `<sub>`. This walks the markup, only rewrites text outside existing
 * sub/superscripts, and keeps the last visible character across tag
 * boundaries so the same `H`/`)` rule still applies. It is idempotent:
 * running it over already-formatted HTML changes nothing.
 */
export function autoFormatFormulaHtml(html: string): string {
  let out = "";
  let i = 0;
  let skipDepth = 0;
  let previous: string | null = null;

  while (i < html.length) {
    if (html[i] === "<") {
      const close = html.indexOf(">", i);
      if (close === -1) {
        out += html.slice(i);
        break;
      }
      const tag = html.slice(i, close + 1);
      const marker = /^<\s*(\/?)\s*(sub|sup)\b/i.exec(tag);
      if (marker) {
        skipDepth = Math.max(0, skipDepth + (marker[1] ? -1 : 1));
      }
      out += tag;
      i = close + 1;
      continue;
    }

    const nextTag = html.indexOf("<", i);
    const end = nextTag === -1 ? html.length : nextTag;
    const text = html.slice(i, end);
    i = end;

    if (skipDepth > 0) {
      out += text;
      for (let j = text.length - 1; j >= 0; j -= 1) {
        if (!/\s/.test(text[j])) {
          previous = text[j];
          break;
        }
      }
      continue;
    }

    let j = 0;
    while (j < text.length) {
      const ch = text[j];
      if (ch >= "0" && ch <= "9") {
        let k = j + 1;
        while (k < text.length && text[k] >= "0" && text[k] <= "9") k += 1;
        const digits = text.slice(j, k);
        const after = k < text.length ? text[k] : peekVisibleChar(html, i);
        const isCharge = isChargeSign(after);
        if (previous !== null && isFormulaLead(previous) && !isCharge) {
          out += `<sub>${digits}</sub>`;
        } else {
          out += digits;
        }
        previous = digits[digits.length - 1];
        j = k;
        continue;
      }
      out += ch;
      if (!/\s/.test(ch)) previous = ch;
      j += 1;
    }
  }

  return out;
}
