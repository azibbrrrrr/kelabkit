"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import { MoneyInput, parseMoney } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { messageFor } from "@/lib/errors";
import { formatMoney, today } from "@/lib/format";
import { collectionTypeLabels } from "@/lib/labels";
import { monthsBetween } from "@/lib/money/months";
import type { CollectionType, Sen } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

/**
 * The matrix's "add column": a short form for the common case of every active member at
 * the same amount. Anything more specific (selected members, overrides, exemptions) goes
 * through the full Tambah Kutipan wizard.
 */
export function AddCollectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (collectionId: string) => void;
}) {
  const { data } = useSnapshot();
  const { run } = useKelab();
  const year = today().slice(0, 4);
  const [name, setName] = useState("");
  const [type, setType] = useState<CollectionType>("one_off");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startMonth, setStartMonth] = useState(`${year}-01`);
  const [endMonth, setEndMonth] = useState(`${year}-12`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = data.members.filter((member) => member.active);
  const parsed = amount.trim() ? parseMoney(amount) : null;
  const months = type === "monthly" ? monthsBetween(startMonth, endMonth).length : 1;
  const total = parsed?.sen ? parsed.sen * members.length * months : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Nama kutipan diperlukan.");
    let defaultAmount: Sen | null = null;
    if (type !== "voluntary") {
      const result = parseMoney(amount);
      if (result.error !== null) return setError(result.error);
      if (result.sen === 0) return setError("Amaun mesti lebih daripada RM0.");
      defaultAmount = result.sen;
    }
    if (type === "monthly" && endMonth < startMonth) return setError("Bulan akhir tidak boleh lebih awal daripada bulan mula.");
    setBusy(true);
    setError(null);
    try {
      const id = await run((backend) =>
        backend.createCollection({
          name,
          type,
          defaultAmount,
          description: null,
          notes: null,
          dueDate: type === "one_off" && dueDate ? dueDate : null,
          startMonth: type === "monthly" ? startMonth : null,
          endMonth: type === "monthly" ? endMonth : null,
          dueDay: type === "monthly" ? 10 : null,
          participants: members.map((member) => ({ memberId: member.id, amountOverride: null, exempt: false, note: null })),
          activate: true,
        }),
      );
      toast.success(`Kutipan "${name.trim()}" ditambah untuk ${members.length} ahli.`);
      setName("");
      setAmount("");
      setDueDate("");
      onOpenChange(false);
      onCreated?.(id);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Tambah kutipan (lajur baharu)</DialogTitle>
            <DialogDescription>
              Untuk semua {members.length} ahli aktif pada amaun yang sama. Perlu pilih ahli tertentu atau amaun berbeza?{" "}
              <Link href="/kutipan/baru/" className="font-medium text-primary-strong underline-offset-2 hover:underline">
                Guna wizard penuh
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="col-name">Nama kutipan</Label>
            <Input id="col-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="cth. Jamuan Akhir Tahun" className="h-11 rounded-xl" />
          </div>
          <div className="grid gap-1.5">
            <Label>Jenis</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(collectionTypeLabels) as CollectionType[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                  className={cn(
                    "min-h-11 rounded-xl border px-2 text-xs leading-tight font-medium",
                    type === value ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-muted-foreground",
                  )}
                >
                  {collectionTypeLabels[value]}
                </button>
              ))}
            </div>
          </div>
          {type !== "voluntary" && (
            <div className="grid gap-1.5">
              <Label htmlFor="col-amount">{type === "monthly" ? "Amaun sebulan" : "Amaun seorang"}</Label>
              <MoneyInput id="col-amount" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25.00" invalid={Boolean(parsed?.error)} />
              {parsed?.error && <p className="text-xs text-st-unpaid">{parsed.error}</p>}
            </div>
          )}
          {type === "one_off" && (
            <div className="grid gap-1.5">
              <Label htmlFor="col-due">Tarikh akhir (pilihan)</Label>
              <input
                id="col-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="h-11 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20"
              />
              <p className="text-xs text-muted-foreground">Tanpa tarikh akhir, caj tidak akan menjadi Lewat.</p>
            </div>
          )}
          {type === "monthly" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="col-start">Bulan mula</Label>
                <input id="col-start" type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} className="h-11 rounded-xl border border-input bg-card px-3 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="col-end">Bulan akhir</Label>
                <input id="col-end" type="month" value={endMonth} min={startMonth} onChange={(event) => setEndMonth(event.target.value)} className="h-11 rounded-xl border border-input bg-card px-3 text-sm" />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">Setiap bulan menjadi lajur sendiri, perlu dibayar sebelum 10hb.</p>
            </div>
          )}
          {total !== null && (
            <p className="rounded-xl bg-primary-tint px-3 py-2 text-sm">
              Jangkaan kutipan: <b className="tabular-nums">{formatMoney(total)}</b>
              <span className="text-muted-foreground">
                {" "}
                ({members.length} ahli{type === "monthly" ? ` × ${months} bulan` : ""})
              </span>
            </p>
          )}
          {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner className="size-4" />}
              Tambah lajur
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
