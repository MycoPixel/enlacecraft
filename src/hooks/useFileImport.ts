import { useMoleculeStore } from "../store/useMoleculeStore";
import { importMol, importSdf } from "../io/molfile";
import { importCdxmlDocument } from "../io/cdxml";
import { extractCdxmlFromSvg } from "../io/svgMetadata";
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
 * either as one or more new molecule tabs (.mol/.sdf/.cdxml/.smi) or a
 * fully restored project (.enlacecraft, with all its tabs). Centralized here
 * so those entry points share one dispatch implementation instead of
 * near-identical copies drifting apart over time.
 *
 * Dispatch is by extension where the extension is trustworthy, and by
 * content sniffing (`detectStructureText`) where it isn't — so a plain
 * .txt file (or a mislabeled download) still lands in the right parser as
 * long as its *contents* are recognizable. Sniffing only ever overrides
 * the extension for the loose cases (.txt and unknown extensions); a
 * .mol that smells like something else is still fed to importMol, keeping
 * the old error surface for genuinely corrupt files. An SDF is a sequence
 * of MOL blocks, so it gets its own multi-tab path; a `$$$$` separator is
 * enough to route there even when the extension is misleading.
 */
export function useFileImport() {
  const importMoleculeAsNewTab = useMoleculeStore((s) => s.importMoleculeAsNewTab);
  const importProjectAsNewTabs = useMoleculeStore((s) => s.importProjectAsNewTabs);
  const resetView = useMoleculeStore((s) => s.resetView);
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
    const isSvg = lower.endsWith(".svg");
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
      const isSdf = lower.endsWith(".sdf") || (!isCdxml && !isSmiles && content.includes("$$$$"));
      if (isSdf) {
        const { records, skipped } = importSdf(content);
        // The project loader caps a saved document at LIMITS.maxTabs tabs;
        // a huge vendor library must obey the same ceiling rather than
        // creating an unbounded tab bar. Count tabs already open, so
        // importing into a busy session can't overshoot either.
        const capacity = Math.max(0, LIMITS.maxTabs - useMoleculeStore.getState().tabs.length);
        if (capacity === 0) {
          setStatus(t("status.tabLimitReached", { limit: LIMITS.maxTabs }));
          return;
        }
        const imported = records.slice(0, capacity);
        const overflow = records.length - imported.length;
        // The document on screen is now this file's content, so a plain
        // Save must ask for a project file rather than overwrite the .sdf.
        forgetSaveDestination();
        setProjectFileName(null);
        const base = name.replace(/\.[^.]+$/, "");
        imported.forEach((record, i) => {
          // Prefer the writer's own title line; fall back to the filename,
          // numbered only when there is more than one structure to tell apart.
          const title = record.title || (records.length > 1 ? `${base} ${i + 1}` : base);
          importMoleculeAsNewTab(record.molecule, title, {});
        });
        const count = imported.length;
        if (overflow > 0) {
          setStatus(t("status.importedSdfTruncated", { count, skipped: skipped + overflow, limit: LIMITS.maxTabs }));
        } else if (skipped > 0) {
          setStatus(t("status.importedSdfWithSkips", { count, skipped }));
        } else {
          setStatus(t("status.importedSdf", { count }));
        }
        return;
      }
      // An .svg is only importable when it carries the CDXML metadata block
      // this app's own SVG exports embed (or a tool preserved) — a plain
      // vector drawing has no chemistry in it to rebuild. See io/svgMetadata.ts.
      if (isSvg) {
        const cdxml = extractCdxmlFromSvg(content);
        if (!cdxml) {
          setStatus(t("status.svgNoStructure", { name }));
          return;
        }
        const parsed = importCdxmlDocument(cdxml);
        const title = name.replace(/\.(mol|cdxml|smi|smiles|svg)$/i, "");
        forgetSaveDestination();
        setProjectFileName(null);
        const annotations: Record<string, Annotation> = {};
        for (const ann of parsed.annotations) annotations[ann.id] = ann;
        importMoleculeAsNewTab(parsed.molecule, title, annotations, parsed.page);
        resetView();
        setStatus(t("status.imported", { count: Object.keys(parsed.molecule.atoms).length }));
        return;
      }
      const sniffed = isSmiles || isCdxml ? null : detectStructureText(content);
      // CDXML pages carry more than a connection table — arrows, brackets
      // and caption text come in as annotations alongside the molecule
      // (importCdxmlDocument); MOL and SMILES have no such layer, so their
      // entries stay molecule-only. Either way the result lands in a
      // brand-new tab.
      const usingCdxml = isCdxml || sniffed === "cdxml";
      const parsed = usingCdxml
        ? importCdxmlDocument(content)
        : isSmiles || sniffed === "smiles"
          ? { molecule: importSmiles(content).molecule, annotations: [] as Annotation[] }
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
      // CDXML also carries the file's paper/bond-length setup; MOL/SMILES
      // have no equivalent, so those tabs keep the default page.
      importMoleculeAsNewTab(parsed.molecule, title, annotations, "page" in parsed ? parsed.page : undefined);
      // CDXML coordinates are absolute page coordinates (a ChemDraw page
      // starts at the page's top-left, typically hundreds of units from
      // the drawing), so without framing the whole scheme can open partly
      // off-screen. Reset the view to fit what was just imported.
      if (usingCdxml) resetView();
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
