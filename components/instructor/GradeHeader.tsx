import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";
import { useTranslations } from "next-intl";

interface GradeHeaderProps {
  studentName: string;
  submittedAt: string;
  overallScore: number | null;
  examId: string;
  studentNumber?: string;
  school?: string;
  onBackClick?: () => void;
  questionNavigation?: ReactNode;
}

export function GradeHeader({
  studentName,
  submittedAt,
  overallScore,
  examId,
  studentNumber,
  school,
  onBackClick,
  questionNavigation,
}: GradeHeaderProps) {
  const t = useTranslations("grading");
  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={
            onBackClick ||
            (() => {
              window.location.href = `/instructor/${examId}`;
            })
          }
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("gradeHeader.backToExam")}
        </Button>
        {/* <Button
          variant="outline"
          size="sm"
          onClick={onAutoGrade}
          disabled={autoGrading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${autoGrading ? "animate-spin" : ""}`}
          />
          {autoGrading ? "자동 채점 중..." : "자동 채점 다시 실행"}
        </Button> */}
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("gradeHeader.studentGradeTitle", { studentName })}</h1>
          <div className="text-muted-foreground space-y-1 mt-2">
            <p>{t("gradeHeader.submittedAt", { date: new Date(submittedAt).toLocaleString() })}</p>
            {studentNumber && <p>{t("gradeHeader.studentNumber", { number: studentNumber })}</p>}
            {school && <p>{t("gradeHeader.school", { school })}</p>}
          </div>
          {overallScore !== null && (
            <p className="text-lg font-semibold mt-2">
              {t("gradeHeader.overallScore", { score: overallScore })}
            </p>
          )}
          <div className="mt-4">{questionNavigation}</div>
        </div>
      </div>
    </div>
  );
}
