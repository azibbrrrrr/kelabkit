"use client";

import { ghostKey, useIsiPantas, type Ghost } from "@/components/isi-pantas/provider";
import { formatMoneyShort } from "@/lib/format";
import { t as tNow } from "@/lib/i18n";
import { useT, type TFunction } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";

/** The Isi Pantas value waiting for (or just written to) one matrix cell. */
export function useGhost() {
  const { ghosts } = useIsiPantas();
  return (memberId: string, collectionId: string, periodId: string | null) => ghosts.get(ghostKey(memberId, collectionId, periodId)) ?? null;
}

/** `t` defaults to the current locale; pass the component's own `useT()` result so the text follows a language switch on re-render. */
export function describeGhost(ghost: Ghost, t: TFunction = tNow) {
  return t(ghost.state === "recorded" ? "quickFill.ghost.recorded" : "quickFill.ghost.suggested", { amount: formatMoneyShort(ghost.amountSen) });
}

/**
 * Dashed overlay inside a matrix cell while a suggestion waits; solid green once recorded.
 * Pointer only (tabIndex -1, hidden from assistive tech): the cell's own label carries the
 * same text and the grid keeps its single tab stop. Clicking brings the matching card up.
 */
export function GhostValue({ ghost }: { ghost: Ghost }) {
  const t = useT();
  const { focusCard } = useIsiPantas();
  const recorded = ghost.state === "recorded";
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      data-isi-ghost={ghost.state}
      title={recorded ? t("quickFill.ghost.titleRecorded") : t("quickFill.ghost.titleSuggested")}
      onClick={(event) => {
        event.stopPropagation();
        focusCard(ghost.itemId);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn("isi-ghost absolute inset-[3px] z-[1] flex min-w-0 items-center gap-1 overflow-hidden rounded-[9px] px-2 text-[11px] font-semibold whitespace-nowrap", recorded ? "isi-ghost-done" : "isi-ghost-pulse")}
    >
      {recorded ? <Check className="size-3 shrink-0" /> : <Sparkles className="size-3 shrink-0" />}
      <b className="font-semibold tabular-nums">+{formatMoneyShort(ghost.amountSen)}</b>
      <span className="truncate font-medium">{recorded ? t("quickFill.ghost.wordRecorded") : t("quickFill.ghost.wordSuggested")}</span>
    </button>
  );
}

/** Small "+RMx" chip on a card line while suggestions wait. Decorative: the line's label carries the words. */
export function GhostBadge({ amountSen, className }: { amountSen: number; className?: string }) {
  const t = useT();
  return (
    <span
      aria-hidden
      data-isi-ghost-badge
      title={t("quickFill.ghost.badge")}
      className={cn("isi-ghost isi-ghost-pulse cursor-default inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", className)}
    >
      <Sparkles className="size-3" />+{formatMoneyShort(amountSen)}
    </span>
  );
}
