"use client";

import { SegmentedChoice } from "@/components/choice";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { CellEditor } from "@/components/matrix/cell-editor";
import { MonthTile } from "@/components/matrix/month-tile";
import { PaymentList } from "@/components/payments";
import { MemberStatus } from "@/components/sections/ahli";
import {
  ChargeStatusChips,
  DetailList,
  EmptyState,
  LabelChip,
  Money,
  PageHeader,
  PageShell,
  SectionCard,
  StatCard,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ModalBody, ModalError, ModalField, ModalFooter, ModalHeader, ModalSection, modalFormClass } from "@/components/modal";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/errors";
import { useT } from "@/lib/i18n/react";
import { formatDateTime, formatDay, formatMoney, formatMoneyShort, formatMonth, waNumber } from "@/lib/format";
import { categoryLabels, cellStatusLabels, collectionStatusLabels, collectionTypeLabels, overdueLabel, pendingLabel } from "@/lib/labels";
import { sum } from "@/lib/money/amount";
import { totalsOf } from "@/lib/money/ledger";
import { normaliseName } from "@/lib/names";
import type { Collection, Member, MemberCategory } from "@/lib/types";
import { sortCollections, type MatrixCell } from "@/lib/view";
import { cn } from "@/lib/utils";
import {
  BadgeCheck,
  ChevronRight,
  CircleDollarSign,
  Hourglass,
  Pencil,
  ReceiptText,
  TriangleAlert,
  UserCheck,
  UserPen,
  UserRoundX,
  UserX,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

// One member: profile, current balances from the read model, every collection they are in
// (each charge opens the same editor as the matrix), and their full payment history.

export function AhliDetail({ id }: { id: string }) {
  const t = useT();
  const { data, view } = useSnapshot();
  const member = view.membersById.get(id);
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const payments = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.memberId === id)
        .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.localeCompare(a.createdAt)),
    [data.payments, id],
  );

  if (!member)
    return (
      <PageShell>
        <PageHeader title={t("memberDetail.notFound.title")} back={{ href: "/ahli/", label: t("memberDetail.backToList") }} />
        <EmptyState
          icon={UserRoundX}
          title={t("memberDetail.notFound.emptyTitle")}
          description={t("memberDetail.notFound.emptyDescription")}
          action={
            <Button asChild>
              <Link href="/ahli/">{t("memberDetail.notFound.back")}</Link>
            </Button>
          }
        />
      </PageShell>
    );

  const totals = view.memberTotals(id);
  const ledgers = view.memberLedgers(id);
  const dueRequired = sum(ledgers.filter((ledger) => !ledger.future).map((ledger) => ledger.required));
  const wa = waNumber(member.phone);

  return (
    <PageShell>
      <PageHeader
        back={{ href: "/ahli/", label: t("memberDetail.backToList") }}
        title={
          <span className="inline-flex flex-wrap items-center gap-2.5">
            {member.name} <MemberStatus active={member.active} />
          </span>
        }
        description={[member.category ? categoryLabels[member.category] : null, member.phone, t("memberDetail.since", { date: formatDay(member.joinedOn) })]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Button variant="brand" onClick={() => setEditing(true)}>
              <Pencil /> {t("memberDetail.editProfile")}
            </Button>
            <Button asChild>
              <Link href={`/bayaran/baru/?ahli=${member.id}`}>
                <ReceiptText /> {t("memberDetail.recordPayment")}
              </Link>
            </Button>
          </>
        }
        more={
          <DropdownMenuItem variant={member.active ? "destructive" : "default"} onSelect={() => setToggling(true)}>
            {member.active ? <UserX /> : <UserCheck />}
            {member.active ? t("memberDetail.deactivate") : t("memberDetail.reactivate")}
          </DropdownMenuItem>
        }
      />

      {!member.active && (
        <p className="rounded-2xl border border-dashed border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
          {t("memberDetail.inactiveNote.before")}
          <b className="text-foreground">{t("memberDetail.inactiveNote.bold")}</b>
          {t("memberDetail.inactiveNote.after")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("memberDetail.stats.required")} value={formatMoney(dueRequired)} icon={WalletCards} hint={t("memberDetail.stats.requiredHint")} />
        <StatCard label={t("memberDetail.stats.received")} value={formatMoney(totals.received)} icon={BadgeCheck} tone="paid" hint={t("memberDetail.stats.receivedHint")} />
        <StatCard
          label={t("memberDetail.stats.balance")}
          value={formatMoney(totals.dueNow)}
          icon={CircleDollarSign}
          tone={totals.dueNow > 0 ? "unpaid" : "paid"}
          hint={
            totals.upcoming > 0
              ? t("memberDetail.stats.upcomingHint", { amount: formatMoney(totals.upcoming) })
              : totals.counts.overdue > 0
                ? t("memberDetail.stats.overdueHint", { count: totals.counts.overdue })
                : t("memberDetail.stats.noUpcomingHint")
          }
        />
        <StatCard
          label={t("memberDetail.stats.pending")}
          value={formatMoney(totals.pending)}
          icon={Hourglass}
          tone="pending"
          hint={totals.pending > 0 ? t("memberDetail.stats.pendingHint") : t("memberDetail.stats.noPendingHint")}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
        <SectionCard
          title={t("memberDetail.profile.title")}
          action={
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> {t("memberDetail.profile.edit")}
            </Button>
          }
        >
          <DetailList
            items={[
              { label: t("memberDetail.profile.name"), value: member.name },
              { label: t("memberDetail.profile.category"), value: member.category ? categoryLabels[member.category] : null },
              {
                label: t("memberDetail.profile.phone"),
                value: member.phone && (
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="tabular-nums">{member.phone}</span>
                    {wa && (
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary-strong hover:underline">
                        {t("memberDetail.profile.whatsapp")}
                      </a>
                    )}
                  </span>
                ),
              },
              { label: t("memberDetail.profile.notes"), value: member.notes },
              { label: t("memberDetail.profile.status"), value: <MemberStatus active={member.active} /> },
              { label: t("memberDetail.profile.since"), value: formatDay(member.joinedOn) },
              { label: t("memberDetail.profile.updated"), value: formatDateTime(member.updatedAt) },
            ]}
          />
        </SectionCard>

        <div className="grid min-w-0 gap-5">
          <Participation member={member} />
          <SectionCard
            title={t("memberDetail.history.title")}
            icon={ReceiptText}
            description={t("memberDetail.history.description")}
          >
            <PaymentList payments={payments} empty={t("memberDetail.history.empty")} />
          </SectionCard>
        </div>
      </div>

      <EditMemberDialog member={member} open={editing} onOpenChange={setEditing} />
      <ActiveDialog member={member} open={toggling} onOpenChange={setToggling} />
    </PageShell>
  );
}

// Participation ---------------------------------------------------------------------------

function Participation({ member }: { member: Member }) {
  const t = useT();
  const { data, view } = useSnapshot();
  const [open, setOpen] = useState<MatrixCell | null>(null);
  const [dirty, setDirty] = useState(false);

  const collections = useMemo(() => {
    const ids = new Set(data.participants.filter((row) => row.memberId === member.id).map((row) => row.collectionId));
    return sortCollections(data.collections.filter((collection) => ids.has(collection.id)));
  }, [data.participants, data.collections, member.id]);

  // Re-read the cell after every reload so the editor shows fresh figures.
  const current = open ? view.cell(member, open.column) : null;

  const close = (next: boolean) => {
    if (next) return;
    if (dirty && !window.confirm(t("memberDetail.discardChanges"))) return;
    setOpen(null);
    setDirty(false);
  };
  const done = () => {
    setOpen(null);
    setDirty(false);
  };

  return (
    <SectionCard
      title={t("memberDetail.participation.title")}
      icon={WalletCards}
      description={t("memberDetail.participation.description")}
    >
      {collections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("memberDetail.participation.none")}
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {collections.map((collection) => (
            <CollectionItem key={collection.id} collection={collection} member={member} onOpen={setOpen} />
          ))}
        </ul>
      )}

      {/* One Dialog: a centred card from 640px up, a bottom sheet below it. */}
      <Dialog open={current !== null} onOpenChange={close}>
        <DialogContent size="md">
          <ModalHeader icon={WalletCards} title={t("memberDetail.dialogs.chargeTitle")} description={t("memberDetail.dialogs.chargeDescription")} />
          <ModalBody>{current && <CellEditor cell={current} onDone={done} onDirtyChange={setDirty} />}</ModalBody>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function CollectionItem({ collection, member, onOpen }: { collection: Collection; member: Member; onOpen: (cell: MatrixCell) => void }) {
  const t = useT();
  const { view } = useSnapshot();
  const columns = view.columns([collection]);
  const cells = columns.map((column) => view.cell(member, column));
  const statusEntry = collectionStatusLabels[collection.status];

  const header = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link href={`/kutipan/${collection.id}/`} className="min-w-0 text-[14px] font-semibold break-words hover:text-primary-strong hover:underline">
        {collection.name}
      </Link>
      <span className="text-xs text-muted-foreground">{collectionTypeLabels[collection.type]}</span>
      {collection.status !== "active" && <LabelChip entry={statusEntry} compact />}
    </div>
  );

  if (collection.type === "voluntary") {
    const cell = cells[0];
    if (!cell || cell.kind !== "voluntary") return null;
    return (
      <li className="grid gap-2 rounded-xl border border-border bg-card p-3">
        {header}
        <button
          type="button"
          onClick={() => onOpen(cell)}
          className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-primary-tint/60 px-3 py-2 text-left transition-colors hover:bg-primary-tint"
        >
          <span className="min-w-0 text-xs text-muted-foreground">
            {t("memberDetail.participation.confirmedGifts")} <Money sen={cell.received} className="font-semibold text-foreground" />
            {cell.count > 0 && ` · ${t("memberDetail.participation.transactions", { count: cell.count })}`}
            <span className="block">{t("memberDetail.participation.noRequired")}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {cell.pending > 0 && <LabelChip entry={pendingLabel} compact />}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </span>
        </button>
      </li>
    );
  }

  const chargeCells = cells.filter((cell): cell is Extract<MatrixCell, { kind: "charge" }> => cell.kind === "charge");
  const totals = totalsOf(chargeCells.map((cell) => cell.ledger));

  if (collection.type === "one_off") {
    const cell = chargeCells[0];
    if (!cell) return null;
    const { ledger } = cell;
    return (
      <li className="grid gap-2 rounded-xl border border-border bg-card p-3">
        {header}
        <button
          type="button"
          onClick={() => onOpen(cell)}
          className="grid gap-2 rounded-xl bg-primary-tint/60 px-3 py-2.5 text-left transition-colors hover:bg-primary-tint"
        >
          <span className="flex flex-wrap items-center justify-between gap-2">
            <ChargeStatusChips status={cell.status} overdue={ledger.overdue} pending={ledger.pending > 0} compact />
            {ledger.charge.dueDate && <span className="text-xs text-muted-foreground">{t("memberDetail.participation.dueDate", { date: formatDay(ledger.charge.dueDate) })}</span>}
          </span>
          <Figures required={ledger.charge.exempt ? null : ledger.required} paid={ledger.confirmed} remaining={ledger.remaining} pending={ledger.pending} />
        </button>
      </li>
    );
  }

  // Monthly: totals for the whole period plus one tile per month.
  return (
    <li className="grid gap-2.5 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {header}
        <span className="flex flex-wrap gap-1">
          <span className="inline-flex h-5 items-center rounded-full bg-st-paid-bg px-2 text-[11px] font-medium text-st-paid tabular-nums">
            {t("memberDetail.participation.monthsPaid", { paid: totals.counts.paid, total: chargeCells.length })}
          </span>
          {totals.counts.overdue > 0 && <LabelChip entry={[`${overdueLabel[0]} · ${totals.counts.overdue}`, overdueLabel[1]]} compact />}
          {totals.counts.pendingReview > 0 && <LabelChip entry={pendingLabel} compact />}
        </span>
      </div>
      <Figures required={totals.expected} paid={totals.received} remaining={totals.dueNow} pending={totals.pending} upcoming={totals.upcoming} />
      <div className="grid grid-cols-4 gap-1 min-[380px]:grid-cols-6 md:grid-cols-12">
        {cells.map((cell) => (
          <MonthTile key={cell.column.key} cell={cell} onOpen={() => onOpen(cell)} />
        ))}
      </div>
    </li>
  );
}

function Figures({
  required,
  paid,
  remaining,
  pending,
  upcoming,
}: {
  required: number | null;
  paid: number;
  remaining: number;
  pending: number;
  upcoming?: number;
}) {
  const t = useT();
  return (
    <dl className="grid grid-cols-3 gap-2 text-xs">
      <div className="min-w-0">
        <dt className="text-muted-foreground">{t("memberDetail.figures.required")}</dt>
        <dd className="truncate font-semibold tabular-nums">{required === null ? t("memberDetail.figures.exempt") : formatMoney(required)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground">{t("memberDetail.figures.received")}</dt>
        <dd className="truncate font-semibold text-st-paid tabular-nums">{formatMoney(paid)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground">{upcoming !== undefined ? t("memberDetail.figures.balanceCurrent") : t("memberDetail.figures.balance")}</dt>
        <dd className={cn("truncate font-semibold tabular-nums", remaining > 0 ? "text-st-unpaid" : "text-foreground")}>{formatMoney(remaining)}</dd>
      </div>
      {(pending > 0 || (upcoming ?? 0) > 0) && (
        <p className="col-span-3 text-[11px] text-muted-foreground">
          {pending > 0 && <>{t("memberDetail.figures.pending", { amount: formatMoney(pending) })} </>}
          {(upcoming ?? 0) > 0 && <>{t("memberDetail.figures.upcoming", { amount: formatMoney(upcoming ?? 0) })}</>}
        </p>
      )}
    </dl>
  );
}

// Dialogs ---------------------------------------------------------------------------------

function EditMemberDialog({ member, open, onOpenChange }: { member: Member; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {/* Remount the form each time it opens so it starts from the stored values. */}
        {open && <EditMemberForm member={member} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditMemberForm({ member, onClose }: { member: Member; onClose: () => void }) {
  const t = useT();
  const { data } = useSnapshot();
  const { run } = useKelab();
  const [name, setName] = useState(member.name);
  const [category, setCategory] = useState<MemberCategory | null>(member.category);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [notes, setNotes] = useState(member.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clash = name.trim()
    ? data.members.find((row) => row.id !== member.id && normaliseName(row.name) === normaliseName(name))
    : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(t("memberDetail.dialogs.edit.nameRequired"));
    const changes = {
      ...(name.trim() !== member.name ? { name } : {}),
      ...(category !== member.category ? { category } : {}),
      ...((phone.trim() || null) !== member.phone ? { phone: phone.trim() || null } : {}),
      ...((notes.trim() || null) !== member.notes ? { notes: notes.trim() || null } : {}),
    };
    if (!Object.keys(changes).length) return onClose();
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.updateMember(member.id, changes));
      toast.success(t("memberDetail.dialogs.edit.saved"));
      onClose();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={modalFormClass} noValidate>
      <ModalHeader icon={UserPen} title={t("memberDetail.dialogs.edit.title")} description={t("memberDetail.dialogs.edit.description")} />
      <ModalBody>
        <ModalSection label={t("memberDetail.dialogs.edit.sectionInfo")}>
          <ModalField
            label={t("memberDetail.dialogs.edit.fullName")}
            htmlFor="edit-name"
            helper={
              clash && (
                <span className="flex items-start gap-1.5 text-st-partial">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  {t("memberDetail.dialogs.edit.nameClash", { name: clash.name })}
                </span>
              )
            }
          >
            <Input id="edit-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(clash) || undefined} />
          </ModalField>
          <ModalField label={t("memberDetail.profile.category")} labelId="edit-category-label">
            <SegmentedChoice<MemberCategory | "">
              joined
              label={t("memberDetail.profile.category")}
              optional
              value={category ?? ""}
              onChange={(value) => setCategory(value || null)}
              options={(Object.keys(categoryLabels) as MemberCategory[]).map((value) => ({ value, label: categoryLabels[value] }))}
            />
          </ModalField>
        </ModalSection>
        <ModalSection label={t("memberDetail.dialogs.edit.sectionContact")} divided>
          <ModalField label={t("memberDetail.dialogs.edit.phoneOptional")} htmlFor="edit-phone">
            <Input id="edit-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="012-345 6789" />
          </ModalField>
          <ModalField label={t("memberDetail.dialogs.edit.notesOptional")} htmlFor="edit-notes">
            <Textarea id="edit-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("memberDetail.dialogs.edit.notesPlaceholder")} />
          </ModalField>
        </ModalSection>
        {error && <ModalError>{error}</ModalError>}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner className="size-4" />}
          {t("memberDetail.dialogs.edit.submit")}
        </Button>
      </ModalFooter>
    </form>
  );
}

function ActiveDialog({ member, open, onOpenChange }: { member: Member; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const { run } = useKelab();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = !member.active;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.setMemberActive(member.id, next));
      toast.success(t(next ? "memberDetail.dialogs.active.activatedToast" : "memberDetail.dialogs.active.deactivatedToast", { name: member.name }));
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
      onOpenChange={(value) => {
        if (busy) return;
        setError(null);
        onOpenChange(value);
      }}
    >
      <DialogContent size="sm">
        <ModalHeader
          icon={next ? UserCheck : UserX}
          tone={next ? "brand" : "danger"}
          title={t(next ? "memberDetail.dialogs.active.activateTitle" : "memberDetail.dialogs.active.deactivateTitle", { name: member.name })}
          description={t(next ? "memberDetail.dialogs.active.activateDescription" : "memberDetail.dialogs.active.deactivateDescription")}
        />
        {(!next || error) && (
          <ModalBody>
            {!next && (
              <ul className="grid gap-1.5 rounded-[10px] bg-primary-tint px-3 py-2.5 text-xs text-foreground/80">
                <li>• {t("memberDetail.dialogs.active.point1")}</li>
                <li>• {t("memberDetail.dialogs.active.point2")}</li>
                <li>• {t("memberDetail.dialogs.active.point3")}</li>
              </ul>
            )}
            {error && <ModalError>{error}</ModalError>}
          </ModalBody>
        )}
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant={next ? "default" : "danger"} onClick={() => void confirm()} disabled={busy}>
            {busy && <Spinner className="size-4" />}
            {t(next ? "memberDetail.dialogs.active.activate" : "memberDetail.dialogs.active.deactivate")}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
