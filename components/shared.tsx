"use client";

// Page building blocks shared by every screen. Restyled from Growlink Admin's
// components/shared.tsx to Concept 04: rounded-2xl cards, tinted icon tiles, rose accents.

import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { cellStatusLabels, overdueLabel, pendingLabel, type CellStatus, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Check, CircleDashed, CircleDot, Clock, Hourglass, Minus, Search, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// Layout ---------------------------------------------------------------------------------

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-5 px-4 py-5 md:gap-6 md:px-6 md:py-7 lg:px-8", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A link above the title back to the parent list. */
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="font-display text-[24px] leading-[1.2] font-bold tracking-[-.02em] break-words md:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  icon: Icon,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("min-w-0 gap-0 rounded-2xl border-border py-0 shadow-[0_1px_2px_rgba(231,84,128,.04)]", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 md:px-5 md:pt-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <Icon className="size-[18px] shrink-0 text-primary" aria-hidden />}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold tracking-[-.01em]">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className={cn("px-4 pb-4 md:px-5 md:pb-5", !title && !action && "pt-4 md:pt-5", contentClassName)}>{children}</div>
    </Card>
  );
}

/** "Lihat Semua →" style link used in card headers. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-primary-strong hover:bg-primary-tint">
      {children} →
    </Link>
  );
}

export function DetailList({ items }: { items: { label: string; value?: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[minmax(0,140px)_1fr] gap-3">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words">{item.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// Values ---------------------------------------------------------------------------------

export function Money({ sen, className }: { sen: number; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatMoney(sen)}</span>;
}

const statTone = {
  brand: "bg-primary-light text-primary-strong",
  paid: "bg-st-paid-bg text-st-paid",
  partial: "bg-st-partial-bg text-st-partial",
  unpaid: "bg-st-unpaid-bg text-st-unpaid",
  exempt: "bg-st-exempt-bg text-st-exempt",
  pending: "bg-st-pending-bg text-st-pending",
} as const;

/** The reference's summary tile: tinted icon, label, large figure, one line of context. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof statTone;
  href?: string;
  className?: string;
}) {
  const body = (
    <Card
      className={cn(
        "relative h-full min-w-0 flex-row items-start gap-3 rounded-2xl border-border px-4 py-4 transition-colors md:px-5 md:py-5",
        tone === "brand" && "bg-primary-tint/60",
        href && "hover:border-primary/40",
        className,
      )}
    >
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", statTone[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 text-[21px] leading-tight font-bold tracking-[-.02em] whitespace-nowrap tabular-nums md:text-[23px]">{value}</div>
        {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block min-w-0 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {body}
    </Link>
  ) : (
    body
  );
}

/** A thin progress bar in the accent colour. */
export function ProgressBar({ value, max, className, label }: { value: number; max: number; className?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-primary-light", className)}
    >
      <div className="brand-gradient h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}

// Status ---------------------------------------------------------------------------------

const toneClass: Record<Tone, string> = {
  paid: "bg-st-paid-bg text-st-paid",
  partial: "bg-st-partial-bg text-st-partial",
  unpaid: "bg-st-unpaid-bg text-st-unpaid",
  overdue: "bg-st-overdue-bg text-st-overdue",
  exempt: "bg-st-exempt-bg text-st-exempt",
  na: "bg-st-na-bg text-st-na",
  pending: "bg-st-pending-bg text-st-pending",
  future: "bg-st-future-bg text-st-future",
  neutral: "border border-border bg-card text-muted-foreground",
  brand: "bg-primary-light text-primary-strong",
};

const toneIcon: Partial<Record<Tone, LucideIcon>> = {
  paid: Check,
  partial: CircleDot,
  unpaid: CircleDashed,
  overdue: TriangleAlert,
  exempt: Minus,
  na: Minus,
  pending: Hourglass,
  future: Clock,
};

/**
 * A status chip. Every status pairs colour with an icon and a word, so it reads without
 * colour (WCAG 1.4.1).
 */
export function StatusChip({ label, tone, className, compact }: { label: string; tone: Tone; className?: string; compact?: boolean }) {
  const Icon = toneIcon[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium whitespace-nowrap",
        compact && "h-5 px-2 text-[11px]",
        toneClass[tone],
        className,
      )}
    >
      {Icon && <Icon className={cn("size-3.5", compact && "size-3")} aria-hidden strokeWidth={2} />}
      {label}
    </span>
  );
}

export function LabelChip({ entry, compact }: { entry: [string, Tone]; compact?: boolean }) {
  return <StatusChip label={entry[0]} tone={entry[1]} compact={compact} />;
}

/** The full status of a charge: base status, plus Lewat and Menunggu Semakan when they apply. */
export function ChargeStatusChips({
  status,
  overdue,
  pending,
  compact,
  className,
}: {
  status: CellStatus;
  overdue?: boolean;
  pending?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <LabelChip entry={cellStatusLabels[status]} compact={compact} />
      {overdue && <LabelChip entry={overdueLabel} compact={compact} />}
      {pending && <LabelChip entry={pendingLabel} compact={compact} />}
    </span>
  );
}

// Empty, loading and error states ---------------------------------------------------------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("rounded-2xl border border-dashed border-border bg-card/60 py-10", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-primary-light text-primary-strong">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function ErrorState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-st-unpaid-bg/50 p-4">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-st-unpaid" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-st-unpaid">{title}</p>
        {description && <p className="mt-0.5 text-xs text-foreground/80">{description}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Memuatkan">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 rounded-xl bg-primary-light/60" />
      ))}
    </div>
  );
}

// Data table -----------------------------------------------------------------------------

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
  hideBelow?: "lg" | "xl" | "2xl";
};

// Breakpoints are the table's own width (container queries), not the viewport's.
const hide = { lg: "hidden @2xl/table:table-cell", xl: "hidden @4xl/table:table-cell", "2xl": "hidden @6xl/table:table-cell" };

/**
 * A table on tablets and desktops and a stack of cards on phones. Rows call `onSelect`
 * when given; elements marked `data-row-action` keep their own clicks.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onSelect,
  mobileCard,
  empty,
  className,
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onSelect?: (row: T) => void;
  mobileCard: (row: T) => ReactNode;
  empty?: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className={cn("min-w-0", className)}>
      <Card className="@container/table hidden min-w-0 gap-0 overflow-hidden rounded-2xl border-border py-0 md:flex">
        <Table>
          <TableHeader className="bg-primary-tint">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    "h-10 px-4 text-xs font-semibold text-muted-foreground",
                    column.align === "right" && "text-right",
                    column.hideBelow && hide[column.hideBelow],
                    column.className,
                  )}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn("hover:bg-primary-tint/60", onSelect && "cursor-pointer")}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={(event) => {
                  if (onSelect && (event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
                onClick={(event) => {
                  if (!onSelect || (event.target as HTMLElement).closest("a,button,[data-row-action]")) return;
                  onSelect(row);
                }}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "px-4 py-3",
                      column.align === "right" && "text-right tabular-nums",
                      column.hideBelow && hide[column.hideBelow],
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {footer}
      </Card>
      <ul className="grid grid-cols-1 gap-2 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="min-w-0">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(row)}
                className="block w-full rounded-2xl border border-border bg-card p-4 text-left transition-colors active:bg-primary-tint"
              >
                {mobileCard(row)}
              </button>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-4">{mobileCard(row)}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two-line layout for mobile cards: title and amount, then meta and status. */
export function MobileRow({ title, amount, meta, status }: { title: ReactNode; amount?: ReactNode; meta?: ReactNode; status?: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-medium break-words">{title}</span>
        {amount !== undefined && <span className="shrink-0 font-semibold tabular-nums">{amount}</span>}
      </div>
      {(meta || status) && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{meta}</span>
          {status}
        </div>
      )}
    </div>
  );
}

// Filters --------------------------------------------------------------------------------

export function SearchInput({
  id,
  value,
  onChange,
  placeholder = "Cari…",
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-xl border border-border bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-ring/20"
      />
    </div>
  );
}

/** A row of pill toggles for filtering a list; scrolls sideways on narrow screens. */
export function FilterPills<V extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: V;
  onChange: (value: V) => void;
  options: { value: V; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
            value === option.value
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-primary-tint hover:text-foreground",
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className={cn("tabular-nums", value === option.value ? "text-primary-foreground/85" : "text-subtle")}>{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Small "DEMO" marker for figures that come from sample data. */
export function DemoNote({ children }: { children?: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-primary/40 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-semibold text-primary-strong">Data demo.</span> {children ?? "Nama dan angka adalah contoh, disimpan dalam pelayar ini sahaja."}
    </p>
  );
}
