// Input rules shared by every KelabBackend implementation (demo in the browser, neon on the
// server), so a name or an amount is refused identically in both.

import { KelabError } from "@/lib/errors";
import { MAX_AMOUNT_SEN } from "@/lib/money/amount";
import type { Sen } from "@/lib/types";

export function cleanName(name: string) {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value) throw new KelabError("NAME_REQUIRED");
  if (value.length > 120) throw new KelabError("NAME_TOO_LONG");
  return value;
}

export function checkAmount(amount: Sen, allowZero = false) {
  if (!Number.isInteger(amount)) throw new KelabError("AMOUNT_INVALID");
  if (amount < 0) throw new KelabError("AMOUNT_NEGATIVE");
  if (amount === 0 && !allowZero) throw new KelabError("AMOUNT_ZERO");
  if (amount > MAX_AMOUNT_SEN) throw new KelabError("AMOUNT_TOO_LARGE");
}

export function checkReason(reason: string | null | undefined) {
  if (!reason || !reason.trim()) throw new KelabError("REASON_REQUIRED");
  return reason.trim();
}
