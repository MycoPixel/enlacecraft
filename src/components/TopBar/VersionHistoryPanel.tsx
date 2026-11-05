import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Trash2 } from "lucide-react";
import { useT } from "../../i18n/useT";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { listCheckpoints, loadCheckpoint, deleteCheckpoint, type CheckpointSummary } from "../../io/versionHistory";
import { captureCheckpointNow } from "../../hooks/useVersionHistory";
import { ConfirmPopover } from "../common/ConfirmPopover";

/** Intl.RelativeTimeFormat handles pluralization/phrasing for both "en"
 * and "es" natively, so there's no need for hand-written history.*AgoN
 * translation keys the way a manual scheme would need — this picks
 * whichever unit (seconds/minutes/hours/days) reads most naturally for
 * how long ago timestamp was, the same "largest sensible unit" logic
 * most relative-time UIs use. */
function formatRelativeTime(timestamp: number, lang: string): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const diffMs = timestamp - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffMs / 60_000);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffMs / 86_400_000);
  return rtf.format(diffDay, "day");
}

function VersionHistoryRow({
  checkpoint,
  svgRef,
  onRestored,
  onDeleted,
}: {
  checkpoint: CheckpointSummary;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onRestored: () => void;
  onDeleted: (id: number) => void;
}) {
  const t = useT();
  const lang = useMoleculeStore((s) => s.language);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const restoreBtnRef = useRef<HTMLButtonElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const relativeTime = formatRelativeTime(checkpoint.timestamp, lang);

  const doRestore = async () => {
    setConfirmingRestore(false);
    setBusy(true);
    // Safety net: capture whatever's currently on screen — unsaved or not
    // — as its own checkpoint before overwriting it, so restoring (like
    // every other destructive action in this app) has a way back. Only
    // possible when the canvas is actually mounted/rendered, which it is
    // whenever this panel can be open.
    const state = useMoleculeStore.getState();
    const svg = svgRef.current;
    if (svg) await captureCheckpointNow(svg, { activeTabId: state.activeTabId, tabs: state.getAllTabsForSave() });

    const data = await loadCheckpoint(checkpoint.id);
    setBusy(false);
    if (!data) {
      setStatus(t("status.versionRestoreError"));
      return;
    }
    useMoleculeStore.getState().loadProject(data);
    setStatus(t("status.versionRestored", { time: relativeTime }));
    onRestored();
  };

  const doDelete = async () => {
    setConfirmingDelete(false);
    await deleteCheckpoint(checkpoint.id);
    onDeleted(checkpoint.id);
  };

  return (
    <div className="version-history-row">
      {checkpoint.thumbnail ? (
        <img className="version-history-row__thumb" src={checkpoint.thumbnail} alt="" />
      ) : (
        <div className="version-history-row__thumb version-history-row__thumb--empty" aria-hidden="true" />
      )}
      <span className="version-history-row__time">{relativeTime}</span>
      <button
        ref={restoreBtnRef}
        type="button"
        className="version-history-row__restore"
        onClick={() => setConfirmingRestore(true)}
        disabled={busy}
      >
        <RotateCcw size={14} />
        {t("history.restore")}
      </button>
      <button
        ref={deleteBtnRef}
        type="button"
        className="version-history-row__delete"
        title={t("history.delete")}
        aria-label={t("history.delete")}
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 size={14} />
      </button>
      <ConfirmPopover
        open={confirmingRestore}
        anchorRef={restoreBtnRef}
        message={t("confirm.restoreVersion")}
        confirmLabel={t("history.restore")}
        cancelLabel={t("confirm.cancel")}
        onConfirm={() => void doRestore()}
        onCancel={() => setConfirmingRestore(false)}
      />
      <ConfirmPopover
        open={confirmingDelete}
        anchorRef={deleteBtnRef}
        message={t("confirm.deleteVersion")}
        confirmLabel={t("history.delete")}
        cancelLabel={t("confirm.cancel")}
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

/**
 * Browsable list of checkpoints taken by useVersionHistory.ts (see that
 * file and io/versionHistory.ts for what a checkpoint is and when one gets
 * taken) — the UI half of "full version history": thumbnail, relative
 * time, restore, delete, one row per checkpoint, newest first.
 */
export function VersionHistoryPanel({
  open,
  onClose,
  svgRef,
}: {
  open: boolean;
  onClose: () => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const t = useT();
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setCheckpoints(null);
    let cancelled = false;
    listCheckpoints().then((list) => {
      if (!cancelled) setCheckpoints(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="version-history-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="version-history-dialog" role="dialog" aria-modal="true" aria-label={t("history.title")}>
        <div className="version-history-dialog__header">
          <h2>{t("history.title")}</h2>
          <button type="button" className="version-history-dialog__close" onClick={onClose} aria-label={t("shortcuts.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="version-history-dialog__body">
          {checkpoints === null && <p className="version-history-empty">{t("history.loading")}</p>}
          {checkpoints !== null && checkpoints.length === 0 && <p className="version-history-empty">{t("history.empty")}</p>}
          {checkpoints !== null && checkpoints.length > 0 && (
            <div className="version-history-list">
              {checkpoints.map((cp) => (
                <VersionHistoryRow
                  key={cp.id}
                  checkpoint={cp}
                  svgRef={svgRef}
                  onRestored={onClose}
                  onDeleted={(id) => setCheckpoints((cur) => (cur ? cur.filter((c) => c.id !== id) : cur))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
