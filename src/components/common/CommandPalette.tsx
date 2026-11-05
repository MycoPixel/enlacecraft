import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { useT } from "../../i18n/useT";
import { getCommands, subscribeCommands } from "../../commands/commands";

interface CommandPaletteProps {
  onClose: () => void;
}

/**
 * Searchable launcher for every registered tool, view action and export.
 *
 * Mounted only while open (App renders it conditionally), so the query and
 * highlight start fresh every time without a reset effect. Keyboard-first
 * (Ctrl/Cmd+K, arrows, Enter) because the point of a palette is not having to
 * leave the keyboard, but every row is also a real button with a visible
 * label and focus state, so it works with the mouse and with a screen
 * reader's browse mode alike.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const t = useT();
  const commands = useSyncExternalStore(subscribeCommands, getCommands, getCommands);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    const scored = commands
      .map((command) => {
        const title = t(command.titleKey).toLowerCase();
        const section = t(command.sectionKey).toLowerCase();
        const haystack = `${title} ${section} ${command.keywords ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return null;
        // Titles that start with the query rank above a mere substring, so
        // typing "undo" puts Undo before "Redo".
        const rank = title.startsWith(needle) ? 0 : title.includes(needle) ? 1 : 2;
        return { command, rank };
      })
      .filter((entry): entry is { command: (typeof commands)[number]; rank: number } => entry !== null);
    scored.sort((a, b) => a.rank - b.rank);
    return scored.map((entry) => entry.command);
  }, [commands, query, t]);

  // Derived rather than stored: narrowing the query can shorten the list
  // under the old highlight, and a stale index would point at nothing.
  const activeIndex = filtered.length === 0 ? -1 : Math.min(active, filtered.length - 1);

  // Keep the highlighted row visible. `block: "nearest"` only nudges the
  // list, never the page behind the dialog.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${idPrefix}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filtered, idPrefix]);

  const run = (index: number) => {
    const command = filtered[index];
    if (!command || command.isDisabled?.()) return;
    onClose();
    // Let the dialog unmount before an action that opens a native dialog or
    // starts a download; otherwise the browser treats the still-mounted
    // overlay as the interaction target.
    requestAnimationFrame(() => void command.run());
  };

  const move = (delta: number) => {
    if (filtered.length === 0) return;
    const from = activeIndex < 0 ? 0 : activeIndex;
    setActive((from + delta + filtered.length) % filtered.length);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(activeIndex);
    }
  };

  const options: React.ReactNode[] = [];
  let lastSection = "";
  filtered.forEach((command, index) => {
    const section = t(command.sectionKey);
    if (section !== lastSection) {
      lastSection = section;
      options.push(
        <div key={`section-${command.sectionKey}-${index}`} className="command-palette__section" role="presentation">
          {section}
        </div>,
      );
    }
    const disabled = command.isDisabled?.() ?? false;
    const selected = index === activeIndex;
    options.push(
      <button
        key={command.id}
        id={`${idPrefix}-option-${index}`}
        type="button"
        role="option"
        aria-selected={selected}
        aria-disabled={disabled || undefined}
        className={`command-palette__item ${selected ? "command-palette__item--active" : ""} ${disabled ? "command-palette__item--disabled" : ""}`}
        onPointerMove={() => !disabled && setActive(index)}
        onClick={() => run(index)}
      >
        <span className="command-palette__title">{t(command.titleKey)}</span>
        {command.shortcut && <kbd className="command-palette__shortcut">{command.shortcut}</kbd>}
      </button>,
    );
  });

  return createPortal(
    <div
      className="command-palette-overlay"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="command-palette" role="dialog" aria-modal="true" aria-label={t("palette.title")}>
        <div className="command-palette__search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${idPrefix}-list`}
            aria-activedescendant={activeIndex >= 0 ? `${idPrefix}-option-${activeIndex}` : undefined}
            aria-autocomplete="list"
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
          />
          <kbd className="command-palette__hint">Esc</kbd>
        </div>
        <div id={`${idPrefix}-list`} className="command-palette__list" role="listbox" aria-label={t("palette.title")}>
          {options.length > 0 ? options : <div className="command-palette__empty">{t("palette.empty")}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
