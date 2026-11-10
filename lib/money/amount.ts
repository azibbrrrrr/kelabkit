import type { Sen } from "@/lib/types";

/** The largest single amount KelabKit accepts: RM100,000.00. */
export const MAX_AMOUNT_SEN: Sen = 10_000_000;

export type AmountError = "AMOUNT_REQUIRED" | "AMOUNT_INVALID" | "AMOUNT_NEGATIVE" | "AMOUNT_DECIMALS" | "AMOUNT_TOO_LARGE";

export type ParsedAmount = { ok: true; sen: Sen } | { ok: false; error: AmountError };

/**
 * Parses what a treasurer types ("10", "10.5", "RM 1,250.00") into integer sen without
 * floating point. Refuses negatives, more than two decimals and anything over the limit.
 */
export function parseRinggit(input: string): ParsedAmount {
  const raw = input.trim().replace(/^rm\s*/i, "").replace(/,/g, "").replace(/\s+/g, "");
  if (!raw) return { ok: false, error: "AMOUNT_REQUIRED" };
  if (raw.startsWith("-")) return { ok: false, error: "AMOUNT_NEGATIVE" };
  const match = raw.match(/^(\d*)(?:\.(\d*))?$/);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return { ok: false, error: "AMOUNT_INVALID" };
  const whole = match[1] || "0";
  const fraction = match[2] ?? "";
  if (fraction.length > 2) return { ok: false, error: "AMOUNT_DECIMALS" };
  if (whole.length > 9) return { ok: false, error: "AMOUNT_TOO_LARGE" };
  const sen = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (sen > MAX_AMOUNT_SEN) return { ok: false, error: "AMOUNT_TOO_LARGE" };
  return { ok: true, sen };
}

/** Sen as a plain editable string, e.g. 1050 → "10.50". */
export function senToInput(sen: Sen) {
  const whole = Math.trunc(sen / 100);
  const fraction = Math.abs(sen % 100);
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function sum(values: Sen[]) {
  return values.reduce((total, value) => total + value, 0);
}
