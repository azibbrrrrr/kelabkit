"use client";

import { ProofField, attachStaged, type StagedFile } from "@/components/attachments";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { SegmentedChoice } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { MoneyInput, parseMoney } from "@/components/money-input";
import { PaymentList } from "@/components/payments";
import { ChargeStatusChips, Money, TextAction } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/errors";
import { useT } from "@/lib/i18n/react";
import { cellStatusLabels, methodLabels, pendingLabel } from "@/lib/labels";
import { formatDay, formatMoney, formatMonthLong, today } from "@/lib/format";
import { senToInput } from "@/lib/money/amount";
import type { ChargeLedger } from "@/lib/money/ledger";
import type { PaymentMethod, Sen } from "@/lib/types";
import { cellStatus, type MatrixCell } from "@/lib/view";
import { Undo2, UserMinus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

// The editor behind a matrix cell. Three tabs keep three different financial operations
// apart: recording a new payment, changing what the member owes, and correcting history.
// Typing an amount here always creates a new payment row; it never rewrites one.

export type EditorTab = "pay" | "amount" | "history";

export function CellEditor({
  cell,
  initialInput,
  onDone,
  onDirtyChange,
  hideTitle,
}: {
  cell: MatrixCell;
  /** The host already names the member and the line (the side panel's accordion). */
  hideTitle?: boolean;
  /** A digit typed on the selected cell, carried into the amount field. */
  initialInput?: string;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const title = cell.column.period ? `${cell.column.collection.name} · ${formatMonthLong(cell.column.period.month)}` : cell.column.collection.name;
  const archived = cell.column.collection.status === "archived";

  return (
    <div className="grid gap-3">
      {!hideTitle && (
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{cell.member.name}</p>
          <p className="truncate text-xs text-muted-foreground">{title}</p>
        </div>
      )}
      {archived ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{t("editor.archivedNote")}</p>
      ) : cell.kind === "na" ? (
        <IncludeMember cell={cell} onDone={onDone} />
      ) : cell.kind === "voluntary" ? (
        <VoluntaryEditor cell={cell} initialInput={initialInput} onDone={onDone} onDirtyChange={onDirtyChange} />
      ) : (
        <ChargeEditor ledger={cell.ledger} cell={cell} initialInput={initialInput} onDone={onDone} onDirtyChange={onDirtyChange} />
      )}
    </div>
  );
}

/**
 * Where focus goes when the editor opens: the field marked data-autofocus in the visible panel
 * (the amount on the pay tab), else the selected tab, else the first control. Hidden tab panels
 * stay mounted to keep typed input, so anything inside [hidden] is skipped.
 */
export function focusEditorStart(root: HTMLElement) {
  const visible = (el: HTMLElement) => !el.closest("[hidden]");
  const pick = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)].find(visible);
  const target =
    pick("[data-autofocus]") ??
    pick('[role="tab"][aria-selected="true"]') ??
    pick('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
  target?.focus();
  if (target instanceof HTMLInputElement && target.type === "text") target.setSelectionRange(target.value.length, target.value.length);
}

/** The editor's tab strip: Radix tabs (arrow keys, tabpanel wiring) in the editor's segmented look. */
function EditorTabs({ tabs }: { tabs: [EditorTab, string][] }) {
  const t = useT();
  return (
    <TabsList
      aria-label={t("editor.actionsLabel")}
      className="grid h-auto! w-full gap-1 rounded-xl bg-primary-tint p-1"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(([id, label]) => (
        <TabsTrigger
          key={id}
          value={id}
          className="min-h-9 rounded-lg px-1.5 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors data-active:bg-card data-active:font-semibold data-active:text-primary-strong data-active:shadow-sm"
        >
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

function Figures({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-2.5 text-center">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">{label}</dt>
          <dd className="truncate text-sm font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const methodValues: PaymentMethod[] = ["cash", "transfer", "other"];

/** Method, date, received flag and reference: the parts every payment form shares. */
function PaymentDetails({
  method,
  setMethod,
  paidOn,
  setPaidOn,
  received,
  setReceived,
  reference,
  setReference,
  staged,
  setStaged,
}: {
  method: PaymentMethod;
  setMethod: (method: PaymentMethod) => void;
  paidOn: string;
  setPaidOn: (day: string) => void;
  received: boolean;
  setReceived: (value: boolean) => void;
  reference: string;
  setReference: (value: string) => void;
  staged: StagedFile[];
  setStaged: (files: StagedFile[]) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <>
      <SegmentedChoice
        label={t("editor.methodLabel")}
        value={method}
        options={methodValues.map((value) => ({ value, label: methodLabels[value] }))}
        onChange={(value) => {
          setMethod(value);
          setReceived(value === "cash");
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-date`} className="text-xs text-muted-foreground">
            {t("editor.paidOn")}
          </Label>
          <DatePicker id={`${id}-date`} value={paidOn} max={today()} onChange={(day) => day && setPaidOn(day)} className="h-10 px-2.5" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-ref`} className="text-xs text-muted-foreground">
            {t("editor.reference")}
          </Label>
          <Input
            id={`${id}-ref`}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder={t("editor.referencePlaceholder")}
          />
        </div>
      </div>
      <ProofField staged={staged} onChange={setStaged} />
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
        <Checkbox checked={received} onCheckedChange={(value) => setReceived(value === true)} className="mt-0.5" />
        <span className="text-xs leading-snug">
          <span className="block font-medium text-foreground">{t("editor.received")}</span>
          <span className="text-muted-foreground">
            {received ? t("editor.receivedYes") : t("editor.receivedNo", { pending: pendingLabel[0] })}
          </span>
        </span>
      </label>
    </>
  );
}

function usePaymentForm(initialInput?: string) {
  const [amount, setAmount] = useState(initialInput ?? "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState(today());
  const [received, setReceived] = useState(true);
  const [reference, setReference] = useState("");
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per attempt: a double-click or network retry returns the same payment.
  const attemptKey = useRef<string>(crypto.randomUUID());
  return {
    amount,
    setAmount,
    method,
    setMethod,
    paidOn,
    setPaidOn,
    received,
    setReceived,
    reference,
    setReference,
    staged,
    setStaged,
    error,
    setError,
    busy,
    setBusy,
    attemptKey,
  };
}

function ChargeEditor({
  ledger,
  cell,
  initialInput,
  onDone,
  onDirtyChange,
}: {
  ledger: ChargeLedger;
  cell: Extract<MatrixCell, { kind: "charge" }>;
  initialInput?: string;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const { view } = useSnapshot();
  const [tab, setTab] = useState<EditorTab>(ledger.payable > 0 || initialInput ? "pay" : "history");
  // Both forms stay mounted (hidden when inactive), so input typed on one tab survives a trip
  // to another; each reports its own dirtiness and the editor is dirty if either is.
  const [payDirty, setPayDirty] = useState(false);
  const [amountDirty, setAmountDirty] = useState(false);
  useEffect(() => onDirtyChange?.(payDirty || amountDirty), [payDirty, amountDirty, onDirtyChange]);
  const payments = view.paymentsFor(cell.member.id, [ledger.charge.id]);
  const count = payments.length;
  const history = () => setTab("history");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChargeStatusChips status={cellStatus(ledger)} overdue={ledger.overdue} pending={ledger.pending > 0} compact />
        {ledger.charge.dueDate && <span className="text-xs text-muted-foreground">{t("editor.dueDate", { date: formatDay(ledger.charge.dueDate) })}</span>}
      </div>
      <Figures
        items={[
          [t("editor.figureRequired"), ledger.charge.exempt ? cellStatusLabels.exempt[0] : formatMoney(ledger.required)],
          [t("editor.figureReceived"), formatMoney(ledger.confirmed)],
          [t("editor.figureBalance"), formatMoney(ledger.remaining)],
        ]}
      />
      {ledger.pending > 0 && (
        <p className="rounded-xl bg-st-pending-bg px-3 py-2 text-xs text-st-pending">
          {t("editor.pendingNotice", { amount: formatMoney(ledger.pending), received: t("editor.figureReceived") })}
        </p>
      )}
      <Tabs value={tab} onValueChange={(value) => setTab(value as EditorTab)} className="gap-3">
        <EditorTabs
          tabs={[
            ["pay", t("editor.tabPay")],
            ["amount", t("editor.tabAmount")],
            ["history", t("editor.tabHistory", { count })],
          ]}
        />
        <TabsContent value="pay" forceMount hidden={tab !== "pay"}>
          <PayForm ledger={ledger} cell={cell} initialInput={initialInput} onDone={onDone} onDirtyChange={setPayDirty} onHistory={history} />
        </TabsContent>
        <TabsContent value="amount" forceMount hidden={tab !== "amount"}>
          <AmountForm ledger={ledger} cell={cell} onDone={onDone} onDirtyChange={setAmountDirty} onHistory={history} />
        </TabsContent>
        <TabsContent value="history">
          <PaymentList payments={payments} highlightChargeIds={[ledger.charge.id]} empty={t("editor.historyEmpty")} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function PayForm({
  ledger,
  cell,
  initialInput,
  onDone,
  onDirtyChange,
  onHistory,
}: {
  ledger: ChargeLedger;
  cell: Extract<MatrixCell, { kind: "charge" }>;
  initialInput?: string;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onHistory: () => void;
}) {
  const t = useT();
  const { run } = useKelab();
  const form = usePaymentForm(initialInput);
  const input = useRef<HTMLInputElement>(null);
  const messageId = useId();

  useEffect(() => onDirtyChange?.(form.amount.trim() !== "" || form.staged.length > 0), [form.amount, form.staged.length, onDirtyChange]);

  if (ledger.charge.exempt)
    return <p className="rounded-xl bg-st-exempt-bg px-3 py-2.5 text-sm text-st-exempt">{t("editor.exemptNotice", { reason: ledger.charge.exemptReason ?? t("editor.noReason"), tab: t("editor.tabAmount") })}</p>;
  if (ledger.payable === 0)
    return (
      <div className="rounded-xl bg-st-paid-bg px-3 py-2.5 text-sm text-st-paid">
        {t("editor.nothingDue")}{" "}
        <Button variant="link" onClick={onHistory} className="h-auto p-0 align-baseline font-semibold text-inherit underline">
          {t("editor.viewHistory")}
        </Button>{" "}
        {t("editor.toCorrect")}
      </div>
    );

  const parsed = form.amount.trim() ? parseMoney(form.amount) : null;
  const sen = parsed?.sen ?? null;
  const tooMuch = sen !== null && sen > ledger.payable;
  const after = sen !== null && !tooMuch ? Math.max(0, ledger.remaining - (form.received ? sen : 0)) : null;
  const invalid = Boolean(form.error) || tooMuch;

  // Validation runs on submit, so Simpan stays reachable and says why it refused; focus goes
  // back to the amount, whose aria-describedby carries the reason.
  const fail = (message: string) => {
    form.setError(message);
    input.current?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.busy) return;
    const result = parseMoney(form.amount);
    if (result.error !== null) return fail(result.error);
    if (result.sen === 0) return fail(t("editor.zeroAmount"));
    if (result.sen > ledger.payable) return fail(t("editor.overBalance", { max: formatMoney(ledger.payable) }));
    form.setBusy(true);
    form.setError(null);
    try {
      const paymentId = await run((backend) =>
        backend.recordPayment({
          idempotencyKey: form.attemptKey.current,
          memberId: cell.member.id,
          method: form.method,
          paidOn: form.paidOn,
          reference: form.reference || null,
          note: null,
          confirmed: form.received,
          allocations: [{ chargeId: ledger.charge.id, amount: result.sen }],
        }),
      );
      toast.success(t("editor.recordedFor", { amount: formatMoney(result.sen), name: cell.member.name }));
      const warning = await attachStaged(run, [paymentId], form.staged);
      if (warning) toast.warning(warning, { duration: 10000 });
      onDirtyChange?.(false);
      onDone();
    } catch (error) {
      form.setError(messageFor(error));
    } finally {
      form.setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-2.5" noValidate>
      <div className="grid gap-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="pay-amount" className="text-xs text-muted-foreground">
            {t("editor.amountReceived")}
          </Label>
          <TextAction
            onClick={() => {
              form.setAmount(senToInput(ledger.payable));
              form.setError(null);
            }}
          >
            {t("editor.fullBalance", { amount: formatMoney(ledger.payable) })}
          </TextAction>
        </div>
        <MoneyInput
          id="pay-amount"
          ref={input}
          data-autofocus
          value={form.amount}
          onChange={(event) => {
            form.setAmount(event.target.value);
            form.setError(null);
          }}
          placeholder={senToInput(ledger.payable)}
          invalid={invalid}
          aria-describedby={form.error || tooMuch || after !== null ? messageId : undefined}
        />
        {form.error ? (
          <p id={messageId} role="alert" className="text-xs font-medium text-st-unpaid">
            {form.error}
          </p>
        ) : tooMuch ? (
          <p id={messageId} className="text-xs font-medium text-st-unpaid">
            {t("editor.overBalance", { max: formatMoney(ledger.payable) })}
          </p>
        ) : after !== null ? (
          <p id={messageId} className="text-xs text-muted-foreground">
            {t("editor.afterSave")} <b className="text-foreground">{formatMoney(after)}</b>
            {after === 0 ? ` · ${cellStatusLabels.paid[0]}` : form.received ? ` · ${cellStatusLabels.partial[0]}` : ` · ${pendingLabel[0]}`}
          </p>
        ) : null}
      </div>
      <PaymentDetails {...form} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone} disabled={form.busy}>
          {t("editor.cancel")} <kbd className="hidden text-[10px] text-muted-foreground sm:inline">Esc</kbd>
        </Button>
        {/* Disabled only while saving: the double-submit guard. Bad input is reported on submit. */}
        <Button type="submit" disabled={form.busy}>
          {form.busy && <Spinner className="size-4" />}
          {form.busy ? t("common.saving") : t("common.save")} <kbd className="hidden text-[10px] opacity-80 sm:inline">↵</kbd>
        </Button>
      </div>
    </form>
  );
}

function AmountForm({
  ledger,
  cell,
  onDone,
  onDirtyChange,
  onHistory,
}: {
  ledger: ChargeLedger;
  cell: Extract<MatrixCell, { kind: "charge" }>;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onHistory: () => void;
}) {
  const t = useT();
  const { run } = useKelab();
  const [amount, setAmount] = useState(senToInput(ledger.charge.amount));
  const [reason, setReason] = useState("");
  const [error, setErrorState] = useState<{ message: string; field: "amount" | "reason" | null; history?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exemptOpen, setExemptOpen] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const paidSoFar = ledger.confirmed + ledger.pending;
  const needsReason = paidSoFar > 0;
  const changed = amount !== senToInput(ledger.charge.amount);

  useEffect(() => onDirtyChange?.(changed || reason.trim() !== ""), [changed, reason, onDirtyChange]);

  // A field error moves focus to that field, whose aria-describedby carries the message.
  const setError = (message: string | null, field: "amount" | "reason" | null = null, history = false) => {
    setErrorState(message === null ? null : { message, field, history });
    if (field === "amount") amountInput.current?.focus();
    if (field === "reason") reasonInput.current?.focus();
  };
  const fieldProps = (field: "amount" | "reason") =>
    error?.field === field ? { "aria-invalid": true as const, "aria-describedby": errorId } : {};

  const saveAmount = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const result = parseMoney(amount);
    if (result.error !== null) return setError(result.error, "amount");
    if (result.sen === 0) return setError(t("editor.zeroUseExempt"), "amount");
    if (result.sen < paidSoFar) return setError(t("editor.belowPaid", { paid: formatMoney(paidSoFar) }), "amount", true);
    if (needsReason && !reason.trim()) return setError(t("editor.needReason"), "reason");
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.setChargeAmount(ledger.charge.id, result.sen as Sen, reason || null));
      toast.success(t("editor.amountNow", { name: cell.member.name, amount: formatMoney(result.sen) }));
      onDirtyChange?.(false);
      onDone();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const toggleExempt = async () => {
    if (!reason.trim()) return setError(t("editor.exemptReason"), "reason");
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.setChargeExempt(ledger.charge.id, !ledger.charge.exempt, reason));
      toast.success(ledger.charge.exempt ? t("editor.exemptionWithdrawn") : t("editor.nowExempt", { name: cell.member.name }));
      onDirtyChange?.(false);
      onDone();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const defaultAmount = cell.column.collection.defaultAmount;

  return (
    <form onSubmit={saveAmount} className="grid gap-2.5" noValidate>
      <p className="text-xs text-muted-foreground">
        {t("editor.amountIntroBefore")} <b className="text-foreground">{t("editor.amountIntroBold")}</b>
        {t("editor.amountIntroAfter")}
        {defaultAmount !== null && <> {t("editor.defaultAmountNote", { amount: formatMoney(defaultAmount) })}</>}
      </p>
      {!ledger.charge.exempt && (
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="charge-amount" className="text-xs text-muted-foreground">
              {t("editor.amountDue")}
            </Label>
            {defaultAmount !== null && ledger.charge.amount !== defaultAmount && (
              <TextAction onClick={() => setAmount(senToInput(defaultAmount))}>{t("editor.resetDefault")}</TextAction>
            )}
          </div>
          <MoneyInput
            id="charge-amount"
            ref={amountInput}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              if (error?.field === "amount") setError(null);
            }}
            invalid={error?.field === "amount"}
            {...fieldProps("amount")}
          />
        </div>
      )}
      {(needsReason || exemptOpen || ledger.charge.exempt) && (
        <div className="grid gap-1">
          <Label htmlFor="charge-reason" className="text-xs text-muted-foreground">
            {t("editor.reasonLabel")} {needsReason || exemptOpen || ledger.charge.exempt ? t("editor.reasonRequired") : ""}
          </Label>
          <Textarea
            id="charge-reason"
            ref={reasonInput}
            rows={2}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error?.field === "reason") setError(null);
            }}
            placeholder={t("editor.reasonPlaceholder")}
            {...fieldProps("reason")}
          />
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-st-unpaid">
          {error.message}{" "}
          {error.history && (
            <Button variant="link" onClick={onHistory} className="h-auto p-0 align-baseline text-xs text-inherit underline">
              {t("editor.openHistory")}
            </Button>
          )}
        </p>
      )}
      {!ledger.charge.exempt && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
            {t("editor.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !changed}>
            {busy && <Spinner className="size-4" />}
            {t("editor.saveAmount")}
          </Button>
        </div>
      )}
      <div className="border-t border-dashed border-border pt-2.5">
        {ledger.charge.exempt ? (
          <Button type="button" variant="danger-outline" className="w-full" onClick={() => void toggleExempt()} disabled={busy}>
            <Undo2 /> {t("editor.withdrawExemption")}
          </Button>
        ) : paidSoFar > 0 ? (
          <p className="text-xs text-muted-foreground">{t("editor.exemptOnlyUnpaid")}</p>
        ) : exemptOpen ? (
          <Button type="button" variant="destructive" className="w-full" onClick={() => void toggleExempt()} disabled={busy}>
            <UserMinus /> {t("editor.confirmExemption")}
          </Button>
        ) : (
          <Button type="button" variant="danger-outline" size="sm" onClick={() => setExemptOpen(true)}>
            <UserMinus /> {t("editor.exemptMember")}
          </Button>
        )}
      </div>
    </form>
  );
}

function VoluntaryEditor({
  cell,
  initialInput,
  onDone,
  onDirtyChange,
}: {
  cell: Extract<MatrixCell, { kind: "voluntary" }>;
  initialInput?: string;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const { run } = useKelab();
  const { view } = useSnapshot();
  const [tab, setTab] = useState<EditorTab>("pay");
  const form = usePaymentForm(initialInput);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const payments = view.paymentsFor(cell.member.id, null, cell.column.collection.id);

  const fail = (message: string) => {
    form.setError(message);
    input.current?.focus();
  };

  useEffect(() => onDirtyChange?.(form.amount.trim() !== "" || form.staged.length > 0), [form.amount, form.staged.length, onDirtyChange]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.busy) return;
    const result = parseMoney(form.amount);
    if (result.error !== null) return fail(result.error);
    if (result.sen === 0) return fail(t("editor.zeroAmount"));
    form.setBusy(true);
    form.setError(null);
    try {
      const paymentId = await run((backend) =>
        backend.recordContribution({
          idempotencyKey: form.attemptKey.current,
          memberId: cell.member.id,
          collectionId: cell.column.collection.id,
          amount: result.sen,
          method: form.method,
          paidOn: form.paidOn,
          reference: form.reference || null,
          note: null,
          confirmed: form.received,
        }),
      );
      toast.success(t("editor.contributionRecorded", { amount: formatMoney(result.sen) }));
      const warning = await attachStaged(run, [paymentId], form.staged);
      if (warning) toast.warning(warning, { duration: 10000 });
      onDirtyChange?.(false);
      onDone();
    } catch (error) {
      form.setError(messageFor(error));
    } finally {
      form.setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {t("editor.voluntaryIntro")} <Money sen={cell.received} className="font-semibold text-foreground" />.
      </p>
      {/* The form's state lives in this component, so it survives switching tabs. */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as EditorTab)} className="gap-3">
        <EditorTabs
          tabs={[
            ["pay", t("editor.tabContribution")],
            ["history", t("editor.tabHistory", { count: payments.length })],
          ]}
        />
        <TabsContent value="pay">
          <form onSubmit={submit} className="grid gap-2.5" noValidate>
            <MoneyInput
              ref={input}
              data-autofocus
              aria-label={t("editor.contributionAmount")}
              value={form.amount}
              onChange={(event) => {
                form.setAmount(event.target.value);
                form.setError(null);
              }}
              placeholder="0.00"
              invalid={Boolean(form.error)}
              aria-describedby={form.error ? errorId : undefined}
            />
            {form.error && (
              <p id={errorId} role="alert" className="text-xs font-medium text-st-unpaid">
                {form.error}
              </p>
            )}
            <PaymentDetails {...form} />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={onDone} disabled={form.busy}>
                {t("editor.cancel")}
              </Button>
              <Button type="submit" disabled={form.busy}>
                {form.busy && <Spinner className="size-4" />}
                {t("common.save")}
              </Button>
            </div>
          </form>
        </TabsContent>
        <TabsContent value="history">
          <PaymentList payments={payments} empty={t("editor.contributionsEmpty")} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function IncludeMember({ cell, onDone }: { cell: Extract<MatrixCell, { kind: "na" }>; onDone: () => void }) {
  const t = useT();
  const { run } = useKelab();
  const collection = cell.column.collection;
  const [amount, setAmount] = useState(collection.defaultAmount !== null ? senToInput(collection.defaultAmount) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const include = async () => {
    let override: Sen | null = null;
    if (collection.type !== "voluntary") {
      const result = parseMoney(amount);
      if (result.error !== null) return setError(result.error);
      if (result.sen === 0) return setError(t("editor.zeroInclude"));
      override = result.sen === collection.defaultAmount ? null : result.sen;
    }
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.addParticipants(collection.id, [{ memberId: cell.member.id, amountOverride: override, exempt: false, note: null }]));
      toast.success(t("editor.included", { name: cell.member.name, collection: collection.name }));
      onDone();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2.5">
      <p className="rounded-xl bg-st-na-bg px-3 py-2.5 text-sm text-st-na">
        <b>{cellStatusLabels.na[0]}.</b> {t("editor.notRelatedNote")}
      </p>
      {collection.type !== "voluntary" && (
        <div className="grid gap-1">
          <Label htmlFor="include-amount" className="text-xs text-muted-foreground">
            {collection.type === "monthly" ? t("editor.includeAmountMonthly") : t("editor.includeAmountOnce")}
          </Label>
          <MoneyInput
            id="include-amount"
            data-autofocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
          {collection.type === "monthly" && <p className="text-xs text-muted-foreground">{t("editor.includeMonthlyNote")}</p>}
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-st-unpaid">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          {t("common.close")}
        </Button>
        <Button type="button" onClick={() => void include()} disabled={busy}>
          {busy && <Spinner className="size-4" />}
          {t("editor.includeMember")}
        </Button>
      </div>
    </div>
  );
}
