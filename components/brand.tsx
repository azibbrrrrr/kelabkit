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
      {/* Same notched sakura as the app icon (app/icon.png): five petals rotated 72° apart. */}
      <svg viewBox="0 0 24 24" className="size-[70%]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
        {[0, 72, 144, 216, 288].map((angle) => (
          <path key={angle} transform={`rotate(${angle} 12 12)`} d="M12 10.6C9.4 9 8.9 5.6 10.1 3.1l1.9 1.4 1.9-1.4c1.2 2.5.7 5.9-1.9 7.5Z" />
        ))}
        <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="KelabKit, ke Dashboard" className="flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <BrandMark />
      <span className="font-display text-[19px] font-bold tracking-[-.02em] text-foreground">KelabKit</span>
    </Link>
  );
}
