// Payment status is derived here from charges and payment allocations. Nothing stores a
// status a person can edit. The demo backend and every screen read these functions; in
// Phase 2 the same rules move into SQL and these tests become the oracle.

import { sum } from "@/lib/money/amount";
import { monthOf } from "@/lib/money/months";
import type { Allocation, Charge, CollectionPeriod, Day, Payment, Sen } from "@/lib/types";

export type ChargeStatus = "exempt" | "paid" | "partial" | "unpaid";

export type ChargeLedger = {
  charge: Charge;
  /** Amount payable; 0 when exempt. */
  required: Sen;
  /** Confirmed money allocated to this charge. Only this counts as collected. */
  confirmed: Sen;
  /** Money recorded but not yet confirmed by the treasurer. */
  pending: Sen;
  /** required − confirmed, never below 0. */
  remaining: Sen;
  /** What a new payment may still cover: required − confirmed − pending. */
  payable: Sen;
  status: ChargeStatus;
  /** Remaining > 0 and the due date is before today. Overlays the status. */
  overdue: boolean;
  /** A monthly period after the current month: scheduled, not yet due. */
  future: boolean;
  lastPaidOn: Day | null;
};

export type LedgerIndex = {
  paymentsById: Map<string, Payment>;
  allocationsByCharge: Map<string, Allocation[]>;
  periodsById: Map<string, CollectionPeriod>;
};

export function indexLedger(payments: Payment[], allocations: Allocation[], periods: CollectionPeriod[]): LedgerIndex {
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  const allocationsByCharge = new Map<string, Allocation[]>();
  for (const allocation of allocations) {
    const list = allocationsByCharge.get(allocation.chargeId);
    if (list) list.push(allocation);
    else allocationsByCharge.set(allocation.chargeId, [allocation]);
  }
  const periodsById = new Map(periods.map((period) => [period.id, period]));
  return { paymentsById, allocationsByCharge, periodsById };
}

export function chargeLedger(charge: Charge, index: LedgerIndex, today: Day): ChargeLedger {
  let confirmed = 0;
  let pending = 0;
  let lastPaidOn: Day | null = null;
  for (const allocation of index.allocationsByCharge.get(charge.id) ?? []) {
    const payment = index.paymentsById.get(allocation.paymentId);
    if (!payment) continue;
    if (payment.state === "confirmed") {
      confirmed += allocation.amount;
      if (!lastPaidOn || payment.paidOn > lastPaidOn) lastPaidOn = payment.paidOn;
    } else if (payment.state === "pending") {
      pending += allocation.amount;
    }
  }
  const required = charge.exempt ? 0 : charge.amount;
  const remaining = Math.max(0, required - confirmed);
  const payable = Math.max(0, required - confirmed - pending);
  const status: ChargeStatus = charge.exempt
    ? "exempt"
    : confirmed >= required
      ? "paid"
      : confirmed > 0
        ? "partial"
        : "unpaid";
  const period = charge.periodId ? index.periodsById.get(charge.periodId) : undefined;
  const future = Boolean(period && period.month > monthOf(today));
  const overdue = !charge.exempt && remaining > 0 && !future && charge.dueDate !== null && charge.dueDate < today;
  return { charge, required, confirmed, pending, remaining, payable, status, overdue, future, lastPaidOn };
}

export type Totals = {
  /** Sum of non-exempt charges in scope. */
  expected: Sen;
  /** Confirmed allocations in scope. */
  received: Sen;
  /** max(0, expected − received). */
  outstanding: Sen;
  /** Outstanding on charges already due (excludes future months). */
  dueNow: Sen;
  /** Outstanding on future months. */
  upcoming: Sen;
  /** Recorded but unconfirmed. Never part of received. */
  pending: Sen;
  counts: Record<ChargeStatus, number> & { overdue: number; pendingReview: number };
};

export function totalsOf(ledgers: ChargeLedger[]): Totals {
  const expected = sum(ledgers.map((ledger) => ledger.required));
  const received = sum(ledgers.map((ledger) => ledger.confirmed));
  const counts = { exempt: 0, paid: 0, partial: 0, unpaid: 0, overdue: 0, pendingReview: 0 };
  let dueNow = 0;
  let upcoming = 0;
  for (const ledger of ledgers) {
    counts[ledger.status] += 1;
    if (ledger.overdue) counts.overdue += 1;
    if (ledger.pending > 0) counts.pendingReview += 1;
    if (ledger.future) upcoming += ledger.remaining;
    else dueNow += ledger.remaining;
  }
  return {
    expected,
    received,
    outstanding: Math.max(0, expected - received),
    dueNow,
    upcoming,
    pending: sum(ledgers.map((ledger) => ledger.pending)),
    counts,
  };
}

/** Confirmed voluntary money for a collection, optionally for one member. */
export function voluntaryReceived(payments: Payment[], collectionId: string, memberId?: string) {
  return sum(
    payments
      .filter(
        (payment) =>
          payment.collectionId === collectionId &&
          payment.state === "confirmed" &&
          (memberId === undefined || payment.memberId === memberId),
      )
      .map((payment) => payment.amount),
  );
}

export type AllocationPlan = { chargeId: string; amount: Sen }[];

/**
 * Spreads an amount over charges in the given order (oldest first by convention),
 * filling each up to what it can still take. Refuses rather than overpays.
 */
export function allocateInOrder(
  amount: Sen,
  ledgers: Pick<ChargeLedger, "payable" | "charge">[],
): { ok: true; plan: AllocationPlan } | { ok: false; error: "OVERPAYMENT"; payable: Sen } {
  const payable = sum(ledgers.map((ledger) => ledger.payable));
  if (amount > payable) return { ok: false, error: "OVERPAYMENT", payable };
  const plan: AllocationPlan = [];
  let left = amount;
  for (const ledger of ledgers) {
    if (left <= 0) break;
    const take = Math.min(left, ledger.payable);
    if (take > 0) plan.push({ chargeId: ledger.charge.id, amount: take });
    left -= take;
  }
  return { ok: true, plan };
}
