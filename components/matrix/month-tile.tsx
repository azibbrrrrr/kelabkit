"use client";

import { formatMoney, formatMoneyShort, formatMonth } from "@/lib/format";
import { cellStatusLabels, overdueLabel, pendingLabel } from "@/lib/labels";
import type { MatrixCell } from "@/lib/view";
import { useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";

/**
 * One month of a monthly collection; colour, word and amount all carry the status. The
 * accessible name starts with the visible month and amount (label in name), then adds the words.
 */
export function MonthTile({ cell, onOpen, compact }: { cell: MatrixCell; onOpen: (element: HTMLButtonElement) => void; compact?: boolean }) {
  const t = useT();
  const month = cell.column.period ? formatMonth(cell.column.period.month, false) : "";
  if (cell.kind !== "charge")
    return (
      <span className={cn("grid place-items-center rounded-lg bg-st-na-bg text-[10px] text-st-na", compact ? "h-8" : "h-12")}>
        <span>
          {month}
          <span className="sr-only">: {cellStatusLabels.na[0]}</span>
        </span>
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
    ledger.overdue ? overdueLabel[0] : null,
    ledger.pending > 0 ? pendingLabel[0] : null,
  ]
    .filter(Boolean)
    .join(", ");
  const shown = status === "paid" || status === "exempt" ? null : formatMoneyShort(ledger.remaining);
  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`${month}${shown ? ` ${shown}` : ""}: ${words}, ${t("card.dueLabel", { amount: formatMoney(ledger.remaining) })}`}
      title={`${month}: ${words}`}
      className={cn("grid place-items-center rounded-lg text-[10px] leading-tight font-semibold transition-[scale] duration-150 ease-out motion-safe:active:scale-[0.96]", compact ? "h-8" : "h-12", tone)}
    >
      {month}
      {!compact && <span className="font-normal">{shown ?? (status === "paid" ? "✓" : "—")}</span>}
    </button>
  );
}
