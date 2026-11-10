import { cn } from "cn"
import { Loader2Icon } from "lucide-react"
import { useT } from "@/lib/i18n/react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useT()
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label={t("ui.loading")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
