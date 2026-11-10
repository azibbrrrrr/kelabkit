"use client";

import { Input } from "@/components/ui/input";
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
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground" aria-hidden>RM</span>
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className="pr-3 pl-11 font-medium tabular-nums placeholder:font-normal"
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
