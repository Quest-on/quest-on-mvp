"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  SidebarContent as ShadcnSidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarFooter } from "@/components/dashboard/SidebarFooter";
import { SidebarFolderTree } from "@/components/instructor/SidebarFolderTree";
import { AlertTriangle, ChevronLeft, ChevronRight, CircleAlert, type LucideIcon } from "lucide-react";
import { type ComponentType } from "react";
import { useTranslations } from "next-intl";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  active: boolean;
}

export interface SidebarTodoItem {
  id: string;
  title: string;
  examCode: string;
  href: string;
  deadline: string | null;
}

interface DashboardSidebarProps {
  homeHref: string;
  navItems: NavItem[];
  todoItems?: SidebarTodoItem[];
  onItemClick?: () => void;
  userId?: string;
}

export function DashboardSidebar({
  homeHref,
  navItems,
  todoItems,
  onItemClick,
  userId,
}: DashboardSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const t = useTranslations("instructor");
  const isCollapsed = state === "collapsed";
  const hasTodoSection = Array.isArray(todoItems);
  const safeTodoItems = todoItems || [];

  const getTodoStyle = (deadline: string | null) => {
    if (!deadline) {
      return {
        rowClass: "text-sidebar-foreground/80",
        badgeClass: "text-info-text bg-primary/10 border-primary/30",
        label: t("sidebar.noDueDate"),
        icon: CircleAlert,
      };
    }

    const diffMs = new Date(deadline).getTime() - Date.now();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysLeft <= 1) {
      return {
        rowClass: "text-destructive",
        badgeClass: "text-destructive bg-destructive/10/10 border-danger-border/30",
        label: daysLeft <= 0 ? "D-DAY" : `D-${daysLeft}`,
        icon: AlertTriangle,
      };
    }
    if (daysLeft <= 3) {
      return {
        rowClass: "text-warning-text",
        badgeClass: "text-warning-text bg-warning-surface/10 border-warning-border/30",
        label: `D-${daysLeft}`,
        icon: CircleAlert,
      };
    }
    return {
      rowClass: "text-info-text",
      badgeClass: "text-info-text bg-primary/10 border-primary/30",
      label: `D-${daysLeft}`,
      icon: CircleAlert,
    };
  };

  return (
    <>
      <SidebarHeader className="p-4 relative">
        <div className="flex items-center gap-2 overflow-hidden">
          <Link href={homeHref} className="flex items-center gap-2 min-w-0">
            <Image
              src="/qstn_logo_svg.svg"
              alt="Quest-On Logo"
              width={32}
              height={32}
              className="w-8 h-8 shrink-0"
              priority
            />
            <span className="text-lg font-bold text-sidebar-foreground whitespace-nowrap transition-all duration-200 group-data-[collapsible=icon]:hidden">
              Quest-On
            </span>
          </Link>
        </div>
        {/* Chevron toggle pinned to sidebar edge */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-sidebar-border bg-sidebar shadow-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          aria-label={isCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </SidebarHeader>

      <ShadcnSidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>MAIN</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="group-data-[collapsible=icon]:items-center">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.active}
                    tooltip={item.title}
                  >
                    <Link href={item.href} onClick={onItemClick}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {hasTodoSection && (
          <SidebarGroup>
            <SidebarGroupLabel>TODO</SidebarGroupLabel>
            <SidebarGroupContent>
              {safeTodoItems.length === 0 ? (
                <div className="px-2 py-2 text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
                  {t("sidebar.noTodo")}
                </div>
              ) : (
                <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                  {safeTodoItems.map((item) => {
                    const style = getTodoStyle(item.deadline);
                    const DeadlineIcon = style.icon;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton asChild tooltip={item.title}>
                          <Link href={item.href} onClick={onItemClick}>
                            <DeadlineIcon className={cn("w-4 h-4", style.rowClass)} />
                            <span className="flex-1 min-w-0 truncate">{item.title}</span>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded border shrink-0 group-data-[collapsible=icon]:hidden",
                                style.badgeClass
                              )}
                            >
                              {style.label}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {userId && <SidebarFolderTree userId={userId} />}
      </ShadcnSidebarContent>

      <SidebarFooter />
    </>
  );
}
