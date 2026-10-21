import { useMoleculeStore } from "../store/useMoleculeStore";
import { importMol } from "../io/molfile";
import { importCdxmlDocument } from "../io/cdxml";
import type { Annotation } from "../types/chemistry";
import { importSmiles, detectStructureText, SmilesImportError } from "../io/smilesImport";
import { importProject, PROJECT_FILE_EXTENSION, ProjectParseError } from "../io/project";
import { LIMITS, newRepairReport, totalDropped } from "../io/validate";
import { useT } from "../i18n/useT";
import { forgetSaveDestination, baseName } from "../io/saveProject";

/**
 * Parses a file's raw text content — already read, from wherever it came
 * from (the browser <input type="file"> picker, a native Electron Open
 * dialog, or a drag-and-drop onto the window) — and loads it into the app:
 * either as a new molecule tab (.mol/.cdxml/.smi) or a fully restored
 * project (.enlacecraft, with all its tabs). Centralized here so those
 * entry points share one dispatch implementation instead of near-identical
 * copies drifting apart over time.
 *
 * Dispatch is by extension where the extension is trustworthy, and by
 * content sniffing (`detectStructureText`) where it isn't — so a plain
 * .txt file (or a mislabeled download) still lands in the right parser as
 * long as its *contents* are recognizable. Sniffing only ever overrides
 * the extension for the loose cases (.txt and unknown extensions); a
 * .mol that smells like something else is still fed to importMol, keeping
 * the old error surface for genuinely corrupt files.
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
    const lower = name.toLowerCase();
    const isCdxml = lower.endsWith(".cdxml");
    const isSmiles = lower.endsWith(".smi") || lower.endsWith(".smiles");
    const isProject = lower.endsWith(PROJECT_FILE_EXTENSION);
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
      const sniffed = isSmiles || isCdxml ? null : detectStructureText(content);
      // CDXML pages carry more than a connection table — arrows, brackets
      // and caption text come in as annotations alongside the molecule
      // (importCdxmlDocument); MOL and SMILES have no such layer, so their
      // entries stay molecule-only. Either way the result lands in a
      // brand-new tab.
      const parsed = isCdxml
        ? importCdxmlDocument(content)
        : isSmiles || sniffed === "smiles"
          ? { molecule: importSmiles(content).molecule, annotations: [] as Annotation[] }
          : sniffed === "cdxml"
            ? importCdxmlDocument(content)
            : // "mol" and null both go to importMol: "mol" is confident,
              // null preserves the pre-sniffing behavior for unknown content
              // (importMol throws its own "not a recognized file" error).
              { molecule: importMol(content), annotations: [] as Annotation[] };
      const title = name.replace(/\.(mol|cdxml|smi|smiles)$/i, "");
      // Opening a structure file discards the remembered project
      // destination: the document on screen is now that file's content, and
      // a plain Save must ask for a project file rather than overwrite the
      // .mol/.smi that was opened (which is a different format and would be
      // destroyed by it).
      forgetSaveDestination();
      setProjectFileName(null);
      const annotations: Record<string, Annotation> = {};
      for (const ann of parsed.annotations) annotations[ann.id] = ann;
      importMoleculeAsNewTab(parsed.molecule, title, annotations);
      const annotationCount = parsed.annotations.length;
      setStatus(
        annotationCount > 0
          ? t("status.importedWithAnnotations", { count: Object.keys(parsed.molecule.atoms).length, annotations: annotationCount })
          : t("status.imported", { count: Object.keys(parsed.molecule.atoms).length }),
      );
    } catch (err) {
      if (err instanceof SmilesImportError) {
        setStatus(t("status.smilesImportError", { reason: err.message }));
        return;
      }
      setStatus(t(err instanceof ProjectParseError ? "status.projectImportError" : "status.importError", { name }));
    }
  };
}
