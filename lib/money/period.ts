// Month lens over the ledgers, for the dashboard period switcher. Nothing here derives a
// status: a month is just a filter on charges, and every figure still comes from
// `totalsOf` in ledger.ts (so "received" is confirmed allocations to those charges, and a
// month after the current one is "upcoming", never overdue).

import type { ChargeLedger } from "@/lib/money/ledger";
import { addMonths, isMonth, monthOf } from "@/lib/money/months";
import type { Charge, CollectionPeriod, Month, Sen } from "@/lib/types";

/** The month a charge belongs to: its period's month, else the month of its due date, else none. */
export function chargeMonth(charge: Charge, periodMonths: Map<string, Month>): Month | null {
  if (charge.periodId) return periodMonths.get(charge.periodId) ?? null;
  return charge.dueDate ? monthOf(charge.dueDate) : null;
}

export function periodMonthsById(periods: CollectionPeriod[]) {
  return new Map(periods.map((period) => [period.id, period.month]));
}

/** Months that have at least one charge, ascending. These are the choices in the period switcher. */
export function sessionMonths(charges: Charge[], periodMonths: Map<string, Month>): Month[] {
  const months = new Set<Month>();
  for (const charge of charges) {
    const month = chargeMonth(charge, periodMonths);
    if (month) months.add(month);
  }
  return [...months].sort();
}

/** The `?tempoh=` value if it names one of the session's months, otherwise null (whole session). */
export function parsePeriod(raw: string | null, months: Month[]): Month | null {
  return raw && isMonth(raw) && months.includes(raw) ? raw : null;
}

export function ledgersInMonth(ledgers: ChargeLedger[], month: Month, periodMonths: Map<string, Month>) {
  return ledgers.filter((ledger) => chargeMonth(ledger.charge, periodMonths) === month);
}

export type DeltaDirection = "up" | "down" | "flat";
export type Delta = {
  direction: DeltaDirection;
  /** Absolute change in sen (current − previous). */
  diff: Sen;
  /** Change as a percentage of the previous value, one decimal; null when the previous value is 0. */
  percent: number | null;
};

/**
 * Change from a previous month's figure to this month's. A zero base has no percentage (it
 * would be infinite), so callers show the amount instead; equal figures are "flat".
 */
export function deltaOf(current: Sen, previous: Sen): Delta {
  const diff = current - previous;
  if (diff === 0) return { direction: "flat", diff: 0, percent: previous === 0 ? null : 0 };
  const direction = diff > 0 ? "up" : "down";
  const percent = previous === 0 ? null : Math.round((Math.abs(diff) / Math.abs(previous)) * 1000) / 10;
  return { direction, diff, percent };
}

export function previousMonth(month: Month) {
  return addMonths(month, -1);
}
