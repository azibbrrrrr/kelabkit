"use client";

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
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDay, formatMoney, formatMonth, formatPercent } from "@/lib/format";
import { totalsOf } from "@/lib/money/ledger";
import { collectionStatusLabels, collectionTypeLabels } from "@/lib/labels";
import type { Collection, CollectionStatus, CollectionType, Payment } from "@/lib/types";
import { sortCollections, type View } from "@/lib/view";
import { cn } from "@/lib/utils";
import {
  CalendarRange,
  HandHeart,
  Hourglass,
  Plus,
  ReceiptText,
  SearchX,
  Users,
  WalletCards,
  CircleCheck,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

// Kutipan KGK: every collection as a card, grouped by status. Figures come from
// view.collectionTotals (charges and confirmed allocations); pending money is shown
// beside received, never inside it, and voluntary collections never show debt.

export const collectionTypeIcons: Record<CollectionType, LucideIcon> = {
  one_off: ReceiptText,
  monthly: CalendarRange,
  voluntary: HandHeart,
};

/** "RM25.00 seorang", "RM10.00 sebulan" or "Ikut kemampuan". */
export function amountLabel(collection: Collection) {
  if (collection.type === "voluntary" || collection.defaultAmount === null) return "Ikut kemampuan";
  return `${formatMoney(collection.defaultAmount)} ${collection.type === "monthly" ? "sebulan" : "seorang"}`;
}

/** When the money is due, in words. */
export function scheduleLabel(collection: Collection) {
  if (collection.type === "monthly" && collection.startMonth && collection.endMonth) {
    const range = `${formatMonth(collection.startMonth)} – ${formatMonth(collection.endMonth)}`;
    return collection.dueDay ? `${range} · sebelum ${collection.dueDay}hb setiap bulan` : range;
  }
  if (collection.type === "one_off") return collection.dueDate ? `Tarikh akhir ${formatDay(collection.dueDate)}` : "Tiada tarikh akhir";
  return "Tiada tarikh akhir";
}


type StatusFilter = "all" | CollectionStatus;

const groupOrder: CollectionStatus[] = ["active", "draft", "completed", "archived"];
const groupTitles: Record<CollectionStatus, string> = {
  active: "Aktif",
  draft: "Draf",
  completed: "Selesai",
  archived: "Diarkib",
};

export function KutipanList() {
  const { data, view } = useSnapshot();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const collections = useMemo(() => sortCollections(data.collections), [data.collections]);
  const counts = useMemo(() => {
    const result: Record<CollectionStatus, number> = { active: 0, draft: 0, completed: 0, archived: 0 };
    for (const collection of collections) result[collection.status] += 1;
    return result;
  }, [collections]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return collections
      .filter((collection) => status === "all" || collection.status === status)
      .filter(
        (collection) =>
          !q ||
          collection.name.toLowerCase().includes(q) ||
          (collection.description ?? "").toLowerCase().includes(q) ||
          collectionTypeLabels[collection.type].toLowerCase().includes(q),
      );
  }, [collections, query, status]);

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
        <Plus /> Tambah Kutipan
      </Link>
    </Button>
  );

  return (
    <PageShell>
      <PageHeader
        title="Kutipan KGK"
        description="Semua kutipan kelab: yuran bulanan, bayaran sekali dan sumbangan sukarela. Klik kad untuk menjejak bayaran setiap ahli."
        actions={addButton}
      />

      {data.collections.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title="Belum ada kutipan"
          description="Cipta kutipan pertama, contohnya Yuran KGK bulanan atau Jamuan Akhir Tahun. Anda pilih ahli yang terlibat."
          action={addButton}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Kutipan aktif" value={counts.active} icon={WalletCards} hint={`${counts.draft} draf · ${counts.completed} selesai`} />
            <StatCard label="Diterima" value={formatMoney(summary.received)} icon={CircleCheck} tone="paid" hint="Wang disahkan, kutipan aktif" />
            <StatCard
              label="Baki semasa"
              value={formatMoney(summary.dueNow)}
              icon={CircleAlert}
              tone="unpaid"
              hint={summary.overdue > 0 ? `${summary.overdue} caj lewat` : "Tiada caj lewat"}
            />
            <StatCard
              label="Menunggu semakan"
              value={formatMoney(summary.pending)}
              icon={Hourglass}
              tone="pending"
              hint="Belum dikira sebagai diterima"
            />
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <SearchInput id="kutipan-search" value={query} onChange={setQuery} placeholder="Cari kutipan…" />
            <FilterPills
              label="Tapis ikut status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "Semua", count: collections.length },
                { value: "active", label: "Aktif", count: counts.active },
                { value: "draft", label: "Draf", count: counts.draft },
                { value: "completed", label: "Selesai", count: counts.completed },
                { value: "archived", label: "Diarkib", count: counts.archived },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Tiada kutipan sepadan"
              description={query ? `Tiada kutipan bernama "${query.trim()}" dalam paparan ini.` : `Tiada kutipan berstatus ${groupTitles[status as CollectionStatus]}.`}
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                >
                  Kosongkan penapis
                </Button>
              }
            />
          ) : (
            groupOrder.map((group) => {
              const rows = visible.filter((collection) => collection.status === group);
              if (!rows.length) return null;
              return (
                <section key={group} aria-labelledby={`kutipan-${group}`} className="grid gap-3">
                  <h2 id={`kutipan-${group}`} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    {groupTitles[group]}
                    <span className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] text-primary-strong tabular-nums">{rows.length}</span>
                  </h2>
                  <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {rows.map((collection) => (
                      <li key={collection.id} className="min-w-0">
                        <CollectionCard collection={collection} view={view} payments={data.payments} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </>
      )}
    </PageShell>
  );
}

function CollectionCard({ collection, view, payments }: { collection: Collection; view: View; payments: Payment[] }) {
  const Icon = collectionTypeIcons[collection.type];
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
    <Link
      href={`/kutipan/${collection.id}/`}
      className={cn(
        "group flex h-full min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(231,84,128,.04)] transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 md:p-5",
        collection.status === "archived" && "bg-card/70",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-light text-primary-strong">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <h3 className="min-w-0 text-[15px] leading-snug font-semibold break-words group-hover:text-primary-strong">{collection.name}</h3>
            <LabelChip entry={collectionStatusLabels[collection.status]} compact />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {collectionTypeLabels[collection.type]} · {amountLabel(collection)}
          </p>
        </div>
      </div>

      {voluntary ? (
        <div className="rounded-xl bg-primary-tint px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Jumlah terkumpul</p>
          <p className="text-lg font-bold tracking-[-.01em] tabular-nums">
            <Money sen={contributions!.received} />
          </p>
          <p className="text-xs text-muted-foreground">
            daripada {contributions!.contributors} penyumbang · {totals.participants} ahli dijemput
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
          <ProgressBar value={totals.received} max={totals.expected} label={`${collection.name}: diterima berbanding dijangka`} />
          {totals.dueNow > 0 && (
            <p className="text-xs text-muted-foreground">
              Baki semasa <span className="font-medium text-st-unpaid tabular-nums">{formatMoney(totals.dueNow)}</span>
              {totals.upcoming > 0 && <> · akan datang {formatMoney(totals.upcoming)}</>}
            </p>
          )}
        </div>
      )}

      <div className="mt-auto grid gap-2.5">
        {!voluntary && (
          <div className="flex flex-wrap gap-1">
            <StatusChip label={`Dibayar ${counts.paid}`} tone="paid" compact />
            {counts.partial > 0 && <StatusChip label={`Sebahagian ${counts.partial}`} tone="partial" compact />}
            <StatusChip label={`Belum bayar ${counts.unpaid}`} tone="unpaid" compact />
            {counts.overdue > 0 && <StatusChip label={`Lewat ${counts.overdue}`} tone="overdue" compact />}
            {counts.exempt > 0 && <StatusChip label={`Dikecualikan ${counts.exempt}`} tone="exempt" compact />}
          </div>
        )}
        {collection.type === "monthly" && <p className="-mt-1 text-[11px] text-subtle">Kiraan ikut caj (ahli × bulan) sehingga bulan ini.</p>}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden /> {totals.participants} peserta
          </span>
          <span className="min-w-0">{scheduleLabel(collection)}</span>
        </div>
        {pending > 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-st-pending">
            <Hourglass className="size-3.5" aria-hidden /> {formatMoney(pending)} menunggu semakan
          </p>
        )}
      </div>
    </Link>
  );
}
