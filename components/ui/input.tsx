import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "field-control h-10 w-full min-w-0 px-3 py-1 text-sm pointer-coarse:h-11 pointer-coarse:text-base file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground [&::-webkit-search-cancel-button]:hidden",
        className
      )}
      {...props}
    />
  )
}

export { Input }
