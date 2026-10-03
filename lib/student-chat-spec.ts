/**
 * 학생 시험 채팅 스펙 레지스트리 (이슈 #515)
 *
 * "스펙" 은 학생 채팅 한 호출을 정하는 묶음이다: 프롬프트 빌더, 모델 선택, 추론 강도.
 * 코드가 SSOT 이고 이 파일은 그 사실을 한곳에 적어 둔다. 어느 학생이 어느 스펙으로 답을 받았는지
 * 사후에 말할 수 있게 하는 것이 목적이다 (10/21 정식 시험에서 모두 같은 조건이었음을 증명).
 *
 * 규칙
 *   1. 한 번 낸 버전의 본문, 모델, effort 는 고치지 않는다. 바꾸려면 새 버전(`case@2`)을 추가한다.
 *   2. 프롬프트를 바꾸면 `__tests__/prompt-assets-lock.test.ts` 가 깨진다. 의도한 변경이면
 *      새 스펙 버전을 추가하고 해시와 변경 사유(note)를 함께 갱신한다.
 *   3. 동작이 바뀌는 곳은 포인터 한 줄뿐이다: 사례형은 `CURRENT_STUDENT_CHAT_SPEC_ID`, 분석 파트너는
 *      `CURRENT_ANALYSIS_PARTNER_SPEC_ID`. 포인터 변경은 따로 한 줄 PR 로 낸다.
 *   4. 한 번 낸 버전의 빌더는 새 버전을 낼 때 고정 사본으로 떼어 둔다. 지금 `case@1.build` 는 고정 사본이
 *      아니라 live 함수(`lib/prompts.ts` 의 `buildStudentChatSystemPrompt`)를 가리킨다. 그래서
 *      `prompts.ts` 를 바꾸려면 새 버전(`case@2`)을 만들고, `case@1` 은 옛 빌더를 옮겨 둔 사본을 가리켜야
 *      한다. 그러지 않으면 `case@1` 의 렌더 해시가 어긋나 `prompt-assets-lock.test.ts` 가 깨진다
 *      (그 테스트가 레지스트리의 모든 스펙을 순회하며 `renderSha256` 과 대조한다). 이 PR 은 새 버전이
 *      없어서 사본을 만들지 않았다.
 *   5. `analysis-partner@1` 은 처음부터 위 규칙을 지킨다. `V1` 이름이 붙은 전용 빌더
 *      (`lib/prompts-analysis-partner.ts`)를 가리키고, 그 모듈의 본문과 도구 문단은 이 버전 전용이다.
 *      도구 있음 변형은 `analysis-partner@2` 와 새 빌더로 추가한다.
 *
 * 알려진 한계: 자료 검색 결과에 따라 지시문 끝에 붙는 문장(`lib/chat-instructions.ts` 의 상수)은 아직
 * 스펙 필드가 아니다. 그 문장을 바꿔도 이 레지스트리의 `renderSha256` 과 `template_sha` 는 달라지지
 * 않고, 최종 지시문 해시 잠금(`prompt-assets-lock.test.ts`)만 깨진다. (분석 파트너에는 그 문장이 붙지
 * 않으므로 이 한계가 해당하지 않는다.)
 *
 * 알려진 한계: 버전이 고정하는 것은 **본문**(빌더 안의 문자열)까지다. 지시문 머리에서 시험 제목, 문제, 교수 메모,
 * 자료를 정리하는 `sanitizeForPrompt` 와 길이 상한 `FIELD_MAX_LENGTHS`(`lib/prompts.ts`)는 두 스펙이 함께 쓰는
 * 살아 있는 코드라서, 그 함수를 바꾸면 `case@1` 과 `analysis-partner@1` 의 렌더가 같이 달라진다(해시 잠금이
 * 깨져서 알려 주지만, 버전 번호로 구분되지는 않는다). 그 함수를 바꿀 때는 새 스펙 버전을 함께 낸다.
 *
 * 이 PR 은 모델과 추론 강도를 **바꾸지 않는다.** 모델은 지금처럼 `AI_MODEL`(환경변수 또는 기본값)이
 * 정하고, 추론 강도는 요청에 넘기지 않아 공급사 기본값을 따른다. 아래 `model` 과 `effort` 는 그
 * 현재 동작을 **기록만** 한다. (`__tests__/student-chat-spec.test.ts` 가 기록과 실제가 같은지 본다.)
 */

import { buildStudentChatSystemPrompt, type PromptLanguage } from "@/lib/prompts";
import { buildAnalysisPartnerV1SystemPrompt } from "@/lib/prompts-analysis-partner";

export type CaseStudentChatSpecId = "case@1";
export type AnalysisPartnerStudentChatSpecId = "analysis-partner@1";
export type StudentChatSpecId = CaseStudentChatSpecId | AnalysisPartnerStudentChatSpecId;

/** 추론 강도를 요청에 넘기지 않는다 = 공급사 기본값. */
export type StudentChatEffort = "unspecified";

/** 두 모드가 같은 모델 선택 방식과 추론 강도를 쓴다. 이 필드들은 스펙마다 같은 모양이다. */
interface StudentChatSpecBase {
  readonly id: StudentChatSpecId;
  /**
   * 현재 모델 선택 방식의 기록. 모델을 정하는 것은 이 값이 아니라 `lib/ai-models.ts` 의 `AI_MODEL` 이다.
   * 운영 환경변수 AI_MODEL 이 설정돼 있으면 `defaultModel` 이 아니라 그 값이 쓰인다.
   * 실제로 응답한 모델은 응답 객체의 model 필드로 따로 기록한다(`response_model`).
   */
  readonly model: {
    readonly selection: "env-with-default";
    readonly envVar: "AI_MODEL";
    readonly defaultModel: "gpt-5.6-luna";
    readonly source: "lib/ai-models.ts";
  };
  readonly effort: StudentChatEffort;
  readonly effortLabel: "미지정(공급사 기본값)";
  /** 한 줄 변경 사유 / 보존 사유. */
  readonly note: string;
}

export interface CaseStudentChatSpec extends StudentChatSpecBase {
  readonly id: CaseStudentChatSpecId;
  readonly mode: "case";
  /** 프롬프트 빌더. 현행 함수 그대로다 — 복사하거나 감싸지 않는다. */
  readonly build: typeof buildStudentChatSystemPrompt;
  /**
   * 빌더 출력의 SHA-256 (언어별). 입력은 `prompt-assets-lock.test.ts` 의 전체 입력(FULL_INPUT)이다.
   * 자료 검색 결과에 따라 지시문 끝에 붙는 문장(`lib/chat-instructions.ts`)은 포함하지 않는다.
   * 그 문장은 최종 지시문 해시 잠금이 따로 지킨다.
   */
  readonly renderSha256: {
    readonly ko: string;
    readonly en: string;
  };
}

export interface AnalysisPartnerStudentChatSpec extends StudentChatSpecBase {
  readonly id: AnalysisPartnerStudentChatSpecId;
  readonly mode: "analysis-partner";
  /**
   * `analysis-partner@1` 전용으로 고정된 빌더(`lib/prompts-analysis-partner.ts`). 도구 상태로 문단을 고르는
   * 일반 빌더가 아니라 v1 사본이라, 나중에 도구 있음 변형이 추가돼도 이 버전의 출력은 바뀌지 않는다.
   */
  readonly build: typeof buildAnalysisPartnerV1SystemPrompt;
  /**
   * 빌더 출력의 SHA-256. 입력은 사례형과 같은 전체 입력(FULL_INPUT)이다. 한국어 본문만 있다 —
   * 영어 시험은 `lib/exam-ai-profile.ts` 가 사례형으로 폴백시키므로 `en` 키가 없다.
   */
  readonly renderSha256: {
    readonly ko: string;
    readonly en?: undefined;
  };
}

export type StudentChatSpec = CaseStudentChatSpec | AnalysisPartnerStudentChatSpec;

const CASE_V1: CaseStudentChatSpec = Object.freeze({
  id: "case@1",
  mode: "case",
  model: Object.freeze({
    selection: "env-with-default",
    envVar: "AI_MODEL",
    defaultModel: "gpt-5.6-luna",
    source: "lib/ai-models.ts",
  }),
  effort: "unspecified",
  effortLabel: "미지정(공급사 기본값)",
  build: buildStudentChatSystemPrompt,
  renderSha256: Object.freeze({
    ko: "a9280876b978b02cd24d1637bc8a8a7ab7ee3f55e824f986b0a40d72c5d4f313",
    en: "e3b41726291f5eb5f5f7f10db208a3bfc9d1cb7afa33acf8c60cfa62fa66a620",
  }),
  note: "현행 사례형 출제자 프롬프트(staging 15106bba, 2026-10-03 기준)를 바이트 단위로 보존한다.",
});

const ANALYSIS_PARTNER_V1: AnalysisPartnerStudentChatSpec = Object.freeze({
  id: "analysis-partner@1",
  mode: "analysis-partner",
  model: Object.freeze({
    selection: "env-with-default",
    envVar: "AI_MODEL",
    defaultModel: "gpt-5.6-luna",
    source: "lib/ai-models.ts",
  }),
  effort: "unspecified",
  effortLabel: "미지정(공급사 기본값)",
  build: buildAnalysisPartnerV1SystemPrompt,
  renderSha256: Object.freeze({
    ko: "51256c0ed3a92cfefa9e7a2b0857e561567817ad204637619ef6b6edb6dadbfa",
  }),
  note: "분석 파트너 v1(2026-10-03). 한국어만, 도구 없음 문단. 자료 검색 경고 문장은 붙지 않는다. 문항 ai_role 이 analysis_partner 일 때만 쓴다.",
});

export type StudentChatSpecMap = {
  readonly "case@1": CaseStudentChatSpec;
  readonly "analysis-partner@1": AnalysisPartnerStudentChatSpec;
};

export const STUDENT_CHAT_SPECS: Readonly<StudentChatSpecMap> = Object.freeze({
  "case@1": CASE_V1,
  "analysis-partner@1": ANALYSIS_PARTNER_V1,
});

/** 지금 사례형 학생에게 적용되는 스펙. 동작이 바뀌는 곳은 여기 한 줄이다. */
export const CURRENT_STUDENT_CHAT_SPEC_ID: CaseStudentChatSpecId = "case@1";

/** 지금 분석 파트너 학생에게 적용되는 스펙. 사례형 포인터와 따로 움직인다. */
export const CURRENT_ANALYSIS_PARTNER_SPEC_ID: AnalysisPartnerStudentChatSpecId = "analysis-partner@1";

export function getStudentChatSpec<Id extends StudentChatSpecId>(id: Id): StudentChatSpecMap[Id] {
  const spec = STUDENT_CHAT_SPECS[id];
  if (!spec) {
    throw new Error(`Unknown student chat spec: ${String(id)}`);
  }
  return spec;
}

export function getCurrentStudentChatSpec(): CaseStudentChatSpec {
  return getStudentChatSpec(CURRENT_STUDENT_CHAT_SPEC_ID);
}

export function getCurrentAnalysisPartnerSpec(): AnalysisPartnerStudentChatSpec {
  return getStudentChatSpec(CURRENT_ANALYSIS_PARTNER_SPEC_ID);
}

// ---------------------------------------------------------------------------
// 응답 기록(스탬프)
//
// AI 메시지의 `messages.metadata` 와 `ai_events.metadata` 에 같은 키로 남긴다. DDL 은 없다.
// 이 헬퍼들은 **절대 던지지 않는다.** 기록을 만들다 실패해도 학생 응답은 그대로 나가야 하고,
// 특히 `callTrackedOpenAI` 는 metadataBuilder 가 던지면 성공한 호출을 실패로 기록하고 다시 던진다.
// ---------------------------------------------------------------------------

/** `template_sha` 로 남기는 렌더 해시 앞자리 수. */
export const TEMPLATE_SHA_LENGTH = 16;

export type StudentChatSpecStamp = {
  /** 예: `case@1` */
  spec: StudentChatSpecId;
  /** 렌더 해시 앞 16자. 응답에 쓴 언어의 템플릿이다. */
  template_sha: string;
  effort: StudentChatEffort;
};

export type ResponseModelStamp = {
  /** 응답 객체의 model. 응답에 없으면 요청한 모델명으로 대체한다. */
  response_model: string;
  /** `response`: 응답이 돌려준 값. `request`: 응답에 없어서 요청한 모델명으로 대체한 값. */
  response_model_source: "response" | "request";
};

/**
 * 어느 스펙으로 지시문을 만들었는지의 기록. 요청 전에 정해지므로 호출이 실패해도 남길 수 있다.
 * 만들지 못하면 빈 객체를 돌려준다.
 */
export function buildStudentChatSpecStamp(params: {
  specId: StudentChatSpecId;
  language: PromptLanguage;
}): StudentChatSpecStamp | Record<string, never> {
  try {
    const spec = getStudentChatSpec(params.specId);
    // 빌더와 같은 규칙: en 이 아니면 ko. 영어 템플릿이 없는 스펙(분석 파트너)은 ko 하나뿐이다.
    const renderSha256 =
      params.language === "en" ? (spec.renderSha256.en ?? spec.renderSha256.ko) : spec.renderSha256.ko;
    return {
      spec: spec.id,
      template_sha: renderSha256.slice(0, TEMPLATE_SHA_LENGTH),
      effort: spec.effort,
    };
  } catch {
    return {};
  }
}

/**
 * 응답이 돌려준 모델명의 기록. 별칭 모델이 조용히 바뀌는 것을 사후에 보기 위한 값이다.
 * 응답에서 읽지 못하면(없음, 빈 값, 읽다 던짐) 요청한 모델명으로 대체하고 `request` 로 구분한다.
 */
export function buildResponseModelStamp(
  response: unknown,
  requestedModel: string
): ResponseModelStamp {
  try {
    const model = (response as { model?: unknown } | null | undefined)?.model;
    if (typeof model === "string" && model.trim().length > 0) {
      return { response_model: model, response_model_source: "response" };
    }
  } catch {
    // 읽지 못한 것과 같다. 아래에서 요청한 모델명으로 대체한다.
  }
  return { response_model: requestedModel, response_model_source: "request" };
}
