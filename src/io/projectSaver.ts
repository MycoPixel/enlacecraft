import { useMoleculeStore } from "../store/useMoleculeStore";
import { exportProject, PROJECT_FILE_EXTENSION } from "./project";
import { saveToCurrent, saveAs, type SaveOutcome } from "./saveProject";
import { translate } from "../i18n/translate";

/**
 * The project's Save and Save As, as one function shared by the Export menu
 * and the Ctrl+S / Cmd+S shortcut.
 *
 * Lives outside TopBar so the keyboard path isn't a second implementation of
 * the same behaviour — the two drifting apart is exactly the bug this
 * refactor was meant to avoid. Everything it needs (the tabs, the language for
 * status messages, the dirty flag) is read straight off the store, which is
 * how the rest of the app's non-React code reaches it.
 *
 * `saveAs` forces the dialog. Plain save writes to the destination already
 * chosen this session and falls back to that dialog when there isn't one yet,
 * so the first Ctrl+S on a new project asks where to put it and every one
 * after that is a single keystroke.
 */
export async function runProjectSave(forceDialog: boolean): Promise<void> {
  const store = useMoleculeStore.getState();
  const t = (key: string, vars?: Record<string, string | number>) => translate(store.language, key, vars);
  const json = exportProject({ activeTabId: store.activeTabId, tabs: store.getAllTabsForSave() });
  const suggestedName = `molecule${PROJECT_FILE_EXTENSION}`;

  let outcome: SaveOutcome;
  try {
    outcome = forceDialog
      ? await saveAs(json, suggestedName, PROJECT_FILE_EXTENSION)
      : await saveToCurrent(json);
    if (outcome.kind === "needs-dialog") {
      outcome = await saveAs(json, suggestedName, PROJECT_FILE_EXTENSION);
    }
  } catch (err) {
    outcome = { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }

  if (outcome.kind === "canceled") return;
  if (outcome.kind === "needs-dialog") return; // saveAs was itself cancelled

  if (outcome.kind === "error") {
    // Deliberately does not clear the dirty flag: the save failed, so the
    // close-time "unsaved changes" warning must still fire.
    store.setStatus(t("status.projectSaveError", { error: outcome.message }));
    return;
  }

  store.markProjectSaved();
  store.setProjectFileName(outcome.name || null);
  store.setStatus(t("status.projectSaved", { path: outcome.name }));
}