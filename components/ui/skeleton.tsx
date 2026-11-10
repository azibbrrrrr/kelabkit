import { cn } from "cn"

/** A placeholder block. Colour and the shimmer (off under prefers-reduced-motion) live in globals.css. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("rounded-md", className)} {...props} />
}

export { Skeleton }
