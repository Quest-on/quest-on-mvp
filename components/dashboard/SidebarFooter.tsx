"use client";

import { useAppUser } from "@/components/providers/AppAuthProvider";
import { createSupabaseClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Settings, User, ChevronDown, BadgeCheck } from "lucide-react";
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
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslations } from "next-intl";
import { supportMailto } from "@/lib/contact";

export function SidebarFooter() {
  const { user, profile } = useAppUser();
  const router = useRouter();
  const { state } = useSidebar();
  const t = useTranslations("instructor");
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

  /**
   * 교수자 인증 상태 (이슈 #395).
   *
   * 여기가 계정 상태를 말하는 유일한 상시 표면이다. 예전에는 free 와 인증
   * 계정의 화면이 완전히 같아서, 교수자는 한도에 부딪히는 순간에야 자기가
   * 제약 상태였다는 걸 알았다 — 그 순간은 코드를 이미 배포한 뒤다.
   *
   * 글자를 늘리지 않는다. 인증 계정은 이름 옆 아이콘 하나로 끝내고, 인증
   * 전 계정에는 낙인이 될 표식을 달지 않는 대신 메뉴에 신청 경로를 연다.
   * 한도 숫자는 여기 두지 않는다 — 그건 코드를 건네는 자리(ExamCode)의 몫이다.
   */
  const isInstructor = userRole === "instructor";
  const isVerified = isInstructor && profile?.plan === "verified";
  const needsVerification = isInstructor && !isVerified;

  const verifiedMark = isVerified ? (
    <BadgeCheck
      className="h-4 w-4 shrink-0 text-primary"
      aria-label={t("footer.verified")}
    />
  ) : null;
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
          <p className="flex items-center gap-1 text-sm font-medium leading-none">
            <span className="truncate">{displayName}</span>
            {verifiedMark}
          </p>
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
        {t("footer.profile")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => router.push("/settings")}
        className="cursor-pointer"
      >
        <Settings className="mr-2 h-4 w-4" />
        {t("footer.settings")}
      </DropdownMenuItem>
      {/* 막혔을 때 나갈 길은 막힌 자리에도 있지만(ExamCode), 그 전에 스스로
          찾아 나설 수 있어야 한다. 인증을 마친 계정에는 띄우지 않는다 —
          아무 행동도 유도하지 않는 항목은 메뉴만 길게 만든다. */}
      {needsVerification && (
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href={supportMailto(t("footer.verificationMailSubject"))}>
            <BadgeCheck className="mr-2 h-4 w-4" />
            {t("footer.verification")}
          </a>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <div className="flex items-center justify-between px-2 py-1.5 text-sm">
        <span className="text-foreground/80">{t("footer.theme")}</span>
        <ThemeTogglerButton modes={["light", "dark"]} variant="outline" size="sm" />
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 text-sm">
        <span className="text-foreground/80">{t("footer.language")}</span>
        <LanguageSwitcher variant="inline" />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={handleSignOut}
        className="cursor-pointer text-destructive focus:text-destructive"
      >
        <LogOut className="mr-2 h-4 w-4" />
        {t("footer.signOut")}
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
                aria-label={t("sidebar.profileMenu")}
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
                <p className="flex items-center gap-1 text-sm font-medium text-sidebar-foreground">
                  <span className="truncate">{displayName}</span>
                  {verifiedMark}
                </p>
                <p className="text-xs text-sidebar-foreground/75 truncate">
                  {userRole === "instructor" ? t("footer.roleInstructor") : t("footer.roleStudent")}
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
