"use client";

import { useSnapshot } from "@/components/data-provider";
import { CollectionIcon } from "@/components/collection-icon";
import { Blossom, Floral } from "@/components/floral";
import { CardLink, LabelChip, PageShell, ProgressBar, SectionCard, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDayShort, formatMoney, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import { methodLabels, paymentStateLabels } from "@/lib/labels";
import { useT } from "@/lib/i18n/react";
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
  const t = useT();
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
            {t("dashboard.hero.welcome", { name: firstName })} <Blossom />
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{t("dashboard.hero.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
          <span className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[13px] font-medium whitespace-nowrap">
            <CalendarDays className="size-4 text-muted-foreground" /> {t("dashboard.hero.session", { session: data.club.session })}
          </span>
          <Button variant="outline" asChild>
            <Link href="/ahli/">
              <Search /> {t("dashboard.hero.findMember")}
            </Link>
          </Button>
          <Button variant="brand" asChild>
            <Link href="/kutipan/baru/">
              <Plus /> {t("dashboard.hero.addCollection")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/bayaran/baru/">
              <Plus /> {t("dashboard.hero.recordPayment")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Database}
          label={t("dashboard.stats.totalLabel")}
          value={formatMoney(totals.expected)}
          hint={totals.upcoming > 0 ? t("dashboard.stats.totalUpcoming", { amount: formatMoney(totals.upcoming) }) : t("dashboard.stats.totalExpected")}
          href="/kutipan/"
        />
        <StatCard
          icon={BadgeCheck}
          tone="paid"
          label={t("dashboard.stats.paidLabel")}
          value={formatMoney(totals.received)}
          hint={
            <>
              <b className="text-st-paid">{formatPercent(totals.received, totals.expected)}</b> {t("dashboard.stats.paidOfTotal")}
            </>
          }
          className="bg-st-paid-bg/35"
        />
        <StatCard
          icon={Clock3}
          tone="partial"
          label={t("dashboard.stats.unpaidLabel")}
          value={formatMoney(totals.dueNow)}
          hint={t("dashboard.stats.unpaidHint", { percent: formatPercent(totals.dueNow, totals.expected), count: memberStatus.owing })}
          href="/peringatan/"
          className="bg-st-partial-bg/35"
        />
        <StatCard
          icon={UsersRound}
          tone="exempt"
          label={t("dashboard.stats.membersLabel")}
          value={formatNumber(activeMembers.length)}
          hint={t("dashboard.stats.membersInactive", { count: data.members.length - activeMembers.length })}
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
        <SectionCard title={t("dashboard.recent.title")} icon={ReceiptText} action={<CardLink href="/bayaran/">{t("dashboard.recent.viewAll")}</CardLink>} contentClassName="px-0 md:px-0">
          <RecentPayments payments={recent} />
        </SectionCard>
        <SectionCard title={t("dashboard.memberStatus.title")} icon={UsersRound} action={<CardLink href="/matriks/">{t("dashboard.memberStatus.viewAll")}</CardLink>}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="rounded-l-lg bg-primary-tint px-3 py-2 font-semibold">{t("dashboard.memberStatus.status")}</th>
                <th className="bg-primary-tint px-3 py-2 text-right font-semibold">{t("dashboard.memberStatus.count")}</th>
                <th className="rounded-r-lg bg-primary-tint px-3 py-2 text-right font-semibold">{t("dashboard.memberStatus.percent")}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [t("dashboard.memberStatus.settled"), memberStatus.settled, "bg-success"],
                  [t("dashboard.memberStatus.owing"), memberStatus.owing, "bg-warning"],
                  [t("dashboard.memberStatus.none"), memberStatus.none, "bg-subtle"],
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
                <td className="rounded-l-lg bg-primary-tint px-3 py-2.5">{t("dashboard.memberStatus.total")}</td>
                <td className="bg-primary-tint px-3 py-2.5 text-right tabular-nums">{activeMembers.length}</td>
                <td className="rounded-r-lg bg-primary-tint px-3 py-2.5 text-right">100%</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted-foreground">{t("dashboard.memberStatus.note")}</p>
        </SectionCard>
      </div>
    </PageShell>
  );
}

function CollectionsCard({ collections }: { collections: Collection[] }) {
  const t = useT();
  const { view } = useSnapshot();
  return (
    <SectionCard title={t("dashboard.collections.title")} action={<CardLink href="/kutipan/">{t("dashboard.collections.manage")}</CardLink>}>
      {collections.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.collections.empty")}</p>
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
                        <ProgressBar value={totals.received} max={totals.expected} label={t("dashboard.collections.progressLabel", { name: collection.name })} className="flex-1" />
                      )}
                      <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                        {voluntary ? t("dashboard.collections.voluntary") : `${view.collectionProgress(collection.id).settled}/${view.collectionProgress(collection.id).total}`}
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
  const t = useT();
  const items: { icon: LucideIcon; title: string; sub: string; href: string; cta: string; primary?: boolean }[] = [
    {
      icon: HandCoins,
      title: t(owing === 1 ? "dashboard.actions.owingOne" : "dashboard.actions.owingMany", { count: owing }),
      sub: t("dashboard.actions.owingSub"),
      href: "/peringatan/",
      cta: t("dashboard.actions.owingCta"),
      primary: true,
    },
    {
      icon: BadgeCheck,
      title: t(pending.length === 1 ? "dashboard.actions.pendingOne" : "dashboard.actions.pendingMany", { count: pending.length }),
      sub: pending.length ? t("dashboard.actions.pendingSub") : t("dashboard.actions.pendingNone"),
      href: "/bayaran/?tab=semakan",
      cta: t("dashboard.actions.pendingCta"),
    },
    {
      icon: MessageCircle,
      title: t("dashboard.actions.whatsappTitle"),
      sub: t("dashboard.actions.whatsappSub"),
      href: "/peringatan/",
      cta: t("dashboard.actions.whatsappCta"),
    },
  ];
  return (
    <SectionCard title={t("dashboard.actions.title")} icon={BellRing} action={<CardLink href="/peringatan/">{t("dashboard.actions.viewAll")}</CardLink>}>
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
  const t = useT();
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
    <SectionCard title={t("dashboard.monthly.title")} icon={ChartColumn} className="lg:col-span-2 xl:col-span-1">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-1.5 py-1">
        <Button variant="ghost" size="icon-sm" aria-label={t("dashboard.monthly.previous")} onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </Button>
        <span className="text-[13px] font-semibold">{formatMonth(month)}</span>
        <Button variant="ghost" size="icon-sm" aria-label={t("dashboard.monthly.next")} onClick={() => setMonth(addMonths(month, 1))} disabled={month >= thisMonth}>
          <ChevronRight />
        </Button>
      </div>
      <p className="mt-4 text-center text-[24px] font-bold tracking-[-.02em] tabular-nums">{formatMoney(value)}</p>
      <p className="text-center text-[11.5px] text-muted-foreground">
        {t("dashboard.monthly.received")} · {dueThisMonth > 0 ? t("dashboard.monthly.dueThisMonth", { amount: formatMoney(dueThisMonth) }) : t("dashboard.monthly.noDueThisMonth")}
      </p>
      <div className="mt-4 flex h-28 items-end justify-around gap-3 px-2" role="img" aria-label={t("dashboard.monthly.chartLabel", { summary: months.map((m, i) => `${formatMonth(m, false)} ${formatMoney(values[i])}`).join(", ") })}>
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
  const t = useT();
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
  if (!payments.length) return <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t("dashboard.recent.empty")}</p>;
  return (
    <>
      <div className="@container/ledger hidden overflow-x-auto px-4 md:block md:px-5">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="rounded-l-lg bg-primary-tint px-3 py-2 font-semibold">{t("dashboard.recent.date")}</th>
              <th className="bg-primary-tint px-3 py-2 font-semibold">{t("dashboard.recent.member")}</th>
              <th className="bg-primary-tint px-3 py-2 font-semibold">{t("dashboard.recent.collection")}</th>
              <th className="bg-primary-tint px-3 py-2 text-right font-semibold">{t("dashboard.recent.amount")}</th>
              <th className="hidden bg-primary-tint px-3 py-2 font-semibold @2xl/ledger:table-cell">{t("dashboard.recent.method")}</th>
              <th className="rounded-r-lg bg-primary-tint px-3 py-2 font-semibold">{t("dashboard.recent.status")}</th>
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
