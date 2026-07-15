import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useMoleculeStore, type TabInfo } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { ConfirmPopover } from "../common/ConfirmPopover";

function Tab({ tab, active, dirty, closable }: { tab: TabInfo; active: boolean; dirty: boolean; closable: boolean }) {
  const switchToTab = useMoleculeStore((s) => s.switchToTab);
  const closeTab = useMoleculeStore((s) => s.closeTab);
  const renameTab = useMoleculeStore((s) => s.renameTab);
  const t = useT();

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(tab.title);

  const requestClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (dirty) setConfirming(true);
    else closeTab(tab.id);
  };

  const commitRename = () => {
    setEditing(false);
    renameTab(tab.id, draftTitle);
  };

  return (
    <div
      className={`tab-bar__tab ${active ? "tab-bar__tab--active" : ""}`}
      role="tab"
      aria-selected={active}
      onClick={() => switchToTab(tab.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraftTitle(tab.title);
        setEditing(true);
      }}
    >
      {dirty && <span className="tab-bar__dot" title={t("tab.unsaved")} aria-hidden="true" />}
      {editing ? (
        <input
          className="tab-bar__input"
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span className="tab-bar__title" title={tab.title}>
          {tab.title}
        </span>
      )}
      {closable && (
        <button
          ref={closeBtnRef}
          type="button"
          className="tab-bar__close"
          title={t("tab.close")}
          aria-label={t("tab.close")}
          onClick={requestClose}
        >
          <X size={12} />
        </button>
      )}
      <ConfirmPopover
        open={confirming}
        anchorRef={closeBtnRef}
        message={t("confirm.closeTab", { title: tab.title })}
        confirmLabel={t("confirm.confirmCloseTab")}
        cancelLabel={t("confirm.cancel")}
        onConfirm={() => {
          setConfirming(false);
          closeTab(tab.id);
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/**
 * The tab strip for multiple drawings within one project — switching tabs
 * swaps the whole canvas (molecule, annotations, pan/zoom, and undo/redo
 * history all travel with the tab; see TabDocument in the store). Always
 * has at least one tab; the close button only shows once there's more
 * than one to close down to.
 */
export function TabBar() {
  const tabs = useMoleculeStore((s) => s.tabs);
  const activeTabId = useMoleculeStore((s) => s.activeTabId);
  const hasUnsavedChanges = useMoleculeStore((s) => s.hasUnsavedChanges);
  const tabDocuments = useMoleculeStore((s) => s.tabDocuments);
  const addTab = useMoleculeStore((s) => s.addTab);
  const t = useT();

  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          dirty={tab.id === activeTabId ? hasUnsavedChanges : !!tabDocuments[tab.id]?.hasUnsavedChanges}
          closable={tabs.length > 1}
        />
      ))}
      <button type="button" className="tab-bar__add" title={t("tab.add")} aria-label={t("tab.add")} onClick={addTab}>
        <Plus size={14} />
      </button>
    </div>
  );
}
