import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-control flex field-sizing-content min-h-20 w-full px-3 py-2.5 text-sm pointer-coarse:text-base",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
