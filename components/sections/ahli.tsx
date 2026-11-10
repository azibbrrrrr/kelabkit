"use client";

import { AddMemberDialog } from "@/components/add-member-dialog";
import { BulkAddMembersDialog } from "@/components/bulk-add-members";
import { useSnapshot } from "@/components/data-provider";
import {
  DataTable,
  EmptyState,
  FilterPills,
  MobileRow,
  PageHeader,
  PageShell,
  SearchInput,
  StatCard,
  StatusChip,
  Toolbar,
  type Column,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatMoney, formatNumber, initials } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { categoryLabels } from "@/lib/labels";
import type { Member, Sen } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ListPlus, SearchX, UserCheck, UserPlus, UsersRound, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";

// The member register: who is in the club, which collections they are in, and what they
// still owe now. Balances come from the read model (view.memberTotals), never computed here.

type Filter = "all" | "active" | "inactive" | "owing";

type Row = { member: Member; collections: number; dueNow: Sen; overdue: number };

export function AhliPage() {
  const t = useT();
  const { data, view } = useSnapshot();
  const router = useRouter();
  const [query, setQuery] = useState("");
  // The heavy filter/render follows the keystroke at lower priority, so typing never waits on it.
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>("all");
  const [addOne, setAddOne] = useState(false);
  const [addMany, setAddMany] = useState(false);

  const all = useMemo<Row[]>(() => {
    const joined = new Map<string, Set<string>>();
    for (const participant of data.participants) {
      const set = joined.get(participant.memberId) ?? new Set<string>();
      set.add(participant.collectionId);
      joined.set(participant.memberId, set);
    }
    return data.members
      .map((member) => {
        const totals = view.memberTotals(member.id);
        return { member, collections: joined.get(member.id)?.size ?? 0, dueNow: totals.dueNow, overdue: totals.counts.overdue };
      })
      .sort((a, b) => a.member.name.localeCompare(b.member.name, "ms"));
  }, [data.members, data.participants, view]);

  const counts = useMemo(
    () => ({
      all: all.length,
      active: all.filter((row) => row.member.active).length,
      inactive: all.filter((row) => !row.member.active).length,
      owing: all.filter((row) => row.dueNow > 0).length,
    }),
    [all],
  );

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return all.filter(({ member, dueNow }) => {
      if (filter === "active" && !member.active) return false;
      if (filter === "inactive" && member.active) return false;
      if (filter === "owing" && dueNow <= 0) return false;
      if (!q) return true;
      if (member.name.toLowerCase().includes(q)) return true;
      return digits.length >= 3 && (member.phone ?? "").replace(/\D/g, "").includes(digits);
    });
  }, [all, filter, deferredQuery]);

  const owingTotal = all.reduce((total, row) => total + row.dueNow, 0);

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t("members.columns.name"),
      cell: ({ member }) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Initials name={member.name} muted={!member.active} />
          <span className="min-w-0 truncate font-medium">{member.name}</span>
        </span>
      ),
    },
    {
      key: "category",
      header: t("members.columns.category"),
      cell: ({ member }) => <span className="text-muted-foreground">{member.category ? categoryLabels[member.category] : "—"}</span>,
    },
    {
      key: "phone",
      header: t("members.columns.phone"),
      hideBelow: "lg",
      cell: ({ member }) => <span className="text-muted-foreground tabular-nums">{member.phone ?? "—"}</span>,
    },
    { key: "status", header: t("members.columns.status"), cell: ({ member }) => <MemberStatus active={member.active} /> },
    {
      key: "collections",
      header: t("members.columns.collections"),
      align: "right",
      hideBelow: "lg",
      cell: ({ collections }) => <span className="text-muted-foreground">{collections}</span>,
    },
    {
      key: "due",
      header: t("members.columns.due"),
      align: "right",
      cell: ({ dueNow, overdue }) => (
        <span className="inline-flex flex-col items-end">
          <span className={cn("font-semibold", dueNow > 0 ? "text-st-unpaid" : "text-st-paid")}>{formatMoney(dueNow)}</span>
          {overdue > 0 && <span className="text-[11px] font-normal text-st-unpaid">{t("members.overdueCharges", { count: overdue })}</span>}
        </span>
      ),
    },
  ];

  const open = (row: Row) => router.push(`/ahli/${row.member.id}/`);

  return (
    <PageShell>
      <PageHeader
        title={t("members.title")}
        description={t("members.description")}
        actions={
          <>
            <Button variant="brand" onClick={() => setAddMany(true)}>
              <ListPlus /> {t("members.addBulk")}
            </Button>
            <Button onClick={() => setAddOne(true)}>
              <UserPlus /> {t("members.addOne")}
            </Button>
          </>
        }
      />

      {data.members.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={t("members.empty.title")}
          description={t("members.empty.description")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="brand" onClick={() => setAddMany(true)}>
                <ListPlus /> {t("members.addBulk")}
              </Button>
              <Button onClick={() => setAddOne(true)}>
                <UserPlus /> {t("members.addFirst")}
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label={t("members.stats.total")} value={formatNumber(counts.all)} icon={UsersRound} hint={t("members.stats.inactiveHint", { count: counts.inactive })} />
            <StatCard label={t("members.stats.active")} value={formatNumber(counts.active)} icon={UserCheck} tone="paid" hint={t("members.stats.activeHint")} />
            <StatCard
              label={t("members.stats.owing")}
              value={formatNumber(counts.owing)}
              icon={Wallet}
              tone={counts.owing > 0 ? "unpaid" : "paid"}
              hint={t("members.stats.owingHint", { amount: formatMoney(owingTotal) })}
            />
          </div>

          <Toolbar
            search={<SearchInput id="member-search" value={query} onChange={setQuery} placeholder={t("members.searchPlaceholder")} />}
            tabs={
              <FilterPills
                label={t("members.filter.label")}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: t("members.filter.all"), count: counts.all },
                  { value: "active", label: t("members.filter.active"), count: counts.active },
                  { value: "inactive", label: t("members.filter.inactive"), count: counts.inactive },
                  { value: "owing", label: t("members.filter.owing"), count: counts.owing },
                ]}
              />
            }
          />

          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.member.id}
            onSelect={open}
            empty={
              <EmptyState
                icon={SearchX}
                title={t("members.noMatch.title")}
                description={
                  filter === "owing" && !query ? t("members.noMatch.owing") : t("members.noMatch.other")
                }
                action={
                  (query || filter !== "all") && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      {t("members.noMatch.clear")}
                    </Button>
                  )
                }
              />
            }
            mobileCard={({ member, dueNow, collections }) => (
              <MobileRow
                title={member.name}
                amount={<span className={dueNow > 0 ? "text-st-unpaid" : "text-st-paid"}>{formatMoney(dueNow)}</span>}
                meta={[member.category ? categoryLabels[member.category] : null, t("members.collectionsCount", { count: collections }), member.phone].filter(Boolean).join(" · ")}
                status={<MemberStatus active={member.active} />}
              />
            )}
          />
        </>
      )}

      <AddMemberDialog open={addOne} onOpenChange={setAddOne} />
      <BulkAddMembersDialog open={addMany} onOpenChange={setAddMany} />
    </PageShell>
  );
}

export function MemberStatus({ active }: { active: boolean }) {
  const t = useT();
  return active ? <StatusChip label={t("members.status.active")} tone="brand" compact /> : <StatusChip label={t("members.status.inactive")} tone="na" compact />;
}

function Initials({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-semibold",
        muted ? "bg-st-na-bg text-st-na" : "bg-primary-light text-primary-strong",
      )}
    >
      {initials(name)}
    </span>
  );
}
