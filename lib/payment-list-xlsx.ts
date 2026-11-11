// Rows for the Excel export of the payment list, built from the same Sheet as the screen.
// Pure: the library call (write-excel-file, loaded on click) stays in the component. The one
// place sen become ringgit is the Jumlah cell, at this output boundary.

import type { Sheet } from "@/lib/payment-list";
import type { SheetData } from "write-excel-file/browser";

export type XlsxCell = {
  value?: string | number | null;
  type?: StringConstructor | NumberConstructor;
  format?: string;
  fontWeight?: "bold";
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
  columnSpan?: number;
} | null;

/** Hex colours for the sheet, resolved from the theme by the caller. */
export type XlsxColors = {
  headerFill: string;
  headerText: string;
  futureFill: string;
  futureText: string;
  groupFill: string;
  groupText: string;
  paid: { fill: string; text: string };
  partial: { fill: string; text: string };
  exempt: { fill: string; text: string };
  muted: string;
};

export const RM_FORMAT = '"RM" #,##0.00';
/** Characters wide: the name column, a month, the total. */
const NAME_WIDTH = 34;
const CELL_WIDTH = 9;
const TOTAL_WIDTH = 13;

export function buildXlsxRows(sheet: Sheet, colors: XlsxColors) {
  const width = 1 + sheet.columns.length + (sheet.showTotal ? 1 : 0);
  const pad = (cell: XlsxCell): XlsxCell[] => [cell, ...Array.from({ length: width - 1 }, () => null)];
  const data: XlsxCell[][] = [];
  data.push(pad({ value: sheet.title, fontWeight: "bold", columnSpan: width }));
  data.push(pad({ value: sheet.asOf, textColor: colors.muted, columnSpan: width }));
  data.push([
    { value: sheet.nameHeader, fontWeight: "bold", textColor: colors.headerText, backgroundColor: colors.headerFill, align: "left" },
    ...sheet.columns.map((column): XlsxCell => ({
      value: column.label,
      fontWeight: "bold",
      align: "center",
      textColor: column.future ? colors.futureText : colors.headerText,
      backgroundColor: column.future ? colors.futureFill : colors.headerFill,
    })),
    ...(sheet.showTotal
      ? [{ value: sheet.totalHeader, fontWeight: "bold", align: "center", textColor: colors.headerText, backgroundColor: colors.headerFill } as XlsxCell]
      : []),
  ]);
  for (const group of sheet.groups) {
    if (group.label) {
      data.push([
        { value: group.label, fontWeight: "bold", textColor: colors.groupText, backgroundColor: colors.groupFill, columnSpan: width },
        ...Array.from({ length: width - 1 }, () => null),
      ]);
    }
    for (const row of group.rows) {
      data.push([
        { value: row.name },
        ...row.cells.map((cell): XlsxCell => {
          if (cell.kind === "blank") return { value: null };
          const tone = colors[cell.kind];
          return { value: cell.text, align: "center", textColor: tone.text, backgroundColor: tone.fill, fontWeight: cell.kind === "partial" ? "bold" : undefined };
        }),
        ...(sheet.showTotal
          ? [
              row.totalSen === null
                ? ({ value: "—", align: "center", textColor: colors.muted } as XlsxCell)
                : ({ value: row.totalSen / 100, type: Number, format: RM_FORMAT, fontWeight: "bold" } as XlsxCell),
            ]
          : []),
      ]);
    }
  }
  const columns = [{ width: NAME_WIDTH }, ...sheet.columns.map(() => ({ width: CELL_WIDTH })), ...(sheet.showTotal ? [{ width: TOTAL_WIDTH }] : [])];
  // Title, as-of line and header stay put while the list scrolls.
  return { data: data as SheetData, columns, stickyRowsCount: 3, stickyColumnsCount: 1 };
}
