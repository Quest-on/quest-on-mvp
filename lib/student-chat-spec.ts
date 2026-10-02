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
 *   3. 동작이 바뀌는 곳은 `CURRENT_STUDENT_CHAT_SPEC_ID` 한 줄뿐이다. 포인터 변경은 따로 한 줄 PR 로 낸다.
 *
 * 이 PR 은 모델과 추론 강도를 **바꾸지 않는다.** 모델은 지금처럼 `AI_MODEL`(환경변수 또는 기본값)이
 * 정하고, 추론 강도는 요청에 넘기지 않아 공급사 기본값을 따른다. 아래 `model` 과 `effort` 는 그
 * 현재 동작을 **기록만** 한다. (`__tests__/student-chat-spec.test.ts` 가 기록과 실제가 같은지 본다.)
 */

import { buildStudentChatSystemPrompt, type PromptLanguage } from "@/lib/prompts";

export type StudentChatSpecId = "case@1";

/** 추론 강도를 요청에 넘기지 않는다 = 공급사 기본값. */
export type StudentChatEffort = "unspecified";

export interface StudentChatSpec {
  readonly id: StudentChatSpecId;
  readonly mode: "case";
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
  /** 한 줄 변경 사유 / 보존 사유. */
  readonly note: string;
}

const CASE_V1: StudentChatSpec = Object.freeze({
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
  note: "현행 사례형 출제자 프롬프트(staging b8287303, 2026-10-03 기준)를 바이트 단위로 보존한다.",
});

export const STUDENT_CHAT_SPECS: Readonly<Record<StudentChatSpecId, StudentChatSpec>> = Object.freeze({
  "case@1": CASE_V1,
});

/** 지금 학생에게 적용되는 스펙. 동작이 바뀌는 곳은 여기 한 줄이다. */
export const CURRENT_STUDENT_CHAT_SPEC_ID: StudentChatSpecId = "case@1";

export function getStudentChatSpec(id: StudentChatSpecId): StudentChatSpec {
  const spec = STUDENT_CHAT_SPECS[id];
  if (!spec) {
    throw new Error(`Unknown student chat spec: ${String(id)}`);
  }
  return spec;
}

export function getCurrentStudentChatSpec(): StudentChatSpec {
  return getStudentChatSpec(CURRENT_STUDENT_CHAT_SPEC_ID);
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
    // 빌더와 같은 규칙: en 이 아니면 ko.
    const language = params.language === "en" ? "en" : "ko";
    return {
      spec: spec.id,
      template_sha: spec.renderSha256[language].slice(0, TEMPLATE_SHA_LENGTH),
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
