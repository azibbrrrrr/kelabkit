"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
} from "@/components/ui/alert-dialog";
import { ModalBody, ModalFooter, ModalHeader } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/react";
import { messageFor } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import type { Collection } from "@/lib/types";
import { ArchiveRestore } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Target = "active" | "completed";

/**
 * Brings an archived collection back as Aktif or Selesai. The default follows the money: Aktif
 * while any non-exempt charge still has a balance, else Selesai. Records are untouched either way.
 */
export function RestoreCollectionDialog({
  collection,
  onClose,
  fallbackFocus,
}: {
  collection: Collection | null;
  onClose: () => void;
  /** Where focus goes when the element that opened the dialog is gone (e.g. the restored card left the list). */
  fallbackFocus?: () => HTMLElement | null | undefined;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog open={collection !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        size="sm"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          const target = opener.current?.isConnected ? opener.current : fallbackFocus?.();
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        {/* Keyed so the default choice is worked out afresh for each collection. */}
        {collection && <RestoreBody key={collection.id} collection={collection} onClose={onClose} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RestoreBody({ collection, onClose }: { collection: Collection; onClose: () => void }) {
  const t = useT();
  const { run } = useKelab();
  const { view } = useSnapshot();
  const ledgers = (view.chargesByCollection.get(collection.id) ?? []).map((charge) => view.ledgers.get(charge.id)!);
  const balance = ledgers.reduce((sum, ledger) => (ledger.charge.exempt ? sum : sum + ledger.remaining), 0);
  // The backend refuses Aktif for a collection with no participants (COLLECTION_NO_MEMBERS).
  const hasMembers = (view.participantsByCollection.get(collection.id) ?? []).length > 0;
  const [target, setTarget] = useState<Target>(balance > 0 && hasMembers ? "active" : "completed");
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await run((backend) => backend.setCollectionStatus(collection.id, target));
      toast.success(t("dialogs.restore.restored", { name: collection.name, status: target === "active" ? t("dialogs.restore.active") : t("dialogs.restore.completed") }));
      onClose();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ModalHeader
        alert
        icon={ArchiveRestore}
        title={t("dialogs.restore.title", { name: collection.name })}
        description={`${balance > 0 ? t("dialogs.restore.balance", { amount: formatMoney(balance) }) : t("dialogs.restore.noBalance")} ${t("dialogs.restore.keep")}`}
      />
      <ModalBody>
        <RadioGroup value={target} onValueChange={(value) => setTarget(value as Target)} aria-label={t("dialogs.restore.statusLabel")} className="gap-2">
          <Option
            value="active"
            title={t("dialogs.restore.active")}
            hint={hasMembers ? t("dialogs.restore.activeHint") : t("dialogs.restore.activeNeedsMembers")}
            disabled={!hasMembers}
          />
          <Option value="completed" title={t("dialogs.restore.completed")} hint={t("dialogs.restore.completedHint")} />
        </RadioGroup>
      </ModalBody>
      <ModalFooter>
        <AlertDialogCancel variant="ghost" disabled={busy}>{t("dialogs.restore.cancel")}</AlertDialogCancel>
        {/* A plain button, not AlertDialogAction, so the dialog stays open until the change succeeds. */}
        <Button onClick={() => void restore()} disabled={busy}>
          {busy && <Spinner className="size-4" />}
          {t("dialogs.restore.submit")}
        </Button>
      </ModalFooter>
    </>
  );
}

function Option({ value, title, hint, disabled }: { value: Target; title: string; hint: string; disabled?: boolean }) {
  const id = `restore-${value}`;
  return (
    <Label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-tint has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    >
      <RadioGroupItem id={id} value={value} disabled={disabled} className="mt-0.5" />
      <span className="grid gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </Label>
  );
}
