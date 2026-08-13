"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { qk } from "@/lib/query-keys";

/**
 * 온보딩 퍼널 (0단계 — 먼저 재기)
 *
 * 온보딩 UI 를 고치기 전에 어디서 빠지는지 본다. 고친 뒤 좋아졌는지도 여기서 본다.
 * 숫자만 두면 판단이 안 되므로 가장 큰 이탈 구간을 화면이 직접 지목한다.
 */

type FunnelStep = {
  event: string;
  label: string;
  kind: "proxy" | "true_north" | "step";
  users: number;
  overallRate: number;
  stepRate: number | null;
  droppedFromPrev: number | null;
};

type FunnelResponse = {
  steps: FunnelStep[];
  biggestDrop: { fromEvent: string; toEvent: string; dropped: number } | null;
  medianMinutesToProxyValue: number | null;
  sampledUsers: number;
  truncated: boolean;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function AdminOnboardingPage() {
  const { data, isLoading, isError } = useQuery<FunnelResponse>({
    queryKey: qk.admin.onboardingFunnel(),
    queryFn: async () => {
      const res = await fetch("/api/admin/onboarding-funnel");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  return (
    <AdminShell title="온보딩 퍼널" icon={Users}>
      <div className="space-y-6">
        <p className="text-muted-foreground text-sm">
          교수자가 가입 후 실제 학생 제출까지 가는 길에서 어디가 막히는지 봅니다.
          데모 완주는 대리 지표이고, 첫 학생 제출이 진짜 지표입니다.
        </p>

        {isError && (
          <Alert variant="destructive">
            <AlertDescription>퍼널을 불러오지 못했습니다.</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {data && (
          <>
            {data.truncated && (
              <Alert>
                <AlertDescription>
                  조회 상한에 걸려 일부만 집계했습니다. 아래 숫자는 실제보다 작습니다.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">집계 대상</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{data.sampledUsers}명</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    데모 생성 → AI 채점 열람 (중앙값)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {data.medianMinutesToProxyValue === null
                      ? "표본 없음"
                      : `${data.medianMinutesToProxyValue}분`}
                  </p>
                  {/* 업계 기준: 첫 가치까지 15분 이내 */}
                  <p className="text-muted-foreground mt-1 text-xs">
                    기준 15분 이내
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              {data.steps.map((step, i) => {
                const isBiggestDrop = data.biggestDrop?.toEvent === step.event;
                return (
                  <Card
                    key={step.event}
                    className={isBiggestDrop ? "border-destructive" : undefined}
                  >
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground w-6 text-sm">
                          {i + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{step.label}</span>
                            {step.kind === "proxy" && (
                              <Badge variant="secondary">대리 지표</Badge>
                            )}
                            {step.kind === "true_north" && (
                              <Badge>진짜 지표</Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground text-xs">
                            {step.event}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-lg font-semibold">{step.users}명</p>
                          <p className="text-muted-foreground text-xs">
                            전체 {pct(step.overallRate)}
                          </p>
                        </div>
                        <div className="w-24">
                          {step.stepRate === null ? (
                            <p className="text-muted-foreground text-xs">시작</p>
                          ) : (
                            <>
                              <p className="text-sm">직전 {pct(step.stepRate)}</p>
                              <p className="text-muted-foreground text-xs">
                                -{step.droppedFromPrev}명
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {data.biggestDrop && (
              <Alert>
                <AlertDescription>
                  이탈이 가장 큰 구간은{" "}
                  <strong>
                    {
                      data.steps.find((s) => s.event === data.biggestDrop?.fromEvent)
                        ?.label
                    }{" "}
                    →{" "}
                    {
                      data.steps.find((s) => s.event === data.biggestDrop?.toEvent)
                        ?.label
                    }
                  </strong>{" "}
                  입니다 ({data.biggestDrop.dropped}명). 여기부터 고치는 게 효율이
                  가장 높습니다.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
