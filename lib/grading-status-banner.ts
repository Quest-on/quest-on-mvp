/**
 * 채점 화면 'AI 채점 상태' 배너가 무엇을 보일지 정한다 (이슈 #575).
 *
 * 시험 채점 화면과 과제 채점 화면이 같은 판정을 쓴다. 판정만 여기 두고 그리는 건 각 화면이 한다.
 *
 * - `in_progress`: 채점 큐가 돌고 있다(queued/running). 진행률을 보인다.
 * - `failed`: 채점이 실패했다(진행률 실패 또는 `ai_failed` 행). 재채점 단추를 보인다.
 * - `absent`: 제출했는데 채점 결과가 하나도 없다. 재채점 단추를 보인다.
 * - `awaiting_submission`: 아직 제출하지 않았다. 채점은 제출할 때 시작되므로 결과가 없는 게 정상이다.
 *   실패로 알리지 않고 재채점 단추도 두지 않는다. 시험이 열려 있으면 재채점 요청은 409 로 거절되고,
 *   채점이 열려 있더라도 응시 중인 답을 채점하게 된다.
 * - `none`: 보일 것이 없다(채점 결과가 있다).
 *
 * 검사 순서가 곧 우선순위다. 제출 여부는 결과가 하나도 없을 때만 본다. 제출 전이라도 채점이 진행 중이거나
 * 실패 기록이 있으면 지금처럼 그것을 알린다.
 *
 * 제출 여부는 `sessions.submitted_at` 으로 본다. 채점 GET 라우트(`/api/session/[sessionId]/grade`)가
 * 내려주는 값 중 제출을 말하는 것은 이것뿐이다(`sessions.status` 는 내려주지 않는다). 학생 제출,
 * 시간 만료와 강제 종료의 자동 제출, 과제 퀴즈 완료와 마감 자동 제출이 모두 상태를 바꾸면서 이 값을 함께 채운다.
 *
 * React 의존성이 없어 단위 테스트가 가능하다.
 */
import type { GradingProgress } from "@/lib/types/grading";

export type GradingStatusBanner =
  | "none"
  | "in_progress"
  | "failed"
  | "absent"
  | "awaiting_submission";

export function resolveGradingStatusBanner(input: {
  /** 제출 시각. 아직 제출하지 않았으면 null 이다. */
  submittedAt: string | null;
  gradingProgress: Pick<GradingProgress, "status"> | null | undefined;
  grades: ReadonlyArray<{ grade_type?: string }>;
  overallScore: number | null;
}): GradingStatusBanner {
  const status = input.gradingProgress?.status;
  if (status === "queued" || status === "running") return "in_progress";

  const hasAiFailed = input.grades.some((g) => g.grade_type === "ai_failed");
  if (status === "failed" || hasAiFailed) return "failed";

  const noGradesAtAll = input.overallScore === null && input.grades.length === 0;
  if (!noGradesAtAll) return "none";

  return input.submittedAt ? "absent" : "awaiting_submission";
}
