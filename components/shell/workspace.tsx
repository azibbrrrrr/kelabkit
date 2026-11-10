"use client";

import { KelabDataProvider, useKelab } from "@/components/data-provider";
import { Floral } from "@/components/floral";
import { IsiPantasProvider } from "@/components/isi-pantas/provider";
import { IsiPantasButton, IsiPantasPill, IsiPantasSheet } from "@/components/isi-pantas/sheet";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { GlobalSearch } from "@/components/shell/global-search";
import { RouteSkeleton } from "@/components/skeletons/pages";
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
import { authClient } from "@/lib/auth/client";
import { leaveDemo } from "@/lib/auth/mode";
import { formatDay, formatMoney, initials } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/react";
import { hasOwnActionBar, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Bell, ChevronDown, House, LogOut, Menu, Plus, Settings, Sheet, TriangleAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type ShellUser = { name: string; email: string; image: string | null };

/** `user` is the signed-in Google account; absent in demo mode. */
export function Workspace({ user, children }: { user?: ShellUser; children: ReactNode }) {
  return (
    <KelabDataProvider mode={user ? "neon" : "demo"}>
      <SkipLink />
      <IsiPantasProvider>
        <SidebarProvider style={{ "--sidebar-width-icon": "3.5rem" } as CSSProperties}>
          <RestoreCollapsedSidebar />
          <AppSidebar />
          <SidebarInset className="page-glow relative min-w-0 overflow-x-clip md:peer-data-[variant=inset]:overflow-clip md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border/70 md:peer-data-[variant=inset]:shadow-[0_1px_2px_color-mix(in_srgb,var(--foreground)_4%,transparent),0_8px_24px_-16px_color-mix(in_srgb,var(--primary)_22%,transparent)] print:m-0! print:rounded-none! print:border-0! print:shadow-none!">
            <Floral asset="corner-top-right" className="top-0 right-0 z-0 hidden w-[260px] opacity-80 lg:block" />
            <TopBar user={user} />
            <main id="main-content" tabIndex={-1} className="relative z-10 flex flex-1 flex-col pb-24 outline-none md:pb-0 print:pb-0">
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

/** First focusable element: keyboard users jump past the sidebar and top bar to the page. */
function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main-content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[100] focus-visible:rounded-xl focus-visible:bg-card focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-primary-strong focus-visible:shadow-lg focus-visible:ring-2 focus-visible:ring-ring print:hidden"
    >
      {t("shell.skipToContent")}
    </a>
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

/** "Menyimpan…" while a change is on its way, "Disimpan" for a moment after. Fixed width: never moves the bar. */
function SaveStatus() {
  const t = useT();
  const { saving } = useKelab();
  const [saved, setSaved] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    if (saving) {
      was.current = true;
      setSaved(false);
      return;
    }
    if (!was.current) return;
    was.current = false;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saving]);
  return (
    <span role="status" aria-live="polite" className="hidden min-w-[5.5rem] text-right text-xs text-muted-foreground md:inline-block">
      {saving ? t("common.saving") : saved ? t("common.saved") : ""}
    </span>
  );
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
      <SidebarTrigger className="-ml-1 size-9 rounded-xl pointer-coarse:size-11 [&_svg]:size-[18px]" aria-label={toggleLabel} title={isMobile ? undefined : `${toggleLabel} (Ctrl/⌘ B)`} />
      <Separator orientation="vertical" className="hidden data-vertical:h-5 data-vertical:self-center md:block" />
      <GlobalSearch className="hidden sm:block" />
      <div className="sm:hidden">
        <span className="font-display text-h2">KelabKit</span>
      </div>
      {demo && (
        <span className="hidden shrink-0 rounded-full border border-dashed border-primary/50 bg-card px-2.5 py-0.5 text-caption font-medium text-primary-strong xl:inline-flex">
          {t("shell.demoData")}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SaveStatus />
        <IsiPantasButton />
        <LanguagePill placement="topbar" className="hidden md:flex" />
        <PendingBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label={treasurer} className="h-auto gap-2.5 rounded-xl px-1.5 py-1 font-normal hover:bg-primary-tint aria-expanded:bg-primary-tint">
              <Avatar className="size-9 border-2 border-primary-light">
                {user?.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
                <AvatarFallback className="bg-primary-light text-xs font-semibold text-primary-strong">{initials(treasurer)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-small font-semibold">{treasurer}</span>
                <span className="block text-caption text-muted-foreground">{t("shell.treasurer")}</span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground xl:block" />
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
        <Button variant="ghost" size="icon" className="relative rounded-xl pointer-coarse:size-11" aria-label={t("shell.pendingBadge", { count: pending.length })}>
          <Bell className="size-5" />
          {pending.length > 0 && (
            <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary-fill text-caption font-semibold text-primary-foreground">
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
  // The wizard and the payment form have their own fixed bar just above this nav: no raised button there.
  const ownBar = hasOwnActionBar(pathname);
  const item = (href: string, label: string, Icon: typeof House) => {
    const active = isActive(pathname, href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-caption font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          // Not colour alone: a bold label and a bar above the icon mark the current page.
          active && "font-bold text-primary-strong after:absolute after:top-0 after:h-0.5 after:w-8 after:rounded-full after:bg-primary-fill",
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    );
  };
  return (
    <nav
      aria-label={t("shell.mainNav")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden print:hidden"
    >
      {item("/", t("shell.home"), House)}
      {item("/matriks/", t("nav.matrix"), Sheet)}
      <div className="flex flex-1 items-center justify-center">
        {!ownBar && (
          <Link
            href="/bayaran/baru/"
            aria-label={t("shell.recordPayment")}
            className="brand-gradient -mt-6 grid size-14 place-items-center rounded-2xl text-white shadow-[0_12px_24px_-10px_var(--primary)]"
          >
            <Plus className="size-6" />
          </Link>
        )}
      </div>
      {item("/ahli/", t("nav.members"), UsersRound)}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-caption font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
          <h1 className="text-h1">{t("shell.loadFailed")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <Button variant="brand" className="mt-4" onClick={() => void refresh()}>
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  // Page-shaped skeleton, so the content that replaces it lands where it was.
  if (loading) return <RouteSkeleton />;
  // Keyed by locale: screens that have not been moved onto useT() still read the current locale at
  // render time, so re-mounting the page is what makes them follow a language switch. Data stays loaded.
  return (
    <div key={locale} className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
