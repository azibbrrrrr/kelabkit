"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import { MoneyInput, parseMoney } from "@/components/money-input";
import { PaymentList } from "@/components/payments";
import { ChargeStatusChips, Money } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/errors";
import { formatDay, formatMoney, formatMonthLong, today } from "@/lib/format";
import { senToInput } from "@/lib/money/amount";
import type { ChargeLedger } from "@/lib/money/ledger";
import type { PaymentMethod, Sen } from "@/lib/types";
import { cellStatus, type MatrixCell } from "@/lib/view";
import { cn } from "@/lib/utils";
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
}: {
  cell: MatrixCell;
  /** A digit typed on the selected cell, carried into the amount field. */
  initialInput?: string;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const title = cell.column.period ? `${cell.column.collection.name} · ${formatMonthLong(cell.column.period.month)}` : cell.column.collection.name;
  const archived = cell.column.collection.status === "archived";

  return (
    <div className="grid gap-3">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{cell.member.name}</p>
        <p className="truncate text-xs text-muted-foreground">{title}</p>
      </div>
      {archived ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">Kutipan ini telah diarkib. Rekod hanya boleh dilihat.</p>
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

function Tabs({ value, onChange, tabs }: { value: EditorTab; onChange: (tab: EditorTab) => void; tabs: [EditorTab, string][] }) {
  return (
    <div role="tablist" className="grid gap-1 rounded-xl bg-primary-tint p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "min-h-9 rounded-lg px-1.5 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors",
            value === id && "bg-card font-semibold text-primary-strong shadow-sm",
          )}
        >
          {label}
        </button>
      ))}
    </div>
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

const methods: [PaymentMethod, string][] = [
  ["cash", "Tunai"],
  ["transfer", "Pindahan"],
  ["other", "Lain-lain"],
];

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
}: {
  method: PaymentMethod;
  setMethod: (method: PaymentMethod) => void;
  paidOn: string;
  setPaidOn: (day: string) => void;
  received: boolean;
  setReceived: (value: boolean) => void;
  reference: string;
  setReference: (value: string) => void;
}) {
  const id = useId();
  return (
    <>
      <div role="radiogroup" aria-label="Kaedah bayaran" className="grid grid-cols-3 gap-1.5">
        {methods.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => {
              setMethod(value);
              setReceived(value === "cash");
            }}
            className={cn(
              "min-h-10 rounded-xl border px-2 text-xs font-medium transition-colors",
              method === value ? "border-primary bg-primary-tint text-primary-strong" : "border-border bg-card text-muted-foreground hover:bg-primary-tint",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-date`} className="text-xs text-muted-foreground">
            Tarikh bayar
          </Label>
          <input
            id={`${id}-date`}
            type="date"
            value={paidOn}
            max={today()}
            onChange={(event) => setPaidOn(event.target.value)}
            className="h-10 rounded-xl border border-input bg-card px-2.5 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-ref`} className="text-xs text-muted-foreground">
            Rujukan (pilihan)
          </Label>
          <input
            id={`${id}-ref`}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="cth. DuitNow 1234"
            className="h-10 rounded-xl border border-input bg-card px-2.5 text-sm outline-none placeholder:text-subtle focus:border-primary focus:ring-3 focus:ring-ring/20"
          />
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
        <Checkbox checked={received} onCheckedChange={(value) => setReceived(value === true)} className="mt-0.5" />
        <span className="text-xs leading-snug">
          <span className="block font-medium text-foreground">Wang sudah diterima</span>
          <span className="text-muted-foreground">
            {received ? "Dikira sebagai kutipan serta-merta." : "Disimpan sebagai Menunggu Semakan; tidak dikira sehingga anda sahkan."}
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
  const { view } = useSnapshot();
  const [tab, setTab] = useState<EditorTab>(ledger.payable > 0 || initialInput ? "pay" : "history");
  const payments = view.paymentsFor(cell.member.id, [ledger.charge.id]);
  const count = payments.length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChargeStatusChips status={cellStatus(ledger)} overdue={ledger.overdue} pending={ledger.pending > 0} compact />
        {ledger.charge.dueDate && <span className="text-xs text-muted-foreground">Tarikh akhir {formatDay(ledger.charge.dueDate)}</span>}
      </div>
      <Figures
        items={[
          ["Perlu bayar", ledger.charge.exempt ? "Dikecualikan" : formatMoney(ledger.required)],
          ["Diterima", formatMoney(ledger.confirmed)],
          ["Baki", formatMoney(ledger.remaining)],
        ]}
      />
      {ledger.pending > 0 && (
        <p className="rounded-xl bg-st-pending-bg px-3 py-2 text-xs text-st-pending">
          {formatMoney(ledger.pending)} menunggu semakan. Belum dikira dalam &quot;Diterima&quot;.
        </p>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["pay", "Rekod bayaran"],
          ["amount", "Ubah amaun"],
          ["history", `Sejarah (${count})`],
        ]}
      />
      {tab === "pay" && <PayForm ledger={ledger} cell={cell} initialInput={initialInput} onDone={onDone} onDirtyChange={onDirtyChange} onHistory={() => setTab("history")} />}
      {tab === "amount" && <AmountForm ledger={ledger} cell={cell} onDone={onDone} onDirtyChange={onDirtyChange} onHistory={() => setTab("history")} />}
      {tab === "history" && <PaymentList payments={payments} highlightChargeIds={[ledger.charge.id]} empty="Belum ada bayaran untuk caj ini." />}
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
  const { run } = useKelab();
  const form = usePaymentForm(initialInput);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const el = input.current;
    if (el && initialInput) el.setSelectionRange(el.value.length, el.value.length);
  }, [initialInput]);
  useEffect(() => onDirtyChange?.(form.amount.trim() !== ""), [form.amount, onDirtyChange]);

  if (ledger.charge.exempt)
    return <p className="rounded-xl bg-st-exempt-bg px-3 py-2.5 text-sm text-st-exempt">Ahli ini dikecualikan: {ledger.charge.exemptReason ?? "tiada sebab dicatat"}. Buka &quot;Ubah amaun&quot; untuk menarik balik.</p>;
  if (ledger.payable === 0)
    return (
      <div className="rounded-xl bg-st-paid-bg px-3 py-2.5 text-sm text-st-paid">
        Tiada baki untuk dibayar.{" "}
        <button type="button" onClick={onHistory} className="font-semibold underline underline-offset-2">
          Lihat sejarah
        </button>{" "}
        untuk membetulkan bayaran.
      </div>
    );

  const parsed = form.amount.trim() ? parseMoney(form.amount) : null;
  const sen = parsed?.sen ?? null;
  const tooMuch = sen !== null && sen > ledger.payable;
  const after = sen !== null && !tooMuch ? Math.max(0, ledger.remaining - (form.received ? sen : 0)) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.busy) return;
    const result = parseMoney(form.amount);
    if (result.error !== null) return form.setError(result.error);
    if (result.sen === 0) return form.setError("Amaun mesti lebih daripada RM0.");
    if (result.sen > ledger.payable) return form.setError(`Melebihi baki. Maksimum ${formatMoney(ledger.payable)}.`);
    form.setBusy(true);
    form.setError(null);
    try {
      await run((backend) =>
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
      toast.success(`${formatMoney(result.sen)} direkod untuk ${cell.member.name}.`);
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
            Amaun diterima
          </Label>
          <button
            type="button"
            onClick={() => form.setAmount(senToInput(ledger.payable))}
            className="rounded-lg px-1.5 py-0.5 text-xs font-medium text-primary-strong hover:bg-primary-tint"
          >
            Baki penuh {formatMoney(ledger.payable)}
          </button>
        </div>
        <MoneyInput
          id="pay-amount"
          ref={input}
          value={form.amount}
          onChange={(event) => {
            form.setAmount(event.target.value);
            form.setError(null);
          }}
          placeholder={senToInput(ledger.payable)}
          invalid={Boolean(form.error) || tooMuch}
        />
        {form.error ? (
          <p className="text-xs font-medium text-st-unpaid">{form.error}</p>
        ) : tooMuch ? (
          <p className="text-xs font-medium text-st-unpaid">Melebihi baki. Maksimum {formatMoney(ledger.payable)}.</p>
        ) : after !== null ? (
          <p className="text-xs text-muted-foreground">
            Selepas simpan: baki <b className="text-foreground">{formatMoney(after)}</b>
            {after === 0 ? " · Dibayar" : form.received ? " · Sebahagian" : " · menunggu semakan"}
          </p>
        ) : null}
      </div>
      <PaymentDetails {...form} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone} disabled={form.busy}>
          Batal <kbd className="hidden text-[10px] text-muted-foreground sm:inline">Esc</kbd>
        </Button>
        <Button type="submit" disabled={form.busy || !form.amount.trim() || tooMuch}>
          {form.busy && <Spinner className="size-4" />}
          {form.busy ? "Menyimpan…" : "Simpan"} <kbd className="hidden text-[10px] opacity-80 sm:inline">↵</kbd>
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
  const { run } = useKelab();
  const [amount, setAmount] = useState(senToInput(ledger.charge.amount));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exemptOpen, setExemptOpen] = useState(false);
  const paidSoFar = ledger.confirmed + ledger.pending;
  const needsReason = paidSoFar > 0;
  const changed = amount !== senToInput(ledger.charge.amount);

  useEffect(() => onDirtyChange?.(changed || reason.trim() !== ""), [changed, reason, onDirtyChange]);

  const saveAmount = async (event: FormEvent) => {
    event.preventDefault();
    const result = parseMoney(amount);
    if (result.error !== null) return setError(result.error);
    if (result.sen === 0) return setError("RM0 tidak dibenarkan. Gunakan Kecualikan di bawah.");
    if (result.sen < paidSoFar) return setError(`Tidak boleh kurang daripada ${formatMoney(paidSoFar)} yang telah dibayar. Batalkan bayaran dahulu.`);
    if (needsReason && !reason.trim()) return setError("Ahli ini sudah membayar. Nyatakan sebab perubahan.");
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.setChargeAmount(ledger.charge.id, result.sen as Sen, reason || null));
      toast.success(`Amaun ${cell.member.name} kini ${formatMoney(result.sen)}.`);
      onDirtyChange?.(false);
      onDone();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const toggleExempt = async () => {
    if (!reason.trim()) return setError("Nyatakan sebab pengecualian.");
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.setChargeExempt(ledger.charge.id, !ledger.charge.exempt, reason));
      toast.success(ledger.charge.exempt ? "Pengecualian ditarik balik." : `${cell.member.name} dikecualikan.`);
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
        Ini menukar <b className="text-foreground">amaun yang perlu dibayar</b>, bukan merekod bayaran.
        {defaultAmount !== null && <> Amaun asal kutipan: {formatMoney(defaultAmount)}.</>}
      </p>
      {!ledger.charge.exempt && (
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="charge-amount" className="text-xs text-muted-foreground">
              Amaun perlu dibayar
            </Label>
            {defaultAmount !== null && ledger.charge.amount !== defaultAmount && (
              <button
                type="button"
                onClick={() => setAmount(senToInput(defaultAmount))}
                className="rounded-lg px-1.5 py-0.5 text-xs font-medium text-primary-strong hover:bg-primary-tint"
              >
                Set semula ke asal
              </button>
            )}
          </div>
          <MoneyInput id="charge-amount" value={amount} onChange={(event) => setAmount(event.target.value)} invalid={Boolean(error)} />
        </div>
      )}
      {(needsReason || exemptOpen || ledger.charge.exempt) && (
        <div className="grid gap-1">
          <Label htmlFor="charge-reason" className="text-xs text-muted-foreground">
            Sebab {needsReason || exemptOpen || ledger.charge.exempt ? "(wajib)" : ""}
          </Label>
          <Textarea id="charge-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Disimpan dalam log audit" />
        </div>
      )}
      {error && (
        <p className="text-xs font-medium text-st-unpaid">
          {error}{" "}
          {error.includes("Batalkan") && (
            <button type="button" onClick={onHistory} className="underline">
              Buka sejarah
            </button>
          )}
        </p>
      )}
      {!ledger.charge.exempt && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" disabled={busy || !changed}>
            {busy && <Spinner className="size-4" />}
            Simpan amaun
          </Button>
        </div>
      )}
      <div className="border-t border-dashed border-border pt-2.5">
        {ledger.charge.exempt ? (
          <Button type="button" variant="brand" className="w-full" onClick={() => void toggleExempt()} disabled={busy}>
            Tarik balik pengecualian
          </Button>
        ) : paidSoFar > 0 ? (
          <p className="text-xs text-muted-foreground">Pengecualian hanya untuk ahli yang belum membayar.</p>
        ) : exemptOpen ? (
          <Button type="button" variant="brand" className="w-full" onClick={() => void toggleExempt()} disabled={busy}>
            Sahkan pengecualian
          </Button>
        ) : (
          <button type="button" onClick={() => setExemptOpen(true)} className="text-xs font-medium text-st-exempt hover:underline">
            Kecualikan ahli ini daripada caj ini…
          </button>
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
  const { run } = useKelab();
  const { view } = useSnapshot();
  const [tab, setTab] = useState<EditorTab>("pay");
  const form = usePaymentForm(initialInput);
  const input = useRef<HTMLInputElement>(null);
  const payments = view.paymentsFor(cell.member.id, null, cell.column.collection.id);

  useEffect(() => {
    if (tab === "pay") input.current?.focus();
  }, [tab]);
  useEffect(() => onDirtyChange?.(form.amount.trim() !== ""), [form.amount, onDirtyChange]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.busy) return;
    const result = parseMoney(form.amount);
    if (result.error !== null) return form.setError(result.error);
    if (result.sen === 0) return form.setError("Amaun mesti lebih daripada RM0.");
    form.setBusy(true);
    form.setError(null);
    try {
      await run((backend) =>
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
      toast.success(`Sumbangan ${formatMoney(result.sen)} direkod.`);
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
        Sumbangan sukarela: tiada amaun wajib dan tiada baki tertunggak. Jumlah setakat ini <Money sen={cell.received} className="font-semibold text-foreground" />.
      </p>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["pay", "Rekod sumbangan"],
          ["history", `Sejarah (${payments.length})`],
        ]}
      />
      {tab === "pay" ? (
        <form onSubmit={submit} className="grid gap-2.5" noValidate>
          <MoneyInput
            ref={input}
            aria-label="Amaun sumbangan"
            value={form.amount}
            onChange={(event) => {
              form.setAmount(event.target.value);
              form.setError(null);
            }}
            placeholder="0.00"
            invalid={Boolean(form.error)}
          />
          {form.error && <p className="text-xs font-medium text-st-unpaid">{form.error}</p>}
          <PaymentDetails {...form} />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onDone} disabled={form.busy}>
              Batal
            </Button>
            <Button type="submit" disabled={form.busy || !form.amount.trim()}>
              {form.busy && <Spinner className="size-4" />}
              Simpan
            </Button>
          </div>
        </form>
      ) : (
        <PaymentList payments={payments} empty="Belum ada sumbangan." />
      )}
    </>
  );
}

function IncludeMember({ cell, onDone }: { cell: Extract<MatrixCell, { kind: "na" }>; onDone: () => void }) {
  const { run } = useKelab();
  const collection = cell.column.collection;
  const [amount, setAmount] = useState(collection.defaultAmount !== null ? senToInput(collection.defaultAmount) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const include = async () => {
    let override: Sen | null = null;
    if (collection.type !== "voluntary") {
      const result = parseMoney(amount);
      if (result.error !== null) return setError(result.error);
      if (result.sen === 0) return setError("RM0 tidak dibenarkan. Sertakan dan kecualikan jika perlu.");
      override = result.sen === collection.defaultAmount ? null : result.sen;
    }
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.addParticipants(collection.id, [{ memberId: cell.member.id, amountOverride: override, exempt: false, note: null }]));
      toast.success(`${cell.member.name} disertakan dalam ${collection.name}.`);
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
        <b>Tidak Berkaitan.</b> Ahli ini tidak termasuk dalam kutipan ini dan tidak berhutang apa-apa.
      </p>
      {collection.type !== "voluntary" && (
        <div className="grid gap-1">
          <Label htmlFor="include-amount" className="text-xs text-muted-foreground">
            Amaun {collection.type === "monthly" ? "sebulan" : "perlu dibayar"} jika disertakan
          </Label>
          <MoneyInput id="include-amount" value={amount} onChange={(event) => setAmount(event.target.value)} invalid={Boolean(error)} />
          {collection.type === "monthly" && <p className="text-xs text-muted-foreground">Caj dicipta untuk setiap bulan dalam tempoh kutipan.</p>}
        </div>
      )}
      {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Tutup
        </Button>
        <Button type="button" onClick={() => void include()} disabled={busy}>
          {busy && <Spinner className="size-4" />}
          Sertakan ahli
        </Button>
      </div>
    </div>
  );
}
