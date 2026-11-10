"use client";

import { KelabDataProvider, useKelab } from "@/components/data-provider";
import { Floral } from "@/components/floral";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { GlobalSearch } from "@/components/shell/global-search";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { formatDay, formatMoney, initials } from "@/lib/format";
import { isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Bell, ChevronDown, House, Menu, Plus, Settings, Sheet, TriangleAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function Workspace({ children }: { children: ReactNode }) {
  return (
    <KelabDataProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="page-glow relative min-w-0 overflow-x-clip">
          <Floral asset="corner-top-right" className="top-0 right-0 z-0 hidden w-[260px] opacity-80 lg:block" />
          <TopBar />
          <main className="relative z-10 flex flex-1 flex-col pb-24 md:pb-0 print:pb-0">
            <DataGate>{children}</DataGate>
          </main>
          <MobileNav />
        </SidebarInset>
      </SidebarProvider>
    </KelabDataProvider>
  );
}

function TopBar() {
  const { demo, data } = useKelab();
  const treasurer = data?.club.treasurerName ?? "Bendahari";
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl md:px-6 print:hidden">
      <SidebarTrigger className="md:hidden" aria-label="Buka menu" />
      <GlobalSearch className="hidden sm:block" />
      <div className="sm:hidden">
        <span className="font-display text-[17px] font-bold">KelabKit</span>
      </div>
      {demo && (
        <span className="hidden shrink-0 rounded-full border border-dashed border-primary/50 bg-card px-2.5 py-0.5 text-[11px] font-medium text-primary-strong lg:inline-flex">
          Data demo
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <PendingBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 outline-none hover:bg-primary-tint focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <Avatar className="size-9 border-2 border-primary-light">
                <AvatarFallback className="bg-primary-light text-xs font-semibold text-primary-strong">{initials(treasurer)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-[13px] font-semibold">{treasurer}</span>
                <span className="block text-[11px] text-muted-foreground">Bendahari</span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block text-sm">{treasurer}</span>
              <span className="block text-xs font-normal text-muted-foreground">{data?.club.name}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/tetapan/">
                <Settings /> Tetapan & tema
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** Payments recorded but not yet confirmed: the treasurer's only real notification. */
function PendingBell() {
  const { data } = useKelab();
  const pending = (data?.payments ?? []).filter((payment) => payment.state === "pending");
  const names = new Map(data?.members.map((member) => [member.id, member.name]));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label={`${pending.length} bayaran menunggu semakan`}>
          <Bell className="size-5" />
          {pending.length > 0 && (
            <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-white">
              {pending.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Menunggu semakan</p>
          <p className="text-xs text-muted-foreground">Sahkan setelah wang diterima. Belum dikira sebagai kutipan.</p>
        </div>
        {pending.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Tiada bayaran menunggu semakan.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto p-1.5">
            {pending.map((payment) => (
              <li key={payment.id}>
                <Link
                  href={`/bayaran/?tab=semakan`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-primary-tint"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{names.get(payment.memberId)}</span>
                    <span className="block text-xs text-muted-foreground">{formatDay(payment.paidOn)}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(payment.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Phone navigation: the four daily destinations and a central record-payment action. */
function MobileNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const item = (href: string, label: string, Icon: typeof House) => (
    <Link
      href={href}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
        isActive(pathname, href) && "text-primary-strong",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden print:hidden"
    >
      {item("/", "Utama", House)}
      {item("/matriks/", "Matriks", Sheet)}
      <div className="flex flex-1 items-center justify-center">
        <Link
          href="/bayaran/baru/"
          aria-label="Rekod bayaran"
          className="brand-gradient -mt-6 grid size-14 place-items-center rounded-2xl text-white shadow-[0_12px_24px_-10px_var(--primary)]"
        >
          <Plus className="size-6" />
        </Link>
      </div>
      {item("/ahli/", "Ahli", UsersRound)}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
      >
        <Menu className="size-5" />
        Menu
      </button>
    </nav>
  );
}

/** Waits for the first load so screens never render half-empty totals. */
function DataGate({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useKelab();
  if (error && loading)
    return (
      <div className="grid flex-1 place-items-center p-6">
        <div className="max-w-md text-center">
          <TriangleAlert className="mx-auto mb-3 size-6 text-destructive" />
          <h1 className="text-lg font-semibold">Data KelabKit tidak dapat dimuatkan</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <Button variant="brand" className="mt-4" onClick={() => void refresh()}>
            Cuba lagi
          </Button>
        </div>
      </div>
    );
  if (loading)
    return (
      <div className="grid flex-1 place-items-center p-6">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  return <div className="flex flex-1 flex-col">{children}</div>;
}
