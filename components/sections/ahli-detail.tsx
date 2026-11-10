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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { messageFor } from "@/lib/errors";
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
        <PageHeader title="Ahli tidak dijumpai" back={{ href: "/ahli/", label: "Senarai ahli" }} />
        <EmptyState
          icon={UserRoundX}
          title="Ahli ini tiada dalam rekod"
          description="Pautan mungkin lama, atau data demo telah ditetapkan semula."
          action={
            <Button asChild>
              <Link href="/ahli/">Kembali ke senarai ahli</Link>
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
        back={{ href: "/ahli/", label: "Senarai ahli" }}
        title={
          <span className="inline-flex flex-wrap items-center gap-2.5">
            {member.name} <MemberStatus active={member.active} />
          </span>
        }
        description={[member.category ? categoryLabels[member.category] : null, member.phone, `Ahli sejak ${formatDay(member.joinedOn)}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Button variant={member.active ? "danger-outline" : "outline"} onClick={() => setToggling(true)}>
              {member.active ? <UserX /> : <UserCheck />}
              {member.active ? "Nyahaktifkan" : "Aktifkan semula"}
            </Button>
            <Button variant="brand" onClick={() => setEditing(true)}>
              <Pencil /> Edit profil
            </Button>
            <Button asChild>
              <Link href={`/bayaran/baru/?ahli=${member.id}`}>
                <ReceiptText /> Rekod bayaran
              </Link>
            </Button>
          </>
        }
      />

      {!member.active && (
        <p className="rounded-2xl border border-dashed border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
          Ahli ini <b className="text-foreground">tidak aktif</b>. Sejarah bayaran dan penyertaan kutipan dikekalkan; baki yang belum
          dijelaskan masih dikira dalam kutipan berkaitan.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Perlu bayar semasa" value={formatMoney(dueRequired)} icon={WalletCards} hint="Caj yang sudah tiba tempoh" />
        <StatCard label="Diterima" value={formatMoney(totals.received)} icon={BadgeCheck} tone="paid" hint="Wang yang disahkan sahaja" />
        <StatCard
          label="Baki semasa"
          value={formatMoney(totals.dueNow)}
          icon={CircleDollarSign}
          tone={totals.dueNow > 0 ? "unpaid" : "paid"}
          hint={
            totals.upcoming > 0
              ? `Akan datang ${formatMoney(totals.upcoming)}`
              : totals.counts.overdue > 0
                ? `${totals.counts.overdue} caj lewat`
                : "Tiada baki akan datang"
          }
        />
        <StatCard
          label="Menunggu semakan"
          value={formatMoney(totals.pending)}
          icon={Hourglass}
          tone="pending"
          hint={totals.pending > 0 ? "Belum dikira sebagai diterima" : "Tiada bayaran tertunda"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
        <SectionCard
          title="Profil"
          action={
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          }
        >
          <DetailList
            items={[
              { label: "Nama", value: member.name },
              { label: "Kategori", value: member.category ? categoryLabels[member.category] : null },
              {
                label: "Telefon",
                value: member.phone && (
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="tabular-nums">{member.phone}</span>
                    {wa && (
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary-strong hover:underline">
                        WhatsApp
                      </a>
                    )}
                  </span>
                ),
              },
              { label: "Catatan", value: member.notes },
              { label: "Status", value: <MemberStatus active={member.active} /> },
              { label: "Ahli sejak", value: formatDay(member.joinedOn) },
              { label: "Dikemas kini", value: formatDateTime(member.updatedAt) },
            ]}
          />
        </SectionCard>

        <div className="grid min-w-0 gap-5">
          <Participation member={member} />
          <SectionCard
            title="Sejarah bayaran"
            icon={ReceiptText}
            description="Semua transaksi ahli ini, terbaru dahulu. Bayaran yang dibatalkan kekal dengan sebabnya."
          >
            <PaymentList payments={payments} empty="Belum ada bayaran untuk ahli ini." />
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
  const { data, view } = useSnapshot();
  const isMobile = useIsMobile();
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
    if (dirty && !window.confirm("Buang perubahan yang belum disimpan?")) return;
    setOpen(null);
    setDirty(false);
  };
  const done = () => {
    setOpen(null);
    setDirty(false);
  };

  return (
    <SectionCard
      title="Penyertaan kutipan"
      icon={WalletCards}
      description="Klik caj untuk rekod bayaran, ubah amaun atau lihat sejarah."
    >
      {collections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Ahli ini belum disertakan dalam mana-mana kutipan. Sertakan dari halaman kutipan atau Matriks.
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {collections.map((collection) => (
            <CollectionItem key={collection.id} collection={collection} member={member} onOpen={setOpen} />
          ))}
        </ul>
      )}

      {isMobile ? (
        <Sheet open={current !== null} onOpenChange={close}>
          <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-3xl px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-border" aria-hidden />
            <SheetHeader className="sr-only">
              <SheetTitle>Caj ahli</SheetTitle>
              <SheetDescription>Rekod bayaran, ubah amaun atau lihat sejarah</SheetDescription>
            </SheetHeader>
            {current && <CellEditor cell={current} onDone={done} onDirtyChange={setDirty} />}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={current !== null} onOpenChange={close}>
          <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
            <DialogHeader className="sr-only">
              <DialogTitle>Caj ahli</DialogTitle>
              <DialogDescription>Rekod bayaran, ubah amaun atau lihat sejarah</DialogDescription>
            </DialogHeader>
            {current && <CellEditor cell={current} onDone={done} onDirtyChange={setDirty} />}
          </DialogContent>
        </Dialog>
      )}
    </SectionCard>
  );
}

function CollectionItem({ collection, member, onOpen }: { collection: Collection; member: Member; onOpen: (cell: MatrixCell) => void }) {
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
            Sumbangan disahkan <Money sen={cell.received} className="font-semibold text-foreground" />
            {cell.count > 0 && ` · ${cell.count} transaksi`}
            <span className="block">Tiada amaun wajib; tidak mencipta hutang.</span>
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
            {ledger.charge.dueDate && <span className="text-xs text-muted-foreground">Tarikh akhir {formatDay(ledger.charge.dueDate)}</span>}
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
            {totals.counts.paid}/{chargeCells.length} bulan dibayar
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
  return (
    <dl className="grid grid-cols-3 gap-2 text-xs">
      <div className="min-w-0">
        <dt className="text-muted-foreground">Perlu bayar</dt>
        <dd className="truncate font-semibold tabular-nums">{required === null ? "Dikecualikan" : formatMoney(required)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground">Diterima</dt>
        <dd className="truncate font-semibold text-st-paid tabular-nums">{formatMoney(paid)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground">{upcoming !== undefined ? "Baki semasa" : "Baki"}</dt>
        <dd className={cn("truncate font-semibold tabular-nums", remaining > 0 ? "text-st-unpaid" : "text-foreground")}>{formatMoney(remaining)}</dd>
      </div>
      {(pending > 0 || (upcoming ?? 0) > 0) && (
        <p className="col-span-3 text-[11px] text-muted-foreground">
          {pending > 0 && <>Menunggu semakan {formatMoney(pending)}. </>}
          {(upcoming ?? 0) > 0 && <>Akan datang {formatMoney(upcoming ?? 0)}.</>}
        </p>
      )}
    </dl>
  );
}

// Dialogs ---------------------------------------------------------------------------------

function EditMemberDialog({ member, open, onOpenChange }: { member: Member; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
        {/* Remount the form each time it opens so it starts from the stored values. */}
        {open && <EditMemberForm member={member} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditMemberForm({ member, onClose }: { member: Member; onClose: () => void }) {
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
    if (!name.trim()) return setError("Nama diperlukan.");
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
      toast.success("Maklumat ahli dikemas kini.");
      onClose();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Edit profil ahli</DialogTitle>
        <DialogDescription>Perubahan direkod dalam log audit. Rekod bayaran tidak terjejas.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-name">Nama penuh</Label>
        <Input id="edit-name" value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-xl" aria-invalid={Boolean(clash) || undefined} />
        {clash && (
          <p className="flex items-start gap-1.5 text-xs text-st-partial">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Sama dengan ahli lain &quot;{clash.name}&quot;. Nama ahli mesti berbeza; tambah inisial atau nama penuh untuk membezakan.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label>Kategori</Label>
        <SegmentedChoice<MemberCategory | "">
          label="Kategori"
          optional
          value={category ?? ""}
          onChange={(value) => setCategory(value || null)}
          options={(Object.keys(categoryLabels) as MemberCategory[]).map((value) => ({ value, label: categoryLabels[value] }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-phone">No. telefon (pilihan)</Label>
        <Input id="edit-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="012-345 6789" className="h-11 rounded-xl" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-notes">Catatan (pilihan)</Label>
        <Textarea id="edit-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="cth. Bertukar ke sekolah lain pada Jun" />
      </div>
      {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner className="size-4" />}
          Simpan perubahan
        </Button>
      </DialogFooter>
    </form>
  );
}

function ActiveDialog({ member, open, onOpenChange }: { member: Member; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { run } = useKelab();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = !member.active;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.setMemberActive(member.id, next));
      toast.success(next ? `${member.name} diaktifkan semula.` : `${member.name} dinyahaktifkan. Rekod bayaran dikekalkan.`);
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
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{next ? `Aktifkan semula ${member.name}?` : `Nyahaktifkan ${member.name}?`}</DialogTitle>
          <DialogDescription>
            {next
              ? "Ahli akan dipaparkan semula dalam senarai harian dan Matriks."
              : "Gunakan ini untuk ahli yang bertukar atau bersara. Tiada apa-apa dipadam."}
          </DialogDescription>
        </DialogHeader>
        {!next && (
          <ul className="grid gap-1.5 rounded-xl bg-primary-tint px-3 py-2.5 text-xs text-foreground/80">
            <li>• Sejarah bayaran dikekalkan sepenuhnya.</li>
            <li>• Ahli kekal dalam rekod kutipan sedia ada; baki yang belum dijelaskan masih dikira.</li>
            <li>• Ahli disembunyikan daripada Matriks secara lalai dan boleh diaktifkan semula bila-bila masa.</li>
          </ul>
        )}
        {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button onClick={() => void confirm()} disabled={busy}>
            {busy && <Spinner className="size-4" />}
            {next ? "Aktifkan semula" : "Nyahaktifkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
