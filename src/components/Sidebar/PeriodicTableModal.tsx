import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Element } from "../../types/chemistry";
import { PERIODIC_TABLE, ELEMENT_COLOR, ATOMIC_WEIGHT, type PeriodicElementInfo } from "../../model/constants";
import { useT } from "../../i18n/useT";
import { useIsMobile } from "../../hooks/useIsMobile";

interface PeriodicTableModalProps {
  open: boolean;
  value: Element;
  onSelect: (el: Element) => void;
  onClose: () => void;
}

/** Each period's/group's entries, sorted along the axis you'd arrow-key
 * through — built once from the static PERIODIC_TABLE rather than per
 * render. Arrowing right/left moves to the *next existing* element in the
 * row regardless of how big the gap between them is (e.g. H at group 1
 * straight to He at group 18), rather than a naive column++ that would
 * land on empty cells; up/down works the same way along a group/column. */
const BY_PERIOD = new Map<number, PeriodicElementInfo[]>();
const BY_GROUP = new Map<number, PeriodicElementInfo[]>();
for (const e of PERIODIC_TABLE) {
  (BY_PERIOD.get(e.period) ?? BY_PERIOD.set(e.period, []).get(e.period)!).push(e);
  (BY_GROUP.get(e.group) ?? BY_GROUP.set(e.group, []).get(e.group)!).push(e);
}
for (const row of BY_PERIOD.values()) row.sort((a, b) => a.group - b.group);
for (const col of BY_GROUP.values()) col.sort((a, b) => a.period - b.period);

/**
 * Full 118-element picker, opened from ElementPicker's "more" button.
 * Laid out as an actual periodic table (CSS grid, positioned by each
 * entry's period/group from PERIODIC_TABLE) rather than a flat overflow
 * list — with lanthanides/actinides detached below per the usual
 * wallchart convention (see PeriodicElementInfo's doc comment for how
 * that reuses period 8/9 as a layout-only convenience). A search box
 * filters by symbol, name, or atomic number without reflowing the grid —
 * matches stay highlighted in place, everything else dims — so the
 * table's shape (a big part of how people actually find an element) never
 * changes underneath the search.
 *
 * Below the app's usual mobile breakpoint, the 18-column grid doesn't fit
 * a phone screen without horizontal scrolling every time, so this
 * switches to a plain filterable vertical list instead — same data,
 * shape that actually works one-handed.
 */
export function PeriodicTableModal({ open, value, onSelect, onClose }: PeriodicTableModalProps) {
  const t = useT();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRefs = useRef<Partial<Record<Element, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const el = inputRef.current;
    if (el) el.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    return (symbol: string, name: string, number: number) =>
      !q || symbol.toLowerCase().startsWith(q) || name.toLowerCase().includes(q) || String(number) === q;
  }, [q]);

  if (!open) return null;

  const focusSymbol = (symbol: string) => cellRefs.current[symbol as Element]?.focus();

  const onGridKeyDown = (e: React.KeyboardEvent, entry: PeriodicElementInfo) => {
    let neighbor: PeriodicElementInfo | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const row = BY_PERIOD.get(entry.period) ?? [];
      const i = row.findIndex((x) => x.symbol === entry.symbol);
      neighbor = row[i + (e.key === "ArrowRight" ? 1 : -1)];
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const col = BY_GROUP.get(entry.group) ?? [];
      const i = col.findIndex((x) => x.symbol === entry.symbol);
      neighbor = col[i + (e.key === "ArrowDown" ? 1 : -1)];
    }
    if (neighbor) {
      e.preventDefault();
      focusSymbol(neighbor.symbol);
    }
  };

  // From the search box, ArrowDown jumps straight into the grid — onto
  // the first result if the query narrowed things down, otherwise
  // whichever element is currently selected.
  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    const first = q ? PERIODIC_TABLE.find((el) => matches(el.symbol, el.name, el.number)) : undefined;
    focusSymbol((first ?? PERIODIC_TABLE.find((el) => el.symbol === value) ?? PERIODIC_TABLE[0]).symbol);
  };

  return createPortal(
    <div className="periodic-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="periodic-dialog" role="dialog" aria-modal="true" aria-label={t("periodic.title")}>
        <div className="periodic-dialog__header">
          <h2>{t("periodic.title")}</h2>
          <input
            ref={inputRef}
            className="periodic-dialog__search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={t("periodic.search")}
          />
          <button type="button" className="periodic-dialog__close" onClick={onClose} aria-label={t("shortcuts.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="periodic-dialog__body">
          {isMobile ? (
            <div className="periodic-list">
              {PERIODIC_TABLE.filter((e) => matches(e.symbol, e.name, e.number)).map((e) => (
                <button
                  key={e.symbol}
                  type="button"
                  className={`periodic-list-row ${value === e.symbol ? "periodic-list-row--active" : ""}`}
                  onClick={() => { onSelect(e.symbol); onClose(); }}
                >
                  <span className="periodic-list-row__symbol" style={{ color: ELEMENT_COLOR[e.symbol] }}>{e.symbol}</span>
                  <span className="periodic-list-row__name">{e.name}</span>
                  <span className="periodic-list-row__number">#{e.number}</span>
                  <span className="periodic-list-row__weight">{ATOMIC_WEIGHT[e.symbol].toFixed(2)}</span>
                </button>
              ))}
              {q && PERIODIC_TABLE.every((e) => !matches(e.symbol, e.name, e.number)) && (
                <div className="periodic-list__empty">{t("periodic.noMatches")}</div>
              )}
            </div>
          ) : (
            <div className="periodic-grid">
              {PERIODIC_TABLE.map((e) => {
                const dimmed = !matches(e.symbol, e.name, e.number);
                return (
                  <button
                    key={e.symbol}
                    ref={(el) => { cellRefs.current[e.symbol] = el; }}
                    type="button"
                    className={`periodic-cell ${value === e.symbol ? "periodic-cell--active" : ""} ${dimmed ? "periodic-cell--dimmed" : ""}`}
                    style={{
                      gridColumn: e.group,
                      gridRow: e.period,
                      color: ELEMENT_COLOR[e.symbol],
                      marginTop: e.period >= 8 ? 10 : 0,
                    }}
                    onClick={() => { onSelect(e.symbol); onClose(); }}
                    onKeyDown={(ev) => onGridKeyDown(ev, e)}
                    title={`${e.name} (${e.symbol}) \u2014 #${e.number} \u2014 ${ATOMIC_WEIGHT[e.symbol].toFixed(2)} g/mol`}
                  >
                    <span className="periodic-cell__number">{e.number}</span>
                    <span className="periodic-cell__symbol">{e.symbol}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
