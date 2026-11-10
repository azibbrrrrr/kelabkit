"use client";

import { useSnapshot } from "@/components/data-provider";
import { CollectionIcon } from "@/components/collection-icon";
import { Blossom, Floral } from "@/components/floral";
import { CardLink, LabelChip, PageShell, ProgressBar, SectionCard, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDayShort, formatMoney, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import { methodLabels, paymentStateLabels } from "@/lib/labels";
import { totalsOf } from "@/lib/money/ledger";
import { addMonths, monthOf } from "@/lib/money/months";
import type { Collection, Payment } from "@/lib/types";
import { allocationsOf, sortCollections } from "@/lib/view";
import { cn } from "@/lib/utils";
import {
  BadgeCheck,
  BellRing,
  CalendarDays,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  HandCoins,
  MessageCircle,
  Plus,
  ReceiptText,
  Search,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

// Low-priority overview (spec Module I), laid out like the Concept 04 reference. Every
// figure comes from the same ledger functions as the matrix and reports. Where the
// reference showed growth comparisons or scheduled sending, this shows a meaningful
// ratio or a link to the manual workflow instead (Phase 0 decision Q1).

export function Dashboard() {
  const { data, view } = useSnapshot();
  const firstName = data.club.treasurerName.split(" ").slice(0, 2).join(" ");

  const scope = useMemo(() => data.collections.filter((collection) => collection.status === "active" || collection.status === "completed"), [data.collections]);
  const totals = useMemo(() => {
    const ledgers = scope.flatMap((collection) => (view.chargesByCollection.get(collection.id) ?? []).map((charge) => view.ledgers.get(charge.id)!));
    return totalsOf(ledgers);
  }, [scope, view]);
  const activeMembers = data.members.filter((member) => member.active);

  const memberStatus = useMemo(() => {
    let settled = 0;
    let owing = 0;
    let none = 0;
    for (const member of activeMembers) {
      const ledgers = view.memberLedgers(member.id).filter((ledger) => scope.some((c) => c.id === ledger.charge.collectionId) && !ledger.future);
      const due = ledgers.reduce((t, l) => t + l.remaining, 0);
      if (!ledgers.some((l) => !l.charge.exempt)) none += 1;
      else if (due > 0) owing += 1;
      else settled += 1;
    }
    return { settled, owing, none };
  }, [activeMembers, scope, view]);

  const pending = data.payments.filter((payment) => payment.state === "pending");
  const recent = [...data.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <PageShell className="relative">
      <Floral asset="corner-bottom-left" className="-bottom-6 -left-10 z-0 hidden w-[240px] opacity-80 xl:block" />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 xl:max-w-[520px]">
          <h1 className="text-[24px] leading-tight font-bold tracking-[-.02em] md:text-[28px]">
            Selamat datang, {firstName}! <Blossom />
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">Papan pemuka kutipan KGK — pantau bayaran, ahli dan peringatan dengan mudah.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
          <span className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[13px] font-medium whitespace-nowrap">
            <CalendarDays className="size-4 text-muted-foreground" /> Sesi {data.club.session}
          </span>
          <Button variant="outline" asChild>
            <Link href="/ahli/">
              <Search /> Cari Ahli
            </Link>
          </Button>
          <Button variant="brand" asChild>
            <Link href="/kutipan/baru/">
              <Plus /> Tambah Kutipan
            </Link>
          </Button>
          <Button asChild>
            <Link href="/bayaran/baru/">
              <Plus /> Rekod Bayaran
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Database}
          label="Jumlah Kutipan"
          value={formatMoney(totals.expected)}
          hint={totals.upcoming > 0 ? <>termasuk {formatMoney(totals.upcoming)} bulan akan datang</> : "dijangka untuk kutipan sesi ini"}
          href="/kutipan/"
        />
        <StatCard
          icon={BadgeCheck}
          tone="paid"
          label="Telah Dibayar"
          value={formatMoney(totals.received)}
          hint={
            <>
              <b className="text-st-paid">{formatPercent(totals.received, totals.expected)}</b> daripada jumlah
            </>
          }
          className="bg-st-paid-bg/35"
        />
        <StatCard
          icon={Clock3}
          tone="partial"
          label="Belum Dibayar"
          value={formatMoney(totals.dueNow)}
          hint={
            <>
              {formatPercent(totals.dueNow, totals.expected)} ({memberStatus.owing} ahli)
            </>
          }
          href="/peringatan/"
          className="bg-st-partial-bg/35"
        />
        <StatCard
          icon={UsersRound}
          tone="exempt"
          label="Jumlah Ahli"
          value={formatNumber(activeMembers.length)}
          hint={<>{data.members.length - activeMembers.length} tidak aktif · rekod dikekalkan</>}
          href="/ahli/"
          className="bg-st-exempt-bg/35"
        />
      </div>

      <div className="relative z-10 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,.8fr)]">
        <CollectionsCard collections={sortCollections(data.collections).filter((c) => c.status === "active")} />
        <ActionsCard owing={memberStatus.owing} pending={pending} />
        <MonthlyCard payments={data.payments} />
      </div>

      <div className="relative z-10 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <SectionCard title="Lejar Pembayaran Terkini" icon={ReceiptText} action={<CardLink href="/bayaran/">Lihat Semua</CardLink>} contentClassName="px-0 md:px-0">
          <RecentPayments payments={recent} />
        </SectionCard>
        <SectionCard title="Status Ahli" icon={UsersRound} action={<CardLink href="/matriks/">Lihat Semua</CardLink>}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="rounded-l-lg bg-primary-tint px-3 py-2 font-semibold">Status</th>
                <th className="bg-primary-tint px-3 py-2 text-right font-semibold">Bil. Ahli</th>
                <th className="rounded-r-lg bg-primary-tint px-3 py-2 text-right font-semibold">Peratus</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Tiada baki", memberStatus.settled, "bg-success"],
                  ["Ada baki", memberStatus.owing, "bg-warning"],
                  ["Tiada caj / dikecualikan", memberStatus.none, "bg-subtle"],
                ] as const
              ).map(([label, count, dot]) => (
                <tr key={label} className="border-b border-border/60">
                  <td className="px-3 py-2.5">
                    <span className={cn("mr-2 inline-block size-2 rounded-full", dot)} />
                    {label}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(count, activeMembers.length)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="rounded-l-lg bg-primary-tint px-3 py-2.5">Jumlah</td>
                <td className="bg-primary-tint px-3 py-2.5 text-right tabular-nums">{activeMembers.length}</td>
                <td className="rounded-r-lg bg-primary-tint px-3 py-2.5 text-right">100%</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted-foreground">Ahli aktif, caj yang sudah sampai tempoh sahaja.</p>
        </SectionCard>
      </div>
    </PageShell>
  );
}

function CollectionsCard({ collections }: { collections: Collection[] }) {
  const { view } = useSnapshot();
  return (
    <SectionCard title="Kategori Kutipan" action={<CardLink href="/kutipan/">Urus Kutipan</CardLink>}>
      {collections.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Belum ada kutipan aktif.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {collections.slice(0, 5).map((collection) => {
            const totals = view.collectionTotals(collection.id);
            const voluntary = collection.type === "voluntary";
            return (
              <li key={collection.id}>
                <Link href={`/kutipan/${collection.id}/`} className="group flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-light text-primary-strong">
                    <CollectionIcon collection={collection} size="md" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold group-hover:text-primary-strong">{collection.name}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums">{formatMoney(voluntary ? totals.voluntary : totals.received)}</span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-3">
                      {voluntary ? (
                        <span className="h-2 flex-1 rounded-full bg-[repeating-linear-gradient(90deg,var(--primary-light)_0_6px,transparent_6px_10px)]" aria-hidden />
                      ) : (
                        <ProgressBar value={totals.received} max={totals.expected} label={`${collection.name} diterima`} className="flex-1" />
                      )}
                      <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                        {voluntary ? "sukarela" : `${view.collectionProgress(collection.id).settled}/${view.collectionProgress(collection.id).total}`}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function ActionsCard({ owing, pending }: { owing: number; pending: Payment[] }) {
  const items: { icon: LucideIcon; title: string; sub: string; href: string; cta: string; primary?: boolean }[] = [
    {
      icon: HandCoins,
      title: `${owing} ahli belum menjelaskan bayaran`,
      sub: "Sediakan mesej peringatan sekarang?",
      href: "/peringatan/",
      cta: "Sediakan",
      primary: true,
    },
    {
      icon: BadgeCheck,
      title: `${pending.length} bayaran menunggu semakan`,
      sub: pending.length ? "Sahkan setelah wang diterima" : "Tiada yang perlu disemak",
      href: "/bayaran/?tab=semakan",
      cta: "Semak",
    },
    {
      icon: MessageCircle,
      title: "Hantar peringatan melalui WhatsApp",
      sub: "Salin mesej atau buka WhatsApp ahli",
      href: "/peringatan/",
      cta: "Buka",
    },
  ];
  return (
    <SectionCard title="Tindakan Peringatan" icon={BellRing} action={<CardLink href="/peringatan/">Lihat Semua</CardLink>}>
      <ul className="grid grid-cols-1 gap-2.5">
        {items.map((item) => (
          <li key={item.title} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary-strong">
              <item.icon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-snug font-semibold">{item.title}</span>
              <span className="block text-[11.5px] text-muted-foreground">{item.sub}</span>
            </span>
            <Button size="sm" variant={item.primary ? "default" : "brand"} asChild>
              <Link href={item.href}>{item.cta}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Confirmed money received per calendar month (by payment date), last four months. */
function MonthlyCard({ payments }: { payments: Payment[] }) {
  const { view, data } = useSnapshot();
  const thisMonth = monthOf(view.today);
  const [month, setMonth] = useState(thisMonth);
  const received = (m: string) => payments.filter((p) => p.state === "confirmed" && monthOf(p.paidOn) === m).reduce((t, p) => t + p.amount, 0);
  const months = [-3, -2, -1, 0].map((offset) => addMonths(month, offset));
  const values = months.map(received);
  const max = Math.max(...values, 1);
  const dueThisMonth = data.charges
    .filter((charge) => charge.dueDate && monthOf(charge.dueDate) === month)
    .reduce((t, charge) => t + (view.ledgers.get(charge.id)?.required ?? 0), 0);
  const value = values[3];

  return (
    <SectionCard title="Ringkasan Bulanan" icon={ChartColumn} className="lg:col-span-2 xl:col-span-1">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-1.5 py-1">
        <Button variant="ghost" size="icon-sm" aria-label="Bulan sebelum" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </Button>
        <span className="text-[13px] font-semibold">{formatMonth(month)}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Bulan seterusnya" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= thisMonth}>
          <ChevronRight />
        </Button>
      </div>
      <p className="mt-4 text-center text-[24px] font-bold tracking-[-.02em] tabular-nums">{formatMoney(value)}</p>
      <p className="text-center text-[11.5px] text-muted-foreground">
        diterima · {dueThisMonth > 0 ? <>caj bertarikh akhir bulan ini {formatMoney(dueThisMonth)}</> : "tiada caj bertarikh akhir bulan ini"}
      </p>
      <div className="mt-4 flex h-28 items-end justify-around gap-3 px-2" role="img" aria-label={`Kutipan diterima ${months.map((m, i) => `${formatMonth(m, false)} ${formatMoney(values[i])}`).join(", ")}`}>
        {months.map((m, i) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={cn("w-full max-w-9 rounded-t-lg", i === 3 ? "brand-gradient" : "bg-primary-light")}
              style={{ height: `${Math.max(6, Math.round((values[i] / max) * 92))}px` }}
              title={formatMoney(values[i])}
            />
            <span className={cn("text-[11px] text-muted-foreground", i === 3 && "font-semibold text-foreground")}>{formatMonth(m, false)}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function RecentPayments({ payments }: { payments: Payment[] }) {
  const { data, view } = useSnapshot();
  const target = (payment: Payment) => {
    if (payment.collectionId) return view.collectionsById.get(payment.collectionId)?.name ?? "—";
    const names = new Set(
      allocationsOf(data, payment.id).map((allocation) => {
        const charge = data.charges.find((row) => row.id === allocation.chargeId);
        return charge ? view.collectionsById.get(charge.collectionId)?.name ?? "—" : "—";
      }),
    );
    return [...names].join(", ");
  };
  if (!payments.length) return <p className="px-5 py-6 text-center text-sm text-muted-foreground">Belum ada bayaran direkod.</p>;
  return (
    <>
      <div className="@container/ledger hidden overflow-x-auto px-4 md:block md:px-5">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="rounded-l-lg bg-primary-tint px-3 py-2 font-semibold">Tarikh</th>
              <th className="bg-primary-tint px-3 py-2 font-semibold">Ahli</th>
              <th className="bg-primary-tint px-3 py-2 font-semibold">Kutipan</th>
              <th className="bg-primary-tint px-3 py-2 text-right font-semibold">Jumlah</th>
              <th className="hidden bg-primary-tint px-3 py-2 font-semibold @2xl/ledger:table-cell">Kaedah</th>
              <th className="rounded-r-lg bg-primary-tint px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2.5 whitespace-nowrap">{formatDayShort(payment.paidOn)}</td>
                <td className="max-w-40 truncate px-3 py-2.5">{view.membersById.get(payment.memberId)?.name}</td>
                <td className="max-w-44 truncate px-3 py-2.5 text-muted-foreground">{target(payment)}</td>
                <td className={cn("px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums", payment.state === "reversed" && "text-muted-foreground line-through")}>
                  {formatMoney(payment.amount)}
                </td>
                <td className="hidden px-3 py-2.5 whitespace-nowrap @2xl/ledger:table-cell">{methodLabels[payment.method]}</td>
                <td className="px-3 py-2.5">
                  <LabelChip entry={paymentStateLabels[payment.state]} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-2 px-4 md:hidden">
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{view.membersById.get(payment.memberId)?.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatDayShort(payment.paidOn)} · {target(payment)}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[13px] font-semibold tabular-nums">{formatMoney(payment.amount)}</span>
              <LabelChip entry={paymentStateLabels[payment.state]} compact />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
