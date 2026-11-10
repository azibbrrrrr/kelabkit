"use client";

import { Brand, BrandMark } from "@/components/brand";
import { useKelab } from "@/components/data-provider";
import { LanguagePill } from "@/components/language-pill";
import { Floral } from "@/components/floral";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/react";
import { isActive, navItems } from "@/lib/nav";
import { ChevronsUpDown, School } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppSidebar() {
  const t = useT();
  const pathname = usePathname();
  const { setOpenMobile, state, isMobile } = useSidebar();
  const { data } = useKelab();
  const pendingCount = data?.payments.filter((payment) => payment.state === "pending").length ?? 0;
  const close = () => setOpenMobile(false);
  const clubName = data?.club.name ?? t("shell.clubFallback");
  const session = data?.club.session ?? "—";
  const railLabel = state === "collapsed" ? t("shell.expandSidebar") : t("shell.collapseSidebar");

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-16 justify-center px-3 group-data-[collapsible=icon]:px-2.5">
        <div className="group-data-[collapsible=icon]:hidden">
          <Brand />
        </div>
        <Link
          href="/"
          aria-label={t("shell.homeLink")}
          className="hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar group-data-[collapsible=icon]:grid"
        >
          <BrandMark />
        </Link>
      </SidebarHeader>
      <SidebarContent className="relative px-1 pt-3 group-data-[collapsible=icon]:px-2.5">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {navItems.map((item) => {
                const active = isActive(pathname, item.href);
                const count = item.href === "/bayaran/" ? pendingCount : 0;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={count > 0 ? t("shell.pendingTooltip", { title: item.title, count }) : item.title}
                      className="h-11 gap-3 rounded-xl px-4 group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:p-[9px]! text-[14px] font-medium text-sidebar-foreground data-active:brand-gradient data-active:font-semibold data-active:text-white data-active:shadow-[0_10px_20px_-12px_var(--primary)] [&_svg]:size-[18px]"
                    >
                      <Link href={item.href} onClick={close}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {count > 0 && (
                      <SidebarMenuBadge
                        className="top-3 right-2 rounded-full bg-st-pending-bg text-st-pending peer-data-active/menu-button:bg-white peer-data-active/menu-button:text-primary-strong group-data-[collapsible=icon]:-top-1 group-data-[collapsible=icon]:-right-1 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:min-w-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:text-[10px] group-data-[collapsible=icon]:ring-2 group-data-[collapsible=icon]:ring-sidebar"
                        aria-label={t("shell.pendingBadge", { count })}
                      >
                        {count}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="min-h-40 flex-1" />
        <Floral asset="sidebar-sprig" className="bottom-0 -left-6 w-[230px] opacity-90 group-data-[collapsible=icon]:hidden" />
      </SidebarContent>
      <SidebarFooter className="relative z-10 px-1 pb-2 group-data-[collapsible=icon]:px-2.5">
        {isMobile && <LanguagePill placement="menu" className="mx-auto" />}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/tetapan/"
              onClick={close}
              className="flex items-center gap-3 rounded-2xl border border-sidebar-border bg-card/90 px-3 py-2.5 backdrop-blur transition-colors hover:bg-primary-tint group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-light text-primary-strong">
                <School className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:sr-only">
                <span className="block truncate text-[13px] font-semibold">{clubName}</span>
                <span className="block text-xs text-muted-foreground">{t("shell.session", { session })}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile}>
            {clubName} · {t("shell.session", { session })}
          </TooltipContent>
        </Tooltip>
      </SidebarFooter>
      <SidebarRail aria-label={railLabel} title={railLabel} />
    </Sidebar>
  );
}
