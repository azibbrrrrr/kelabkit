// "Senarai bayaran": a member-by-month list of who has paid a monthly collection, shaped to
// be posted as an image. Pure read model over the View: nothing here writes, and nothing here
// knows about React, canvas or files. Screen, CSV, image, PDF and Excel all render the same
// `Sheet`, so an export always equals what the treasurer sees.
//
// Only confirmed money counts. Pending and reversed payments never reach this list, and the
// output carries no phone, note, reference or exemption reason: it goes to a group chat.

import { formatDayShort, formatMonth } from "@/lib/format";
import { sum } from "@/lib/money/amount";
import { monthOf } from "@/lib/money/months";
import type { Collection, Day, Member, MemberCategory, Month, Sen } from "@/lib/types";
import type { View } from "@/lib/view";

export type ListCell =
  | { kind: "paid"; date: Day | null }
  | { kind: "partial" }
  | { kind: "exempt" }
  | { kind: "blank" };

export type ListColumn = { periodId: string; month: Month; future: boolean };

export type ListRow = {
  memberId: string;
  name: string;
  category: MemberCategory | null;
  /** One cell per column of the list, in column order. */
  cells: ListCell[];
  /** Confirmed money allocated to this collection's charges; null when every charge is exempt. */
  total: Sen | null;
};

export type PaymentList = {
  collectionId: string;
  collectionName: string;
  columns: ListColumn[];
  rows: ListRow[];
};

const CATEGORY_ORDER: (MemberCategory | null)[] = ["guru", "kakitangan", "lain", null];

/** Every member with a charge in this monthly collection, by category then name. */
export function buildPaymentList(view: View, collection: Collection, today: Day, memberName?: (member: Member) => string): PaymentList {
  const periods = view.periodsByCollection.get(collection.id) ?? [];
  const thisMonth = monthOf(today);
  const columns: ListColumn[] = periods.map((period) => ({ periodId: period.id, month: period.month, future: period.month > thisMonth }));
  const columnIndex = new Map(periods.map((period, i) => [period.id, i]));

  const byMember = new Map<string, ListCell[]>();
  const totals = new Map<string, { confirmed: Sen[]; allExempt: boolean }>();
  for (const charge of view.chargesByCollection.get(collection.id) ?? []) {
    const ledger = view.ledgers.get(charge.id);
    const at = charge.periodId ? columnIndex.get(charge.periodId) : undefined;
    if (!ledger || at === undefined) continue;
    const cells = byMember.get(charge.memberId) ?? columns.map((): ListCell => ({ kind: "blank" }));
    // Pending money is not in `confirmed`; a free (amount 0) charge has nothing to show as paid.
    cells[at] =
      ledger.status === "exempt"
        ? { kind: "exempt" }
        : ledger.status === "paid" && ledger.required > 0
          ? { kind: "paid", date: ledger.lastPaidOn }
          : ledger.status === "partial"
            ? { kind: "partial" }
            : { kind: "blank" };
    byMember.set(charge.memberId, cells);
    const total = totals.get(charge.memberId) ?? { confirmed: [], allExempt: true };
    total.confirmed.push(ledger.confirmed);
    if (!charge.exempt) total.allExempt = false;
    totals.set(charge.memberId, total);
  }

  const rows: ListRow[] = [];
  for (const [memberId, cells] of byMember) {
    const member = view.membersById.get(memberId);
    if (!member) continue;
    const total = totals.get(memberId)!;
    rows.push({
      memberId,
      name: memberName ? memberName(member) : member.name,
      category: member.category,
      cells,
      total: total.allExempt ? null : sum(total.confirmed),
    });
  }
  rows.sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name, "ms"),
  );
  return { collectionId: collection.id, collectionName: collection.name, columns, rows };
}

/** The period "Bulan ini" shows: today's month, else the nearest earlier one, else the first. */
export function currentColumnIndex(columns: ListColumn[], today: Day): number {
  if (columns.length === 0) return -1;
  const thisMonth = monthOf(today);
  let earlier = -1;
  for (let i = 0; i < columns.length; i += 1) {
    if (columns[i].month === thisMonth) return i;
    if (columns[i].month < thisMonth && (earlier < 0 || columns[i].month > columns[earlier].month)) earlier = i;
  }
  return earlier >= 0 ? earlier : 0;
}

// Sheet: the list as the treasurer chose to show it ---------------------------------------

export type SheetOptions = {
  /** What a paid cell says: its date, or a tick. */
  cell: "date" | "tick";
  span: "year" | "month";
  total: "show" | "hide";
};
export const DEFAULT_SHEET_OPTIONS: SheetOptions = { cell: "date", span: "year", total: "show" };

/** Every word on the sheet, already translated: the screen and the exports share it. */
export type SheetTexts = {
  title: (monthLabel: string | null) => string;
  asOf: string;
  nameHeader: string;
  totalHeader: string;
  partial: string;
  exempt: string;
  tick: string;
  group: (category: MemberCategory | null) => string;
  legend: { paid: string; blank: string; partial: string; exempt: string };
};

export type SheetCell = { kind: ListCell["kind"]; text: string };
export type SheetRow = { key: string; name: string; cells: SheetCell[]; total: string | null; totalSen: Sen | null };
export type SheetGroup = { label: string | null; rows: SheetRow[] };
export type Sheet = {
  title: string;
  asOf: string;
  nameHeader: string;
  totalHeader: string;
  month: boolean;
  columns: { label: string; future: boolean }[];
  showTotal: boolean;
  groups: SheetGroup[];
  legend: { kind: ListCell["kind"]; label: string }[];
};

export function buildSheet(list: PaymentList, options: SheetOptions, today: Day, texts: SheetTexts, formatSen: (sen: Sen) => string): Sheet {
  const month = options.span === "month";
  const only = month ? currentColumnIndex(list.columns, today) : -1;
  const at = month ? (only >= 0 ? [only] : []) : list.columns.map((_, i) => i);
  const cellText = (cell: ListCell) => {
    if (cell.kind === "paid") return options.cell === "date" && cell.date ? formatDayShort(cell.date) : texts.tick;
    if (cell.kind === "partial") return texts.partial;
    if (cell.kind === "exempt") return texts.exempt;
    return "";
  };
  const rows: (SheetRow & { category: MemberCategory | null })[] = list.rows.map((row) => ({
    key: row.memberId,
    category: row.category,
    name: row.name,
    cells: at.map((i) => ({ kind: row.cells[i].kind, text: cellText(row.cells[i]) })),
    total: row.total === null ? null : formatSen(row.total),
    totalSen: row.total,
  }));
  const categories = CATEGORY_ORDER.filter((category) => rows.some((row) => row.category === category));
  const groups: SheetGroup[] = categories.map((category) => ({
    label: categories.length > 1 ? texts.group(category) : null,
    rows: rows.filter((row) => row.category === category).map(({ category: _category, ...row }) => row),
  }));
  return {
    title: texts.title(month && only >= 0 ? formatMonth(list.columns[only].month) : null),
    asOf: texts.asOf,
    nameHeader: texts.nameHeader,
    totalHeader: texts.totalHeader,
    month,
    columns: at.map((i) => ({ label: formatMonth(list.columns[i].month, false).toLocaleUpperCase(), future: list.columns[i].future })),
    showTotal: options.total === "show",
    groups,
    legend: [
      { kind: "paid", label: texts.legend.paid },
      { kind: "blank", label: texts.legend.blank },
      { kind: "partial", label: texts.legend.partial },
      { kind: "exempt", label: texts.legend.exempt },
    ],
  };
}
