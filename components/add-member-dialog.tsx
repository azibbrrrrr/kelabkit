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
import { useT } from "@/lib/i18n/react";
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
  const t = useT();
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
    if (!name.trim()) return setError(t("dialogs.addMember.nameRequired"));
    if (similar && !allowDuplicate) return setError(t("dialogs.addMember.similarBlocked"));
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
      toast.success(join.length ? t("dialogs.addMember.addedTo", { name: name.trim(), count: join.length }) : t("dialogs.addMember.added", { name: name.trim() }));
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
          <ModalHeader icon={UserPlus} title={t("dialogs.addMember.title")} description={t("dialogs.addMember.description")} />
          <ModalBody>
            <ModalSection label={t("dialogs.addMember.section")}>
              <ModalField
                label={t("dialogs.addMember.name")}
                htmlFor="member-name"
                helper={
                  similar && (
                    <span className="flex items-start gap-1.5 text-st-partial">
                      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {t("dialogs.addMember.similar", { name: similar.name })}
                    </span>
                  )
                }
              >
                <Input id="member-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("dialogs.addMember.namePlaceholder")} />
              </ModalField>
              {similar && (
                <label className="flex items-center gap-2 text-small">
                  <Checkbox checked={allowDuplicate} onCheckedChange={(value) => setAllowDuplicate(value === true)} />
                  {t("dialogs.addMember.distinct")}
                </label>
              )}
              <ModalField label={t("dialogs.addMember.category")} labelId="member-category-label">
                <SegmentedChoice<MemberCategory | "">
                  joined
                  label={t("dialogs.addMember.category")}
                  optional
                  value={category ?? ""}
                  onChange={(value) => setCategory(value || null)}
                  options={(Object.keys(categoryLabels) as MemberCategory[]).map((value) => ({ value, label: categoryLabels[value] }))}
                />
              </ModalField>
              <ModalField label={t("dialogs.addMember.phone")} htmlFor="member-phone" helper={t("dialogs.addMember.phoneHelper")}>
                <Input id="member-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("dialogs.addMember.phonePlaceholder")} />
              </ModalField>
            </ModalSection>
            {active.length > 0 && (
              <ModalSection divided>
                <ModalField label={t("dialogs.addMember.joinTitle")} labelId="member-join-label">
                  <p className="-mt-0.5 text-xs leading-4 text-muted-foreground">{t("dialogs.addMember.joinHint")}</p>
                  <ModalCheckList label={t("dialogs.addMember.joinTitle")}>
                    {active.map((collection) => (
                      <ModalCheckRow
                        key={collection.id}
                        checked={join.includes(collection.id)}
                        onCheckedChange={(value) => setJoin((current) => (value ? [...current, collection.id] : current.filter((id) => id !== collection.id)))}
                        label={collection.name}
                        trailing={
                          <>
                            {collection.defaultAmount !== null ? formatMoney(collection.defaultAmount) : t("dialogs.addMember.voluntary")}
                            {collection.type === "monthly" && t("dialogs.addMember.perMonth")}
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
              {t("dialogs.addMember.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner className="size-4" />}
              {t("dialogs.addMember.save")}
            </Button>
          </ModalFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
