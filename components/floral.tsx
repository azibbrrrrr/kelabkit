import { cn } from "@/lib/utils";

// Decorative cherry-blossom artwork (public/floral, generated with Codex image generation).
// Purely visual: aria-hidden, no pointer events, hidden when Tetapan turns floral off, and
// tinted toward the active accent by the [data-accent] filters in globals.css.

export type FloralAsset = "corner-bottom-left" | "corner-top-right" | "header-spray" | "blossom" | "sidebar-sprig";

export function Floral({ asset, className }: { asset: FloralAsset; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative, sized by CSS
    <img
      src={`/floral/${asset}.webp`}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      className={cn("floral floral-tint pointer-events-none absolute select-none", className)}
    />
  );
}

/** A small blossom used inline, e.g. beside the greeting. */
export function Blossom({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative
    <img
      src="/floral/blossom.webp"
      alt=""
      aria-hidden
      draggable={false}
      className={cn("floral floral-tint inline-block size-7 select-none align-[-4px]", className)}
    />
  );
}
