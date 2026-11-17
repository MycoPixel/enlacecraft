import { memo } from "react";
import type { Molecule, ReagentRow } from "../../types/chemistry";
import { computeReagentTable, formatReagentNumber } from "../../model/reagentTable";
import { useT } from "../../i18n/useT";

/**
 * The sheet's reagent table as drawing content, not as a dialog.
 *
 * Rendering it inside the canvas SVG means it is part of every export — PNG,
 * SVG, PDF, print and the ONLYOFFICE preview — without touching any exporter,
 * and it pans and zooms with the drawing for free. The dialog stays the place
 * to edit it; this is the copy that goes into the notebook.
 *
 * It hangs below the drawing, aligned with its left edge. That anchor is
 * derived from the atoms on every render, so growing the structure pushes the
 * table down instead of drawing over it.
 */

const INK = "#1f2430";
const MUTED = "#5b6472";
const LINE = "#ccd3de";
const BACKGROUND = "#ffffff";

const PAD = 10;
const ROW_HEIGHT = 19;
const TITLE_HEIGHT = 26;
const HEADER_HEIGHT = 20;
/** Column right edges; the name starts at PAD and the role after it. */
const COLUMNS = {
  name: PAD,
  role: PAD + 148,
  eq: PAD + 218,
  mmol: PAD + 268,
  mass: PAD + 334,
  volume: PAD + 392,
  yield: PAD + 446,
  right: PAD + 446 + 10,
};

/** Left edge and top edge of the drawing, so the table can sit under it. */
function anchorOf(molecule: Molecule): { x: number; y: number } {
  const atoms = Object.values(molecule.atoms);
  if (atoms.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let maxY = -Infinity;
  for (const atom of atoms) {
    if (atom.x < minX) minX = atom.x;
    if (atom.y > maxY) maxY = atom.y;
  }
  return { x: minX, y: maxY + 48 };
}

function rowLabel(row: ReagentRow, t: ReturnType<typeof useT>): string {
  return row.name.trim() || row.formula || t("reagent.unnamed");
}

export const ReagentTableView = memo(function ReagentTableView({ molecule }: { molecule: Molecule }) {
  const t = useT();
  const table = molecule.reagentTable;
  if (!table || table.rows.length === 0) return null;

  const computed = computeReagentTable(table);
  const anchor = anchorOf(molecule);
  const height = TITLE_HEIGHT + HEADER_HEIGHT + computed.rows.length * ROW_HEIGHT + PAD;
  const width = COLUMNS.right;
  const limiting = computed.rows.find((row) => row.row.id === computed.limitingId);
  const limitingName = limiting ? rowLabel(limiting.row, t) : null;

  const subtitle = [
    `${formatReagentNumber(computed.scaleMmol)} mmol`,
    limitingName ? t("reagent.limitedBy", { name: limitingName }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const headerY = TITLE_HEIGHT + 13;
  const numeric = { textAnchor: "end" as const };

  return (
    <g
      transform={`translate(${anchor.x} ${anchor.y})`}
      data-reagent-table="true"
      /* Clicks on the table are inert: it is part of the document, not a
         drawing surface, so a stray click must not start a bond there. */
      onPointerDown={(e) => e.stopPropagation()}
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={6}
        fill={BACKGROUND}
        stroke={LINE}
        strokeWidth={1}
      />
      <text x={PAD} y={17} fontSize={12.5} fontWeight={600} fill={INK}>
        {t("reagent.title")}
      </text>
      <text x={width - PAD} y={17} fontSize={10.5} fill={MUTED} textAnchor="end">
        {subtitle}
      </text>
      <line x1={0} y1={TITLE_HEIGHT} x2={width} y2={TITLE_HEIGHT} stroke={LINE} strokeWidth={1} />

      <text x={COLUMNS.name} y={headerY} fontSize={9.5} fill={MUTED} letterSpacing="0.04em">
        {t("reagent.col.name").toUpperCase()}
      </text>
      <text x={COLUMNS.role} y={headerY} fontSize={9.5} fill={MUTED} letterSpacing="0.04em">
        {t("reagent.col.role").toUpperCase()}
      </text>
      <text x={COLUMNS.eq} y={headerY} fontSize={9.5} fill={MUTED} textAnchor="end" letterSpacing="0.04em">
        {t("reagent.col.eq").toUpperCase()}
      </text>
      <text x={COLUMNS.mmol} y={headerY} fontSize={9.5} fill={MUTED} textAnchor="end" letterSpacing="0.04em">
        {t("reagent.col.mmol").toUpperCase()}
      </text>
      <text x={COLUMNS.mass} y={headerY} fontSize={9.5} fill={MUTED} textAnchor="end" letterSpacing="0.04em">
        {t("reagent.col.mass").toUpperCase()}
      </text>
      <text x={COLUMNS.volume} y={headerY} fontSize={9.5} fill={MUTED} textAnchor="end" letterSpacing="0.04em">
        {t("reagent.col.volume").toUpperCase()}
      </text>
      <text x={COLUMNS.yield} y={headerY} fontSize={9.5} fill={MUTED} textAnchor="end" letterSpacing="0.04em">
        {t("reagent.col.yield").toUpperCase()}
      </text>
      <line
        x1={0}
        y1={TITLE_HEIGHT + HEADER_HEIGHT}
        x2={width}
        y2={TITLE_HEIGHT + HEADER_HEIGHT}
        stroke={LINE}
        strokeWidth={1}
      />

      {computed.rows.map((row, index) => {
        const y = TITLE_HEIGHT + HEADER_HEIGHT + (index + 1) * ROW_HEIGHT - 5;
        const isLimiting = row.row.id === computed.limitingId;
        return (
          <g key={row.row.id} data-reagent-row={row.row.id}>
            <text x={COLUMNS.name} y={y} fontSize={11.5} fill={INK} fontWeight={isLimiting ? 600 : 400}>
              {rowLabel(row.row, t)}
            </text>
            <text x={COLUMNS.role} y={y} fontSize={10} fill={MUTED}>
              {t(`reagent.role.${row.row.role}`)}
            </text>
            <text x={COLUMNS.eq} y={y} fontSize={11} fill={INK} {...numeric}>
              {formatReagentNumber(row.row.equivalents)}
            </text>
            <text x={COLUMNS.mmol} y={y} fontSize={11} fill={INK} {...numeric}>
              {formatReagentNumber(row.mmol)}
            </text>
            <text x={COLUMNS.mass} y={y} fontSize={11} fill={INK} {...numeric}>
              {formatReagentNumber(row.row.role === "product" ? (row.isolatedMassMg ?? row.massMg) : row.massMg)}
            </text>
            <text x={COLUMNS.volume} y={y} fontSize={11} fill={INK} {...numeric}>
              {formatReagentNumber(row.volumeMl)}
            </text>
            <text x={COLUMNS.yield} y={y} fontSize={11} fill={INK} {...numeric}>
              {row.row.role === "product" ? formatReagentNumber(row.row.yieldPercent ?? 100) : ""}
            </text>
          </g>
        );
      })}
    </g>
  );
});
