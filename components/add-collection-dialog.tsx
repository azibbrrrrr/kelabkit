"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import { SegmentedChoice } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { MoneyInput, parseMoney } from "@/components/money-input";
import { MonthPicker } from "@/components/month-picker";
import { Button } from "@/components/ui/button";
import { ModalBody, ModalError, ModalField, ModalFooter, ModalHeader, ModalSection, modalFormClass } from "@/components/modal";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/react";
import { messageFor } from "@/lib/errors";
import { formatMoney, today } from "@/lib/format";
import { suggestIcon } from "@/lib/collection-icon";
import { collectionTypeLabels } from "@/lib/labels";
import { monthsBetween } from "@/lib/money/months";
import type { CollectionType, Sen } from "@/lib/types";
import { Layers } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

/**
 * The matrix's "add column": a short form for the common case of every active member at
 * the same amount. Anything more specific (selected members, overrides, exemptions) goes
 * through the full Tambah Kutipan wizard.
 */
export function AddCollectionDialog({
  open,
  onOpenChange,
  onCreated,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened without a Trigger: lets the caller return focus to whatever opened it. */
  onCloseAutoFocus?: (event: Event) => void;
  onCreated?: (collectionId: string) => void;
}) {
  const { data } = useSnapshot();
  const { run } = useKelab();
  const t = useT();
  const year = today().slice(0, 4);
  const [name, setName] = useState("");
  const [type, setType] = useState<CollectionType>("one_off");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startMonth, setStartMonth] = useState(`${year}-01`);
  const [endMonth, setEndMonth] = useState(`${year}-12`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = data.members.filter((member) => member.active);
  const parsed = amount.trim() ? parseMoney(amount) : null;
  const months = type === "monthly" ? monthsBetween(startMonth, endMonth).length : 1;
  const total = parsed?.sen ? parsed.sen * members.length * months : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(t("dialogs.addCollection.nameRequired"));
    let defaultAmount: Sen | null = null;
    if (type !== "voluntary") {
      const result = parseMoney(amount);
      if (result.error !== null) return setError(result.error);
      if (result.sen === 0) return setError(t("dialogs.addCollection.amountPositive"));
      defaultAmount = result.sen;
    }
    if (type === "monthly" && endMonth < startMonth) return setError(t("dialogs.addCollection.endBeforeStart"));
    setBusy(true);
    setError(null);
    try {
      const id = await run((backend) =>
        backend.createCollection({
          name,
          // Same default as the wizard: an icon suggested from the name, changeable later.
          icon: suggestIcon(name),
          type,
          defaultAmount,
          description: null,
          notes: null,
          dueDate: type === "one_off" && dueDate ? dueDate : null,
          startMonth: type === "monthly" ? startMonth : null,
          endMonth: type === "monthly" ? endMonth : null,
          dueDay: type === "monthly" ? 10 : null,
          participants: members.map((member) => ({ memberId: member.id, amountOverride: null, exempt: false, note: null })),
          activate: true,
        }),
      );
      toast.success(t("dialogs.addCollection.created", { name: name.trim(), count: members.length }));
      setName("");
      setAmount("");
      setDueDate("");
      onOpenChange(false);
      onCreated?.(id);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent size="md" onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={submit} className={modalFormClass} noValidate>
          <ModalHeader icon={Layers} title={t("dialogs.addCollection.title")} description={t("dialogs.addCollection.description", { count: members.length })} />
          <ModalBody>
            <ModalSection label={t("dialogs.addCollection.section")}>
              <ModalField label={t("dialogs.addCollection.name")} htmlFor="col-name">
                <Input id="col-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("dialogs.addCollection.namePlaceholder")} />
              </ModalField>
              <ModalField label={t("dialogs.addCollection.type")} labelId="col-type-label">
                <SegmentedChoice<CollectionType>
                  joined
                  label={t("dialogs.addCollection.type")}
                  value={type}
                  onChange={setType}
                  options={(Object.keys(collectionTypeLabels) as CollectionType[]).map((value) => ({ value, label: collectionTypeLabels[value] }))}
                />
              </ModalField>
              {type !== "voluntary" && (
                <ModalField label={type === "monthly" ? t("dialogs.addCollection.amountMonthly") : t("dialogs.addCollection.amountEach")} htmlFor="col-amount" error={parsed?.error}>
                  <MoneyInput id="col-amount" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25.00" invalid={Boolean(parsed?.error)} />
                </ModalField>
              )}
            </ModalSection>
            {(type === "one_off" || type === "monthly") && (
              <ModalSection label={t("dialogs.addCollection.period")} divided>
                {type === "one_off" && (
                  <ModalField label={t("dialogs.addCollection.due")} htmlFor="col-due" helper={t("dialogs.addCollection.dueHelper")}>
                    <DatePicker id="col-due" value={dueDate} onChange={setDueDate} clearable emptyLabel={t("dialogs.addCollection.noDue")} clearLabel={t("dialogs.addCollection.noDue")} />
                  </ModalField>
                )}
                {type === "monthly" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <ModalField label={t("dialogs.addCollection.startMonth")} htmlFor="col-start">
                        <MonthPicker id="col-start" value={startMonth} onChange={setStartMonth} />
                      </ModalField>
                      <ModalField label={t("dialogs.addCollection.endMonth")} htmlFor="col-end">
                        <MonthPicker id="col-end" value={endMonth} min={startMonth} onChange={setEndMonth} />
                      </ModalField>
                    </div>
                    <p className="-mt-2 text-xs leading-4 text-muted-foreground">{t("dialogs.addCollection.monthlyNote")}</p>
                  </>
                )}
              </ModalSection>
            )}
            {total !== null && (
              <p className="rounded-[10px] bg-primary-tint px-3 py-2.5 text-sm">
                {t("dialogs.addCollection.expected")} <b className="tabular-nums">{formatMoney(total)}</b>
                <span className="text-muted-foreground">
                  {" "}
                  {type === "monthly" ? t("dialogs.addCollection.expectedDetailMonths", { members: members.length, months }) : t("dialogs.addCollection.expectedDetail", { members: members.length })}
                </span>
              </p>
            )}
            <p className="text-xs leading-4 text-muted-foreground">
              {t("dialogs.addCollection.morePrefix")}{" "}
              <Link href="/kutipan/baru/" className="font-medium text-primary-strong underline-offset-2 hover:underline">
                {t("dialogs.addCollection.wizard")}
              </Link>
              .
            </p>
            {error && <ModalError>{error}</ModalError>}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("dialogs.addCollection.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner className="size-4" />}
              {t("dialogs.addCollection.submit")}
            </Button>
          </ModalFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
