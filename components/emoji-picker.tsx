"use client";

import { CollectionIcon, lucideCollectionIcons } from "@/components/collection-icon";
import { useKelab } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { isSingleEmoji, LUCIDE_PREFIX, lucideIconLabels, type LucideIconName } from "@/lib/collection-icon";
import { emojiCatalog, emojiCategories, searchEmoji, type EmojiCategoryId, type EmojiEntry } from "@/lib/emoji-catalog";
import { messageFor } from "@/lib/errors";
import type { Collection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock3, EyeOff, Search, Shuffle } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";

// Collection icon picker, after Notion's: Emoji and Ikon tabs with Buang beside them, a
// keyword search (BM and English), a shuffle, recents, category tabs along the bottom and a
// field for any other emoji pasted from the keyboard. A popover on desktop, a bottom sheet on
// phones. Every value it hands out has passed lib/collection-icon, the backend's own check.

export const RECENT_STORAGE_KEY = "kelabkit-emoji-recent-v1";
const RECENT_MAX = 16;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(icon: string) {
  try {
    const next = [icon, ...readRecent().filter((item) => item !== icon)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: recents are a convenience, the pick still applies.
  }
}

const byEmoji = new Map(emojiCatalog.map((entry) => [entry.emoji, entry]));

function iconLabel(icon: string) {
  if (icon.startsWith(LUCIDE_PREFIX)) return `Ikon ${lucideIconLabels[icon.slice(LUCIDE_PREFIX.length) as LucideIconName] ?? ""}`.trim();
  return byEmoji.get(icon)?.name ?? icon;
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Arrow keys across a picker grid, by layout rather than index, so Up and Down land on the
 * nearest cell in the row above or below even across section headings. Home and End jump to
 * the ends; Up from the first row returns to `onExitTop` (the search field).
 */
function gridKeyDown(event: KeyboardEvent<HTMLElement>, onExitTop?: () => void) {
  const from = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
  if (!from) return;
  const cells = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-cell]")];
  const index = cells.indexOf(from);
  let to: HTMLElement | undefined;
  if (event.key === "ArrowLeft") to = cells[index - 1];
  else if (event.key === "ArrowRight") to = cells[index + 1];
  else if (event.key === "Home") to = cells[0];
  else if (event.key === "End") to = cells[cells.length - 1];
  else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const here = from.getBoundingClientRect();
    const down = event.key === "ArrowDown";
    const beyond = cells.filter((cell) => {
      const top = cell.getBoundingClientRect().top;
      return down ? top > here.top + 4 : top < here.top - 4;
    });
    if (!beyond.length) {
      if (!down && onExitTop) {
        event.preventDefault();
        onExitTop();
      }
      return;
    }
    const rowTop = down ? Math.min(...beyond.map((c) => c.getBoundingClientRect().top)) : Math.max(...beyond.map((c) => c.getBoundingClientRect().top));
    const row = beyond.filter((cell) => Math.abs(cell.getBoundingClientRect().top - rowTop) < 4);
    const centre = here.left + here.width / 2;
    to = row.reduce((best, cell) => {
      const a = cell.getBoundingClientRect();
      const b = best.getBoundingClientRect();
      return Math.abs(a.left + a.width / 2 - centre) < Math.abs(b.left + b.width / 2 - centre) ? cell : best;
    });
  } else return;
  event.preventDefault();
  if (to) {
    to.focus();
    to.scrollIntoView({ block: "nearest" });
  }
}

const cellClass =
  "grid place-items-center rounded-lg outline-none transition-colors hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-primary-light aria-pressed:ring-1 aria-pressed:ring-primary/50";

type Section = { id: string; title: string; entries: { key: string; icon: string; label: string }[] };

function PickerBody({ value, onPick, onClose, sheet }: { value: string | null; onPick: (icon: string | null) => void; onClose: () => void; sheet: boolean }) {
  const [tab, setTab] = useState<"emoji" | "ikon">(value?.startsWith(LUCIDE_PREFIX) ? "ikon" : "emoji");
  const [query, setQuery] = useState("");
  const [recent] = useState<string[]>(() => readRecent());
  const [active, setActive] = useState<string | null>(null);
  const [category, setCategory] = useState<EmojiCategoryId | "terkini">(recent.length ? "terkini" : "makanan");
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const ids = useId();

  const pick = useCallback(
    (icon: string | null) => {
      if (icon) pushRecent(icon);
      onPick(icon);
    },
    [onPick],
  );

  const sections = useMemo<Section[]>(() => {
    const toCell = (prefix: string) => (entry: EmojiEntry) => ({ key: `${prefix}:${entry.emoji}`, icon: entry.emoji, label: entry.name });
    const q = query.trim();
    if (q) return [{ id: "hasil", title: "Hasil carian", entries: searchEmoji(q).map(toCell("hasil")) }];
    const list: Section[] = [];
    if (recent.length) list.push({ id: "terkini", title: "Terkini", entries: recent.map((icon) => ({ key: `terkini:${icon}`, icon, label: iconLabel(icon) })) });
    for (const cat of emojiCategories)
      list.push({ id: cat.id, title: cat.label, entries: emojiCatalog.filter((entry) => entry.category === cat.id).map(toCell(cat.id)) });
    return list;
  }, [query, recent]);

  const keys = sections.flatMap((section) => section.entries.map((entry) => entry.key));
  // Roving tab stop: the last focused cell, else the current icon, else the first cell.
  const selectedKey = keys.find((key) => key.endsWith(`:${value}`) && !key.startsWith("terkini:"));
  const rover = active && keys.includes(active) ? active : (selectedKey ?? keys[0]);

  // Highlight the bottom tab of the section at the top of the scroll area.
  const onScroll = () => {
    const box = scroller.current;
    if (!box || query.trim()) return;
    const top = box.getBoundingClientRect().top;
    let current: string | null = null;
    for (const el of box.querySelectorAll<HTMLElement>("[data-section]")) if (el.getBoundingClientRect().top - top <= 24) current = el.dataset.section!;
    if (current && current !== category) setCategory(current as EmojiCategoryId | "terkini");
  };

  const jumpTo = (id: EmojiCategoryId | "terkini") => {
    setQuery("");
    setCategory(id);
    requestAnimationFrame(() => {
      const box = scroller.current;
      const el = box?.querySelector<HTMLElement>(`[data-section="${id}"]`);
      if (box && el) box.scrollTo({ top: el.offsetTop - box.offsetTop, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  };

  const focusFirstCell = () => scroller.current?.querySelector<HTMLElement>("[data-cell]")?.focus();

  const applyPaste = () => {
    const icon = paste.trim();
    if (!isSingleEmoji(icon)) return setPasteError("Tampal satu emoji sahaja.");
    pick(icon);
  };

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as "emoji" | "ikon")} className="gap-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-1">
        <TabsList variant="line" className="h-10 gap-1 bg-transparent p-0" aria-label="Jenis ikon">
          <TabsTrigger value="emoji" className="px-2.5">
            Emoji
          </TabsTrigger>
          <TabsTrigger value="ikon" className="px-2.5">
            Ikon
          </TabsTrigger>
        </TabsList>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={!value} onClick={() => pick(null)}>
          <EyeOff aria-hidden /> Buang
        </Button>
      </div>

      <TabsContent value="emoji" className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={search}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(null);
                if (scroller.current) scroller.current.scrollTop = 0;
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusFirstCell();
                }
                if (event.key === "Enter" && query.trim()) {
                  event.preventDefault();
                  const first = sections[0]?.entries[0];
                  if (first) pick(first.icon);
                }
              }}
              placeholder="Cari: makan, baju, hadiah…"
              aria-label="Cari emoji"
              aria-controls={`${ids}-grid`}
              className="h-9 rounded-lg pl-8"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0 rounded-lg"
            aria-label="Pilih emoji rawak"
            title="Pilih emoji rawak"
            onClick={() => pick(emojiCatalog[Math.floor(Math.random() * emojiCatalog.length)].emoji)}
          >
            <Shuffle aria-hidden />
          </Button>
        </div>

        <div
          ref={scroller}
          id={`${ids}-grid`}
          onScroll={onScroll}
          onKeyDown={(event) => gridKeyDown(event, () => search.current?.focus())}
          className={cn("overflow-y-auto overscroll-contain px-2 pb-2", sheet ? "h-[min(40svh,300px)]" : "h-[264px]")}
        >
          {sections.map((section) => (
            <section key={section.id} data-section={section.id} aria-labelledby={`${ids}-${section.id}`} className="pt-1.5">
              <h3 id={`${ids}-${section.id}`} className="px-1 pb-1 text-[11px] font-semibold text-muted-foreground">
                {section.title}
              </h3>
              {section.entries.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  Tiada emoji untuk &ldquo;{query.trim()}&rdquo;. Cuba perkataan lain atau tampal emoji di bawah.
                </p>
              ) : (
                <div role="group" aria-labelledby={`${ids}-${section.id}`} className="grid grid-cols-8 gap-0.5">
                  {section.entries.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      data-cell
                      tabIndex={entry.key === rover ? 0 : -1}
                      aria-label={entry.label}
                      aria-pressed={entry.icon === value}
                      title={entry.label}
                      onFocus={() => setActive(entry.key)}
                      onClick={() => pick(entry.icon)}
                      className={cn(cellClass, "aspect-square min-h-9")}
                    >
                      <CollectionIcon icon={entry.icon} size="md" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        <form
          className="flex flex-wrap items-center gap-2 border-t border-border px-2.5 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyPaste();
          }}
          noValidate
        >
          <label htmlFor={`${ids}-paste`} className="text-xs font-medium text-muted-foreground">
            Tampal emoji lain
          </label>
          <Input
            id={`${ids}-paste`}
            value={paste}
            onChange={(event) => {
              setPaste(event.target.value);
              setPasteError(null);
            }}
            maxLength={32}
            inputMode="text"
            autoComplete="off"
            aria-invalid={Boolean(pasteError)}
            aria-describedby={pasteError ? `${ids}-paste-error` : undefined}
            className="h-8 w-20 rounded-lg text-center font-emoji text-base md:text-base"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!paste.trim()}>
            Guna
          </Button>
          {pasteError && (
            <p id={`${ids}-paste-error`} className="basis-full text-xs font-medium text-st-unpaid">
              {pasteError}
            </p>
          )}
        </form>

        <nav aria-label="Kategori emoji" className="flex items-center justify-between gap-0.5 border-t border-border px-1.5 py-1">
          {recent.length > 0 && (
            <button
              type="button"
              aria-label="Terkini"
              title="Terkini"
              aria-current={!query.trim() && category === "terkini" ? "true" : undefined}
              onClick={() => jumpTo("terkini")}
              className={cn(cellClass, "size-9 text-muted-foreground aria-[current=true]:bg-primary-light aria-[current=true]:text-primary-strong")}
            >
              <Clock3 aria-hidden className="size-[18px]" />
            </button>
          )}
          {emojiCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-label={cat.label}
              title={cat.label}
              aria-current={!query.trim() && category === cat.id ? "true" : undefined}
              onClick={() => jumpTo(cat.id)}
              className={cn(cellClass, "size-9 opacity-70 hover:opacity-100 aria-[current=true]:bg-primary-light aria-[current=true]:opacity-100")}
            >
              <CollectionIcon icon={cat.emoji} size="sm" />
            </button>
          ))}
        </nav>
      </TabsContent>

      <TabsContent value="ikon">
        <div role="group" aria-label="Ikon" onKeyDown={(event) => gridKeyDown(event)} className="grid grid-cols-4 gap-1 p-2.5 min-[380px]:grid-cols-6 md:grid-cols-4">
          {(Object.keys(lucideIconLabels) as LucideIconName[]).map((name, i) => {
            const icon = `${LUCIDE_PREFIX}${name}`;
            const Glyph = lucideCollectionIcons[name];
            const selected = icon === value;
            const first = value?.startsWith(LUCIDE_PREFIX) ? selected : i === 0;
            return (
              <button
                key={name}
                type="button"
                data-cell
                tabIndex={first ? 0 : -1}
                aria-pressed={selected}
                onClick={() => pick(icon)}
                className={cn(cellClass, "flex min-h-14 flex-col gap-1 px-1 py-2 text-primary-strong")}
              >
                <Glyph aria-hidden className="size-5" />
                <span className="w-full truncate text-center text-[10.5px] text-muted-foreground">{lucideIconLabels[name]}</span>
              </button>
            );
          })}
        </div>
      </TabsContent>
      {/* Esc closes through the popover/sheet; this keeps a pointer-free way out on touch screens too. */}
      {sheet && (
        <div className="border-t border-border px-2.5 py-2">
          <Button type="button" variant="outline" className="w-full" onClick={onClose}>
            Tutup
          </Button>
        </div>
      )}
    </Tabs>
  );
}

/**
 * Wraps a trigger (default) or an anchor (`anchor`: opened from elsewhere, e.g. a menu item)
 * with the picker. Esc and outside clicks close it; focus returns to the trigger, or to
 * whatever `onCloseAutoFocus` chooses in anchor mode.
 */
export function EmojiPicker({
  value,
  onChange,
  label,
  children,
  anchor = false,
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
  align = "start",
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  /** Who the icon is for, e.g. the collection's name: the sheet's title on phones. */
  label: string;
  children: ReactElement;
  anchor?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  align?: "start" | "center" | "end";
}) {
  const mobile = useIsMobile();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const onPick = useCallback(
    (icon: string | null) => {
      setOpen(false);
      onChange(icon);
    },
    [onChange, setOpen],
  );

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        {anchor ? children : <SheetTrigger asChild>{children}</SheetTrigger>}
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]" showCloseButton={false} onCloseAutoFocus={onCloseAutoFocus}>
          <SheetHeader className="px-4 pt-3 pb-1">
            <SheetTitle className="truncate">Ikon kutipan</SheetTitle>
            <SheetDescription className="truncate">{label}</SheetDescription>
          </SheetHeader>
          <PickerBody value={value} onPick={onPick} onClose={() => setOpen(false)} sheet />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {anchor ? <PopoverAnchor asChild>{children}</PopoverAnchor> : <PopoverTrigger asChild>{children}</PopoverTrigger>}
      <PopoverContent align={align} className="w-[340px] gap-0 overflow-hidden rounded-2xl p-0" aria-label={`Ikon kutipan: ${label}`}
        onCloseAutoFocus={onCloseAutoFocus}
        // Start in the search field, not on the first tab, so typing searches straight away.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.target as HTMLElement | null)?.querySelector<HTMLElement>('input[type="search"]')?.focus();
        }}
      >
        <PickerBody value={value} onPick={onPick} onClose={() => setOpen(false)} sheet={false} />
      </PopoverContent>
    </Popover>
  );
}

/** Saves a collection's icon through the backend, with the toast and error handling every caller wants. */
export function useSetCollectionIcon() {
  const { run } = useKelab();
  return useCallback(
    async (collection: Collection, icon: string | null) => {
      if (icon === (collection.icon ?? null)) return;
      try {
        await run((backend) => backend.setCollectionIcon(collection.id, icon));
        toast.success(icon ? "Ikon kutipan dikemas kini." : "Ikon kutipan dibuang.");
      } catch (error) {
        toast.error(messageFor(error));
      }
    },
    [run],
  );
}

/** A collection's icon tile as a button that opens the picker. Archived collections show a plain tile. */
export function CollectionIconButton({
  collection,
  size = "md",
  className,
  children,
}: {
  collection: Collection;
  size?: "sm" | "md" | "lg" | "xl";
  /** The tile's look: size, radius, background. */
  className: string;
  children?: ReactNode;
}) {
  const save = useSetCollectionIcon();
  const icon = <CollectionIcon collection={collection} size={size} />;
  if (collection.status === "archived")
    return (
      <span className={cn("grid shrink-0 place-items-center", className)}>
        {icon}
        {children}
      </span>
    );
  return (
    <EmojiPicker value={collection.icon ?? null} onChange={(next) => void save(collection, next)} label={collection.name}>
      <button
        type="button"
        aria-label={`Tukar ikon: ${collection.name}`}
        title="Tukar ikon"
        className={cn(
          "grid shrink-0 cursor-pointer place-items-center outline-none transition-[box-shadow,background-color] hover:ring-2 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-expanded:ring-2 aria-expanded:ring-primary/50",
          className,
        )}
      >
        {icon}
        {children}
      </button>
    </EmojiPicker>
  );
}
