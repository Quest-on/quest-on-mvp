"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function AdminSidebarFooter() {
  const t = useTranslations("admin");
  const router = useRouter();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth", { method: "DELETE" });
      router.push("/admin/login");
    } catch {
      // Logout error handled silently
    }
  };

  return (
    <div className="p-4 border-t border-sidebar-border">
      {isCollapsed ? (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleLogout}
            aria-label={t("sidebar.logoutAriaLabel")}
            title={t("sidebar.logoutAriaLabel")}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("sidebar.logout")}
        </Button>
      )}
    </div>
  );
}

