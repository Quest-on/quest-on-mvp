"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
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
import { resolveSignupRole } from "@/lib/onboarding-role";
import { safeInternalPath } from "@/lib/safe-redirect";

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
  const locale = useLocale();
  const { user, profile, isLoaded } = useAppUser();
  const router = useRouter();

  // Step: "role" | "profile" | "intake"
  // intake 는 교수자 전용 JTBD 2문항 단계다 (AC-4). 학생은 거치지 않는다.
  const [step, setStep] = useState<"role" | "profile" | "intake">("role");
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

  // JTBD 2문항 (AC-4). 프로필 수집이 아니라 데모 템플릿 선택 입력이다 —
  // 즉시 소비되지 않는 질문은 온보딩에 둘 이유가 없다.
  const [subject, setSubject] = useState<
    "humanities" | "business" | "engineering" | "health" | "general"
  >("general");

  // AC-1: 가입 시점의 역할 의도를 해석할 수 있으면 역할 단계를 건너뛴다.
  // 해석할 수 없으면(예: OAuth 쿠키 소실) 역할 단계를 그대로 보여준다 —
  // 추측해서 건너뛰면 잘못된 역할로 계정이 굳는다.
  useEffect(() => {
    if (!isLoaded) return;
    const resolved = resolveSignupRole({
      // 이미 역할이 확정된 기존 사용자(프로필 수정 진입)는 profiles.role 이 권위다.
      metadataRole: profile?.role ?? user?.user_metadata?.role,
      cookieString: typeof document === "undefined" ? null : document.cookie,
    });
    if (resolved) {
      setRole(resolved);
      setStep("profile");
    }
  }, [isLoaded, user, profile]);

  // 기존 프로필 프리필. 삭제된 /student/profile-setup 은 마운트 시
  // /api/student/profile 을 읽어 이름·학번·학교를 채웠다. 통합하면서 이걸
  // 빠뜨리면 프로필을 고치러 온 학생이 빈 폼을 마주하고, 그대로 저장하면
  // 기존 값이 지워진 것처럼 보인다.
  //
  // 학생 전용이다. /api/instructor/profile 에는 GET 이 없고(POST 전용),
  // 삭제된 페이지도 학생 프로필만 다뤘다.
  useEffect(() => {
    if (!isLoaded || !user || step !== "profile" || role !== "student") return;

    let cancelled = false;
    const endpoint = "/api/student/profile";

    (async () => {
      try {
        const res = await fetch(endpoint);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const p = data?.profile;
        if (!p || cancelled) return;

        // 사용자가 이미 입력을 시작했으면 덮어쓰지 않는다.
        setName((prev) => prev || p.name || "");
        setSchool((prev) => prev || p.school || "");
        setSchoolSearchQuery((prev) => prev || p.school || "");
        setStudentNumber((prev) => prev || p.student_number || "");
      } catch {
        // 프리필 실패가 온보딩을 막아서는 안 된다. 빈 폼으로 진행한다.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, step, role]);

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
      // 1. 역할 클레임 (#87). 인가 사실이라 프로필 편집과 라우트가 다르다.
      //    이미 역할이 있는 사용자(프로필 수정 진입)는 부르지 않는다 — 서버가
      //    409 로 거부하는 게 정상이고, 그걸 오류로 띄우면 수정이 막힌다.
      if (!profile?.role) {
        const roleRes = await fetch("/api/user/role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        // 409(ROLE_ALREADY_SET)는 다른 탭·재시도로 이미 정해진 경우다. 역할은
        // 어차피 바꿀 수 없으니 프로필 저장은 계속 진행한다.
        if (!roleRes.ok && roleRes.status !== 409) {
          throw new Error("Role claim failed");
        }
      }

      // 2. profiles 테이블에 프로필 정보 업데이트.
      //    role·status 는 여기서 보내지 않는다 — 서버가 거부한다 (AC-20).
      const profileRes = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name.trim(),
          school: school.trim(),
          ...(role === "student" ? { student_id: studentNumber.trim() } : {}),
        }),
      });
      if (!profileRes.ok) throw new Error("Profile update failed");

      // 3. role별 추가 프로필 테이블에도 저장 (기존 API들이 여기서 읽음).
      // AC-2: 이 호출의 실패를 삼키면 프로필이 반쪽만 저장된 유저가 생긴다.
      const roleProfileRes =
        role === "student"
          ? await fetch("/api/student/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                student_number: studentNumber.trim(),
                school: school.trim(),
              }),
            })
          : await fetch("/api/instructor/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                email: user.email,
                school: school.trim(),
              }),
            });
      if (!roleProfileRes.ok) throw new Error("Role profile update failed");

      // 4. 교수자는 JTBD 2문항으로 넘어간다 (AC-4).
      //
      // 응시 중 프로필을 채우러 온 경우(redirect 파라미터)는 예외다 — 그 사람은
      // 지금 시험을 보러 가는 중이고, 여기서 붙잡으면 온보딩이 방해가 된다.
      //
      // redirect 는 URL 쿼리(= 사용자 입력)로 들어온다. `/student/profile-setup`
      // 이 쿼리를 그대로 넘겨주므로 이 지점이 유일한 소비 지점이자 검증 지점이다.
      // `startsWith("/")` 만으로는 `//evil.com`(프로토콜 상대 URL)이 통과해
      // 로그인 직후 외부 사이트로 튕긴다. safeInternalPath 로 좁힌다.
      const params = new URLSearchParams(window.location.search);
      const redirectUrl =
        params.get("redirect") || localStorage.getItem("onboarding_redirect");
      localStorage.removeItem("onboarding_redirect");

      const redirectTarget = safeInternalPath(redirectUrl);

      if (redirectTarget) {
        window.location.href = redirectTarget;
      } else if (role === "instructor") {
        setStep("intake");
        setIsSubmitting(false);
      } else {
        sessionStorage.setItem("profile-setup-complete", "true");
        window.location.href = "/student";
      }
    } catch {
      setError(t("saveFailed"));
      setIsSubmitting(false);
    }
  };

  /**
   * 데모 생성 (AC-5, AC-6).
   *
   * 건너뛰어도 데모는 만든다. 빈 대시보드로 보내는 것보다 기본 템플릿이라도
   * 만져볼 게 있는 편이 낫다 — 건너뛴 사실은 서버가 마일스톤에 남겨서 발행
   * 직전에 같은 질문을 다시 물을 근거로 쓴다.
   *
   * 생성이 실패해도 교수자를 온보딩에 가둬 두지 않는다. 데모는 도움이지
   * 관문이 아니다. 그래서 성공 여부와 무관하게 다음 화면으로 보낸다.
   */
  const createDemo = async (skipped: boolean) => {
    setIsSubmitting(true);
    setError("");
    let examId: string | null = null;
    try {
      const res = await fetch("/api/onboarding/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(skipped ? {} : { subject }),
          skipped,
          language: locale === "en" ? "en" : "ko",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        examId = typeof data?.examId === "string" ? data.examId : null;
      }
    } catch {
      // 무시하고 진행한다 — 아래 이동은 항상 일어난다.
    }
    // 데모 상세로 직접 보낸다. 드라이브 목록을 거쳐 찾게 하면 AC-17(데모는
    // 목록·통계·발행 카운트 어디에도 나타나지 않는다)과 정면으로 부딪힌다 —
    // 목록에서 숨기는 순간 데모가 도달 불가능해지기 때문이다. 링크로 보내면
    // 둘 다 성립한다.
    window.location.href = examId ? `/instructor/${examId}` : "/instructor";
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
      ) : step === "intake" ? (
        /* ── Step 3: JTBD 2문항 (교수자 전용, AC-4) ── */
        <Card className="w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
              <GraduationCap className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">{t("intakeTitle")}</CardTitle>
            <CardDescription className="text-base">
              {t("intakeDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && <ErrorAlert message={error} />}

            {/* JTBD 1번(평가 대상)은 지금 묻지 않는다.
                
                과제형 데모를 만들 수는 있지만, 교수자가 그걸 학생 시점으로
                겪을 경로가 없다. 과제는 응시(`/assignment/{code}`)·완주 판정·
                제출 후 필수 quiz 가 시험과 완전히 다른 흐름인데,
                `useAssignmentSession` 은 데모 미리보기를 아예 모른다. 즉 과제를
                고르면 만들어는 지되 겪을 수 없는 데모가 생긴다.
                
                동작하지 않는 선택지를 보여주는 것보다 안 보여주는 게 낫다.
                과제 응시 경로에 미리보기가 붙으면 그때 되살린다. 서버는
                assessTarget 을 옵셔널로 받으므로 안 보내면 기본 템플릿이 된다. */}

            <div className="space-y-3">
              <Label className="text-sm font-semibold">
                {t("intakeSubjectLabel")}
              </Label>
              <RadioGroup
                value={subject}
                onValueChange={(value) =>
                  setSubject(
                    value as
                      | "humanities"
                      | "business"
                      | "engineering"
                      | "health"
                      | "general"
                  )
                }
                className="grid grid-cols-2 gap-3"
              >
                {(
                  [
                    "humanities",
                    "business",
                    "engineering",
                    "health",
                    "general",
                  ] as const
                ).map((value) => (
                  <Label
                    key={value}
                    htmlFor={`subject-${value}`}
                    className="flex items-center gap-2 rounded-lg border-2 p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <RadioGroupItem value={value} id={`subject-${value}`} />
                    <span className="text-sm">{t(`intakeSubject_${value}`)}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 min-h-[48px]"
                disabled={isSubmitting}
                onClick={() => createDemo(true)}
              >
                {t("intakeSkipBtn")}
              </Button>
              <Button
                type="button"
                className="flex-1 min-h-[48px]"
                disabled={isSubmitting}
                onClick={() => createDemo(false)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("intakeCreating")}
                  </>
                ) : (
                  t("intakeSubmitBtn")
                )}
              </Button>
            </div>
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
