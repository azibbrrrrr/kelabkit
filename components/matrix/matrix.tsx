"use client";

import { AddCollectionDialog } from "@/components/add-collection-dialog";
import { AddMemberDialog } from "@/components/add-member-dialog";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { CellEditor } from "@/components/matrix/cell-editor";
import { MonthTile } from "@/components/matrix/month-tile";
import { ChargeStatusChips, EmptyState, FilterPills, Money, PageHeader, PageShell, SearchInput, StatusChip } from "@/components/shared";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { messageFor } from "@/lib/errors";
import { formatMoney, formatMoneyShort, formatMonth, initials } from "@/lib/format";
import { cellStatusLabels } from "@/lib/labels";
import { monthOf } from "@/lib/money/months";
import type { Collection, Member, Sen } from "@/lib/types";
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
            <Button variant="brand" onClick={() => setAddMember(true)}>
              <UserPlus /> Tambah ahli
            </Button>
            <Button onClick={() => setAddColumn(true)}>
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
          <Button variant="outline" size="sm" onClick={() => setSort(sort === "name" ? "owing" : "name")} aria-label="Tukar susunan">
            <ArrowDownUp /> {sort === "name" ? "Nama A–Z" : "Baki tertinggi"}
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
          action={<Button onClick={() => setAddMember(true)}>Tambah ahli pertama</Button>}
        />
      ) : columns.length === 0 ? (
        <EmptyState
          icon={SheetIcon}
          title="Tiada kutipan untuk dipaparkan"
          description="Tambah kutipan untuk mula menjejak bayaran, atau tunjuk semula lajur yang disembunyikan."
          action={<Button onClick={() => setAddColumn(true)}>Tambah kutipan</Button>}
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

      <AddMemberDialog open={addMember} onOpenChange={setAddMember} />
      <AddCollectionDialog open={addColumn} onOpenChange={setAddColumn} />
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
  const [guard, setGuard] = useState(false);
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

  const move = (dr: number, dc: number) => {
    let nr = r + dr;
    let nc = c + dc;
    if (nc >= columns.length) {
      nc = 0;
      nr += 1;
    } else if (nc < 0) {
      nc = columns.length - 1;
      nr -= 1;
    }
    nr = Math.max(0, Math.min(rows.length - 1, nr));
    nc = Math.max(0, Math.min(columns.length - 1, nc));
    setActive({ r: nr, c: nc });
    requestAnimationFrame(() => focusCell(nr, nc));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const target = event.target as HTMLElement;
    if (!target.dataset.cell) return;
    const key = event.key;
    if (key === "ArrowDown") move(1, 0);
    else if (key === "ArrowUp") move(-1, 0);
    else if (key === "ArrowRight") move(0, 1);
    else if (key === "ArrowLeft") move(0, -1);
    else if (key === "Tab") {
      const atEnd = !event.shiftKey && r === rows.length - 1 && c === columns.length - 1;
      const atStart = event.shiftKey && r === 0 && c === 0;
      if (atEnd || atStart) return; // let focus leave the grid
      move(0, event.shiftKey ? -1 : 1);
    } else if (key === "Home") move(0, event.ctrlKey || event.metaKey ? -rows.length : -columns.length);
    else if (key === "End") move(0, columns.length);
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
      <div
        ref={scroller}
        role="grid"
        aria-label="Matriks kutipan"
        aria-rowcount={rows.length + (hasGroups ? 3 : 2)}
        onKeyDown={onKeyDown}
        className="group/grid max-h-[calc(100svh-15rem)] min-h-64 overflow-auto overscroll-contain rounded-2xl"
      >
        <table className="border-separate border-spacing-0 text-[13px]">
          <thead>
            {headerGroups.map((group, gi) => (
              <tr key={group.id} ref={gi === 0 ? groupRow : undefined}>
                {gi === 0 && (
                  <th
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
                        <ColumnHeader collection={collection} onHide={() => onHide(collection.id)} wide={!isGroup} pinned={isGroup} />
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
                        aria-selected={isActive}
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
                          isActive
                            ? "z-[5] bg-primary-tint ring-2 ring-primary ring-inset"
                            : column.period && column.period.month === monthOf(view.today)
                              ? "bg-primary-tint/30"
                              : ri % 2 === 1 && "bg-grid-zebra",
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
                              className="max-h-[calc(100svh-24px)] w-[360px] overflow-y-auto rounded-2xl border-border p-4 shadow-[0_24px_48px_-20px_rgba(231,84,128,.35)]"
                              onOpenAutoFocus={(event) => event.preventDefault()}
                              onCloseAutoFocus={(event) => event.preventDefault()}
                              onInteractOutside={(event) => {
                                if (dirty) {
                                  event.preventDefault();
                                  setGuard(true);
                                }
                              }}
                            >
                              <CellEditor cell={cell} initialInput={editing?.initial} onDone={close} onDirtyChange={setDirty} />
                              {guard && (
                                <p className="mt-2 rounded-lg bg-st-partial-bg px-2.5 py-1.5 text-xs text-st-partial">
                                  Ada perubahan belum disimpan. Simpan, atau tekan Esc / Batal untuk buang.
                                </p>
                              )}
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
              <th className={cn("sticky bottom-0 left-0 z-30 border-t border-r border-border bg-primary-light px-4 py-2.5 text-left text-xs font-semibold", LEFT_EDGE)}>
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
          <kbd className="rounded border border-border px-1">Esc</kbd> batal · <kbd className="rounded border border-border px-1">Tab</kbd> /{" "}
          <kbd className="rounded border border-border px-1">← ↑ → ↓</kbd> gerak
        </span>
        <span className="ml-auto">Sel = dibayar / perlu bayar. Status dikira daripada rekod bayaran.</span>
      </div>
    </div>
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
  if (cell.kind === "na") return <span className="text-xs text-subtle" title="Tidak Berkaitan">—</span>;
  if (cell.kind === "voluntary")
    return (
      <div className="grid gap-0.5">
        <span className={cn("text-[12.5px] font-semibold tabular-nums", cell.received === 0 && "font-normal text-subtle")}>
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

/** Header for a collection: name (double-click or menu to rename), amount, actions. */
function ColumnHeader({ collection, onHide, wide, pinned }: { collection: Collection; onHide: () => void; wide: boolean; pinned?: boolean }) {
  const { run } = useKelab();
  const { view } = useSnapshot();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(collection.name);
  const [busy, setBusy] = useState(false);
  const progress = view.collectionProgress(collection.id);

  const commit = async () => {
    if (!name.trim() || name.trim() === collection.name) {
      setRenaming(false);
      setName(collection.name);
      return;
    }
    setBusy(true);
    try {
      await run((backend) => backend.updateCollection(collection.id, { name }));
      toast.success("Nama kutipan dikemas kini.");
      setRenaming(false);
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    try {
      await run((backend) => backend.setCollectionStatus(collection.id, "archived"));
      toast.success(`"${collection.name}" diarkib. Rekod bayaran kekal.`);
    } catch (error) {
      toast.error(messageFor(error));
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
            autoFocus
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commit();
              if (event.key === "Escape") {
                setName(collection.name);
                setRenaming(false);
              }
              event.stopPropagation();
            }}
            aria-label="Nama kutipan"
            className="h-7 w-full min-w-32 rounded-md border border-primary bg-card px-1.5 text-[13px] font-semibold outline-none"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => setRenaming(true)}
            title="Klik dua kali untuk namakan semula"
            className="block max-w-full truncate text-left text-[13px] font-semibold"
          >
            {collection.name}
          </button>
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
          <button type="button" aria-label={`Tindakan untuk ${collection.name}`} className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-primary-light">
            <EllipsisVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
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
          <DropdownMenuItem onSelect={() => void archive()} className="text-muted-foreground">
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
  const [limit, setLimit] = useState(20);
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
                            <MonthTile key={cell.column.key} cell={cell} onOpen={() => setOpen(cell)} />
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
                      onClick={() => setOpen(cell)}
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
      <Sheet
        open={open !== null}
        onOpenChange={(next) => {
          if (!next && dirty && !window.confirm("Buang perubahan yang belum disimpan?")) return;
          if (!next) {
            setOpen(null);
            setDirty(false);
          }
        }}
      >
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-3xl px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader className="sr-only">
            <SheetTitle>Edit sel</SheetTitle>
            <SheetDescription>Rekod bayaran, ubah amaun atau lihat sejarah</SheetDescription>
          </SheetHeader>
          {current && (
            <CellEditor
              cell={current}
              onDone={() => {
                setOpen(null);
                setDirty(false);
              }}
              onDirtyChange={setDirty}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
