"use client";

import { RadioGroup } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

// Two shapes of single choice, both on shadcn primitives so arrow keys work everywhere:
// - SegmentedChoice: short labels side by side (payment method, member category, view).
// - ChoiceCards: richer options with a hint (collection type, member scope, payment mode).
// Selected = primary tint, primary border, strong primary text.

const selectedLook = "border-primary bg-primary-tint text-primary-strong";

/**
 * A single choice of short labels: ToggleGroup type="single". Required by default (pressing the
 * chosen item again keeps it); `optional` lets it be pressed off, reporting "".
 */
export function SegmentedChoice<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  itemClassName,
  size = "default",
  optional = false,
  joined = false,
}: {
  value: T | "";
  onChange: (value: T) => void;
  options: readonly { value: T; label: ReactNode }[];
  /** Accessible name of the group. */
  label: string;
  className?: string;
  itemClassName?: string;
  size?: "default" | "sm";
  optional?: boolean;
  /** One joined control (shared border, hairline dividers) instead of separate pills. Used in forms. */
  joined?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Radix sends "" when the pressed item is pressed again; a required choice ignores it.
      onValueChange={(next) => (next || optional) && onChange(next as T)}
      aria-label={label}
      spacing={0}
      className={cn("grid w-full", joined ? "overflow-hidden rounded-[10px] border border-input bg-card" : "gap-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            joined
              ? "h-10 min-h-10 w-full min-w-0 rounded-none! border-y-0! border-r-0! border-l! border-border! bg-transparent px-2 text-small leading-tight font-medium whitespace-normal text-muted-foreground first:border-l-0! hover:bg-primary-tint hover:text-foreground pointer-coarse:h-11 data-[state=on]:bg-primary-tint data-[state=on]:text-primary-strong"
              : // Undo the group's joined-segment corners: these are separate pills.
                "h-auto min-h-10 w-full min-w-0 rounded-xl! border border-border! bg-card px-2 text-xs leading-tight font-medium whitespace-normal text-muted-foreground hover:bg-primary-tint hover:text-foreground data-[state=on]:border-primary!",
            !joined && "data-[state=on]:bg-primary-tint data-[state=on]:text-primary-strong",
            size === "sm" && "min-h-8 px-2.5",
            itemClassName,
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A RadioGroup whose items are cards. Arrow keys move and select, as APG radios do. */
export function ChoiceCards<T extends string>({
  value,
  onChange,
  label,
  className,
  children,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(next as T)} aria-label={label} className={className}>
      {children}
    </RadioGroup>
  );
}

/** One card in ChoiceCards. `indicator` shows a radio dot; omit it when the card has an icon. */
export function ChoiceCard({
  value,
  checked,
  indicator = false,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof RadioGroupPrimitive.Item>, "value"> & { value: string; checked: boolean; indicator?: boolean }) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      data-slot="choice-card"
      className={cn(
        "flex min-h-14 items-start gap-3 rounded-2xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        checked ? selectedLook : "border-border bg-card hover:bg-primary-tint/60",
        className,
      )}
      {...props}
    >
      {indicator && (
        <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-primary-fill" : "border-input")} aria-hidden>
          {checked && <span className="size-2 rounded-full bg-primary-fill" />}
        </span>
      )}
      {children}
    </RadioGroupPrimitive.Item>
  );
}
