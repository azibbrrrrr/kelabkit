"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import { DatePicker } from "@/components/date-picker";
import { CellEditor } from "@/components/matrix/cell-editor";
import { MoneyInput, parseMoney } from "@/components/money-input";
import { amountLabel, scheduleLabel } from "@/components/sections/kutipan";
import { collectionTypeIcons } from "@/components/collection-icon";
import { CollectionIconButton } from "@/components/emoji-picker";
import { voluntarySummary } from "@/lib/money/ledger";
import {
  ChargeStatusChips,
  type Column,
  DataTable,
  DetailList,
  EmptyState,
  FilterPills,
  LabelChip,
  Money,
  MobileRow,
  PageHeader,
  PageShell,
  ProgressBar,
  SearchInput,
  SectionCard,
  StatCard,
  StatusChip,
  Toolbar,
} from "@/components/shared";
import { RestoreCollectionDialog } from "@/components/restore-collection-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ModalBody, ModalError, ModalField, ModalFooter, ModalHeader, ModalText } from "@/components/modal";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useT, type TFunction } from "@/lib/i18n/react";
import { errorMessages, messageFor } from "@/lib/errors";
import { formatDateTime, formatDay, formatMoney, formatMonth, formatMonthLong, formatPercent } from "@/lib/format";
import { categoryLabels, collectionStatusLabels, collectionTypeLabels } from "@/lib/labels";
import { senToInput } from "@/lib/money/amount";
import { totalsOf, type ChargeLedger } from "@/lib/money/ledger";
import { monthOf } from "@/lib/money/months";
import type { Collection, CollectionStatus, Member, Participant, Sen } from "@/lib/types";
import type { MatrixCell, MatrixColumn } from "@/lib/view";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  Hourglass,
  Pencil,
  Play,
  ReceiptText,
  SearchX,
  Sheet as SheetIcon,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

// One collection: its figures, its participants and every member's charge. Figures and
// statuses come from the ledger via the view; this screen only filters and sums them.
// Recording a payment opens the matrix's CellEditor, so there is one payment form.

export function KutipanDetail({ id }: { id: string }) {
  const t = useT();
  const { view } = useSnapshot();
  const collection = view.collectionsById.get(id);
  if (!collection) {
    return (
      <PageShell>
        <PageHeader title={t("collectionDetail.notFound.title")} back={{ href: "/kutipan/", label: t("nav.collections") }} />
        <EmptyState
          icon={SearchX}
          title={t("collectionDetail.notFound.emptyTitle")}
          description={t("collectionDetail.notFound.emptyDescription")}
          action={
            <Button asChild>
              <Link href="/kutipan/">{t("collectionDetail.notFound.backToList")}</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }
  return <CollectionDetail key={collection.id} collection={collection} />;
}

type Editing = { memberId: string; columnKey: string };

function CollectionDetail({ collection }: { collection: Collection }) {
  const t = useT();
  const { data, view } = useSnapshot();
  const archived = collection.status === "archived";
  const voluntary = collection.type === "voluntary";
  const monthly = collection.type === "monthly";
  const TypeIcon = collectionTypeIcons[collection.type];

  const columns = useMemo(() => view.columns([collection]), [view, collection]);
  const periods = view.periodsByCollection.get(collection.id) ?? [];
  const thisMonth = monthOf(view.today);
  const [month, setMonth] = useState<string>(() => {
    if (!periods.length) return "all";
    const current = periods.find((period) => period.month === thisMonth);
    if (current) return current.id;
    return thisMonth > periods[periods.length - 1].month ? periods[periods.length - 1].id : periods[0].id;
  });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const participants = useMemo(
    () =>
      (view.participantsByCollection.get(collection.id) ?? [])
        .map((participant) => ({ participant, member: view.membersById.get(participant.memberId) }))
        .filter((row): row is { participant: Participant; member: Member } => Boolean(row.member))
        .sort((a, b) => a.member.name.localeCompare(b.member.name, "ms")),
    [view, collection.id],
  );

  // Ledgers in the chosen scope: the whole collection, or one month of a monthly one.
  const allLedgers = useMemo(() => (view.chargesByCollection.get(collection.id) ?? []).map((charge) => view.ledgers.get(charge.id)!), [view, collection.id]);
  const scopeLedgers = monthly && month !== "all" ? allLedgers.filter((ledger) => ledger.charge.periodId === month) : allLedgers;
  const totals = totalsOf(scopeLedgers);
  const contributions = voluntary ? voluntarySummary(data.payments, collection.id) : null;
  const selectedPeriod = periods.find((period) => period.id === month) ?? null;
  const scopeLabel = monthly ? (selectedPeriod ? formatMonthLong(selectedPeriod.month) : t("collectionDetail.allMonths")) : null;

  return (
    <PageShell>
      <PageHeader
        back={{ href: "/kutipan/", label: t("nav.collections") }}
        title={<TitleEditor collection={collection} />}
        description={collection.description ?? undefined}
        actions={<StatusActions collection={collection} dueNow={view.collectionTotals(collection.id).dueNow} onAddParticipants={() => setAddOpen(true)} />}
      />

      <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <LabelChip entry={collectionStatusLabels[collection.status]} />
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-primary-light px-2.5 font-medium text-primary-strong">
          <TypeIcon className="size-3.5" aria-hidden /> {collectionTypeLabels[collection.type]}
        </span>
        <span className="px-1">{amountLabel(collection)}</span>
        <span aria-hidden>·</span>
        <span className="px-1">{scheduleLabel(collection)}</span>
      </div>

      {archived && (
        <p className="rounded-2xl border border-dashed border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
          <b className="text-foreground">{t("collectionDetail.archived.bold")}</b>
          {t("collectionDetail.archived.text")}
        </p>
      )}

      {monthly && periods.length > 0 && <MonthPicker periods={periods} value={month} onChange={setMonth} thisMonth={thisMonth} />}

      {voluntary ? (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("collectionDetail.voluntaryStats.raised")} value={formatMoney(contributions!.received)} icon={CircleCheck} tone="paid" hint={t("collectionDetail.voluntaryStats.raisedHint")} />
          <StatCard label={t("collectionDetail.voluntaryStats.contributors")} value={contributions!.contributors} icon={Users} hint={t("collectionDetail.voluntaryStats.contributorsHint", { count: participants.length })} />
          <StatCard label={t("collectionDetail.voluntaryStats.pending")} value={formatMoney(contributions!.pending)} icon={Hourglass} tone="pending" hint={t("collectionDetail.voluntaryStats.pendingHint")} />
          <StatCard label={t("collectionDetail.voluntaryStats.participants")} value={participants.length} icon={WalletCards} hint={t("collectionDetail.voluntaryStats.participantsHint")} />
        </div>
      ) : (
        // Six cards for monthly fill a 3-column grid; one-off has five, laid out as 2 wide + 3.
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-6">
          <StatCard
            label={t("collectionDetail.stats.expected")}
            value={formatMoney(totals.expected)}
            icon={WalletCards}
            hint={scopeLabel ?? t("collectionDetail.stats.expectedHint")}
            className={monthly ? "lg:col-span-2" : "lg:col-span-3"}
          />
          <StatCard
            label={t("collectionDetail.stats.received")}
            value={formatMoney(totals.received)}
            icon={CircleCheck}
            tone="paid"
            hint={t("collectionDetail.stats.receivedHint", { percent: formatPercent(totals.received, totals.expected) })}
            className={monthly ? "lg:col-span-2" : "lg:col-span-3"}
          />
          <StatCard
            label={t("collectionDetail.stats.balance")}
            value={formatMoney(totals.dueNow)}
            icon={CircleAlert}
            tone="unpaid"
            hint={totals.counts.overdue > 0 ? t("collectionDetail.stats.overdueHint", { count: totals.counts.overdue }) : t("collectionDetail.stats.noOverdue")}
            className="lg:col-span-2"
          />
          {monthly && (
            <StatCard
              label={t("collectionDetail.stats.upcoming")}
              value={formatMoney(totals.upcoming)}
              icon={CalendarClock}
              tone="exempt"
              hint={t("collectionDetail.stats.upcomingHint")}
              className="lg:col-span-2"
            />
          )}
          <StatCard
            label={t("collectionDetail.stats.pending")}
            value={formatMoney(totals.pending)}
            icon={Hourglass}
            tone="pending"
            hint={totals.counts.pendingReview > 0 ? t("collectionDetail.stats.pendingHint", { count: totals.counts.pendingReview }) : t("collectionDetail.stats.pendingNone")}
            className="lg:col-span-2"
          />
          <StatCard
            label={t("collectionDetail.stats.participants")}
            value={participants.length}
            icon={Users}
            hint={totals.counts.exempt > 0 ? t("collectionDetail.stats.exemptHint", { count: totals.counts.exempt }) : t("collectionDetail.stats.noExempt")}
            className="lg:col-span-2"
          />
        </div>
      )}

      {voluntary ? (
        <InfoCard collection={collection} />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <SectionCard title={t("collectionDetail.progress.title")} icon={CircleCheck} description={scopeLabel ? t("collectionDetail.progress.view", { scope: scopeLabel }) : undefined}>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>
                  <Money sen={totals.received} className="text-lg font-bold" />
                  <span className="text-muted-foreground"> / {formatMoney(totals.expected)}</span>
                </span>
                <span className="font-medium text-primary-strong tabular-nums">{formatPercent(totals.received, totals.expected)}</span>
              </div>
              <ProgressBar value={totals.received} max={totals.expected} label={t("collectionDetail.progress.aria")} className="h-2.5" />
              <StatusCounts
                counts={totals.counts}
                future={scopeLedgers.filter((ledger) => ledger.future && ledger.status === "unpaid" && ledger.pending === 0).length}
              />
              {monthly && month === "all" && <p className="text-[11px] text-muted-foreground">{t("collectionDetail.progress.countNote")}</p>}
            </div>
          </SectionCard>
          <InfoCard collection={collection} />
        </div>
      )}

      {voluntary ? (
        <VoluntaryTable collection={collection} participants={participants} column={columns[0]} archived={archived} onOpen={setEditing} />
      ) : monthly && month === "all" ? (
        <AllMonthsTable collection={collection} participants={participants} columns={columns} archived={archived} onOpen={setEditing} />
      ) : (
        <ChargeTable
          participants={participants}
          column={monthly ? (columns.find((column) => column.period?.id === month) ?? columns[0]) : columns[0]}
          archived={archived}
          onOpen={setEditing}
        />
      )}

      <EditorHost editing={editing} columns={columns} onClose={() => setEditing(null)} />
      {!archived && <AddParticipantsDialog collection={collection} open={addOpen} onOpenChange={setAddOpen} />}
    </PageShell>
  );
}

// Header pieces ------------------------------------------------------------------------------

function TitleEditor({ collection }: { collection: Collection }) {
  const t = useT();
  const { run } = useKelab();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(collection.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <span className="inline-flex max-w-full items-start gap-3">
        <CollectionIconButton collection={collection} size="xl" className="mt-0.5 size-12 rounded-2xl bg-primary-light text-primary-strong md:size-13" />
        <span className="min-w-0 self-center break-words">{collection.name}</span>
        {collection.status !== "archived" && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="mt-1 shrink-0 text-muted-foreground"
            aria-label={t("collectionDetail.title.renameAria")}
            onClick={() => {
              setValue(collection.name);
              setError(null);
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
        )}
      </span>
    );
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const name = value.replace(/\s+/g, " ").trim();
    if (!name) return setError(errorMessages.NAME_REQUIRED);
    if (name === collection.name) return setEditing(false);
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.updateCollection(collection.id, { name }));
      toast.success(t("collectionDetail.title.renamed", { name }));
      setEditing(false);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-1.5 font-sans text-base font-normal tracking-normal" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setEditing(false)}
          aria-label={t("collectionDetail.title.nameAria")}
          aria-invalid={Boolean(error)}
          maxLength={140}
          className="h-11 min-w-0 rounded-xl text-base font-semibold sm:w-96"
        />
        <div className="flex gap-2">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? <Spinner className="size-4" /> : <Check />} {t("common.save")}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => setEditing(false)} disabled={busy}>
            <X /> {t("common.cancel")}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
    </form>
  );
}

type StatusChange = { status: CollectionStatus; title: string; body: string; confirm: string; success: string };

function StatusActions({ collection, dueNow, onAddParticipants }: { collection: Collection; dueNow: Sen; onAddParticipants: () => void }) {
  const t = useT();
  const { run } = useKelab();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<StatusChange | null>(null);
  const [restoring, setRestoring] = useState(false);
  const actions = useRef<HTMLDivElement>(null);

  const change = async (next: StatusChange) => {
    setBusy(true);
    try {
      await run((backend) => backend.setCollectionStatus(collection.id, next.status));
      toast.success(next.success);
      setConfirming(null);
    } catch (cause) {
      toast.error(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const activate: StatusChange = {
    status: "active",
    title: t("collectionDetail.status.activateTitle"),
    body: "",
    confirm: t("collectionDetail.status.activateConfirm"),
    success: t("collectionDetail.actions.activated", { name: collection.name }),
  };
  const complete: StatusChange = {
    status: "completed",
    title: t("collectionDetail.status.completeTitle"),
    body: t("collectionDetail.status.completeBody", { due: formatMoney(dueNow) }),
    confirm: t("collectionDetail.status.completeConfirm"),
    success: t("collectionDetail.actions.completed", { name: collection.name }),
  };
  const archive: StatusChange = {
    status: "archived",
    title: t("collectionDetail.status.archiveTitle"),
    body: t("collectionDetail.status.archiveBody"),
    confirm: t("collectionDetail.status.archiveConfirm"),
    success: t("collectionDetail.actions.archivedDone", { name: collection.name }),
  };
  return (
    // display: contents keeps the buttons laid out by PageHeader; the ref gives restore a focus target.
    <div ref={actions} className="contents">
      {collection.status !== "archived" && (
        <Button variant="brand" onClick={onAddParticipants}>
          <UserPlus /> {t("collectionDetail.actions.addParticipants")}
        </Button>
      )}
      {(collection.status === "draft" || collection.status === "completed") && (
        <Button onClick={() => void change(activate)} disabled={busy}>
          {busy ? <Spinner className="size-4" /> : <Play />} {collection.status === "draft" ? t("collectionDetail.actions.activate") : t("collectionDetail.actions.reactivate")}
        </Button>
      )}
      {collection.status === "active" && (
        <Button onClick={() => (dueNow > 0 ? setConfirming(complete) : void change(complete))} disabled={busy}>
          {busy ? <Spinner className="size-4" /> : <Check />} {t("collectionDetail.actions.markComplete")}
        </Button>
      )}
      {collection.status === "archived" ? (
        <Button onClick={() => setRestoring(true)} disabled={busy}>
          <ArchiveRestore /> {t("collectionDetail.actions.restore")}
        </Button>
      ) : (
        <>
          <Button variant="outline" asChild>
            <Link href="/matriks/">
              <SheetIcon /> {t("collectionDetail.actions.openMatrix")}
            </Link>
          </Button>
          <Button variant="danger-outline" onClick={() => setConfirming(archive)} disabled={busy}>
            <Archive /> {t("collectionDetail.actions.archive")}
          </Button>
        </>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !busy && setConfirming(null)}>
        <AlertDialogContent>
          <ModalHeader
            alert
            icon={confirming?.status === "archived" ? Archive : Check}
            tone={confirming?.status === "archived" ? "danger" : "brand"}
            title={confirming?.title}
          />
          <ModalBody>
            <ModalText alert>{confirming?.body}</ModalText>
          </ModalBody>
          <ModalFooter>
            <AlertDialogCancel variant="ghost" disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            {/* A plain button, not AlertDialogAction, so the dialog stays open until the change succeeds. */}
            <Button variant={confirming?.status === "archived" ? "danger" : "default"} onClick={() => confirming && void change(confirming)} disabled={busy}>
              {busy && <Spinner className="size-4" />}
              {confirming?.confirm}
            </Button>
          </ModalFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* The Pulihkan button is replaced once restored; focus moves to the first new action. */}
      <RestoreCollectionDialog
        collection={restoring ? collection : null}
        onClose={() => setRestoring(false)}
        fallbackFocus={() => actions.current?.querySelector<HTMLElement>("button, a")}
      />
    </div>
  );
}

function MonthPicker({
  periods,
  value,
  onChange,
  thisMonth,
}: {
  periods: { id: string; month: string }[];
  value: string;
  onChange: (value: string) => void;
  thisMonth: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Label htmlFor="kutipan-month" className="shrink-0 text-sm font-medium">
        {t("collectionDetail.monthPicker.label")}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="kutipan-month" className="w-full font-medium sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("collectionDetail.monthPicker.all")}</SelectItem>
          {periods.map((period) => (
            <SelectItem key={period.id} value={period.id}>
              {formatMonthLong(period.month)}
              {period.month === thisMonth ? t("collectionDetail.monthPicker.thisMonth") : period.month > thisMonth ? t("collectionDetail.monthPicker.upcoming") : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatusCounts({ counts, future }: { counts: ReturnType<typeof totalsOf>["counts"]; future: number }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatusChip label={t("collectionDetail.counts.paid", { count: counts.paid })} tone="paid" />
      <StatusChip label={t("collectionDetail.counts.partial", { count: counts.partial })} tone="partial" />
      <StatusChip label={t("collectionDetail.counts.unpaid", { count: counts.unpaid - future })} tone="unpaid" />
      {future > 0 && <StatusChip label={t("collectionDetail.counts.upcoming", { count: future })} tone="future" />}
      {counts.overdue > 0 && <StatusChip label={t("collectionDetail.counts.overdue", { count: counts.overdue })} tone="overdue" />}
      {counts.pendingReview > 0 && <StatusChip label={t("collectionDetail.counts.pending", { count: counts.pendingReview })} tone="pending" />}
      {counts.exempt > 0 && <StatusChip label={t("collectionDetail.counts.exempt", { count: counts.exempt })} tone="exempt" />}
    </div>
  );
}

function InfoCard({ collection }: { collection: Collection }) {
  const t = useT();
  return (
    <SectionCard title={t("collectionDetail.info.title")} icon={WalletCards}>
      <DetailList
        items={[
          { label: t("collectionDetail.info.type"), value: collectionTypeLabels[collection.type] },
          { label: t("collectionDetail.info.originalAmount"), value: amountLabel(collection) },
          ...(collection.type === "one_off" ? [{ label: t("collectionDetail.info.dueDate"), value: <DueDateEditor collection={collection} /> }] : []),
          ...(collection.type === "monthly" && collection.startMonth && collection.endMonth
            ? [
                { label: t("collectionDetail.info.period"), value: `${formatMonth(collection.startMonth)} – ${formatMonth(collection.endMonth)}` },
                {
                  label: t("collectionDetail.info.dueDay"),
                  value: collection.dueDay ? t("collectionDetail.info.dueDayValue", { day: collection.dueDay }) : t("collectionDetail.info.none"),
                },
              ]
            : []),
          { label: t("collectionDetail.info.description"), value: collection.description },
          { label: t("collectionDetail.info.notes"), value: collection.notes },
          { label: t("collectionDetail.info.created"), value: formatDateTime(collection.createdAt) },
        ]}
      />
    </SectionCard>
  );
}

function DueDateEditor({ collection }: { collection: Collection }) {
  const t = useT();
  const { run } = useKelab();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(collection.dueDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string | null) => {
    if (next !== null && !/^\d{4}-\d{2}-\d{2}$/.test(next)) return setError(errorMessages.DATE_INVALID);
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.updateCollection(collection.id, { dueDate: next }));
      toast.success(next ? t("collectionDetail.dueEditor.changed", { date: formatDay(next) }) : t("collectionDetail.dueEditor.removed"));
      setEditing(false);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        {collection.dueDate ? formatDay(collection.dueDate) : t("collectionDetail.dueEditor.noDueDate")}
        {collection.status !== "archived" && (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={() => {
              setValue(collection.dueDate ?? "");
              setEditing(true);
            }}
          >
            {t("collectionDetail.dueEditor.edit")}
          </Button>
        )}
      </span>
    );
  }

  return (
    <span className="grid gap-2">
      <DatePicker value={value} onChange={setValue} aria-label={t("collectionDetail.dueEditor.aria")} emptyLabel={t("collectionDetail.dueEditor.noDueDate")} />
      <span className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => void save(value || null)} disabled={busy}>
          {busy && <Spinner className="size-3.5" />} {t("common.save")}
        </Button>
        {collection.dueDate && (
          <Button size="sm" variant="danger-outline" onClick={() => void save(null)} disabled={busy}>
            {t("collectionDetail.dueEditor.removeDate")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
          {t("common.cancel")}
        </Button>
      </span>
      {error && <span className="text-xs font-medium text-st-unpaid">{error}</span>}
    </span>
  );
}

// Tables -------------------------------------------------------------------------------------

type Row = { participant: Participant; member: Member };

function memberCell(member: Member, t: TFunction) {
  return (
    <span className="block min-w-0">
      <span className="block font-medium break-words">{member.name}</span>
      <span className="block text-xs text-muted-foreground">
        {member.category ? categoryLabels[member.category] : t("collectionDetail.member.noCategory")}
        {!member.active && t("collectionDetail.member.inactive")}
      </span>
    </span>
  );
}

/** Search and status tabs above each tracking table: the shared one-row Toolbar. */
function TableToolbar({ search, tabs }: { search: ReactNode; tabs: ReactNode }) {
  return <Toolbar search={search} tabs={tabs} />;
}

const matchesQuery = (member: Member, query: string) => !query.trim() || member.name.toLowerCase().includes(query.trim().toLowerCase());

type ChargeFilter = "all" | "paid" | "partial" | "unpaid" | "future" | "overdue" | "pending" | "exempt";

/** One-off collections, or one month of a monthly collection: a row per participant. */
function ChargeTable({
  participants,
  column,
  archived,
  onOpen,
}: {
  participants: Row[];
  column: MatrixColumn;
  archived: boolean;
  onOpen: (editing: Editing) => void;
}) {
  const t = useT();
  const { view } = useSnapshot();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChargeFilter>("all");

  const rows = participants.map((row) => ({ ...row, cell: view.cell(row.member, column) }));
  const ledgerOf = (cell: MatrixCell) => (cell.kind === "charge" ? cell.ledger : null);
  const matches = (cell: MatrixCell, value: ChargeFilter) => {
    if (value === "all") return true;
    const ledger = ledgerOf(cell);
    if (!ledger || cell.kind !== "charge") return false;
    if (value === "overdue") return ledger.overdue;
    if (value === "pending") return ledger.pending > 0;
    return cell.status === value;
  };
  const count = (value: ChargeFilter) => rows.filter((row) => matches(row.cell, value)).length;
  const visible = rows.filter((row) => matches(row.cell, filter) && matchesQuery(row.member, query));

  const options: { value: ChargeFilter; label: string; count: number }[] = (
    [
      ["all", t("collectionDetail.charge.filters.all")],
      ["paid", t("collectionDetail.charge.filters.paid")],
      ["partial", t("collectionDetail.charge.filters.partial")],
      ["unpaid", t("collectionDetail.charge.filters.unpaid")],
      ["future", t("collectionDetail.charge.filters.future")],
      ["overdue", t("collectionDetail.charge.filters.overdue")],
      ["pending", t("collectionDetail.charge.filters.pending")],
      ["exempt", t("collectionDetail.charge.filters.exempt")],
    ] as [ChargeFilter, string][]
  )
    .map(([value, label]) => ({ value, label, count: count(value) }))
    .filter((option) => option.value === "all" || option.value === filter || option.count > 0 || ["paid", "unpaid"].includes(option.value));

  const open = (row: Row) => onOpen({ memberId: row.member.id, columnKey: column.key });
  const actionLabel = (cell: MatrixCell) => (archived ? t("collectionDetail.charge.view") : cell.kind === "charge" && cell.status === "exempt" ? t("collectionDetail.charge.details") : t("collectionDetail.charge.record"));
  const note = (row: Row & { cell: MatrixCell }) => {
    const ledger = ledgerOf(row.cell);
    if (ledger?.charge.exempt) return ledger.charge.exemptReason;
    return ledger?.charge.note ?? row.participant.note;
  };

  const tableColumns: Column<Row & { cell: MatrixCell }>[] = [
    { key: "member", header: t("collectionDetail.charge.columns.member"), cell: (row) => memberCell(row.member, t) },
    {
      key: "required",
      header: t("collectionDetail.charge.columns.required"),
      align: "right",
      cell: (row) => {
        const ledger = ledgerOf(row.cell);
        return ledger ? ledger.charge.exempt ? <span className="text-muted-foreground">—</span> : formatMoney(ledger.required) : "—";
      },
    },
    {
      key: "paid",
      header: t("collectionDetail.charge.columns.paid"),
      align: "right",
      cell: (row) => {
        const ledger = ledgerOf(row.cell);
        if (!ledger) return "—";
        return (
          <span className="block">
            {formatMoney(ledger.confirmed)}
            {ledger.pending > 0 && <span className="block text-[11px] text-st-pending">{t("collectionDetail.charge.pendingSuffix", { amount: formatMoney(ledger.pending) })}</span>}
          </span>
        );
      },
    },
    {
      key: "remaining",
      header: t("collectionDetail.charge.columns.balance"),
      align: "right",
      cell: (row) => {
        const ledger = ledgerOf(row.cell);
        if (!ledger) return "—";
        return (
          <span className={cn(ledger.overdue && "font-semibold text-st-unpaid", ledger.remaining === 0 && "text-muted-foreground")}>
            {formatMoney(ledger.remaining)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: t("collectionDetail.charge.columns.status"),
      cell: (row) =>
        row.cell.kind === "charge" ? (
          <ChargeStatusChips status={row.cell.status} overdue={row.cell.ledger.overdue} pending={row.cell.ledger.pending > 0} compact />
        ) : (
          <ChargeStatusChips status="na" compact />
        ),
    },
    { key: "last", header: t("collectionDetail.charge.columns.lastPayment"), hideBelow: "2xl", cell: (row) => formatDay(ledgerOf(row.cell)?.lastPaidOn) },
    {
      key: "note",
      header: t("collectionDetail.charge.columns.note"),
      hideBelow: "2xl",
      className: "max-w-48",
      cell: (row) => <span className="line-clamp-2 text-xs text-muted-foreground">{note(row) || "—"}</span>,
    },
    {
      key: "action",
      header: <span className="sr-only">{t("collectionDetail.charge.columns.action")}</span>,
      align: "right",
      cell: (row) => (
        <Button size="sm" variant={archived ? "outline" : "brand"} onClick={() => open(row)}>
          {actionLabel(row.cell)}
        </Button>
      ),
    },
  ];

  return (
    <section className="grid min-w-0 grid-cols-1 gap-3" aria-label={t("collectionDetail.charge.sectionAria")}>
      <h2 className="text-[15px] font-semibold">{t("collectionDetail.charge.heading")}{column.period ? ` · ${formatMonthLong(column.period.month)}` : ""}</h2>
      <TableToolbar
        search={<SearchInput id="kutipan-detail-search" value={query} onChange={setQuery} placeholder={t("collectionDetail.member.searchPlaceholder")} />}
        tabs={<FilterPills label={t("collectionDetail.charge.filterLabel")} value={filter} onChange={setFilter} options={options} />}
      />
      <DataTable
        rows={visible}
        columns={tableColumns}
        rowKey={(row) => row.member.id}
        onSelect={open}
        empty={<EmptyRows hasParticipants={participants.length > 0} />}
        mobileCard={(row) => {
          const ledger = ledgerOf(row.cell);
          return (
            <MobileRow
              title={row.member.name}
              amount={ledger ? (ledger.charge.exempt ? "—" : t("collectionDetail.charge.mobileBalance", { amount: formatMoney(ledger.remaining) })) : "—"}
              meta={ledger ? (ledger.charge.exempt ? ledger.charge.exemptReason ?? t("collectionDetail.charge.exempted") : t("collectionDetail.charge.mobilePaid", { amount: formatMoney(ledger.confirmed) })) : t("collectionDetail.charge.noCharge")}
              status={
                row.cell.kind === "charge" ? (
                  <ChargeStatusChips
                    status={row.cell.status}
                    overdue={row.cell.ledger.overdue}
                    pending={row.cell.ledger.pending > 0}
                    compact
                    className="justify-end"
                  />
                ) : undefined
              }
            />
          );
        }}
      />
    </section>
  );
}

type MonthsFilter = "all" | "owing" | "overdue" | "pending" | "settled";

/** Monthly collections, "Semua bulan": one summary row per participant across every month. */
function AllMonthsTable({
  collection,
  participants,
  columns,
  archived,
  onOpen,
}: {
  collection: Collection;
  participants: Row[];
  columns: MatrixColumn[];
  archived: boolean;
  onOpen: (editing: Editing) => void;
}) {
  const t = useT();
  const { view } = useSnapshot();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MonthsFilter>("all");
  const charges = view.chargesByCollection.get(collection.id) ?? [];
  const periodMonth = new Map((view.periodsByCollection.get(collection.id) ?? []).map((period) => [period.id, period.month]));
  const thisMonth = monthOf(view.today);

  const rows = participants.map((row) => {
    const ledgers: ChargeLedger[] = charges
      .filter((charge) => charge.memberId === row.member.id)
      .map((charge) => view.ledgers.get(charge.id)!)
      .sort((a, b) => (periodMonth.get(a.charge.periodId ?? "") ?? "").localeCompare(periodMonth.get(b.charge.periodId ?? "") ?? ""));
    const totals = totalsOf(ledgers);
    // The month "Rekod" opens: the oldest one that can still take money, else this month.
    const target =
      ledgers.find((ledger) => !ledger.future && ledger.payable > 0) ??
      ledgers.find((ledger) => ledger.payable > 0) ??
      ledgers.find((ledger) => periodMonth.get(ledger.charge.periodId ?? "") === thisMonth) ??
      ledgers[0];
    const targetColumn = target ? columns.find((column) => column.period?.id === target.charge.periodId) : undefined;
    return { ...row, ledgers, totals, targetColumn };
  });
  type MonthRow = (typeof rows)[number];

  const matches = (row: MonthRow, value: MonthsFilter) => {
    if (value === "owing") return row.totals.dueNow > 0;
    if (value === "overdue") return row.totals.counts.overdue > 0;
    if (value === "pending") return row.totals.counts.pendingReview > 0;
    if (value === "settled") return row.ledgers.length > 0 && row.totals.dueNow === 0;
    return true;
  };
  const visible = rows.filter((row) => matches(row, filter) && matchesQuery(row.member, query));
  const open = (row: MonthRow) => row.targetColumn && onOpen({ memberId: row.member.id, columnKey: row.targetColumn.key });
  const settledMonths = (row: MonthRow) => row.totals.counts.paid + row.totals.counts.exempt;

  const tableColumns: Column<MonthRow>[] = [
    { key: "member", header: t("collectionDetail.months.columns.member"), cell: (row) => memberCell(row.member, t) },
    { key: "required", header: t("collectionDetail.months.columns.required"), align: "right", cell: (row) => formatMoney(row.totals.expected) },
    {
      key: "paid",
      header: t("collectionDetail.months.columns.paid"),
      align: "right",
      cell: (row) => (
        <span className="block">
          {formatMoney(row.totals.received)}
          {row.totals.pending > 0 && <span className="block text-[11px] text-st-pending">{t("collectionDetail.charge.pendingSuffix", { amount: formatMoney(row.totals.pending) })}</span>}
        </span>
      ),
    },
    {
      key: "due",
      header: t("collectionDetail.months.columns.due"),
      align: "right",
      cell: (row) => (
        <span className={cn(row.totals.counts.overdue > 0 && "font-semibold text-st-unpaid", row.totals.dueNow === 0 && "text-muted-foreground")}>
          {formatMoney(row.totals.dueNow)}
        </span>
      ),
    },
    {
      key: "upcoming",
      header: t("collectionDetail.months.columns.upcoming"),
      align: "right",
      hideBelow: "lg",
      cell: (row) => <span className="text-muted-foreground">{formatMoney(row.totals.upcoming)}</span>,
    },
    {
      key: "status",
      header: t("collectionDetail.months.columns.status"),
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {t("collectionDetail.months.settled", { settled: settledMonths(row), total: row.ledgers.length })}
          </span>
          {row.totals.counts.overdue > 0 && <StatusChip label={t("collectionDetail.counts.overdue", { count: row.totals.counts.overdue })} tone="overdue" compact />}
          {row.totals.counts.pendingReview > 0 && <StatusChip label={t("collectionDetail.months.pendingReview")} tone="pending" compact />}
        </span>
      ),
    },
    {
      key: "action",
      header: <span className="sr-only">{t("collectionDetail.months.columns.action")}</span>,
      align: "right",
      cell: (row) =>
        row.targetColumn ? (
          <Button size="sm" variant={archived ? "outline" : "brand"} onClick={() => open(row)}>
            {archived ? t("collectionDetail.months.view") : t("collectionDetail.months.record")} · {row.targetColumn.short}
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <section className="grid min-w-0 grid-cols-1 gap-3" aria-label={t("collectionDetail.months.sectionAria")}>
      <div>
        <h2 className="text-[15px] font-semibold">{t("collectionDetail.months.heading")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("collectionDetail.months.hintBefore")}
        </p>
      </div>
      <TableToolbar
        search={<SearchInput id="kutipan-detail-search" value={query} onChange={setQuery} placeholder={t("collectionDetail.member.searchPlaceholder")} />}
        tabs={
          <FilterPills
            label={t("collectionDetail.months.filterLabel")}
            value={filter}
            onChange={setFilter}
            options={(
              [
                ["all", t("collectionDetail.months.filters.all")],
                ["owing", t("collectionDetail.months.filters.owing")],
                ["overdue", t("collectionDetail.months.filters.overdue")],
                ["pending", t("collectionDetail.months.filters.pending")],
                ["settled", t("collectionDetail.months.filters.settled")],
              ] as [MonthsFilter, string][]
            ).map(([value, label]) => ({ value, label, count: rows.filter((row) => matches(row, value)).length }))}
          />
        }
      />
      <DataTable
        rows={visible}
        columns={tableColumns}
        rowKey={(row) => row.member.id}
        onSelect={(row) => open(row)}
        empty={<EmptyRows hasParticipants={participants.length > 0} />}
        mobileCard={(row) => (
          <MobileRow
            title={row.member.name}
            amount={t("collectionDetail.charge.mobileBalance", { amount: formatMoney(row.totals.dueNow) })}
            meta={t("collectionDetail.months.mobileMeta", { settled: settledMonths(row), total: row.ledgers.length, amount: formatMoney(row.totals.received) })}
            status={
              row.totals.counts.overdue > 0 ? (
                <StatusChip label={t("collectionDetail.counts.overdue", { count: row.totals.counts.overdue })} tone="overdue" compact />
              ) : row.totals.counts.pendingReview > 0 ? (
                <StatusChip label={t("collectionDetail.months.pending")} tone="pending" compact />
              ) : undefined
            }
          />
        )}
      />
    </section>
  );
}

type VoluntaryFilter = "all" | "given" | "none" | "pending";

/** Voluntary collections: contributions per member. No balance, no lateness. */
function VoluntaryTable({
  collection,
  participants,
  column,
  archived,
  onOpen,
}: {
  collection: Collection;
  participants: Row[];
  column: MatrixColumn;
  archived: boolean;
  onOpen: (editing: Editing) => void;
}) {
  const t = useT();
  const { view } = useSnapshot();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VoluntaryFilter>("all");

  const rows = participants.map((row) => {
    const cell = view.cell(row.member, column);
    const confirmed = view.paymentsFor(row.member.id, null, collection.id).filter((payment) => payment.state === "confirmed");
    const last = confirmed.reduce<string | null>((latest, payment) => (!latest || payment.paidOn > latest ? payment.paidOn : latest), null);
    return {
      ...row,
      received: cell.kind === "voluntary" ? cell.received : 0,
      pending: cell.kind === "voluntary" ? cell.pending : 0,
      count: cell.kind === "voluntary" ? cell.count : 0,
      last,
    };
  });
  type VoluntaryRow = (typeof rows)[number];

  const matches = (row: VoluntaryRow, value: VoluntaryFilter) => {
    if (value === "given") return row.received > 0;
    if (value === "none") return row.count === 0;
    if (value === "pending") return row.pending > 0;
    return true;
  };
  const visible = rows.filter((row) => matches(row, filter) && matchesQuery(row.member, query));
  const open = (row: VoluntaryRow) => onOpen({ memberId: row.member.id, columnKey: column.key });

  const tableColumns: Column<VoluntaryRow>[] = [
    { key: "member", header: t("collectionDetail.voluntaryTable.columns.member"), cell: (row) => memberCell(row.member, t) },
    { key: "received", header: t("collectionDetail.voluntaryTable.columns.total"), align: "right", cell: (row) => formatMoney(row.received) },
    { key: "count", header: t("collectionDetail.voluntaryTable.columns.count"), align: "right", cell: (row) => row.count },
    { key: "last", header: t("collectionDetail.voluntaryTable.columns.last"), hideBelow: "lg", cell: (row) => formatDay(row.last) },
    {
      key: "pending",
      header: t("collectionDetail.voluntaryTable.columns.pending"),
      align: "right",
      cell: (row) => (row.pending > 0 ? <span className="text-st-pending">{formatMoney(row.pending)}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "note",
      header: t("collectionDetail.voluntaryTable.columns.note"),
      hideBelow: "2xl",
      className: "max-w-48",
      cell: (row) => <span className="line-clamp-2 text-xs text-muted-foreground">{row.participant.note || "—"}</span>,
    },
    {
      key: "action",
      header: <span className="sr-only">{t("collectionDetail.voluntaryTable.columns.action")}</span>,
      align: "right",
      cell: (row) => (
        <Button size="sm" variant={archived ? "outline" : "brand"} onClick={() => open(row)}>
          {archived ? t("collectionDetail.voluntaryTable.view") : t("collectionDetail.voluntaryTable.record")}
        </Button>
      ),
    },
  ];

  return (
    <section className="grid min-w-0 grid-cols-1 gap-3" aria-label={t("collectionDetail.voluntaryTable.sectionAria")}>
      <h2 className="text-[15px] font-semibold">{t("collectionDetail.voluntaryTable.heading")}</h2>
      <TableToolbar
        search={<SearchInput id="kutipan-detail-search" value={query} onChange={setQuery} placeholder={t("collectionDetail.member.searchPlaceholder")} />}
        tabs={
          <FilterPills
            label={t("collectionDetail.voluntaryTable.filterLabel")}
            value={filter}
            onChange={setFilter}
            options={(
              [
                ["all", t("collectionDetail.voluntaryTable.filters.all")],
                ["given", t("collectionDetail.voluntaryTable.filters.given")],
                ["none", t("collectionDetail.voluntaryTable.filters.none")],
                ["pending", t("collectionDetail.voluntaryTable.filters.pending")],
              ] as [VoluntaryFilter, string][]
            ).map(([value, label]) => ({ value, label, count: rows.filter((row) => matches(row, value)).length }))}
          />
        }
      />
      <DataTable
        rows={visible}
        columns={tableColumns}
        rowKey={(row) => row.member.id}
        onSelect={open}
        empty={<EmptyRows hasParticipants={participants.length > 0} />}
        mobileCard={(row) => (
          <MobileRow
            title={row.member.name}
            amount={formatMoney(row.received)}
            meta={row.count ? t("collectionDetail.voluntaryTable.mobileMeta", { count: row.count, date: formatDay(row.last) }) : t("collectionDetail.voluntaryTable.notYet")}
            status={row.pending > 0 ? <StatusChip label={t("collectionDetail.voluntaryTable.pending")} tone="pending" compact /> : undefined}
          />
        )}
      />
    </section>
  );
}

function EmptyRows({ hasParticipants }: { hasParticipants: boolean }) {
  const t = useT();
  return hasParticipants ? (
    <EmptyState icon={SearchX} title={t("collectionDetail.emptyRows.noMatchTitle")} description={t("collectionDetail.emptyRows.noMatchDescription")} />
  ) : (
    <EmptyState icon={UserPlus} title={t("collectionDetail.emptyRows.noneTitle")} description={t("collectionDetail.emptyRows.noneDescription")} />
  );
}

// Payment editor: Dialog on desktop, bottom sheet on phones ----------------------------------

function EditorHost({ editing, columns, onClose }: { editing: Editing | null; columns: MatrixColumn[]; onClose: () => void }) {
  const t = useT();
  const { view } = useSnapshot();
  const [dirty, setDirty] = useState(false);

  const member = editing ? view.membersById.get(editing.memberId) : undefined;
  const column = editing ? columns.find((row) => row.key === editing.columnKey) : undefined;
  // Rebuilt from the latest snapshot on every render, so the editor shows the reloaded ledger.
  const cell = member && column ? view.cell(member, column) : null;

  const close = () => {
    setDirty(false);
    onClose();
  };
  const onOpenChange = (next: boolean) => {
    if (next) return;
    if (dirty && !window.confirm(t("collectionDetail.editorHost.discardConfirm"))) return;
    close();
  };
  const editor = cell && <CellEditor cell={cell} onDone={close} onDirtyChange={setDirty} />;

  // One Dialog: a centred card from 640px up, a bottom sheet below it.
  return (
    <Dialog open={cell !== null} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <ModalHeader icon={ReceiptText} title={t("collectionDetail.editorHost.title")} description={t("collectionDetail.editorHost.description")} />
        <ModalBody>{editor}</ModalBody>
      </DialogContent>
    </Dialog>
  );
}

// Add participants ---------------------------------------------------------------------------

function AddParticipantsDialog({ collection, open, onOpenChange }: { collection: Collection; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const { data, view } = useSnapshot();
  const { run } = useKelab();
  const voluntary = collection.type === "voluntary";
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState(collection.defaultAmount !== null ? senToInput(collection.defaultAmount) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  const included = new Set((view.participantsByCollection.get(collection.id) ?? []).map((row) => row.memberId));
  const candidates = data.members.filter((member) => member.active && !included.has(member.id)).sort((a, b) => a.name.localeCompare(b.name, "ms"));
  const visible = candidates.filter((member) => matchesQuery(member, query));
  const months = view.periodsByCollection.get(collection.id)?.length ?? 0;
  const pastMonths = (view.periodsByCollection.get(collection.id) ?? []).filter((period) => period.month < monthOf(view.today)).length;

  const reset = () => {
    setQuery("");
    setPicked(new Set());
    setAmount(collection.defaultAmount !== null ? senToInput(collection.defaultAmount) : "");
    setError(null);
    setAmountError(null);
  };

  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
    setError(null);
  };

  const submit = async () => {
    if (!picked.size) return setError(t("collectionDetail.addParticipants.pickOne"));
    let override: Sen | null = null;
    if (!voluntary) {
      const parsed = parseMoney(amount);
      if (parsed.error !== null) return setAmountError(parsed.error);
      if (parsed.sen === 0) return setAmountError(errorMessages.AMOUNT_ZERO);
      override = parsed.sen === collection.defaultAmount ? null : parsed.sen;
    }
    setBusy(true);
    setError(null);
    try {
      const ids = [...picked];
      await run((backend) =>
        backend.addParticipants(
          collection.id,
          ids.map((memberId) => ({ memberId, amountOverride: override, exempt: false, note: null })),
        ),
      );
      toast.success(t("collectionDetail.addParticipants.added", { count: ids.length, name: collection.name }));
      reset();
      onOpenChange(false);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent size="md">
        <ModalHeader
          icon={UserPlus}
          title={t("collectionDetail.addParticipants.title")}
          description={
            voluntary
              ? t("collectionDetail.addParticipants.descVoluntary")
              : isMonthly(collection)
                ? t("collectionDetail.addParticipants.descMonthly", { months })
                : t("collectionDetail.addParticipants.descOnce")
          }
        />
        <ModalBody>
          {candidates.length === 0 ? (
            <p className="rounded-[10px] bg-primary-tint px-3 py-4 text-center text-sm text-muted-foreground">{t("collectionDetail.addParticipants.allIncluded")}</p>
          ) : (
            <>
              {!voluntary && (
                <ModalField
                  label={isMonthly(collection) ? t("collectionDetail.addParticipants.amountMonthly") : t("collectionDetail.addParticipants.amountOnce")}
                  htmlFor="add-amount"
                  error={amountError}
                  helper={
                    isMonthly(collection) && pastMonths > 0 ? (
                      <span className="text-st-partial">
                        {t("collectionDetail.addParticipants.pastBefore", { count: pastMonths })}
                      </span>
                    ) : undefined
                  }
                >
                  <MoneyInput
                    id="add-amount"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setAmountError(null);
                    }}
                    invalid={Boolean(amountError)}
                  />
                </ModalField>
              )}
              <div className="grid gap-3">
                <SearchInput id="add-participant-search" value={query} onChange={setQuery} placeholder={t("collectionDetail.addParticipants.search")} className="sm:max-w-none" />
                <ul className="max-h-72 divide-y divide-border overflow-y-auto overscroll-contain rounded-[10px] border border-border">
                  {visible.length === 0 ? (
                    <li className="px-3 py-4 text-center text-sm text-muted-foreground">{t("collectionDetail.addParticipants.noMatch")}</li>
                  ) : (
                    visible.map((member) => (
                      <li key={member.id}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-primary-tint">
                          <Checkbox checked={picked.has(member.id)} onCheckedChange={(value) => toggle(member.id, value === true)} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium break-words">{member.name}</span>
                            <span className="block text-xs text-muted-foreground">{member.category ? categoryLabels[member.category] : t("collectionDetail.member.noCategory")}</span>
                          </span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </>
          )}
          {error && <ModalError>{error}</ModalError>}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {candidates.length === 0 ? t("collectionDetail.addParticipants.close") : t("collectionDetail.addParticipants.cancel")}
          </Button>
          {candidates.length > 0 && (
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner className="size-4" /> : <UserPlus />}
              {t("collectionDetail.addParticipants.submit", { count: picked.size || "" })}
            </Button>
          )}
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}

const isMonthly = (collection: Collection) => collection.type === "monthly";
