"use client";

import { AddCollectionDialog } from "@/components/add-collection-dialog";
import { AddMemberDialog } from "@/components/add-member-dialog";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { CellEditor, focusEditorStart } from "@/components/matrix/cell-editor";
import { MonthTile } from "@/components/matrix/month-tile";
import { ChargeStatusChips, EmptyState, FilterPills, Money, PageHeader, PageShell, SearchInput, StatusChip } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { messageFor } from "@/lib/errors";
import { formatMoney, formatMoneyShort, formatMonth, initials } from "@/lib/format";
import { cellStatusLabels } from "@/lib/labels";
import { monthOf } from "@/lib/money/months";
import type { Collection, CollectionStatus, Member, Sen } from "@/lib/types";
import { sortCollections, type MatrixCell, type MatrixColumn } from "@/lib/view";
import { cn } from "@/lib/utils";
import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import {
  ArrowDownUp,
  Archive,
  Columns3,
  EllipsisVertical,
  ExternalLink,
  EyeOff,
  LayoutGrid,
  Pencil,
  Plus,
  Rows3,
  Sheet as SheetIcon,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { toast } from "sonner";

// The Excel-like tracker: members are rows, collections (or months of a monthly
// collection) are columns, each cell is one member's charge. It is a view over normalised
// records. Adding a row creates a member; adding a column creates a collection; typing in
// a cell records a payment transaction. Status is always derived, never typed.

type RowFilter = "all" | "owing" | "overdue" | "pending" | "settled";
type MonthScope = "all" | "to_date";
type Sort = "name" | "owing";
type Active = { r: number; c: number };

const MEMBER_COL_W = 224;

// Frozen-column edges. The scroller carries data-at-start / data-at-end (set from its scroll
// position, not React state, so scrolling never re-renders the grid); each edge shadow shows
// only while content is hidden behind that frozen column.
const LEFT_EDGE =
  "border-r-grid-edge after:pointer-events-none after:absolute after:inset-y-0 after:left-[calc(100%+1px)] after:w-3 after:bg-linear-to-r after:from-grid-shadow after:to-transparent after:opacity-0 group-data-[at-start=false]/grid:after:opacity-100";
const RIGHT_EDGE =
  "border-l-grid-edge before:pointer-events-none before:absolute before:inset-y-0 before:right-[calc(100%+1px)] before:w-3 before:bg-linear-to-l before:from-grid-shadow before:to-transparent before:opacity-0 group-data-[at-end=false]/grid:before:opacity-100";
// Row highlight on hover, and for the active cell's row while the grid has focus or the editor
// is open. Background colour only, 100ms.
const ROW_FADE = "transition-[background-color] duration-100";
// PageUp / PageDown step, in rows.
const PAGE_ROWS = 10;

/** Remembers the element that opened a controlled overlay (no Radix Trigger) to hand focus back on close. */
function useOpener() {
  const ref = useRef<HTMLElement | null>(null);
  const remember = () => {
    ref.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const restore = (event: Event) => {
    if (!ref.current?.isConnected) return; // opener gone (e.g. an empty state replaced): keep Radix's default
    event.preventDefault();
    ref.current.focus();
  };
  return { ref, remember, restore };
}

/** Tracks the last focused control inside an editor, so "Teruskan edit" can put focus back there. */
function useLastFocus() {
  const ref = useRef<HTMLElement | null>(null);
  const onFocusCapture = (event: { target: EventTarget }) => {
    if (event.target instanceof HTMLElement) ref.current = event.target;
  };
  const restore = () => requestAnimationFrame(() => ref.current?.isConnected && ref.current.focus());
  return { onFocusCapture, restore };
}

export function MatrixPage() {
  const { data, view } = useSnapshot();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [monthScope, setMonthScope] = useState<MonthScope>("all");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<Sort>("name");
  const [layout, setLayout] = useState<"auto" | "grid" | "cards">("auto");
  const [addMember, setAddMember] = useState(false);
  const [addColumn, setAddColumn] = useState(false);
  const memberOpener = useOpener();
  const columnOpener = useOpener();
  const openAddMember = () => {
    memberOpener.remember();
    setAddMember(true);
  };
  const openAddColumn = () => {
    columnOpener.remember();
    setAddColumn(true);
  };

  const collections = useMemo(
    () =>
      sortCollections(data.collections).filter(
        (collection) => collection.status === "active" || collection.status === "draft" || (showCompleted && collection.status === "completed"),
      ),
    [data.collections, showCompleted],
  );
  const visibleCollections = collections.filter((collection) => !hidden[collection.id]);
  const thisMonth = monthOf(view.today);
  const columns = useMemo(
    () => view.columns(visibleCollections).filter((column) => monthScope === "all" || !column.period || column.period.month <= thisMonth),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleCollections derives from these
    [view, collections, hidden, monthScope, thisMonth],
  );

  const rowSummary = useCallback(
    (member: Member) => {
      let dueNow = 0;
      let overdue = false;
      let pending = false;
      let anyCharge = false;
      for (const column of columns) {
        const cell = view.cell(member, column);
        if (cell.kind !== "charge") continue;
        anyCharge = true;
        if (!cell.ledger.future) dueNow += cell.ledger.remaining;
        overdue ||= cell.ledger.overdue;
        pending ||= cell.ledger.pending > 0;
      }
      return { dueNow, overdue, pending, anyCharge };
    },
    [columns, view],
  );

  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = data.members
      .filter((member) => showInactive || member.active)
      .filter((member) => !q || member.name.toLowerCase().includes(q))
      .map((member) => ({ member, summary: rowSummary(member) }))
      .filter(({ summary }) => {
        if (rowFilter === "owing") return summary.dueNow > 0;
        if (rowFilter === "overdue") return summary.overdue;
        if (rowFilter === "pending") return summary.pending;
        if (rowFilter === "settled") return summary.anyCharge && summary.dueNow === 0;
        return true;
      });
    rows.sort((a, b) => (sort === "owing" ? b.summary.dueNow - a.summary.dueNow : 0) || a.member.name.localeCompare(b.member.name, "ms"));
    return rows;
  }, [data.members, query, rowFilter, rowSummary, showInactive, sort]);

  const totals = useMemo(() => {
    let expected = 0;
    let received = 0;
    let dueNow = 0;
    let pending = 0;
    for (const { member } of members) {
      for (const column of columns) {
        const cell = view.cell(member, column);
        if (cell.kind === "charge") {
          expected += cell.ledger.required;
          received += cell.ledger.confirmed;
          pending += cell.ledger.pending;
          if (!cell.ledger.future) dueNow += cell.ledger.remaining;
        } else if (cell.kind === "voluntary") {
          received += cell.received;
          pending += cell.pending;
        }
      }
    }
    return { expected, received, dueNow, pending };
  }, [members, columns, view]);

  const showGrid = layout === "grid" || (layout === "auto" && !isMobile);

  return (
    <PageShell className="max-w-none lg:px-6">
      <PageHeader
        title="Matriks Kutipan"
        description="Setiap baris seorang ahli, setiap lajur satu kutipan atau bulan. Klik sel untuk rekod bayaran; Enter untuk edit, anak panah untuk bergerak."
        actions={
          <>
            <Button variant="brand" onClick={openAddMember}>
              <UserPlus /> Tambah ahli
            </Button>
            <Button onClick={openAddColumn}>
              <Plus /> Tambah kutipan
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Figure label="Dijangka (paparan ini)" value={totals.expected} />
        <Figure label="Diterima" value={totals.received} tone="paid" />
        <Figure label="Baki semasa" value={totals.dueNow} tone={totals.dueNow > 0 ? "unpaid" : undefined} />
        <Figure label="Menunggu semakan" value={totals.pending} tone={totals.pending > 0 ? "pending" : undefined} />
      </div>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <SearchInput id="matrix-search" value={query} onChange={setQuery} placeholder="Cari ahli…" />
          <FilterPills
            label="Tapis baris"
            value={rowFilter}
            onChange={setRowFilter}
            options={[
              { value: "all", label: "Semua" },
              { value: "owing", label: "Ada baki" },
              { value: "overdue", label: "Lewat" },
              { value: "pending", label: "Menunggu" },
              { value: "settled", label: "Selesai" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 /> Lajur
                {Object.values(hidden).some(Boolean) && <span className="text-primary-strong">•</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Tunjuk kutipan</DropdownMenuLabel>
              {collections.map((collection) => (
                <DropdownMenuCheckboxItem
                  key={collection.id}
                  checked={!hidden[collection.id]}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(value) => setHidden((current) => ({ ...current, [collection.id]: !value }))}
                >
                  <span className="truncate">{collection.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={monthScope === "to_date"} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setMonthScope(v ? "to_date" : "all")}>
                Sembunyi bulan akan datang
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showCompleted} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setShowCompleted(v === true)}>
                Tunjuk kutipan selesai
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showInactive} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setShowInactive(v === true)}>
                Tunjuk ahli tidak aktif
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Accessible name leads with the visible text (label in name). */}
          <Button variant="outline" size="sm" onClick={() => setSort(sort === "name" ? "owing" : "name")}>
            <ArrowDownUp /> {sort === "name" ? "Nama A–Z" : "Baki tertinggi"}
            <span className="sr-only">, tukar susunan</span>
          </Button>
          <div className="flex rounded-[10px] border border-border bg-card p-0.5 md:hidden" role="group" aria-label="Paparan">
            <button
              type="button"
              aria-pressed={!showGrid}
              onClick={() => setLayout("cards")}
              className={cn("flex h-8 items-center gap-1 rounded-[7px] px-2.5 text-xs", !showGrid && "bg-primary-light font-semibold text-primary-strong")}
            >
              <Rows3 className="size-3.5" /> Kad
            </button>
            <button
              type="button"
              aria-pressed={showGrid}
              onClick={() => setLayout("grid")}
              className={cn("flex h-8 items-center gap-1 rounded-[7px] px-2.5 text-xs", showGrid && "bg-primary-light font-semibold text-primary-strong")}
            >
              <LayoutGrid className="size-3.5" /> Jadual
            </button>
          </div>
        </div>
      </div>

      {data.members.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Belum ada ahli"
          description="Tambah guru dan kakitangan dahulu. Setiap ahli menjadi satu baris."
          action={<Button onClick={openAddMember}>Tambah ahli pertama</Button>}
        />
      ) : columns.length === 0 ? (
        <EmptyState
          icon={SheetIcon}
          title="Tiada kutipan untuk dipaparkan"
          description="Tambah kutipan untuk mula menjejak bayaran, atau tunjuk semula lajur yang disembunyikan."
          action={<Button onClick={openAddColumn}>Tambah kutipan</Button>}
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Rows3}
          title="Tiada ahli sepadan"
          description={rowFilter === "owing" || rowFilter === "overdue" ? "Semua ahli dalam paparan ini sudah menjelaskan bayaran." : "Cuba carian atau penapis lain."}
        />
      ) : showGrid ? (
        <Grid rows={members.map((row) => row.member)} columns={columns} collections={visibleCollections} onHide={(id) => setHidden((h) => ({ ...h, [id]: true }))} />
      ) : (
        <MemberCards rows={members.map((row) => row.member)} columns={columns} />
      )}

      <AddMemberDialog open={addMember} onOpenChange={setAddMember} onCloseAutoFocus={memberOpener.restore} />
      <AddCollectionDialog open={addColumn} onOpenChange={setAddColumn} onCloseAutoFocus={columnOpener.restore} />
    </PageShell>
  );
}

function Figure({ label, value, tone }: { label: string; value: Sen; tone?: "paid" | "unpaid" | "pending" }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[17px] font-bold tracking-[-.01em] tabular-nums md:text-lg",
          tone === "paid" && "text-st-paid",
          tone === "unpaid" && "text-st-unpaid",
          tone === "pending" && "text-st-pending",
        )}
      >
        {formatMoney(value)}
      </p>
    </div>
  );
}

// Desktop grid -----------------------------------------------------------------------------

function Grid({
  rows,
  columns,
  collections,
  onHide,
}: {
  rows: Member[];
  columns: MatrixColumn[];
  collections: Collection[];
  onHide: (collectionId: string) => void;
}) {
  const { view } = useSnapshot();
  const [active, setActive] = useState<Active>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ initial?: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  // Outside click with unsaved input asks first; Esc and Batal are explicit cancels and discard.
  const [guard, setGuard] = useState(false);
  const [archiving, setArchiving] = useState<Collection | null>(null);
  const lastFocus = useLastFocus();
  const scroller = useRef<HTMLDivElement>(null);
  const groupRow = useRef<HTMLTableRowElement>(null);
  // The month row sticks directly under the group row; measured so no body cell shows
  // through a gap when the group labels wrap or grow.
  const [groupRowH, setGroupRowH] = useState(41);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.dataset.atStart = String(el.scrollLeft <= 1);
      el.dataset.atEnd = String(el.scrollLeft >= max - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  // Keep the active cell inside the grid when filters shrink it.
  const r = Math.min(active.r, rows.length - 1);
  const c = Math.min(active.c, columns.length - 1);

  const focusCell = useCallback((row: number, col: number) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
    el?.focus({ preventScroll: false });
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Targets are absolute and clamped: movement never wraps into the next or previous row.
  const go = (row: number, col: number) => {
    const nr = Math.max(0, Math.min(rows.length - 1, row));
    const nc = Math.max(0, Math.min(columns.length - 1, col));
    setActive({ r: nr, c: nc });
    requestAnimationFrame(() => focusCell(nr, nc));
  };

  // APG grid keys. Tab is not handled: the grid is one tab stop (roving tabindex) and Tab leaves it.
  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (editing) return;
    const target = event.target as HTMLElement;
    if (!target.dataset.cell) return;
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    const lastRow = rows.length - 1;
    const lastCol = columns.length - 1;
    if (key === "ArrowDown") go(r + 1, c);
    else if (key === "ArrowUp") go(r - 1, c);
    else if (key === "ArrowRight") go(r, c + 1);
    else if (key === "ArrowLeft") go(r, c - 1);
    else if (key === "PageDown") go(r + PAGE_ROWS, c);
    else if (key === "PageUp") go(r - PAGE_ROWS, c);
    else if (key === "Home") go(mod ? 0 : r, 0);
    else if (key === "End") go(mod ? lastRow : r, lastCol);
    else if (key === "Enter" || key === "F2") setEditing({});
    else if (/^[0-9.]$/.test(key) && !event.ctrlKey && !event.metaKey) setEditing({ initial: key });
    else return;
    event.preventDefault();
  };

  const close = () => {
    setEditing(null);
    setDirty(false);
    setGuard(false);
    requestAnimationFrame(() => focusCell(r, c));
  };

  const editorLabel = (member: Member, column: MatrixColumn) => `Ubah sel: ${member.name}, ${column.label}`;

  const table = useReactTable({
    data: rows,
    columns: useMemo<ColumnDef<Member>[]>(
      () =>
        collections
          .map((collection) => {
            const leafs = columns.filter((column) => column.collection.id === collection.id);
            if (!leafs.length) return null;
            const leafDefs: ColumnDef<Member>[] = leafs.map((column) => ({ id: column.key, meta: column }));
            return collection.type === "monthly"
              ? ({ id: `group:${collection.id}`, meta: collection, columns: leafDefs } as ColumnDef<Member>)
              : ({ ...leafDefs[0], meta: { ...leafs[0], single: true } } as ColumnDef<Member>);
          })
          .filter(Boolean) as ColumnDef<Member>[],
      [collections, columns],
    ),
    getCoreRowModel: getCoreRowModel(),
  });
  const headerGroups = table.getHeaderGroups();
  const hasGroups = headerGroups.length > 1;

  useLayoutEffect(() => {
    const el = groupRow.current;
    if (!el || !hasGroups) return;
    const measure = () => setGroupRowH(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasGroups]);

  const rowTotals = (member: Member) => {
    let dueNow = 0;
    for (const column of columns) {
      const cell = view.cell(member, column);
      if (cell.kind === "charge" && !cell.ledger.future) dueNow += cell.ledger.remaining;
    }
    return dueNow;
  };

  const columnTotal = (column: MatrixColumn) => {
    let expected = 0;
    let received = 0;
    for (const member of rows) {
      const cell = view.cell(member, column);
      if (cell.kind === "charge") {
        expected += cell.ledger.required;
        received += cell.ledger.confirmed;
      } else if (cell.kind === "voluntary") received += cell.received;
    }
    return { expected, received, voluntary: column.collection.type === "voluntary" };
  };

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,.03)]">
      <div ref={scroller} className="group/grid max-h-[calc(100svh-15rem)] min-h-64 overflow-auto overscroll-contain rounded-2xl">
        {/* All rows and columns are rendered, so the counts equal the DOM: header rows + members + footer. */}
        <table
          role="grid"
          aria-label="Matriks kutipan"
          aria-rowcount={headerGroups.length + rows.length + 1}
          aria-colcount={columns.length + 2}
          onKeyDown={onKeyDown}
          className="border-separate border-spacing-0 text-[13px]"
        >
          <thead>
            {headerGroups.map((group, gi) => (
              <tr key={group.id} ref={gi === 0 ? groupRow : undefined}>
                {gi === 0 && (
                  <th
                    scope="col"
                    rowSpan={headerGroups.length}
                    style={{ width: MEMBER_COL_W, minWidth: MEMBER_COL_W }}
                    className={cn("sticky top-0 left-0 z-30 border-r border-b border-border bg-primary-tint px-4 text-left align-bottom text-xs font-semibold text-muted-foreground", LEFT_EDGE)}
                  >
                    <div className="py-3">Ahli ({rows.length})</div>
                  </th>
                )}
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta as (MatrixColumn & { single?: boolean }) | Collection;
                  const isGroup = !header.isPlaceholder && header.subHeaders.length > 0;
                  const single = !isGroup && "single" in meta && Boolean(meta.single);
                  // A single-column collection is a placeholder in the top row: draw it there
                  // spanning both rows, and skip its leaf in the second row.
                  if (header.isPlaceholder && !single) return null;
                  if (gi === 1 && single) return null;
                  const collection = isGroup ? (meta as Collection) : (meta as MatrixColumn).collection;
                  const column = isGroup ? null : (meta as MatrixColumn);
                  return (
                    <th
                      key={header.id}
                      scope={isGroup ? "colgroup" : "col"}
                      colSpan={header.colSpan}
                      rowSpan={single && hasGroups ? 2 : 1}
                      className={cn(
                        "sticky z-20 border-b border-l border-border bg-primary-tint px-3 text-left align-bottom font-semibold",
                        gi === 0 && "top-0",
                        isGroup && "border-b-primary/30",
                      )}
                      style={{ minWidth: column ? (column.period ? 104 : 156) : undefined, top: gi === 0 ? undefined : groupRowH }}
                    >
                      {isGroup || single ? (
                        <ColumnHeader collection={collection} onHide={() => onHide(collection.id)} onArchive={() => setArchiving(collection)} wide={!isGroup} pinned={isGroup} />
                      ) : (
                        <div className={cn("py-2 text-xs", column?.period && column.period.month === monthOf(view.today) && "text-primary-strong")}>
                          {column?.short}
                          {column?.period && column.period.month === monthOf(view.today) && <span className="ml-1 text-[10px] font-medium">(kini)</span>}
                        </div>
                      )}
                    </th>
                  );
                })}
                {gi === 0 && (
                  <th
                    scope="col"
                    rowSpan={headerGroups.length}
                    className={cn("sticky top-0 right-0 z-30 min-w-[120px] border-b border-l border-border bg-primary-tint px-3 text-right align-bottom text-xs font-semibold text-muted-foreground", RIGHT_EDGE)}
                  >
                    <div className="py-3">Baki semasa</div>
                  </th>
                )}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((member, ri) => {
              const due = rowTotals(member);
              const activeRow = ri === r;
              // Highlight: hover always; the active cell's row only while the grid holds focus or
              // the editor is open, so an untouched grid does not mark row one.
              const highlight = cn(
                "group-hover/row:bg-primary-tint",
                activeRow && (editing ? "bg-primary-tint" : "group-focus-within/grid:bg-primary-tint"),
              );
              return (
                <tr key={member.id} className="group/row">
                  <th
                    scope="row"
                    style={{ width: MEMBER_COL_W, minWidth: MEMBER_COL_W, maxWidth: MEMBER_COL_W }}
                    className={cn(
                      "sticky left-0 z-10 border-r border-b border-border bg-grid-frozen px-4 py-2 text-left font-medium group-hover/row:shadow-[inset_3px_0_0_var(--primary)]",
                      LEFT_EDGE,
                      ROW_FADE,
                      highlight,
                      activeRow && (editing ? "shadow-[inset_3px_0_0_var(--primary)]" : "group-focus-within/grid:shadow-[inset_3px_0_0_var(--primary)]"),
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar className="size-7 after:hidden" aria-hidden>
                        <AvatarFallback className="bg-primary-light text-[11px] font-semibold text-primary-strong">{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Link href={`/ahli/${member.id}/`} className="block truncate hover:text-primary-strong hover:underline" tabIndex={-1}>
                          {member.name}
                        </Link>
                        {/* foreground/70, not muted: muted grey drops under 4.5:1 on the highlighted row. */}
                        {!member.active && <span className="block text-[11px] font-normal text-foreground/70">Tidak aktif</span>}
                      </div>
                    </div>
                  </th>
                  {columns.map((column, ci) => {
                    const cell = view.cell(member, column);
                    const isActive = ri === r && ci === c;
                    // The td is the same element whether or not it is active, so focus survives
                    // re-renders; the editor's anchor and portal live inside it.
                    const own = (event: { currentTarget: Node; target: EventTarget }) => event.currentTarget.contains(event.target as Node);
                    return (
                      <td
                        key={column.key}
                        data-cell={`${ri}:${ci}`}
                        role="gridcell"
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`${member.name}, ${column.label}: ${describeCell(cell)}`}
                        onClick={(event) => own(event) && setActive({ r: ri, c: ci })}
                        onDoubleClick={(event) => {
                          if (!own(event)) return;
                          setActive({ r: ri, c: ci });
                          setEditing({});
                        }}
                        onFocus={(event) => own(event) && (ri !== r || ci !== c) && setActive({ r: ri, c: ci })}
                        className={cn(
                          "relative h-[58px] cursor-cell border-b border-l border-border px-2.5 align-middle outline-none",
                          ROW_FADE,
                          // The active cell is only marked while it has focus or its editor is open, so an
                          // untouched grid shows no ring at 0:0.
                          isActive && editing && "z-[5] bg-primary-tint ring-2 ring-ring ring-inset",
                          isActive && !editing && "focus:z-[5] focus:bg-primary-tint focus:ring-2 focus:ring-ring focus:ring-inset",
                          !(isActive && editing) &&
                            (column.period && column.period.month === monthOf(view.today)
                              ? "bg-primary-tint/30"
                              : ri % 2 === 1 && "bg-grid-zebra"),
                          highlight,
                        )}
                      >
                        <CellView cell={cell} />
                        {isActive && (
                          <Popover open={editing !== null} onOpenChange={(open) => !open && close()}>
                            <PopoverAnchor asChild>
                              <span aria-hidden className="pointer-events-none absolute inset-0" />
                            </PopoverAnchor>
                            <PopoverContent
                              side="right"
                              align="start"
                              sideOffset={8}
                              collisionPadding={12}
                              className="max-h-[calc(100svh-24px)] w-[360px] overflow-y-auto rounded-2xl border-border p-4 shadow-[0_24px_48px_-20px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
                              aria-label={editorLabel(member, column)}
                              // Focus moves into the editor (amount on the pay tab, else the selected
                              // tab); close() hands it back to the cell.
                              onOpenAutoFocus={(event) => {
                                event.preventDefault();
                                focusEditorStart(event.currentTarget as HTMLElement);
                              }}
                              onCloseAutoFocus={(event) => event.preventDefault()}
                              onFocusCapture={lastFocus.onFocusCapture}
                              onInteractOutside={(event) => {
                                if (guard) return event.preventDefault(); // the discard dialog took focus
                                if (dirty) {
                                  event.preventDefault();
                                  setGuard(true);
                                }
                              }}
                            >
                              <CellEditor cell={cell} initialInput={editing?.initial} onDone={close} onDirtyChange={setDirty} />
                            </PopoverContent>
                          </Popover>
                        )}
                      </td>
                    );
                  })}
                  <td className={cn("sticky right-0 z-10 border-b border-l border-border bg-grid-frozen px-3 text-right font-semibold tabular-nums", RIGHT_EDGE, ROW_FADE, highlight)}>
                    {due > 0 ? <span className="text-st-unpaid">{formatMoney(due)}</span> : <span className="text-st-paid">RM 0.00</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={cn("sticky bottom-0 left-0 z-30 border-t border-r border-border bg-primary-light px-4 py-2.5 text-left text-xs font-semibold", LEFT_EDGE)}>
                Jumlah diterima
              </th>
              {columns.map((column) => {
                const total = columnTotal(column);
                return (
                  <td key={column.key} className="sticky bottom-0 z-10 border-t border-l border-border bg-primary-light px-2.5 py-2 text-xs tabular-nums">
                    <span className="font-semibold">{formatMoneyShort(total.received)}</span>
                    {!total.voluntary && <span className="text-muted-foreground"> / {formatMoneyShort(total.expected)}</span>}
                  </td>
                );
              })}
              <td className={cn("sticky right-0 bottom-0 z-30 border-t border-l border-border bg-primary-light", RIGHT_EDGE)} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <span>
          <kbd className="rounded border border-border px-1">↵</kbd> edit · <kbd className="rounded border border-border px-1">0–9</kbd> terus taip amaun ·{" "}
          <kbd className="rounded border border-border px-1">Esc</kbd> batal · <kbd className="rounded border border-border px-1">← ↑ → ↓</kbd> /{" "}
          <kbd className="rounded border border-border px-1">Home</kbd> / <kbd className="rounded border border-border px-1">End</kbd> gerak
        </span>
        <span className="ml-auto">Sel = dibayar / perlu bayar. Status dikira daripada rekod bayaran.</span>
      </div>
      <DiscardDialog open={guard} onKeep={() => setGuard(false)} onDiscard={close} restoreFocus={lastFocus.restore} />
      <ArchiveDialog
        collection={archiving}
        onClose={() => setArchiving(null)}
        onArchived={() => requestAnimationFrame(() => focusCell(r, c))}
      />
    </div>
  );
}

/**
 * Asked when a click lands outside an editor holding unsaved input. Esc and Batal never ask:
 * they are explicit cancels. Shared by the desktop popover and the phone sheet.
 */
function DiscardDialog({
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

/**
 * Confirms archiving a collection from its column menu, then offers to undo. Undo restores the
 * status the collection had before (active, draft or completed), read before the change.
 */
function ArchiveDialog({ collection, onClose, onArchived }: { collection: Collection | null; onClose: () => void; onArchived: () => void }) {
  const { run } = useKelab();
  const [busy, setBusy] = useState(false);
  const archived = useRef(false);

  const archive = async () => {
    if (!collection || busy) return;
    const { id, name } = collection;
    const previous: CollectionStatus = collection.status;
    setBusy(true);
    try {
      await run((backend) => backend.setCollectionStatus(id, "archived"));
      archived.current = true;
      onClose();
      toast.success(`"${name}" diarkib. Semua rekod dikekalkan.`, {
        action: {
          label: "Buat asal",
          onClick: () =>
            void run((backend) => backend.setCollectionStatus(id, previous))
              .then(() => toast.success(`"${name}" dipulihkan.`))
              .catch((error) => toast.error(messageFor(error))),
        },
      });
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={collection !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent
        className="rounded-2xl"
        onOpenAutoFocus={() => (archived.current = false)}
        // Cancel returns focus to the column menu button (Radix default). After archiving that
        // column is gone, so focus goes to the grid's active cell instead.
        onCloseAutoFocus={(event) => {
          if (!archived.current) return;
          event.preventDefault();
          onArchived();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Arkibkan &quot;{collection?.name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            Semua caj, bayaran dan log audit dikekalkan. Lajur ini disembunyikan daripada Matriks dan tidak menerima bayaran baharu. Anda boleh memulihkannya dari halaman Kutipan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          {/* A plain button, not AlertDialogAction, so the dialog stays open until the change succeeds. */}
          <Button onClick={() => void archive()} disabled={busy}>
            {busy && <Spinner className="size-4" />}
            Arkibkan
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function describeCell(cell: MatrixCell) {
  if (cell.kind === "na") return "Tidak Berkaitan";
  if (cell.kind === "voluntary") return `sumbangan ${formatMoney(cell.received)}`;
  const parts = [`${formatMoney(cell.ledger.confirmed)} daripada ${formatMoney(cell.ledger.required)}`, cellStatusLabels[cell.status][0]];
  if (cell.ledger.overdue) parts.push("Lewat");
  if (cell.ledger.pending > 0) parts.push("Menunggu Semakan");
  return parts.join(", ");
}

/** What one grid cell shows: paid / required on top, derived status below. */
function CellView({ cell }: { cell: MatrixCell }) {
  if (cell.kind === "na") return <span className="text-xs text-muted-foreground" title="Tidak Berkaitan">—</span>;
  if (cell.kind === "voluntary")
    return (
      <div className="grid gap-0.5">
        <span className={cn("text-[12.5px] font-semibold tabular-nums", cell.received === 0 && "font-normal text-muted-foreground")}>
          {cell.received > 0 ? formatMoneyShort(cell.received) : "—"}
        </span>
        {cell.pending > 0 ? (
          <StatusChip label="Menunggu" tone="pending" compact />
        ) : (
          <span className="text-[11px] text-muted-foreground">{cell.count > 0 ? `${cell.count} sumbangan` : "Sukarela"}</span>
        )}
      </div>
    );
  const { ledger, status } = cell;
  if (status === "exempt") return <StatusChip label="Dikecualikan" tone="exempt" compact />;
  return (
    <div className="grid gap-0.5">
      <span className="text-[12.5px] whitespace-nowrap tabular-nums">
        <b className={cn("font-semibold", ledger.confirmed === 0 && "font-normal text-muted-foreground")}>{formatMoneyShort(ledger.confirmed)}</b>
        <span className="text-muted-foreground"> / {formatMoneyShort(ledger.required)}</span>
      </span>
      <span className="flex gap-1">
        {status === "future" ? (
          <StatusChip label="Akan Datang" tone="future" compact />
        ) : ledger.overdue ? (
          <StatusChip label={status === "partial" ? "Lewat · Sebahagian" : "Lewat"} tone="overdue" compact />
        ) : ledger.pending > 0 && status !== "paid" ? (
          <StatusChip label="Menunggu" tone="pending" compact />
        ) : (
          <StatusChip label={cellStatusLabels[status][0]} tone={cellStatusLabels[status][1]} compact />
        )}
      </span>
    </div>
  );
}

/** Header for a collection: name (renamed from its menu), amount, actions. */
function ColumnHeader({
  collection,
  onHide,
  onArchive,
  wide,
  pinned,
}: {
  collection: Collection;
  onHide: () => void;
  onArchive: () => void;
  wide: boolean;
  pinned?: boolean;
}) {
  const { run } = useKelab();
  const { view } = useSnapshot();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(collection.name);
  const [busy, setBusy] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Set when "Namakan semula" is chosen, so the menu does not pull focus back to its button
  // and blur (commit) the rename field the moment it appears.
  const toRename = useRef(false);
  const renameInput = useRef<HTMLInputElement>(null);
  const progress = view.collectionProgress(collection.id);

  const finish = () => {
    setRenaming(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  };

  const commit = async () => {
    if (busy) return;
    if (!name.trim() || name.trim() === collection.name) {
      setName(collection.name);
      finish();
      return;
    }
    setBusy(true);
    try {
      await run((backend) => backend.updateCollection(collection.id, { name }));
      toast.success("Nama kutipan dikemas kini.");
      finish();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const amount =
    collection.type === "voluntary" ? "Sukarela" : collection.type === "monthly" ? `${formatMoneyShort(collection.defaultAmount ?? 0)}/bln` : formatMoneyShort(collection.defaultAmount ?? 0);

  return (
    // A monthly group's label pins beside the frozen Ahli column (its th's px-3 included) while
    // the group's months scroll under it, until the group itself scrolls out.
    <div
      className={cn("flex items-start justify-between gap-1 py-2", wide && "max-w-[220px]", pinned && "sticky w-max max-w-[260px] gap-3")}
      style={pinned ? { left: MEMBER_COL_W + 12 } : undefined}
    >
      <div className="min-w-0">
        {renaming ? (
          <input
            ref={renameInput}
            // Double-click path; the menu path focuses it once the menu has let go of focus.
            autoFocus={!toRename.current}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commit();
              if (event.key === "Escape") {
                setName(collection.name);
                finish();
              }
              event.stopPropagation();
            }}
            aria-label="Nama kutipan"
            className="h-7 w-full min-w-32 rounded-md border border-primary bg-card px-1.5 text-[13px] font-semibold outline-none"
          />
        ) : (
          // Plain text, not a button: renaming is a menu action (keyboard and touch). Double-click
          // stays as a mouse shortcut; title shows the full name when truncated.
          <span onDoubleClick={() => setRenaming(true)} title={collection.name} className="block max-w-full truncate text-left text-[13px] font-semibold">
            {collection.name}
          </span>
        )}
        <span className="block text-[11px] font-normal text-muted-foreground">
          {amount}
          {collection.status === "draft" && " · Draf"}
          {collection.status === "completed" && " · Selesai"}
          {collection.type !== "voluntary" && ` · ${progress.settled}/${progress.total} selesai`}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button ref={menuButton} type="button" aria-label={`Tindakan untuk ${collection.name}`} className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-primary-light">
            <EllipsisVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onCloseAutoFocus={(event) => {
            if (!toRename.current) return;
            toRename.current = false;
            event.preventDefault();
            renameInput.current?.focus();
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              toRename.current = true;
              setName(collection.name);
              setRenaming(true);
            }}
          >
            <Pencil /> Namakan semula
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/kutipan/${collection.id}/`}>
              <ExternalLink /> Butiran & tetapan kutipan
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onHide}>
            <EyeOff /> Sembunyikan lajur
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onArchive} className="text-muted-foreground">
            <Archive /> Arkibkan kutipan
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Phone layout -----------------------------------------------------------------------------

/** One card per member; each collection is a tappable line, months a row of tiles. */
function MemberCards({ rows, columns }: { rows: Member[]; columns: MatrixColumn[] }) {
  const { view } = useSnapshot();
  const [open, setOpen] = useState<MatrixCell | null>(null);
  const [dirty, setDirty] = useState(false);
  const [guard, setGuard] = useState(false);
  const [limit, setLimit] = useState(20);
  const opener = useOpener();
  const lastFocus = useLastFocus();
  const show = (cell: MatrixCell) => {
    opener.remember();
    setOpen(cell);
  };
  const dismiss = () => {
    setOpen(null);
    setDirty(false);
    setGuard(false);
  };
  const groups = useMemo(() => {
    const map = new Map<string, MatrixColumn[]>();
    for (const column of columns) {
      const list = map.get(column.collection.id);
      if (list) list.push(column);
      else map.set(column.collection.id, [column]);
    }
    return [...map.values()];
  }, [columns]);

  const current = open ? view.cell(open.member, open.column) : null;

  return (
    <>
      <ul className="grid grid-cols-1 gap-3">
        {rows.slice(0, limit).map((member) => {
          let due = 0;
          for (const column of columns) {
            const cell = view.cell(member, column);
            if (cell.kind === "charge" && !cell.ledger.future) due += cell.ledger.remaining;
          }
          return (
            <li key={member.id} className="min-w-0 rounded-2xl border border-border bg-card p-3.5">
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <Link href={`/ahli/${member.id}/`} className="min-w-0 font-semibold break-words">
                  {member.name}
                </Link>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", due > 0 ? "text-st-unpaid" : "text-st-paid")}>
                  {due > 0 ? `Baki ${formatMoney(due)}` : "Selesai"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {groups.map((group) => {
                  const collection = group[0].collection;
                  if (collection.type === "monthly") {
                    const cells = group.map((column) => view.cell(member, column));
                    if (cells.every((cell) => cell.kind === "na")) return null;
                    return (
                      <div key={collection.id} className="rounded-[20px] bg-primary-tint/60 p-2">
                        <p className="mb-1.5 text-xs font-medium">{collection.name}</p>
                        <div className="grid grid-cols-6 gap-1">
                          {cells.map((cell) => (
                            <MonthTile key={cell.column.key} cell={cell} onOpen={() => show(cell)} />
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const cell = view.cell(member, group[0]);
                  if (cell.kind === "na") return null;
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => show(cell)}
                      className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-left active:bg-primary-tint"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{collection.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {cell.kind === "voluntary"
                            ? `Sumbangan ${formatMoney(cell.received)}`
                            : cell.status === "exempt"
                              ? "Tiada caj"
                              : `${formatMoney(cell.ledger.confirmed)} / ${formatMoney(cell.ledger.required)}`}
                        </span>
                      </span>
                      {cell.kind === "charge" && (
                        <ChargeStatusChips status={cell.status} overdue={cell.ledger.overdue} pending={cell.ledger.pending > 0} compact className="max-w-[55%] justify-end" />
                      )}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <Button variant="outline" onClick={() => setLimit(limit + 20)}>
          Tunjuk lagi ({rows.length - limit})
        </Button>
      )}
      {/* Same rules as the desktop editor: Esc and the close button discard (explicit cancel); a tap
          outside with unsaved input asks in DiscardDialog. */}
      <Sheet open={open !== null} onOpenChange={(next) => !next && dismiss()}>
        <SheetContent
          side="bottom"
          className="max-h-[90svh] overflow-y-auto rounded-t-3xl px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusEditorStart(event.currentTarget as HTMLElement);
          }}
          onCloseAutoFocus={opener.restore}
          onFocusCapture={lastFocus.onFocusCapture}
          onInteractOutside={(event) => {
            if (guard) return event.preventDefault();
            if (dirty) {
              event.preventDefault();
              setGuard(true);
            }
          }}
        >
          <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader className="sr-only">
            <SheetTitle>{current ? `Ubah sel: ${current.member.name}, ${current.column.label}` : "Ubah sel"}</SheetTitle>
            <SheetDescription>Rekod bayaran, ubah amaun atau lihat sejarah</SheetDescription>
          </SheetHeader>
          {current && <CellEditor cell={current} onDone={dismiss} onDirtyChange={setDirty} />}
        </SheetContent>
      </Sheet>
      <DiscardDialog open={guard} onKeep={() => setGuard(false)} onDiscard={dismiss} restoreFocus={lastFocus.restore} />
    </>
  );
}
