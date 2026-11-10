"use client";

import { ghostKey, useIsiPantas, type Ghost } from "@/components/isi-pantas/provider";
import { formatMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";

/** The Isi Pantas value waiting for (or just written to) one matrix cell. */
export function useGhost() {
  const { ghosts } = useIsiPantas();
  return (memberId: string, collectionId: string, periodId: string | null) => ghosts.get(ghostKey(memberId, collectionId, periodId)) ?? null;
}

export function describeGhost(ghost: Ghost) {
  return ghost.state === "recorded" ? `Isi Pantas: +${formatMoneyShort(ghost.amountSen)} direkod` : `Isi Pantas: cadangan +${formatMoneyShort(ghost.amountSen)}`;
}

/**
 * Dashed overlay inside a matrix cell while a suggestion waits; solid green once recorded.
 * Pointer only (tabIndex -1, hidden from assistive tech): the cell's own label carries the
 * same text and the grid keeps its single tab stop. Clicking brings the matching card up.
 */
export function GhostValue({ ghost }: { ghost: Ghost }) {
  const { focusCard } = useIsiPantas();
  const recorded = ghost.state === "recorded";
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      data-isi-ghost={ghost.state}
      title={recorded ? "Direkod melalui Isi Pantas" : "Cadangan Isi Pantas: klik untuk lihat kad"}
      onClick={(event) => {
        event.stopPropagation();
        focusCard(ghost.itemId);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn("isi-ghost absolute inset-[3px] z-[1] flex min-w-0 items-center gap-1 overflow-hidden rounded-[9px] px-2 text-[11px] font-semibold whitespace-nowrap", recorded ? "isi-ghost-done" : "isi-ghost-pulse")}
    >
      {recorded ? <Check className="size-3 shrink-0" /> : <Sparkles className="size-3 shrink-0" />}
      <b className="font-semibold tabular-nums">+{formatMoneyShort(ghost.amountSen)}</b>
      <span className="truncate font-medium">{recorded ? "direkod" : "cadangan"}</span>
    </button>
  );
}
