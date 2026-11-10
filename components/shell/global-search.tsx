"use client";

import { useKelab } from "@/components/data-provider";
import { collectionTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Search, UserRound, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type Result = { id: string; href: string; title: string; meta: string; kind: "member" | "collection" };

/** Top-bar search over members and collections. Arrow keys move, Enter opens. */
export function GlobalSearch({ className }: { className?: string }) {
  const { data } = useKelab();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!data || q.length < 1) return [];
    const members = data.members
      .filter((member) => member.name.toLowerCase().includes(q) || member.phone?.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "x"))
      .slice(0, 6)
      .map((member) => ({
        id: member.id,
        href: `/ahli/${member.id}/`,
        title: member.name,
        meta: member.active ? "Ahli" : "Ahli · tidak aktif",
        kind: "member" as const,
      }));
    const collections = data.collections
      .filter((collection) => collection.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map((collection) => ({
        id: collection.id,
        href: `/kutipan/${collection.id}/`,
        title: collection.name,
        meta: `Kutipan · ${collectionTypeLabels[collection.type]}`,
        kind: "collection" as const,
      }));
    return [...members, ...collections];
  }, [data, query]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (result: Result) => {
    setOpen(false);
    setQuery("");
    router.push(result.href);
  };

  return (
    <div ref={wrapper} className={cn("relative w-full max-w-md", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-label="Cari ahli atau kutipan"
        placeholder="Cari ahli, kutipan atau no. telefon…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && results[active]) {
            event.preventDefault();
            go(results[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-xl border border-border bg-card pr-3 pl-10 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
      />
      {open && query.trim() && (
        <div id={listId} role="listbox" className="absolute top-12 right-0 left-0 z-50 overflow-hidden rounded-2xl border bg-popover p-1.5 shadow-xl">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">Tiada padanan untuk “{query.trim()}”.</p>
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.kind}-${result.id}`}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(result)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                  index === active && "bg-primary-tint",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-light text-primary-strong">
                  {result.kind === "member" ? <UserRound className="size-4" /> : <WalletCards className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{result.title}</span>
                  <span className="block text-xs text-muted-foreground">{result.meta}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
