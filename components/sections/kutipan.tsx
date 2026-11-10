"use client";

import { t } from "@/lib/i18n";
import { useT } from "@/lib/i18n/react";
import { voluntarySummary } from "@/lib/money/ledger";
import { useSnapshot } from "@/components/data-provider";
import {
  EmptyState,
  FilterPills,
  LabelChip,
  Money,
  PageHeader,
  PageShell,
  ProgressBar,
  SearchInput,
  StatCard,
  StatusChip,
  Toolbar,
} from "@/components/shared";
import { RestoreCollectionDialog } from "@/components/restore-collection-dialog";
import { CollectionIconButton } from "@/components/emoji-picker";
import { Button } from "@/components/ui/button";
import { formatDay, formatMoney, formatMonth, formatPercent } from "@/lib/format";
import { totalsOf } from "@/lib/money/ledger";
import { collectionStatusLabels, collectionTypeLabels } from "@/lib/labels";
import type { Collection, CollectionStatus, Payment } from "@/lib/types";
import { sortCollections, type View } from "@/lib/view";
import { cn } from "@/lib/utils";
import {
  Hourglass,
  Plus,
  SearchX,
  Users,
  WalletCards,
  ArchiveRestore,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useRef, useState } from "react";

// Kutipan KGK: every collection as a card, grouped by status. Figures come from
// view.collectionTotals (charges and confirmed allocations); pending money is shown
// beside received, never inside it, and voluntary collections never show debt.

/** "RM25.00 seorang", "RM10.00 sebulan" or "Ikut kemampuan". */
export function amountLabel(collection: Collection) {
  if (collection.type === "voluntary" || collection.defaultAmount === null) return t("collections.amount.anyAmount");
  return t(collection.type === "monthly" ? "collections.amount.perMonth" : "collections.amount.perPerson", { amount: formatMoney(collection.defaultAmount) });
}

/** When the money is due, in words. */
export function scheduleLabel(collection: Collection) {
  if (collection.type === "monthly" && collection.startMonth && collection.endMonth) {
    const range = `${formatMonth(collection.startMonth)} – ${formatMonth(collection.endMonth)}`;
    return collection.dueDay ? t("collections.schedule.monthlyWithDay", { range, day: collection.dueDay }) : range;
  }
  if (collection.type === "one_off") return collection.dueDate ? t("collections.schedule.dueOn", { date: formatDay(collection.dueDate) }) : t("collections.schedule.noDeadline");
  return t("collections.schedule.noDeadline");
}


type StatusFilter = "all" | CollectionStatus;

const groupOrder: CollectionStatus[] = ["active", "draft", "completed", "archived"];
const groupTitle = (status: CollectionStatus) => t(`labels.collectionStatus.${status}`);

export function KutipanList() {
  const t = useT();
  const { data, view } = useSnapshot();
  const [query, setQuery] = useState("");
  // The heavy filter/render follows the keystroke at lower priority, so typing never waits on it.
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [restoring, setRestoring] = useState<Collection | null>(null);
  const tabs = useRef<HTMLDivElement>(null);

  const collections = useMemo(() => sortCollections(data.collections), [data.collections]);
  const counts = useMemo(() => {
    const result: Record<CollectionStatus, number> = { active: 0, draft: 0, completed: 0, archived: 0 };
    for (const collection of collections) result[collection.status] += 1;
    return result;
  }, [collections]);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return collections
      .filter((collection) => status === "all" || collection.status === status)
      .filter(
        (collection) =>
          !q ||
          collection.name.toLowerCase().includes(q) ||
          (collection.description ?? "").toLowerCase().includes(q) ||
          collectionTypeLabels[collection.type].toLowerCase().includes(q),
      );
  }, [collections, deferredQuery, status]);

  // Summary across active collections only: drafts collect nothing yet and finished ones are history.
  const summary = useMemo(() => {
    let received = 0;
    let dueNow = 0;
    let pending = 0;
    let overdue = 0;
    for (const collection of collections.filter((row) => row.status === "active")) {
      const totals = view.collectionTotals(collection.id);
      if (collection.type === "voluntary") {
        const voluntary = voluntarySummary(data.payments, collection.id);
        received += voluntary.received;
        pending += voluntary.pending;
      } else {
        received += totals.received;
        dueNow += totals.dueNow;
        pending += totals.pending;
        overdue += totals.counts.overdue;
      }
    }
    return { received, dueNow, pending, overdue };
  }, [collections, data.payments, view]);

  const addButton = (
    <Button asChild size="lg">
      <Link href="/kutipan/baru/">
        <Plus /> {t("collections.header.add")}
      </Link>
    </Button>
  );

  return (
    <PageShell>
      <PageHeader
        title={t("nav.collections")}
        description={t("collections.header.description")}
        actions={addButton}
      />

      {data.collections.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title={t("collections.empty.title")}
          description={t("collections.empty.description")}
          action={addButton}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("collections.stats.active")} value={counts.active} icon={WalletCards} hint={t("collections.stats.activeHint", { draft: counts.draft, completed: counts.completed })} />
            <StatCard label={t("collections.stats.received")} value={formatMoney(summary.received)} icon={CircleCheck} tone="paid" hint={t("collections.stats.receivedHint")} />
            <StatCard
              label={t("collections.stats.balance")}
              value={formatMoney(summary.dueNow)}
              icon={CircleAlert}
              tone="unpaid"
              hint={summary.overdue > 0 ? t("collections.stats.overdueHint", { count: summary.overdue }) : t("collections.stats.noOverdue")}
            />
            <StatCard
              label={t("collections.stats.pending")}
              value={formatMoney(summary.pending)}
              icon={Hourglass}
              tone="pending"
              hint={t("collections.stats.pendingHint")}
            />
          </div>

          <Toolbar
            search={<SearchInput id="kutipan-search" value={query} onChange={setQuery} placeholder={t("collections.filter.searchPlaceholder")} />}
            tabs={
              <div ref={tabs}>
                <FilterPills
                  label={t("collections.filter.label")}
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "all", label: t("collections.filter.all"), count: collections.length },
                    { value: "active", label: groupTitle("active"), count: counts.active },
                    { value: "draft", label: groupTitle("draft"), count: counts.draft },
                    { value: "completed", label: groupTitle("completed"), count: counts.completed },
                    { value: "archived", label: groupTitle("archived"), count: counts.archived },
                  ]}
                />
              </div>
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={t("collections.noMatch.title")}
              description={query ? t("collections.noMatch.byQuery", { query: query.trim() }) : t("collections.noMatch.byStatus", { status: groupTitle(status as CollectionStatus) })}
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                >
                  {t("collections.noMatch.clear")}
                </Button>
              }
            />
          ) : (
            groupOrder.map((group) => {
              const rows = visible.filter((collection) => collection.status === group);
              if (!rows.length) return null;
              return (
                <section key={group} aria-labelledby={`kutipan-${group}`} className="grid gap-3">
                  <h2 id={`kutipan-${group}`} className="flex items-center gap-2 text-h2 text-muted-foreground">
                    {groupTitle(group)}
                    <span className="rounded-full bg-primary-light px-2 py-0.5 text-caption text-primary-strong tabular-nums">{rows.length}</span>
                  </h2>
                  <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {rows.map((collection) => (
                      <li key={collection.id} className="min-w-0">
                        <CollectionCard collection={collection} view={view} payments={data.payments} onRestore={() => setRestoring(collection)} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </>
      )}
      {/* A restored card leaves the Diarkib view, taking its button with it: focus goes to the status tabs. */}
      <RestoreCollectionDialog
        collection={restoring}
        onClose={() => setRestoring(null)}
        fallbackFocus={() => tabs.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')}
      />
    </PageShell>
  );
}

function CollectionCard({ collection, view, payments, onRestore }: { collection: Collection; view: View; payments: Payment[]; onRestore: () => void }) {
  const t = useT();
  const totals = view.collectionTotals(collection.id);
  const voluntary = collection.type === "voluntary";
  const contributions = voluntary ? voluntarySummary(payments, collection.id) : null;
  const pending = contributions ? contributions.pending : totals.pending;
  // Future months are "Akan Datang", not "Belum Bayar": count only months already due.
  const counts =
    collection.type === "monthly"
      ? totalsOf((view.chargesByCollection.get(collection.id) ?? []).map((charge) => view.ledgers.get(charge.id)!).filter((ledger) => !ledger.future)).counts
      : totals.counts;

  return (
    // The title link is stretched over the card (after:inset-0), so the whole card still opens the
    // collection and the Pulihkan button can sit inside without nesting a button in a link.
    <div
      className={cn(
        "group relative flex h-full min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_color-mix(in_srgb,var(--primary)_4%,transparent)] transition-colors hover:border-primary/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background md:p-5",
        collection.status === "archived" && "bg-card/70",
      )}
    >
      <div className="flex items-start gap-3">
        {/* z-10 lifts the icon button above the title link stretched over the card. */}
        <CollectionIconButton collection={collection} size="lg" className="relative z-10 size-11 rounded-xl bg-primary-light text-primary-strong" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <h3 className="min-w-0 text-h3 leading-snug font-semibold break-words group-hover:text-primary-strong">
              <Link href={`/kutipan/${collection.id}/`} className="outline-none after:absolute after:inset-0 after:rounded-2xl">
                {collection.name}
              </Link>
            </h3>
            <LabelChip entry={collectionStatusLabels[collection.status]} compact />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {collectionTypeLabels[collection.type]} · {amountLabel(collection)}
          </p>
        </div>
      </div>

      {voluntary ? (
        <div className="rounded-xl bg-primary-tint px-3 py-2.5">
          <p className="text-xs text-muted-foreground">{t("collections.card.totalCollected")}</p>
          <p className="text-h2 font-bold tracking-[-.01em] tabular-nums">
            <Money sen={contributions!.received} />
          </p>
          <p className="text-xs text-muted-foreground">
            {t("collections.card.contributors", { contributors: contributions!.contributors, invited: totals.participants })}
          </p>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="min-w-0">
              <Money sen={totals.received} className="font-semibold" />
              <span className="text-muted-foreground"> / {formatMoney(totals.expected)}</span>
            </span>
            <span className="text-xs font-medium text-primary-strong tabular-nums">{formatPercent(totals.received, totals.expected)}</span>
          </div>
          <ProgressBar value={totals.received} max={totals.expected} label={t("collections.card.progressLabel", { name: collection.name })} />
          {totals.dueNow > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("collections.card.balanceNow")} <span className="font-medium text-st-unpaid tabular-nums">{formatMoney(totals.dueNow)}</span>
              {totals.upcoming > 0 && <> · {t("collections.card.upcoming", { amount: formatMoney(totals.upcoming) })}</>}
            </p>
          )}
        </div>
      )}

      <div className="mt-auto grid gap-2.5">
        {!voluntary && (
          <div className="flex flex-wrap gap-1">
            <StatusChip label={t("collections.card.chipPaid", { count: counts.paid })} tone="paid" compact />
            {counts.partial > 0 && <StatusChip label={t("collections.card.chipPartial", { count: counts.partial })} tone="partial" compact />}
            <StatusChip label={t("collections.card.chipUnpaid", { count: counts.unpaid })} tone="unpaid" compact />
            {counts.overdue > 0 && <StatusChip label={t("collections.card.chipOverdue", { count: counts.overdue })} tone="overdue" compact />}
            {counts.exempt > 0 && <StatusChip label={t("collections.card.chipExempt", { count: counts.exempt })} tone="exempt" compact />}
          </div>
        )}
        {collection.type === "monthly" && <p className="-mt-1 text-caption text-muted-foreground">{t("collections.card.monthlyNote")}</p>}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden /> {t("collections.card.participants", { count: totals.participants })}
          </span>
          <span className="min-w-0">{scheduleLabel(collection)}</span>
        </div>
        {pending > 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-st-pending">
            <Hourglass className="size-3.5" aria-hidden /> {t("collections.card.pendingReview", { amount: formatMoney(pending) })}
          </p>
        )}
        {collection.status === "archived" && (
          <Button variant="outline" size="sm" className="relative z-10 justify-self-start" onClick={onRestore}>
            <ArchiveRestore /> {t("collections.card.restore")}
          </Button>
        )}
      </div>
    </div>
  );
}
