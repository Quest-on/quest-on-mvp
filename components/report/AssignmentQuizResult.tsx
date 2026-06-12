import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldQuestion } from "lucide-react";

export interface AssignmentQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex?: number;
  rationale?: string;
}

export interface AssignmentQuiz {
  id: string;
  questions: AssignmentQuizQuestion[];
  answers: Record<string, number>;
  score: number | null;
  total_questions: number;
  time_limit_seconds: number;
  started_at: string | null;
  submitted_at: string | null;
  status: string;
}

/**
 * 타임어택 퀴즈 결과(읽기 전용) — 학생 리포트와 마감 과제 열람 뷰에서 공유.
 * 점수/정오답은 퀴즈 자체의 채점 결과이며, 과제 본채점(grades)과는 무관하다.
 */
export function AssignmentQuizResult({ quiz }: { quiz: AssignmentQuiz }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldQuestion className="w-5 h-5 text-amber-600" />
          타임어택 퀴즈 결과
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
            점수 {quiz.score ?? 0}/100
          </Badge>
          <Badge variant="secondary">
            {quiz.total_questions}문항 · {quiz.time_limit_seconds}초
          </Badge>
          {quiz.submitted_at && (
            <span className="text-sm text-muted-foreground">
              완료: {new Date(quiz.submitted_at).toLocaleString("ko-KR")}
            </span>
          )}
        </div>
        <div className="space-y-3">
          {quiz.questions.map((question, index) => {
            const selectedIndex = quiz.answers?.[question.id];
            const correctIndex = question.correctOptionIndex;
            const isCorrect =
              typeof correctIndex === "number" && selectedIndex === correctIndex;

            return (
              <div key={question.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-sm">
                    {index + 1}. {question.question}
                  </p>
                  {typeof correctIndex === "number" && (
                    <Badge
                      variant="outline"
                      className={
                        isCorrect
                          ? "bg-green-500/10 text-green-700 dark:text-green-400"
                          : "bg-red-500/10 text-red-700 dark:text-red-400"
                      }
                    >
                      {isCorrect ? "정답" : "오답"}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  선택:{" "}
                  {typeof selectedIndex === "number"
                    ? question.options[selectedIndex] || "무응답"
                    : "무응답"}
                </p>
                {typeof correctIndex === "number" && (
                  <p className="text-sm text-muted-foreground">
                    정답: {question.options[correctIndex]}
                  </p>
                )}
                {question.rationale && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    근거: {question.rationale}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
