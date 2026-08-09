"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { formatDateTime } from "@/lib/i18n/format";
import {
  Bot,
  Clock,
  RefreshCw,
  Search,
  Settings,
  Shield,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorAlert } from "@/components/ui/error-alert";
import { AdminShell } from "@/components/admin/AdminShell";
import { qk } from "@/lib/query-keys";

interface User {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  status: string | null;
  createdAt: string;
  avatarUrl: string | null;
}

interface UserStats {
  total: number;
  instructors: number;
  students: number;
  noRole: number;
}

interface AiSummaryResponse {
  totals: {
    requests: number;
    failedRequests: number;
    estimatedCostUsdMicros: number;
  };
}

interface PublishingRow {
  instructorId: string;
  name: string | null;
  school: string | null;
  plan: string;
  publishedCount: number;
  demoCount: number;
  lastPublishedAt: string | null;
}

type AdminUsersResponse =
  | { unauthorized: true }
  | {
      unauthorized: false;
      users: User[];
      stats: UserStats;
    };

function formatUsdMicros(value: number | undefined): string {
  const usd = (value ?? 0) / 1_000_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(usd);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function AdminDashboard() {
  const t = useTranslations("admin");
  const locale = useLocale() as "ko" | "en";
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [mutationError, setMutationError] = useState("");
  const router = useRouter();

  const {
    data: usersResponse,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<AdminUsersResponse>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const response = await fetch("/api/admin/users");

      if (response.status === 401 || response.status === 403) {
        return { unauthorized: true } as const;
      }

      if (!response.ok) {
        throw new Error(t("dashboard.error.loadFail"));
      }

      const data = await response.json();
      return { unauthorized: false, ...data } as const;
    },
    retry: false,
  });

  const {
    data: aiSummary,
    isLoading: isAiSummaryLoading,
    refetch: refetchAiSummary,
  } = useQuery<AiSummaryResponse | null>({
    queryKey: qk.admin.aiUsageSummary({ range: "7d" }),
    queryFn: async () => {
      const response = await fetch("/api/admin/ai-usage/summary?range=7d");

      if (response.status === 401 || response.status === 403) {
        return null;
      }

      if (!response.ok) {
        throw new Error(t("dashboard.error.aiLoadFail"));
      }

      return response.json();
    },
    retry: false,
  });

  const { data: pendingInstructors, refetch: refetchPending } = useQuery({
    queryKey: ["admin-pending-instructors"],
    queryFn: async () => {
      const res = await fetch("/api/admin/instructors/pending");
      if (!res.ok) return [];
      const data = await res.json();
      return data.instructors || [];
    },
  });

  // 발행 현황 (#86 / AC-19). 승인이 한도로 바뀐 뒤 plan 승격 판단의 근거는
  // 대기열이 아니라 "누가 얼마나 쓰고 있는가"다.
  const { data: publishing, refetch: refetchPublishing } = useQuery({
    queryKey: ["admin-instructor-publishing"],
    queryFn: async (): Promise<PublishingRow[]> => {
      const res = await fetch("/api/admin/instructors/publishing");
      if (!res.ok) return [];
      const data = await res.json();
      return data.instructors || [];
    },
  });

  useEffect(() => {
    if (usersResponse?.unauthorized) {
      router.push("/admin/login");
    }
  }, [usersResponse, router]);

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        await refetch();
      } else {
        setMutationError(t("dashboard.error.roleChangeFail"));
      }
    } catch {
      setMutationError(t("dashboard.error.serverError"));
    }
  };

  const approveInstructor = async (instructorId: string) => {
    const res = await fetch("/api/admin/instructors/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorId }),
    });
    if (res.ok) {
      refetchPending();
      refetch();
      refetchPublishing();
    }
  };

  const users = usersResponse && !usersResponse.unauthorized ? usersResponse.users : [];
  const stats: UserStats =
    usersResponse && !usersResponse.unauthorized
      ? usersResponse.stats
      : {
          total: 0,
          instructors: 0,
          students: 0,
          noRole: 0,
        };
  const error =
    mutationError ||
    (queryError instanceof Error
      ? queryError.message
      : queryError
        ? t("dashboard.error.loadFail")
        : "");

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.fullName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === "all" || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "instructor":
        return "default";
      case "student":
        return "secondary";
      default:
        return "outline";
    }
  };

  const formatDate = (dateString: string) =>
    formatDateTime(dateString, locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">{t("dashboard.loading")}</p>
        </div>
      </div>
    );
  }

  const aiTotals = aiSummary?.totals;

  return (
    <AdminShell title={t("dashboard.title")} icon={Shield}>
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.stats.totalUsers")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.stats.instructors")}</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.instructors}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.stats.students")}</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary-foreground">
              {stats.students}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.stats.noRole")}</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.noRole}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.ai.cost7d")}</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isAiSummaryLoading ? "-" : formatUsdMicros(aiTotals?.estimatedCostUsdMicros)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.ai.requests7d")}</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isAiSummaryLoading ? "-" : (aiTotals?.requests ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.ai.failRate7d")}</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isAiSummaryLoading
                ? "-"
                : formatPercent(aiTotals?.failedRequests ?? 0, aiTotals?.requests ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingInstructors && pendingInstructors.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Clock className="w-5 h-5" />
              {t("dashboard.pending.title", { count: pendingInstructors.length })}
            </CardTitle>
            <CardDescription>
              {t("dashboard.pending.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInstructors.map((instructor: {
                id: string;
                name: string;
                email: string;
                school: string | null;
                created_at: string;
              }) => (
                <div
                  key={instructor.id}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-white dark:bg-amber-950/30 p-4"
                >
                  <div>
                    <p className="font-medium">{instructor.name || t("dashboard.pending.noName")}</p>
                    <p className="text-sm text-muted-foreground">{instructor.email}</p>
                    {/* AC-19: 소속이 승인 판단의 근거다. 없으면 판단할 게 없다. */}
                    <p className="text-sm text-muted-foreground">
                      {instructor.school || t("dashboard.pending.noSchool")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.pending.appliedAt", { date: formatDateTime(instructor.created_at, locale, { year: "numeric", month: "short", day: "numeric" }) })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => approveInstructor(instructor.id)}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <UserCheck className="w-4 h-4 mr-1" />
                    {t("dashboard.pending.approve")}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t("dashboard.publishing.title")}
          </CardTitle>
          <CardDescription>{t("dashboard.publishing.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!publishing || publishing.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.publishing.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {publishing.map((row) => (
                <div
                  key={row.instructorId}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {row.name || t("dashboard.pending.noName")}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {row.school || t("dashboard.pending.noSchool")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.lastPublishedAt
                        ? t("dashboard.publishing.lastPublishedAt", {
                            date: formatDateTime(row.lastPublishedAt, locale, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }),
                          })
                        : t("dashboard.publishing.neverPublished")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="secondary">{row.plan}</Badge>
                    <span className="text-sm">
                      {t("dashboard.publishing.publishedCount", {
                        count: row.publishedCount,
                      })}
                    </span>
                    {/* 데모는 한도에 안 잡히지만 "써 보긴 했는가"의 신호다. */}
                    <span className="text-xs text-muted-foreground">
                      {t("dashboard.publishing.demoCount", { count: row.demoCount })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.userManagement.title")}</CardTitle>
          <CardDescription>{t("dashboard.userManagement.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("dashboard.userManagement.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t("dashboard.userManagement.roleFilter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.userManagement.allRoles")}</SelectItem>
                <SelectItem value="instructor">{t("dashboard.userManagement.instructor")}</SelectItem>
                <SelectItem value="student">{t("dashboard.userManagement.student")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                refetch();
                refetchAiSummary();
                refetchPublishing();
              }}
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("dashboard.userManagement.refresh")}
            </Button>
          </div>

          {error && <ErrorAlert message={error} />}

          <div className="space-y-4">
            {filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>{t("dashboard.userManagement.emptySearch")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        {user.avatarUrl ? (
                          <div
                            className="h-10 w-10 rounded-full bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${user.avatarUrl})`,
                            }}
                            title={user.fullName || user.email}
                          />
                        ) : (
                          <Users className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold">
                            {user.fullName || user.email}
                          </h3>
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {user.role === "instructor"
                              ? t("dashboard.userManagement.instructor")
                              : user.role === "student"
                                ? t("dashboard.userManagement.student")
                                : t("dashboard.userManagement.noRole")}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("dashboard.userManagement.joinedAt", { date: formatDate(user.createdAt) })}
                        </p>
                      </div>
                    </div>
                    <Select
                      value={user.role}
                      onValueChange={(newRole) => updateUserRole(user.id, newRole)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instructor">{t("dashboard.userManagement.instructor")}</SelectItem>
                        <SelectItem value="student">{t("dashboard.userManagement.student")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
