"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/errors";
import { useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

/**
 * Confirms a financial correction or other high-impact change and collects the reason the
 * audit log keeps. Stays open with the error if the change is refused.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  reasonRequired = true,
  placeholder,
  onConfirm,
  success,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reasonRequired?: boolean;
  placeholder?: string;
  onConfirm: (reason: string) => Promise<unknown>;
  success: string;
  children?: ReactNode;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = async () => {
    if (reasonRequired && !reason.trim()) {
      setError(t("reason.required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      toast.success(success);
      setReason("");
      onOpenChange(false);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="grid gap-1.5">
          <Label htmlFor={id}>
            {t("reason.label")}
            {reasonRequired ? "" : t("reason.optional")}
          </Label>
          <Textarea
            id={id}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={placeholder ?? t("reason.placeholder")}
            rows={3}
            aria-invalid={Boolean(error)}
          />
          {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.back")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy}
            className={cn(destructive && "bg-st-overdue-bg text-white hover:bg-st-overdue-bg/90")}
          >
            {busy && <Spinner className="size-4" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
