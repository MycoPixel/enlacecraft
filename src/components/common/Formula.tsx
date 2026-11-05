/**
 * Renders a formula string with its atom counts as real subscript digits
 * (C₂₇H₄₆O instead of C27H46O). Also used for multi-fragment displays from
 * useFormulaDisplay (e.g. "C6H6 – C6H14"), so it tokenizes on letter-runs
 * and digit-runs but passes any other characters (spaces, the separating
 * dash, "+") through untouched rather than dropping them — the previous
 * version's regex only matched letters/digits, which silently ate the
 * separator between molecules.
 */
export function Formula({ formula }: { formula: string }) {
  if (!formula) return null;
  const tokens = formula.match(/[A-Za-z]+|\d+|[^A-Za-z\d]+/g) ?? [];
  return (
    <>
      {tokens.map((token, i) => (/^\d+$/.test(token) ? <sub key={i}>{token}</sub> : <span key={i}>{token}</span>))}
    </>
  );
}
