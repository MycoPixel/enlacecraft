import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "../../i18n/useT";
import { readShareTokenFromUrl } from "../../io/shareLink";

interface OpenShareLinkDialogProps {
  onClose: () => void;
  onOpen: (token: string) => void;
}

/**
 * Paste a read-only link to view it here.
 *
 * The web build can always open a shared link in a new tab, but the packaged
 * desktop app has no address bar and blocks navigation away from its own
 * `file:` page, so a link copied from a colleague would otherwise only ever
 * work in a browser. This turns the link back into the token the shared
 * viewer already understands; the caller decides whether that is a new tab
 * (web) or a separate read-only app window (desktop).
 */
export function OpenShareLinkDialog({ onClose, onOpen }: OpenShareLinkDialogProps) {
  const t = useT();
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const token = readShareTokenFromUrl(text);

  const submit = () => {
    if (!token) {
      setError(true);
      return;
    }
    onOpen(token);
    onClose();
  };

  return createPortal(
    <div className="paste-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="paste-dialog" role="dialog" aria-modal="true" aria-label={t("share.openTitle")}>
        <div className="paste-dialog__header">
          <h2>{t("share.openTitle")}</h2>
          <button type="button" className="paste-dialog__close" onClick={onClose} aria-label={t("shortcuts.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="paste-dialog__body">
          <input
            ref={inputRef}
            className="share-link-dialog__input"
            type="url"
            inputMode="url"
            spellCheck={false}
            value={text}
            placeholder={t("share.openPlaceholder")}
            onChange={(e) => {
              setText(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <div className="paste-dialog__meta">
            <span className={`paste-dialog__detected ${token ? "" : "paste-dialog__detected--unknown"}`}>
              {token ? t("share.openDetected") : t("share.openHint")}
            </span>
          </div>
          {error && <div className="paste-dialog__error">{t("share.openInvalid")}</div>}
        </div>
        <div className="paste-dialog__footer">
          <button type="button" className="paste-dialog__cancel" onClick={onClose}>
            {t("paste.cancel")}
          </button>
          <button type="button" className="paste-dialog__add" disabled={!token} onClick={submit}>
            {t("share.openButton")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
