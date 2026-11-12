/**
 * Portaled popovers are siblings in the DOM, not descendants of the control
 * that opened them. A menu nested inside another menu is therefore "outside"
 * the parent's own portal, and the parent's outside-click handler would close
 * it the moment someone clicked the nested panel.
 *
 * Every popover root in the app carries one of these classes, so treating a
 * click inside *any* open menu as "inside a menu" keeps the stack alive while
 * the individual menus still close each other through their own triggers or
 * through the active-menu signal in ToolDropdown.
 */
const MENU_SELECTOR = [
  ".tool-dropdown",
  ".export-dropdown",
  ".theme-picker__menu",
  ".view-options-dropdown",
  ".molecule-info-dropdown",
  ".desktop-download-menu",
  ".confirm-popover",
  ".context-menu",
  ".tool-sheet-scrim",
].join(", ");

export function isInsideAnyMenu(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(MENU_SELECTOR);
}
