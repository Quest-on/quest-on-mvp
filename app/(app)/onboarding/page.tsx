"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CenteredViewportShell } from "@/components/layout/CenteredViewportShell";
import { User, Hash, GraduationCap, Loader2, ArrowLeft } from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";

interface University {
  name: string;
  type: string;
  category: string;
  branch: string;
  address: string;
  fullName: string;
}

export default function OnboardingPage() {
  const t = useTranslations("onboarding.page");
  const { user, isLoaded } = useAppUser();
  const router = useRouter();

  // Step: "role" | "profile"
  const [step, setStep] = useState<"role" | "profile">("role");
  const [role, setRole] = useState<"instructor" | "student">("student");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Profile fields (shared)
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
  const [schoolSuggestions, setSchoolSuggestions] = useState<University[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Student-only fields
  const [studentNumber, setStudentNumber] = useState("");

  // Get role from localStorage if available
  useEffect(() => {
    const savedRole = localStorage.getItem("selectedRole");
    if (savedRole && (savedRole === "instructor" || savedRole === "student")) {
      setRole(savedRole as "instructor" | "student");
    }
  }, []);

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

  // University search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (schoolSearchQuery.trim().length === 0) {
      setSchoolSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/universities/search?q=${encodeURIComponent(schoolSearchQuery)}`
        );
        if (response.ok) {
          const data = await response.json();
          setSchoolSuggestions(data.universities || []);
        }
      } catch {
        // Ignore search errors
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [schoolSearchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setSchoolSuggestions([]);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSchoolSelect = (university: University) => {
    setSchool(university.fullName);
    setSchoolSearchQuery(university.fullName);
    setSchoolSuggestions([]);
  };

  const handleRoleConfirm = () => {
    setShowConfirm(false);
    setStep("profile");
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!school.trim()) {
      setError(t("schoolRequired"));
      return;
    }
    if (role === "student" && !studentNumber.trim()) {
      setError(t("studentNumberRequired"));
      return;
    }

    if (!user) return;
    setIsSubmitting(true);

    try {
      // profiles 테이블에 모든 정보 한 번에 업데이트
      const profileRes = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          status: role === "instructor" ? "pending" : "approved",
          display_name: name.trim(),
          school: school.trim(),
          ...(role === "student" ? { student_id: studentNumber.trim() } : {}),
        }),
      });
      if (!profileRes.ok) throw new Error("Profile update failed");

      // role별 추가 프로필 테이블에도 저장 (기존 API들이 여기서 읽음)
      if (role === "student") {
        await fetch("/api/student/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            student_number: studentNumber.trim(),
            school: school.trim(),
          }),
        });
      } else {
        await fetch("/api/instructor/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: user.email,
            school: school.trim(),
          }),
        });
      }

      // Clear localStorage
      localStorage.removeItem("selectedRole");

      // 4. Redirect
      const params = new URLSearchParams(window.location.search);
      const redirectUrl =
        params.get("redirect") || localStorage.getItem("onboarding_redirect");
      localStorage.removeItem("onboarding_redirect");

      if (redirectUrl && redirectUrl.startsWith("/")) {
        window.location.href = redirectUrl;
      } else if (role === "instructor") {
        window.location.href = "/instructor-pending";
      } else {
        sessionStorage.setItem("profile-setup-complete", "true");
        window.location.href = "/student";
      }
    } catch {
      setError(t("saveFailed"));
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <CenteredViewportShell
      className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900"
      contentClassName="max-w-md"
    >
      {step === "role" ? (
        /* ── Step 1: Role Selection ── */
        <Card className="w-full shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl">
              {t("welcomeTitle")}
            </CardTitle>
            <CardDescription className="text-base">
              {t("welcomeDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={role}
              onValueChange={(value) =>
                setRole(value as "instructor" | "student")
              }
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="instructor" id="instructor" />
                <Label
                  htmlFor="instructor"
                  className="text-base cursor-pointer flex-1"
                >
                  {t("instructorRole")}
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="student" id="student" />
                <Label
                  htmlFor="student"
                  className="text-base cursor-pointer flex-1"
                >
                  {t("studentRole")}
                </Label>
              </div>
            </RadioGroup>

            <Button
              onClick={() => setShowConfirm(true)}
              className="w-full h-12 text-lg"
            >
              {t("continueBtn")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* ── Step 2: Profile Info ── */
        <Card className="w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
              <User className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">{t("profileTitle")}</CardTitle>
            <CardDescription className="text-base">
              {role === "student"
                ? t("profileDescStudent")
                : t("profileDescInstructor")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              {/* 이름 */}
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t("nameLabel")}
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {/* 학번 (학생만) */}
              {role === "student" && (
                <div className="space-y-2">
                  <Label
                    htmlFor="studentNumber"
                    className="flex items-center gap-2"
                  >
                    <Hash className="w-4 h-4" />
                    {t("studentNumberLabel")}
                  </Label>
                  <Input
                    id="studentNumber"
                    type="text"
                    placeholder={t("studentNumberPlaceholder")}
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* 학교 (공통) */}
              <div className="space-y-2">
                <Label htmlFor="school" className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  {role === "student" ? t("schoolLabelStudent") : t("schoolLabelInstructor")}
                </Label>
                <div className="relative">
                  <Input
                    ref={inputRef}
                    id="school"
                    type="text"
                    placeholder={
                      role === "student"
                        ? t("schoolPlaceholderStudent")
                        : t("schoolPlaceholderInstructor")
                    }
                    value={schoolSearchQuery}
                    onChange={(e) => {
                      setSchoolSearchQuery(e.target.value);
                      if (e.target.value !== school) {
                        setSchool("");
                      }
                    }}
                    required
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {schoolSuggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
                    >
                      {schoolSuggestions.map((uni, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleSchoolSelect(uni)}
                          className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground transition-colors border-b last:border-b-0"
                        >
                          <div className="font-medium">{uni.fullName}</div>
                          <div className="text-sm text-muted-foreground">
                            {uni.type} · {uni.category}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {school && (
                  <p className="text-sm text-muted-foreground">
                    {t("selectedSchool", { school })}
                  </p>
                )}
              </div>

              {error && <ErrorAlert message={error} />}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("role")}
                  disabled={isSubmitting}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  {t("backBtn")}
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={
                    isSubmitting ||
                    !name ||
                    !school ||
                    (role === "student" && !studentNumber)
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("saving")}
                    </>
                  ) : (
                    t("submitBtn")
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Role Confirm Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDescSuffix", {
                role: role === "instructor"
                  ? t("confirmDescInstructor")
                  : t("confirmDescStudent"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("reSelectBtn")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleConfirm}>
              {t("confirmBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CenteredViewportShell>
  );
}
