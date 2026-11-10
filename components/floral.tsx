import { cn } from "@/lib/utils";

// Decorative floral artwork, one set per accent (public/floral/<accent>/, sources in
// design/floral-source). The image is a CSS background chosen by [data-accent] in globals.css, so the
// right artwork is correct before hydration and only the active accent's files are fetched.
// Purely visual: aria-hidden, no pointer events, hidden when Tetapan turns floral off.

export type FloralAsset = "corner-bottom-left" | "corner-top-right" | "header-spray" | "blossom" | "sidebar-sprig";

export function Floral({ asset, className }: { asset: FloralAsset; className?: string }) {
  return <span aria-hidden className={cn("floral pointer-events-none absolute block select-none", `floral-${asset}`, className)} />;
}

/** A small blossom used inline, e.g. beside the greeting. */
export function Blossom({ className }: { className?: string }) {
  return <span aria-hidden className={cn("floral floral-blossom pointer-events-none inline-block size-7 select-none align-[-4px]", className)} />;
}
