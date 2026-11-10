"use client";

// Isi Pantas: paste text, get payment suggestions, accept what is right. Desktop docks a
// glass side-sheet over the main panel (non-modal, so the matrix behind stays usable and
// its ghost values stay visible); phones get a tall bottom sheet. Conversation state lives
// in IsiPantasProvider; this file only draws it.

import { ProofField } from "@/components/attachments";
import { CollectionIcon } from "@/components/collection-icon";
import { useKelab } from "@/components/data-provider";
import { turnSummary, useIsiPantas, type Item, type Pick, type Turn } from "@/components/isi-pantas/provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModalHandle } from "@/components/ui/modal-surface";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDayShort, formatMoney, formatMonth, initials, today } from "@/lib/format";
import { useT, type TFunction } from "@/lib/i18n/react";
import { chargeFor, CONFIDENT, isConfident, type IssueCode } from "@/lib/isi-pantas/parse";
import { currentSection, hasOwnActionBar } from "@/lib/nav";
import type { Collection, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { View } from "@/lib/view";
import { Check, ClipboardPaste, Eraser, Flower2, Landmark, MessageCircle, NotebookPen, Paperclip, Sparkles, TriangleAlert, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

// The sample pastes are BM on purpose: they are what the parser reads. Only the card titles follow the locale.
const EXAMPLES = [
  {
    icon: MessageCircle,
    title: "quickFill.empty.whatsapp",
    text: "Farah dah bank in 5 utk jamuan ye kak\nSiti bayar yuran nov 10 cash\nAmir baju 15 transfer semalam\nTan Mei Ling 25 jamuan",
  },
  { icon: Landmark, title: "quickFill.empty.bank", text: "10/11 DUITNOW FR SITI AISYAH 10.00" },
  { icon: NotebookPen, title: "quickFill.empty.list", text: "Amir 15 baju, Tan 25 jamuan tunai" },
] as const;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Entry points ------------------------------------------------------------------------------

/** Top bar: gradient button with the "/" shortcut. Desktop and tablet; phones use the pill. */
export function IsiPantasButton() {
  const t = useT();
  const { open, openSheet, close, opener } = useIsiPantas();
  return (
    <button
      type="button"
      aria-keyshortcuts="/"
      aria-expanded={open}
      aria-controls="isi-pantas"
      title={t("quickFill.nameWithKey")}
      onClick={(event) => {
        if (!open) return openSheet(event.currentTarget);
        close();
        opener.current?.focus();
      }}
      className="isi-spark-btn hidden size-9 shrink-0 items-center justify-center gap-2 rounded-[10px] text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:inline-flex xl:w-auto xl:px-3 print:hidden"
    >
      <Sparkles className="size-4" aria-hidden />
      {/* Icon only below xl so the top bar fits at tablet width; the name stays for assistive tech. */}
      <span className="sr-only xl:not-sr-only">{t("quickFill.name")}</span>
      <kbd aria-hidden className="hidden rounded-[5px] bg-white/20 px-1.5 font-mono text-[10.5px] leading-[18px] xl:inline">
        /
      </kbd>
    </button>
  );
}

/** Phones: a floating pill above the bottom nav on the pages where payments are entered. */
export function IsiPantasPill() {
  const t = useT();
  const pathname = usePathname();
  const { open, openSheet } = useIsiPantas();
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  // Pages with their own fixed action bar (/bayaran/baru/, the collection wizard) never get the pill.
  const show = !hasOwnActionBar(path) && (path === "/matriks/" || path === "/bayaran/" || /^\/kutipan\/[^/]+\/$/.test(path));
  if (!show) return null;
  // Stays mounted (only hidden) while the sheet is open, so focus can return to it on close.
  return (
    <button
      type="button"
      aria-hidden={open || undefined}
      tabIndex={open ? -1 : undefined}
      onClick={(event) => openSheet(event.currentTarget)}
      className={cn(
        "isi-pill fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 flex h-11 items-center gap-1.5 rounded-[14px] px-3.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden print:hidden",
        open && "invisible",
      )}
    >
      <Sparkles className="size-4" aria-hidden />
      {t("quickFill.name")}
    </button>
  );
}

// The sheet ---------------------------------------------------------------------------------

export function IsiPantasSheet() {
  const { data, view } = useKelab();
  const { open, close, opener, turns } = useIsiPantas();
  const isMobile = useIsMobile();
  const section = useRef<HTMLElement>(null);

  const desktop = open && !isMobile;
  // While docked, the matrix keeps scrolled-to cells clear of the sheet (see globals.css).
  useEffect(() => {
    const root = document.documentElement;
    if (desktop) root.dataset.isiOpen = "";
    else delete root.dataset.isiOpen;
    return () => {
      delete root.dataset.isiOpen;
    };
  }, [desktop]);

  // Docked sheet takes focus on open: the composer when there is nothing yet, else the sheet.
  useEffect(() => {
    if (!desktop) return;
    requestAnimationFrame(() => {
      const input = section.current?.querySelector<HTMLTextAreaElement>("#isi-input");
      if (!turnsRef.current.length && input) input.focus();
      else section.current?.focus();
    });
  }, [desktop]);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  if (!data || !view) return null;

  const closeDesktop = () => {
    close();
    requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus());
  };

  return (
    <>
      {desktop && (
        <section
          ref={section}
          id="isi-pantas"
          role="dialog"
          aria-modal="false"
          aria-labelledby="isi-title"
          aria-describedby="isi-sub"
          tabIndex={-1}
          onKeyDown={(event) => {
            // Escape inside a portalled picker belongs to that picker.
            if (event.key !== "Escape" || event.defaultPrevented || !section.current?.contains(event.target as Node)) return;
            event.preventDefault();
            closeDesktop();
          }}
          className="isi-glass isi-aurora fixed top-20 right-6 bottom-6 z-40 flex w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-[24px] outline-none print:hidden"
        >
          <Body data={data} view={view} onClose={closeDesktop} />
        </section>
      )}
      <Sheet open={open && isMobile} onOpenChange={(next) => !next && close()}>
        <SheetContent
          id="isi-pantas"
          side="bottom"
          showCloseButton={false}
          className="isi-glass isi-aurora h-[82svh] gap-0 data-[side=bottom]:h-[82svh] rounded-t-(--radius-modal) border-0 p-0 pb-[env(safe-area-inset-bottom)]"
          onOpenAutoFocus={(event) => {
            // Raise the keyboard only when there is nothing to read yet.
            if (turnsRef.current.length) {
              event.preventDefault();
              (event.currentTarget as HTMLElement).focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (!opener.current?.isConnected) return;
            event.preventDefault();
            opener.current.focus();
          }}
        >
          <ModalHandle className="relative" />
          <Body data={data} view={view} onClose={close} mobile />
        </SheetContent>
      </Sheet>
    </>
  );
}

function Body({ data, view, onClose, mobile = false }: { data: Snapshot; view: View; onClose: () => void; mobile?: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const { turns, busy, clear, celebrate } = useIsiPantas();
  const feed = useRef<HTMLDivElement>(null);
  const activeMembers = data.members.filter((member) => member.active).length;
  const activeCollections = data.collections.filter((collection) => collection.status === "active").length;
  const page = currentSection(pathname)?.title ?? "KelabKit";

  const items = turns.flatMap((turn) => turn.items);
  const open = items.filter((item) => item.status === "pending" || item.status === "applying");
  const thinking = turns.some((turn) => turn.phase === "thinking");
  const last = turns.at(-1);
  const lastSummary = last ? turnSummary(last) : null;
  const subtitle = !turns.length
    ? t("quickFill.subtitle.empty")
    : thinking
      ? t("quickFill.subtitle.matching", { count: activeMembers })
      : open.length
        ? t("quickFill.subtitle.open", { count: open.length })
        : lastSummary && lastSummary.count
          ? t(lastSummary.count === 1 ? "quickFill.subtitle.recordedOne" : "quickFill.subtitle.recordedMany", { count: lastSummary.count })
          : lastSummary && lastSummary.undone
            ? t(lastSummary.undone === 1 ? "quickFill.subtitle.undoneOne" : "quickFill.subtitle.undoneMany", { count: lastSummary.undone })
            : t("quickFill.subtitle.again");

  // New paste or new results: bring the latest exchange into view.
  const phaseKey = turns.map((turn) => `${turn.id}:${turn.phase}`).join(",");
  useEffect(() => {
    const el = feed.current?.querySelector<HTMLElement>("[data-turn]:last-of-type");
    el?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    // On the matrix, bring the first new ghost value into view beside the sheet.
    if (turns.at(-1)?.phase === "ready")
      requestAnimationFrame(() =>
        document.querySelector("[data-isi-ghost='suggested']")?.closest("td")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phaseKey summarises turns
  }, [phaseKey]);

  const Title = mobile ? SheetTitle : "h2";
  const Description = mobile ? SheetDescription : "p";

  return (
    <>
      <Petals trigger={celebrate} />
      <div className="relative flex items-center gap-3 border-b border-border/60 px-4 pt-3.5 pb-3 sm:px-5">
        <span aria-hidden className={cn("isi-orb grid size-9 shrink-0 place-items-center rounded-xl", thinking && "isi-orb-spin")}>
          <Sparkles className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <Title id="isi-title" className="font-display text-[17px] leading-6 font-semibold text-foreground">
            {t("quickFill.name")}
          </Title>
          <Description id="isi-sub" aria-live="polite" className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {subtitle}
          </Description>
        </div>
        <div className="ml-auto flex shrink-0 gap-1.5">
          {turns.length > 0 && (
            <Button variant="outline" size="icon" className="size-9 rounded-[10px] bg-card" aria-label={t("quickFill.clear")} title={t("quickFill.clear")} disabled={busy} onClick={clear}>
              <Eraser />
            </Button>
          )}
          <Button variant="outline" size="icon" className="size-9 rounded-[10px] bg-card" aria-label={t("quickFill.close")} data-modal-close="" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <ul aria-label={t("quickFill.context.label")} className="relative mx-4 mb-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <li className="rounded-full border border-border bg-card px-2.5 py-0.5">
          {t("quickFill.context.page")} <b className="font-semibold text-foreground">{page}</b>
        </li>
        <li className="rounded-full border border-border bg-card px-2.5 py-0.5">
          <b className="font-semibold text-foreground">{activeMembers}</b> {t(activeMembers === 1 ? "quickFill.context.membersOne" : "quickFill.context.membersMany")}
        </li>
        <li className="rounded-full border border-border bg-card px-2.5 py-0.5">
          <b className="font-semibold text-foreground">{activeCollections}</b> {t(activeCollections === 1 ? "quickFill.context.collectionsOne" : "quickFill.context.collectionsMany")}
        </li>
      </ul>
      <div ref={feed} className="relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 pt-1 pb-2.5">
        {turns.length === 0 ? <EmptyFeed /> : turns.map((turn) => <TurnView key={turn.id} turn={turn} data={data} view={view} activeMembers={activeMembers} onReveal={mobile ? onClose : undefined} />)}
      </div>
      <BulkBar items={open} />
      <Composer />
    </>
  );
}

function EmptyFeed() {
  const t = useT();
  const { setDraft } = useIsiPantas();
  return (
    <div className="grid gap-2.5 py-1.5">
      <div className="px-1.5 pt-2.5 pb-0.5 text-center">
        <Flower2 aria-hidden className="mx-auto size-8 text-primary" />
        <p className="mt-1 font-semibold">{t("quickFill.empty.title")}</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{t("quickFill.empty.text")}</p>
      </div>
      <ul className="grid gap-2" aria-label={t("quickFill.empty.examples")}>
        {EXAMPLES.map((example) => (
          <li key={example.title}>
            <button
              type="button"
              onClick={() => {
                setDraft(example.text);
                requestAnimationFrame(() => document.getElementById("isi-input")?.focus());
              }}
              className="flex w-full items-start gap-2.5 rounded-[14px] border border-border bg-card px-3 py-2.5 text-left text-[12px] transition-colors outline-none hover:border-primary/50 hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-primary-tint text-primary-strong">
                <example.icon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{t(example.title)}</span>
                <span className="block truncate text-[11px] text-muted-foreground">“{example.text.split("\n")[0]}”</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BotLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="isi-orb mt-0.5 size-6 shrink-0 rounded-lg" />
      <div className={cn("min-w-0 rounded-[4px_14px_14px_14px] border border-border bg-card px-3 py-2 text-[12.5px]", className)}>{children}</div>
    </div>
  );
}

function TurnView({ turn, data, view, activeMembers, onReveal }: { turn: Turn; data: Snapshot; view: View; activeMembers: number; onReveal?: () => void }) {
  const t = useT();
  const lines = turn.text.split(/\r?\n/).filter((line) => line.trim()).length;
  const confident = turn.items.filter((item) => isConfident(item.s)).length;
  const summary = turnSummary(turn);
  const steps = [
    t(lines === 1 ? "quickFill.turn.stepReadOne" : "quickFill.turn.stepReadMany", { count: lines }),
    t("quickFill.turn.stepAmount"),
    t(activeMembers === 1 ? "quickFill.turn.stepMatchOne" : "quickFill.turn.stepMatchMany", { count: activeMembers }),
    t("quickFill.turn.stepCheck"),
  ];
  return (
    <div data-turn className="flex scroll-mt-2 flex-col gap-2.5">
      <div className="isi-bubble max-w-[88%] self-end rounded-[16px_16px_4px_16px] px-3 py-2.5 text-[12.5px] break-words whitespace-pre-wrap">
        <span className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold">
          <ClipboardPaste aria-hidden className="size-3" /> {t(lines === 1 ? "quickFill.turn.pastedOne" : "quickFill.turn.pastedMany", { count: lines })}
        </span>
        {turn.text}
      </div>
      {turn.phase === "thinking" ? (
        <BotLine className="w-[240px]">
          <ol className="grid gap-1 text-[11.5px] text-muted-foreground" aria-label={t("quickFill.turn.steps")}>
            {steps.map((label, i) => (
              <li key={label} className={cn(i < turn.step && "text-st-paid", i === turn.step && "font-semibold text-primary-strong")}>
                {i < turn.step ? "✓" : i === turn.step ? "●" : "○"} {label}
                {i === turn.step && "…"}
              </li>
            ))}
          </ol>
          <div aria-hidden className="isi-shimmer mt-2 h-2.5 rounded-md" />
          <div aria-hidden className="isi-shimmer mt-1.5 h-2.5 w-[70%] rounded-md" />
        </BotLine>
      ) : (
        <>
          <BotLine>
            {turn.items.length === 0 ? (
              <>{t("quickFill.turn.none")}</>
            ) : (
              <>
                {t("quickFill.turn.foundBefore")}
                <b>{turn.items.length}</b>
                {t(turn.items.length === 1 ? "quickFill.turn.foundAfterOne" : "quickFill.turn.foundAfterMany")}{" "}
                {confident === turn.items.length
                  ? t("quickFill.turn.allConfident")
                  : confident === 0
                    ? t("quickFill.turn.noneConfident", { count: turn.items.length })
                    : t("quickFill.turn.someConfident", { confident, review: turn.items.length - confident })}
              </>
            )}
          </BotLine>
          {turn.items.map((item) => (
            <SuggestionCard key={item.s.id} item={item} data={data} view={view} />
          ))}
          {summary.open === 0 && (summary.count > 0 || summary.undone > 0) && <DoneCard turn={turn} onReveal={onReveal} />}
        </>
      )}
    </div>
  );
}

// Suggestion card ---------------------------------------------------------------------------

function issueText(t: TFunction, code: IssueCode, item: Item, data: Snapshot, view: View) {
  const { s } = item;
  if (code === "NAME_UNMATCHED") return t("quickFill.issue.nameUnmatched");
  if (code === "NAME_AMBIGUOUS") return t("quickFill.issue.nameAmbiguous", { names: s.candidates.map((id) => view.membersById.get(id)?.name ?? id).join(t("quickFill.issue.or")) });
  if (code === "POSSIBLE_DUPLICATE") return t("quickFill.issue.duplicate");
  if (code === "COLLECTION_UNKNOWN") return s.collectionId ? t("quickFill.issue.noCharge") : t("quickFill.issue.collectionUnknown");
  const charge = s.memberId && s.collectionId ? chargeFor(data, s.memberId, s.collectionId, s.periodId) : null;
  const ledger = charge ? view.ledgers.get(charge.id) : null;
  return ledger ? t("quickFill.issue.overBalanceAmount", { amount: formatMoney(ledger.payable) }) : t("quickFill.issue.overBalance");
}

function targetLabel(t: TFunction, collection: Collection | undefined, periodMonth: string | null) {
  if (!collection) return t("quickFill.card.collectionNotChosen");
  return periodMonth ? `${collection.name} · ${formatMonth(periodMonth, false)}` : collection.name;
}

function SuggestionCard({ item, data, view }: { item: Item; data: Snapshot; view: View }) {
  const t = useT();
  const { accept, dismiss, busy } = useIsiPantas();
  const { s, status } = item;
  const member = s.memberId ? view.membersById.get(s.memberId) : undefined;
  const collection = s.collectionId ? view.collectionsById.get(s.collectionId) : undefined;
  const period = s.periodId ? data.periods.find((row) => row.id === s.periodId) : undefined;
  const live = status === "pending" || status === "undone";
  const warn = live && s.issues.length > 0;
  const canRecord = Boolean(s.memberId && s.collectionId) && !s.issues.includes("OVER_BALANCE") && !s.issues.includes("COLLECTION_UNKNOWN");
  const nameIssue = s.issues.includes("NAME_AMBIGUOUS") || s.issues.includes("NAME_UNMATCHED");
  const primary = !canRecord
    ? t("quickFill.card.accept")
    : status === "undone"
      ? t("quickFill.card.recordAgain")
      : nameIssue
        ? t("quickFill.card.confirmMember")
        : s.issues.includes("POSSIBLE_DUPLICATE")
          ? t("quickFill.card.recordAnyway")
          : t("quickFill.card.accept");
  const pct = Math.round(s.confidence * 100);
  const issuesId = `isi-issues-${s.id}`;
  const today_ = today();
  const what = [
    targetLabel(t, collection, period?.month ?? null),
    t(`quickFill.method.${s.method}`),
    s.method === "transfer" ? t("quickFill.card.pendingReview") : null,
    s.paidOn !== today_ ? formatDayShort(s.paidOn) : null,
  ].filter(Boolean);

  if (status === "dismissed")
    return (
      <div id={`isi-card-${s.id}`} tabIndex={-1} className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-1.5 text-[11.5px] text-muted-foreground outline-none">
        <span className="min-w-0 flex-1 truncate">
          {t("quickFill.card.dismissed", { name: member?.name ?? t("quickFill.card.unknownMember"), amount: formatMoney(s.amountSen) })}
        </span>
        <Button variant="link" size="xs" className="h-auto px-0" onClick={() => dismiss(s.id, true)}>
          {t("quickFill.card.restore")}
        </Button>
      </div>
    );

  const [before, amountText, after] = [s.quote.slice(0, s.amountSpan[0]), s.quote.slice(s.amountSpan[0], s.amountSpan[1]), s.quote.slice(s.amountSpan[1])];

  return (
    <article
      id={`isi-card-${s.id}`}
      tabIndex={-1}
      aria-label={`${member?.name ?? t("quickFill.card.unknownMember")}, ${formatMoney(s.amountSen)}`}
      className={cn(
        "isi-card grid grid-cols-[30px_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-2 rounded-2xl border border-border bg-card px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        warn && "isi-card-warn",
        status === "accepted" && "isi-card-done",
      )}
    >
      <span aria-hidden className="mt-0.5 grid size-[30px] place-items-center rounded-full bg-primary-light text-[11px] font-bold text-primary-strong">
        {member ? initials(member.name) : "?"}
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] leading-tight font-semibold">
          {member?.name ?? t("quickFill.card.unknownMember")}
          {s.issues.includes("NAME_AMBIGUOUS") && live && "?"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {collection && <CollectionIcon collection={collection} size="xs" className="mr-1 inline-block align-[-2px]" />}
          {what.join(" · ")}
        </p>
        {live && item.files.length > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-primary-strong">
            <Paperclip aria-hidden className="size-3 shrink-0" /> {t(item.files.length === 1 ? "quickFill.card.proofOne" : "quickFill.card.proofMany", { count: item.files.length })}
          </p>
        )}
        {warn && (
          <ul id={issuesId} className="mt-0.5 grid gap-0.5 text-[11px] font-medium text-st-partial">
            {s.issues.map((code) => (
              <li key={code} className="flex items-start gap-1">
                <TriangleAlert aria-hidden className="mt-[2px] size-3 shrink-0" />
                {issueText(t, code, item, data, view)}
              </li>
            ))}
          </ul>
        )}
        <q className="mt-1 line-clamp-2 block text-[11px] text-muted-foreground italic">
          {before}
          <mark className="rounded-[3px] bg-[#fde68a] px-0.5 text-foreground not-italic">{amountText}</mark>
          {after}
        </q>
      </div>
      <div className="text-right">
        <p className="text-[13px] font-semibold whitespace-nowrap tabular-nums">{formatMoney(s.amountSen)}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-muted-foreground">
          <span aria-hidden className={cn("isi-ring size-3.5 rounded-full", s.confidence < CONFIDENT && "isi-ring-low")} style={{ "--p": `${pct}%` } as CSSProperties} />
          <span className="sr-only">{t("quickFill.card.confidence")}</span>
          {pct}%
        </p>
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-1.5">
        {status === "accepted" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-st-paid-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-st-paid">
            <Check aria-hidden className="size-3.5" /> {s.method === "transfer" ? t("quickFill.card.recordedPending") : t("quickFill.card.recorded")}
          </span>
        ) : status === "applying" ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
            <Spinner className="size-3.5" /> {t("quickFill.card.recording")}
          </span>
        ) : (
          <>
            <Button size="sm" className="h-7 rounded-[9px] px-2.5 text-[11.5px] font-semibold" disabled={!canRecord || busy} aria-describedby={warn ? issuesId : undefined} onClick={() => void accept([s.id])}>
              {primary}
            </Button>
            {status === "pending" && <EditPicker item={item} data={data} view={view} />}
            {status === "pending" && (
              <Button variant="danger-outline" size="icon-sm" className="size-7 rounded-[9px]" aria-label={t("quickFill.card.dismiss")} title={t("quickFill.card.dismiss")} disabled={busy} onClick={() => dismiss(s.id)}>
                <X />
              </Button>
            )}
            {status === "undone" && <span className="text-[11px] text-muted-foreground">{t("quickFill.card.undone")}</span>}
          </>
        )}
      </div>
      {item.error && (
        <p role="alert" className="col-span-full -mt-1 text-[11.5px] font-medium text-destructive">
          {t("quickFill.card.notRecorded", { error: item.error })}
        </p>
      )}
    </article>
  );
}

/** "Ubah": pick the member and the charge (collection, month) this money belongs to. */
function EditPicker({ item, data, view }: { item: Item; data: Snapshot; view: View }) {
  const t = useT();
  const { edit, busy } = useIsiPantas();
  const { s } = item;
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(s.memberId ?? "");
  const [target, setTarget] = useState(s.collectionId ? `${s.collectionId}|${s.periodId ?? ""}` : "");

  const members = useMemo(() => data.members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name, "ms")), [data.members]);
  const candidates = s.candidates.map((id) => view.membersById.get(id)).filter((m) => m !== undefined);
  const options = useMemo(() => {
    if (!memberId) return [];
    const list: { value: string; label: string; note: string; disabled: boolean; collection: Collection }[] = [];
    for (const collection of data.collections.filter((c) => c.status === "active")) {
      if (collection.type === "voluntary") {
        if (view.participantsByCollection.get(collection.id)?.some((p) => p.memberId === memberId))
          list.push({ value: `${collection.id}|`, label: collection.name, note: t("quickFill.edit.voluntary"), disabled: false, collection });
        continue;
      }
      for (const charge of view.chargesByCollection.get(collection.id) ?? []) {
        if (charge.memberId !== memberId || charge.exempt) continue;
        const ledger = view.ledgers.get(charge.id)!;
        const month = charge.periodId ? (view.periodsByCollection.get(collection.id)?.find((p) => p.id === charge.periodId)?.month ?? null) : null;
        list.push({
          value: `${collection.id}|${charge.periodId ?? ""}`,
          label: targetLabel(t, collection, month),
          note: ledger.payable > 0 ? t("quickFill.edit.balance", { amount: formatMoney(ledger.payable) }) : t("quickFill.edit.settled"),
          disabled: ledger.payable === 0,
          collection,
        });
      }
    }
    return list;
  }, [memberId, data.collections, view, t]);

  const save = () => {
    const [collectionId, periodId] = target ? target.split("|") : [null, null];
    const pick: Pick = { memberId, collectionId: collectionId || null, periodId: periodId || null };
    edit(s.id, pick);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setMemberId(s.memberId ?? "");
          setTarget(s.collectionId ? `${s.collectionId}|${s.periodId ?? ""}` : "");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 rounded-[9px] bg-card px-2.5 text-[11.5px] font-semibold" disabled={busy}>
          {t("quickFill.edit.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-3.5" aria-label={t("quickFill.edit.title")}>
        <p className="mb-2.5 text-[13px] font-semibold">{t("quickFill.edit.titleAmount", { amount: formatMoney(s.amountSen) })}</p>
        <label className="mb-1 block text-xs font-medium" htmlFor={`isi-member-${s.id}`}>
          {t("quickFill.edit.member")}
        </label>
        <Select
          value={memberId}
          onValueChange={(value) => {
            setMemberId(value);
            setTarget("");
          }}
        >
          <SelectTrigger id={`isi-member-${s.id}`} className="w-full">
            <SelectValue placeholder={t("quickFill.edit.memberPlaceholder")} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {candidates.length > 0 && (
              <>
                <SelectGroup>
                  <SelectLabel>{t("quickFill.edit.suggested")}</SelectLabel>
                  {candidates.map((m) => (
                    <SelectItem key={`c-${m.id}`} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
              </>
            )}
            <SelectGroup>
              <SelectLabel>{t("quickFill.edit.allMembers")}</SelectLabel>
              {members
                .filter((m) => !s.candidates.includes(m.id))
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <label className="mt-3 mb-1 block text-xs font-medium" htmlFor={`isi-target-${s.id}`}>
          {t("quickFill.edit.collection")}
        </label>
        <Select value={target} onValueChange={setTarget} disabled={!memberId}>
          <SelectTrigger id={`isi-target-${s.id}`} className="w-full">
            <SelectValue placeholder={memberId ? t("quickFill.edit.collectionPlaceholder") : t("quickFill.edit.memberFirst")} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                <CollectionIcon collection={option.collection} size="xs" />
                {option.label} <span className="text-muted-foreground">· {option.note}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-3.5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={!memberId || !target} onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Bulk, done, composer ----------------------------------------------------------------------

function BulkBar({ items }: { items: Item[] }) {
  const t = useT();
  const { acceptConfident, busy } = useIsiPantas();
  if (!items.length) return null;
  const confident = items.filter((item) => item.status === "pending" && isConfident(item.s)).length;
  const review = items.length - confident;
  return (
    <div className="isi-bulk relative mx-4 mb-2 flex items-center gap-2 rounded-[14px] border border-border px-3 py-2 text-[12px]">
      <span className="min-w-0">
        ✓ <b className="text-primary-strong">{confident}</b> {t("quickFill.bulk.confident")} · <b className="text-primary-strong">{review}</b> {t("quickFill.bulk.review")}
      </span>
      <Button size="sm" className="brand-gradient ml-auto h-8 shrink-0 rounded-[10px] px-3 text-[12px] font-semibold" disabled={!confident || busy} onClick={() => void acceptConfident()}>
        {t("quickFill.bulk.acceptConfident", { count: confident })}
      </Button>
    </div>
  );
}

function DoneCard({ turn, onReveal }: { turn: Turn; onReveal?: () => void }) {
  const t = useT();
  const { undo, busy } = useIsiPantas();
  const router = useRouter();
  const pathname = usePathname();
  const summary = turnSummary(turn);
  const reveal = () => {
    onReveal?.();
    if (!pathname.startsWith("/matriks")) router.push("/matriks/");
    const find = (tries: number) => {
      const ghost = document.querySelector<HTMLElement>("[data-isi-ghost='recorded']");
      if (ghost) ghost.closest("td")?.scrollIntoView({ block: "center", inline: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      else if (tries > 0) requestAnimationFrame(() => find(tries - 1));
    };
    requestAnimationFrame(() => find(120));
  };
  if (summary.count === 0)
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-[12.5px]" role="status">
        <p className="font-semibold">{t("quickFill.done.cancelledTitle")}</p>
        <p className="text-muted-foreground">{t(summary.undone === 1 ? "quickFill.done.cancelledOne" : "quickFill.done.cancelledMany", { count: summary.undone })}</p>
      </div>
    );
  return (
    <div className="isi-done rounded-2xl border p-3 text-[12.5px]" role="status">
      <p className="text-[22px] leading-tight font-bold text-st-paid tabular-nums">+{formatMoney(summary.total)}</p>
      <p>
        {t(summary.count === 1 ? "quickFill.done.recordedOne" : "quickFill.done.recordedMany", { count: summary.count })}
        {summary.pending > 0 && t("quickFill.done.pending", { count: summary.pending })}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="bg-card" disabled={busy} onClick={() => void undo(turn.id)}>
          {t("quickFill.done.undo")}
        </Button>
        <Button size="sm" className="brand-gradient" onClick={reveal}>
          {t("quickFill.done.view")}
        </Button>
      </div>
    </div>
  );
}

function Composer() {
  const t = useT();
  const { draft, setDraft, draftFiles, setDraftFiles, submit, busy } = useIsiPantas();
  const [clipError, setClipError] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setDraft(draft ? `${draft}\n${text}` : text);
      setClipError(null);
      document.getElementById("isi-input")?.focus();
    } catch {
      setClipError(t("quickFill.composer.clipError"));
    }
  };
  return (
    <div className="isi-composer relative mx-3 mb-3 shrink-0 rounded-[18px] p-[2px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card">
      <div className="rounded-2xl bg-card px-2.5 pt-2.5 pb-2">
        <label htmlFor="isi-input" className="sr-only">
          {t("quickFill.composer.label")}
        </label>
        <Textarea
          id="isi-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={t("quickFill.composer.placeholder")}
          className="max-h-40 min-h-[40px] resize-none rounded-none border-0 bg-transparent p-0 text-[12.5px] shadow-none md:text-[12.5px] focus-visible:ring-0 dark:bg-transparent"
        />
        {clipError && (
          <p role="alert" className="mt-1 text-[11px] text-destructive">
            {clipError}
          </p>
        )}
        {(proofOpen || draftFiles.length > 0) && (
          <div className="mt-2 border-t border-border pt-2">
            <p className="mb-1.5 text-[11px] text-muted-foreground">{t("quickFill.composer.proofHint")}</p>
            <ProofField staged={draftFiles} onChange={setDraftFiles} />
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            className="relative size-7 rounded-lg"
            aria-label={t("quickFill.composer.attach")}
            aria-expanded={proofOpen || draftFiles.length > 0}
            title={t("quickFill.composer.attach")}
            onClick={() => setProofOpen((open) => !open)}
          >
            <Paperclip />
            {draftFiles.length > 0 && (
              <span aria-hidden className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-primary-fill text-[9px] font-bold text-primary-foreground">
                {draftFiles.length}
              </span>
            )}
          </Button>
          <Button variant="outline" size="icon-sm" className="size-7 rounded-lg" aria-label={t("quickFill.composer.paste")} title={t("quickFill.composer.paste")} onClick={() => void paste()}>
            <ClipboardPaste />
          </Button>
          <span className="ml-1 hidden min-w-0 truncate text-[10.5px] text-muted-foreground sm:inline">{t("quickFill.composer.keys")}</span>
          <Button size="sm" className="brand-gradient ml-auto h-[30px] rounded-[10px] px-3 text-[12px] font-semibold" disabled={!draft.trim() || busy} onClick={submit}>
            {t("quickFill.composer.submit")} <Sparkles aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Petal drift when a paste is settled. Off under reduced motion. */
function Petals({ trigger }: { trigger: number }) {
  const [petals, setPetals] = useState<{ id: string; left: number; top: number; delay: number }[]>([]);
  useEffect(() => {
    if (!trigger || reducedMotion()) return;
    const batch = Array.from({ length: 14 }, (_, i) => ({ id: `${trigger}-${i}`, left: 10 + Math.random() * 80, top: 20 + Math.random() * 30, delay: Math.random() * 0.6 }));
    setPetals(batch);
    const timer = setTimeout(() => setPetals([]), 3500);
    return () => clearTimeout(timer);
  }, [trigger]);
  if (!petals.length) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {petals.map((petal) => (
        <span key={petal.id} className="isi-petal" style={{ left: `${petal.left}%`, top: `${petal.top}px`, animationDelay: `${petal.delay}s` }} />
      ))}
    </div>
  );
}
