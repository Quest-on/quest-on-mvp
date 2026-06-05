import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { HelpCircle, AlertTriangle, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useState, useEffect } from "react";

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
  titleRef,
  codeReadOnly = false,
}: ExamInfoFormProps) {
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
        <CardTitle>{mode === "assignment" ? "과제 정보" : "시험 정보"}</CardTitle>
        <CardDescription>{mode === "assignment" ? "과제의 기본 세부사항" : "시험의 기본 세부사항"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="title">{mode === "assignment" ? "과제 제목" : "시험 제목"}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    시험의 제목을 입력하세요. 예: &quot;국제경영론 25-1
                    중간고사&quot;와 같이 과목명과 시험 정보를 포함하면
                    좋습니다.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              ref={titleRef}
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="예) 국제경영론 25-1 중간고사"
              required
              className={titleError ? "border-red-500 focus-visible:ring-red-500" : ""}
            />
            {titleError && (
              <p className="text-xs text-red-500 mt-1">{titleError}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="code">{mode === "assignment" ? "과제 코드" : "시험 코드"}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    학생들이 시험에 접속할 때 사용하는 고유 코드입니다. 자동으로
                    생성되며, 재생성 버튼을 눌러 변경할 수 있습니다.
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
                  재생성
                </Button>
              )}
            </div>
          </div>
        </div>

        {onLanguageChange && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="language">AI 언어</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    AI 튜터 및 자동 채점이 사용할 언어를 선택합니다. 학생 UI에는
                    영향이 없습니다. 영어 강의/시험이면 English를 선택하세요.
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
                <SelectItem value="ko">한국어 (기본)</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {mode === "assignment" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>제출 기한</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    학생들이 과제를 제출해야 하는 마감 기한을 설정하세요.
                    선택한 날짜 23:59:59까지 제출 가능합니다.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={`w-full max-w-xs justify-start font-normal ${!deadline ? "text-muted-foreground" : ""} ${deadlineError ? "border-red-500" : ""}`}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deadline ? format(new Date(deadline), "PPP", { locale: ko }) : "날짜 선택"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ko}
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
              <p className="text-xs text-red-500 mt-1">{deadlineError}</p>
            )}
          </div>
        ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="duration">시험 시간</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  학생들이 시험을 치르는 데 주어지는 시간을 설정하세요.
                  슬라이더를 조절하거나 직접 입력할 수 있습니다. 무제한으로
                  설정하면 시간 제한 없이 제출할 때까지 풀 수 있습니다.
                  최소 1분부터 최대 1440분(24시간)까지 설정 가능합니다.
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
                시간 무제한 (과제형)
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
                  placeholder={isUnlimited ? "무제한" : "분"}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">분</span>
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
                  {time}분
                </Button>
              ))}
            </div>
            {showDurationWarning && (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm">시험 시간은 최소 15분 이상이어야 합니다.</span>
              </div>
            )}
          </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
