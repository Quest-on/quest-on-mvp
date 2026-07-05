"use client";

import { useState, useEffect, useRef } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, GraduationCap, Hash, Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";
import { CenteredViewportShell } from "@/components/layout/CenteredViewportShell";

interface University {
  name: string;
  type: string;
  category: string;
  branch: string;
  address: string;
  fullName: string;
}

export default function ProfileSetupPage() {
  const t = useTranslations("onboarding.profileSetup");
  const { user, profile, isLoaded } = useAppUser();
  const router = useRouter();
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  // Read redirect param from URL (avoid useSearchParams Suspense requirement)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectUrl(params.get("redirect"));
  }, []);
  const [name, setName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [school, setSchool] = useState("");
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
  const [schoolSuggestions, setSchoolSuggestions] = useState<University[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Redirect if not student or not loaded
  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
      return;
    }

    if (isLoaded && user) {
      const userRole = (profile?.role as string) || "student";
      if (userRole !== "student") {
        router.push("/instructor");
        return;
      }

      // Load existing profile if exists
      loadExistingProfile();
    }
  }, [isLoaded, user, router]);

  const loadExistingProfile = async () => {
    try {
      setIsLoadingProfile(true);
      const response = await fetch("/api/student/profile");
      if (response.ok) {
        const data = await response.json();
        if (data.profile) {
          // Load existing profile data
          setName(data.profile.name || "");
          setStudentNumber(data.profile.student_number || "");
          setSchool(data.profile.school || "");
          setSchoolSearchQuery(data.profile.school || "");
        }
      }
    } catch (error) {
      // Ignore profile load errors
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // 학교 검색 (디바운싱)
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
          `/api/universities/search?q=${encodeURIComponent(
            schoolSearchQuery
          )}`
        );
        if (response.ok) {
          const data = await response.json();
          setSchoolSuggestions(data.universities || []);
        }
      } catch (error) {
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

  // 외부 클릭 시 드롭다운 닫기
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!studentNumber.trim()) {
      setError(t("studentNumberRequired"));
      return;
    }
    if (!school.trim()) {
      setError(t("schoolRequired"));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/student/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          student_number: studentNumber.trim(),
          school: school.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // 성공 시 redirect URL이 있으면 해당 페이지로, 없으면 학생 대시보드로
        sessionStorage.setItem("profile-setup-complete", "true");
        window.location.href = redirectUrl || "/student";
      } else {
        setError(data.error || t("saveFailed"));
      }
    } catch (error) {
      setError(t("serverError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || isLoadingProfile) {
    return (
      <div className="flex min-h-screen min-h-dvh items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <CenteredViewportShell
      className="bg-background"
      contentClassName="max-w-2xl"
    >
      <Card className="w-full shadow-xl border-0">
        <CardHeader className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">{t("cardTitle")}</CardTitle>
          <CardDescription className="text-base">
            {isLoadingProfile
              ? t("cardDescLoading")
              : t("cardDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 이름 입력 */}
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
                className="w-full"
              />
            </div>

            {/* 학번 입력 */}
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
                className="w-full"
              />
            </div>

            {/* 학교 검색 */}
            <div className="space-y-2">
              <Label htmlFor="school" className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4" />
                {t("schoolLabel")}
              </Label>
              <div className="relative">
                <Input
                  ref={inputRef}
                  id="school"
                  type="text"
                  placeholder={t("schoolPlaceholder")}
                  value={schoolSearchQuery}
                  onChange={(e) => {
                    setSchoolSearchQuery(e.target.value);
                    if (e.target.value !== school) {
                      setSchool("");
                    }
                  }}
                  required
                  className="w-full"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {/* 검색 결과 드롭다운 */}
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

            {/* 에러 메시지 */}
            {error && <ErrorAlert message={error} />}

            {/* 제출 버튼 */}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !name || !studentNumber || !school}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("saveBtn")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </CenteredViewportShell>
  );
}
