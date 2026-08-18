"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { qk } from "@/lib/query-keys";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("admin.onboardingFunnel");
  const { data, isLoading, isError } = useQuery<FunnelResponse>({
    queryKey: qk.admin.onboardingFunnel(),
    queryFn: async () => {
      const res = await fetch("/api/admin/onboarding-funnel");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  return (
    <AdminShell title={t("title")} icon={Users}>
      <div className="space-y-6">
        <p className="text-muted-foreground text-sm">
          {t("subtitle")}
          {t("proxyNote")}
        </p>

        {isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("loadFailed")}</AlertDescription>
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
                  {t("capped")}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="type-field-label">{t("scope")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{data.sampledUsers}명</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="type-field-label">
                    {t("medianLabel")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {data.medianMinutesToProxyValue === null
                      ? t("noSample")
                      : `${data.medianMinutesToProxyValue}분`}
                  </p>
                  {/* 업계 기준: 첫 가치까지 15분 이내 */}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("within15m")}
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
                              <Badge variant="secondary">{t("proxyMetric")}</Badge>
                            )}
                            {step.kind === "true_north" && (
                              <Badge>{t("trueMetric")}</Badge>
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
                            <p className="text-muted-foreground text-xs">
                              {i === 0 ? t("start") : t("noPrev")}
                            </p>
                          ) : (
                            <>
                              <p className="text-sm">{t("prevRate", { rate: pct(step.stepRate) })}</p>
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
                  {t("biggestDrop", {
                    from:
                      data.steps.find((s) => s.event === data.biggestDrop?.fromEvent)
                        ?.label ?? "",
                    to:
                      data.steps.find((s) => s.event === data.biggestDrop?.toEvent)
                        ?.label ?? "",
                    count: data.biggestDrop.dropped,
                  })}
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
