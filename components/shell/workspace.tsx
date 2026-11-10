"use client";

import { KelabDataProvider, useKelab } from "@/components/data-provider";
import { Floral } from "@/components/floral";
import { IsiPantasProvider } from "@/components/isi-pantas/provider";
import { IsiPantasButton, IsiPantasPill, IsiPantasSheet } from "@/components/isi-pantas/sheet";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { GlobalSearch } from "@/components/shell/global-search";
import { LanguagePill } from "@/components/language-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { leaveDemo } from "@/lib/auth/mode";
import { formatDay, formatMoney, initials } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/react";
import { isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Bell, ChevronDown, House, LogOut, Menu, Plus, Settings, Sheet, TriangleAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type ShellUser = { name: string; email: string; image: string | null };

/** `user` is the signed-in Google account; absent in demo mode. */
export function Workspace({ user, children }: { user?: ShellUser; children: ReactNode }) {
  return (
    <KelabDataProvider mode={user ? "neon" : "demo"}>
      <IsiPantasProvider>
        <SidebarProvider style={{ "--sidebar-width-icon": "3.5rem" } as CSSProperties}>
          <RestoreCollapsedSidebar />
          <AppSidebar />
          <SidebarInset className="page-glow relative min-w-0 overflow-x-clip md:peer-data-[variant=inset]:overflow-clip md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border/70 md:peer-data-[variant=inset]:shadow-[0_1px_2px_color-mix(in_srgb,var(--foreground)_4%,transparent),0_8px_24px_-16px_color-mix(in_srgb,var(--primary)_22%,transparent)] print:m-0! print:rounded-none! print:border-0! print:shadow-none!">
            <Floral asset="corner-top-right" className="top-0 right-0 z-0 hidden w-[260px] opacity-80 lg:block" />
            <TopBar user={user} />
            <main className="relative z-10 flex flex-1 flex-col pb-24 md:pb-0 print:pb-0">
              <DataGate>{children}</DataGate>
            </main>
            <MobileNav />
            <IsiPantasPill />
            <IsiPantasSheet />
          </SidebarInset>
        </SidebarProvider>
      </IsiPantasProvider>
    </KelabDataProvider>
  );
}

/**
 * The page is prerendered expanded, so a collapsed choice (shadcn's sidebar_state cookie) is
 * applied after hydration. The boot script marks <html data-sidebar-boot="collapsed"> before
 * paint and globals.css draws the rail at collapsed width until this hands over to React state.
 */
function RestoreCollapsedSidebar() {
  const { setOpen, state } = useSidebar();
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (document.documentElement.dataset.sidebarBoot === "collapsed") setOpen(false);
  }, [setOpen]);
  useEffect(() => {
    if (state === "collapsed") delete document.documentElement.dataset.sidebarBoot;
  }, [state]);
  return null;
}

function TopBar({ user }: { user?: ShellUser }) {
  const t = useT();
  const { demo, data } = useKelab();
  const { isMobile, state } = useSidebar();
  const treasurer = user?.name ?? data?.club.treasurerName ?? t("shell.treasurer");
  const signOut = async () => {
    if (user) await authClient.signOut().catch(() => undefined);
    leaveDemo();
    window.location.assign("/masuk/");
  };
  const toggleLabel = isMobile ? t("shell.openMenu") : state === "collapsed" ? t("shell.expandSidebar") : t("shell.collapseSidebar");
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl md:rounded-t-2xl md:px-6 print:hidden">
      <SidebarTrigger className="-ml-1 size-9 rounded-xl [&_svg]:size-[18px]" aria-label={toggleLabel} title={isMobile ? undefined : `${toggleLabel} (Ctrl/⌘ B)`} />
      <Separator orientation="vertical" className="hidden data-vertical:h-5 data-vertical:self-center md:block" />
      <GlobalSearch className="hidden sm:block" />
      <div className="sm:hidden">
        <span className="font-display text-[17px] font-bold">KelabKit</span>
      </div>
      {demo && (
        <span className="hidden shrink-0 rounded-full border border-dashed border-primary/50 bg-card px-2.5 py-0.5 text-[11px] font-medium text-primary-strong lg:inline-flex">
          {t("shell.demoData")}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <IsiPantasButton />
        <LanguagePill placement="topbar" className="hidden md:flex" />
        <PendingBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-auto gap-2.5 rounded-xl px-1.5 py-1 font-normal hover:bg-primary-tint aria-expanded:bg-primary-tint">
              <Avatar className="size-9 border-2 border-primary-light">
                {user?.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
                <AvatarFallback className="bg-primary-light text-xs font-semibold text-primary-strong">{initials(treasurer)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-[13px] font-semibold">{treasurer}</span>
                <span className="block text-[11px] text-muted-foreground">{t("shell.treasurer")}</span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block text-sm">{treasurer}</span>
              {user && <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>}
              <span className="block text-xs font-normal text-muted-foreground">{data?.club.name}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/tetapan/">
                <Settings /> {t("shell.settingsAndTheme")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut /> {user ? t("shell.signOut") : t("shell.leaveDemo")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** Payments recorded but not yet confirmed: the treasurer's only real notification. */
function PendingBell() {
  const t = useT();
  const { data } = useKelab();
  const pending = (data?.payments ?? []).filter((payment) => payment.state === "pending");
  const names = new Map(data?.members.map((member) => [member.id, member.name]));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label={t("shell.pendingBadge", { count: pending.length })}>
          <Bell className="size-5" />
          {pending.length > 0 && (
            <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary-fill text-[10px] font-semibold text-primary-foreground">
              {pending.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">{t("shell.bellTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("shell.bellHint")}</p>
        </div>
        {pending.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("shell.bellEmpty")}</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
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
  const t = useT();
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
      aria-label={t("shell.mainNav")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden print:hidden"
    >
      {item("/", t("shell.home"), House)}
      {item("/matriks/", t("nav.matrix"), Sheet)}
      <div className="flex flex-1 items-center justify-center">
        <Link
          href="/bayaran/baru/"
          aria-label={t("shell.recordPayment")}
          className="brand-gradient -mt-6 grid size-14 place-items-center rounded-2xl text-white shadow-[0_12px_24px_-10px_var(--primary)]"
        >
          <Plus className="size-6" />
        </Link>
      </div>
      {item("/ahli/", t("nav.members"), UsersRound)}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
      >
        <Menu className="size-5" />
        {t("shell.menu")}
      </button>
    </nav>
  );
}

/** Waits for the first load so screens never render half-empty totals. */
function DataGate({ children }: { children: ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const { loading, error, refresh } = useKelab();
  if (error && loading)
    return (
      <div className="grid flex-1 place-items-center p-6">
        <div className="max-w-md text-center">
          <TriangleAlert className="mx-auto mb-3 size-6 text-destructive" />
          <h1 className="text-lg font-semibold">{t("shell.loadFailed")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <Button variant="brand" className="mt-4" onClick={() => void refresh()}>
            {t("common.retry")}
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
  // Keyed by locale: screens that have not been moved onto useT() still read the current locale at
  // render time, so re-mounting the page is what makes them follow a language switch. Data stays loaded.
  return (
    <div key={locale} className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
