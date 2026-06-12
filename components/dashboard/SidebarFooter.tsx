"use client";

import { useAppUser } from "@/components/providers/AppAuthProvider";
import { createSupabaseClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Settings, User, ChevronDown } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeTogglerButton } from "@/components/animate-ui/components/buttons/theme-toggler";

export function SidebarFooter() {
  const { user, profile } = useAppUser();
  const router = useRouter();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleSignOut = async () => {
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } catch {
      // Sign-out error handled silently
    }
  };

  const displayName = profile?.fullName || "User";
  const userRole = profile?.role || "student";
  const avatarInitial =
    profile?.fullName?.[0]?.toUpperCase() ||
    profile?.email?.[0]?.toUpperCase() ||
    "U";

  const avatarElement = (
    <Avatar className="h-9 w-9 shrink-0">
      <AvatarImage src={profile?.avatarUrl ?? undefined} alt={displayName} />
      <AvatarFallback className="bg-primary text-primary-foreground">
        {avatarInitial}
      </AvatarFallback>
    </Avatar>
  );

  const dropdownContent = (
    <DropdownMenuContent
      side={isCollapsed ? "right" : "top"}
      align={isCollapsed ? "end" : "start"}
      className="w-56"
      sideOffset={8}
    >
      <DropdownMenuLabel className="font-normal">
        <div className="flex flex-col space-y-1">
          <p className="text-sm font-medium leading-none">{displayName}</p>
          <p className="text-xs leading-none text-muted-foreground">
            {profile?.email}
          </p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => router.push("/profile")}
        className="cursor-pointer"
      >
        <User className="mr-2 h-4 w-4" />
        프로필
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => router.push("/settings")}
        className="cursor-pointer"
      >
        <Settings className="mr-2 h-4 w-4" />
        설정
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <div className="flex items-center justify-between px-2 py-1.5 text-sm">
        <span className="text-foreground/80">테마</span>
        <ThemeTogglerButton modes={["light", "dark"]} variant="outline" size="sm" />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={handleSignOut}
        className="cursor-pointer text-destructive focus:text-destructive"
      >
        <LogOut className="mr-2 h-4 w-4" />
        로그아웃
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <div className="p-3 mt-auto">
      {isCollapsed ? (
        <div className="flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar"
                aria-label="프로필 메뉴"
              >
                {avatarElement}
              </button>
            </DropdownMenuTrigger>
            {dropdownContent}
          </DropdownMenu>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-sidebar-foreground/[0.08] hover:bg-sidebar-foreground/[0.12] transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar">
              {avatarElement}
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate text-sidebar-foreground">
                  {displayName}
                </p>
                <p className="text-xs text-sidebar-foreground/75 truncate">
                  {userRole === "instructor" ? "강사" : "학생"}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-sidebar-foreground/75 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          {dropdownContent}
        </DropdownMenu>
      )}
    </div>
  );
}
