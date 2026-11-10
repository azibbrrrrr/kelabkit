"use client";

import { errorMessages } from "@/lib/errors";
import { parseRinggit } from "@/lib/money/amount";
import type { Sen } from "@/lib/types";
import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

/** A ringgit field: "RM" prefix, decimal keypad on phones, parsed to sen by parseMoney(). */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode"> & { invalid?: boolean }
>(function MoneyInput({ className, invalid, ...props }, ref) {
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground">RM</span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={cn(
          "h-11 w-full rounded-xl border border-input bg-card pr-3 pl-11 text-[15px] font-medium tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring",
          invalid && "border-destructive focus:border-destructive focus:ring-destructive/20",
        )}
        {...props}
      />
    </div>
  );
});

/** Parses a money field; returns sen or the Bahasa Melayu error to show under it. */
export function parseMoney(input: string): { sen: Sen; error: null } | { sen: null; error: string } {
  const parsed = parseRinggit(input);
  return parsed.ok ? { sen: parsed.sen, error: null } : { sen: null, error: errorMessages[parsed.error] };
}
