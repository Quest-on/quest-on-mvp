"use client";

import { usePathname } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/UserMenu";
import Link from "next/link";
import Image from "next/image";
import { GraduationCap, Users, FilePlus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function Header() {
  const { isSignedIn, isLoaded, profile } = useAppUser();
  const pathname = usePathname();
  const t = useTranslations("common");

  const userRole = profile?.role ?? "student";
  const hasRole = Boolean(profile?.role);

  const isLinkActive = (href: string) => {
    if (href === "/instructor") {
      return (
        pathname.startsWith("/instructor") &&
        !pathname.startsWith("/instructor/new")
      );
    } else if (href === "/student") {
      return pathname.startsWith("/student");
    } else if (href === "/join") {
      return pathname.startsWith("/join");
    }
    return pathname.startsWith(href);
  };

  const getLinkClassName = (isActive: boolean) => {
    return cn(
      "flex items-center gap-1.5 text-sm font-medium transition-colors px-2.5 py-1.5 rounded-md",
      isActive
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-accent"
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo + Separator + Navigation */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              <Image
                src="/qlogo_icon.png"
                alt={t("brand.logoAlt")}
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                {t("brand.name")}
              </span>
            </div>
          </Link>

          {/* Vertical Separator */}
          {isSignedIn && hasRole && (
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
          )}

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {isSignedIn && hasRole && userRole === "instructor" && (
              <>
                <Link
                  href="/instructor"
                  className={getLinkClassName(isLinkActive("/instructor"))}
                  aria-current={
                    isLinkActive("/instructor") ? "page" : undefined
                  }
                >
                  <Users className="h-4 w-4" />
                  <span>{t("nav.dashboard")}</span>
                </Link>
                <Link
                  href="/instructor/new"
                  className={getLinkClassName(isLinkActive("/instructor/new"))}
                  aria-current={
                    isLinkActive("/instructor/new") ? "page" : undefined
                  }
                >
                  <FilePlus className="h-4 w-4" />
                  <span>{t("nav.newExam")}</span>
                </Link>
              </>
            )}
            {isSignedIn && hasRole && userRole === "student" && (
              <>
                <Link
                  href="/student"
                  className={getLinkClassName(isLinkActive("/student"))}
                  aria-current={isLinkActive("/student") ? "page" : undefined}
                >
                  <GraduationCap className="h-4 w-4" />
                  <span>{t("nav.myExams")}</span>
                </Link>
                <Link
                  href="/join"
                  className={getLinkClassName(isLinkActive("/join"))}
                  aria-current={isLinkActive("/join") ? "page" : undefined}
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{t("nav.joinExam")}</span>
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Auth Section */}
        <div className="flex items-center space-x-4">
          {isLoaded && (
            <>
              {isSignedIn ? (
                <UserMenu />
              ) : (
                <div className="flex items-center space-x-2">
                  <Link href="/sign-in">
                    <Button variant="outline" size="sm">
                      {t("auth.signIn")}
                    </Button>
                  </Link>
                  <Link href="/sign-up">
                    <Button size="sm">{t("auth.signUp")}</Button>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
