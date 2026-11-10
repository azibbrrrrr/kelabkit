"use client";

import { Brand } from "@/components/brand";
import { useKelab } from "@/components/data-provider";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { isActive, navItems } from "@/lib/nav";
import { ChevronsUpDown, School } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { data } = useKelab();
  const pendingCount = data?.payments.filter((payment) => payment.state === "pending").length ?? 0;
  const close = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
      <SidebarHeader className="h-16 justify-center px-5">
        <Brand />
      </SidebarHeader>
      <SidebarContent className="relative px-3 pt-3">
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
                      className="h-11 gap-3 rounded-xl px-4 text-[14px] font-medium text-sidebar-foreground data-active:brand-gradient data-active:font-semibold data-active:text-white data-active:shadow-[0_10px_20px_-12px_var(--primary)] [&_svg]:size-[18px]"
                    >
                      <Link href={item.href} onClick={close}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {count > 0 && (
                      <SidebarMenuBadge
                        className="top-3 right-2 rounded-full bg-st-pending-bg text-st-pending peer-data-active/menu-button:bg-white/25 peer-data-active/menu-button:text-white"
                        aria-label={`${count} bayaran menunggu semakan`}
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
        <Floral asset="sidebar-sprig" className="bottom-0 -left-6 w-[230px] opacity-90" />
      </SidebarContent>
      <SidebarFooter className="relative z-10 px-3 pb-4">
        <Link
          href="/tetapan/"
          onClick={close}
          className="flex items-center gap-3 rounded-2xl border border-sidebar-border bg-card/90 px-3 py-2.5 backdrop-blur transition-colors hover:bg-primary-tint"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary-light text-primary-strong">
            <School className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{data?.club.name ?? "Kelab KGK"}</span>
            <span className="block text-xs text-muted-foreground">Sesi {data?.club.session ?? "—"}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
