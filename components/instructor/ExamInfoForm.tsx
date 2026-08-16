"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CourseSelectField } from "@/components/instructor/CourseSelectField";
import { HelpCircle, AlertTriangle, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { formatDate } from "@/lib/i18n/format";

interface ExamInfoFormProps {
  title: string;
  code: string;
  duration: number;
  onTitleChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onGenerateCode: () => void;
  mode?: "exam" | "assignment";
  deadline?: string;
  onDeadlineChange?: (value: string) => void;
  titleError?: string;
  deadlineError?: string;
  language?: "ko" | "en";
  onLanguageChange?: (value: "ko" | "en") => void;
  /** 선택된 과목 id. null 이 기본값이고 "과목 없음"을 뜻한다 — 출제를 막지 않는다. */
  courseId?: string | null;
  /** 넘기지 않으면 과목 선택기를 렌더링하지 않는다(기존 호출부 무영향). */
  onCourseChange?: (courseId: string | null) => void;
  /** AI 에이전트 체화 애니메이션이 가리킬 제목 입력 DOM 요소 ref. */
  titleRef?: React.Ref<HTMLInputElement>;
  /**
   * 과제 코드 재생성 버튼을 숨긴다. 편집 페이지에서 코드는 읽기전용이므로 true.
   * 기본값 false — create 페이지 등 기존 호출은 영향받지 않는다.
   */
  codeReadOnly?: boolean;
}

export function ExamInfoForm({
  title,
  code,
  duration,
  onTitleChange,
  onCodeChange,
  onDurationChange,
  onGenerateCode,
  mode = "exam",
  deadline,
  onDeadlineChange,
  titleError,
  deadlineError,
  language = "ko",
  onLanguageChange,
  courseId,
  onCourseChange,
  titleRef,
  codeReadOnly = false,
}: ExamInfoFormProps) {
  const t = useTranslations("authoring");
  const locale = useLocale() as "ko" | "en";
  const dateFnsLocale = locale === "ko" ? ko : enUS;
  const [durationInput, setDurationInput] = useState<string>(
    duration === 0 ? "" : duration.toString()
  );
  const isUnlimited = duration === 0;
  const showDurationWarning = !isUnlimited && duration > 0 && duration < 15;

  const handleUnlimitedChange = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      onDurationChange(0); // 무제한 설정
      setDurationInput("");
    } else {
      onDurationChange(60); // 기본값 복구
      setDurationInput("60");
    }
  };

  const handleDurationInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setDurationInput(value);

    // 빈 값이면 아무것도 하지 않음
    if (value === "") {
      return;
    }

    // 소수점이나 비정상적인 문자 제거 후 정수로 변환
    // parseInt는 자동으로 소수점 이하를 버리고, 숫자가 아닌 문자는 무시함
    const numValue = parseInt(value.replace(/[^0-9]/g, ""), 10);

    // 숫자가 아니거나 NaN이면 무시
    if (isNaN(numValue) || numValue < 0) {
      return;
    }

    // 1분 ~ 1440분(24시간) 사이의 값만 허용
    if (numValue >= 1 && numValue <= 1440) {
      onDurationChange(numValue);
    } else if (numValue > 1440) {
      // 최대값 초과 시 최대값으로 제한
      setDurationInput("1440");
      onDurationChange(1440);
    }
  };

  const handleDurationInputBlur = () => {
    // 포커스가 벗어날 때 유효성 검사
    if (durationInput === "") {
      return;
    }

    // 소수점이나 비정상적인 문자 제거 후 정수로 변환
    const cleanedValue = durationInput.replace(/[^0-9]/g, "");
    const numValue = parseInt(cleanedValue, 10);

    if (isNaN(numValue) || numValue < 1) {
      // 유효하지 않은 값이면 최소값으로 설정
      setDurationInput("1");
      onDurationChange(1);
    } else if (numValue > 1440) {
      // 최대값 초과 시 최대값으로 설정
      setDurationInput("1440");
      onDurationChange(1440);
    } else {
      // 정상적인 값이면 정수로 정규화하여 표시
      setDurationInput(numValue.toString());
    }
  };

  // duration이 외부에서 변경되었을 때 (예: 빠른 선택 버튼 클릭) 동기화
  useEffect(() => {
    if (duration === 0) {
      setDurationInput("");
    } else if (durationInput !== duration.toString()) {
      setDurationInput(duration.toString());
    }
  }, [duration]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "assignment" ? t("examInfoForm.cardTitleAssignment") : t("examInfoForm.cardTitleExam")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="title">{mode === "assignment" ? t("examInfoForm.labelTitleAssignment") : t("examInfoForm.labelTitleExam")}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    {t("examInfoForm.tooltipTitle")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              ref={titleRef}
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={t("examInfoForm.placeholderTitle")}
              required
              className={titleError ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {titleError && (
              <p className="text-xs text-destructive mt-1">{titleError}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="code">{mode === "assignment" ? t("examInfoForm.labelCodeAssignment") : t("examInfoForm.labelCodeExam")}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    {t("examInfoForm.tooltipCode")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex gap-2">
              <Input
                id="code"
                value={code}
                onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
                placeholder={code}
                className="exam-code"
                required
                disabled
              />
              {!codeReadOnly && (
                <Button type="button" variant="outline" onClick={onGenerateCode}>
                  {t("examInfoForm.buttonRegenerate")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 과목 — 선택 사항. 제목·코드 바로 아래가 "무엇을/어디에" 순서다. */}
        {onCourseChange && (
          <CourseSelectField
            value={courseId ?? null}
            onChange={onCourseChange}
            variant="compact"
          />
        )}

        {onLanguageChange && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="language">{t("examInfoForm.labelLanguage")}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    {t("examInfoForm.tooltipLanguage")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={language}
              onValueChange={(v) => onLanguageChange(v as "ko" | "en")}
            >
              <SelectTrigger id="language" className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">{t("examInfoForm.languageKo")}</SelectItem>
                <SelectItem value="en">{t("examInfoForm.languageEn")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {mode === "assignment" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t("examInfoForm.labelDeadline")}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    {t("examInfoForm.tooltipDeadline")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={`w-full max-w-xs justify-start font-normal ${!deadline ? "text-muted-foreground" : ""} ${deadlineError ? "border-destructive" : ""}`}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deadline ? formatDate(new Date(deadline), locale) : t("examInfoForm.deadlinePlaceholder")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={dateFnsLocale}
                  selected={deadline ? new Date(deadline) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      onDeadlineChange?.(format(date, "yyyy-MM-dd"));
                    }
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  defaultMonth={deadline ? new Date(deadline) : new Date()}
                />
              </PopoverContent>
            </Popover>
            {deadlineError && (
              <p className="text-xs text-destructive mt-1">{deadlineError}</p>
            )}
          </div>
        ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="duration">{t("examInfoForm.labelDuration")}</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  {t("examInfoForm.tooltipDuration")}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="space-y-3">
            {/* 무제한 체크박스 */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="unlimited"
                checked={isUnlimited}
                onCheckedChange={handleUnlimitedChange}
              />
              <Label
                htmlFor="unlimited"
                className="text-sm font-medium cursor-pointer"
              >
                {t("examInfoForm.unlimitedLabel")}
              </Label>
            </div>

            {/* 시간 입력 영역 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 min-w-[140px]">
                <Input
                  type="number"
                  id="duration"
                  min="1"
                  max="1440"
                  value={durationInput}
                  onChange={handleDurationInputChange}
                  onBlur={handleDurationInputBlur}
                  disabled={isUnlimited}
                  placeholder={isUnlimited ? t("examInfoForm.placeholderUnlimited") : t("examInfoForm.placeholderMinutes")}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">{t("examInfoForm.unitMinutes")}</span>
              </div>
              <Slider
                min={1}
                max={1440}
                step={1}
                value={[isUnlimited ? 60 : duration]}
                onValueChange={([value]) => {
                  if (!isUnlimited) {
                    onDurationChange(value);
                    setDurationInput(value.toString());
                  }
                }}
                disabled={isUnlimited}
                className="flex-1"
              />
            </div>
            {/* 빠른 선택 버튼 */}
            <div className="flex gap-2 flex-wrap">
              {[30, 60, 90, 120, 180, 240].map((time) => (
                <Button
                  key={time}
                  type="button"
                  variant={
                    !isUnlimited && duration === time ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    if (!isUnlimited) {
                      onDurationChange(time);
                      setDurationInput(time.toString());
                    }
                  }}
                  disabled={isUnlimited}
                  className="text-xs"
                >
                  {t("examInfoForm.quickSelectMin", { time })}
                </Button>
              ))}
            </div>
            {showDurationWarning && (
              <div className="flex items-center gap-1.5 text-warning-text">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{t("examInfoForm.durationWarning")}</span>
              </div>
            )}
          </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
