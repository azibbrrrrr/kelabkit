// What the Matriks footer row can show for one column. Pure functions over the read model's cells
// (lib/view.ts), so the figures follow the same ledger rules as the cells above them:
//   - only confirmed money counts as received; pending never does;
//   - exempt charges owe nothing and are left out of every ratio;
//   - a future month is scheduled, not due: it is never overdue and does not drag a percentage down;
//   - a voluntary collection has no charges, so it can only report what was received.

import type { MatrixSummary } from "@/lib/prefs";
import type { Sen } from "@/lib/types";
import type { MatrixCell } from "@/lib/view";

export type ColumnSummary =
  | { kind: "received"; received: Sen; expected: Sen; voluntary: boolean }
  /** `applicable` is false for a voluntary column: nothing can be overdue there. */
  | { kind: "overdue"; amount: Sen; count: number; applicable: boolean }
  /** `percent` is null when nothing in the column is due yet (no ratio to show). */
  | { kind: "percent"; percent: number | null; settled: number; total: number }
  /** `total` is null for a voluntary column (no one is expected to give). */
  | { kind: "paidCount"; paid: number; total: number | null };

/**
 * A charge counts toward the ratios when it is due now, or when money has already been confirmed on
 * it (an advance payment on a future month). Exempt charges and cells with no charge never count.
 */
function counted(cell: MatrixCell) {
  return cell.kind === "charge" && cell.status !== "exempt" && (!cell.ledger.future || cell.ledger.confirmed > 0);
}

export function summariseColumn(kind: MatrixSummary, cells: MatrixCell[]): ColumnSummary {
  const voluntary = cells.some((cell) => cell.kind === "voluntary");
  if (kind === "received") {
    let expected = 0;
    let received = 0;
    for (const cell of cells) {
      if (cell.kind === "charge") {
        expected += cell.ledger.required;
        received += cell.ledger.confirmed;
      } else if (cell.kind === "voluntary") received += cell.received;
    }
    return { kind, received, expected, voluntary };
  }
  if (kind === "overdue") {
    let amount = 0;
    let count = 0;
    for (const cell of cells) {
      if (cell.kind === "charge" && cell.ledger.overdue) {
        amount += cell.ledger.remaining;
        count += 1;
      }
    }
    return { kind, amount, count, applicable: !voluntary };
  }
  if (kind === "percent") {
    let settled = 0;
    let total = 0;
    for (const cell of cells) {
      if (cell.kind !== "charge" || !counted(cell)) continue;
      total += 1;
      if (cell.status === "paid") settled += 1;
    }
    return { kind, percent: total > 0 ? Math.round((settled / total) * 100) : null, settled, total };
  }
  let paid = 0;
  let total = 0;
  for (const cell of cells) {
    if (cell.kind === "voluntary") {
      if (cell.received > 0) paid += 1;
    } else if (cell.kind === "charge" && counted(cell)) {
      total += 1;
      if (cell.ledger.confirmed > 0) paid += 1;
    }
  }
  return { kind, paid, total: voluntary ? null : total };
}
