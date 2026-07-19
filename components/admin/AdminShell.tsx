"use client";

import type { ReactNode, CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent as SidebarPanelContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { AdminSidebarFooter } from "@/components/admin/AdminSidebarFooter";
import { ADMIN_NAVIGATION_ITEMS } from "@/lib/admin-navigation";

interface AdminShellProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}

const SIDEBAR_STYLE = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "4rem",
} as CSSProperties;

function AdminSidebarLinks({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <>
      <SidebarHeader className="border-b border-sidebar-border p-4 sm:p-5">
        <Link
          href="/admin"
          className={cn(
            "flex items-center",
            isCollapsed ? "justify-center" : "justify-start"
          )}
        >
          <Image
            src="/qstn_logo_svg.svg"
            alt="Quest-On Logo"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0"
            priority
          />
          {!isCollapsed && (
            <span className="ml-2 text-xl font-bold text-sidebar-foreground">
              Quest-On
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarPanelContent>
        <nav
          className="flex-1 space-y-1 overflow-y-auto p-3 sm:p-4"
          aria-label={t("shell.mainNav")}
        >
          {ADMIN_NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/admin"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group-data-[collapsible=icon]:justify-center flex min-h-[44px] items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-sidebar",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
                title={isCollapsed ? t(item.titleKey) : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!isCollapsed && <span>{t(item.titleKey)}</span>}
              </Link>
            );
          })}
        </nav>
      </SidebarPanelContent>

      <AdminSidebarFooter />
    </>
  );
}

export function AdminShell({ title, icon: HeaderIcon, children }: AdminShellProps) {
  const t = useTranslations("admin");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SidebarProvider defaultOpen={true} style={SIDEBAR_STYLE}>
      <Sidebar
        side="left"
        variant="sidebar"
        collapsible="icon"
        className="border-r border-sidebar-border"
      >
        <AdminSidebarLinks />
      </Sidebar>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("shell.menuTitle")}</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col bg-sidebar">
            <SidebarProvider defaultOpen={true}>
              <AdminSidebarLinks onNavigate={() => setSidebarOpen(false)} />
            </SidebarProvider>
          </div>
        </SheetContent>
      </Sheet>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <HeaderIcon className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
