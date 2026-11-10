"use client"

import * as React from "react"
import { cn } from "cn"

/** Widths of the shared modal anatomy: sm 420, md 520, lg 680 (desktop; phones are full-width sheets). */
export type ModalSize = "sm" | "md" | "lg"

const sizes: Record<ModalSize, string> = {
  sm: "sm:max-w-[420px]",
  md: "sm:max-w-[520px]",
  lg: "sm:max-w-[680px]",
}

/**
 * One surface for every Dialog and AlertDialog.
 * >= 640px: centred card, radius from --radius-modal. < 640px: bottom sheet, full width, rounded
 * top corners, max 92svh. Children are laid out by ModalHeader / ModalBody / ModalFooter
 * (header and footer fixed, body scrolls).
 */
export function modalSurface(size: ModalSize, className?: string) {
  return cn(
    "fixed z-50 flex flex-col overflow-hidden bg-popover text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none duration-150",
    // phone: bottom sheet
    "max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[92svh] max-sm:rounded-t-(--radius-modal) max-sm:data-open:animate-in max-sm:data-open:slide-in-from-bottom max-sm:data-closed:animate-out max-sm:data-closed:slide-out-to-bottom",
    // >= sm: centred dialog
    "sm:top-1/2 sm:left-1/2 sm:max-h-[min(90svh,48rem)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-(--radius-modal) sm:data-open:animate-in sm:data-open:fade-in-0 sm:data-open:zoom-in-95 sm:data-closed:animate-out sm:data-closed:fade-out-0 sm:data-closed:zoom-out-95",
    sizes[size],
    className
  )
}

/**
 * Grab handle shown on phones. Dragging it down by more than 96px closes the sheet by pressing
 * the control marked data-modal-close (the header X or an alert's Batal); a plain tap does nothing.
 */
export function ModalHandle({ className }: { className?: string }) {
  const start = React.useRef<number | null>(null)
  const surface = (el: HTMLElement) => el.closest<HTMLElement>("[data-modal-surface]")
  return (
    <div
      aria-hidden
      data-slot="modal-handle"
      className={cn("flex shrink-0 touch-none justify-center pt-2.5 pb-1 sm:hidden", className)}
      onPointerDown={(event) => {
        start.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (start.current === null) return
        const el = surface(event.currentTarget)
        if (el) {
          el.style.transition = "none"
          el.style.transform = `translateY(${Math.max(0, event.clientY - start.current)}px)`
        }
      }}
      onPointerUp={(event) => {
        const el = surface(event.currentTarget)
        const dy = start.current === null ? 0 : event.clientY - start.current
        start.current = null
        if (!el) return
        el.style.transition = ""
        el.style.transform = ""
        if (dy > 96) el.querySelector<HTMLElement>("[data-modal-close]")?.click()
      }}
      onPointerCancel={(event) => {
        start.current = null
        const el = surface(event.currentTarget)
        if (el) {
          el.style.transition = ""
          el.style.transform = ""
        }
      }}
    >
      <span className="h-1 w-10 rounded-full bg-border" />
    </div>
  )
}
