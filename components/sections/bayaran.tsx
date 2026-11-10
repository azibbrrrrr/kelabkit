"use client";

import { useSnapshot } from "@/components/data-provider";
import { DatePicker } from "@/components/date-picker";
import { PaymentList } from "@/components/payments";
import { DataTable, EmptyState, LabelChip, MobileRow, PageHeader, PageShell, SearchInput, StatCard, type Column } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ModalBody, ModalFooter, ModalHeader } from "@/components/modal";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t as translate } from "@/lib/i18n";
import { useT } from "@/lib/i18n/react";
import { formatDay, formatMoney, formatMonth, formatMonthLong, formatNumber } from "@/lib/format";
import { methodLabels, paymentStateLabels } from "@/lib/labels";
import { monthOf } from "@/lib/money/months";
import type { Payment, PaymentMethod, PaymentState, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BadgeCheck, FilterX, Hourglass, Plus, ReceiptText, Undo2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";

// Every payment transaction, with the review queue for payments recorded before the money
// was confirmed. Nothing here edits a payment: confirm and reverse go through PaymentList.

type Tab = "semua" | "semakan" | "dibatalkan";
const TABS: Tab[] = ["semua", "semakan", "dibatalkan"];
const PAGE = 40;

/** "Yuran KGK 2026 (Jan, Feb)" or "Jamuan Akhir Tahun" — what a payment was for. */
export function paymentTargets(data: Snapshot) {
  const collections = new Map(data.collections.map((row) => [row.id, row]));
  const charges = new Map(data.charges.map((row) => [row.id, row]));
  const periods = new Map(data.periods.map((row) => [row.id, row]));
  const byPayment = new Map<string, string[]>();
  for (const allocation of data.allocations) {
    const list = byPayment.get(allocation.paymentId) ?? [];
    list.push(allocation.chargeId);
    byPayment.set(allocation.paymentId, list);
  }
  return (payment: Payment) => {
    if (payment.collectionId) return collections.get(payment.collectionId)?.name ?? translate("paymentsPage.targetFallbackDonation");
    const grouped = new Map<string, string[]>();
    for (const chargeId of byPayment.get(payment.id) ?? []) {
      const charge = charges.get(chargeId);
      if (!charge) continue;
      const months = grouped.get(charge.collectionId) ?? [];
      const period = charge.periodId ? periods.get(charge.periodId) : undefined;
      if (period) months.push(period.month);
      grouped.set(charge.collectionId, months);
    }
    const parts = [...grouped.entries()].map(([collectionId, months]) => {
      const name = collections.get(collectionId)?.name ?? translate("paymentsPage.targetFallbackCollection");
      if (!months.length) return name;
      months.sort();
      return `${name} (${months.map((month) => formatMonth(month, false)).join(", ")})`;
    });
    return parts.join(" · ") || "—";
  };
}

export function BayaranPage() {
  const t = useT();
  const { data, view } = useSnapshot();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "semua";

  const [query, setQuery] = useState("");
  // The heavy filter/render follows the keystroke at lower priority, so typing never waits on it.
  const deferredQuery = useDeferredValue(query);
  const [method, setMethod] = useState<PaymentMethod | "all">("all");
  const [state, setState] = useState<PaymentState | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(null);

  const setTab = (next: Tab) => {
    const search = new URLSearchParams(params.toString());
    if (next === "semua") search.delete("tab");
    else search.set("tab", next);
    const qs = search.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setLimit(PAGE);
  };

  const targetOf = useMemo(() => paymentTargets(data), [data]);
  const sorted = useMemo(
    () => [...data.payments].sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.localeCompare(a.createdAt)),
    [data.payments],
  );
  const pending = sorted.filter((payment) => payment.state === "pending");
  const reversed = sorted.filter((payment) => payment.state === "reversed");

  const thisMonth = monthOf(view.today);
  const monthRows = data.payments.filter((payment) => monthOf(payment.paidOn) === thisMonth);
  const receivedThisMonth = monthRows.filter((payment) => payment.state === "confirmed").reduce((total, payment) => total + payment.amount, 0);
  const pendingTotal = pending.reduce((total, payment) => total + payment.amount, 0);
  const monthCount = monthRows.filter((payment) => payment.state !== "reversed").length;

  const filtersOn = Boolean(query.trim() || method !== "all" || state !== "all" || from || to);
  const clearFilters = () => {
    setQuery("");
    setMethod("all");
    setState("all");
    setFrom("");
    setTo("");
  };

  const rows = useMemo(() => {
    const base = tab === "semua" ? sorted : reversed;
    const q = deferredQuery.trim().toLowerCase();
    return base.filter((payment) => {
      if (method !== "all" && payment.method !== method) return false;
      if (tab === "semua" && state !== "all" && payment.state !== state) return false;
      if (from && payment.paidOn < from) return false;
      if (to && payment.paidOn > to) return false;
      if (q) {
        const name = view.membersById.get(payment.memberId)?.name.toLowerCase() ?? "";
        const reference = payment.reference?.toLowerCase() ?? "";
        if (!name.includes(q) && !reference.includes(q)) return false;
      }
      return true;
    });
  }, [tab, sorted, reversed, deferredQuery, method, state, from, to, view.membersById]);

  const selectedPayment = selected ? data.payments.find((payment) => payment.id === selected) ?? null : null;

  const columns: Column<Payment>[] = [
    { key: "date", header: t("paymentsPage.columns.date"), cell: (payment) => <span className="whitespace-nowrap tabular-nums">{formatDay(payment.paidOn)}</span> },
    {
      key: "member",
      header: t("paymentsPage.columns.member"),
      cell: (payment) => <span className="block max-w-[220px] truncate font-medium">{view.membersById.get(payment.memberId)?.name ?? t("paymentsPage.memberFallback")}</span>,
    },
    {
      key: "target",
      header: t("paymentsPage.columns.collection"),
      hideBelow: "lg",
      cell: (payment) => <span className="line-clamp-2 max-w-[280px] text-muted-foreground">{targetOf(payment)}</span>,
    },
    {
      key: "amount",
      header: t("paymentsPage.columns.amount"),
      align: "right",
      cell: (payment) => (
        <span className={cn("font-semibold whitespace-nowrap", payment.state === "reversed" && "text-muted-foreground line-through")}>
          {formatMoney(payment.amount)}
        </span>
      ),
    },
    { key: "method", header: t("paymentsPage.columns.method"), hideBelow: "lg", cell: (payment) => <span className="text-muted-foreground">{methodLabels[payment.method]}</span> },
    { key: "state", header: t("paymentsPage.columns.status"), cell: (payment) => <LabelChip entry={paymentStateLabels[payment.state]} compact /> },
  ];

  return (
    <PageShell>
      <PageHeader
        title={t("paymentsPage.header.title")}
        description={t("paymentsPage.header.description")}
        actions={
          <Button asChild>
            <Link href="/bayaran/baru/">
              <Plus /> {t("paymentsPage.header.record")}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t("paymentsPage.stats.receivedLabel")}
          value={formatMoney(receivedThisMonth)}
          icon={BadgeCheck}
          tone="paid"
          hint={t("paymentsPage.stats.receivedHint", { month: formatMonthLong(thisMonth) })}
        />
        <StatCard
          label={t("paymentsPage.stats.pendingLabel")}
          value={formatMoney(pendingTotal)}
          icon={Hourglass}
          tone="pending"
          hint={pending.length ? t("paymentsPage.stats.pendingHint", { count: pending.length }) : t("paymentsPage.stats.pendingNone")}
          href={pending.length ? "/bayaran/?tab=semakan" : undefined}
        />
        <StatCard label={t("paymentsPage.stats.countLabel")} value={formatNumber(monthCount)} icon={ReceiptText} hint={t("paymentsPage.stats.countHint")} />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        {/* Three tabs fit at 320px: the long label shortens below sm, and the triggers tighten. */}
        <TabsList className="h-10! w-full rounded-xl bg-primary-tint p-1 sm:w-fit">
          <TabsTrigger value="semua" className="gap-1 rounded-lg px-2 text-[13px] sm:gap-1.5 sm:px-3 sm:text-sm">
            {t("paymentsPage.tabs.all")} <span className="text-muted-foreground tabular-nums">{data.payments.length}</span>
          </TabsTrigger>
          <TabsTrigger value="semakan" className="gap-1 rounded-lg px-2 text-[13px] sm:gap-1.5 sm:px-3 sm:text-sm">
            <span className="hidden sm:inline">{t("paymentsPage.tabs.reviewLong")}</span>
            <span className="sm:hidden">{t("paymentsPage.tabs.reviewShort")}</span> <span className="text-muted-foreground tabular-nums">{pending.length}</span>
          </TabsTrigger>
          <TabsTrigger value="dibatalkan" className="gap-1 rounded-lg px-2 text-[13px] sm:gap-1.5 sm:px-3 sm:text-sm">
            {t("paymentsPage.tabs.reversed")} <span className="text-muted-foreground tabular-nums">{reversed.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "semakan" ? (
        pending.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title={t("paymentsPage.review.emptyTitle")}
            description={t("paymentsPage.review.emptyDescription")}
          />
        ) : (
          <div className="grid gap-3">
            <p className="rounded-2xl bg-st-pending-bg px-4 py-3 text-sm text-st-pending">
              {t("paymentsPage.review.bannerBefore", { count: pending.length })}
              <b>{formatMoney(pendingTotal)}</b>
              {t("paymentsPage.review.bannerAfter")}
            </p>
            <PaymentList payments={pending} showMember />
          </div>
        )
      ) : (
        <>
          <div className="grid gap-2.5">
            <SearchInput id="payment-search" value={query} onChange={setQuery} placeholder={t("paymentsPage.filters.searchPlaceholder")} className="sm:max-w-sm" />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">{t("paymentsPage.filters.method")}</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod | "all")}>
                  <SelectTrigger aria-label={t("paymentsPage.filters.methodAria")} className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("paymentsPage.filters.allMethods")}</SelectItem>
                    {(Object.keys(methodLabels) as PaymentMethod[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {methodLabels[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {tab === "semua" && (
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">{t("paymentsPage.filters.status")}</Label>
                  <Select value={state} onValueChange={(value) => setState(value as PaymentState | "all")}>
                    <SelectTrigger aria-label={t("paymentsPage.filters.statusAria")} className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("paymentsPage.filters.allStatuses")}</SelectItem>
                      {(Object.keys(paymentStateLabels) as PaymentState[]).map((key) => (
                        <SelectItem key={key} value={key}>
                          {paymentStateLabels[key][0]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid min-w-0 gap-1">
                <Label htmlFor="pay-from" className="text-xs text-muted-foreground">
                  {t("paymentsPage.filters.from")}
                </Label>
                <DatePicker id="pay-from" value={from} max={to || view.today} onChange={setFrom} clearable emptyLabel={t("paymentsPage.filters.anyDate")} clearLabel={t("paymentsPage.filters.clearDate")} className="h-10 px-2.5 sm:w-40" />
              </div>
              <div className="grid min-w-0 gap-1">
                <Label htmlFor="pay-to" className="text-xs text-muted-foreground">
                  {t("paymentsPage.filters.to")}
                </Label>
                <DatePicker id="pay-to" value={to} min={from || undefined} max={view.today} onChange={setTo} clearable emptyLabel={t("paymentsPage.filters.anyDate")} clearLabel={t("paymentsPage.filters.clearDate")} className="h-10 px-2.5 sm:w-40" />
              </div>
              {filtersOn && (
                <Button variant="outline" onClick={clearFilters} className="col-span-2 h-10 justify-self-start rounded-xl sm:col-span-1">
                  <FilterX /> {t("paymentsPage.filters.clear")}
                </Button>
              )}
            </div>
          </div>

          {data.payments.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={t("paymentsPage.empty.noneTitle")}
              description={t("paymentsPage.empty.noneDescription")}
              action={
                <Button asChild>
                  <Link href="/bayaran/baru/">{t("paymentsPage.empty.noneAction")}</Link>
                </Button>
              }
            />
          ) : tab === "dibatalkan" && reversed.length === 0 ? (
            <EmptyState icon={Undo2} title={t("paymentsPage.empty.reversedTitle")} description={t("paymentsPage.empty.reversedDescription")} />
          ) : (
            <>
              <DataTable
                rows={rows.slice(0, limit)}
                columns={columns}
                rowKey={(payment) => payment.id}
                onSelect={(payment) => setSelected(payment.id)}
                empty={
                  <EmptyState
                    icon={FilterX}
                    title={t("paymentsPage.empty.noMatchTitle")}
                    description={t("paymentsPage.empty.noMatchDescription")}
                    action={
                      <Button variant="outline" onClick={clearFilters}>
                        {t("paymentsPage.filters.clear")}
                      </Button>
                    }
                  />
                }
                mobileCard={(payment) => (
                  <MobileRow
                    title={view.membersById.get(payment.memberId)?.name ?? t("paymentsPage.memberFallback")}
                    amount={<span className={cn(payment.state === "reversed" && "text-muted-foreground line-through")}>{formatMoney(payment.amount)}</span>}
                    meta={`${formatDay(payment.paidOn)} · ${methodLabels[payment.method]} · ${targetOf(payment)}`}
                    status={<LabelChip entry={paymentStateLabels[payment.state]} compact />}
                  />
                )}
              />
              {rows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {t("paymentsPage.footer.showing", { shown: Math.min(limit, rows.length), total: rows.length })}
                  </span>
                  {rows.length > limit && (
                    <Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>
                      {t("paymentsPage.footer.more")}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={selectedPayment !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent size="md">
          <ModalHeader
            icon={ReceiptText}
            title="Butiran bayaran"
            description={selectedPayment ? `Dibayar ${formatDay(selectedPayment.paidOn)} oleh ${view.membersById.get(selectedPayment.memberId)?.name ?? "ahli"}.` : ""}
          />
          <ModalBody>
            {selectedPayment && (
              <>
                <PaymentList payments={[selectedPayment]} showMember />
                {selectedPayment.note && <p className="text-xs text-muted-foreground">Catatan: {selectedPayment.note}</p>}
              </>
            )}
          </ModalBody>
          <ModalFooter
            start={
              selectedPayment && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/ahli/${selectedPayment.memberId}/`}>
                    <UserRound /> Lihat profil ahli
                  </Link>
                </Button>
              )
            }
          >
            <DialogClose asChild>
              <Button>Tutup</Button>
            </DialogClose>
          </ModalFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
