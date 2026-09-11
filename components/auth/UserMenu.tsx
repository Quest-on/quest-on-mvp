"use client";

import { useRouter } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { createSupabaseClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, User, Settings } from "lucide-react";
import Link from "next/link";
import { ThemeTogglerButton } from "@/components/animate-ui/components/buttons/theme-toggler";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslations } from "next-intl";

export function UserMenu() {
  const t = useTranslations("auth.userMenu");
  const { user, profile, isLoaded } = useAppUser();
  const router = useRouter();

  if (!isLoaded || !user) {
    return null;
  }

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

  const getUserInitials = () => {
    if (profile?.fullName) {
      const parts = profile.fullName.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
      return parts[0][0].toUpperCase();
    }
    if (user?.email) return user.email[0].toUpperCase();
    return "U";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={profile?.avatarUrl ?? undefined}
              alt={profile?.fullName || "User"}
            />
            <AvatarFallback>{getUserInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {profile?.fullName || "User"}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center">
            <User className="mr-2 h-4 w-4" />
            {t("profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center">
            <Settings className="mr-2 h-4 w-4" />
            {t("settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between w-full cursor-default">
            <span className="text-sm">{t("theme")}</span>
            <ThemeTogglerButton modes={["light", "dark"]} variant="outline" size="sm" />
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between w-full cursor-default">
            <span className="text-sm">Language</span>
            <LanguageSwitcher variant="inline" />
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="flex items-center text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
