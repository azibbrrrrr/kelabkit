import { cn } from "@/lib/utils";
import Link from "next/link";

/** The KelabKit blossom: an outlined five-petal flower on the brand gradient. Recolours per theme. */
export function BrandMark({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-7 rounded-lg", md: "size-9 rounded-xl", lg: "size-12 rounded-2xl" }[size];
  return (
    <span
      className={cn(
        "brand-gradient grid shrink-0 place-items-center text-white shadow-[0_8px_18px_-10px_var(--primary)]",
        box,
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[64%]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
        <circle cx="12" cy="12.4" r="2.1" />
        <path d="M12 10.2C10.3 7 10.9 4.4 12 3.6c1.1.8 1.7 3.4 0 6.6Z" />
        <path d="M14.1 11.6c3.3-1.6 5.8-.9 6.3.4-.6 1.2-3.1 2-6.3-.4Z" />
        <path d="M13.4 14.3c1.9 3.2 1.5 5.7.3 6.3-1.2-.4-2.2-2.8-.3-6.3Z" />
        <path d="M10.6 14.3c-1.9 3.2-1.5 5.7-.3 6.3 1.2-.4 2.2-2.8.3-6.3Z" />
        <path d="M9.9 11.6C6.6 10 4.1 10.7 3.6 12c.6 1.2 3.1 2 6.3-.4Z" />
      </svg>
    </span>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="KelabKit, ke Dashboard" className="flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <BrandMark />
      <span className="font-display text-[19px] font-bold tracking-[-.02em] text-foreground">KelabKit</span>
    </Link>
  );
}
