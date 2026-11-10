"use client";

import { useSnapshot } from "@/components/data-provider";
import { CollectionIcon } from "@/components/collection-icon";
import { GhostBadge, useGhost } from "@/components/isi-pantas/ghost";
import { CellEditor, focusEditorStart } from "@/components/matrix/cell-editor";
import { DiscardDialog, useLastFocus, useOpener } from "@/components/matrix/editor-guard";
import { groupColumns, summarizeMember, type CollectionGroup } from "@/components/matrix/member-summary";
import { MonthTile } from "@/components/matrix/month-tile";
import { PaymentList } from "@/components/payments";
import { ChargeStatusChips, LabelChip } from "@/components/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatMoney, formatMoneyShort, formatMonthLong, initials } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { categoryLabels, cellStatusLabels, overdueLabel, pendingLabel } from "@/lib/labels";
import type { TFunction } from "@/lib/i18n/react";
import type { Member } from "@/lib/types";
import type { MatrixCell, MatrixColumn, View } from "@/lib/view";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, Phone } from "lucide-react";
import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";

// Desktop and tablet card view of the matrix. One card per member; clicking the card opens a
// side panel with every line editable in place, clicking a single line or month opens just
// that cell's editor in a popover. Phones keep MemberCards (bottom sheet) in matrix.tsx.

const PAGE = 36;

/** What one collection shows for one member: its cells, money totals and any waiting Isi Pantas amount. */
function lineFacts(view: View, member: Member, group: CollectionGroup, ghostFor: ReturnType<typeof useGhost>) {
  const cells = group.columns.map((column) => view.cell(member, column));
  const live = cells.filter((cell) => cell.kind !== "na");
  let paid = 0;
  let required = 0;
  let overdue = false;
  let pending = false;
  let suggested = 0;
  for (const cell of cells) {
    if (cell.kind === "charge") {
      paid += cell.ledger.confirmed;
      required += cell.ledger.required;
      overdue ||= cell.ledger.overdue;
      pending ||= cell.ledger.pending > 0;
    }
    const ghost = ghostFor(member.id, group.collection.id, cell.column.period?.id ?? null);
    if (ghost?.state === "suggested") suggested += ghost.amountSen;
  }
  return { cells, participates: live.length > 0, paid, required, overdue, pending, suggested };
}

function describeLine(t: TFunction, name: string, cell: MatrixCell, suggested: number) {
  const base =
    cell.kind === "na"
      ? cellStatusLabels.na[0]
      : cell.kind === "voluntary"
        ? t("matrix.contributionLower", { amount: formatMoney(cell.received) })
        : cell.status === "exempt"
          ? cellStatusLabels.exempt[0].toLowerCase()
          : t("matrix.paidOfRequired", { paid: formatMoney(cell.ledger.confirmed), required: formatMoney(cell.ledger.required) });
  return `${name}: ${base}${suggested > 0 ? t("card.suggestion", { amount: formatMoney(suggested) }) : ""}`;
}

function ProgressRing({ value }: { value: number }) {
  const t = useT();
  const r = 15;
  const c = 2 * Math.PI * r;
  const done = value >= 1;
  return (
    <span aria-hidden className="relative grid size-10 shrink-0 place-items-center" title={t("card.progressTitle", { percent: Math.round(value * 100) })}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-border" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          className={done ? "stroke-st-paid" : "stroke-primary"}
        />
      </svg>
      <span className="text-[10px] font-semibold tabular-nums">{Math.round(value * 100)}</span>
    </span>
  );
}

export const MemberCardGrid = memo(function MemberCardGrid({ rows, columns }: { rows: Member[]; columns: MatrixColumn[] }) {
  const t = useT();
  const { view } = useSnapshot();
  const ghostFor = useGhost();
  const groups = useMemo(() => groupColumns(columns), [columns]);
  const [limit, setLimit] = useState(PAGE);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [quick, setQuick] = useState<{ member: Member; column: MatrixColumn } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [guard, setGuard] = useState(false);
  const panelOpener = useOpener();
  const quickOpener = useOpener();
  const lastFocus = useLastFocus();
  const anchor = useRef<HTMLElement | null>(null);

  const openPanel = (member: Member, element: HTMLElement) => {
    panelOpener.remember(element);
    setPanelId(member.id);
    setPanelOpen(true);
  };
  const openQuick = (member: Member, column: MatrixColumn, element: HTMLElement) => {
    quickOpener.remember(element);
    anchor.current = element;
    setQuick({ member, column });
  };
  const closeQuick = () => {
    setQuick(null);
    setDirty(false);
    setGuard(false);
  };
  const quickCell = quick ? view.cell(quick.member, quick.column) : null;

  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
        {rows.slice(0, limit).map((member) => {
          const summary = summarizeMember(view, member, columns);
          const ratio = summary.requiredNow > 0 ? summary.confirmedNow / summary.requiredNow : 1;
          const hidden = groups.filter((group) => !lineFacts(view, member, group, ghostFor).participates).length;
          const label = `${member.name}, ${summary.dueNow > 0 ? t("card.dueLabel", { amount: formatMoney(summary.dueNow) }) : t("card.settledLabel")}${member.active ? "" : `, ${t("card.inactiveLabel")}`}`;
          return (
            <li
              key={member.id}
              className={cn(
                "group/card @container relative flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4",
                "transition-[transform,box-shadow,border-color] duration-150 ease-out hover:border-primary/40 hover:shadow-md motion-safe:hover:-translate-y-0.5",
                "has-[[data-member-card]:focus-visible]:ring-2 has-[[data-member-card]:focus-visible]:ring-ring",
                !member.active && "bg-muted/40",
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarFallback className="bg-primary-light text-xs font-semibold text-primary-strong">{initials(member.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {/* Stretched button: the whole card opens the panel; lines and tiles sit above it (z-10). */}
                  <button
                    type="button"
                    data-member-card={member.id}
                    aria-label={label}
                    onClick={(event) => openPanel(member, event.currentTarget)}
                    className="block max-w-full truncate rounded text-left text-[15px] font-semibold outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                  >
                    {member.name}
                  </button>
                  <p aria-hidden className={cn("text-xs tabular-nums", summary.dueNow > 0 ? "font-semibold text-st-unpaid" : "font-semibold text-st-paid")}>
                    {summary.dueNow > 0 ? t("matrix.balance", { amount: formatMoney(summary.dueNow) }) : t("matrix.settled")}
                  </p>
                  {!member.active && <span className="mt-0.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{t("matrix.inactive")}</span>}
                </div>
                <ProgressRing value={ratio} />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {groups.map((group) => {
                  const facts = lineFacts(view, member, group, ghostFor);
                  if (!facts.participates) return null;
                  const { collection } = group;
                  if (collection.type === "monthly") {
                    return (
                      <div key={collection.id} className="rounded-xl bg-primary-tint/60 p-2">
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs">
                          <CollectionIcon collection={collection} size="xs" />
                          <span className="min-w-0 flex-1 truncate font-medium">{collection.name}</span>
                          {facts.suggested > 0 && <GhostBadge amountSen={facts.suggested} />}
                          <span className="shrink-0 tabular-nums">
                            <b className="font-semibold">{formatMoneyShort(facts.paid)}</b>
                            <span className="text-muted-foreground"> / {formatMoneyShort(facts.required)}</span>
                          </span>
                        </div>
                        <div className="relative z-10 grid grid-cols-6 gap-1 @[19rem]:grid-cols-12 @[19rem]:gap-0.5">
                          {facts.cells.map((cell) => (
                            <MonthTile compact key={cell.column.key} cell={cell} onOpen={(element) => openQuick(member, cell.column, element)} />
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const cell = facts.cells[0];
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      aria-label={describeLine(t, collection.name, cell, facts.suggested)}
                      onClick={(event) => {
                        event.stopPropagation();
                        openQuick(member, cell.column, event.currentTarget);
                      }}
                      className="relative z-10 flex min-h-10 items-center gap-2 rounded-xl border border-border px-2.5 py-1.5 text-left transition-colors duration-100 hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <CollectionIcon collection={collection} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{collection.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                          <span className="whitespace-nowrap">
                            {cell.kind === "voluntary"
                              ? t("matrix.contribution", { amount: formatMoney(cell.received) })
                              : cell.kind === "charge" && cell.status === "exempt"
                                ? t("matrix.noCharge")
                                : `${formatMoney(facts.paid)} / ${formatMoney(facts.required)}`}
                          </span>
                          {facts.suggested > 0 && <GhostBadge amountSen={facts.suggested} />}
                        </span>
                      </span>
                      {cell.kind === "charge" && <ChargeStatusChips status={cell.status} overdue={cell.ledger.overdue} pending={cell.ledger.pending > 0} compact className="max-w-[50%] justify-end" />}
                    </button>
                  );
                })}
              </div>
              {hidden > 0 && <p className="text-xs text-muted-foreground">{t("card.notApplicableCount", { count: hidden })}</p>}
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <Button variant="outline" className="self-center" onClick={() => setLimit(limit + PAGE)}>
          {t("matrix.showMore", { count: rows.length - limit })}
        </Button>
      )}

      <Popover open={quick !== null} onOpenChange={(open) => !open && closeQuick()}>
        <PopoverAnchor virtualRef={anchor as RefObject<HTMLElement>} />
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="max-h-[calc(100svh-24px)] w-[360px] overflow-y-auto rounded-2xl border-border p-4 shadow-[0_24px_48px_-20px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
          aria-label={quickCell ? t("editor.cellLabel", { member: quickCell.member.name, column: quickCell.column.label }) : undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusEditorStart(event.currentTarget as HTMLElement);
          }}
          onCloseAutoFocus={quickOpener.restore}
          onFocusCapture={lastFocus.onFocusCapture}
          onInteractOutside={(event) => {
            if (guard) return event.preventDefault();
            if (dirty) {
              event.preventDefault();
              setGuard(true);
            }
          }}
        >
          {quickCell && <CellEditor cell={quickCell} onDone={closeQuick} onDirtyChange={setDirty} />}
        </PopoverContent>
      </Popover>
      <DiscardDialog open={guard} onKeep={() => setGuard(false)} onDiscard={closeQuick} restoreFocus={lastFocus.restore} />

      <MemberPanel
        open={panelOpen}
        memberId={panelId}
        rows={rows}
        columns={columns}
        groups={groups}
        onOpenChange={setPanelOpen}
        onNavigate={(id) => {
          setPanelId(id);
          const index = rows.findIndex((row) => row.id === id);
          if (index >= limit) setLimit(Math.ceil((index + 1) / PAGE) * PAGE);
        }}
        fallbackFocus={panelOpener.ref}
      />
    </>
  );
});

// Side panel -------------------------------------------------------------------------------

const EDITABLE = "input,textarea,select,[contenteditable=true],[role=tab],[role=radio],[role=combobox],[role=listbox],[role=menu],[role=slider],[role=spinbutton]";

function MemberPanel({
  open,
  memberId,
  rows,
  columns,
  groups,
  onOpenChange,
  onNavigate,
  fallbackFocus,
}: {
  open: boolean;
  memberId: string | null;
  rows: Member[];
  columns: MatrixColumn[];
  groups: CollectionGroup[];
  onOpenChange: (open: boolean) => void;
  onNavigate: (memberId: string) => void;
  fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const { view } = useSnapshot();
  const ghostFor = useGhost();
  const member = memberId ? (view.membersById.get(memberId) ?? null) : null;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // The action waiting behind the discard dialog (close, change line, change member).
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const lastFocus = useLastFocus();
  const lastIndex = useRef(0);

  const index = rows.findIndex((row) => row.id === memberId);
  if (index >= 0) lastIndex.current = index;
  const previous = index >= 0 ? rows[index - 1] : rows[lastIndex.current - 1];
  const next = index >= 0 ? rows[index + 1] : rows[lastIndex.current];

  useEffect(() => {
    if (!open) {
      setExpanded(null);
      setDirty(false);
      setPendingAction(null);
    }
  }, [open]);

  const attempt = (action: () => void) => {
    if (dirty) setPendingAction(() => action);
    else action();
  };
  const reset = () => {
    setDirty(false);
    setExpanded(null);
  };
  const go = (target: Member | undefined) => {
    if (!target) return;
    attempt(() => {
      reset();
      setShowAllPayments(false);
      onNavigate(target.id);
    });
  };
  const toggle = (key: string) =>
    attempt(() => {
      setDirty(false);
      setExpanded((current) => (current === key ? null : key));
    });

  const summary = member ? summarizeMember(view, member, columns) : null;
  const payments = member ? view.paymentsFor(member.id, null) : [];
  const shownPayments = showAllPayments ? payments : payments.slice(0, 6);

  const lines = member
    ? groups.map((group) => ({ group, facts: lineFacts(view, member, group, ghostFor) }))
    : [];

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
        <SheetContent
          side="right"
          className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
          onFocusCapture={lastFocus.onFocusCapture}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const card = memberId ? document.querySelector<HTMLElement>(`[data-member-card="${CSS.escape(memberId)}"]`) : null;
            (card ?? (fallbackFocus.current?.isConnected ? fallbackFocus.current : null))?.focus();
          }}
          onInteractOutside={(event) => {
            if (pendingAction) return event.preventDefault();
            if (dirty) {
              event.preventDefault();
              setPendingAction(() => () => onOpenChange(false));
            }
          }}
          onKeyDown={(event) => {
            if (event.defaultPrevented || pendingAction || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
            event.preventDefault();
            go(event.key === "ArrowUp" ? previous : next);
          }}
        >
          {member && summary && (
            <>
              <SheetHeader className="gap-3 border-b border-border p-4 pr-12">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11">
                    <AvatarFallback className="bg-primary-light text-sm font-semibold text-primary-strong">{initials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <SheetTitle className="truncate text-lg font-semibold">{member.name}</SheetTitle>
                    <SheetDescription className="flex flex-wrap items-center gap-x-2 text-xs">
                      <span>{member.category ? categoryLabels[member.category] : t("card.noCategory")}</span>
                      {member.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" aria-hidden />
                          {member.phone}
                        </span>
                      )}
                      {!member.active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{t("matrix.inactive")}</span>}
                    </SheetDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" disabled={!previous} onClick={() => go(previous)} title={t("card.previousTitle")}>
                    <ChevronUp /> {t("card.previous")}
                    {previous && <span className="sr-only">: {previous.name}</span>}
                  </Button>
                  <Button variant="outline" size="sm" disabled={!next} onClick={() => go(next)} title={t("card.nextTitle")}>
                    <ChevronDown /> {t("card.next")}
                    {next && <span className="sr-only">: {next.name}</span>}
                  </Button>
                  <span aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
                    {index >= 0 ? `${index + 1} / ${rows.length}` : t("card.notInList")}
                  </span>
                  <Link href={`/ahli/${member.id}/`} className="ml-auto inline-flex items-center gap-1 rounded text-xs font-medium text-primary-strong underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    {t("card.fullProfile")} <ExternalLink className="size-3" aria-hidden />
                  </Link>
                </div>
              </SheetHeader>
              <div key={member.id} className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <dl className="grid grid-cols-2 gap-2">
                  <Total label={t("card.dueNow")} value={formatMoney(summary.requiredNow)} />
                  <Total label={t("card.received")} value={formatMoney(summary.received)} />
                  <Total label={t("card.balance")} value={summary.dueNow > 0 ? formatMoney(summary.dueNow) : t("matrix.settled")} tone={summary.dueNow > 0 ? "text-st-unpaid" : "text-st-paid"} />
                  <Total label={pendingLabel[0]} value={formatMoney(summary.pending)} tone={summary.pending > 0 ? "text-st-pending" : undefined} />
                </dl>

                <h3 className="mt-5 mb-2 text-sm font-semibold">{t("card.collections")}</h3>
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
                  {lines
                    .filter(({ facts }) => facts.participates)
                    .map(({ group, facts }) => (
                      <PanelGroup key={group.collection.id} group={group} facts={facts} expanded={expanded} onToggle={toggle} onDone={reset} onDirtyChange={setDirty} />
                    ))}
                </ul>
                {lines.some(({ facts }) => !facts.participates) && (
                  <>
                    <h3 className="mt-5 mb-2 text-sm font-semibold text-muted-foreground">{cellStatusLabels.na[0]}</h3>
                    <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
                      {lines
                        .filter(({ facts }) => !facts.participates)
                        .map(({ group, facts }) => (
                          <PanelLine
                            key={group.collection.id}
                            cell={facts.cells[0]}
                            name={group.collection.name}
                            collection={group.collection}
                            suggested={0}
                            expanded={expanded}
                            onToggle={toggle}
                            onDone={reset}
                            onDirtyChange={setDirty}
                          />
                        ))}
                    </ul>
                  </>
                )}

                <h3 className="mt-5 mb-2 text-sm font-semibold">{t("card.history")}</h3>
                <PaymentList payments={shownPayments} />
                {payments.length > 6 && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAllPayments(!showAllPayments)}>
                    {showAllPayments ? t("card.showLess") : t("card.showAll", { count: payments.length })}
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <DiscardDialog
        open={pendingAction !== null}
        onKeep={() => setPendingAction(null)}
        onDiscard={() => {
          const action = pendingAction;
          setPendingAction(null);
          setDirty(false);
          action?.();
        }}
        restoreFocus={lastFocus.restore}
      />
    </>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-primary-tint/60 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-base font-semibold tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

function PanelGroup({
  group,
  facts,
  expanded,
  onToggle,
  onDone,
  onDirtyChange,
}: {
  group: CollectionGroup;
  facts: ReturnType<typeof lineFacts>;
  expanded: string | null;
  onToggle: (key: string) => void;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { collection } = group;
  if (collection.type !== "monthly")
    return <PanelLine cell={facts.cells[0]} name={collection.name} collection={collection} suggested={facts.suggested} expanded={expanded} onToggle={onToggle} onDone={onDone} onDirtyChange={onDirtyChange} />;
  return (
    <li className="rounded-xl border border-border p-1.5">
      <div className="flex items-center gap-2 px-2 py-1.5 text-[13px] font-medium">
        <CollectionIcon collection={collection} size="sm" />
        <span className="min-w-0 flex-1 truncate">{collection.name}</span>
        <span className="shrink-0 text-xs tabular-nums">
          <b className="font-semibold">{formatMoneyShort(facts.paid)}</b>
          <span className="text-muted-foreground"> / {formatMoneyShort(facts.required)}</span>
        </span>
        {facts.overdue && <LabelChip entry={overdueLabel} compact />}
        {facts.pending && <LabelChip entry={pendingLabel} compact />}
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
        {facts.cells
          .filter((cell) => cell.kind !== "na")
          .map((cell) => (
            <PanelLine
              key={cell.column.key}
              cell={cell}
              name={cell.column.period ? formatMonthLong(cell.column.period.month) : cell.column.label}
              collection={null}
              suggested={0}
              expanded={expanded}
              onToggle={onToggle}
              onDone={onDone}
              onDirtyChange={onDirtyChange}
            />
          ))}
      </ul>
    </li>
  );
}

/** One accordion line: a button with the line's figures, and the real CellEditor below while it is open. */
function PanelLine({
  cell,
  name,
  collection,
  suggested,
  expanded,
  onToggle,
  onDone,
  onDirtyChange,
}: {
  cell: MatrixCell;
  name: string;
  collection: MatrixCell["column"]["collection"] | null;
  suggested: number;
  expanded: string | null;
  onToggle: (key: string) => void;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useT();
  const { view } = useSnapshot();
  const key = cell.column.key;
  const open = expanded === key;
  const live = view.cell(cell.member, cell.column);
  const root = useRef<HTMLLIElement>(null);
  const panelId = `line-${key.replace(/[^\w-]/g, "_")}`;
  useEffect(() => {
    if (open) requestAnimationFrame(() => root.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [open]);
  return (
    <li ref={root} className={cn("rounded-xl border border-transparent", collection && "border-border", open && "border-primary/40 bg-primary-tint/30")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={describeLine(t, name, live, suggested)}
        onClick={() => onToggle(key)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors duration-100 hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {collection && <CollectionIcon collection={collection} size="sm" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            {live.kind === "na"
              ? t("card.includeHint")
              : live.kind === "voluntary"
                ? t("matrix.contribution", { amount: formatMoney(live.received) })
                : live.status === "exempt"
                  ? t("matrix.noCharge")
                  : `${formatMoney(live.ledger.confirmed)} / ${formatMoney(live.ledger.required)}`}
            {suggested > 0 && <GhostBadge amountSen={suggested} />}
          </span>
        </span>
        {live.kind === "charge" && <ChargeStatusChips status={live.status} overdue={live.ledger.overdue} pending={live.ledger.pending > 0} compact className="max-w-[45%] justify-end" />}
        <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      {open && (
        <div id={panelId} className="px-3 pt-1 pb-3">
          <CellEditor hideTitle cell={live} onDone={onDone} onDirtyChange={onDirtyChange} />
        </div>
      )}
    </li>
  );
}
