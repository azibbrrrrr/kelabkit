"use client";

import { SegmentedChoice } from "@/components/choice";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ModalBody, ModalCheckList, ModalCheckRow, ModalError, ModalField, ModalFooter, ModalHeader, ModalSection, modalFormClass } from "@/components/modal";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { normaliseName } from "@/lib/names";
import { messageFor } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { categoryLabels } from "@/lib/labels";
import type { MemberCategory } from "@/lib/types";
import { TriangleAlert, UserPlus } from "lucide-react";
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
      <DialogContent size="md" onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={submit} className={modalFormClass} noValidate>
          <ModalHeader icon={UserPlus} title="Tambah ahli" description="Hanya nama diperlukan. Tiada No. KP atau maklumat peribadi lain." />
          <ModalBody>
            <ModalSection label="Maklumat ahli">
              <ModalField
                label="Nama penuh"
                htmlFor="member-name"
                helper={
                  similar && (
                    <span className="flex items-start gap-1.5 text-st-partial">
                      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> Mungkin sama dengan &quot;{similar.name}&quot;.
                    </span>
                  )
                }
              >
                <Input id="member-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="cth. Cikgu Nurul Ain" />
              </ModalField>
              {similar && (
                <label className="flex items-center gap-2 text-[13px]">
                  <Checkbox checked={allowDuplicate} onCheckedChange={(value) => setAllowDuplicate(value === true)} />
                  Ini orang berbeza; simpan juga.
                </label>
              )}
              <ModalField label="Kategori (pilihan)" labelId="member-category-label">
                <SegmentedChoice<MemberCategory | "">
                  joined
                  label="Kategori (pilihan)"
                  optional
                  value={category ?? ""}
                  onChange={(value) => setCategory(value || null)}
                  options={(Object.keys(categoryLabels) as MemberCategory[]).map((value) => ({ value, label: categoryLabels[value] }))}
                />
              </ModalField>
              <ModalField label="No. telefon (pilihan)" htmlFor="member-phone" helper="Untuk butang WhatsApp dalam Peringatan.">
                <Input id="member-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="012-345 6789" />
              </ModalField>
            </ModalSection>
            {active.length > 0 && (
              <ModalSection divided>
                <ModalField label="Sertakan dalam kutipan aktif?" labelId="member-join-label">
                  <p className="-mt-0.5 text-xs leading-4 text-muted-foreground">Tidak ditanda secara lalai. Ahli baharu hanya dicaj untuk kutipan yang anda pilih.</p>
                  <ModalCheckList label="Sertakan dalam kutipan aktif?">
                    {active.map((collection) => (
                      <ModalCheckRow
                        key={collection.id}
                        checked={join.includes(collection.id)}
                        onCheckedChange={(value) => setJoin((current) => (value ? [...current, collection.id] : current.filter((id) => id !== collection.id)))}
                        label={collection.name}
                        trailing={
                          <>
                            {collection.defaultAmount !== null ? formatMoney(collection.defaultAmount) : "Sukarela"}
                            {collection.type === "monthly" && "/bln"}
                          </>
                        }
                      />
                    ))}
                  </ModalCheckList>
                </ModalField>
              </ModalSection>
            )}
            {error && <ModalError>{error}</ModalError>}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner className="size-4" />}
              Simpan ahli
            </Button>
          </ModalFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
