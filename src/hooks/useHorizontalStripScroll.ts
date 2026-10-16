import { useEffect, type RefObject } from "react";

/**
 * Lets an ordinary vertical mouse wheel drive a horizontally-scrolling
 * strip — the top bar's action buttons when the window is too narrow to
 * fit them all.
 *
 * Why this is needed at all: the strip scrolls sideways, but a wheel only
 * moves a container along its own scrollable axis, and this one has no
 * vertical overflow to scroll. So a plain mouse over it did nothing at
 * all, and the buttons past the right edge (3D view, version history,
 * clear drawing) were simply unreachable without a trackpad, Shift+wheel,
 * or tabbing to them one at a time.
 *
 * Deliberately narrow about when it intervenes:
 *  - a trackpad's horizontal delta is left alone entirely,
 *  - a strip that isn't overflowing is left alone,
 *  - and at either end of the scroll range the wheel is NOT swallowed, so
 *    overscrolling past the last button scrolls the page as usual rather
 *    than trapping the pointer in a strip that has nowhere left to go.
 *
 * Uses a non-passive native listener rather than a React onWheel prop:
 * React registers wheel/touch listeners as passive at the root, where
 * preventDefault is ignored (and warns), so the JSX-prop version of this
 * would silently do nothing.
 */
export function useHorizontalStripScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = el.scrollLeft + e.deltaY;
      if (next <= 0 || next >= max) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);
}
