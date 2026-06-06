// Quest-On v7 seed — same as v6 plus streaming-friendly text fields used by
// the SSE typewriter mocks (full AI summary line, full student answer, etc.).
// Mirrors §0 of .omc/research/ui-component-mockup-spec.md, distilled to fields the
// 4 mock components (StudentExamMock, JoinCodeMock, InstructorGradeMock, InstructorExamMock)
// actually need.

// Long-form summary that fully drives the SSE typewriter card in InstructorGradeMock.
export const SEED_AI_SUMMARY_FULL =
  "신규 진입자 위협을 sunk cost 관점에서 명확히 분석했고, 자료 수치(78%)를 인용해 근거를 강화했습니다. 다만 기존 사업자의 보복 시나리오는 다소 약합니다.";

// Compact second answer that the StudentExamMock streams into the answer sheet
// (separate from SEED.student.answer so the typewriter has a tight, tidy phrase).
export const SEED_STUDENT_TYPING_ANSWER =
  "그린휠은 경량화로 사용자 경험을 개선하면서 동시에 배터리 효율을 높여 신규 진입 장벽을 만든다.";

export const SEED = {
  exam: {
    title: "5 Forces 응용 평가",
    code: "FFCTX2",
    durationMinutes: 60,
    questionCount: 3,
    timeRemaining: "32:18",
    studentCount: 12,
  },
  question: {
    number: 2,
    type: "서술형",
    points: 30,
    text: "그린휠은 5 Forces 모델을 적용했을 때 신규 진입자 위협을 어떻게 분석하는가?",
  },
  student: {
    name: "이학생 #03",
    initials: "03",
    answer:
      "그린휠은 경량화 프레임 기술과 OTA 업데이트로 사용자 경험을 개선하면서, 동시에 충전 인프라를 자체 구축해 진입 장벽을 높이고 있다. 신규 진입자는 (1) 배터리 공급망, (2) 도심 라이딩 데이터, (3) 정비 네트워크의 세 축에서 후발 비용을 부담해야 한다…",
  },
  instructor: { name: "이 교수", initials: "이" },
  chat: [
    {
      role: "student",
      text: "5 Forces 중 신규 진입자 위협을 어떻게 분석하면 좋을까요?",
      time: "14:32",
    },
    {
      role: "ai",
      text: "먼저 진입 장벽의 크기와 기존 사업자의 보복 가능성, 두 축으로 나눠 보세요. 그린휠 케이스에서는 충전 인프라가 sunk cost 형태의 진입장벽이 됩니다.",
      time: "14:32",
    },
    {
      role: "student",
      text: "충전 인프라를 진입 장벽으로 보는 근거가 더 있을까요?",
      time: "14:34",
    },
  ],
  rubric: [
    { area: "자료 활용", score: 88, max: 100 },
    { area: "추론 전개", score: 92, max: 100 },
    { area: "최종 답안", score: 84, max: 100 },
  ],
  finalScore: 87,
  aiSummary: {
    summary:
      "신규 진입자 위협을 sunk cost 관점에서 명확히 분석했고, 자료 수치(78%)를 인용해 근거를 강화했습니다. 다만 기존 사업자의 보복 시나리오는 다소 약합니다.",
    quotes: [
      "충전 인프라가 sunk cost 형태의 진입장벽",
      "도심 30km 반경 충전소 확보율 78%",
    ],
    strengths: ["자료의 핵심 수치를 정확히 인용", "진입 장벽의 구조를 3축으로 정리"],
    weaknesses: ["기존 사업자 보복 시나리오 부족", "대체재 위협과의 연결 약함"],
  },
  studentRoster: [
    {
      id: "03",
      name: "이학생 #03",
      status: "completed" as const,
      score: 87,
      sub: "20231003 · 경영대학",
    },
    {
      id: "02",
      name: "김학생 #02",
      status: "completed" as const,
      score: 92,
      sub: "20231002 · 경영대학",
    },
    {
      id: "05",
      name: "박학생 #05",
      status: "in-progress" as const,
      score: null,
      sub: "20231005 · 경영대학",
    },
    {
      id: "07",
      name: "최학생 #07",
      status: "completed" as const,
      score: 73,
      sub: "20231007 · 경영대학",
    },
  ],
  kpis: [
    { label: "평균 점수", value: 78, suffix: "점" },
    { label: "평균 답안 길이", value: 1240, suffix: "자" },
    { label: "평균 응시 시간", value: 42, suffix: "분" },
    { label: "평균 질문 수", value: 5.3, suffix: "개" },
  ],
} as const;

export type SeedShape = typeof SEED;
