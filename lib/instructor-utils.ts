import type { InstructorExam } from "@/lib/types/exam";

/**
 * 강사 시험 대시보드 학생 목록의 로딩 스켈레톤 표시 여부.
 *
 * 스켈레톤은 "보여줄 데이터가 아직 없는 최초 로드"에서만 노출해야 한다.
 * React Query의 `isFetching`(백그라운드 폴링 재요청)을 판정에 넣으면, closed 시험의
 * 10초 폴링마다 목록이 스켈레톤으로 교체됐다 복귀하면서 스크롤 컨테이너가 리마운트되어
 * 스크롤이 맨 위로 튀고 화면이 깜빡인다. 따라서 `isFetching`이 아니라
 * `isLoading`(=캐시 데이터 없음 && 요청 중)만 사용한다.
 *
 * @param examLoading 시험 상세 최초 로딩 여부
 * @param summariesLoading 학생 요약 React Query `isLoading` (백그라운드 `isFetching` 아님)
 */
export function shouldShowStudentListSkeleton(params: {
  examLoading: boolean;
  summariesLoading: boolean;
}): boolean {
  return params.examLoading || params.summariesLoading;
}

interface InstructorQuestion {
  id: string;
  text: string;
  type: string;
}

export function buildInstructorExamContext(
  exam: InstructorExam,
  questions: InstructorQuestion[] = []
): string {
  const total = exam.students?.length ?? 0;
  const completed = exam.students?.filter(
    (s) => s.status === "completed"
  ).length;
  const inProgress = exam.students?.filter(
    (s) => s.status === "in-progress"
  ).length;
  const notStarted = exam.students?.filter(
    (s) => s.status === "not-started"
  ).length;
  const graded = exam.students?.filter((s) => s.isGraded).length ?? 0;
  const hasScores = exam.students?.filter(
    (s) => typeof s.score === "number"
  ).length;

  const questionsPreview = questions
    .slice(0, 12)
    .map((q, i) => `${i + 1}. (${q.type}) ${q.text}`)
    .join("\n");

  return [
    `시험 제목: ${exam.title}`,
    `시험 코드: ${exam.code}`,
    `시험 상태: ${exam.status}`,
    `시험 시간: ${exam.duration}분`,
    exam.description ? `시험 설명: ${exam.description}` : "",
    `문항 수: ${questions.length}`,
    questionsPreview ? `문항(일부):\n${questionsPreview}` : "",
    `학생 수: ${total} (완료 ${completed}, 진행중 ${inProgress}, 미시작 ${notStarted})`,
    `최종채점 완료: ${graded}`,
    `가채점 점수 보유: ${hasScores}`,
  ]
    .filter(Boolean)
    .join("\n");
}
