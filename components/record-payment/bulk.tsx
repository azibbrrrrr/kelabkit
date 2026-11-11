"use client";

import { SegmentedChoice } from "@/components/choice";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { DatePicker } from "@/components/date-picker";
import { MoneyInput } from "@/components/money-input";
import { paidOnError } from "@/components/record-payment/validate";
import { LabelChip, SectionCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { messageFor } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { methodLabels, paymentStateLabels } from "@/lib/labels";
import { senToInput } from "@/lib/money/amount";
import { normaliseName } from "@/lib/names";
import { bulkTargets, planBulk } from "@/lib/record-bulk";
import type { PaymentMethod, Sen } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CircleCheckBig, Hourglass, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// Ramai: one charge, many members. Each ticked member gets their own payment row through the same
// backend.recordPayment call and the same rules as the single form (positive, never above what is
// still payable, no future date); pending money is never counted as received.

const methods = Object.keys(methodLabels) as PaymentMethod[];
type Done = { count: number; total: Sen; confirmed: boolean };

export function BulkForm() {
  const t = useT();
  const { data, view } = useSnapshot();
  const { run } = useKelab();
  const targets = useMemo(() => bulkTargets(data, view), [data, view]);
  const [targetKey, setTargetKey] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState(true);
  const [paidOn, setPaidOn] = useState(view.today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // One key per attempt, extended per member: a retry never records a member twice.
  const attemptKey = useRef<string>(crypto.randomUUID());

  const target = targets.find((row) => row.key === targetKey) ?? null;
  const q = normaliseName(query);
  const shown = useMemo(
    () => (target?.rows ?? []).filter((row) => !q || normaliseName(row.member.name).includes(q) || row.member.name.toLowerCase().includes(query.trim().toLowerCase())),
    [target, q, query],
  );

  const plan = planBulk(target?.rows ?? [], selected, inputs, {
    exceeds: (payable) => t("paymentNew.errors.exceedsBalance", { amount: formatMoney(payable) }),
    zero: t("paymentsPage.panel.bulkZero"),
  });
  const dateError = paidOnError(t, paidOn, view.today);
  const problems = [...Object.values(plan.errors), ...(dateError ? [dateError] : [])];
  const canSave = !busy && plan.lines.length > 0 && problems.length === 0;

  const choose = (key: string) => {
    setTargetKey(key);
    setSelected(new Set());
    setInputs({});
    setError(null);
    setDone(null);
  };
  const toggle = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setError(null);
  };

  const submit = async () => {
    if (!canSave) {
      if (!busy) setError(plan.lines.length === 0 ? t("paymentsPage.panel.bulkPickMembers") : (problems[0] ?? null));
      return;
    }
    setBusy(true);
    setError(null);
    const key = attemptKey.current;
    const saved: typeof plan.lines = [];
    const confirmed = received;
    try {
      await run(async (backend) => {
        for (const line of plan.lines) {
          await backend.recordPayment({
            idempotencyKey: `${key}:${line.memberId}:${line.chargeId}`,
            memberId: line.memberId,
            method,
            paidOn,
            reference: null,
            note: null,
            confirmed,
            allocations: [{ chargeId: line.chargeId, amount: line.amount }],
          });
          saved.push(line);
        }
      });
      attemptKey.current = crypto.randomUUID();
      const total = saved.reduce((sum, line) => sum + line.amount, 0);
      toast.success(t("paymentsPage.panel.bulkToast", { count: saved.length, amount: formatMoney(total) }));
      setDone({ count: saved.length, total, confirmed });
      setSelected(new Set());
      setInputs({});
    } catch (cause) {
      if (saved.length) {
        // Saved ones leave the list once the snapshot reloads; the rest stay ticked for another try.
        setSelected((current) => new Set([...current].filter((id) => !saved.some((line) => line.memberId === id))));
        setError(t("paymentsPage.panel.bulkPartial", { done: saved.length, total: plan.lines.length, error: messageFor(cause) }));
      } else setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <SectionCard>
        <div className="grid justify-items-center gap-2 py-1 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-st-paid-bg text-st-paid">
            <CircleCheckBig className="size-6" aria-hidden />
          </span>
          <h3 tabIndex={-1} ref={(el) => el?.focus()} className="font-display text-h2 outline-none">
            {t("paymentsPage.panel.bulkDone", { count: done.count, amount: formatMoney(done.total) })}
          </h3>
          <p className="text-sm text-muted-foreground">{done.confirmed ? t("paymentsPage.panel.bulkCounted") : t("paymentsPage.panel.bulkNotCounted")}</p>
          <LabelChip entry={paymentStateLabels[done.confirmed ? "confirmed" : "pending"]} />
          <Button className="mt-1 w-full" onClick={() => setDone(null)}>
            {t("paymentsPage.panel.bulkAgain")}
          </Button>
        </div>
      </SectionCard>
    );

  return (
    <div className="grid gap-4">
      <SectionCard>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-target" className="text-xs text-muted-foreground">
              {t("paymentsPage.panel.bulkTarget")}
            </Label>
            {targets.length === 0 ? (
              <p className="rounded-xl bg-st-paid-bg px-3 py-2.5 text-sm text-st-paid">{t("paymentsPage.panel.bulkNoTargets")}</p>
            ) : (
              <Select value={targetKey} onValueChange={choose}>
                <SelectTrigger id="bulk-target" className="w-full">
                  <SelectValue placeholder={t("paymentsPage.panel.bulkTargetPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((row) => (
                    <SelectItem key={row.key} value={row.key}>
                      {t("paymentsPage.panel.bulkTargetOption", { label: row.label, count: row.rows.length })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {target && (
            <>
              {target.awaitingReview > 0 && (
                <p className="flex items-start gap-1.5 rounded-lg bg-st-pending-bg px-2.5 py-2 text-xs text-st-pending">
                  <Hourglass className="mt-px size-3.5 shrink-0" aria-hidden />
                  {t("paymentsPage.panel.bulkAwaiting", { count: target.awaitingReview })}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("paymentsPage.panel.bulkMembers")} · {t("paymentsPage.panel.bulkSelected", { count: selected.size })}
                </span>
                <span className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setSelected(new Set(shown.map((row) => row.member.id)))}>
                    {t("paymentsPage.panel.bulkSelectAll")}
                  </Button>
                  {selected.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                      {t("paymentsPage.panel.bulkClear")}
                    </Button>
                  )}
                </span>
              </div>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("paymentsPage.panel.bulkSearch")}
                aria-label={t("paymentsPage.panel.bulkSearch")}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {shown.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">{t("paymentsPage.panel.bulkNoMatch")}</p>
              ) : (
                <ul className="grid max-h-72 gap-1 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1">
                  {shown.map((row) => {
                    const id = row.member.id;
                    const on = selected.has(id);
                    const rowError = plan.errors[id];
                    return (
                      <li key={id} className={cn("rounded-lg", on && "bg-primary-tint/60")}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-2.5 py-1.5">
                          <Checkbox checked={on} onCheckedChange={(next) => toggle(id, next === true)} aria-label={row.member.name} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={row.member.name}>
                            {row.member.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t("paymentsPage.panel.bulkPayable", { amount: formatMoney(row.payable) })}</span>
                        </label>
                        {on && (
                          <div className="grid gap-1 px-2.5 pb-2">
                            <MoneyInput
                              value={inputs[id] ?? ""}
                              onChange={(event) => {
                                setInputs((current) => ({ ...current, [id]: event.target.value }));
                                setError(null);
                              }}
                              placeholder={senToInput(row.payable)}
                              aria-label={t("paymentsPage.panel.bulkAmountLabel", { name: row.member.name })}
                              invalid={Boolean(rowError)}
                            />
                            {rowError ? <p className="text-xs font-medium text-st-unpaid">{rowError}</p> : <p className="text-caption text-muted-foreground">{t("paymentsPage.panel.bulkAmountHint")}</p>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </SectionCard>

      {target && (
        <SectionCard>
          <div className="grid gap-3">
            <SegmentedChoice
              label={t("paymentsPage.panel.bulkMethod")}
              value={method}
              options={methods.map((value) => ({ value, label: methodLabels[value] }))}
              onChange={(value) => {
                setMethod(value);
                setReceived(value === "cash");
              }}
              itemClassName="min-h-11 px-1.5"
            />
            <div className="grid min-w-0 gap-1">
              <Label htmlFor="bulk-date" className="text-xs text-muted-foreground">
                {t("paymentsPage.panel.bulkDate")}
              </Label>
              <DatePicker id="bulk-date" value={paidOn} max={view.today} onChange={setPaidOn} invalid={Boolean(dateError)} className="px-2.5" />
              {dateError && <p className="text-xs font-medium text-st-unpaid">{dateError}</p>}
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
              <Checkbox checked={received} onCheckedChange={(value) => setReceived(value === true)} className="mt-0.5" />
              <span className="text-xs leading-snug">
                <span className="block font-medium text-foreground">{t("paymentsPage.panel.bulkReceived")}</span>
                <span className="text-muted-foreground">{received ? t("paymentsPage.panel.bulkReceivedYes") : t("paymentsPage.panel.bulkReceivedNo")}</span>
              </span>
            </label>
          </div>
        </SectionCard>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-xl bg-st-unpaid-bg px-3 py-2 text-xs font-medium text-st-unpaid">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
      {target && (
        <Button size="lg" className="w-full" onClick={() => void submit()} disabled={busy || plan.lines.length === 0}>
          {busy && <Spinner className="size-4" />}
          {busy ? t("paymentsPage.panel.bulkSaving") : t("paymentsPage.panel.bulkSave", { count: plan.lines.length, amount: formatMoney(plan.total) })}
        </Button>
      )}
      {target && plan.lines.length > 0 && problems.length > 0 && <p className="text-xs text-st-partial">{problems[0]}</p>}
    </div>
  );
}
