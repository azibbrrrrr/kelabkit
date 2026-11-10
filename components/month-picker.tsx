"use client";

import { fieldTriggerClass } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMonthLong, monthNamesShort, today } from "@/lib/format";
import type { Month } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

const monthKey = (year: number, index: number): Month => `${year}-${String(index + 1).padStart(2, "0")}`;

/**
 * A `YYYY-MM` field: year navigation and a 12-month grid in Malay. Arrow keys move between
 * months (up/down by a row of three), Enter picks, Escape closes and returns focus.
 */
export function MonthPicker({
  id,
  value,
  onChange,
  min,
  max,
  invalid,
  className,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: Month;
  onChange: (value: Month) => void;
  /** Earliest selectable month, inclusive. */
  min?: Month;
  /** Latest selectable month, inclusive. */
  max?: Month;
  invalid?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number((value || today()).slice(0, 4)));
  const grid = useRef<HTMLDivElement>(null);
  const valueId = useId();
  const current = today().slice(0, 7);
  const allowed = (month: Month) => (!min || month >= min) && (!max || month <= max);

  const focusMonth = (index: number) => {
    const buttons = grid.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[index]?.focus();
  };

  const onOpenChange = (next: boolean) => {
    if (next) {
      // Open on the chosen month's year, pulled into range so the grid is never all disabled.
      const base = value || current;
      const shown = min && base < min ? min : max && base > max ? max : base;
      setYear(Number(shown.slice(0, 4)));
    }
    setOpen(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = Number((event.target as HTMLElement).dataset.index);
    if (Number.isNaN(index)) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[event.key];
    if (step === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const target = event.key === "Home" ? 0 : event.key === "End" ? 11 : index + (step ?? 0);
    if (target < 0) {
      setYear((y) => y - 1);
      requestAnimationFrame(() => focusMonth(target + 12));
    } else if (target > 11) {
      setYear((y) => y + 1);
      requestAnimationFrame(() => focusMonth(target - 12));
    } else focusMonth(target);
  };

  const selectedIndex = value && Number(value.slice(0, 4)) === year ? Number(value.slice(5, 7)) - 1 : -1;
  const currentIndex = Number(current.slice(0, 4)) === year ? Number(current.slice(5, 7)) - 1 : -1;
  // Roving tab stop: the chosen month in view, else this month, else the first selectable one.
  const enabled = (index: number) => index >= 0 && allowed(monthKey(year, index));
  const firstEnabled = Math.max(0, monthNamesShort.findIndex((_, index) => enabled(index)));
  const tabStop = enabled(selectedIndex) ? selectedIndex : enabled(currentIndex) ? currentIndex : firstEnabled;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-describedby={[valueId, describedBy].filter(Boolean).join(" ")}
          aria-invalid={invalid || undefined}
          className={cn(fieldTriggerClass, className)}
        >
          <CalendarRange className="text-muted-foreground" aria-hidden />
          <span id={valueId} className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? formatMonthLong(value) : "Pilih bulan"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusMonth(tabStop);
        }}
      >
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Tahun sebelumnya" onClick={() => setYear((y) => y - 1)} disabled={Boolean(min) && year <= Number(min!.slice(0, 4))}>
            <ChevronLeft />
          </Button>
          <span className="text-sm font-semibold tabular-nums" aria-live="polite">
            {year}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Tahun seterusnya" onClick={() => setYear((y) => y + 1)} disabled={Boolean(max) && year >= Number(max!.slice(0, 4))}>
            <ChevronRight />
          </Button>
        </div>
        <div ref={grid} role="group" aria-label={`Bulan ${year}`} className="grid grid-cols-3 gap-1" onKeyDown={onKeyDown}>
          {monthNamesShort.map((name, index) => {
            const month = monthKey(year, index);
            const selected = index === selectedIndex;
            return (
              <Button
                key={month}
                type="button"
                variant="ghost"
                data-index={index}
                tabIndex={index === tabStop ? 0 : -1}
                aria-pressed={selected}
                aria-label={formatMonthLong(month)}
                disabled={!allowed(month)}
                onClick={() => {
                  onChange(month);
                  setOpen(false);
                }}
                className={cn(
                  "h-10 font-normal",
                  index === currentIndex && !selected && "bg-primary-light font-semibold text-primary-strong",
                  selected && "bg-primary-fill font-semibold text-primary-foreground hover:bg-primary-strong hover:text-primary-foreground",
                )}
              >
                {name}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
