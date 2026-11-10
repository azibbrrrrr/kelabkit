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
import { useT } from "@/lib/i18n/react";
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
  empty,
  className,
}: {
  payments: Payment[];
  /** Show only the part of each payment that went to these charges. */
  highlightChargeIds?: string[];
  showMember?: boolean;
  empty?: string;
  className?: string;
}) {
  const t = useT();
  const { data, view } = useSnapshot();
  const { run } = useKelab();
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!payments.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty ?? t("payments.empty")}</p>;

  const confirm = async (payment: Payment) => {
    setConfirming(payment.id);
    try {
      await run((backend) => backend.confirmPayment(payment.id));
      toast.success(t("payments.confirmedToast", { amount: formatMoney(payment.amount) }));
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
            ? [view.collectionsById.get(payment.collectionId)?.name ?? t("payments.contributionFallback")]
            : allocations.map((allocation) => {
                const charge = data.charges.find((row) => row.id === allocation.chargeId);
                if (!charge) return t("payments.chargeFallback");
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
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{t("payments.ofTotal", { amount: formatMoney(payment.amount) })}</span>
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
                      {t("payments.reversedOn", { when: formatDateTime(payment.reversedAt), reason: payment.reversalReason ?? "" })}
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
                      {t("payments.confirmReceived")}
                    </Button>
                  )}
                  <AttachProofButton payment={payment} />
                  <Button size="sm" variant="danger-outline" onClick={() => setReversing(payment)}>
                    <Undo2 /> {t("payments.reverse")}
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
        title={t("payments.reverseTitle")}
        description={
          reversing && (
            <>
              {t("payments.reverseDescriptionBefore", { amount: formatMoney(reversing.amount), date: formatDay(reversing.paidOn) })}{" "}
              <b>{paymentStateLabels.reversed[0]}</b>
              {t("payments.reverseDescriptionAfter")}
            </>
          )
        }
        confirmLabel={t("payments.reverseConfirm")}
        destructive
        success={t("payments.reverseSuccess")}
        onConfirm={(reason) => run((backend) => backend.reversePayment(reversing!.id, reason))}
      />
    </>
  );
}
