"use client";

// Building blocks for page skeletons. They reuse the real PageShell and card classes and fixed
// heights taken from the rendered screens, so content replacing a skeleton does not move the page.

import { PageShell } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** A bar of a given size; `className` carries width, height and radius. */
export function Bar({ className }: { className?: string }) {
  return <Skeleton className={className} />;
}

/** Marks a region as busy and tells screen readers once; the blocks inside are aria-hidden. */
export function SkRegion({ children, className, shell = true }: { children: ReactNode; className?: string; shell?: boolean }) {
  const t = useT();
  const body = (
    <>
      <span role="status" className="sr-only">
        {t("common.loading")}…
      </span>
      {children}
    </>
  );
  return shell ? (
    <PageShell className={className}>
      <div aria-busy="true" className="contents">
        {body}
      </div>
    </PageShell>
  ) : (
    <div aria-busy="true" className={cn("flex flex-1 flex-col", className)}>
      {body}
    </div>
  );
}

/** Title (and optional description, back link, actions) with the heights of PageHeader. */
export function SkHeader({ description = true, lines = 1, phoneLine = true, actions = 0, back = false, wide = false }: { description?: boolean; lines?: number; phoneLine?: boolean; actions?: number; back?: boolean; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {back && <Bar className="mb-2 h-4 w-28" />}
        <div className="flex h-[29px] items-center md:h-[34px]">
          <Bar className={cn("h-6 w-48 md:h-7", wide && "w-72")} />
        </div>
        {description && (
          <div className="mt-1.5 grid">
            {/* 13px text on a 19.5px line; phones wrap one line more than desktops. */}
            {Array.from({ length: lines + (phoneLine ? 1 : 0) }, (_, i) => (
              <div key={i} className={cn("flex h-[19.5px] items-center", i === lines && "lg:hidden")}>
                <Bar className={cn("h-3.5 w-full max-w-xl", i > 0 && "max-w-sm")} />
              </div>
            ))}
          </div>
        )}
      </div>
      {actions > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Bar key={i} className="h-9 w-28 rounded-[10px]" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Same box as StatCard: icon, label, value, hint. */
export function SkStatCard({ hint = true }: { hint?: boolean }) {
  return (
    <Card className="h-full min-w-0 flex-row items-start gap-3 rounded-2xl border-border px-4 py-4 md:px-5 md:py-5">
      <Bar className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex h-[19px] items-center">
          <Bar className="h-3.5 w-24" />
        </div>
        <div className="mt-1 flex h-[26px] items-center md:h-[29px]">
          <Bar className="h-5 w-32 md:h-[22px]" />
        </div>
        {hint && (
          <div className="mt-1.5 flex h-4 items-center">
            <Bar className="h-3 w-36" />
          </div>
        )}
      </div>
    </Card>
  );
}

export function SkStats({ count, className }: { count: number; className: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkStatCard key={i} />
      ))}
    </div>
  );
}

/** Same shell as SectionCard, with a title row and whatever rows the page needs. */
export function SkCard({ title = true, action = false, children, className, contentClassName }: { title?: boolean; action?: boolean; children?: ReactNode; className?: string; contentClassName?: string }) {
  return (
    <Card className={cn("min-w-0 gap-0 rounded-2xl border-border py-0", className)}>
      {title && (
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 md:px-5 md:pt-5">
          <div className="flex items-center gap-2.5">
            <Bar className="size-[18px] rounded-md" />
            <Bar className="h-4 w-36" />
          </div>
          {action && <Bar className="h-4 w-20" />}
        </div>
      )}
      <div className={cn("px-4 pb-4 md:px-5 md:pb-5", !title && "pt-4 md:pt-5", contentClassName)}>{children}</div>
    </Card>
  );
}

/** Rows of a list inside a card: avatar-less lines with a trailing amount. */
export function SkRows({ rows, rowClassName = "h-[52px]", trailing = true }: { rows: number; rowClassName?: string; trailing?: boolean }) {
  return (
    <div className="grid">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn("flex items-center justify-between gap-4 border-b border-border/60 last:border-b-0", rowClassName)}>
          <Bar className="h-4 w-2/5" />
          {trailing && <Bar className="h-4 w-20" />}
        </div>
      ))}
    </div>
  );
}

/** A DataTable: header strip then rows (cards on phones, like the real table). */
export function SkTable({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden rounded-2xl border-border py-0">
      <div className="hidden h-[41px] items-center gap-6 bg-primary-tint px-4 md:flex">
        {Array.from({ length: columns }, (_, i) => (
          <Bar key={i} className={cn("h-3 w-16", i === 0 && "w-24")} />
        ))}
      </div>
      <div className="grid">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-[57px] items-center gap-4 border-b border-border/60 px-4 last:border-b-0 md:h-[58px] md:gap-6">
            <Bar className="size-8 shrink-0 rounded-full" />
            <Bar className="h-4 w-40 max-w-[45%]" />
            {Array.from({ length: columns - 2 }, (_, c) => (
              <Bar key={c} className={cn("hidden h-4 w-20 md:block", c === columns - 3 && "ml-auto")} />
            ))}
            <Bar className="ml-auto h-4 w-16 md:hidden" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Search box (h-10) with filter pills, as in Toolbar. */
export function SkToolbar({ pills = 4, actions = 0 }: { pills?: number; actions?: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
      <Bar className="h-10 w-full shrink-0 rounded-[10px] lg:w-64" />
      <div className="flex h-10 min-w-0 items-center gap-5 overflow-hidden lg:flex-1">
        {Array.from({ length: pills }, (_, i) => (
          <Bar key={i} className="h-4 w-14 shrink-0" />
        ))}
      </div>
      {actions > 0 && (
        <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
          {Array.from({ length: actions }, (_, i) => (
            <Bar key={i} className="h-9 w-24 rounded-[10px]" />
          ))}
        </div>
      )}
    </div>
  );
}
