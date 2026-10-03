/**
 * 학생 시험 채팅 지시문 조립 (이슈 #515)
 *
 * 모델에 실제로 가는 지시문 = 스펙의 프롬프트 빌더 출력 + 자료 검색 결과에 따라 끝에 덧붙이는 문장.
 * 덧붙이는 문장은 `app/api/chat/route.ts` 의 정규 경로와 temp 세션 경로에 같은 글자로 복제돼 있었고,
 * 여기 한 함수로 모았다. **문장은 한 글자도 바꾸지 않았다.** 최종 지시문 SHA-256 은 옮기기 전과
 * 같다 (`__tests__/prompt-assets-lock.test.ts`, `__tests__/chat-route-prompt-stamp.test.ts`).
 *
 * 이 모듈은 순수하다. I/O 가 없고, 학생 메시지와 시각과 난수를 입력으로 받지 않는다.
 * 같은 입력은 항상 같은 지시문이다 — 해시로 잠글 수 있는 이유다.
 *
 * 알려진 충돌 (정리하지 않았다 — 이슈 #515 의 비범위, 별도 결정 사항)
 *   - "자료 없음" 문장은 "수업 자료에 없는 내용을 만들어내지 마세요. 모르면 모른다고 답하세요." 라고 한다.
 *     이 문장은 2026-03-02(380c9d7e)에 route 에 들어갔다.
 *   - 프롬프트 본문(`lib/prompts.ts` 의 [핵심 원칙])은 "알 수 없다" 류 표현을 절대 금지하고, 정보가 없으면
 *     가상 세계 안에서 구체적으로 생성해 답하라고 한다. 이 금지는 2026-04-16(b8524722, 42분 뒤 cbead0d6)에 들어왔다.
 *   - 그래서 자료가 없는 시험(검색 0건)에서는 지시문 앞부분과 끝부분이 서로 반대로 말한다.
 *     지시문 맨 끝의 문장이 어떻게 작용하는지는 측정하지 않았다.
 *   - 정리하면 사례형 시험의 응답이 바뀌므로 이 PR 에서는 하지 않고 현행 그대로 보존한다.
 *     정리할 때는 이 문장이 아니라 새 스펙 버전(`lib/student-chat-spec.ts`)으로 낸다.
 *   - 두 문장은 한국어로 고정이다. 영어 시험(`language: "en"`)에도 한국어 문장이 붙는다. 이것도 현행 그대로다.
 *
 * 역할 분기 (이슈 #519)
 *   - 문항의 AI 역할(`lib/exam-ai-profile.ts`)이 사례형 출제자이거나 주어지지 않으면 **위의 현행 경로를 그대로
 *     호출한다.** 재조립하지 않는다. 사례형 출력은 바이트 단위로 같다.
 *   - 분석 파트너이면 전용 빌더(`analysis-partner@1`)를 부르고 위의 "자료 없음/관련성 낮음" 문장 두 가지를
 *     붙이지 않는다. 그 문장은 "자료에 없으면 모른다고 답하라" 는 사례형 충돌의 한쪽이고, 분석 파트너
 *     본문은 이미 자료에 없는 사실을 만들지 않고 없다고 말하도록 쓰여 있다.
 */

import type { PromptLanguage, RubricItem } from "@/lib/prompts";
import type { ResolvedExamAiProfile } from "@/lib/exam-ai-profile";
import {
  getCurrentAnalysisPartnerSpec,
  getCurrentStudentChatSpec,
  type StudentChatSpecId,
} from "@/lib/student-chat-spec";

/** 이 값 미만이면 "관련성 낮음". route.ts 에 인라인으로 있던 숫자 그대로다. */
const LOW_RELEVANCE_THRESHOLD = 0.3;

const RAG_NOTICE_NO_MATERIALS =
  "\n\n[수업 자료 검색 결과 없음] 이 질문과 관련된 수업 자료를 찾지 못했습니다. 수업 자료에 없는 내용을 만들어내지 마세요. 모르면 모른다고 답하세요.";

const RAG_NOTICE_LOW_RELEVANCE =
  "\n\n[관련성 낮음] 검색된 수업 자료의 관련성이 낮습니다. 답변 시 주의하고, 확신할 수 없는 내용은 추측하지 마세요.";

export type RagNoticeInput = {
  resultsCount: number;
  topSimilarity: number | null;
};

export type RagState = "no_materials" | "low_relevance" | "normal";

/**
 * 자료 검색 상태 판정. route.ts 의 조건을 그대로 옮겼다.
 *   - 검색 결과 0건이면 유사도와 무관하게 자료 없음
 *   - 유사도가 있고 0.3 미만이면 관련성 낮음 (키워드 검색은 유사도가 null 이라 해당 없음)
 */
export function classifyRagState(rag: RagNoticeInput): RagState {
  if (rag.resultsCount === 0) return "no_materials";
  if (rag.topSimilarity !== null && rag.topSimilarity < LOW_RELEVANCE_THRESHOLD) {
    return "low_relevance";
  }
  return "normal";
}

/** 상태별로 지시문 끝에 덧붙는 문장. 정상이면 빈 문자열이다. */
export function buildRagNotice(rag: RagNoticeInput): string {
  switch (classifyRagState(rag)) {
    case "no_materials":
      return RAG_NOTICE_NO_MATERIALS;
    case "low_relevance":
      return RAG_NOTICE_LOW_RELEVANCE;
    default:
      return "";
  }
}

export type StudentChatInstructionsInput = {
  examTitle?: string;
  examCode?: string;
  questionId?: string;
  currentQuestionText?: string;
  currentQuestionAiContext?: string;
  /** 시험 언어. 안 주면 빌더와 같이 ko. */
  language?: PromptLanguage;
  rag: RagNoticeInput & { relevantMaterialsText: string };
  /**
   * 이 문항의 AI 역할 해석 결과(`resolveExamAiProfile`). 안 주면 사례형 출제자(현행)다.
   * 영어 시험의 폴백은 해석 함수가 이미 했다 — 여기서 언어로 다시 판단하지 않는다.
   */
  profile?: ResolvedExamAiProfile;
  /**
   * 학생에게 공개된 평가 기준. 분석 파트너만 쓴다. 사례형은 받아도 쓰지 않는다(현행: 사례형 지시문에
   * 루브릭이 안 간다). 라우트는 아직 이 값을 넘기지 않는다 — 루브릭 공개 연동은 별도 이슈다.
   */
  publicRubric?: RubricItem[];
};

export type StudentChatInstructions = {
  instructions: string;
  /** 이 지시문을 만든 스펙. 응답 기록(`spec`)에 쓴다. */
  specId: StudentChatSpecId;
  /** 실제로 쓴 템플릿 언어(en 이 아니면 ko). 응답 기록(`template_sha`)에 쓴다. */
  language: PromptLanguage;
};

/**
 * 학생 채팅 지시문을 만든다. 정규 세션 경로와 temp 세션 경로가 같이 쓴다.
 *
 * 입력은 호출부가 정해서 넘긴다. 언어를 어디서 조회하는지, 시험 코드를 어떻게 채우는지는
 * 두 경로가 다르고(`app/api/chat/route.ts`) 그 차이는 호출부에 그대로 남아 있다.
 */
export function assembleStudentChatInstructions(
  input: StudentChatInstructionsInput
): StudentChatInstructions {
  const { rag } = input;

  if (input.profile?.role === "analysis_partner") {
    // 분석 파트너는 한국어 본문 하나뿐이고(v1) 자료 검색 경고 문장을 붙이지 않는다.
    const partnerSpec = getCurrentAnalysisPartnerSpec();
    return {
      instructions: partnerSpec.build({
        examTitle: input.examTitle,
        examCode: input.examCode,
        questionId: input.questionId,
        currentQuestionText: input.currentQuestionText,
        currentQuestionAiContext: input.currentQuestionAiContext,
        relevantMaterialsText: rag.relevantMaterialsText,
        rubric: input.publicRubric,
      }),
      specId: partnerSpec.id,
      language: "ko",
    };
  }

  // 사례형 출제자(현행). 아래는 #515 에서 옮긴 그대로다.
  const spec = getCurrentStudentChatSpec();

  const instructions =
    spec.build({
      examTitle: input.examTitle,
      examCode: input.examCode,
      questionId: input.questionId,
      currentQuestionText: input.currentQuestionText,
      currentQuestionAiContext: input.currentQuestionAiContext,
      relevantMaterialsText: rag.relevantMaterialsText,
      language: input.language,
    }) + buildRagNotice(rag);

  return {
    instructions,
    specId: spec.id,
    language: input.language === "en" ? "en" : "ko",
  };
}
