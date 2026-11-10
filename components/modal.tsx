"use client";

import { AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";
import { CircleAlert, X, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

// One anatomy for every dialog, alert dialog and sheet-form:
//
//   <DialogContent size="sm|md|lg">                 (components/ui/dialog.tsx)
//     <ModalHeader icon title description />        fixed: tile, 17px title, 13px description, close
//     <ModalBody>                                   scrolls (overscroll-contain), 20-24px padding
//       <ModalSection label="…"> <ModalField …/> </ModalSection>
//     </ModalBody>
//     <ModalFooter start={…}> Batal + primary </ModalFooter>   fixed, white, top divider
//   </DialogContent>
//
// A <form> wraps the three parts and takes `modalFormClass` so the body (not the page) scrolls.

/** Classes for a <form> that wraps ModalHeader/Body/Footer inside a DialogContent. */
export const modalFormClass = "flex min-h-0 flex-1 flex-col";

const tones = {
  brand: "bg-primary-light text-primary-strong",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function ModalHeader({
  title,
  description,
  icon: Icon,
  tone = "brand",
  alert = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** `danger` gives the red tile of a destructive confirmation. */
  tone?: keyof typeof tones;
  /** Inside an AlertDialog: uses its title/description and has no close X (Batal is the way out). */
  alert?: boolean;
  className?: string;
}) {
  const t = useT();
  const Title = alert ? AlertDialogTitle : DialogTitle;
  const Description = alert ? AlertDialogDescription : DialogDescription;
  return (
    <div data-slot="modal-header" className={cn("flex shrink-0 items-start gap-3 border-b border-border px-5 pt-3 pb-4 sm:px-6 sm:pt-5", className)}>
      {Icon && (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", tones[tone])} aria-hidden>
          <Icon className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Title className="font-heading text-[17px] leading-6 font-semibold text-foreground">{title}</Title>
        {description && <Description className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">{description}</Description>}
      </div>
      {!alert && (
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="icon" data-modal-close="" className="-mt-1 -mr-2 size-9 shrink-0 rounded-[10px] text-muted-foreground">
            <X className="size-[18px]" aria-hidden />
            <span className="sr-only">{t("ui.close")}</span>
          </Button>
        </DialogClose>
      )}
    </div>
  );
}

/**
 * The explanation of a confirmation, as readable body text (the header description is capped at
 * two lines, so a longer consequence goes here). Doubles as the dialog's accessible description.
 */
export function ModalText({ alert = false, className, children }: { alert?: boolean; className?: string; children: ReactNode }) {
  const Description = alert ? AlertDialogDescription : DialogDescription;
  return <Description className={cn("text-sm leading-6 text-muted-foreground", className)}>{children}</Description>;
}

/** The scrolling middle. Direct children are sections, 24px apart. */
export function ModalBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-body"
      className={cn("flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6", className)}
      {...props}
    />
  );
}

/** A group of related fields: small caps label, 16px between fields, optional top divider. */
export function ModalSection({
  label,
  divided = false,
  className,
  children,
}: {
  label?: ReactNode;
  divided?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-slot="modal-section" className={cn("grid gap-4", divided && "border-t border-border pt-6", className)}>
      {label && <h3 className="text-[11px] leading-4 font-semibold tracking-wider text-muted-foreground uppercase">{label}</h3>}
      {children}
    </section>
  );
}

/** Label (13px medium), control, then helper (12px muted) or error (12px red with icon). */
export function ModalField({
  label,
  htmlFor,
  labelId,
  helper,
  error,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  labelId?: string;
  helper?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-slot="modal-field" className={cn("grid gap-1.5", className)}>
      {htmlFor ? (
        <Label htmlFor={htmlFor} id={labelId} className="text-[13px] leading-4">
          {label}
        </Label>
      ) : (
        // A group of controls (segmented, list): the group carries its own aria-label.
        <div id={labelId} className="text-[13px] leading-4 font-medium">
          {label}
        </div>
      )}
      {children}
      {error ? <ModalError>{error}</ModalError> : helper ? <p className="text-xs leading-4 text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

/** Red 12px message with an icon; used for field errors and the form-level error. */
export function ModalError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-1.5 text-xs leading-4 font-medium text-destructive", className)}>
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * Fixed footer: white, top divider. `start` is a secondary action pinned left; the children
 * (Batal as ghost, then the primary) sit right. On phones the children share the row equally and
 * the footer clears the home indicator.
 */
export function ModalFooter({ start, className, children }: { start?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div
      data-slot="modal-footer"
      className={cn("flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6", className)}
    >
      {start && <div className="mr-auto min-w-0 max-sm:w-full">{start}</div>}
      <div className={cn("flex items-center justify-end gap-2 max-sm:w-full max-sm:[&>*]:flex-1", !start && "ml-auto")}>{children}</div>
    </div>
  );
}

/**
 * A multi-choice list: one bordered container, row dividers, 44px rows, hover tint. Each row is
 * a checkbox, a label and a right-aligned amount (not separate boxes).
 */
export function ModalCheckList({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} data-slot="modal-check-list" className={cn("divide-y divide-border overflow-hidden rounded-[10px] border border-border bg-card", className)}>
      {children}
    </div>
  );
}

export function ModalCheckRow({
  checked,
  onCheckedChange,
  label,
  trailing,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      data-slot="modal-check-row"
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-primary-tint has-data-[state=checked]:bg-primary-tint/60",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
      )}
    >
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {trailing && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{trailing}</span>}
    </label>
  );
}
