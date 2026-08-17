import { useEffect, useState } from "react";
import type { UpdaterStatus } from "../types/electron";

const POLL_MS = 3000;

const IDLE: UpdaterStatus = { state: "idle", version: null, percent: null, error: null };

/**
 * There's no push channel from the main process for this (see
 * electron/updater.cjs / preload.cjs - only request/response IPC
 * handlers exist, no webContents.send-based events), so this polls
 * rather than subscribes. Update status changing a few seconds late
 * is unnoticeable for something like "downloading 45%" - not worth
 * adding a second IPC mechanism just for this.
 *
 * Always returns the idle state in the regular browser build (no
 * window.electron) or before the first poll resolves, so callers don't
 * need to null-check - they can just check `.state`.
 */
export function useUpdaterStatus(): UpdaterStatus {
  const [status, setStatus] = useState<UpdaterStatus>(IDLE);

  useEffect(() => {
    const bridge = window.electron;
    if (!bridge) return; // regular webapp build - nothing to poll

    let cancelled = false;

    const poll = () => {
      bridge
        .getUpdaterStatus()
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {
          // IPC call itself failing (vs. a reported "error" state,
          // which is a normal value this resolves to) isn't worth
          // surfacing - just skip this tick and try again next poll.
        });
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}
