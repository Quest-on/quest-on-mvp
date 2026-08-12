"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AdminShell } from "@/components/admin/AdminShell";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { qk } from "@/lib/query-keys";

/**
 * 관리자 AI 설정 화면 — 최소 범위 (이슈 #118)
 *
 * 편집 폼 + 서버 검증 에러 + 현재 production 버전 표시까지만 만든다.
 * 버전 목록·diff·원클릭 롤백·적용 현황은 의도적으로 만들지 않는다(후속 이슈).
 *
 * 상속 의미가 UI 의 핵심이다: 입력을 비우면 상위 값을 물려받고(키 삭제),
 * "없음" 을 고르면 optional 필드를 명시적으로 끈다(null). 이 둘을 뭉개면
 * 첫 저장에 env/코드 기본값이 영구히 굳는다.
 */

const EDITABLE_FIELDS = [
  "model",
  "timeoutMs",
  "maxRetries",
  "maxTokens",
  "temperature",
  "reasoningEffort",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

// optional 필드만 명시적 null(제거)을 가질 수 있다.
// required 필드에 null 을 보내면 서버가 거부한다.
const NULLABLE_FIELDS = new Set<string>(["maxTokens", "temperature", "reasoningEffort"]);
type OverrideValue = string | number | null | undefined;
type TaskOverride = Partial<Record<EditableField, OverrideValue>>;

type ConfigResponse = {
  versionId: string;
  overrides: Record<string, TaskOverride>;
  effectiveProfiles: Record<string, Record<string, unknown>>;
  sources: Record<string, Record<string, string>>;
  tasks: string[];
};

async function fetchConfig(): Promise<ConfigResponse> {
  const res = await fetch("/api/admin/ai-config");
  if (!res.ok) throw new Error("load failed");
  return res.json();
}

export default function AdminAiConfigPage() {
  const t = useTranslations("admin.aiConfig");
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<Record<string, TaskOverride>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.admin.aiConfig(),
    queryFn: fetchConfig,
  });

  const publish = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: mergeDraft(data, draft), reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "save failed");
      return body as { versionId: string; cacheWarning: string | null };
    },
    onSuccess: (result) => {
      setServerError(null);
      setNotice(result.cacheWarning ?? t("saved"));
      setReason("");
      setDraft({});
      void queryClient.invalidateQueries({ queryKey: qk.admin.aiConfig() });
    },
    onError: (error: Error) => {
      setNotice(null);
      setServerError(error.message);
    },
  });

  if (isLoading) {
    return (
      <AdminShell title={t("title")} icon={SlidersHorizontal}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AdminShell>
    );
  }

  if (isError || !data) {
    return (
      <AdminShell title={t("title")} icon={SlidersHorizontal}>
        <Alert variant="destructive">
          <AlertDescription>{t("loadError")}</AlertDescription>
        </Alert>
      </AdminShell>
    );
  }

  return (
    <AdminShell title={t("title")} icon={SlidersHorizontal}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
          <p className="text-muted-foreground mt-2 font-mono text-xs">
            {t("currentVersion")}: {data.versionId}
          </p>
        </div>

        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {data.tasks.map((task) => (
          <Card key={task}>
            <CardHeader>
              <CardTitle className="font-mono text-base">{task}</CardTitle>
              <CardDescription>
                {EDITABLE_FIELDS.map((field) => {
                  const source = data.sources[task]?.[field];
                  return source ? `${field}: ${t(`sources.${source}`)}` : null;
                })
                  .filter(Boolean)
                  .join(" · ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {EDITABLE_FIELDS.map((field) => {
                const effective = data.effectiveProfiles[task]?.[field];
                const drafted = draft[task]?.[field];
                const value =
                  drafted !== undefined
                    ? drafted === null
                      ? ""
                      : String(drafted)
                    : effective === undefined
                      ? ""
                      : String(effective);

                // optional 필드는 3상태다: 상속 / 값 / 명시적 없음(null).
                // 입력창만 두면 "없음" 을 표현할 방법이 없어 한 번 상속된 optional
                // 값을 끌 수 없다. required 필드는 null 이 될 수 없으므로 제외한다.
                const nullable = NULLABLE_FIELDS.has(field);
                const isExplicitNull = drafted === null;

                return (
                  <div key={field} className="space-y-1">
                    <Label htmlFor={`${task}-${field}`}>{t(`fields.${field}`)}</Label>
                    <Input
                      id={`${task}-${field}`}
                      value={value}
                      placeholder={isExplicitNull ? t("none") : t("inherit")}
                      disabled={isExplicitNull}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          [task]: { ...prev[task], [field]: event.target.value },
                        }))
                      }
                    />
                    {nullable && (
                      <label className="text-muted-foreground flex items-center gap-2 text-xs">
                        <Checkbox
                          id={`${task}-${field}-none`}
                          checked={isExplicitNull}
                          onCheckedChange={(checked) =>
                            setDraft((prev) => ({
                              ...prev,
                              [task]: {
                                ...prev[task],
                                [field]: checked === true ? null : undefined,
                              },
                            }))
                          }
                        />
                        {t("none")}
                      </label>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardContent className="space-y-3 pt-6">
            <Label htmlFor="ai-config-reason">{t("reason")}</Label>
            <Input
              id="ai-config-reason"
              value={reason}
              placeholder={t("reasonPlaceholder")}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              onClick={() => publish.mutate()}
              disabled={publish.isPending || reason.trim() === ""}
            >
              {publish.isPending ? t("saving") : t("save")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

/**
 * 폼 입력을 sparse override 로 되돌린다.
 * 빈 문자열 = 상속(키를 만들지 않는다). 이 규칙이 깨지면 상속이 물질화된다.
 */
function mergeDraft(
  data: ConfigResponse | undefined,
  draft: Record<string, TaskOverride>
): Record<string, TaskOverride> {
  const out: Record<string, TaskOverride> = {};
  const existing = data?.overrides ?? {};

  for (const [task, override] of Object.entries(existing)) {
    out[task] = { ...override };
  }

  for (const [task, fields] of Object.entries(draft)) {
    const target: TaskOverride = { ...out[task] };
    for (const [field, raw] of Object.entries(fields)) {
      const key = field as EditableField;
      if (raw === null) {
        // 명시적 없음 — 상위 값을 끈다. 키를 지우면 상속으로 되돌아가 의미가 다르다.
        target[key] = null;
        continue;
      }
      if (raw === undefined || raw === "") {
        delete target[key];
        continue;
      }
      if (key === "model" || key === "reasoningEffort") {
        target[key] = String(raw);
        continue;
      }
      const numeric = Number(raw);
      target[key] = Number.isFinite(numeric) ? numeric : String(raw);
    }
    if (Object.keys(target).length === 0) delete out[task];
    else out[task] = target;
  }

  return out;
}
