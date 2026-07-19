"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Mail,
  Calendar,
  Shield,
  GraduationCap,
  Hash,
  Palette,
} from "lucide-react";
import { ThemeTogglerButton } from "@/components/animate-ui/components/buttons/theme-toggler";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

interface StudentProfile {
  id: string;
  student_id: string;
  name: string;
  student_number: string;
  school: string;
  created_at: string;
  updated_at: string;
}

export default function ProfilePage() {
  const t = useTranslations("auth.profile");
  const locale = useLocale() as Locale;
  const { user, profile, isLoaded } = useAppUser();
  const router = useRouter();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(
    null
  );
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

  // Load student profile if user is a student
  useEffect(() => {
    const loadStudentProfile = async () => {
      if (isLoaded && user) {
        const userRole = (profile?.role as string) || "student";
        if (userRole === "student") {
          setIsLoadingProfile(true);
          try {
            const response = await fetch("/api/student/profile");
            if (response.ok) {
              const data = await response.json();
              if (data.profile) {
                setStudentProfile(data.profile);
              }
            }
          } catch {
            // Profile loading error handled silently
          } finally {
            setIsLoadingProfile(false);
          }
        }
      }
    };

    loadStudentProfile();
  }, [isLoaded, user]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const userRole = (profile?.role as string) || "student";
  const roleLabel =
    userRole === "instructor"
      ? t("roleInstructor")
      : userRole === "admin"
      ? t("roleAdmin")
      : t("roleStudent");

  const getUserInitials = () => {
    if (profile?.fullName) {
      return profile.fullName[0].toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t("heading")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t("profileInfoTitle")}</CardTitle>
              <CardDescription>{t("profileInfoDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage
                    src={profile?.avatarUrl ?? undefined}
                    alt={profile?.fullName || t("avatarAlt")}
                  />
                  <AvatarFallback className="text-2xl">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">
                    {profile?.fullName || t("noName")}
                  </h2>
                  <div className="flex items-center space-x-2 mt-2">
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/20"
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      {roleLabel}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("emailLabel")}</p>
                    <p className="font-medium">
                      {user?.email || t("noEmail")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("joinedLabel")}</p>
                    <p className="font-medium">
                      {user.created_at
                        ? formatDate(user.created_at, locale)
                        : t("noDate")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Student Profile Information */}
              {userRole === "student" && (
                <div className="pt-4 border-t">
                  <h3 className="text-lg font-semibold mb-4">{t("studentInfoTitle")}</h3>
                  {isLoadingProfile ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                    </div>
                  ) : studentProfile ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t("nameLabel")}</p>
                          <p className="font-medium">
                            {studentProfile.name || t("notEntered")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <Hash className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t("studentNumberLabel")}</p>
                          <p className="font-medium">
                            {studentProfile.student_number || t("notEntered")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 md:col-span-2">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <GraduationCap className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t("schoolLabel")}</p>
                          <p className="font-medium">
                            {studentProfile.school || t("notEntered")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-4">
                        {t("noProfileInfo")}
                      </p>
                      <Button
                        onClick={() => router.push("/student/profile-setup")}
                        variant="outline"
                      >
                        {t("setupProfileBtn")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Details */}
          <Card>
            <CardHeader>
              <CardTitle>{t("accountDetailsTitle")}</CardTitle>
              <CardDescription>{t("accountDetailsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t("userIdLabel")}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {user.id}
                    </p>
                  </div>
                </div>
              </div>

              {profile?.fullName && (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{t("fullNameLabel")}</p>
                      <p className="text-sm text-muted-foreground">
                        {profile.fullName}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t("roleLabel")}</p>
                    <p className="text-sm text-muted-foreground">{roleLabel}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Theme Settings */}
          <Card>
            <CardHeader>
              <CardTitle>{t("themeTitle")}</CardTitle>
              <CardDescription>{t("themeDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <Palette className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{t("themeModeLabel")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("themeModeSubtitle")}
                    </p>
                  </div>
                </div>
                <ThemeTogglerButton
                  modes={["light", "dark"]}
                  variant="outline"
                  size="default"
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end space-x-4">
            <Button variant="outline" onClick={() => router.back()}>
              {t("backBtn")}
            </Button>
            {userRole === "instructor" && (
              <Button onClick={() => router.push("/instructor")}>
                {t("instructorDashboardBtn")}
              </Button>
            )}
            {userRole === "student" && (
              <Button onClick={() => router.push("/student")}>
                {t("studentDashboardBtn")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
