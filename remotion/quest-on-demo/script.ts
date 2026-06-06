export const theme = {
  ink: "#f8fafc",
  muted: "#b6c5d6",
  line: "rgba(226,232,240,0.18)",
  blue: "#3b82f6",
  cyan: "#22d3ee",
  mint: "#34d399",
  amber: "#fbbf24",
  red: "#fb7185",
  violet: "#a78bfa",
};

export const scenes = {
  hook: {
    kicker: "QUEST-ON",
    title: "AI 시대,",
    highlight: "시험은 어떻게 달라져야 할까",
    subtitle:
      "Quest-On은 AI를 막는 대신 평가의 일부로 끌어들입니다.",
    promise: "60초 제품 워크스루 — 강사 설계 · 학생 응시 · 과정 평가",
    staggerLine: "결과가 아니라 사고 과정",
  },
  problem: {
    kicker: "TODAY'S CLASSROOM",
    title: "지금 강의실은",
    highlight: "두 개의 벽 사이에 갇혀 있다",
    bulletA: {
      label: "AI 차단",
      body: "감독·차단에 들어가는 시간만큼 평가의 의미가 흐려진다",
      color: "#fb7185",
    },
    bulletB: {
      label: "결과만 채점",
      body: "어떻게 답에 도달했는지는 누구도 알 수 없다",
      color: "#fbbf24",
    },
    closing: "그렇다면, 과정을 보이게 만들면 어떨까",
  },
  instructor: {
    kicker: "INSTRUCTOR",
    title: "강사는 자료를 올리고",
    highlight: "평가를 설계합니다",
    subtitle: "문항 생성 · 루브릭 설계 · 시험 코드 공유까지 한 흐름.",
    cards: [
      {
        label: "01",
        title: "강의 자료 업로드",
        body: "PDF, 슬라이드, 평가 기준을 시험 맥락으로 정리",
        color: "#22d3ee",
      },
      {
        label: "02",
        title: "AI 문항·루브릭 생성",
        body: "암기보다 추론 단계를 평가하도록 자동 설계",
        color: "#a78bfa",
      },
      {
        label: "03",
        title: "시험 코드 공유",
        body: "학생은 코드로 입장, 동일한 평가 흐름을 시작",
        color: "#34d399",
      },
    ],
    detail: "AI 루브릭 제안",
    detail2: "시험 코드 배포",
  },
  student: {
    kicker: "STUDENT",
    title: "학생은 AI와 대화하며",
    highlight: "답을 완성합니다",
    subtitle: "AI 튜터는 답을 대신 쓰는 도구가 아닌 사고를 밀어주는 파트너.",
    question: "Q2. 경량화가 전기 자전거 사용자 경험에 미치는 영향을 설명하세요.",
    answerDraft:
      "그린휠의 경량화는 이동 편의성뿐 아니라 배터리 효율과 주행 안정성에도 영향을 준다…",
    messages: [
      {
        role: "student",
        text: "경쟁사 대비 그린휠은 어떤 점에서 가벼운가요?",
      },
      {
        role: "ai",
        text: "자료의 무게 지표를 비교하고, 경량화가 주행 효율에 미치는 영향을 근거로 정리해보세요.",
      },
      {
        role: "student",
        text: "그럼 배터리 수명과 사용자 경험까지 연결해 답안을 구성해볼게요.",
      },
    ],
    calloutLabel: "AI 대화가 평가 근거로 남음",
  },
  evidence: {
    kicker: "PROCESS EVIDENCE",
    title: "Quest-On은",
    highlight: "답안 뒤의 과정을 남깁니다",
    panels: [
      {
        title: "최종 답안",
        body: "학생이 제출한 응답과 수정 흐름",
        metric: "3회 수정",
        color: "#34d399",
        preview: ["v1 근거 부족", "v2 배터리 효율 추가", "v3 최종 논리 완성"],
      },
      {
        title: "AI 대화",
        body: "어떤 질문을 했고 어떤 도움을 받았는지",
        metric: "12개 메시지",
        color: "#22d3ee",
        preview: ["질문: 비교 기준?", "AI: 자료 근거 확인", "학생: UX까지 연결"],
      },
      {
        title: "활동 신호",
        body: "복사·붙여넣기·외부 입력 등 의심 신호",
        metric: "주의 2건",
        color: "#fb7185",
        preview: ["외부 붙여넣기 1회", "탭 전환 1회", "내부 복사 정상"],
      },
    ],
  },
  wow: {
    kicker: "AI + INSTRUCTOR REVIEW",
    title: "AI가 먼저 채점하고",
    highlight: "강사가 확정합니다",
    subtitle: "루브릭별 점수와 강점, 의심 신호까지 — 설명 가능한 평가.",
    targetScore: 88,
    rubrics: [
      { name: "자료 근거 활용", score: 88 },
      { name: "추론 과정", score: 92 },
      { name: "최종 답안 완성도", score: 84 },
    ],
    strength: "강점: 자료 근거와 AI 대화를 활용해 최종 논리를 스스로 재구성",
    confirmCta: "강사 확정",
    reviewCta: "근거 보기",
    impactLine: "사고 과정이 점수가 됩니다",
  },
  cta: {
    title: "Quest-On",
    subtitle: "결과보다 사고 과정을 평가하세요",
    tagline: "AI 시대의 시험을, 설명 가능한 데이터로",
    footer: "quest-on.app",
  },
};
