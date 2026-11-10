import type { Day, Month } from "@/lib/types";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(value: string): value is Month {
  return MONTH_RE.test(value);
}

function parts(month: Month) {
  const match = month.match(MONTH_RE);
  if (!match) throw new Error(`Not a month: ${month}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** Days in a calendar month, leap years included. */
export function daysInMonth(month: Month) {
  const { year, month: m } = parts(month);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export function addMonths(month: Month, count: number): Month {
  const { year, month: m } = parts(month);
  const index = year * 12 + (m - 1) + count;
  const y = Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return `${y}-${String(mm).padStart(2, "0")}`;
}

/** Every month from start to end inclusive. Empty when end is before start. */
export function monthsBetween(start: Month, end: Month): Month[] {
  if (end < start) return [];
  const months: Month[] = [];
  for (let month = start; month <= end; month = addMonths(month, 1)) months.push(month);
  return months;
}

/**
 * The due day for a month, clamped to the month's last day so "31" means 28 or 29
 * February and 30 April rather than spilling into the next month.
 */
export function dueDateFor(month: Month, dueDay: number | null): Day | null {
  if (dueDay === null) return null;
  const day = Math.min(Math.max(1, Math.trunc(dueDay)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function monthOf(day: Day): Month {
  return day.slice(0, 7);
}
