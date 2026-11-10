"use client";

import { AddCollectionDialog } from "@/components/add-collection-dialog";
import { AddMemberDialog } from "@/components/add-member-dialog";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { voluntaryKey } from "@/lib/optimistic";
import { describeGhost, GhostValue, useGhost } from "@/components/isi-pantas/ghost";
import { CellEditor, focusEditorStart } from "@/components/matrix/cell-editor";
import { DiscardDialog, useLastFocus, useOpener } from "@/components/matrix/editor-guard";
import {
  BALANCE_W,
  clampWidth,
  layoutWidths,
  MEMBER_KEY,
  WIDTH_LIMITS,
  WIDTH_STEP,
  type WidthKind,
  type WidthPreset,
  type Widths,
} from "@/components/matrix/column-widths";
import { MemberCardGrid } from "@/components/matrix/member-card-grid";
import { MonthTile } from "@/components/matrix/month-tile";
import type { MatrixLayout } from "@/components/matrix/view-pref";
import { usePrefs } from "@/components/prefs-provider";
import { ModalBody, ModalFooter, ModalHeader, ModalText } from "@/components/modal";
import { RestoreCollectionDialog } from "@/components/restore-collection-dialog";
import { ChargeStatusChips, EmptyState, FilterPills, PageHeader, PageShell, SearchInput, StatusChip, Toolbar } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CollectionIcon, CollectionName } from "@/components/collection-icon";
import { EmojiPicker, useSetCollectionIcon } from "@/components/emoji-picker";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ModalHandle } from "@/components/ui/modal-surface";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { messageFor } from "@/lib/errors";
import { formatMoney, formatMoneyShort, formatMonth, initials } from "@/lib/format";
import { useT, type TFunction } from "@/lib/i18n/react";
import { cellStatusLabels, collectionStatusLabels, overdueLabel, pendingLabel } from "@/lib/labels";
import { monthOf } from "@/lib/money/months";
import type { Collection, CollectionStatus, Member } from "@/lib/types";
import { sortCollections, type MatrixCell, type MatrixColumn } from "@/lib/view";
import { cn } from "@/lib/utils";
import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import {
  ArrowDownUp,
  Archive,
  ArchiveRestore,
  Columns3,
  EllipsisVertical,
  ExternalLink,
  EyeOff,
  LayoutGrid,
  MoveHorizontal,
  Pencil,
  Smile,
  Plus,
  Rows3,
  Sheet as SheetIcon,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

// The Excel-like tracker: members are rows, collections (or months of a monthly
// collection) are columns, each cell is one member's charge. It is a view over normalised
// records. Adding a row creates a member; adding a column creates a collection; typing in
// a cell records a payment transaction. Status is always derived, never typed.

type RowFilter = "all" | "owing" | "overdue" | "pending" | "settled";
type MonthScope = "all" | "to_date";
type Sort = "name" | "owing";
type Active = { r: number; c: number };

/** Storage key of a resizable column: its period for a month, else its collection. */
const widthKey = (column: MatrixColumn) => column.period?.id ?? column.collection.id;
const widthKind = (column: MatrixColumn): WidthKind => (column.period ? "month" : "single");

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

export function MatrixPage() {
  const t = useT();
  const { data, view } = useSnapshot();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  // The heavy filter/render follows the keystroke at lower priority, so typing never waits on it.
  const deferredQuery = useDeferredValue(query);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [monthScope, setMonthScope] = useState<MonthScope>("all");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<Sort>("name");
  // null = no saved choice: Jadual on desktop, Kad on phones. Kept with the other display preferences
  // (this browser in the demo, the account when signed in).
  const { matrixLayout: layout, setPrefs } = usePrefs();
  const chooseLayout = (next: MatrixLayout) => setPrefs({ matrixLayout: next });
  const [addMember, setAddMember] = useState(false);
  const [addColumn, setAddColumn] = useState(false);
  const [restoring, setRestoring] = useState<Collection | null>(null);
  const columnsButton = useRef<HTMLButtonElement>(null);
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
  // Archived collections never show as columns; the Lajur menu lists them so they can be restored.
  const archived = useMemo(() => sortCollections(data.collections).filter((collection) => collection.status === "archived"), [data.collections]);
  const visibleCollections = useMemo(() => collections.filter((collection) => !hidden[collection.id]), [collections, hidden]);
  const hideColumn = useCallback((id: string) => setHidden((h) => ({ ...h, [id]: true })), []);
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
    const q = deferredQuery.trim().toLowerCase();
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
  }, [data.members, deferredQuery, rowFilter, rowSummary, showInactive, sort]);
  // Stable identity so the memoised grid and cards skip the urgent (keystroke) render.
  const memberRows = useMemo(() => members.map((row) => row.member), [members]);

  const showGrid = (layout ?? (isMobile ? "cards" : "grid")) === "grid";

  return (
    <PageShell className="max-w-none lg:px-6">
      {/* One line, no description: the grid is the page. Totals live in the grid's footer row and the
          keyboard hints in its footer bar. */}
      <PageHeader
        compact
        title={t("matrix.title")}
        actions={
          <>
            <Button variant="brand" onClick={openAddMember}>
              <UserPlus /> {t("matrix.addMember")}
            </Button>
            <Button onClick={openAddColumn}>
              <Plus /> {t("matrix.addCollection")}
            </Button>
          </>
        }
      />

      <Toolbar
        search={<SearchInput id="matrix-search" value={query} onChange={setQuery} placeholder={t("matrix.searchMembers")} />}
        tabs={
          <FilterPills
            label={t("matrix.filterRows")}
            value={rowFilter}
            onChange={setRowFilter}
            options={[
              { value: "all", label: t("matrix.filterAll") },
              { value: "owing", label: t("matrix.filterOwing") },
              { value: "overdue", label: overdueLabel[0] },
              { value: "pending", label: pendingLabel[0] },
              { value: "settled", label: t("matrix.filterSettled") },
            ]}
          />
        }
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={columnsButton} variant="outline" size="sm" className="pointer-coarse:h-11">
                  <Columns3 /> {t("matrix.columns")}
                  {Object.values(hidden).some(Boolean) && <span className="text-primary-strong">•</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[min(70svh,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-y-auto">
                <DropdownMenuLabel>{t("matrix.showCollections")}</DropdownMenuLabel>
                {collections.map((collection) => (
                  <DropdownMenuCheckboxItem
                    key={collection.id}
                    checked={!hidden[collection.id]}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(value) => setHidden((current) => ({ ...current, [collection.id]: !value }))}
                  >
                    <CollectionName collection={collection} />
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={monthScope === "to_date"} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setMonthScope(v ? "to_date" : "all")}>
                  {t("matrix.hideUpcoming")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={showCompleted} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setShowCompleted(v === true)}>
                  {t("matrix.showCompleted")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={showInactive} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setShowInactive(v === true)}>
                  {t("matrix.showInactive")}
                </DropdownMenuCheckboxItem>
                {archived.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t("matrix.archivedHeading")}</DropdownMenuLabel>
                    {archived.map((collection) => (
                      <DropdownMenuItem key={collection.id} onSelect={() => setRestoring(collection)}>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{collection.name}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-strong">
                          <ArchiveRestore className="size-3.5" /> {t("matrix.restore")}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Accessible name leads with the visible text (label in name). */}
            <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={() => setSort(sort === "name" ? "owing" : "name")}>
              <ArrowDownUp /> {sort === "name" ? t("matrix.sortName") : t("matrix.sortBalance")}
              <span className="sr-only">{t("matrix.sortChange")}</span>
            </Button>
            <ToggleGroup
              type="single"
              value={showGrid ? "grid" : "cards"}
              onValueChange={(next) => next && chooseLayout(next as MatrixLayout)}
              aria-label={t("matrix.viewLabel")}
              spacing={0}
              className="gap-0 rounded-[10px] border border-border bg-card p-0.5"
            >
              <ToggleGroupItem value="cards" className="h-8 gap-1 rounded-[7px]! px-2.5 pointer-coarse:h-11 pointer-coarse:min-w-11 text-xs font-normal hover:bg-primary-tint data-[state=on]:bg-primary-light data-[state=on]:font-semibold data-[state=on]:text-primary-strong">
                <Rows3 className="size-3.5" /> {t("matrix.viewCards")}
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" className="h-8 gap-1 rounded-[7px]! px-2.5 pointer-coarse:h-11 pointer-coarse:min-w-11 text-xs font-normal hover:bg-primary-tint data-[state=on]:bg-primary-light data-[state=on]:font-semibold data-[state=on]:text-primary-strong">
                <LayoutGrid className="size-3.5" /> {t("matrix.viewGrid")}
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        }
      />

      {data.members.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={t("matrix.noMembersTitle")}
          description={t("matrix.noMembersDescription")}
          action={<Button onClick={openAddMember}>{t("matrix.addFirstMember")}</Button>}
        />
      ) : columns.length === 0 ? (
        <EmptyState
          icon={SheetIcon}
          title={t("matrix.noColumnsTitle")}
          description={t("matrix.noColumnsDescription")}
          action={<Button onClick={openAddColumn}>{t("matrix.addCollection")}</Button>}
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Rows3}
          title={t("matrix.noMatchTitle")}
          description={rowFilter === "owing" || rowFilter === "overdue" ? t("matrix.allSettledDescription") : t("matrix.tryOtherDescription")}
        />
      ) : showGrid ? (
        <Grid rows={memberRows} columns={columns} collections={visibleCollections} onHide={hideColumn} />
      ) : (
        isMobile ? (
          <MemberCards rows={memberRows} columns={columns} />
        ) : (
          <MemberCardGrid rows={memberRows} columns={columns} />
        )
      )}

      <AddMemberDialog open={addMember} onOpenChange={setAddMember} onCloseAutoFocus={memberOpener.restore} />
      <AddCollectionDialog open={addColumn} onOpenChange={setAddColumn} onCloseAutoFocus={columnOpener.restore} />
      <RestoreCollectionDialog collection={restoring} onClose={() => setRestoring(null)} fallbackFocus={() => columnsButton.current} />
    </PageShell>
  );
}

// Desktop grid -----------------------------------------------------------------------------

const Grid = memo(function Grid({
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
  const t = useT();
  const { view } = useSnapshot();
  const ghostFor = useGhost();
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
  // Column widths: a display preference (see column-widths.ts), never part of the data. Local state
  // follows the drag; the preference is written once the drag ends.
  const { matrixWidths: savedWidths, setPrefs } = usePrefs();
  const [widths, setWidths] = useState<Widths>(() => savedWidths);
  const [available, setAvailable] = useState(0);
  const [resizing, setResizing] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const guide = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Saved once a drag ends (not on every pointer move), and after every key, menu or fit change.
  useEffect(() => {
    if (!resizing) setPrefs({ matrixWidths: widths });
  }, [widths, resizing, setPrefs]);

  // While dragging: the accent guide follows the column's right edge, and the whole page shows the
  // resize cursor without selecting text.
  useLayoutEffect(() => {
    if (!resizing) return;
    const th = scroller.current?.querySelector<HTMLElement>(`[data-resize="${resizing}"]`);
    if (th && frame.current && guide.current && scroller.current) {
      guide.current.style.height = `${scroller.current.clientHeight}px`;
      guide.current.style.transform = `translateX(${th.getBoundingClientRect().right - frame.current.getBoundingClientRect().left - frame.current.clientLeft - 1}px)`;
    }
  }, [resizing, widths, available]);
  useEffect(() => {
    if (!resizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [resizing]);

  const memberW = clampWidth("member", widths[MEMBER_KEY] ?? WIDTH_LIMITS.member.normal);
  const { columns: rendered, balance: balanceW } = useMemo(
    () => layoutWidths(columns.map((column) => ({ kind: widthKind(column), size: widths[widthKey(column)] })), memberW + BALANCE_W, available),
    [columns, widths, memberW, available],
  );
  const renderedByKey = useMemo(() => new Map(columns.map((column, i) => [column.key, rendered[i]])), [columns, rendered]);
  const tableW = memberW + balanceW + rendered.reduce((sum, width) => sum + width, 0);

  const setWidth = (key: string, kind: WidthKind, width: number) => setWidths((current) => ({ ...current, [key]: clampWidth(kind, width) }));

  /**
   * Auto-fit: widen the column to its maximum for one synchronous layout, read the natural width
   * of every [data-fit] element in it (header, cells, footer), then settle on the widest plus the
   * cell's own padding and border. Nothing paints in between.
   */
  const autoFit = (key: string, kind: WidthKind) => {
    flushSync(() => setWidth(key, kind, WIDTH_LIMITS[kind].max));
    let natural = 0;
    scroller.current?.querySelectorAll<HTMLElement>(`[data-fit-col="${key}"] [data-fit]`).forEach((el) => {
      const cell = el.closest("th, td");
      if (!cell) return;
      const style = getComputedStyle(cell);
      const chrome = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      natural = Math.max(natural, Math.max(el.scrollWidth, el.getBoundingClientRect().width) + (Number(el.dataset.fit) || 0) + chrome);
    });
    setWidth(key, kind, Math.ceil(natural) + 2);
  };

  /** The ⋮ menu's "Lebar lajur": applies to the collection's column, or to every month shown. */
  const applyPreset = (collection: Collection, preset: WidthPreset | "reset") => {
    const targets = columns.filter((column) => column.collection.id === collection.id);
    setWidths((current) => {
      const next = { ...current };
      for (const column of targets) {
        if (preset === "reset") delete next[widthKey(column)];
        else next[widthKey(column)] = WIDTH_LIMITS[widthKind(column)][preset];
      }
      return next;
    });
  };

  const handle = (key: string, kind: WidthKind, name: string, width: number) => (
    <ResizeHandle
      name={name}
      kind={kind}
      width={width}
      onChange={(next) => setWidth(key, kind, next)}
      onFit={() => autoFit(key, kind)}
      onDrag={(active) => setResizing(active ? key : null)}
    />
  );

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

  const editorLabel = (member: Member, column: MatrixColumn) => t("editor.cellLabel", { member: member.name, column: column.label });

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
    <div ref={frame} className="relative min-w-0 rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,.03)]">
      {/* Accent guide on the edge being dragged; its height is the scroller's, so it stops above the hints bar. */}
      <div ref={guide} aria-hidden className={cn("pointer-events-none absolute top-0 left-0 z-40 w-0.5 bg-primary", !resizing && "hidden")} />
      <div ref={scroller} data-matrix-scroller className="group/grid max-h-[max(16rem,calc(100svh-18rem))] overflow-auto overscroll-contain rounded-2xl">
        {/* All rows and columns are rendered, so the counts equal the DOM: header rows + members + footer. */}
        <table
          role="grid"
          aria-label={t("matrix.gridLabel")}
          aria-rowcount={headerGroups.length + rows.length + 1}
          aria-colcount={columns.length + 2}
          onKeyDown={onKeyDown}
          // Fixed layout: the colgroup widths are the widths, and content truncates instead of
          // stretching a column or wrapping a row. layoutWidths spreads any spare width over the
          // columns, so with few columns the table still spans the card and Baki semasa stays at the
          // right edge.
          style={{ width: tableW, tableLayout: "fixed" }}
          className="border-separate border-spacing-0 text-small"
        >
          <colgroup>
            <col style={{ width: memberW }} />
            {columns.map((column, i) => (
              <col key={column.key} style={{ width: rendered[i] }} />
            ))}
            <col style={{ width: balanceW }} />
          </colgroup>
          <thead>
            {headerGroups.map((group, gi) => (
              <tr key={group.id} ref={gi === 0 ? groupRow : undefined}>
                {gi === 0 && (
                  <th
                    scope="col"
                    rowSpan={headerGroups.length}
                    data-resize={MEMBER_KEY}
                    data-fit-col={MEMBER_KEY}
                    className={cn("sticky top-0 left-0 z-30 border-r border-b border-border bg-primary-tint px-4 text-left align-bottom text-xs font-semibold text-muted-foreground", LEFT_EDGE)}
                  >
                    <div data-fit className="w-max max-w-full truncate py-3">
                      {t("matrix.memberColumn", { count: rows.length })}
                    </div>
                    {handle(MEMBER_KEY, "member", t("matrix.memberName"), memberW)}
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
                  const key = column ? widthKey(column) : undefined;
                  const width = isGroup
                    ? header.getLeafHeaders().reduce((sum, leaf) => sum + (renderedByKey.get(leaf.column.id) ?? 0), 0)
                    : (renderedByKey.get(header.column.id) ?? 0);
                  const current = column?.period && column.period.month === monthOf(view.today);
                  return (
                    <th
                      key={header.id}
                      scope={isGroup ? "colgroup" : "col"}
                      colSpan={header.colSpan}
                      rowSpan={single && hasGroups ? 2 : 1}
                      data-resize={key}
                      data-fit-col={key}
                      className={cn(
                        "sticky z-20 border-b border-l border-border bg-primary-tint px-3 text-left align-bottom font-semibold",
                        gi === 0 && "top-0",
                        isGroup && "border-b-primary/30",
                      )}
                      style={{ top: gi === 0 ? undefined : groupRowH }}
                    >
                      {isGroup || single ? (
                        <ColumnHeader
                          collection={collection}
                          onHide={() => onHide(collection.id)}
                          onArchive={() => setArchiving(collection)}
                          onWidth={(preset) => applyPreset(collection, preset)}
                          pinned={isGroup ? { left: memberW + 12, maxWidth: width - 24 } : undefined}
                        />
                      ) : (
                        <div data-fit title={column?.label} className={cn("w-max max-w-full truncate py-2 text-xs", current && "text-primary-strong")}>
                          {column?.short}
                          {current && <span className="ml-1 text-caption font-medium">{t("matrix.current")}</span>}
                        </div>
                      )}
                      {column && key && handle(key, widthKind(column), column.label, width)}
                    </th>
                  );
                })}
                {gi === 0 && (
                  <th
                    scope="col"
                    rowSpan={headerGroups.length}
                    className={cn("sticky top-0 right-0 z-30 min-w-[120px] border-b border-l border-border bg-primary-tint px-3 text-right align-bottom text-xs font-semibold text-muted-foreground", RIGHT_EDGE)}
                  >
                    <div className="py-3">{t("matrix.balanceColumn")}</div>
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
                    data-fit-col={MEMBER_KEY}
                    className={cn(
                      "sticky left-0 z-10 border-r border-b border-border bg-grid-frozen px-4 py-2 text-left font-medium group-hover/row:shadow-[inset_3px_0_0_var(--primary)]",
                      LEFT_EDGE,
                      ROW_FADE,
                      highlight,
                      activeRow && (editing ? "shadow-[inset_3px_0_0_var(--primary)]" : "group-focus-within/grid:shadow-[inset_3px_0_0_var(--primary)]"),
                    )}
                  >
                    <div data-fit className="flex w-max max-w-full min-w-0 items-center gap-2.5">
                      <Avatar className="size-7 after:hidden" aria-hidden>
                        <AvatarFallback className="bg-primary-light text-caption font-semibold text-primary-strong">{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Link href={`/ahli/${member.id}/`} title={member.name} className="block truncate hover:text-primary-strong hover:underline" tabIndex={-1}>
                          {member.name}
                        </Link>
                        {/* foreground/70, not muted: muted grey drops under 4.5:1 on the highlighted row. */}
                        {!member.active && <span className="block truncate text-caption font-normal text-foreground/70">{t("matrix.inactive")}</span>}
                      </div>
                    </div>
                  </th>
                  {columns.map((column, ci) => {
                    const cell = view.cell(member, column);
                    const isActive = ri === r && ci === c;
                    // An Isi Pantas suggestion waiting for (or just written to) this cell.
                    const ghost = cell.kind === "na" ? null : ghostFor(member.id, column.collection.id, column.period?.id ?? null);
                    // The td is the same element whether or not it is active, so focus survives
                    // re-renders; the editor's anchor and portal live inside it.
                    const own = (event: { currentTarget: Node; target: EventTarget }) => event.currentTarget.contains(event.target as Node);
                    return (
                      <td
                        key={column.key}
                        data-cell={`${ri}:${ci}`}
                        data-fit-col={widthKey(column)}
                        role="gridcell"
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`${member.name}, ${column.label}: ${describeCell(t, cell)}${ghost ? `. ${describeGhost(ghost)}` : ""}`}
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
                        {ghost && <GhostValue ghost={ghost} />}
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
              <th
                scope="row"
                data-fit-col={MEMBER_KEY}
                className={cn("sticky bottom-0 left-0 z-30 border-t border-r border-border bg-primary-light px-4 py-2.5 text-left text-xs font-semibold", LEFT_EDGE)}
              >
                <div data-fit className="w-max max-w-full truncate">
                  {t("matrix.totalReceived")}
                </div>
              </th>
              {columns.map((column) => {
                const total = columnTotal(column);
                const text = total.voluntary ? formatMoneyShort(total.received) : `${formatMoneyShort(total.received)} / ${formatMoneyShort(total.expected)}`;
                // One line at any width: a narrow month truncates (full figure in the title) instead
                // of wrapping the footer row taller.
                return (
                  <td key={column.key} data-fit-col={widthKey(column)} className="sticky bottom-0 z-10 border-t border-l border-border bg-primary-light px-2.5 py-2 text-xs tabular-nums">
                    <div data-fit title={text} className="w-max max-w-full truncate">
                      <span className="font-semibold">{formatMoneyShort(total.received)}</span>
                      {!total.voluntary && <span className="text-muted-foreground"> / {formatMoneyShort(total.expected)}</span>}
                    </div>
                  </td>
                );
              })}
              <td className={cn("sticky right-0 bottom-0 z-30 border-t border-l border-border bg-primary-light", RIGHT_EDGE)} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-caption text-muted-foreground">
        <span>
          <kbd className="rounded border border-border px-1">↵</kbd> {t("matrix.hintEdit")} · <kbd className="rounded border border-border px-1">0–9</kbd> {t("matrix.hintType")} ·{" "}
          <kbd className="rounded border border-border px-1">Esc</kbd> {t("matrix.hintCancel")} · <kbd className="rounded border border-border px-1">← ↑ → ↓</kbd> /{" "}
          <kbd className="rounded border border-border px-1">Home</kbd> / <kbd className="rounded border border-border px-1">End</kbd> {t("matrix.hintMove")}
        </span>
        <span className="ml-auto">{t("matrix.legend")}</span>
      </div>
      <DiscardDialog open={guard} onKeep={() => setGuard(false)} onDiscard={close} restoreFocus={lastFocus.restore} />
      <ArchiveDialog
        collection={archiving}
        onClose={() => setArchiving(null)}
        onArchived={() => requestAnimationFrame(() => focusCell(r, c))}
      />
    </div>
  );
});

/**
 * Confirms archiving a collection from its column menu, then offers to undo. Undo restores the
 * status the collection had before (active, draft or completed), read before the change.
 */
function ArchiveDialog({ collection, onClose, onArchived }: { collection: Collection | null; onClose: () => void; onArchived: () => void }) {
  const t = useT();
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
      toast.success(t("matrix.archivedToast", { name }), {
        action: {
          label: t("matrix.undo"),
          onClick: () =>
            void run((backend) => backend.setCollectionStatus(id, previous))
              .then(() => toast.success(t("matrix.restoredToast", { name })))
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
        onOpenAutoFocus={() => (archived.current = false)}
        // Cancel returns focus to the column menu button (Radix default). After archiving that
        // column is gone, so focus goes to the grid's active cell instead.
        onCloseAutoFocus={(event) => {
          if (!archived.current) return;
          event.preventDefault();
          onArchived();
        }}
      >
        <ModalHeader alert icon={Archive} tone="danger" title={t("matrix.archiveTitle", { name: collection?.name ?? "" })} />
        <ModalBody>
          <ModalText alert>{t("matrix.archiveDescription")}</ModalText>
        </ModalBody>
        <ModalFooter>
          <AlertDialogCancel variant="ghost" disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
          {/* A plain button, not AlertDialogAction, so the dialog stays open until the change succeeds. */}
          <Button variant="danger" onClick={() => void archive()} disabled={busy}>
            {busy && <Spinner className="size-4" />}
            {t("matrix.archiveConfirm")}
          </Button>
        </ModalFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The status chip of a charge cell: the one word (or two) the cell shows under its amounts. */
function chipOf(cell: Extract<MatrixCell, { kind: "charge" }>) {
  const { ledger, status } = cell;
  return status === "future"
    ? cellStatusLabels.future
    : ledger.overdue
      ? ([status === "partial" ? `${overdueLabel[0]} · ${cellStatusLabels.partial[0]}` : overdueLabel[0], "overdue"] as const)
      : ledger.pending > 0 && status !== "paid"
        ? pendingLabel
        : cellStatusLabels[status];
}

/**
 * The cell's accessible name leads with exactly what it shows (label in name, WCAG 2.5.3), so a
 * speech-input user can say what they see. Anything the chip does not already say is appended.
 */
function describeCell(t: TFunction, cell: MatrixCell) {
  if (cell.kind === "na") return cellStatusLabels.na[0];
  if (cell.kind === "voluntary") {
    const sub = cell.count > 0 ? t(cell.count === 1 ? "matrix.contributionsOne" : "matrix.contributionsMany", { count: cell.count }) : t("matrix.voluntary");
    return `${cell.received > 0 ? formatMoneyShort(cell.received) : "—"} ${cell.pending > 0 ? pendingLabel[0] : sub}`;
  }
  if (cell.status === "exempt") return cellStatusLabels.exempt[0];
  const chip = chipOf(cell)[0];
  const parts = [`${formatMoneyShort(cell.ledger.confirmed)} / ${formatMoneyShort(cell.ledger.required)} ${chip}`];
  if (cell.ledger.pending > 0 && cell.status !== "paid" && chip !== pendingLabel[0]) parts.push(pendingLabel[0]);
  return parts.join(", ");
}

/**
 * What one grid cell shows: paid / required on top, derived status below. Never wraps: every
 * line truncates (full text in its title), so every body row keeps the same height at any column
 * width. The root is [data-fit] at its natural width, which is what auto-fit measures.
 */
function CellView({ cell }: { cell: MatrixCell }) {
  const t = useT();
  const { pending } = useKelab();
  // A payment on its way: the new value is already shown, dimmed and labelled until the server confirms it.
  const saving = cell.kind === "charge" ? pending.has(cell.ledger.charge.id) : cell.kind === "voluntary" && pending.has(voluntaryKey(cell.member.id, cell.column.collection.id));
  if (!saving) return <CellBody cell={cell} />;
  return (
    <div aria-busy="true" title={t("common.saving")} className="w-max max-w-full opacity-60 motion-safe:animate-pulse">
      <CellBody cell={cell} />
      <span className="sr-only">{t("common.saving")}</span>
    </div>
  );
}

function CellBody({ cell }: { cell: MatrixCell }) {
  const t = useT();
  if (cell.kind === "na")
    return (
      <span data-fit className="text-xs text-muted-foreground" title={cellStatusLabels.na[0]}>
        —
      </span>
    );
  if (cell.kind === "voluntary") {
    const sub = cell.count > 0 ? t(cell.count === 1 ? "matrix.contributionsOne" : "matrix.contributionsMany", { count: cell.count }) : t("matrix.voluntary");
    return (
      <div data-fit className="grid w-max max-w-full gap-0.5">
        <span
          title={cell.received > 0 ? formatMoneyShort(cell.received) : undefined}
          className={cn("truncate text-small font-semibold tabular-nums", cell.received === 0 && "font-normal text-muted-foreground")}
        >
          {cell.received > 0 ? formatMoneyShort(cell.received) : "—"}
        </span>{" "}
        {cell.pending > 0 ? (
          <span title={pendingLabel[0]} className="flex min-w-0">
            <StatusChip label={pendingLabel[0]} tone="pending" compact className="min-w-0 shrink" />
          </span>
        ) : (
          <span title={sub} className="truncate text-caption text-muted-foreground">
            {sub}
          </span>
        )}
      </div>
    );
  }
  const { ledger, status } = cell;
  if (status === "exempt")
    return (
      <span data-fit title={cellStatusLabels.exempt[0]} className="flex w-max max-w-full">
        <StatusChip label={cellStatusLabels.exempt[0]} tone="exempt" compact className="min-w-0 shrink" />
      </span>
    );
  const amounts = `${formatMoneyShort(ledger.confirmed)} / ${formatMoneyShort(ledger.required)}`;
  const chip = chipOf(cell);
  return (
    <div data-fit className="grid w-max max-w-full gap-0.5">
      <span title={amounts} className="truncate text-small tabular-nums">
        <b className={cn("font-semibold", ledger.confirmed === 0 && "font-normal text-muted-foreground")}>{formatMoneyShort(ledger.confirmed)}</b>
        <span className="text-muted-foreground"> / {formatMoneyShort(ledger.required)}</span>
      </span>{" "}
      <span title={chip[0]} className="flex min-w-0">
        <StatusChip label={chip[0]} tone={chip[1]} compact className="min-w-0 shrink" />
      </span>
    </div>
  );
}

/**
 * Drag handle on a header's right edge. Pointer: drag to resize, double-click to fit the content.
 * Keyboard: a focusable separator (← → by 16px, Home / End to the limits, Enter to fit). It handles
 * its own keys and stops them there, so it never moves the grid's active cell; the grid's arrow
 * keys only act on cells.
 */
function ResizeHandle({
  name,
  kind,
  width,
  onChange,
  onFit,
  onDrag,
}: {
  name: string;
  kind: WidthKind;
  /** The column's rendered width, which can exceed its saved size while the grid fills its card. */
  width: number;
  onChange: (width: number) => void;
  onFit: () => void;
  onDrag: (active: boolean) => void;
}) {
  const t = useT();
  const start = useRef<{ x: number; width: number } | null>(null);
  const { min, max } = WIDTH_LIMITS[kind];
  const now = clampWidth(kind, width);
  const end = () => {
    if (!start.current) return;
    start.current = null;
    onDrag(false);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("matrix.resizeColumn", { name })}
      aria-valuenow={now}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
        start.current = { x: event.clientX, width };
        onDrag(true);
      }}
      onPointerMove={(event) => start.current && onChange(start.current.width + event.clientX - start.current.x)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onFit();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onChange(now - WIDTH_STEP);
        else if (event.key === "ArrowRight") onChange(now + WIDTH_STEP);
        else if (event.key === "Home") onChange(min);
        else if (event.key === "End") onChange(max);
        else if (event.key === "Enter") onFit();
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
      className="group/handle absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none outline-none"
    >
      <span
        aria-hidden
        className="absolute inset-y-1.5 right-0 w-0.5 rounded-full bg-primary opacity-0 transition-opacity duration-100 group-hover/handle:opacity-60 group-focus-visible/handle:opacity-100 group-active/handle:opacity-100"
      />
    </div>
  );
}

/** Header for a collection: name (renamed from its menu), amount, actions. */
function ColumnHeader({
  collection,
  onHide,
  onArchive,
  onWidth,
  pinned,
}: {
  collection: Collection;
  onHide: () => void;
  onArchive: () => void;
  /** "Lebar lajur": the menu path to resizing, for touch and for anyone not dragging. */
  onWidth: (preset: WidthPreset | "reset") => void;
  /** Set for a monthly group's label: where it pins, and the group's width it must stay inside. */
  pinned?: { left: number; maxWidth: number };
}) {
  const t = useT();
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
  // Same hand-off for "Tukar ikon": the picker opens once the menu has let go of focus.
  const toIcon = useRef(false);
  const [iconOpen, setIconOpen] = useState(false);
  const saveIcon = useSetCollectionIcon();
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
      toast.success(t("matrix.renamed"));
      finish();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const amount =
    collection.type === "voluntary"
      ? t("matrix.voluntary")
      : collection.type === "monthly"
        ? t("matrix.perMonth", { amount: formatMoneyShort(collection.defaultAmount ?? 0) })
        : formatMoneyShort(collection.defaultAmount ?? 0);

  return (
    // A one-off or voluntary header uses its column's full width; the name truncates only when the
    // column really is narrower. A monthly group's label pins beside the frozen Ahli column (its
    // th's px-3 included) while the group's months scroll under it, until the group scrolls out.
    <EmojiPicker
      anchor
      open={iconOpen}
      onOpenChange={setIconOpen}
      value={collection.icon ?? null}
      onChange={(icon) => void saveIcon(collection, icon)}
      label={collection.name}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        menuButton.current?.focus();
      }}
    >
      <div
        className={cn("flex items-start justify-between gap-1 py-2", pinned && "sticky w-max gap-3")}
        // Renaming a pinned label: take the label's full allowance so the input is not content-sized.
        style={pinned ? { left: pinned.left, maxWidth: Math.min(260, pinned.maxWidth), width: renaming ? Math.min(260, pinned.maxWidth) : undefined } : undefined}
      >
        {/* data-fit: auto-fit measures this block, plus the menu button and gap beside it. While
            renaming it grows to every pixel left of the ⋮ button, so the input fills the header. */}
        <div className={cn("min-w-0", renaming && "flex-1")} data-fit={pinned ? undefined : 28}>
          {renaming ? (
            <Input
              ref={renameInput}
              // Double-click path; the menu path focuses it once the menu has let go of focus.
              autoFocus={!toRename.current}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              // Select the whole name on open: it shows from its first letter and typing replaces it.
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => void commit()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commit();
                if (event.key === "Escape") {
                  setName(collection.name);
                  finish();
                }
                event.stopPropagation();
              }}
              aria-label={t("matrix.nameLabel")}
              // w-full min-w-0: exactly the header's width beside the ⋮ button, never wider, even in a 120px column.
              className="h-7 rounded-md border-primary bg-card px-1.5 py-0 text-small font-semibold md:text-small"
            />
          ) : (
            // Plain text, not a button: renaming is a menu action (keyboard and touch). Double-click
            // stays as a mouse shortcut; title shows the full name when truncated.
            // The icon sits inline in the truncating line, so a narrow column still ellipsises the name.
            <span onDoubleClick={() => setRenaming(true)} title={collection.name} className="block max-w-full truncate text-left text-small font-semibold">
              <CollectionIcon collection={collection} size="xs" className="mr-1.5 inline-block align-[-2px] text-primary-strong" />
              {collection.name}
            </span>
          )}
          <span className="block truncate text-caption font-normal text-muted-foreground">
            {amount}
            {collection.status === "draft" && ` · ${collectionStatusLabels.draft[0]}`}
            {collection.status === "completed" && ` · ${collectionStatusLabels.completed[0]}`}
            {collection.type !== "voluntary" && ` · ${t("matrix.settledProgress", { settled: progress.settled, total: progress.total })}`}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={menuButton} variant="ghost" size="icon-xs" aria-label={t("matrix.actionsFor", { name: collection.name })} className="-mr-1 rounded-md text-muted-foreground hover:bg-primary-light aria-expanded:bg-primary-light">
              <EllipsisVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56"
            onCloseAutoFocus={(event) => {
              if (toIcon.current) {
                toIcon.current = false;
                event.preventDefault();
                setIconOpen(true);
                return;
              }
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
              <Pencil /> {t("matrix.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                toIcon.current = true;
              }}
            >
              <Smile /> {t("matrix.changeIcon")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/kutipan/${collection.id}/`}>
                <ExternalLink /> {t("matrix.details")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <MoveHorizontal /> {t("matrix.columnWidth")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-40">
                <DropdownMenuItem onSelect={() => onWidth("narrow")}>{t("matrix.widthNarrow")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onWidth("normal")}>{t("matrix.widthNormal")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onWidth("wide")}>{t("matrix.widthWide")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onWidth("reset")}>{t("matrix.widthReset")}</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={onHide}>
              <EyeOff /> {t("matrix.hideColumn")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onArchive} className="text-muted-foreground">
              <Archive /> {t("matrix.archiveCollection")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </EmojiPicker>
  );
}

// Phone layout -----------------------------------------------------------------------------

/** One card per member; each collection is a tappable line, months a row of tiles. */
const MemberCards = memo(function MemberCards({ rows, columns }: { rows: Member[]; columns: MatrixColumn[] }) {
  const t = useT();
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
                  {due > 0 ? t("matrix.balance", { amount: formatMoney(due) }) : t("matrix.settled")}
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
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                          <CollectionIcon collection={collection} size="xs" />
                          <span className="min-w-0 truncate">{collection.name}</span>
                        </p>
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
                      <CollectionIcon collection={collection} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-medium">{collection.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {cell.kind === "voluntary"
                            ? t("matrix.contribution", { amount: formatMoney(cell.received) })
                            : cell.status === "exempt"
                              ? t("matrix.noCharge")
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
          {t("matrix.showMore", { count: rows.length - limit })}
        </Button>
      )}
      {/* Same rules as the desktop editor: Esc and the close button discard (explicit cancel); a tap
          outside with unsaved input asks in DiscardDialog. */}
      <Sheet open={open !== null} onOpenChange={(next) => !next && dismiss()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="gap-0 overflow-hidden p-0"
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
          <ModalHandle />
          <ModalHeader icon={Pencil} title={current ? t("editor.cellLabel", { member: current.member.name, column: current.column.label }) : t("editor.cellTitle")} description={t("editor.cellDescription")} />
          <ModalBody className="pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{current && <CellEditor cell={current} onDone={dismiss} onDirtyChange={setDirty} />}</ModalBody>
        </SheetContent>
      </Sheet>
      <DiscardDialog open={guard} onKeep={() => setGuard(false)} onDiscard={dismiss} restoreFocus={lastFocus.restore} />
    </>
  );
});
