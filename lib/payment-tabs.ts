// Tabs of the payments list (/bayaran/?tab=…). Perlu semakan is the queue of payments recorded but
// not yet confirmed as received; Disahkan and Semua are the history. With nothing to review the page
// opens on Semua; with something to review it opens on the queue, so a pending payment is never
// buried. An explicit ?tab= always wins.

export type PaymentTab = "semakan" | "disahkan" | "semua";
export const PAYMENT_TABS: readonly PaymentTab[] = ["semakan", "disahkan", "semua"];

export function resolvePaymentTab(raw: string | null, pendingCount: number): { tab: PaymentTab; legacyReversed: boolean } {
  // Before the queue tabs, ?tab=dibatalkan listed reversed payments; that is now Semua filtered by status.
  if (raw === "dibatalkan") return { tab: "semua", legacyReversed: true };
  if (PAYMENT_TABS.includes(raw as PaymentTab)) return { tab: raw as PaymentTab, legacyReversed: false };
  return { tab: pendingCount > 0 ? "semakan" : "semua", legacyReversed: false };
}
