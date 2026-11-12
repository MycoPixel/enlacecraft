import { useEffect, useState } from "react";

/**
 * Reactive `window.matchMedia` wrapper. Used for layout decisions that need
 * to agree with a CSS breakpoint in JS (which menu to render, whether a
 * popover should become a bottom sheet) without duplicating the breakpoint
 * as a resize listener in every component.
 *
 * Environments without `matchMedia` (jsdom, very old browsers) report
 * `false`, i.e. the desktop layout — the same thing the CSS does when no
 * media query can be evaluated.
 */
function queryMatches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => queryMatches(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
