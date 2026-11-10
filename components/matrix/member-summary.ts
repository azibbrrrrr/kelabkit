import type { Member } from "@/lib/types";
import type { MatrixColumn, View } from "@/lib/view";

export type MemberSummary = {
  /** Required on charges already due (future months excluded). */
  requiredNow: number;
  /** Confirmed money on those same charges, capped at what each requires. */
  confirmedNow: number;
  /** Outstanding on charges already due: the "Baki semasa". */
  dueNow: number;
  /** All confirmed money in the visible columns, voluntary included. */
  received: number;
  /** Recorded but unconfirmed. Never part of received. */
  pending: number;
};

/** Sums ledger figures over the columns on screen; status itself is never recomputed here. */
export function summarizeMember(view: View, member: Member, columns: MatrixColumn[]): MemberSummary {
  const sum: MemberSummary = { requiredNow: 0, confirmedNow: 0, dueNow: 0, received: 0, pending: 0 };
  for (const column of columns) {
    const cell = view.cell(member, column);
    if (cell.kind === "voluntary") {
      sum.received += cell.received;
      sum.pending += cell.pending;
    } else if (cell.kind === "charge") {
      const { ledger } = cell;
      sum.received += ledger.confirmed;
      sum.pending += ledger.pending;
      if (!ledger.future) {
        sum.requiredNow += ledger.required;
        sum.confirmedNow += Math.min(ledger.confirmed, ledger.required);
        sum.dueNow += ledger.remaining;
      }
    }
  }
  return sum;
}

/** One collection's columns: the months of a monthly collection, or the single column. */
export type CollectionGroup = { collection: MatrixColumn["collection"]; columns: MatrixColumn[] };

export function groupColumns(columns: MatrixColumn[]): CollectionGroup[] {
  const map = new Map<string, CollectionGroup>();
  for (const column of columns) {
    const group = map.get(column.collection.id);
    if (group) group.columns.push(column);
    else map.set(column.collection.id, { collection: column.collection, columns: [column] });
  }
  return [...map.values()];
}
