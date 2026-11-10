import type { TFunction } from "@/lib/i18n/react";
import type { Day } from "@/lib/types";

/** The date rule shared by every way of recording a payment: required, and never in the future. */
export function paidOnError(t: TFunction, paidOn: Day, today: Day): string | null {
  if (!paidOn) return t("paymentNew.errors.pickDate");
  if (paidOn > today) return t("paymentNew.errors.futureDate");
  return null;
}
