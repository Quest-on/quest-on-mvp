/**
 * CASE 세션/문항 종합평가 프롬프트 variant 선택.
 *
 * 환경변수 CASE_SUMMARY_PROMPT_VARIANT: v1(기본) | v4 | v5 | v6
 * 로컬 실험: .env.local 에 CASE_SUMMARY_PROMPT_VARIANT=v6
 *
 * 적용 범위:
 * - sessions.ai_summary (CASE 1개 시험의 세션 종합평가)
 * - grades.ai_summary (CASE 2개 이상 시험의 문항별 평가)
 */
import { buildSummaryEvaluationSystemPrompt } from "../prompts";
import {
  buildExperimentalSummarySystemPromptV4,
  buildExperimentalExamSessionSummaryUserPromptV4,
} from "./case-summary-experimental-v4";
import {
  buildExperimentalSummarySystemPromptV5,
  buildExperimentalExamSessionSummaryUserPromptV5,
} from "./case-summary-experimental-v5";
import {
  buildExperimentalSummarySystemPromptV6,
  buildExperimentalExamSessionSummaryUserPromptV6,
} from "./case-summary-experimental-v6";

export type CaseSummaryPromptVariant = "v1" | "v4" | "v5" | "v6";

export type CaseSessionSummaryUserPromptParams = {
  examTitle: string;
  rubricText: string;
  questionsText: string;
  delegationPreCheckHint?: string;
};

export function getCaseSummaryPromptVariant(): CaseSummaryPromptVariant {
  const raw = process.env.CASE_SUMMARY_PROMPT_VARIANT?.trim().toLowerCase();
  if (raw === "v4" || raw === "v5" || raw === "v6") {
    return raw;
  }
  return "v1";
}

export function usesSummaryDelegationPreCheckHint(): boolean {
  const variant = getCaseSummaryPromptVariant();
  return variant === "v4" || variant === "v6";
}

function buildProductionExamSessionSummaryUserPrompt(
  params: CaseSessionSummaryUserPromptParams,
): string {
  const { examTitle, rubricText, questionsText } = params;
  return `
      시험 제목: ${examTitle}

      ${rubricText}

      [학생의 CASE 답안, CASE 관련 채팅 대화 기록 및 점수]
      ${questionsText}

      [범용 평가 엄격화 가이드]
      - 질문의 '논리적 구조'와 '내용의 사실 관계'를 분리하여 평가하십시오.
      - 아래 5가지 행동 패턴이 발견되면 '이해도 부족'으로 간주하여 엄격히 평가합니다.
        사용된 표현의 형식(직접적/우회적/공손한)과 무관하게, 행동의 의도로 판단합니다:
        1) **답/풀이 위임형**: 자신의 분석 없이 AI에게 정답, 풀이법, 접근법, 프레임워크 선택을 요청. "어떻게 풀어?"든 "일반적으로 어떤 접근이 통용되나요?"든 의도가 동일하면 동일하게 판단.
        2) **출발점 의존형**: 어디서 시작해야 하는지, 어떤 개념을 써야 하는지를 AI에게 물어봄. 스스로 진입점을 잡지 못함.
        3) **조건/수치 변형형**: 시나리오에 명시된 수치/조건을 임의로 다른 값으로 바꿔서 질문하거나 답안에 사용.
        4) **개념 역전형**: 핵심 인과관계, 정의, 방향성을 거꾸로 이해하여 질문하거나 답안 작성.
        5) **교정 미반영형**: AI가 오류를 교정했음에도 최종 답안이 동일한 오류를 그대로 포함.
      - 질문의 양이 많더라도, 그 질문들이 문제의 본질(Core Task)에서 벗어난 지엽적인 것이라면 '자기주도적 학습 역량' 점수를 높게 주지 마십시오.
      - 직접 답변을 받은 사실 자체는 금지 위반이 아닙니다. 그러나 이후 독립 추론이 약하면 엄격히 감점하고, 회복이 확인되면 그 회복 근거를 분명히 적으십시오.
      - 학생이 주어지지 않은 정보를 논리적으로 가정(Assume)하여 논의를 진전시키는 경우에는 이를 '문제 해결을 위한 창의적 접근'으로 보아 긍정적으로 평가하십시오.
        다만, 이러한 가정이 문제에 이미 명시된 조건을 부정하는 용도로 쓰인다면 예외 없이 엄격하게 감점하십시오.

      [이해도 과대평가 방지 상한 규칙(매우 중요)]
      - 위 5가지 행동 패턴 중 하나라도 1회 이상 발견되었고,
        학생이 이후에 스스로 '개념 선택 + 조건/가정 정리 + 중간 추론/검증'을 모두 보여주지 못했다면 sentiment는 절대 positive로 주지 마세요.
      - 행동 패턴이 반복되거나, 개념 역전형 또는 교정 미반영형이 확인되면 negative를 우선하세요(회복이 매우 강한 경우만 neutral).

      위 내용을 바탕으로 학생의 CASE 수행 능력을 상세하게 분석하여 요약 평가해주세요.
      **중요**: CASE 관련 채팅 대화 기록이 있는 경우, 학생이 AI와의 대화에서 보여준 질문의 질, 문제 이해도, 개념 파악 수준, 학습 태도 등을 종합적으로 고려하세요. 사지선다와 O/X 문제는 이 종합 평가의 근거로 사용하지 마세요.

      다음 항목을 반드시 포함해야 합니다:
      1. 전체적인 평가 (긍정적/부정적/중립적)
      2. 종합 의견: 학생의 CASE 답안과 CASE 관련 채팅 대화 기록을 종합하여 깊이 있게 분석. 답안의 논리성, 정확성, 창의성뿐만 아니라 채팅에서 보여준 학습 과정과 이해도도 함께 고려하세요.
      3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요. 채팅에서 보여준 질문의 질도 강점으로 포함할 수 있습니다.
      4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요. 채팅에서 드러난 문제 이해 부족이나 개념 파악의 어려움을 포함하세요.
      5. 핵심 인용구 (2가지): 학생의 답안 또는 채팅 대화 중 평가에 결정적인 영향을 미친 문장이나 구절을 2개 뽑아주세요.
         - 감점 트리거가 있다면 2개 중 최소 1개는 그 문장을 반드시 원문 그대로 인용하세요.

      JSON 형식으로 응답해주세요:
      {
        "sentiment": "positive" | "negative" | "neutral",
        "summary": "상세한 종합 의견 텍스트",
        "strengths": ["강점1", "강점2", ...],
        "weaknesses": ["약점1", "약점2", ...],
        "keyQuotes": ["인용구1", "인용구2"]
      }`.trim();
}

export function buildCaseSessionSummarySystemPrompt(): string {
  switch (getCaseSummaryPromptVariant()) {
    case "v4":
      return buildExperimentalSummarySystemPromptV4();
    case "v5":
      return buildExperimentalSummarySystemPromptV5();
    case "v6":
      return buildExperimentalSummarySystemPromptV6();
    default:
      return buildSummaryEvaluationSystemPrompt();
  }
}

export function buildCaseSessionSummaryUserPrompt(
  params: CaseSessionSummaryUserPromptParams,
): string {
  switch (getCaseSummaryPromptVariant()) {
    case "v4":
      return buildExperimentalExamSessionSummaryUserPromptV4(params);
    case "v5":
      return buildExperimentalExamSessionSummaryUserPromptV5(params);
    case "v6":
      return buildExperimentalExamSessionSummaryUserPromptV6(params);
    default:
      return buildProductionExamSessionSummaryUserPrompt(params);
  }
}
