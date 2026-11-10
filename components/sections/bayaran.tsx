"use client";

import { useSnapshot } from "@/components/data-provider";
import { PaymentList } from "@/components/payments";
import { DataTable, EmptyState, LabelChip, MobileRow, PageHeader, PageShell, SearchInput, StatCard, type Column } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDay, formatMoney, formatMonth, formatMonthLong, formatNumber } from "@/lib/format";
import { methodLabels, paymentStateLabels } from "@/lib/labels";
import { monthOf } from "@/lib/money/months";
import type { Payment, PaymentMethod, PaymentState, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BadgeCheck, FilterX, Hourglass, Plus, ReceiptText, Undo2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

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
    if (payment.collectionId) return collections.get(payment.collectionId)?.name ?? "Sumbangan";
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
      const name = collections.get(collectionId)?.name ?? "Kutipan";
      if (!months.length) return name;
      months.sort();
      return `${name} (${months.map((month) => formatMonth(month, false)).join(", ")})`;
    });
    return parts.join(" · ") || "—";
  };
}

export function BayaranPage() {
  const { data, view } = useSnapshot();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "semua";

  const [query, setQuery] = useState("");
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
    const q = query.trim().toLowerCase();
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
  }, [tab, sorted, reversed, query, method, state, from, to, view.membersById]);

  const selectedPayment = selected ? data.payments.find((payment) => payment.id === selected) ?? null : null;

  const columns: Column<Payment>[] = [
    { key: "date", header: "Tarikh", cell: (payment) => <span className="whitespace-nowrap tabular-nums">{formatDay(payment.paidOn)}</span> },
    {
      key: "member",
      header: "Ahli",
      cell: (payment) => <span className="block max-w-[220px] truncate font-medium">{view.membersById.get(payment.memberId)?.name ?? "Ahli"}</span>,
    },
    {
      key: "target",
      header: "Kutipan",
      hideBelow: "lg",
      cell: (payment) => <span className="line-clamp-2 max-w-[280px] text-muted-foreground">{targetOf(payment)}</span>,
    },
    {
      key: "amount",
      header: "Jumlah",
      align: "right",
      cell: (payment) => (
        <span className={cn("font-semibold whitespace-nowrap", payment.state === "reversed" && "text-muted-foreground line-through")}>
          {formatMoney(payment.amount)}
        </span>
      ),
    },
    { key: "method", header: "Kaedah", hideBelow: "lg", cell: (payment) => <span className="text-muted-foreground">{methodLabels[payment.method]}</span> },
    { key: "state", header: "Status", cell: (payment) => <LabelChip entry={paymentStateLabels[payment.state]} compact /> },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Rekod Bayaran"
        description="Semua transaksi bayaran dan sumbangan. Bayaran tidak pernah dipadam atau diubah; pembetulan dibuat dengan membatalkan bersama sebab."
        actions={
          <Button asChild>
            <Link href="/bayaran/baru/">
              <Plus /> Rekod Bayaran
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Diterima bulan ini"
          value={formatMoney(receivedThisMonth)}
          icon={BadgeCheck}
          tone="paid"
          hint={`${formatMonthLong(thisMonth)} · disahkan sahaja`}
        />
        <StatCard
          label="Menunggu semakan"
          value={formatMoney(pendingTotal)}
          icon={Hourglass}
          tone="pending"
          hint={pending.length ? `${pending.length} bayaran belum disahkan` : "Tiada bayaran tertunda"}
          href={pending.length ? "/bayaran/?tab=semakan" : undefined}
        />
        <StatCard label="Transaksi bulan ini" value={formatNumber(monthCount)} icon={ReceiptText} hint="Tidak termasuk yang dibatalkan" />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="h-10! rounded-xl bg-primary-tint p-1">
          <TabsTrigger value="semua" className="rounded-lg px-3">
            Semua <span className="text-muted-foreground tabular-nums">{data.payments.length}</span>
          </TabsTrigger>
          <TabsTrigger value="semakan" className="rounded-lg px-3">
            Menunggu Semakan <span className="text-muted-foreground tabular-nums">{pending.length}</span>
          </TabsTrigger>
          <TabsTrigger value="dibatalkan" className="rounded-lg px-3">
            Dibatalkan <span className="text-muted-foreground tabular-nums">{reversed.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "semakan" ? (
        pending.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title="Tiada bayaran menunggu semakan"
            description="Bayaran yang direkod tanpa tanda “Wang sudah diterima” akan muncul di sini untuk disahkan."
          />
        ) : (
          <div className="grid gap-3">
            <p className="rounded-2xl bg-st-pending-bg px-4 py-3 text-sm text-st-pending">
              {pending.length} bayaran berjumlah <b>{formatMoney(pendingTotal)}</b> belum dikira sebagai diterima. Sahkan setelah wang
              masuk ke akaun atau tangan anda; batalkan jika tidak diterima.
            </p>
            <PaymentList payments={pending} showMember />
          </div>
        )
      ) : (
        <>
          <div className="grid gap-2.5">
            <SearchInput id="payment-search" value={query} onChange={setQuery} placeholder="Cari nama ahli atau rujukan…" className="sm:max-w-sm" />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Kaedah</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod | "all")}>
                  <SelectTrigger aria-label="Tapis kaedah" className="h-10 w-full rounded-xl bg-card sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua kaedah</SelectItem>
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
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={state} onValueChange={(value) => setState(value as PaymentState | "all")}>
                    <SelectTrigger aria-label="Tapis status" className="h-10 w-full rounded-xl bg-card sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua status</SelectItem>
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
                  Dari
                </Label>
                <input
                  id="pay-from"
                  type="date"
                  value={from}
                  max={to || view.today}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-10 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20 sm:w-40"
                />
              </div>
              <div className="grid min-w-0 gap-1">
                <Label htmlFor="pay-to" className="text-xs text-muted-foreground">
                  Hingga
                </Label>
                <input
                  id="pay-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={view.today}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-10 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20 sm:w-40"
                />
              </div>
              {filtersOn && (
                <Button variant="ghost" onClick={clearFilters} className="col-span-2 h-10 justify-self-start text-muted-foreground sm:col-span-1">
                  <FilterX /> Kosongkan penapis
                </Button>
              )}
            </div>
          </div>

          {data.payments.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Belum ada bayaran"
              description="Rekod bayaran pertama apabila ahli menyerahkan wang atau membuat pindahan."
              action={
                <Button asChild>
                  <Link href="/bayaran/baru/">Rekod bayaran pertama</Link>
                </Button>
              }
            />
          ) : tab === "dibatalkan" && reversed.length === 0 ? (
            <EmptyState icon={Undo2} title="Tiada bayaran dibatalkan" description="Bayaran yang dibatalkan kekal di sini bersama sebabnya untuk jejak audit." />
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
                    title="Tiada bayaran sepadan"
                    description="Cuba ubah carian, kaedah, status atau julat tarikh."
                    action={
                      <Button variant="outline" onClick={clearFilters}>
                        Kosongkan penapis
                      </Button>
                    }
                  />
                }
                mobileCard={(payment) => (
                  <MobileRow
                    title={view.membersById.get(payment.memberId)?.name ?? "Ahli"}
                    amount={<span className={cn(payment.state === "reversed" && "text-muted-foreground line-through")}>{formatMoney(payment.amount)}</span>}
                    meta={`${formatDay(payment.paidOn)} · ${methodLabels[payment.method]} · ${targetOf(payment)}`}
                    status={<LabelChip entry={paymentStateLabels[payment.state]} compact />}
                  />
                )}
              />
              {rows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    Menunjukkan {Math.min(limit, rows.length)} daripada {rows.length} transaksi
                  </span>
                  {rows.length > limit && (
                    <Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>
                      Tunjuk lagi
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={selectedPayment !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Butiran bayaran</DialogTitle>
            <DialogDescription>
              {selectedPayment ? `Dibayar ${formatDay(selectedPayment.paidOn)} oleh ${view.membersById.get(selectedPayment.memberId)?.name ?? "ahli"}.` : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <>
              <PaymentList payments={[selectedPayment]} showMember />
              {selectedPayment.note && <p className="text-xs text-muted-foreground">Catatan: {selectedPayment.note}</p>}
              <Button asChild variant="brand" className="w-full">
                <Link href={`/ahli/${selectedPayment.memberId}/`}>Lihat profil ahli</Link>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
