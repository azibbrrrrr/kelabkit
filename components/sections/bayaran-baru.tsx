"use client";

import { ProofField, attachStaged, type StagedFile } from "@/components/attachments";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { ChoiceCard, ChoiceCards, SegmentedChoice } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { MoneyInput, parseMoney } from "@/components/money-input";
import { MemberStatus } from "@/components/sections/ahli";
import { ChargeStatusChips, LabelChip, Money, PageHeader, PageShell, SectionCard, TextAction } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/errors";
import { useT } from "@/lib/i18n/react";
import { formatDay, formatMoney, formatMonthLong, initials } from "@/lib/format";
import { categoryLabels, collectionTypeLabels, methodLabels, paymentStateLabels } from "@/lib/labels";
import { senToInput, sum } from "@/lib/money/amount";
import { allocateInOrder, type ChargeLedger, type Totals } from "@/lib/money/ledger";
import { normaliseName } from "@/lib/names";
import type { Collection, Member, PaymentMethod, Sen } from "@/lib/types";
import { cellStatus, collectionPeriodLabel } from "@/lib/view";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  CircleCheckBig,
  HandCoins,
  Hourglass,
  ReceiptText,
  Search,
  Sheet as SheetIcon,
  TriangleAlert,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";

// The treasurer's daily workflow: pick a member, tick what they are paying for, enter
// the money, check the before/after balances, save. One payment row is created with one
// allocation per charge (oldest first); a voluntary amount is a separate contribution.
// Overpayment is refused here and again by the backend.

type Saved = {
  memberId: string;
  before: Totals;
  confirmed: boolean;
  lines: { label: string; amount: Sen }[];
  total: Sen;
  collectionIds: string[];
  /** Set when part of the save went through and part was refused. */
  warning: string | null;
};

export function BayaranBaru() {
  const t = useT();
  const { view } = useSnapshot();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("ahli");
  // The URL is the source of truth for the member, so a refresh or shared link keeps it.
  const member = requested ? view.membersById.get(requested) ?? null : null;
  const [saved, setSaved] = useState<Saved | null>(null);
  const [attempt, setAttempt] = useState(0);

  const choose = (id: string | null) => {
    setSaved(null);
    setAttempt((n) => n + 1);
    router.replace(id ? `${pathname}?ahli=${id}` : pathname, { scroll: false });
  };

  return (
    <PageShell className="pb-28 md:pb-7">
      <PageHeader
        title={t("paymentNew.title")}
        back={{ href: "/bayaran/", label: t("paymentNew.back") }}
        description={t("paymentNew.description")}
      />
      {requested && !member && (
        <p className="flex items-start gap-2 rounded-2xl border border-dashed border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-st-partial" aria-hidden />
          {t("paymentNew.memberNotFound")}
        </p>
      )}
      {saved && member ? (
        <SuccessPanel
          saved={saved}
          member={member}
          onAgain={() => {
            setSaved(null);
            setAttempt((n) => n + 1);
          }}
          onOther={() => choose(null)}
        />
      ) : member ? (
        <PaymentForm key={`${member.id}:${attempt}`} member={member} onChange={() => choose(null)} onSaved={setSaved} />
      ) : (
        <Step n={1} title={t("paymentNew.picker.title")} description={t("paymentNew.picker.description")}>
          <MemberPicker onSelect={choose} />
        </Step>
      )}
    </PageShell>
  );
}

function Step({ n, title, description, action, children }: { n: number; title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-light text-xs font-bold text-primary-strong">{n}</span>
          {title}
        </span>
      }
      description={description}
      action={action}
    >
      {children}
    </SectionCard>
  );
}

// Step 1: member ---------------------------------------------------------------------------

function MemberPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const t = useT();
  const { data, view } = useSnapshot();
  const [query, setQuery] = useState("");
  // The heavy filter/render follows the keystroke at lower priority, so typing never waits on it.
  const deferredQuery = useDeferredValue(query);
  const [active, setActive] = useState(0);
  const listId = useId();
  const LIMIT = 60;

  const options = useMemo(() => {
    const q = normaliseName(deferredQuery);
    return data.members
      .filter((member) => !q || normaliseName(member.name).includes(q) || member.name.toLowerCase().includes(deferredQuery.trim().toLowerCase()))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "ms"))
      .map((member) => ({ member, totals: view.memberTotals(member.id) }));
  }, [data.members, deferredQuery, view]);
  const shown = options.slice(0, LIMIT);
  const index = Math.min(active, Math.max(0, shown.length - 1));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") setActive(Math.min(index + 1, shown.length - 1));
    else if (event.key === "ArrowUp") setActive(Math.max(index - 1, 0));
    else if (event.key === "Enter" && shown[index]) onSelect(shown[index].member.id);
    else return;
    event.preventDefault();
  };

  if (!data.members.length)
    return (
      <div className="grid justify-items-start gap-2 text-sm text-muted-foreground">
        {t("paymentNew.picker.noMembers")}
        <Button asChild variant="brand">
          <Link href="/ahli/">
            <UsersRound /> {t("paymentNew.picker.addMembers")}
          </Link>
        </Button>
      </div>
    );

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown[index] ? `${listId}-${shown[index].member.id}` : undefined}
          aria-label={t("paymentNew.picker.searchLabel")}
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("paymentNew.picker.placeholder")}
          className="pl-9"
        />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{t("paymentNew.picker.noMatch", { query })}</p>
      ) : (
        <ul id={listId} role="listbox" aria-label={t("paymentNew.picker.listLabel")} className="grid max-h-[min(420px,55svh)] grid-cols-1 gap-1 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1">
          {shown.map(({ member, totals }, i) => (
            <li
              key={member.id}
              id={`${listId}-${member.id}`}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setActive(i)}
              onClick={() => onSelect(member.id)}
              className={cn("flex min-h-12 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2", i === index && "bg-primary-tint")}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-semibold",
                  member.active ? "bg-primary-light text-primary-strong" : "bg-st-na-bg text-st-na",
                )}
              >
                {initials(member.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={member.name}>{member.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[member.category ? categoryLabels[member.category] : null, member.active ? null : t("paymentNew.picker.inactive")].filter(Boolean).join(" · ") || t("paymentNew.picker.fallbackRole")}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs whitespace-nowrap">
                <span className={cn("block font-semibold tabular-nums", totals.dueNow > 0 ? "text-st-unpaid" : "text-st-paid")}>
                  {totals.dueNow > 0 ? formatMoney(totals.dueNow) : t("paymentNew.picker.noBalance")}
                </span>
                {totals.pending > 0 && <span className="block text-st-pending">{t("paymentNew.picker.waiting")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {options.length > LIMIT && <p className="text-xs text-muted-foreground">{t("paymentNew.picker.more", { count: options.length - LIMIT })}</p>}
    </div>
  );
}

// Steps 2–5: charges, amount, details, review ----------------------------------------------

type Item = { ledger: ChargeLedger; collection: Collection; month: string | null; label: string };
type Group = { collection: Collection; due: Item[]; future: Item[] };

const methods = Object.keys(methodLabels) as PaymentMethod[];
type Mode = "full" | "custom";

function PaymentForm({ member, onChange, onSaved }: { member: Member; onChange: () => void; onSaved: (saved: Saved) => void }) {
  const t = useT();
  const { data, view } = useSnapshot();
  const { run } = useKelab();
  const totals = view.memberTotals(member.id);

  // Outstanding charges, oldest first: the order a part payment fills them in.
  const { items, groups, voluntary } = useMemo(() => {
    const periods = new Map(data.periods.map((period) => [period.id, period]));
    const open = (collection: Collection | undefined): collection is Collection =>
      Boolean(collection && (collection.status === "active" || collection.status === "completed"));
    const list: Item[] = [];
    for (const ledger of view.memberLedgers(member.id)) {
      if (ledger.charge.exempt || ledger.remaining <= 0) continue;
      const collection = view.collectionsById.get(ledger.charge.collectionId);
      if (!open(collection)) continue;
      const period = ledger.charge.periodId ? periods.get(ledger.charge.periodId) ?? null : null;
      list.push({ ledger, collection, month: period?.month ?? null, label: collectionPeriodLabel(collection, period) });
    }
    const orderKey = (item: Item) => item.ledger.charge.dueDate ?? (item.month ? `${item.month}-31` : "9999-12-31");
    list.sort(
      (a, b) =>
        orderKey(a).localeCompare(orderKey(b)) ||
        a.collection.createdAt.localeCompare(b.collection.createdAt) ||
        (a.month ?? "").localeCompare(b.month ?? ""),
    );
    const byCollection = new Map<string, Group>();
    for (const item of list) {
      const group = byCollection.get(item.collection.id) ?? { collection: item.collection, due: [], future: [] };
      (item.ledger.future ? group.future : group.due).push(item);
      byCollection.set(item.collection.id, group);
    }
    const joined = new Set(data.participants.filter((row) => row.memberId === member.id).map((row) => row.collectionId));
    const vol = data.collections.filter((collection) => collection.type === "voluntary" && joined.has(collection.id) && open(collection));
    return { items: list, groups: [...byCollection.values()], voluntary: vol };
  }, [data, view, member.id]);

  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("full");
  const [totalInput, setTotalInput] = useState("");
  const [parts, setParts] = useState<Record<string, string>>({});
  const [gifts, setGifts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState(true);
  const [paidOn, setPaidOn] = useState(view.today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per attempt: a double tap or retry returns the same payment instead of a second one.
  const attemptKey = useRef<string>(crypto.randomUUID());

  const ordered = items.filter((item) => selected.includes(item.ledger.charge.id));
  const payableSelected = sum(ordered.map((item) => item.ledger.payable));

  /** Spreads a total over the selected charges, oldest first. */
  const distribute = (input: string, over: Item[]) => {
    const parsed = input.trim() ? parseMoney(input) : null;
    if (!parsed || parsed.sen === null) return;
    const result = allocateInOrder(
      parsed.sen,
      over.map((item) => item.ledger),
    );
    if (!result.ok) return;
    const next: Record<string, string> = {};
    for (const item of over) {
      const share = result.plan.find((line) => line.chargeId === item.ledger.charge.id)?.amount ?? 0;
      next[item.ledger.charge.id] = senToInput(share);
    }
    setParts(next);
  };

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...selected, id] : selected.filter((value) => value !== id);
    setSelected(next);
    setError(null);
    if (mode === "custom") distribute(totalInput, items.filter((item) => next.includes(item.ledger.charge.id)));
  };
  const selectAllDue = () => {
    const next = items.filter((item) => !item.ledger.future && item.ledger.payable > 0).map((item) => item.ledger.charge.id);
    setSelected(next);
    if (mode === "custom") distribute(totalInput, items.filter((item) => next.includes(item.ledger.charge.id)));
  };

  // Validation ---------------------------------------------------------------------------
  const lineErrors: Record<string, string> = {};
  const allocations: { item: Item; amount: Sen }[] = [];
  for (const item of ordered) {
    const id = item.ledger.charge.id;
    if (mode === "full") {
      allocations.push({ item, amount: item.ledger.payable });
      continue;
    }
    const raw = parts[id] ?? "";
    if (!raw.trim()) continue;
    const parsed = parseMoney(raw);
    if (parsed.error !== null) lineErrors[id] = parsed.error;
    else if (parsed.sen > item.ledger.payable) lineErrors[id] = t("paymentNew.errors.exceedsBalance", { amount: formatMoney(item.ledger.payable) });
    else if (parsed.sen > 0) allocations.push({ item, amount: parsed.sen });
  }
  const chargeSum = sum(allocations.map((line) => line.amount));

  let totalError: string | null = null;
  let totalSen: Sen | null = null;
  if (mode === "custom" && ordered.length) {
    if (!totalInput.trim()) totalError = null;
    else {
      const parsed = parseMoney(totalInput);
      if (parsed.error !== null) totalError = parsed.error;
      else if (parsed.sen > payableSelected)
        totalError = t("paymentNew.errors.exceedsSelected", { amount: formatMoney(payableSelected) });
      else totalSen = parsed.sen;
    }
  }
  const difference = mode === "custom" && totalSen !== null ? totalSen - chargeSum : 0;

  const giftErrors: Record<string, string> = {};
  const contributions: { collection: Collection; amount: Sen }[] = [];
  for (const collection of voluntary) {
    const raw = gifts[collection.id] ?? "";
    if (!raw.trim()) continue;
    const parsed = parseMoney(raw);
    if (parsed.error !== null) giftErrors[collection.id] = parsed.error;
    else if (parsed.sen > 0) contributions.push({ collection, amount: parsed.sen });
  }
  const giftSum = sum(contributions.map((line) => line.amount));
  const grandTotal = chargeSum + giftSum;

  const dateError = !paidOn ? t("paymentNew.errors.pickDate") : paidOn > view.today ? t("paymentNew.errors.futureDate") : null;
  const problems = [
    ...Object.values(lineErrors),
    ...Object.values(giftErrors),
    ...(totalError ? [totalError] : []),
    ...(mode === "custom" && ordered.length && totalSen === null && !totalError ? [t("paymentNew.errors.enterTotal")] : []),
    ...(difference !== 0 ? [t("paymentNew.errors.allocDiffers", { amount: formatMoney(Math.abs(difference)) })] : []),
    ...(dateError ? [dateError] : []),
  ];
  const empty = allocations.length === 0 && contributions.length === 0;
  const canSave = !busy && !empty && problems.length === 0;

  // Before → after, from the ledgers. Pending money does not reduce a balance.
  const counted = received ? 1 : 0;
  const dueNowAfter = totals.dueNow - counted * sum(allocations.filter((line) => !line.item.ledger.future).map((line) => line.amount));
  const upcomingAfter = totals.upcoming - counted * sum(allocations.filter((line) => line.item.ledger.future).map((line) => line.amount));
  const pendingAfter = totals.pending + (received ? 0 : chargeSum);

  const submit = async () => {
    if (!canSave) {
      if (!busy) setError(empty ? t("paymentNew.errors.nothingSelected") : problems[0] ?? null);
      return;
    }
    setBusy(true);
    setError(null);
    const key = attemptKey.current;
    const before = totals;
    const paymentIds: string[] = [];
    const done = { payment: false, contributions: [] as { collection: Collection; amount: Sen }[] };
    const common = {
      memberId: member.id,
      method,
      paidOn,
      reference: reference.trim() || null,
      note: note.trim() || null,
      confirmed: received,
    };
    const report = (warning: string | null): Saved => ({
      memberId: member.id,
      before,
      confirmed: received,
      lines: [
        ...(done.payment ? allocations.map((line) => ({ label: line.item.label, amount: line.amount })) : []),
        ...done.contributions.map((line) => ({ label: `${t("payments.contributionFallback")} · ${line.collection.name}`, amount: line.amount })),
      ],
      total: (done.payment ? chargeSum : 0) + sum(done.contributions.map((line) => line.amount)),
      collectionIds: [
        ...new Set([
          ...(done.payment ? allocations.map((line) => line.item.collection.id) : []),
          ...done.contributions.map((line) => line.collection.id),
        ]),
      ],
      warning,
    });
    try {
      await run(async (backend) => {
        if (allocations.length) {
          const id = await backend.recordPayment({
            ...common,
            idempotencyKey: key,
            allocations: allocations.map((line) => ({ chargeId: line.item.ledger.charge.id, amount: line.amount })),
          });
          paymentIds.push(id);
          done.payment = true;
        }
        for (const line of contributions) {
          // Derived from the attempt key, so a retry of this attempt never doubles a contribution.
          paymentIds.push(
            await backend.recordContribution({ ...common, idempotencyKey: `${key}:${line.collection.id}`, collectionId: line.collection.id, amount: line.amount }),
          );
          done.contributions.push(line);
        }
      });
      attemptKey.current = crypto.randomUUID();
      toast.success(t("paymentNew.toastSaved", { amount: formatMoney(grandTotal), name: member.name }));
      // The money is stored whatever happens to the files; a failure is shown on the success panel.
      onSaved(report(await attachStaged(run, paymentIds, staged)));
    } catch (cause) {
      if (done.payment || done.contributions.length) {
        // Part of it is stored. Show exactly what was saved rather than pretending all or nothing.
        attemptKey.current = crypto.randomUUID();
        const attachWarning = await attachStaged(run, paymentIds, staged);
        onSaved(report(`${t("paymentNew.errors.partial", { error: messageFor(cause) })}${attachWarning ? ` ${attachWarning}` : ""}`));
      } else setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const hasCharges = groups.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="grid min-w-0 gap-5">
        <Step
          n={1}
          title={t("paymentNew.member.title")}
          action={
            <Button variant="outline" size="sm" onClick={onChange}>
              {t("paymentNew.member.change")}
            </Button>
          }
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-light text-sm font-semibold text-primary-strong" aria-hidden>
              {initials(member.name)}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/ahli/${member.id}/`} className="block font-semibold break-words hover:text-primary-strong hover:underline">
                {member.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {t("paymentNew.member.balance")} <b className={totals.dueNow > 0 ? "text-st-unpaid" : "text-st-paid"}>{formatMoney(totals.dueNow)}</b>
                {totals.pending > 0 && <> · {t("paymentNew.member.pendingReview", { amount: formatMoney(totals.pending) })}</>}
              </p>
            </div>
            {!member.active && <MemberStatus active={false} />}
          </div>
        </Step>

        <Step
          n={2}
          title={t("paymentNew.charges.title")}
          description={t("paymentNew.charges.description")}
          action={
            hasCharges ? (
              selected.length ? (
                <Button variant="outline" size="sm" onClick={() => setSelected([])}>
                  {t("paymentNew.charges.clear")}
                </Button>
              ) : items.some((item) => !item.ledger.future && item.ledger.payable > 0) ? (
                <Button variant="outline" size="sm" onClick={selectAllDue}>
                  {t("paymentNew.charges.selectAll")}
                </Button>
              ) : undefined
            ) : undefined
          }
        >
          {!hasCharges ? (
            <p className="rounded-xl bg-st-paid-bg px-3 py-3 text-sm text-st-paid">
              {t("paymentNew.charges.noneOwing", { name: member.name })}{" "}
              {voluntary.length ? t("paymentNew.charges.stillGift") : t("paymentNew.charges.nothingToPay")}
            </p>
          ) : (
            <div className="grid gap-3">
              {groups.map((group) => (
                <ChargeGroup
                  key={group.collection.id}
                  group={group}
                  selected={selected}
                  onToggle={toggle}
                  custom={mode === "custom"}
                  parts={parts}
                  errors={lineErrors}
                  onPart={(id, value) => {
                    setParts((current) => ({ ...current, [id]: value }));
                    setError(null);
                  }}
                />
              ))}
            </div>
          )}
        </Step>

        {ordered.length > 0 && (
          <Step n={3} title={t("paymentNew.amount.title")}>
            <div className="grid gap-3">
              <ChoiceCards
                label={t("paymentNew.amount.modeLabel")}
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setError(null);
                  if (next === "custom") distribute(totalInput, ordered);
                }}
                className="grid gap-2 sm:grid-cols-2"
              >
                <ModeOption value="full" checked={mode === "full"} title={t("paymentNew.amount.modeFull")} hint={formatMoney(payableSelected)} />
                <ModeOption value="custom" checked={mode === "custom"} title={t("paymentNew.amount.modeCustom")} hint={t("paymentNew.amount.modeCustomHint")} />
              </ChoiceCards>
              {mode === "custom" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-total" className="text-xs text-muted-foreground">
                    {t("paymentNew.amount.totalLabel")}
                  </Label>
                  <MoneyInput
                    id="pay-total"
                    autoFocus
                    value={totalInput}
                    onChange={(event) => {
                      setTotalInput(event.target.value);
                      setError(null);
                      distribute(event.target.value, ordered);
                    }}
                    placeholder={senToInput(payableSelected)}
                    invalid={Boolean(totalError)}
                  />
                  {totalError ? (
                    <p className="text-xs font-medium text-st-unpaid">{totalError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("paymentNew.amount.maxHint", { amount: formatMoney(payableSelected) })}
                    </p>
                  )}
                  {totalSen !== null && (
                    <p
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-xs tabular-nums",
                        difference === 0 ? "bg-st-paid-bg text-st-paid" : "bg-st-partial-bg text-st-partial",
                      )}
                    >
                      {difference === 0
                        ? t("paymentNew.amount.allocMatch", { sum: formatMoney(chargeSum), total: formatMoney(totalSen) })
                        : difference > 0
                          ? t("paymentNew.amount.allocShort", { sum: formatMoney(chargeSum), total: formatMoney(totalSen), diff: formatMoney(difference) })
                          : t("paymentNew.amount.allocOver", { sum: formatMoney(chargeSum), total: formatMoney(totalSen), diff: formatMoney(-difference) })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Step>
        )}

        {voluntary.length > 0 && (
          <SectionCard title={t("paymentNew.gifts.title")} icon={HandCoins} description={t("paymentNew.gifts.description")}>
            <div className="grid gap-3">
              {voluntary.map((collection) => {
                const cell = view.cell(member, view.columns([collection])[0]);
                return (
                  <div key={collection.id} className="grid gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <Label htmlFor={`gift-${collection.id}`} className="text-sm">
                        {collection.name}
                      </Label>
                      {cell.kind === "voluntary" && (
                        <span className="text-xs text-muted-foreground">
                          {t("paymentNew.gifts.sofar")} <Money sen={cell.received} />
                        </span>
                      )}
                    </div>
                    <MoneyInput
                      id={`gift-${collection.id}`}
                      value={gifts[collection.id] ?? ""}
                      onChange={(event) => setGifts((current) => ({ ...current, [collection.id]: event.target.value }))}
                      placeholder="0.00"
                      invalid={Boolean(giftErrors[collection.id])}
                    />
                    {giftErrors[collection.id] && <p className="text-xs font-medium text-st-unpaid">{giftErrors[collection.id]}</p>}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        <Step n={ordered.length > 0 ? 4 : 3} title={t("paymentNew.details.title")}>
          <div className="grid gap-3">
            <SegmentedChoice
              label={t("paymentNew.details.methodLabel")}
              value={method}
              options={methods.map((value) => ({ value, label: methodLabels[value] }))}
              onChange={(value) => {
                setMethod(value);
                setReceived(value === "cash");
              }}
              itemClassName="min-h-11 px-1.5"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid min-w-0 gap-1">
                <Label htmlFor="pay-date" className="text-xs text-muted-foreground">
                  {t("paymentNew.details.date")}
                </Label>
                <DatePicker id="pay-date" value={paidOn} max={view.today} onChange={setPaidOn} invalid={Boolean(dateError)} className="px-2.5" />
                {dateError && <p className="text-xs font-medium text-st-unpaid">{dateError}</p>}
              </div>
              <div className="grid min-w-0 gap-1">
                <Label htmlFor="pay-ref" className="text-xs text-muted-foreground">
                  {t("paymentNew.details.reference")}
                </Label>
                <Input
                  id="pay-ref"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder={method === "transfer" ? t("paymentNew.details.referenceTransfer") : t("paymentNew.details.referenceOther")}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="pay-note" className="text-xs text-muted-foreground">
                {t("paymentNew.details.note")}
              </Label>
              <Textarea id="pay-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("paymentNew.details.notePlaceholder")} />
            </div>
            <ProofField staged={staged} onChange={setStaged} />
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
              <Checkbox checked={received} onCheckedChange={(value) => setReceived(value === true)} className="mt-0.5" />
              <span className="text-xs leading-snug">
                <span className="block font-medium text-foreground">{t("paymentNew.details.receivedTitle")}</span>
                <span className="text-muted-foreground">
                  {received ? t("paymentNew.details.receivedYes") : t("paymentNew.details.receivedNo")}
                </span>
              </span>
            </label>
          </div>
        </Step>
      </div>

      <div className="grid gap-3 lg:sticky lg:top-20">
        <Review
          member={member}
          allocations={allocations}
          contributions={contributions}
          received={received}
          before={totals}
          after={{ dueNow: dueNowAfter, upcoming: upcomingAfter, pending: pendingAfter }}
          total={grandTotal}
        />
        {error && (
          <p role="alert" className="rounded-xl bg-st-unpaid-bg px-3 py-2 text-xs font-medium text-st-unpaid">
            {error}
          </p>
        )}
        <Button size="lg" className="hidden w-full md:inline-flex" onClick={() => void submit()} disabled={busy || empty}>
          {busy && <Spinner className="size-4" />}
          {busy ? t("paymentNew.saving") : t("paymentNew.saveAmount", { amount: formatMoney(grandTotal) })}
        </Button>
        {!empty && problems.length > 0 && <p className="hidden text-xs text-st-partial md:block">{problems[0]}</p>}
      </div>

      {/* Phones: the total and Save stay in reach above the bottom navigation. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card/95 px-4 py-2.5 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{received ? t("paymentNew.mobileTotal") : t("paymentNew.mobileTotalPending")}</p>
            <p className="truncate text-[17px] font-bold tabular-nums">{formatMoney(grandTotal)}</p>
          </div>
          <Button size="lg" className="shrink-0" onClick={() => void submit()} disabled={busy || empty}>
            {busy && <Spinner className="size-4" />}
            {busy ? t("paymentNew.saving") : t("paymentNew.save")}
          </Button>
        </div>
        {!empty && problems.length > 0 && <p className="mt-1 truncate text-[11px] text-st-partial">{problems[0]}</p>}
      </div>
    </div>
  );
}

function ModeOption({ value, checked, title, hint }: { value: Mode; checked: boolean; title: string; hint: string }) {
  return (
    <ChoiceCard value={value} checked={checked} indicator className="gap-2.5 rounded-xl px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">{hint}</span>
      </span>
    </ChoiceCard>
  );
}

function ChargeGroup({
  group,
  selected,
  onToggle,
  custom,
  parts,
  errors,
  onPart,
}: {
  group: Group;
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
  custom: boolean;
  parts: Record<string, string>;
  errors: Record<string, string>;
  onPart: (id: string, value: string) => void;
}) {
  const t = useT();
  const futureSelected = group.future.some((item) => selected.includes(item.ledger.charge.id));
  const [showFuture, setShowFuture] = useState(futureSelected);
  const futureId = useId();
  const row = (item: Item) => (
    <ChargeRow
      key={item.ledger.charge.id}
      item={item}
      checked={selected.includes(item.ledger.charge.id)}
      onToggle={onToggle}
      custom={custom}
      value={parts[item.ledger.charge.id] ?? ""}
      error={errors[item.ledger.charge.id]}
      onPart={onPart}
    />
  );
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-primary-tint/40 p-2.5">
      <p className="flex flex-wrap items-baseline gap-x-2 px-0.5 text-sm font-semibold">
        {group.collection.name}
        <span className="text-xs font-normal text-muted-foreground">{collectionTypeLabels[group.collection.type]}</span>
      </p>
      {group.due.length > 0 && <ul className="grid gap-1.5">{group.due.map(row)}</ul>}
      {group.future.length > 0 && (
        <div className="grid gap-1.5">
          <Button
            variant="ghost"
            aria-expanded={showFuture || futureSelected}
            aria-controls={futureId}
            onClick={() => setShowFuture(!(showFuture || futureSelected))}
            disabled={futureSelected}
            className="h-auto min-h-10 w-full justify-between gap-2 rounded-lg px-2 text-left text-xs font-medium whitespace-normal text-st-future hover:bg-st-future-bg hover:text-st-future aria-expanded:bg-transparent aria-expanded:text-st-future disabled:opacity-100"
          >
            <span>
              {t(group.future.length === 1 ? "paymentNew.charges.futureOne" : "paymentNew.charges.futureMany", { count: group.future.length })}
            </span>
            <ChevronDown className={cn("size-4 transition-transform", (showFuture || futureSelected) && "rotate-180")} aria-hidden />
          </Button>
          {(showFuture || futureSelected) && (
            <ul id={futureId} className="grid gap-1.5">
              {group.future.map(row)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ChargeRow({
  item,
  checked,
  onToggle,
  custom,
  value,
  error,
  onPart,
}: {
  item: Item;
  checked: boolean;
  onToggle: (id: string, on: boolean) => void;
  custom: boolean;
  value: string;
  error?: string;
  onPart: (id: string, value: string) => void;
}) {
  const t = useT();
  const { ledger } = item;
  const id = ledger.charge.id;
  const blocked = ledger.payable === 0;
  const title = item.month ? formatMonthLong(item.month) : ledger.charge.dueDate ? t("paymentNew.charges.dueDate", { date: formatDay(ledger.charge.dueDate) }) : t("paymentNew.charges.oneOff");
  return (
    <li className={cn("rounded-lg border bg-card", checked ? "border-primary" : "border-border", blocked && "opacity-75")}>
      <label className={cn("flex items-start gap-3 px-3 py-2.5", blocked ? "cursor-not-allowed" : "cursor-pointer")}>
        <Checkbox
          checked={checked}
          disabled={blocked}
          onCheckedChange={(next) => onToggle(id, next === true)}
          className="mt-0.5"
          aria-label={item.label}
        />
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{title}</span>
            <ChargeStatusChips status={cellStatus(ledger)} overdue={ledger.overdue} pending={ledger.pending > 0} compact />
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("paymentNew.charges.required", { amount: formatMoney(ledger.required) })} · {t("paymentNew.charges.received", { amount: formatMoney(ledger.confirmed) })} ·{" "}
            <b className="font-semibold text-foreground">{t("paymentNew.charges.balance", { amount: formatMoney(ledger.remaining) })}</b>
            {ledger.pending > 0 && <> · {t("paymentNew.charges.pending", { amount: formatMoney(ledger.pending) })}</>}
          </span>
          {blocked && <span className="text-xs text-st-pending">{t("paymentNew.charges.blocked")}</span>}
          {!blocked && ledger.pending > 0 && (
            <span className="text-xs text-muted-foreground">{t("paymentNew.charges.payableNow", { amount: formatMoney(ledger.payable) })}</span>
          )}
        </span>
      </label>
      {checked && custom && (
        <div className="grid gap-1 border-t border-dashed border-border px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`part-${id}`} className="text-xs text-muted-foreground">
              {t("paymentNew.charges.partLabel")}
            </Label>
            <TextAction onClick={() => onPart(id, senToInput(ledger.payable))}>{t("paymentNew.charges.full", { amount: formatMoney(ledger.payable) })}</TextAction>
          </div>
          <MoneyInput id={`part-${id}`} value={value} onChange={(event) => onPart(id, event.target.value)} placeholder="0.00" invalid={Boolean(error)} />
          {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
        </div>
      )}
    </li>
  );
}

function Review({
  member,
  allocations,
  contributions,
  received,
  before,
  after,
  total,
}: {
  member: Member;
  allocations: { item: Item; amount: Sen }[];
  contributions: { collection: Collection; amount: Sen }[];
  received: boolean;
  before: Totals;
  after: { dueNow: Sen; upcoming: Sen; pending: Sen };
  total: Sen;
}) {
  const t = useT();
  const empty = !allocations.length && !contributions.length;
  return (
    <SectionCard title={t("paymentNew.review.title")} icon={ReceiptText} className="bg-card">
      {empty ? (
        <p className="text-sm text-muted-foreground">{t("paymentNew.review.empty")}</p>
      ) : (
        <div className="grid gap-3">
          <ul className="grid gap-2">
            {allocations.map(({ item, amount }) => {
              const left = item.ledger.remaining - (received ? amount : 0);
              return (
                <li key={item.ledger.charge.id} className="grid gap-0.5 text-sm">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words">{item.label}</span>
                    <b className="shrink-0 tabular-nums">{formatMoney(amount)}</b>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    {t("paymentNew.review.balance", { amount: formatMoney(item.ledger.remaining) })} <ArrowRight className="size-3" aria-hidden />
                    <span className={cn("font-medium", left === 0 ? "text-st-paid" : "text-foreground")}>{formatMoney(left)}</span>
                  </span>
                </li>
              );
            })}
            {contributions.map(({ collection, amount }) => (
              <li key={collection.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0 break-words">{t("payments.contributionFallback")} · {collection.name}</span>
                <b className="shrink-0 tabular-nums">{formatMoney(amount)}</b>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-sm font-medium">{t("paymentNew.review.total")}</span>
            <span className="text-lg font-bold tabular-nums">{formatMoney(total)}</span>
          </div>
          {!received && (
            <p className="flex items-start gap-1.5 rounded-lg bg-st-pending-bg px-2.5 py-2 text-xs text-st-pending">
              <Hourglass className="mt-px size-3.5 shrink-0" aria-hidden />
              {t("paymentNew.review.pendingNote")}
            </p>
          )}
          <dl className="grid gap-1.5 rounded-xl bg-primary-tint/70 p-2.5 text-xs">
            <p className="text-[11px] font-semibold text-muted-foreground">{t("paymentNew.review.beforeAfter", { name: member.name })}</p>
            <BeforeAfter label={t("paymentNew.review.currentBalance")} before={before.dueNow} after={after.dueNow} />
            {(before.upcoming > 0 || after.upcoming !== before.upcoming) && <BeforeAfter label={t("paymentNew.review.upcoming")} before={before.upcoming} after={after.upcoming} />}
            {(before.pending > 0 || after.pending !== before.pending) && <BeforeAfter label={t("paymentNew.review.pending")} before={before.pending} after={after.pending} />}
          </dl>
        </div>
      )}
    </SectionCard>
  );
}

function BeforeAfter({ label, before, after }: { label: string; before: Sen; after: Sen }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 tabular-nums">
        {formatMoney(before)} <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
        <b className={cn(after < before && "text-st-paid")}>{formatMoney(after)}</b>
      </dd>
    </div>
  );
}

// Step 6: done -------------------------------------------------------------------------------

function SuccessPanel({ saved, member, onAgain, onOther }: { saved: Saved; member: Member; onAgain: () => void; onOther: () => void }) {
  const t = useT();
  const { view } = useSnapshot();
  const now = view.memberTotals(member.id);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const kutipanHref = saved.collectionIds.length === 1 ? `/kutipan/${saved.collectionIds[0]}/` : "/kutipan/";

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4">
      <SectionCard>
        <div className="grid justify-items-center gap-3 py-2 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-st-paid-bg text-st-paid">
            <CircleCheckBig className="size-7" aria-hidden />
          </span>
          <div>
            <h2 ref={heading} tabIndex={-1} className="font-display text-xl font-bold tracking-[-.01em] outline-none">
              {t("paymentNew.success.recorded", { amount: formatMoney(saved.total) })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("paymentNew.success.forMember", { name: member.name })} ·{" "}
              {saved.confirmed ? t("paymentNew.success.counted") : t("paymentNew.success.notCounted")}
            </p>
          </div>
          <LabelChip entry={paymentStateLabels[saved.confirmed ? "confirmed" : "pending"]} />
        </div>
        {saved.warning && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-st-partial-bg px-3 py-2 text-xs text-st-partial">
            <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden /> {saved.warning}
          </p>
        )}
        <ul className="mt-4 grid gap-1.5 border-t border-border pt-3">
          {saved.lines.map((line, index) => (
            <li key={`${line.label}-${index}`} className="flex items-start justify-between gap-2 text-sm">
              <span className="min-w-0 break-words text-muted-foreground">{line.label}</span>
              <b className="shrink-0 tabular-nums">{formatMoney(line.amount)}</b>
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid gap-1.5 rounded-xl bg-primary-tint/70 p-3 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">{t("paymentNew.success.updated", { name: member.name })}</p>
          <BeforeAfter label={t("paymentNew.review.currentBalance")} before={saved.before.dueNow} after={now.dueNow} />
          <BeforeAfter label={t("paymentNew.success.receivedConfirmed")} before={saved.before.received} after={now.received} />
          {(saved.before.pending > 0 || now.pending > 0) && <BeforeAfter label={t("paymentNew.review.pending")} before={saved.before.pending} after={now.pending} />}
          {(saved.before.upcoming > 0 || now.upcoming > 0) && <BeforeAfter label={t("paymentNew.review.upcoming")} before={saved.before.upcoming} after={now.upcoming} />}
        </dl>
      </SectionCard>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="lg" onClick={onAgain}>
          <ReceiptText /> {t("paymentNew.success.again")}
        </Button>
        <Button size="lg" variant="brand" onClick={onOther}>
          <UserRound /> {t("paymentNew.success.other")}
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/matriks/">
            <SheetIcon /> {t("paymentNew.success.matrix")}
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href={kutipanHref}>
            <WalletCards /> {t("paymentNew.success.backToCollection")}
          </Link>
        </Button>
      </div>
      {!saved.confirmed && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <BadgeCheck className="mt-px size-4 shrink-0 text-st-pending" aria-hidden />
          <span>
            {t("paymentNew.success.confirmBefore")}{" "}
            <Link href="/bayaran/?tab=semakan" className="font-medium text-primary-strong hover:underline">
              {t("paymentNew.success.confirmLink")}
            </Link>{" "}
            {t("paymentNew.success.confirmAfter")}
          </span>
        </p>
      )}
    </div>
  );
}
