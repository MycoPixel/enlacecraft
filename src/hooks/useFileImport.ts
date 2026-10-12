import { useMoleculeStore } from "../store/useMoleculeStore";
import { importMol } from "../io/molfile";
import { importCdxml } from "../io/cdxml";
import { importProject, PROJECT_FILE_EXTENSION, ProjectParseError } from "../io/project";
import { LIMITS, newRepairReport, totalDropped } from "../io/validate";
import { useT } from "../i18n/useT";
import { forgetSaveDestination, baseName } from "../io/saveProject";

/**
 * Parses a file's raw text content — already read, from wherever it came
 * from (the browser <input type="file"> picker, a native Electron Open
 * dialog, or a drag-and-drop onto the window) — and loads it into the app:
 * either as a new molecule tab (.mol/.cdxml) or a fully restored project
 * (.enlacecraft, with all its tabs). Centralized here so those three entry
 * points share one dispatch-by-extension implementation instead of three
 * near-identical copies drifting apart over time.
 */
export function useFileImport() {
  const importMoleculeAsNewTab = useMoleculeStore((s) => s.importMoleculeAsNewTab);
  const importProjectAsNewTabs = useMoleculeStore((s) => s.importProjectAsNewTabs);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const setProjectFileName = useMoleculeStore((s) => s.setProjectFileName);
  const t = useT();

  /**
   * `sourcePath` is the file the content came from when the platform knows it
   * (Electron's native Open dialog). Only used for display and for deciding
   * whether a later plain Save may overwrite — never to choose a destination,
   * which in the desktop build is the main process's business.
   */
  return (name: string, content: string, sourcePath?: string) => {
    const isCdxml = /\.cdxml$/i.test(name);
    const isProject = name.toLowerCase().endsWith(PROJECT_FILE_EXTENSION);
    // Belt and braces: the pickers/drop handler check File.size before
    // reading, but the desktop "Open" dialog hands over already-read text.
    if (content.length > LIMITS.maxFileChars) {
      setStatus(t("status.fileTooLarge", { name }));
      return;
    }
    try {
      if (isProject) {
        const report = newRepairReport();
        const project = importProject(content, report);
        importProjectAsNewTabs(project);
        // Opening a project makes it the save target, so a plain Save
        // overwrites it from here on — the same file just opened.
        forgetSaveDestination();
        setProjectFileName(baseName(sourcePath ?? name));
        const atomCount = project.tabs.reduce((sum, tb) => sum + Object.keys(tb.molecule.atoms).length, 0);
        const skipped = totalDropped(report);
        setStatus(
          skipped > 0
            ? t("status.importedWithSkips", { count: atomCount, skipped })
            : t("status.imported", { count: atomCount }),
        );
        return;
      }
      const parsed = isCdxml ? importCdxml(content) : importMol(content);
      const title = name.replace(/\.(mol|cdxml)$/i, "");
      // Opening a .mol/.cdxml discards the remembered project destination:
      // the document on screen is now that file's content, and a plain Save
      // must ask for a project file rather than overwrite the .mol that was
      // opened (which is a different format and would be destroyed by it).
      forgetSaveDestination();
      setProjectFileName(null);
      importMoleculeAsNewTab(parsed, title);
      setStatus(t("status.imported", { count: Object.keys(parsed.atoms).length }));
    } catch (err) {
      setStatus(t(err instanceof ProjectParseError ? "status.projectImportError" : "status.importError", { name }));
    }
  };
}
