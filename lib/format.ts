// Money is integer sen. These helpers only format for display; amounts are computed in
// lib/money. Calendar values are Malaysia time.

import type { Day, Month, Sen } from "@/lib/types";

export const TZ = "Asia/Kuala_Lumpur";

const currency = new Intl.NumberFormat("ms-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("ms-MY", { maximumFractionDigits: 0 });
const malaysiaDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat("ms-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TZ,
});

const MONTHS_SHORT = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
const MONTHS_LONG = [
  "Januari",
  "Februari",
  "Mac",
  "April",
  "Mei",
  "Jun",
  "Julai",
  "Ogos",
  "September",
  "Oktober",
  "November",
  "Disember",
];

/** "RM 1,250.00" from sen. */
export const formatMoney = (sen: Sen) => `RM ${currency.format((sen || 0) / 100)}`;
/** "RM25" for whole ringgit, "RM12.50" otherwise: for dense grid cells. */
export const formatMoneyShort = (sen: Sen) =>
  sen % 100 === 0 ? `RM${whole.format(sen / 100)}` : `RM${currency.format(sen / 100)}`;
export const formatNumber = (value: number) => whole.format(value || 0);
export const formatPercent = (part: number, total: number) =>
  total > 0 ? `${(Math.round((part / total) * 1000) / 10).toLocaleString("ms-MY")}%` : "0%";

/** "15 Mac 2026" from a calendar day. */
export function formatDay(day?: Day | null) {
  if (!day) return "—";
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "15 Mac" without the year. */
export function formatDayShort(day?: Day | null) {
  if (!day) return "—";
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "Mac 2026" or "Mac" from a month. */
export function formatMonth(month: Month, withYear = true) {
  const [y, m] = month.split("-").map(Number);
  return withYear ? `${MONTHS_SHORT[m - 1]} ${y}` : MONTHS_SHORT[m - 1];
}

export function formatMonthLong(month: Month) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export const formatDateTime = (iso?: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");

/** Today's Malaysian calendar day as `YYYY-MM-DD`. */
export const today = (): Day => malaysiaDay.format(new Date());
export const dayOf = (iso: string): Day => malaysiaDay.format(new Date(iso));

export function initials(name: string) {
  const cleaned = name.replace(/^(cikgu|puan|encik|en\.|pn\.|tuan|dr\.?)\s+/i, "");
  return (
    cleaned
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** A Malaysian mobile number in wa.me form, e.g. "012-345 6789" → "60123456789". */
export function waNumber(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return `6${digits}`;
  return `60${digits}`;
}
