"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateToDay, dayToDate, formatDay, today as malaysiaToday } from "@/lib/format";
import type { Day } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { useId, useState } from "react";
import { enGB, ms } from "react-day-picker/locale";
import { useLocale, useT } from "@/lib/i18n/react";

/** Shared look for picker triggers so they read as form fields (border ≥3:1, focus ring). */
export const fieldTriggerClass =
  "h-10 w-full min-w-0 justify-start gap-2 rounded-[10px] border-input bg-card px-3 text-sm font-normal text-foreground shadow-none pointer-coarse:h-11 pointer-coarse:text-base hover:border-input-hover hover:bg-card focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-offset-0 aria-expanded:border-ring aria-expanded:bg-card aria-invalid:border-destructive motion-safe:not-disabled:active:not-aria-[haspopup]:scale-100 dark:bg-card";

/**
 * A calendar-day field. The value stays a Malaysian `YYYY-MM-DD` string; the calendar only
 * sees local-midnight Dates built from it (lib/format dayToDate/dateToDay), so nothing drifts.
 * Associate a visible <Label htmlFor={id}> or pass aria-label.
 */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  clearable = false,
  emptyLabel,
  clearLabel,
  invalid,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: Day | "";
  onChange: (value: Day | "") => void;
  /** Earliest selectable day, inclusive. */
  min?: Day;
  /** Latest selectable day, inclusive (e.g. today for payment dates). */
  max?: Day;
  /** Optional field: shows a button that empties it. */
  clearable?: boolean;
  /** Trigger text when there is no value. */
  emptyLabel?: string;
  /** Text of the clear button. */
  clearLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const valueId = useId();
  const now = malaysiaToday();
  const selected = value ? dayToDate(value) : undefined;
  const todayAllowed = (!min || now >= min) && (!max || now <= max);
  const disabledDays = [...(min ? [{ before: dayToDate(min) }] : []), ...(max ? [{ after: dayToDate(max) }] : [])];
  // Open on the chosen day, else today (clamped into range so the grid is never all disabled).
  const focusDay = value || (max && now > max ? max : min && now < min ? min : now);

  const pick = (next: Day | "") => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={[valueId, describedBy].filter(Boolean).join(" ")}
          aria-invalid={invalid || undefined}
          className={cn(fieldTriggerClass, className)}
        >
          <CalendarDays className="text-muted-foreground" aria-hidden />
          <span id={valueId} className={cn("truncate tabular-nums", !value && "text-muted-foreground")}>
            {value ? formatDay(value) : (emptyLabel ?? t("picker.pickDate"))}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        // DayPicker's autoFocus puts focus on the selected day (or today) instead of the nav.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Calendar
          mode="single"
          required
          autoFocus
          locale={locale === "en" ? enGB : ms}
          today={dayToDate(now)}
          selected={selected}
          defaultMonth={dayToDate(focusDay)}
          startMonth={min ? dayToDate(min) : undefined}
          endMonth={max ? dayToDate(max) : undefined}
          disabled={disabledDays}
          onSelect={(date) => date && pick(dateToDay(date))}
          className="p-1 [--cell-size:--spacing(9)]"
        />
        {(clearable || todayAllowed) && (
          <div className="flex flex-wrap justify-between gap-2 border-t border-border px-1 pt-2">
            {todayAllowed ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => pick(now)}>
                {t("picker.today")}
              </Button>
            ) : (
              <span />
            )}
            {clearable && (
              <Button type="button" variant="ghost" size="sm" onClick={() => pick("")} disabled={!value}>
                {clearLabel ?? t("picker.noDate")}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
