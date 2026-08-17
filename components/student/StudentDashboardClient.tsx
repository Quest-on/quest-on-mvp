"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  User,
  Clock,
  Calendar,
  CheckCircle2,
  Circle,
  PlayCircle,
  FileText,
  Award,
  TrendingUp,
  Plus,
  Copy,
  Search,
  X,
  ListFilterIcon,
  Loader2,
  LayoutDashboard,
  LayoutGrid,
  List,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { UserMenu } from "@/components/auth/UserMenu";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorAlert } from "@/components/ui/error-alert";
import { qk } from "@/lib/query-keys";
import { useInView } from "react-intersection-observer";
import { usePathname } from "next/navigation";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { getScoreColor as getScoreColorUtil, getStatusColor as getStatusColorUtil, formatDateKo } from "@/lib/grading-utils";


interface ExamSession {
  id: string;
  examId: string;
  examTitle: string;
  examCode: string;
  examType: string | null;
  duration: number;
  deadline: string | null;
  status: "completed" | "in-progress" | "quiz-pending";
  submittedAt: string | null;
  createdAt: string;
  submissionCount: number;
  score: number | null;
  maxScore: number | null;
  averageScore: number | null;
  isGraded: boolean;
  gradesReleased?: boolean;
}

interface SessionsResponse {
  sessions: ExamSession[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

interface StudentStatsResponse {
  totalSessions: number;
  completedSessions: number;
  inProgressSessions: number;
  unsubmittedAssignments: number;
  unsubmittedAssignmentItems: Array<{
    sessionId: string;
    examId: string;
    examTitle: string;
    examCode: string;
    deadline: string | null;
    createdAt: string;
  }>;
  overallAverageScore: number | null;
}

/** 과제 제출 기한이 지났는지 — 렌더 순수성(react-hooks/purity) 유지를 위해 컴포넌트 밖에 둔다. */
function isAssignmentDeadlinePassed(deadline: string | null): boolean {
  return !!deadline && new Date(deadline).getTime() < Date.now();
}

export default function StudentDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded, user, profile } = useAppUser();
  const queryClient = useQueryClient();
  const t = useTranslations("student.dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [filter, setFilter] = useState<
    "all" | "graded" | "pending" | "in-progress" | "unsubmitted"
  >("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  // Intersection Observer hook
  const { ref: observerRef, inView } = useInView();

  // Get user role from metadata
  const userRole = (profile?.role as string) || "student";
  const [profileChecked, setProfileChecked] = useState(false);

  // Scroll to top on mount and when pathname changes
  useEffect(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, []);

  // Scroll-based header hide/show
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const handleScroll = () => {
      const currentY = main.scrollTop;
      if (currentY > lastScrollY.current && currentY > 60) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollY.current = currentY;
    };
    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  // Redirect non-students or users without role
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      if (!profile?.role) {
        router.push("/onboarding");
        return;
      }
      if (userRole !== "student") {
        router.push("/instructor");
        return;
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  // Check if profile exists for students (React Query 기반)
  const {
    data: profileData,
    isLoading: isProfileLoading,
  } = useQuery({
    queryKey: ["student-profile", user?.id],
    enabled:
      isLoaded &&
      isSignedIn &&
      userRole === "student" &&
      !profileChecked,
    queryFn: async () => {
      const response = await fetch("/api/student/profile");
      if (response.status === 403) {
        return { forbidden: true } as const;
      }
      if (!response.ok) {
        throw new Error("[Profile Check] 프로필을 불러오는 중 오류가 발생했습니다.");
      }
      const data = await response.json();
      return { forbidden: false, ...data } as const;
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnMount: false,
  });

  useEffect(() => {
    if (!profileData || profileChecked) return;

    if (profileData.forbidden) {
      router.replace("/instructor");
      return;
    }

    // profile 정보가 없으면 프로필 설정 페이지로 이동
    const fromProfileSetup = document.referrer.includes("/student/profile-setup") ||
      sessionStorage.getItem("profile-setup-complete") === "true";

    if (!fromProfileSetup && (!("profile" in profileData) || !profileData.profile)) {
      router.replace("/student/profile-setup");
      return;
    }

    sessionStorage.removeItem("profile-setup-complete");
    setProfileChecked(true);
  }, [profileData, profileChecked, router]);

  // TanStack Query for Sessions (Infinite Scroll)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isSessionsLoading,
    isError: isSessionsError,
    refetch: refetchSessions,
  } = useInfiniteQuery({
    queryKey: qk.student.sessions(user?.id),
    queryFn: async ({ pageParam = 1, signal }) => {
      const response = await fetch(
        `/api/student/sessions?page=${pageParam}&limit=10`,
        { signal } // AbortSignal 연결
      );
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json() as Promise<SessionsResponse>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      userRole === "student" &&
      profileChecked
    ),
    staleTime: 1000 * 60 * 1, // 1 minute stale time
  });

  // Load more when in view (works with all filter/search states)
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // TanStack Query for Stats
  const { data: overallStats } = useQuery({
    queryKey: qk.student.stats(user?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/student/sessions/stats", {
        signal, // AbortSignal 연결
      });
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json() as Promise<StudentStatsResponse>;
    },
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      userRole === "student" &&
      profileChecked
    ),
    staleTime: 1000 * 60 * 5, // 5 minutes stale time
  });

  // Flatten sessions from pages
  const allSessions = data?.pages.flatMap((page) => page.sessions) || [];

  const completedSessions = allSessions.filter(
    (session) => session.status === "completed"
  );
  const inProgressSessions = allSessions.filter(
    (session) => session.status === "in-progress"
  );
  const unsubmittedAssignments = allSessions.filter(
    (session) =>
      (session.status === "in-progress" || session.status === "quiz-pending") &&
      session.examType !== "exam"
  );

  // ✅ 같은 시험 코드에 제출된 세션이 있으면 미제출 세션 제외
  const examCodesWithSubmittedSessions = new Set(
    allSessions
      .filter((s) => s.status === "completed")
      .map((s) => s.examCode)
  );

  // Filter sessions based on search query and filter
  const filteredSessions = allSessions.filter((session) => {
    // ✅ 추가 보안: 같은 시험 코드에 제출된 세션이 있으면 미제출 세션 숨기기
    if (
      (session.status === "in-progress" || session.status === "quiz-pending") &&
      examCodesWithSubmittedSessions.has(session.examCode)
    ) {
      return false; // 제출된 세션이 있는 시험의 미제출 세션은 표시하지 않음
    }

    // Apply filter
    if (filter === "graded") {
      if (session.status !== "completed" || !session.isGraded) return false;
    } else if (filter === "pending") {
      if (session.status !== "completed" || session.isGraded) return false;
    } else if (filter === "in-progress") {
      if (session.status !== "in-progress" && session.status !== "quiz-pending") return false;
    } else if (filter === "unsubmitted") {
      if (
        (session.status !== "in-progress" && session.status !== "quiz-pending") ||
        session.examType === "exam"
      ) {
        return false;
      }
    }

    // Apply search query (debounced to avoid re-render storms)
    if (!debouncedSearchQuery.trim()) return true;
    const query = debouncedSearchQuery.toLowerCase();
    return (
      session.examTitle.toLowerCase().includes(query) ||
      session.examCode.toLowerCase().includes(query)
    );
  });

  const displayTotalCount = overallStats?.totalSessions || allSessions.length;
  const displayCompletedCount =
    overallStats?.completedSessions || completedSessions.length;
  const displayInProgressCount =
    overallStats?.inProgressSessions || inProgressSessions.length;
  const displayTodoCount =
    overallStats?.unsubmittedAssignments ?? unsubmittedAssignments.length;
  const overallAverageScore = overallStats?.overallAverageScore ?? null;
  const sidebarTodoItems = (
    overallStats?.unsubmittedAssignmentItems ??
    unsubmittedAssignments.map((session) => ({
      sessionId: session.id,
      examId: session.examId,
      examTitle: session.examTitle,
      examCode: session.examCode,
      deadline: session.deadline,
      createdAt: session.createdAt,
    }))
  )
    .slice()
    .sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .map((item) => ({
      id: item.sessionId,
      title: item.examTitle,
      examCode: item.examCode,
      deadline: item.deadline,
      href: `/assignment/${item.examCode}`,
    }))
    .filter((item) => {
      if (!item.deadline) return true;
      return new Date(item.deadline).getTime() > Date.now();
    })
    .filter((item) => Boolean(item.examCode));

  // 완료율 계산
  const completionRate =
    displayTotalCount > 0
      ? Math.round((displayCompletedCount / displayTotalCount) * 100)
      : 0;

  // 이번 달 시험 수 계산
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const thisMonthSessions = allSessions.filter(
    (session) => new Date(session.createdAt) >= currentMonth
  ).length;

  const getStatusColor = getStatusColorUtil;
  const getScoreColor = (score: number | null, maxScore: number | null) => {
    if (score === null || maxScore === null) return "text-muted-foreground";
    return getScoreColorUtil((score / maxScore) * 100);
  };
  const formatDate = formatDateKo;

  function getGreeting(name: string) {
    const h = new Date().getHours();
    if (h < 12) return t("greeting.morning", { name });
    if (h < 18) return t("greeting.afternoon", { name });
    return t("greeting.evening", { name });
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4" />;
      case "in-progress":
        return <Circle className="w-4 h-4" />;
      case "quiz-pending":
        return <Clock className="w-4 h-4" />;
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  // 마우스 오버 시 리포트 데이터 프리페칭 (체감 네비게이션 속도 개선)
  const handleSessionHover = (session: { id: string; status: string; isGraded: boolean; gradesReleased?: boolean }) => {
    if (session.status === "completed" && (session.isGraded || session.gradesReleased === false)) {
      queryClient.prefetchQuery({
        queryKey: ["student-report", session.id, user?.id],
        queryFn: async () => {
          const response = await fetch(`/api/student/session/${session.id}/report`);
          if (!response.ok) throw new Error("Prefetch failed");
          return response.json();
        },
        staleTime: 5 * 60 * 1000,
      });
    }
  };

  const navigationItems = [
    {
      title: t("nav.dashboard"),
      href: "/student",
      icon: LayoutDashboard,
      active: pathname === "/student",
    },
    {
      title: t("nav.newExam"),
      href: "/join",
      icon: Plus,
      active: pathname === "/join",
    },
  ];

  // Skeleton loading components
  const StatCardSkeleton = () => (
    <div className="border bg-card rounded-xl shadow-sm animate-pulse p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="h-8 w-8 bg-muted rounded-lg" />
      </div>
      <div className="h-8 w-16 bg-muted rounded mb-2" />
      <div className="h-3 w-32 bg-muted rounded" />
    </div>
  );

  const SessionCardSkeletonGrid = () => (
    <div className="border bg-card rounded-xl animate-pulse p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-16 bg-muted rounded-full" />
        <div className="h-6 w-10 bg-muted rounded" />
      </div>
      <div className="h-5 w-3/4 bg-muted rounded mb-2" />
      <div className="flex gap-3 mb-4">
        <div className="h-4 w-16 bg-muted rounded" />
        <div className="h-4 w-12 bg-muted rounded" />
        <div className="h-4 w-20 bg-muted rounded" />
      </div>
      <div className="pt-3 border-t">
        <div className="h-8 w-24 bg-muted rounded" />
      </div>
    </div>
  );

  const SessionCardSkeletonList = () => (
    <div className="flex items-center justify-between p-4 border rounded-lg animate-pulse">
      <div className="flex-1 space-y-3">
        <div className="flex items-center space-x-3">
          <div className="h-5 w-48 bg-muted rounded" />
          <div className="h-5 w-16 bg-muted rounded-full" />
        </div>
        <div className="flex items-center space-x-4">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
      <div className="h-9 w-24 bg-muted rounded" />
    </div>
  );

  const isCheckingProfile =
    isLoaded &&
    isSignedIn &&
    userRole === "student" &&
    !profileChecked &&
    isProfileLoading;

  if (isCheckingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="type-hint">{t("profileLoading")}</p>
      </div>
    );
  }

  // Session action/CTA renderer (shared between grid and list views)
  const renderSessionAction = (session: ExamSession) => {
    if (session.status === "in-progress") {
      // 과제(duration===0)이고 제출 기한이 지났으면 재입장이 막히므로,
      // 본인 기록을 읽기 전용으로 보여주는 열람 페이지로 유도한다.
      const isAssignment = session.duration === 0;
      if (isAssignment && isAssignmentDeadlinePassed(session.deadline)) {
        return (
          <Link
            href={`/assignment/${session.examCode}/review`}
            className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
          >
            <Button variant="outline" size="sm" className="min-h-[36px] px-4">
              <FileText className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t("action.viewRecord")}
            </Button>
          </Link>
        );
      }
      const resumePath = session.duration === 0
        ? `/assignment/${session.examCode}`
        : `/exam/${session.examCode}`;
      return (
        <Link
          href={resumePath}
          className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
        >
          <Button size="sm" className="min-h-[36px] px-4">
            <PlayCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {t("action.continue")}
          </Button>
        </Link>
      );
    }
    if (session.status === "quiz-pending") {
      return (
        <Link
          href={`/student/session/${session.id}/quiz`}
          className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
        >
          <Button size="sm" className="min-h-[36px] px-4">
            <Clock className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {t("action.takeQuiz")}
          </Button>
        </Link>
      );
    }
    if (session.status === "completed") {
      if (session.gradesReleased === false) {
        return (
          <Link
            href={`/student/report/${session.id}`}
            className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
          >
            <Button variant="outline" size="sm" className="min-h-[36px] px-4">
              <FileText className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t("action.checkAnswer")}
            </Button>
          </Link>
        );
      }
      if (session.isGraded) {
        return (
          <Link
            href={`/student/report/${session.id}`}
            className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
          >
            <Button variant="outline" size="sm" className="min-h-[36px] px-4">
              <FileText className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t("action.viewReport")}
            </Button>
          </Link>
        );
      }
      return (
        <Badge
          variant="outline"
          className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20 px-3 py-1.5"
          aria-label={t("session.pendingEvaluation")}
        >
          {t("session.pendingEvaluation")}
        </Badge>
      );
    }
    return null;
  };

  // Filter button style helper
  const filterButtonClass = (active: boolean) =>
    cn(
      "shrink-0 min-h-[36px] px-3 text-sm font-medium rounded-md transition-colors",
      active
        ? "bg-primary/10 text-primary border border-primary/20"
        : "text-muted-foreground hover:bg-muted border border-transparent"
    );

  const getStatusLabel = (status: string) => {
    if (status === "completed") return t("session.statusCompleted");
    if (status === "quiz-pending") return t("session.statusQuizPending");
    return t("session.statusInProgress");
  };

  return (
    <div className="min-h-screen bg-background">
      {!isSignedIn && isLoaded && (
        <div className="flex items-center justify-center h-screen">
          <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
                <User className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-xl">{t("loginRequired")}</CardTitle>
              <p className="type-hint">
                {t("loginHint")}
              </p>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <Button
                onClick={() => router.replace("/sign-in")}
                className="w-full"
              >
                {t("loginButton")}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {isSignedIn && (
        <SidebarProvider
          defaultOpen={true}
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar-width-icon": "4rem",
            } as React.CSSProperties
          }
        >
          <Sidebar
            side="left"
            variant="sidebar"
            collapsible="icon"
            className="overflow-visible"
          >
            <DashboardSidebar
              homeHref="/student"
              navItems={navigationItems}
              todoItems={sidebarTodoItems}
            />
          </Sidebar>

          <SidebarInset>
            {/* Main Content Area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              {/* Top Header — lightweight */}
              <header className={`sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border transition-transform duration-300 ${headerVisible ? "translate-y-0" : "-translate-y-full"}`}>
                <div className="px-4 sm:px-6 lg:px-8 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                      {/* Desktop Sidebar Toggle */}
                      <SidebarTrigger className="hidden lg:flex" />

                      <div className="min-w-0">
                        <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                          {t("title")}
                        </h1>
                        <p className="text-xs text-muted-foreground truncate hidden sm:block">
                          {getGreeting(
                            profile?.fullName ||
                              user?.email ||
                              ""
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="lg:hidden">
                        <UserMenu />
                      </div>
                    </div>
                  </div>
                </div>
              </header>

              {/* Main Content */}
              <main ref={mainRef} className="flex-1 overflow-y-auto bg-background pb-20 lg:pb-0">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                  {/* Welcome Section — minimal card */}
                  <div className="border bg-card rounded-xl p-6 sm:p-8">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                          {getGreeting(profile?.fullName || user?.email || "")}
                        </h2>
                        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                          {t("welcomeDesc")}
                        </p>
                      </div>
                      <div className="hidden md:block shrink-0">
                        <Link href="/join">
                          <Button className="min-h-[44px]">
                            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                            {t("joinButton")}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Statistics Cards — clean */}
                  <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {isSessionsLoading && !overallStats ? (
                      <>
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                      </>
                    ) : (
                      <>
                        {/* 전체 시험 카드 */}
                        <div className="border bg-card rounded-xl shadow-sm p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              {t("stats.totalExams")}
                            </span>
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <FileText
                                className="w-4 h-4 text-primary/70"
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                          <div className="text-2xl sm:text-3xl font-bold">
                            {displayTotalCount}
                          </div>
                          <div className="flex items-baseline gap-2 mt-2">
                            <div className="flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-primary" />
                              <span className="text-xs font-medium text-foreground">
                                {t("stats.completionRate", { rate: completionRate })}
                              </span>
                            </div>
                            {thisMonthSessions > 0 && (
                              <span className="type-meta">
                                {t("stats.thisMonth", { count: thisMonthSessions })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("stats.completedAndInProgress", {
                              completed: displayCompletedCount,
                              inProgress: displayInProgressCount,
                            })}
                          </p>
                        </div>

                        {/* ToDo 카드 */}
                        <div className="border bg-card rounded-xl shadow-sm p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              {t("stats.todo")}
                            </span>
                            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                              <Clock
                                className="w-4 h-4 text-amber-600"
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                          <div className="text-2xl sm:text-3xl font-bold">
                            {displayTodoCount}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("stats.unsubmittedAssignments", { count: displayTodoCount })}
                          </p>
                        </div>

                        {/* 평균 점수 카드 */}
                        <div className="border bg-card rounded-xl shadow-sm p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              {t("stats.averageScore")}
                            </span>
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <TrendingUp
                                className="w-4 h-4 text-primary/70"
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                          <div
                            className={`text-2xl sm:text-3xl font-bold transition-colors duration-200 ${
                              overallAverageScore !== null
                                ? getScoreColor(overallAverageScore, 100)
                                : "text-muted-foreground"
                            }`}
                          >
                            {overallAverageScore !== null
                              ? `${overallAverageScore}%`
                              : t("stats.pendingEvaluation")}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("stats.examBasis", {
                              count: overallStats?.completedSessions || displayCompletedCount,
                            })}
                          </p>
                        </div>

                        {/* 완료한 시험 카드 */}
                        <div className="border bg-card rounded-xl shadow-sm sm:col-span-2 lg:col-span-1 p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              {t("stats.completedExams")}
                            </span>
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Award
                                className="w-4 h-4 text-primary/70"
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                          <div className="text-2xl sm:text-3xl font-bold">
                            {displayCompletedCount}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {displayInProgressCount > 0
                              ? t("stats.inProgress", { count: displayInProgressCount })
                              : t("stats.allCompleted")}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Exam History Section — no Card wrapper */}
                  <section id="exam-history" className="space-y-4">
                    {/* Section header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="flex items-center space-x-2 text-lg sm:text-xl font-semibold">
                          <FileText
                            className="w-5 h-5 text-primary shrink-0"
                            aria-hidden="true"
                          />
                          <span>{t("history.title")}</span>
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("history.description")}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2 text-xs sm:text-sm text-muted-foreground shrink-0">
                        <Calendar
                          className="w-4 h-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="whitespace-nowrap">
                          {searchQuery.trim() || filter !== "all"
                            ? t("history.filteredCount", {
                                filtered: filteredSessions.length,
                                total: displayTotalCount,
                              })
                            : t("history.totalCount", { total: displayTotalCount })}
                        </span>
                      </div>
                    </div>

                    {/* Filter bar + view toggle */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 -mx-1 px-1 hide-scrollbar flex-1">
                        <ListFilterIcon
                          className="w-4 h-4 text-muted-foreground shrink-0"
                          aria-hidden="true"
                        />
                        <button
                          onClick={() => setFilter("all")}
                          className={filterButtonClass(filter === "all")}
                          aria-pressed={filter === "all"}
                          aria-label={t("filter.allAria")}
                        >
                          {t("filter.all")}
                        </button>
                        <button
                          onClick={() => setFilter("graded")}
                          className={filterButtonClass(filter === "graded")}
                          aria-pressed={filter === "graded"}
                          aria-label={t("filter.gradedAria")}
                        >
                          {t("filter.graded")}
                        </button>
                        <button
                          onClick={() => setFilter("pending")}
                          className={filterButtonClass(filter === "pending")}
                          aria-pressed={filter === "pending"}
                          aria-label={t("filter.pendingAria")}
                        >
                          {t("filter.pending")}
                        </button>
                        <button
                          onClick={() => setFilter("in-progress")}
                          className={filterButtonClass(filter === "in-progress")}
                          aria-pressed={filter === "in-progress"}
                          aria-label={t("filter.inProgressAria")}
                        >
                          {t("filter.inProgress")}
                        </button>
                        <button
                          onClick={() => setFilter("unsubmitted")}
                          className={filterButtonClass(filter === "unsubmitted")}
                          aria-pressed={filter === "unsubmitted"}
                          aria-label={t("filter.unsubmittedAria")}
                        >
                          {t("filter.unsubmitted")}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 sm:w-64">
                          <Search
                            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                            aria-hidden="true"
                          />
                          <Input
                            type="text"
                            placeholder={t("search.placeholder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-9 min-h-[36px]"
                            aria-label={t("search.ariaLabel")}
                          />
                          {(searchQuery || filter !== "all") && (
                            <button
                              onClick={() => {
                                setSearchQuery("");
                                setFilter("all");
                              }}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                              title={t("search.resetAria")}
                              aria-label={t("search.resetAria")}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {/* View toggle */}
                        <div className="flex items-center gap-0.5 border rounded-lg p-1">
                          <button
                            onClick={() => setViewMode("grid")}
                            className={cn(
                              "p-1.5 rounded-md transition-colors",
                              viewMode === "grid"
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                            aria-label={t("view.gridAria")}
                            aria-pressed={viewMode === "grid"}
                          >
                            <LayoutGrid className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setViewMode("list")}
                            className={cn(
                              "p-1.5 rounded-md transition-colors",
                              viewMode === "list"
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                            aria-label={t("view.listAria")}
                            aria-pressed={viewMode === "list"}
                          >
                            <List className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    {isSessionsLoading && allSessions.length === 0 ? (
                      viewMode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <SessionCardSkeletonGrid />
                          <SessionCardSkeletonGrid />
                          <SessionCardSkeletonGrid />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <SessionCardSkeletonList />
                          <SessionCardSkeletonList />
                          <SessionCardSkeletonList />
                        </div>
                      )
                    ) : isSessionsError ? (
                      /*
                        오류를 빈 상태로 보여주면 안 된다. 예전에는 isError 를 안 봐서
                        조회가 실패해도 "응시한 시험이 없다" 고 말했다. 학생에게 이건
                        자기 응시 기록이 사라졌다는 뜻으로 읽힌다.
                      */
                      <ErrorAlert
                        message={t("emptyState.loadError")}
                        onRetry={() => refetchSessions()}
                      />
                    ) : allSessions.length === 0 ? (
                      <div
                        className="text-center py-12 sm:py-16 border-2 border-dashed border-muted-foreground/20 rounded-lg bg-muted/30"
                        data-testid="student-empty-state"
                      >
                        <FileText
                          className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mx-auto mb-4"
                          aria-hidden="true"
                        />
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          {t("emptyState.noExams")}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                          {t("emptyState.noExamsHint")}
                        </p>
                        <Link href="/join">
                          <Button size="lg" className="min-h-[44px]">
                            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                            {t("emptyState.startFirst")}
                          </Button>
                        </Link>
                      </div>
                    ) : filteredSessions.length === 0 ? (
                      <div className="text-center py-12 sm:py-16 border-2 border-dashed border-muted-foreground/20 rounded-lg bg-muted/30">
                        <Search
                          className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mx-auto mb-4"
                          aria-hidden="true"
                        />
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          {t("emptyState.noResults")}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                          {t("emptyState.noResultsHint")}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSearchQuery("");
                            setFilter("all");
                          }}
                          className="min-h-[44px]"
                        >
                          <X className="w-4 h-4 mr-2" aria-hidden="true" />
                          {t("emptyState.resetSearch")}
                        </Button>
                      </div>
                    ) : viewMode === "grid" ? (
                      /* Grid View */
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredSessions.map((session) => (
                          <div
                            key={session.id}
                            className="group relative bg-card border rounded-xl p-5 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
                            onMouseEnter={() => handleSessionHover(session)}
                          >
                            {/* Top: status badge + score */}
                            <div className="flex items-center justify-between mb-3">
                              <Badge
                                variant="outline"
                                className={`flex items-center space-x-1 ${getStatusColor(
                                  session.status
                                )}`}
                                aria-label={t("session.statusAria", {
                                  status: getStatusLabel(session.status),
                                })}
                              >
                                {getStatusIcon(session.status)}
                                <span>
                                  {getStatusLabel(session.status)}
                                </span>
                              </Badge>
                              {session.status === "completed" &&
                                session.isGraded &&
                                session.averageScore !== null && (
                                  <span
                                    className={`text-lg font-bold ${getScoreColor(
                                      session.averageScore,
                                      100
                                    )}`}
                                  >
                                    {session.averageScore}%
                                  </span>
                                )}
                            </div>
                            {/* Title */}
                            <h4 className="font-semibold text-base mb-2 line-clamp-2 text-foreground">
                              {session.examTitle}
                            </h4>
                            {/* Meta info */}
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-4">
                              <span className="flex items-center gap-1">
                                <Copy className="w-3 h-3" aria-hidden="true" />
                                <span className="exam-code font-mono">
                                  {session.examCode}
                                </span>
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                {session.duration === 0 ? (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {t("session.assignment")}
                                  </Badge>
                                ) : (
                                  t("session.durationMinutes", { duration: session.duration })
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" aria-hidden="true" />
                                {session.submittedAt
                                  ? formatDate(session.submittedAt)
                                  : formatDate(session.createdAt)}
                              </span>
                            </div>
                            {/* Bottom CTA */}
                            <div className="pt-3 border-t">
                              {renderSessionAction(session)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* List View */
                      <div className="space-y-3">
                        {filteredSessions.map((session) => (
                          <div
                            key={session.id}
                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors duration-200 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
                            onMouseEnter={() => handleSessionHover(session)}
                          >
                            <div className="flex-1 min-w-0 w-full sm:w-auto">
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                                <h4 className="font-semibold text-foreground text-base sm:text-lg break-words">
                                  {session.examTitle}
                                </h4>
                                <Badge
                                  variant="outline"
                                  className={`flex items-center space-x-1 shrink-0 ${getStatusColor(
                                    session.status
                                  )}`}
                                  aria-label={t("session.statusAria", {
                                    status: getStatusLabel(session.status),
                                  })}
                                >
                                  {getStatusIcon(session.status)}
                                  <span>
                                    {getStatusLabel(session.status)}
                                  </span>
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                                <div className="flex items-center space-x-1.5">
                                  <Copy
                                    className="w-3.5 h-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="exam-code font-mono break-all">
                                    {session.examCode}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <Clock
                                    className="w-3.5 h-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  {session.duration === 0 ? (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {t("session.assignment")}
                                    </Badge>
                                  ) : (
                                    <span>
                                      {t("session.durationMinutes", { duration: session.duration })}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <Calendar
                                    className="w-3.5 h-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="whitespace-nowrap">
                                    {session.submittedAt
                                      ? formatDate(session.submittedAt)
                                      : formatDate(session.createdAt)}
                                  </span>
                                </div>
                                {session.submissionCount > 0 && (
                                  <span className="whitespace-nowrap">
                                    {t("session.submissionCount", { count: session.submissionCount })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 sm:gap-4 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                              {session.status === "completed" &&
                                session.isGraded &&
                                session.averageScore !== null && (
                                  <div className="text-right sm:text-left">
                                    <div
                                      className={`text-lg sm:text-xl font-bold transition-colors duration-200 ${getScoreColor(
                                        session.averageScore,
                                        100
                                      )}`}
                                      aria-label={t("session.averageScoreAria", {
                                        score: session.averageScore,
                                      })}
                                    >
                                      {session.averageScore}%
                                    </div>
                                    {session.score !== null &&
                                      session.maxScore !== null && (
                                        <div className="type-meta">
                                          {t("session.scorePoints", {
                                            score: session.score,
                                            maxScore: session.maxScore,
                                          })}
                                        </div>
                                      )}
                                  </div>
                                )}
                              {renderSessionAction(session)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Infinite scroll observer + end messages */}
                    {!searchQuery.trim() &&
                      filter === "all" &&
                      hasNextPage && (
                        <div
                          ref={observerRef}
                          className="flex flex-col items-center justify-center py-6 gap-2"
                          aria-live="polite"
                        >
                          {isFetchingNextPage ? (
                            <>
                              <Loader2
                                className="w-6 h-6 animate-spin text-primary"
                                aria-hidden="true"
                              />
                              <span className="type-hint">
                                {t("infinite.loading")}
                              </span>
                            </>
                          ) : (
                            <span className="type-hint">
                              {t("infinite.scrollHint")}
                            </span>
                          )}
                        </div>
                      )}
                    {!hasNextPage &&
                      !searchQuery.trim() &&
                      filter === "all" &&
                      allSessions.length > 0 && (
                        <div className="text-center py-6 text-sm text-muted-foreground border-t pt-6">
                          {t("infinite.allLoaded")}
                        </div>
                      )}
                  </section>
                </div>
              </main>
            </div>
          </SidebarInset>

          <MobileBottomNav navItems={navigationItems} />
        </SidebarProvider>
      )}
    </div>
  );
}
