"use client";

import { formatMoney, formatMoneyShort, formatMonth } from "@/lib/format";
import { cellStatusLabels } from "@/lib/labels";
import type { MatrixCell } from "@/lib/view";
import { cn } from "@/lib/utils";

/** One month of a monthly collection; colour, word and amount all carry the status. */
export function MonthTile({ cell, onOpen }: { cell: MatrixCell; onOpen: () => void }) {
  const month = cell.column.period ? formatMonth(cell.column.period.month, false) : "";
  if (cell.kind !== "charge")
    return (
      <span className="grid h-12 place-items-center rounded-lg bg-st-na-bg text-[10px] text-st-na" aria-label={`${month}: Tidak Berkaitan`}>
        {month}
      </span>
    );
  const { ledger, status } = cell;
  const tone = ledger.overdue
    ? "bg-st-overdue-bg text-st-overdue"
    : status === "paid"
      ? "bg-st-paid-bg text-st-paid"
      : status === "partial"
        ? "bg-st-partial-bg text-st-partial"
        : status === "exempt"
          ? "bg-st-exempt-bg text-st-exempt"
          : status === "future"
            ? "bg-st-future-bg text-st-future"
            : ledger.pending > 0
              ? "bg-st-pending-bg text-st-pending"
              : "bg-st-unpaid-bg text-st-unpaid";
  const words = [
    cellStatusLabels[status][0],
    ledger.overdue ? "Lewat" : null,
    ledger.pending > 0 ? "Menunggu Semakan" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${month}: ${words}, baki ${formatMoney(ledger.remaining)}`}
      title={`${month}: ${words}`}
      className={cn("grid h-12 place-items-center rounded-lg text-[10px] leading-tight font-semibold transition-[scale] duration-150 ease-out motion-safe:active:scale-[0.96]", tone)}
    >
      {month}
      <span className="font-normal">
        {status === "paid" ? "✓" : status === "exempt" ? "—" : formatMoneyShort(ledger.remaining)}
      </span>
    </button>
  );
}
