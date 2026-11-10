"use client";

import { RouteSkeleton } from "@/components/skeletons/pages";
import { Bar } from "@/components/skeletons/kit";

/** Sidebar, top bar and the page's own skeleton: shown while the server resolves the session and club. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-svh w-full bg-sidebar">
      <aside className="hidden w-64 shrink-0 flex-col gap-1.5 p-2 md:flex">
        <div className="flex h-16 items-center gap-2.5 px-3">
          <Bar className="size-9 rounded-xl" />
          <Bar className="h-5 w-24" />
        </div>
        <div className="grid gap-1.5 px-1 pt-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Bar key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      </aside>
      <div className="page-glow relative flex min-w-0 flex-1 flex-col bg-background md:my-2 md:mr-2 md:rounded-2xl md:border md:border-border/70">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4 md:px-6">
          <Bar className="size-8 rounded-lg" />
          <Bar className="h-10 w-full max-w-md rounded-[10px]" />
          <Bar className="ml-auto h-9 w-28 rounded-[10px]" />
        </div>
        <main className="flex flex-1 flex-col pb-24 md:pb-0">
          <RouteSkeleton />
        </main>
      </div>
    </div>
  );
}
