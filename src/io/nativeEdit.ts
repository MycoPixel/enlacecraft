/**
 * Native editor commands (copy/cut/paste/undo/redo/select-all) for the
 * desktop build.
 *
 * Why this exists: the packaged app's Edit menu deliberately does NOT
 * register its accelerators (see electron/main.cjs) — a registered
 * accelerator is consumed before the page ever sees the key, and the menu
 * roles' native commands only act on real DOM text selections, which a
 * canvas app never has. That combination is exactly how Ctrl+C ended up
 * dead for canvas copies in the packaged Linux/Windows builds while the
 * same keys worked in the browser.
 *
 * With the accelerators freed, the keys reach the page's keydown handlers
 * (useClipboard / useKeyboardShortcuts), which know where the focus is.
 * On the canvas they run the app-level actions themselves; in a text
 * field they forward here, because Chromium's renderer on Linux/Windows
 * has no built-in binding for these commands either — that gap is why the
 * Edit menu was added in the first place. In the plain web build there is
 * no bridge and nothing to do: the browser's own bindings handle the key
 * (the callers deliberately never preventDefault on an editable target).
 */
export type NativeEditCommand = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";

export function nativeEditCommand(command: NativeEditCommand): void {
  const bridge = typeof window === "undefined" ? undefined : window.electron;
  if (bridge?.nativeEditCommand) void bridge.nativeEditCommand(command).catch(() => {});
}

/** True when the given element (an event target or document.activeElement)
 * is a text entry point, i.e. where native editor commands should land. */
export function isEditableElement(el: EventTarget | null): boolean {
  const el2 = el as HTMLElement | null;
  return !!el2 && (el2.tagName === "INPUT" || el2.tagName === "TEXTAREA" || el2.isContentEditable === true);
}
