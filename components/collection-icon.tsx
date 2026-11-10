"use client";

import { lucideNameOf, type LucideIconName } from "@/lib/collection-icon";
import type { Collection, CollectionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Bus,
  Cake,
  CalendarDays,
  CalendarRange,
  Coffee,
  Dumbbell,
  Gift,
  GraduationCap,
  HandCoins,
  HandHeart,
  HeartHandshake,
  Medal,
  Music,
  PartyPopper,
  PiggyBank,
  Plane,
  Receipt,
  ReceiptText,
  School,
  Shirt,
  Star,
  Tent,
  Trophy,
  Users,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** The icon shown for a collection with no icon of its own: one per type. The only such mapping. */
export const collectionTypeIcons: Record<CollectionType, LucideIcon> = {
  one_off: ReceiptText,
  monthly: CalendarRange,
  voluntary: HandHeart,
};

/** Components for the allowlist in lib/collection-icon.ts; the Record type keeps the two in step. */
export const lucideCollectionIcons: Record<LucideIconName, LucideIcon> = {
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  "hand-coins": HandCoins,
  receipt: Receipt,
  utensils: Utensils,
  coffee: Coffee,
  cake: Cake,
  shirt: Shirt,
  gift: Gift,
  "party-popper": PartyPopper,
  "heart-handshake": HeartHandshake,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  school: School,
  trophy: Trophy,
  medal: Medal,
  dumbbell: Dumbbell,
  music: Music,
  bus: Bus,
  plane: Plane,
  tent: Tent,
  "calendar-days": CalendarDays,
  users: Users,
  star: Star,
};

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

// Emoji are drawn a touch larger than the stroke icons they replace so they read at the same weight.
const emojiSize: Record<IconSize, string> = {
  xs: "text-[13px]",
  sm: "text-[16px]",
  md: "text-[20px]",
  lg: "text-[24px]",
  xl: "text-[30px]",
};
const glyphSize: Record<IconSize, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
  xl: "size-7",
};

/**
 * A collection's icon: its emoji, its lucide icon, or (null or unknown) its type's icon.
 * Always decorative (aria-hidden): the collection's name sits beside it, or the control that
 * wraps it carries the name.
 */
export function CollectionIcon({
  collection,
  icon,
  type,
  size = "md",
  className,
}: {
  collection?: Pick<Collection, "icon" | "type">;
  /** Overrides collection.icon, e.g. while the wizard has no collection yet. */
  icon?: string | null;
  type?: CollectionType;
  size?: IconSize;
  className?: string;
}) {
  const value = icon !== undefined ? icon : (collection?.icon ?? null);
  const kind = type ?? collection?.type ?? "one_off";
  const lucide = lucideNameOf(value);
  if (value && !lucide && !value.startsWith("lucide:")) {
    return (
      <span
        aria-hidden
        data-collection-icon="emoji"
        className={cn("inline-block shrink-0 text-center leading-none font-emoji not-italic select-none", emojiSize[size], className)}
      >
        {value}
      </span>
    );
  }
  const Glyph = lucide ? lucideCollectionIcons[lucide] : collectionTypeIcons[kind];
  return <Glyph aria-hidden data-collection-icon={lucide ? "lucide" : "type"} className={cn("shrink-0", glyphSize[size], className)} />;
}

/** "🍽️ Jamuan Akhir Tahun" for lists and selectors: icon, then the name that truncates. */
export function CollectionName({ collection, size = "xs", className }: { collection: Pick<Collection, "icon" | "type" | "name">; size?: IconSize; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <CollectionIcon collection={collection} size={size} />
      <span className="min-w-0 truncate">{collection.name}</span>
    </span>
  );
}
