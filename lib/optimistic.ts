// What the screen shows for a payment before the server has answered. The server stays the
// authority: its snapshot replaces this, and a refusal puts the stored snapshot back.

import type { ContributionInput, PaymentInput } from "@/lib/backend/types";
import type { Optimistic } from "@/components/data-provider";
import type { Payment } from "@/lib/types";

const payment = (base: PaymentInput | ContributionInput, amount: number, collectionId: string | null): Payment => {
  const at = new Date().toISOString();
  return {
    id: `pending:${base.idempotencyKey}`,
    idempotencyKey: base.idempotencyKey,
    memberId: base.memberId,
    collectionId,
    amount,
    method: base.method,
    paidOn: base.paidOn,
    reference: base.reference?.trim() || null,
    note: base.note?.trim() || null,
    state: base.confirmed ? "confirmed" : "pending",
    createdAt: at,
    confirmedAt: base.confirmed ? at : null,
    reversedAt: null,
    reversalReason: null,
  };
};

/** Key of a cell that is saving: the charge id, or "member:collection" for a voluntary column. */
export const voluntaryKey = (memberId: string, collectionId: string) => `${memberId}:${collectionId}`;

export function optimisticPayment(input: PaymentInput): Optimistic {
  const total = input.allocations.reduce((sum, a) => sum + a.amount, 0);
  const id = `pending:${input.idempotencyKey}`;
  return {
    key: input.allocations[0]?.chargeId ?? id,
    apply: (snapshot) => ({
      ...snapshot,
      payments: [...snapshot.payments, payment(input, total, null)],
      allocations: [...snapshot.allocations, ...input.allocations.map((a, i) => ({ id: `${id}:${i}`, paymentId: id, chargeId: a.chargeId, amount: a.amount }))],
    }),
  };
}

export function optimisticContribution(input: ContributionInput): Optimistic {
  return {
    key: voluntaryKey(input.memberId, input.collectionId),
    apply: (snapshot) => ({ ...snapshot, payments: [...snapshot.payments, payment(input, input.amount, input.collectionId)] }),
  };
}
