import { useMoleculeStore } from "../store/useMoleculeStore";
import { importMol } from "../io/molfile";
import { importCdxml } from "../io/cdxml";
import { importProject, PROJECT_FILE_EXTENSION, ProjectParseError } from "../io/project";
import { LIMITS, newRepairReport, totalDropped } from "../io/validate";
import { useT } from "../i18n/useT";

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
  const t = useT();

  return (name: string, content: string) => {
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
      importMoleculeAsNewTab(parsed, title);
      setStatus(t("status.imported", { count: Object.keys(parsed.atoms).length }));
    } catch (err) {
      setStatus(t(err instanceof ProjectParseError ? "status.projectImportError" : "status.importError", { name }));
    }
  };
}
