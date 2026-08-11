/**
 * 온보딩 데모 시험 템플릿 (Epic #79 / 이슈 #82 / 스펙 AC-5, AC-6).
 *
 * 신규 교수자가 가입 직후 마주하는 건 빈 대시보드다. Gradescope 가 데모 코스를
 * 기본으로 깔아주는 이유도 같다 — 첫 화면에 만질 게 없으면 아무것도 안 하고 나간다.
 *
 * **AI 호출 0회가 인수 조건이다.** 그래서 생성물은 여기 고정된 텍스트다.
 * 엉터리 생성물로 첫인상을 망치지 않고, 미인증 계정에 AI 비용을 노출하지도 않는다.
 * AI 기반 데모 재생성은 데모 완주 후 개방된다(#83).
 *
 * ## 왜 DB 시드가 아니라 코드인가
 *
 * 계획 단계에서는 `copyExam` 재사용을 상정했지만, 그 함수는 원본을
 * `.eq("instructor_id", user.id)` 로 좁힌다 — 자기 소유 시험만 복제할 수 있다.
 * DB 에 템플릿 exam 을 심으려면 (1) 가짜 소유자 계정과 (2) 소유자를 건너뛰는
 * 복제 경로가 필요하고, 후자는 "남의 시험을 복제할 수 있는 길"을 새로 여는 것이다.
 * 온보딩 편의를 위해 인가 구멍을 만들 이유가 없다. 템플릿을 코드에 두면 복제
 * 의미론은 그대로면서 새 공격면이 0이다.
 *
 * ## 언어
 *
 * 시험 본문은 UI 문구가 아니라 **콘텐츠**라 next-intl 메시지에 넣지 않는다.
 * 대신 템플릿이 ko/en 을 함께 들고 있고, 생성 시 교수자의 로케일로 고른다.
 */

/** JTBD 1번: 무엇을 평가하는가. */
/**
 * JTBD 2번: 담당 과목 계열.
 *
 * 학과 단위로 쪼개면 목록이 길어져 온보딩 완료율이 떨어진다(문항당 10~15% 하락).
 * 데모 한 벌을 고르는 데 필요한 최소 해상도까지만 나눈다.
 */
export const SUBJECT_CATEGORIES = [
  "humanities",
  "business",
  "engineering",
  "health",
  "general",
] as const;
export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

export function isSubjectCategory(value: unknown): value is SubjectCategory {
  return SUBJECT_CATEGORIES.includes(value as SubjectCategory);
}

export type DemoLanguage = "ko" | "en";

type LocalizedText = Record<DemoLanguage, string>;

type SubjectContent = {
  /** 데모 시험 제목 */
  title: LocalizedText;
  /** 학생에게 보이는 문항 본문 */
  prompt: LocalizedText;
  /** 채점 기준 — AI 채점 결과 열람(#83 데모 완주)의 근거가 된다 */
  rubric: LocalizedText;
};

const SUBJECT_CONTENT: Record<SubjectCategory, SubjectContent> = {
  humanities: {
    title: {
      ko: "[데모] 사회 현상 분석",
      en: "[Demo] Analyzing a Social Phenomenon",
    },
    prompt: {
      ko: "최근 10년간 1인 가구 비율이 빠르게 늘었습니다. 이 변화가 지역 공동체에 미치는 영향을 한 가지 고르고, 그렇게 판단한 근거와 반론 가능성을 함께 서술하세요.",
      en: "Single-person households have grown rapidly over the past decade. Pick one effect this has on local communities, then argue for it and state the strongest counterargument.",
    },
    rubric: {
      ko: "1) 영향을 하나로 좁혀 명확히 진술했는가 2) 근거가 주장과 실제로 연결되는가 3) 반론을 형식적으로 언급하는 데 그치지 않고 다뤘는가",
      en: "1) States one specific effect 2) Evidence actually supports the claim 3) Engages the counterargument instead of name-dropping it",
    },
  },
  business: {
    title: {
      ko: "[데모] 가격 결정 사례 분석",
      en: "[Demo] Pricing Decision Case",
    },
    prompt: {
      ko: "구독형 서비스를 운영하는 스타트업이 월 9,900원에서 14,900원으로 가격을 올리려 합니다. 이탈률 상승을 감수할 만한 조건은 무엇인지, 어떤 지표로 판단할지 서술하세요.",
      en: "A subscription startup plans to raise its price from $9 to $14 per month. Describe the conditions under which the resulting churn is acceptable, and which metrics would tell you.",
    },
    rubric: {
      ko: "1) 판단 조건을 임의 서술이 아니라 지표로 표현했는가 2) 이탈률과 매출의 관계를 구체적으로 다뤘는가 3) 판단이 틀렸을 때의 신호를 제시했는가",
      en: "1) Expresses the condition as a metric, not a vibe 2) Connects churn to revenue concretely 3) Names the signal that would falsify the decision",
    },
  },
  engineering: {
    title: {
      ko: "[데모] 시스템 설계 트레이드오프",
      en: "[Demo] System Design Trade-off",
    },
    prompt: {
      ko: "동시 접속자가 급증하는 서비스에서 읽기 성능을 높이기 위해 캐시를 도입하려 합니다. 이때 발생하는 데이터 정합성 문제를 하나 고르고, 어떤 상황에서 그 문제를 감수할 수 있는지 서술하세요.",
      en: "You are adding a cache to improve read performance under a traffic spike. Pick one consistency problem this introduces and explain when that problem is acceptable to live with.",
    },
    rubric: {
      ko: "1) 정합성 문제를 구체적 시나리오로 서술했는가 2) 감수 조건이 서비스 요구사항과 연결되는가 3) 대안을 검토하고 왜 배제했는지 밝혔는가",
      en: "1) Describes the consistency problem as a concrete scenario 2) Ties the acceptable condition to product requirements 3) Considers an alternative and says why it was rejected",
    },
  },
  health: {
    title: {
      ko: "[데모] 임상 판단 근거 서술",
      en: "[Demo] Justifying a Clinical Judgment",
    },
    prompt: {
      ko: "동일한 증상을 보이는 두 환자에게 다른 처치를 결정해야 하는 상황을 가정하고, 판단을 가르는 기준이 무엇인지와 그 기준을 확인하기 위해 무엇을 먼저 확인할지 서술하세요.",
      en: "Two patients present with the same symptom but require different care. Explain what distinguishes the decision and what you would check first to confirm it.",
    },
    rubric: {
      ko: "1) 판단 기준을 하나로 특정했는가 2) 확인 순서에 우선순위 근거가 있는가 3) 오판 시 위험을 인지하고 서술했는가",
      en: "1) Identifies one decisive criterion 2) Gives a reason for the order of checks 3) Acknowledges the risk of getting it wrong",
    },
  },
  general: {
    title: {
      ko: "[데모] 주장과 근거 서술",
      en: "[Demo] Claim and Evidence",
    },
    prompt: {
      ko: "최근 수업에서 다룬 주제 하나를 고르고, 그에 대한 자신의 주장과 근거를 서술하세요. 반대 입장에서 나올 수 있는 지적도 함께 다루세요.",
      en: "Pick one topic from a recent class. State your claim with supporting evidence, and address the strongest objection to it.",
    },
    rubric: {
      ko: "1) 주장이 한 문장으로 분명한가 2) 근거가 주장을 실제로 지지하는가 3) 반대 지적을 회피하지 않았는가",
      en: "1) The claim is stated in one clear sentence 2) Evidence actually supports it 3) Does not dodge the objection",
    },
  },
};

export type DemoTemplate = {
  title: string;
  /** `exams.type` 값. 데모는 시험만 만든다 — 아래 주석 참조. */
  examType: "exam";
  /** 분 단위 */
  duration: number;
  questionText: string;
  rubric: string;
  assignmentPrompt: string | null;
};

/**
 * 과목으로 템플릿 한 벌을 고른다 (AC-5).
 *
 * 알 수 없는 값이면 `general` 로 떨어진다 — 온보딩이 입력값 때문에 멈추면 안 된다.
 * 건너뛴 교수자(AC-6)도 같은 경로로 기본 템플릿을 받는다.
 *
 * **과제형 데모는 만들지 않는다.** 만들 수는 있었지만 교수자가 그걸 학생 시점으로
 * 겪을 경로가 없다 — `useAssignmentSession` 은 데모 미리보기를 모르고, 응시
 * (`/assignment/{code}`)·완주 판정·제출 후 필수 quiz 가 시험과 완전히 다른
 * 흐름이다. 즉 겪을 수 없는 데모가 생긴다. UI 에서만 숨기면 API 를 직접 부르는
 * 경로로 여전히 만들어지므로 계약에서 뺐다. 과제 응시에 미리보기가 붙으면
 * 그때 되살린다.
 */
export function selectDemoTemplate(params: {
  subject?: unknown;
  language?: DemoLanguage;
}): DemoTemplate {
  const subject: SubjectCategory = isSubjectCategory(params.subject)
    ? params.subject
    : "general";
  const language: DemoLanguage = params.language === "en" ? "en" : "ko";

  const content = SUBJECT_CONTENT[subject];

  return {
    title: content.title[language],
    examType: "exam",
    // 데모는 짧게 끝나야 한다 — 목적은 완주지 시간 압박 체험이 아니다.
    duration: 20,
    questionText: content.prompt[language],
    rubric: content.rubric[language],
    assignmentPrompt: null,
  };
}
