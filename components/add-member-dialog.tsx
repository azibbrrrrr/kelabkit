"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { normaliseName } from "@/lib/names";
import { messageFor } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { categoryLabels } from "@/lib/labels";
import type { MemberCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

/**
 * Adds one member. A new member joins no collection unless the treasurer ticks it here:
 * adding a teacher must never silently create debts in every existing collection.
 */
export function AddMemberDialog({
  open,
  onOpenChange,
  onAdded,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened without a Trigger: lets the caller return focus to whatever opened it. */
  onCloseAutoFocus?: (event: Event) => void;
  onAdded?: (memberId: string) => void;
}) {
  const { data } = useSnapshot();
  const { run } = useKelab();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MemberCategory | null>("guru");
  const [phone, setPhone] = useState("");
  const [join, setJoin] = useState<string[]>([]);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = data.collections.filter((collection) => collection.status === "active");
  const similar = name.trim() ? data.members.find((member) => normaliseName(member.name) === normaliseName(name)) : undefined;

  const reset = () => {
    setName("");
    setPhone("");
    setJoin([]);
    setAllowDuplicate(false);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Nama diperlukan.");
    if (similar && !allowDuplicate) return setError("Nama ini sama dengan ahli sedia ada. Tandakan kotak di bawah jika memang orang berbeza.");
    setBusy(true);
    setError(null);
    try {
      const [id] = await run(async (backend) => {
        const ids = await backend.addMembers([{ name, category, phone: phone || null, notes: null, allowDuplicate }]);
        for (const collectionId of join) {
          await backend.addParticipants(collectionId, [{ memberId: ids[0], amountOverride: null, exempt: false, note: null }]);
        }
        return ids;
      });
      toast.success(`${name.trim()} ditambah${join.length ? ` ke ${join.length} kutipan` : ""}.`);
      reset();
      onOpenChange(false);
      onAdded?.(id);
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
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Tambah ahli</DialogTitle>
            <DialogDescription>Hanya nama diperlukan. Tiada No. KP atau maklumat peribadi lain.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="member-name">Nama penuh</Label>
            <Input id="member-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="cth. Cikgu Nurul Ain" className="h-11 rounded-xl" />
            {similar && (
              <p className="flex items-start gap-1.5 text-xs text-st-partial">
                <TriangleAlert className="mt-px size-3.5 shrink-0" /> Mungkin sama dengan &quot;{similar.name}&quot;.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>Kategori (pilihan)</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(categoryLabels) as MemberCategory[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(category === value ? null : value)}
                  aria-pressed={category === value}
                  className={cn(
                    "min-h-10 rounded-xl border text-xs font-medium",
                    category === value ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-muted-foreground",
                  )}
                >
                  {categoryLabels[value]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="member-phone">No. telefon (pilihan)</Label>
            <Input id="member-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="012-345 6789" className="h-11 rounded-xl" />
            <p className="text-xs text-muted-foreground">Untuk butang WhatsApp dalam Peringatan.</p>
          </div>
          {active.length > 0 && (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Sertakan dalam kutipan aktif?</legend>
              <p className="-mt-1 mb-1 text-xs text-muted-foreground">Tidak ditanda secara lalai. Ahli baharu hanya dicaj untuk kutipan yang anda pilih.</p>
              {active.map((collection) => (
                <label key={collection.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 py-2">
                  <Checkbox
                    checked={join.includes(collection.id)}
                    onCheckedChange={(value) =>
                      setJoin((current) => (value === true ? [...current, collection.id] : current.filter((id) => id !== collection.id)))
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{collection.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {collection.defaultAmount !== null ? formatMoney(collection.defaultAmount) : "Sukarela"}
                    {collection.type === "monthly" && "/bln"}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {similar && (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={allowDuplicate} onCheckedChange={(value) => setAllowDuplicate(value === true)} />
              Ini orang berbeza; simpan juga.
            </label>
          )}
          {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner className="size-4" />}
              Simpan ahli
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
