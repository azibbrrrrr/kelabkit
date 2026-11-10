"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRef } from "react";

// Focus hand-back and the unsaved-input guard shared by every editor surface of the matrix
// (grid popover, phone sheet, desktop card popover and side panel).

/** Remembers the element that opened a controlled overlay (no Radix Trigger) to hand focus back on close. */
export function useOpener() {
  const ref = useRef<HTMLElement | null>(null);
  /** Pass the clicked element where the browser may not focus it on click (Safari buttons). */
  const remember = (el?: HTMLElement | null) => {
    ref.current = el ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  };
  const restore = (event: Event) => {
    if (!ref.current?.isConnected) return; // opener gone (e.g. an empty state replaced): keep Radix's default
    event.preventDefault();
    ref.current.focus();
  };
  return { ref, remember, restore };
}

/** Tracks the last focused control inside an editor, so "Teruskan edit" can put focus back there. */
export function useLastFocus() {
  const ref = useRef<HTMLElement | null>(null);
  const onFocusCapture = (event: { target: EventTarget }) => {
    if (event.target instanceof HTMLElement) ref.current = event.target;
  };
  const restore = () => requestAnimationFrame(() => ref.current?.isConnected && ref.current.focus());
  return { onFocusCapture, restore };
}

/**
 * Asked when a click lands outside an editor holding unsaved input. Esc and Batal never ask:
 * they are explicit cancels. Shared by the desktop popover and the phone sheet.
 */
export function DiscardDialog({
  open,
  onKeep,
  onDiscard,
  restoreFocus,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
  /** Puts focus back on the field being edited; the outside click that opened this moved it away. */
  restoreFocus: () => void;
}) {
  const discarded = useRef(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onKeep()}>
      <AlertDialogContent
        size="sm"
        className="rounded-2xl"
        onOpenAutoFocus={() => (discarded.current = false)}
        // Keep: focus returns to the field being edited. Discard: the editor's own close hands
        // focus back to its cell or tile.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!discarded.current) restoreFocus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Buang perubahan?</AlertDialogTitle>
          <AlertDialogDescription>Perubahan yang belum disimpan dalam editor ini akan hilang.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Teruskan edit</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => {
              discarded.current = true;
              onDiscard();
            }}
          >
            Buang
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
