"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type InstructorCourse = {
  id: string;
  name: string;
  /** 마이그레이션 029 에서 nullable. "2026-1" 같은 자유 텍스트다. */
  term: string | null;
};

/**
 * Radix Select 는 빈 문자열 value 를 허용하지 않는다(자리표시자 초기화 예약값).
 * "과목 없음"은 숨은 기본값이 아니라 눈에 보이는 선택지여야 하므로 자리표 상수를 쓴다.
 */
const NO_COURSE_VALUE = "__none__";

/** app/api/courses/route.ts 의 Zod 상한과 맞춘다. 서버가 400 을 주기 전에 막는다. */
const NAME_MAX = 200;
const TERM_MAX = 50;

interface CourseSelectFieldProps {
  /** 선택된 과목 id. null 이 기본값이며 "과목 없음"을 뜻한다 — 유효한 상태다. */
  value: string | null;
  onChange: (courseId: string | null) => void;
  /**
   * section — SimpleExamAuthoringForm 의 "한 줄 한 박스" 톤(굵은 라벨 · h-11 흰 입력).
   * compact — ExamInfoForm 카드 안쪽 톤(기본 라벨 · 기본 높이).
   */
  variant?: "section" | "compact";
}

/**
 * 시험·과제 출제 화면의 과목 선택기.
 *
 * 과목은 **끝까지 선택 사항**이다. 목록이 비어 있든 조회에 실패하든 출제를 막지 않는다.
 * 목록은 useQuery(qk.instructor.courses), 생성은 useMutation + invalidateQueries 로만 다룬다.
 */
export function CourseSelectField({
  value,
  onChange,
  variant = "section",
}: CourseSelectFieldProps) {
  const t = useTranslations("instructor");
  const { user, isLoaded } = useAppUser();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const userId = user?.id;

  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftTerm, setDraftTerm] = useState("");

  const coursesQuery = useQuery({
    queryKey: qk.instructor.courses(userId),
    enabled: Boolean(userId),
    queryFn: async ({ signal }): Promise<InstructorCourse[]> => {
      const response = await fetch("/api/courses", { signal });
      if (!response.ok) throw new Error(`courses:${response.status}`);
      const payload = (await response.json()) as { courses?: InstructorCourse[] };
      return payload.courses ?? [];
    },
  });

  const createCourse = useMutation({
    mutationFn: async (input: { name: string; term: string | null }) => {
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`courses:${response.status}`);
      const payload = (await response.json()) as { course: InstructorCourse };
      return payload.course;
    },
    onSuccess: (course) => {
      // 이 한 줄이 "만들자마자 목록에 보인다"를 만든다. 새로고침이 필요 없다.
      queryClient.invalidateQueries({ queryKey: qk.instructor.courses(userId) });
      onChange(course.id);
      setIsCreating(false);
      setDraftName("");
      setDraftTerm("");
    },
  });

  // 로그인 사용자가 없으면 과목이라는 개념 자체가 없다(데모 모드). 빈 드롭다운을 띄우지 않는다.
  if (isLoaded && !userId) return null;

  const isSection = variant === "section";
  const courses = coursesQuery.data ?? [];
  const showSkeleton = !isLoaded || coursesQuery.isLoading;
  const controlClass = isSection ? "h-11 bg-background" : "";

  const openCreateForm = () => {
    createCourse.reset();
    setIsCreating(true);
  };

  const closeCreateForm = () => {
    createCourse.reset();
    setIsCreating(false);
    setDraftName("");
    setDraftTerm("");
  };

  const submitCreateForm = () => {
    const name = draftName.trim();
    if (!name || createCourse.isPending) return;
    const term = draftTerm.trim();
    createCourse.mutate({ name, term: term === "" ? null : term });
  };

  return (
    <section
      className={isSection ? "space-y-3" : "space-y-2"}
      data-testid="course-select-field"
    >
      <div className="space-y-1">
        <Label
          htmlFor={fieldId}
          className={cn(
            "type-field-label flex items-center gap-1.5",
          )}
        >
          {t("course.label")}
          {/*
            같은 카드의 다른 항목(시험 제목·시험 시간·AI 응답 언어)이 전부
            물음표로 설명을 단다. 과목만 빠져 있었다. 설명은 본문에 늘어놓지
            않고 여기 넣는다 — 필요한 사람만 열어보면 된다.
          */}
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{t("course.tooltip")}</p>
            </TooltipContent>
          </Tooltip>
        </Label>
      </div>

      {showSkeleton ? (
        <div role="status" aria-busy>
          <Skeleton className={cn("w-full max-w-xs", isSection ? "h-11" : "h-9")} />
          <span className="sr-only">{t("course.loading")}</span>
        </div>
      ) : coursesQuery.isError ? (
        <ErrorAlert
          message={t("course.loadError")}
          onRetry={() => coursesQuery.refetch()}
        />
      ) : courses.length === 0 && !isCreating ? (
        <div
          className="space-y-3"
          data-testid="course-select-empty"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={openCreateForm}
          >
            <Plus className="h-4 w-4" />
            {t("course.addButton")}
          </Button>
        </div>
      ) : (
        courses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={value ?? NO_COURSE_VALUE}
              onValueChange={(next) =>
                onChange(next === NO_COURSE_VALUE ? null : next)
              }
            >
              <SelectTrigger
                id={fieldId}
                className={cn("w-full max-w-xs", controlClass)}
                data-testid="course-select-trigger"
              >
                <SelectValue placeholder={t("course.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COURSE_VALUE}>{t("course.none")}</SelectItem>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.term
                      ? t("course.itemWithTerm", {
                          name: course.name,
                          term: course.term,
                        })
                      : course.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isCreating && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={openCreateForm}
              >
                <Plus className="h-4 w-4" />
                {t("course.addButton")}
              </Button>
            )}
          </div>
        )
      )}

      {isCreating && (
        <div
          className="space-y-3 rounded-lg border bg-muted/20 p-4"
          data-testid="course-create-form"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-name`}>{t("course.nameLabel")}</Label>
              <Input
                id={`${fieldId}-name`}
                value={draftName}
                maxLength={NAME_MAX}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t("course.namePlaceholder")}
                className={controlClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={`${fieldId}-term`}
                className="flex items-center gap-1.5"
              >
                {t("course.termLabel")}
              </Label>
              <Input
                id={`${fieldId}-term`}
                value={draftTerm}
                maxLength={TERM_MAX}
                onChange={(e) => setDraftTerm(e.target.value)}
                placeholder={t("course.termPlaceholder")}
                className={controlClass}
              />
            </div>
          </div>
          {createCourse.isError && (
            <p className="text-sm text-destructive">{t("course.createError")}</p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={draftName.trim() === "" || createCourse.isPending}
              onClick={submitCreateForm}
            >
              {createCourse.isPending
                ? t("course.creating")
                : t("course.createSubmit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={createCourse.isPending}
              onClick={closeCreateForm}
            >
              {t("course.cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
