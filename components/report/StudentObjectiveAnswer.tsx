import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentObjectiveAnswerProps {
  type: string;
  options?: string[];
  /** 학생이 제출한 답안 문자열 — 선택지 인덱스("2") 또는 선택지 텍스트. */
  selectedAnswer?: string;
  /** 점수 공개 여부. false면 정오답·점수를 숨기고 내 선택만 표시한다. */
  released: boolean;
  /** 문항별 점수(객관식은 100/0). released일 때만 의미가 있다. */
  score?: number;
}

/**
 * 학생 리포트의 객관식/OX 답안 표시.
 *
 * 학생이 고른 선택지만 강조한다. 정답 선택지는 절대 노출하지 않으며,
 * 점수 공개 후에는 점수(100/0)로부터 정오답만 표시한다.
 */
export function StudentObjectiveAnswer({
  type,
  options,
  selectedAnswer,
  released,
  score,
}: StudentObjectiveAnswerProps) {
  const resolvedOptions =
    options && options.length > 0
      ? options
      : type === "true-false"
        ? ["O", "X"]
        : [];

  const selectedIndex = (() => {
    const raw = (selectedAnswer ?? "").trim();
    if (!raw) return null;
    const parsed = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
    const optionIndex = resolvedOptions.findIndex((o) => o.trim() === raw);
    return optionIndex >= 0 ? optionIndex : null;
  })();

  const answered = selectedIndex !== null;
  const hasScore = released && typeof score === "number";
  const isCorrect = hasScore && score === 100;

  return (
    <div className="space-y-3">
      {released && (
        <div className="flex items-center gap-2">
          {!answered ? (
            <Badge variant="outline">무응답</Badge>
          ) : !hasScore ? (
            <Badge variant="outline">미채점</Badge>
          ) : isCorrect ? (
            <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              정답
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              오답
            </Badge>
          )}
          {hasScore && (
            <span className="text-sm font-medium text-muted-foreground">
              {score}점
            </span>
          )}
        </div>
      )}

      {resolvedOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {answered ? `내 선택: ${selectedAnswer}` : "선택지 정보가 없습니다."}
        </p>
      ) : (
        <ul className="space-y-2">
          {resolvedOptions.map((option, index) => {
            const isPick = selectedIndex === index;
            return (
              <li
                key={index}
                className={cn(
                  "flex items-center gap-3 rounded-md border p-3 text-sm",
                  isPick
                    ? released && hasScore
                      ? isCorrect
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                        : "border-destructive/40 bg-destructive/5"
                      : "border-primary/40 bg-primary/5"
                    : "border-border",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="flex-1">{option}</span>
                {isPick && (
                  <Badge variant="outline" className="shrink-0 gap-1">
                    {released && hasScore &&
                      (isCorrect ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      ))}
                    내 선택
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!answered && resolvedOptions.length > 0 && (
        <p className="text-sm text-muted-foreground">선택한 답안이 없습니다.</p>
      )}
    </div>
  );
}
