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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDayShort, formatMoney, formatMonth, initials, today } from "@/lib/format";
import { chargeFor, CONFIDENT, isConfident, type IssueCode } from "@/lib/isi-pantas/parse";
import { currentSection } from "@/lib/nav";
import type { Collection, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { View } from "@/lib/view";
import { Check, ClipboardPaste, Eraser, Flower2, Landmark, MessageCircle, NotebookPen, Paperclip, Sparkles, TriangleAlert, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

const EXAMPLES = [
  {
    icon: MessageCircle,
    title: "Mesej WhatsApp kumpulan",
    text: "Farah dah bank in 5 utk jamuan ye kak\nSiti bayar yuran nov 10 cash\nAmir baju 15 transfer semalam\nTan Mei Ling 25 jamuan",
  },
  { icon: Landmark, title: "Salinan penyata bank", text: "10/11 DUITNOW FR SITI AISYAH 10.00" },
  { icon: NotebookPen, title: "Senarai sendiri", text: "Amir 15 baju, Tan 25 jamuan tunai" },
] as const;

const METHOD_SHORT = { cash: "Tunai", transfer: "Pindahan", other: "Lain-lain" } as const;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Entry points ------------------------------------------------------------------------------

/** Top bar: gradient button with the "/" shortcut. Desktop and tablet; phones use the pill. */
export function IsiPantasButton() {
  const { open, openSheet, close, opener } = useIsiPantas();
  return (
    <button
      type="button"
      aria-keyshortcuts="/"
      aria-expanded={open}
      aria-controls="isi-pantas"
      title="Isi Pantas (/)"
      onClick={(event) => {
        if (!open) return openSheet(event.currentTarget);
        close();
        opener.current?.focus();
      }}
      className="isi-spark-btn hidden h-9 shrink-0 items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:inline-flex print:hidden"
    >
      <Sparkles className="size-4" aria-hidden />
      Isi Pantas
      <kbd aria-hidden className="rounded-[5px] bg-white/20 px-1.5 font-mono text-[10.5px] leading-[18px]">
        /
      </kbd>
    </button>
  );
}

/** Phones: a floating pill above the bottom nav on the pages where payments are entered. */
export function IsiPantasPill() {
  const pathname = usePathname();
  const { open, openSheet } = useIsiPantas();
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  // Rekod Bayaran is the list page; /bayaran/baru/ keeps its own fixed Simpan bar where the pill would sit.
  const show = path === "/matriks/" || path === "/bayaran/" || (/^\/kutipan\/[^/]+\/$/.test(path) && path !== "/kutipan/baru/");
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
      Isi Pantas
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
          className="isi-glass isi-aurora h-[82svh] gap-0 data-[side=bottom]:h-[82svh] rounded-t-[26px] border-0 p-0 pb-[env(safe-area-inset-bottom)]"
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
          <div aria-hidden className="relative mx-auto mt-2 mb-0.5 h-[5px] w-10 shrink-0 rounded-full bg-primary/30" />
          <Body data={data} view={view} onClose={close} mobile />
        </SheetContent>
      </Sheet>
    </>
  );
}

function Body({ data, view, onClose, mobile = false }: { data: Snapshot; view: View; onClose: () => void; mobile?: boolean }) {
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
    ? "Tampal teks, saya cadangkan isian"
    : thinking
      ? `Memadankan dengan ${activeMembers} ahli…`
      : open.length
        ? `${open.length} cadangan · belum disimpan`
        : lastSummary && lastSummary.count
          ? `${lastSummary.count} bayaran direkod`
          : lastSummary && lastSummary.undone
            ? `${lastSummary.undone} bayaran dibatalkan`
            : "Tampal teks lagi bila-bila masa";

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
      <div className="relative flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <span aria-hidden className={cn("isi-orb grid size-9 shrink-0 place-items-center rounded-xl", thinking && "isi-orb-spin")}>
          <Sparkles className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <Title id="isi-title" className="font-display text-[15px] leading-tight font-bold text-foreground">
            Isi Pantas
          </Title>
          <Description id="isi-sub" aria-live="polite" className="truncate text-[11.5px] text-muted-foreground">
            {subtitle}
          </Description>
        </div>
        <div className="ml-auto flex shrink-0 gap-1.5">
          {turns.length > 0 && (
            <Button variant="outline" size="icon-sm" className="bg-card" aria-label="Kosongkan perbualan" title="Kosongkan perbualan" disabled={busy} onClick={clear}>
              <Eraser />
            </Button>
          )}
          <Button variant="outline" size="icon-sm" className="bg-card" aria-label="Tutup Isi Pantas" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <ul aria-label="Konteks" className="relative mx-4 mb-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <li className="rounded-full border border-border bg-card px-2.5 py-0.5">
          Konteks: <b className="font-semibold text-foreground">{page}</b>
        </li>
        <li className="rounded-full border border-border bg-card px-2.5 py-0.5">
          <b className="font-semibold text-foreground">{activeMembers}</b> ahli
        </li>
        <li className="rounded-full border border-border bg-card px-2.5 py-0.5">
          <b className="font-semibold text-foreground">{activeCollections}</b> kutipan aktif
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
  const { setDraft } = useIsiPantas();
  return (
    <div className="grid gap-2.5 py-1.5">
      <div className="px-1.5 pt-2.5 pb-0.5 text-center">
        <Flower2 aria-hidden className="mx-auto size-8 text-primary" />
        <p className="mt-1 font-semibold">Malas taip satu-satu?</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Tampal mesej atau senarai bayaran. Saya padankan dengan ahli dan kutipan, anda pilih yang betul.</p>
      </div>
      <ul className="grid gap-2" aria-label="Contoh">
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
                <span className="block font-medium">{example.title}</span>
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
  const lines = turn.text.split(/\r?\n/).filter((line) => line.trim()).length;
  const confident = turn.items.filter((item) => isConfident(item.s)).length;
  const summary = turnSummary(turn);
  const steps = [`Baca ${lines} baris`, "Kenal pasti amaun & kaedah", `Padankan nama dengan ${activeMembers} ahli`, "Semak baki & pendua"];
  return (
    <div data-turn className="flex scroll-mt-2 flex-col gap-2.5">
      <div className="isi-bubble max-w-[88%] self-end rounded-[16px_16px_4px_16px] px-3 py-2.5 text-[12.5px] break-words whitespace-pre-wrap">
        <span className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold">
          <ClipboardPaste aria-hidden className="size-3" /> Ditampal · {lines} baris
        </span>
        {turn.text}
      </div>
      {turn.phase === "thinking" ? (
        <BotLine className="w-[240px]">
          <ol className="grid gap-1 text-[11.5px] text-muted-foreground" aria-label="Langkah">
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
              <>Saya tidak jumpa sebarang amaun. Tulis nama, amaun dan kutipan, contohnya “Farah 5 jamuan tunai”.</>
            ) : (
              <>
                Saya jumpa <b>{turn.items.length}</b> bayaran.{" "}
                {confident === turn.items.length
                  ? "Semua padan dengan yakin."
                  : confident === 0
                    ? `${turn.items.length} perlu semakan.`
                    : `${confident} padan dengan yakin, ${turn.items.length - confident} perlu semakan.`}
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

function issueText(code: IssueCode, item: Item, data: Snapshot, view: View) {
  const { s } = item;
  if (code === "NAME_UNMATCHED") return "Nama tidak dijumpai dalam senarai ahli";
  if (code === "NAME_AMBIGUOUS") return `Mungkin ${s.candidates.map((id) => view.membersById.get(id)?.name ?? id).join(" atau ")}`;
  if (code === "POSSIBLE_DUPLICATE") return "Mungkin pendua: amaun sama direkod dalam 7 hari lalu";
  if (code === "COLLECTION_UNKNOWN") return s.collectionId ? "Ahli ini tiada caj dalam kutipan ini" : "Kutipan tidak dikenal pasti";
  const charge = s.memberId && s.collectionId ? chargeFor(data, s.memberId, s.collectionId, s.periodId) : null;
  const ledger = charge ? view.ledgers.get(charge.id) : null;
  return ledger ? `Melebihi baki ${formatMoney(ledger.payable)}` : "Melebihi baki";
}

function targetLabel(collection: Collection | undefined, periodMonth: string | null) {
  if (!collection) return "Kutipan belum dipilih";
  return periodMonth ? `${collection.name} · ${formatMonth(periodMonth, false)}` : collection.name;
}

function SuggestionCard({ item, data, view }: { item: Item; data: Snapshot; view: View }) {
  const { accept, dismiss, busy } = useIsiPantas();
  const { s, status } = item;
  const member = s.memberId ? view.membersById.get(s.memberId) : undefined;
  const collection = s.collectionId ? view.collectionsById.get(s.collectionId) : undefined;
  const period = s.periodId ? data.periods.find((row) => row.id === s.periodId) : undefined;
  const live = status === "pending" || status === "undone";
  const warn = live && s.issues.length > 0;
  const canRecord = Boolean(s.memberId && s.collectionId) && !s.issues.includes("OVER_BALANCE") && !s.issues.includes("COLLECTION_UNKNOWN");
  const nameIssue = s.issues.includes("NAME_AMBIGUOUS") || s.issues.includes("NAME_UNMATCHED");
  const primary = !canRecord ? "Terima" : status === "undone" ? "Rekod semula" : nameIssue ? "Sahkan ahli" : s.issues.includes("POSSIBLE_DUPLICATE") ? "Rekod juga" : "Terima";
  const pct = Math.round(s.confidence * 100);
  const issuesId = `isi-issues-${s.id}`;
  const today_ = today();
  const what = [
    targetLabel(collection, period?.month ?? null),
    METHOD_SHORT[s.method],
    s.method === "transfer" ? "Menunggu semakan" : null,
    s.paidOn !== today_ ? formatDayShort(s.paidOn) : null,
  ].filter(Boolean);

  if (status === "dismissed")
    return (
      <div id={`isi-card-${s.id}`} tabIndex={-1} className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-1.5 text-[11.5px] text-muted-foreground outline-none">
        <span className="min-w-0 flex-1 truncate">
          Dibuang: {member?.name ?? "Ahli tidak dikenal pasti"} · {formatMoney(s.amountSen)}
        </span>
        <Button variant="link" size="xs" className="h-auto px-0" onClick={() => dismiss(s.id, true)}>
          Kembalikan
        </Button>
      </div>
    );

  const [before, amountText, after] = [s.quote.slice(0, s.amountSpan[0]), s.quote.slice(s.amountSpan[0], s.amountSpan[1]), s.quote.slice(s.amountSpan[1])];

  return (
    <article
      id={`isi-card-${s.id}`}
      tabIndex={-1}
      aria-label={`${member?.name ?? "Ahli tidak dikenal pasti"}, ${formatMoney(s.amountSen)}`}
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
          {member?.name ?? "Ahli tidak dikenal pasti"}
          {s.issues.includes("NAME_AMBIGUOUS") && live && "?"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {collection && <CollectionIcon collection={collection} size="xs" className="mr-1 inline-block align-[-2px]" />}
          {what.join(" · ")}
        </p>
        {live && item.files.length > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-primary-strong">
            <Paperclip aria-hidden className="size-3 shrink-0" /> {item.files.length} bukti akan dilampirkan
          </p>
        )}
        {warn && (
          <ul id={issuesId} className="mt-0.5 grid gap-0.5 text-[11px] font-medium text-st-partial">
            {s.issues.map((code) => (
              <li key={code} className="flex items-start gap-1">
                <TriangleAlert aria-hidden className="mt-[2px] size-3 shrink-0" />
                {issueText(code, item, data, view)}
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
          <span className="sr-only">Keyakinan</span>
          {pct}%
        </p>
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-1.5">
        {status === "accepted" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-st-paid-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-st-paid">
            <Check aria-hidden className="size-3.5" /> Direkod{s.method === "transfer" ? " · menunggu semakan" : ""}
          </span>
        ) : status === "applying" ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
            <Spinner className="size-3.5" /> Merekod…
          </span>
        ) : (
          <>
            <Button size="sm" className="h-7 rounded-[9px] px-2.5 text-[11.5px] font-semibold" disabled={!canRecord || busy} aria-describedby={warn ? issuesId : undefined} onClick={() => void accept([s.id])}>
              {primary}
            </Button>
            {status === "pending" && <EditPicker item={item} data={data} view={view} />}
            {status === "pending" && (
              <Button variant="danger-outline" size="icon-sm" className="size-7 rounded-[9px]" aria-label="Buang cadangan" title="Buang cadangan" disabled={busy} onClick={() => dismiss(s.id)}>
                <X />
              </Button>
            )}
            {status === "undone" && <span className="text-[11px] text-muted-foreground">Dibatalkan · kekal dalam sejarah</span>}
          </>
        )}
      </div>
      {item.error && (
        <p role="alert" className="col-span-full -mt-1 text-[11.5px] font-medium text-destructive">
          Tidak direkod: {item.error}
        </p>
      )}
    </article>
  );
}

/** "Ubah": pick the member and the charge (collection, month) this money belongs to. */
function EditPicker({ item, data, view }: { item: Item; data: Snapshot; view: View }) {
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
          list.push({ value: `${collection.id}|`, label: collection.name, note: "sukarela", disabled: false, collection });
        continue;
      }
      for (const charge of view.chargesByCollection.get(collection.id) ?? []) {
        if (charge.memberId !== memberId || charge.exempt) continue;
        const ledger = view.ledgers.get(charge.id)!;
        const month = charge.periodId ? (view.periodsByCollection.get(collection.id)?.find((p) => p.id === charge.periodId)?.month ?? null) : null;
        list.push({
          value: `${collection.id}|${charge.periodId ?? ""}`,
          label: targetLabel(collection, month),
          note: ledger.payable > 0 ? `baki ${formatMoney(ledger.payable)}` : "selesai",
          disabled: ledger.payable === 0,
          collection,
        });
      }
    }
    return list;
  }, [memberId, data.collections, view]);

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
          Ubah
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-3.5" aria-label="Ubah cadangan">
        <p className="mb-2.5 text-[13px] font-semibold">Ubah cadangan · {formatMoney(s.amountSen)}</p>
        <label className="mb-1 block text-xs font-medium" htmlFor={`isi-member-${s.id}`}>
          Ahli
        </label>
        <Select
          value={memberId}
          onValueChange={(value) => {
            setMemberId(value);
            setTarget("");
          }}
        >
          <SelectTrigger id={`isi-member-${s.id}`} className="w-full">
            <SelectValue placeholder="Pilih ahli" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {candidates.length > 0 && (
              <>
                <SelectGroup>
                  <SelectLabel>Cadangan</SelectLabel>
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
              <SelectLabel>Semua ahli</SelectLabel>
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
          Kutipan
        </label>
        <Select value={target} onValueChange={setTarget} disabled={!memberId}>
          <SelectTrigger id={`isi-target-${s.id}`} className="w-full">
            <SelectValue placeholder={memberId ? "Pilih kutipan" : "Pilih ahli dahulu"} />
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
            Batal
          </Button>
          <Button size="sm" disabled={!memberId || !target} onClick={save}>
            Simpan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Bulk, done, composer ----------------------------------------------------------------------

function BulkBar({ items }: { items: Item[] }) {
  const { acceptConfident, busy } = useIsiPantas();
  if (!items.length) return null;
  const confident = items.filter((item) => item.status === "pending" && isConfident(item.s)).length;
  const review = items.length - confident;
  return (
    <div className="isi-bulk relative mx-4 mb-2 flex items-center gap-2 rounded-[14px] border border-border px-3 py-2 text-[12px]">
      <span className="min-w-0">
        ✓ <b className="text-primary-strong">{confident}</b> yakin · <b className="text-primary-strong">{review}</b> perlu semak
      </span>
      <Button size="sm" className="brand-gradient ml-auto h-8 shrink-0 rounded-[10px] px-3 text-[12px] font-semibold" disabled={!confident || busy} onClick={() => void acceptConfident()}>
        Terima {confident} yang yakin
      </Button>
    </div>
  );
}

function DoneCard({ turn, onReveal }: { turn: Turn; onReveal?: () => void }) {
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
        <p className="font-semibold">Dibatalkan</p>
        <p className="text-muted-foreground">{summary.undone} bayaran dibatalkan dan kekal dalam sejarah Rekod Bayaran.</p>
      </div>
    );
  return (
    <div className="isi-done rounded-2xl border p-3 text-[12.5px]" role="status">
      <p className="text-[22px] leading-tight font-bold text-st-paid tabular-nums">+{formatMoney(summary.total)}</p>
      <p>
        {summary.count} bayaran direkod
        {summary.pending > 0 && ` · ${summary.pending} menunggu semakan (pindahan)`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="bg-card" disabled={busy} onClick={() => void undo(turn.id)}>
          Buat asal
        </Button>
        <Button size="sm" className="brand-gradient" onClick={reveal}>
          Lihat dalam Matriks
        </Button>
      </div>
    </div>
  );
}

function Composer() {
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
      setClipError("Papan klip tidak dapat dibaca. Tekan Ctrl/⌘ V dalam kotak.");
    }
  };
  return (
    <div className="isi-composer relative mx-3 mb-3 shrink-0 rounded-[18px] p-[2px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card">
      <div className="rounded-2xl bg-card px-2.5 pt-2.5 pb-2">
        <label htmlFor="isi-input" className="sr-only">
          Teks untuk Isi Pantas
        </label>
        <Textarea
          id="isi-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Tampal mesej WhatsApp, salinan penyata bank atau taip: “Farah 5 jamuan, Siti yuran Nov tunai”"
          className="max-h-40 min-h-[40px] resize-none rounded-none border-0 bg-transparent p-0 text-[12.5px] shadow-none md:text-[12.5px] focus-visible:ring-0 dark:bg-transparent"
        />
        {clipError && (
          <p role="alert" className="mt-1 text-[11px] text-destructive">
            {clipError}
          </p>
        )}
        {(proofOpen || draftFiles.length > 0) && (
          <div className="mt-2 border-t border-border pt-2">
            <p className="mb-1.5 text-[11px] text-muted-foreground">Bukti dilampirkan pada setiap bayaran yang anda terima daripada tampalan ini.</p>
            <ProofField staged={draftFiles} onChange={setDraftFiles} />
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            className="relative size-7 rounded-lg"
            aria-label="Lampirkan bukti (gambar atau PDF)"
            aria-expanded={proofOpen || draftFiles.length > 0}
            title="Lampirkan bukti (gambar atau PDF)"
            onClick={() => setProofOpen((open) => !open)}
          >
            <Paperclip />
            {draftFiles.length > 0 && (
              <span aria-hidden className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-primary-fill text-[9px] font-bold text-primary-foreground">
                {draftFiles.length}
              </span>
            )}
          </Button>
          <Button variant="outline" size="icon-sm" className="size-7 rounded-lg" aria-label="Tampal dari papan klip" title="Tampal dari papan klip" onClick={() => void paste()}>
            <ClipboardPaste />
          </Button>
          <span className="ml-1 hidden min-w-0 truncate text-[10.5px] text-muted-foreground sm:inline">Enter hantar · Shift+Enter baris baru</span>
          <Button size="sm" className="brand-gradient ml-auto h-[30px] rounded-[10px] px-3 text-[12px] font-semibold" disabled={!draft.trim() || busy} onClick={submit}>
            Cadangkan <Sparkles aria-hidden />
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
