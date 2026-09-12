/**
 * 교수자 시험 상세 화면이 지금 어느 단계인지 판정한다.
 *
 * 한 화면이 서로 다른 세 가지 일을 맡고 있었다.
 *
 *   배포 — 코드를 학생에게 뿌리고 시험을 시작한다
 *   감독 — 누가 들어왔고 어디까지 왔는지 본다
 *   검수 — 채점하고 결과를 내보낸다
 *
 * 그런데 레이아웃은 마지막 것 모양으로 고정돼 있었다. 그래서 갓 만든 시험에서도
 * 빈 학생 목록이 화면의 절반을 먹고, 검색창·정렬·새로고침이 0행 위에 떠 있고,
 * 정작 지금 필요한 문항 본문과 입장 코드는 접힌 아코디언 뒤에 있었다.
 *
 * **판정을 순수 함수로 빼는 이유.** 화면 안에서 계산하면 "학생이 있는데 setup 으로
 * 떨어져 목록 도구가 통째로 사라지는" 회귀를 테스트로 막을 수 없다. 그건 교수자가
 * 30명을 검색·정렬하지 못하게 되는 사고다. 여기 있으면 결정적 테스트로 박을 수 있다.
 */
export type ExamDetailPhase = "setup" | "live" | "review";

export type ExamDetailPhaseInput = {
  /** `exams.status`. draft / scheduled / joinable / running / entry_closed / closed */
  status: string | null | undefined;
  /** 이 시험에 들어온 학생 수. */
  studentCount: number;
  /**
   * 학생 요약을 실제로 받아왔는가.
   *
   * 아직이면 `studentCount: 0` 을 "학생이 없다"로 믿지 않는다. 믿으면 학생 25명짜리
   * 시험을 열 때마다 첫 페인트가 setup(도구 숨김)으로 갔다가 목록이 도착하면서
   * live 로 튄다 — 매번 눈에 보이는 레이아웃 점프다.
   */
  studentsLoaded?: boolean;
};

export function resolveExamDetailPhase(input: ExamDetailPhaseInput): ExamDetailPhase {
  const status = input.status ?? "";
  const studentCount = Number.isFinite(input.studentCount)
    ? Math.max(0, input.studentCount)
    : 0;

  // 종료된 시험은 배포도 감독도 끝났다. 남은 일은 채점과 내보내기뿐이다.
  if (status === "closed") return "review";

  // 한 명이라도 들어왔으면 배포 단계는 지났다. 이 판정이 status 보다 앞서는
  // 이유: draft 로 남은 채 학생이 들어오는 경로가 실제로 있다(한도 조회
  // 실패 시 fail-open 입장). 그때 setup 으로 떨어지면 목록 도구가 사라진다.
  if (studentCount > 0) return "live";

  if (status === "running" || status === "entry_closed") return "live";

  // 아직 모를 때는 도구를 숨기지 않는다. 없던 것이 나타나는 편이, 있던 것이
  // 사라지는 것보다 낫다. 단 draft 는 예외다 — 한 번도 발행된 적 없는 시험이
  // 대부분이고, 거기서 깜빡임을 만들면 첫 화면이 매번 흔들린다.
  if (input.studentsLoaded === false && status !== "draft") return "live";

  return "setup";
}
