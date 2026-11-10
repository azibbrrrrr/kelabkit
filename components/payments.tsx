"use client";

import { AttachProofButton, PaymentAttachments, ProofChip } from "@/components/attachments";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { ReasonDialog } from "@/components/reason-dialog";
import { LabelChip } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { messageFor } from "@/lib/errors";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { methodLabels, paymentStateLabels } from "@/lib/labels";
import type { Payment } from "@/lib/types";
import { allocationsOf, collectionPeriodLabel } from "@/lib/view";
import { cn } from "@/lib/utils";
import { BadgeCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Payment transactions, newest first, with the two corrections a treasurer may make:
 * confirm receipt of a pending payment, or reverse a payment with a reason. Nothing is
 * deleted; a reversed payment stays visible with its reason.
 */
export function PaymentList({
  payments,
  highlightChargeIds,
  showMember,
  empty = "Belum ada bayaran.",
  className,
}: {
  payments: Payment[];
  /** Show only the part of each payment that went to these charges. */
  highlightChargeIds?: string[];
  showMember?: boolean;
  empty?: string;
  className?: string;
}) {
  const { data, view } = useSnapshot();
  const { run } = useKelab();
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!payments.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;

  const confirm = async (payment: Payment) => {
    setConfirming(payment.id);
    try {
      await run((backend) => backend.confirmPayment(payment.id));
      toast.success(`Penerimaan ${formatMoney(payment.amount)} disahkan.`);
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setConfirming(null);
    }
  };

  return (
    <>
      <ul className={cn("grid gap-2", className)}>
        {payments.map((payment) => {
          const allocations = allocationsOf(data, payment.id);
          const relevant = highlightChargeIds ? allocations.filter((a) => highlightChargeIds.includes(a.chargeId)) : allocations;
          const shown = highlightChargeIds && payment.collectionId === null ? relevant.reduce((t, a) => t + a.amount, 0) : payment.amount;
          const targets = payment.collectionId
            ? [view.collectionsById.get(payment.collectionId)?.name ?? "Sumbangan"]
            : allocations.map((allocation) => {
                const charge = data.charges.find((row) => row.id === allocation.chargeId);
                if (!charge) return "Caj";
                const collection = view.collectionsById.get(charge.collectionId)!;
                const period = charge.periodId ? data.periods.find((p) => p.id === charge.periodId) ?? null : null;
                return `${collectionPeriodLabel(collection, period)} (${formatMoney(allocation.amount)})`;
              });
          return (
            <li
              key={payment.id}
              className={cn(
                "rounded-xl border border-border bg-card px-3 py-2.5",
                payment.state === "reversed" && "bg-muted/60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold tabular-nums", payment.state === "reversed" && "text-muted-foreground line-through")}>
                    {formatMoney(shown)}
                    {shown !== payment.amount && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">daripada {formatMoney(payment.amount)}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {showMember && <>{view.membersById.get(payment.memberId)?.name} · </>}
                    {formatDay(payment.paidOn)} · {methodLabels[payment.method]}
                    {payment.reference && <> · {payment.reference}</>}
                  </p>
                  <p className="mt-0.5 text-xs break-words text-muted-foreground">{targets.join(", ")}</p>
                  {payment.state === "reversed" && (
                    <p className="mt-1 text-xs text-st-unpaid">
                      Dibatalkan {formatDateTime(payment.reversedAt)}: {payment.reversalReason}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <LabelChip entry={paymentStateLabels[payment.state]} compact />
                  <ProofChip payment={payment} />
                </div>
              </div>
              <PaymentAttachments payment={payment} />
              {payment.state !== "reversed" && (
                <div className="mt-2.5 flex flex-wrap gap-2 border-t border-border pt-2.5">
                  {payment.state === "pending" && (
                    <Button size="sm" onClick={() => void confirm(payment)} disabled={confirming === payment.id}>
                      {confirming === payment.id ? <Spinner className="size-3.5" /> : <BadgeCheck />}
                      Sahkan wang diterima
                    </Button>
                  )}
                  <AttachProofButton payment={payment} />
                  <Button size="sm" variant="danger-outline" onClick={() => setReversing(payment)}>
                    <Undo2 /> Batalkan bayaran…
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ReasonDialog
        open={reversing !== null}
        onOpenChange={(open) => !open && setReversing(null)}
        title="Batalkan bayaran"
        description={
          reversing && (
            <>
              Bayaran {formatMoney(reversing.amount)} pada {formatDay(reversing.paidOn)} akan ditanda <b>Dibatalkan</b>. Rekod asal kekal
              dalam sejarah dan baki dikira semula.
            </>
          )
        }
        confirmLabel="Batalkan bayaran"
        destructive
        success="Bayaran dibatalkan. Baki dikira semula."
        onConfirm={(reason) => run((backend) => backend.reversePayment(reversing!.id, reason))}
      />
    </>
  );
}
