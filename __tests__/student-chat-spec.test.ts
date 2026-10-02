/**
 * 학생 시험 채팅 스펙 레지스트리 (이슈 #515)
 *
 * 규칙: 한 번 낸 스펙 버전은 고치지 않는다. 바꾸려면 새 버전을 추가한다.
 * 이 테스트는 레지스트리의 모양과 불변성, 응답 기록(스탬프) 헬퍼를 고정한다.
 * 렌더 해시가 실제 프롬프트 출력과 같은지는 `prompt-assets-lock.test.ts` 가 본다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStudentChatSystemPrompt } from "@/lib/prompts";
import {
  CURRENT_STUDENT_CHAT_SPEC_ID,
  STUDENT_CHAT_SPECS,
  TEMPLATE_SHA_LENGTH,
  buildResponseModelStamp,
  buildStudentChatSpecStamp,
  getCurrentStudentChatSpec,
  getStudentChatSpec,
} from "@/lib/student-chat-spec";

describe("스펙 레지스트리", () => {
  it("현재는 case@1 하나뿐이다", () => {
    expect(Object.keys(STUDENT_CHAT_SPECS)).toEqual(["case@1"]);
    expect(CURRENT_STUDENT_CHAT_SPEC_ID).toBe("case@1");
    expect(getCurrentStudentChatSpec()).toBe(STUDENT_CHAT_SPECS["case@1"]);
    expect(getStudentChatSpec("case@1")).toBe(STUDENT_CHAT_SPECS["case@1"]);
  });

  it("case@1 은 사례형 모드이고 현행 빌더를 가리킨다", () => {
    const spec = STUDENT_CHAT_SPECS["case@1"];
    expect(spec.id).toBe("case@1");
    expect(spec.mode).toBe("case");
    // 같은 함수여야 한다 — 복사본이나 감싼 함수는 현행 동작 보존을 증명하기 어렵다.
    expect(spec.build).toBe(buildStudentChatSystemPrompt);
    expect(spec.note.length).toBeGreaterThan(0);
  });

  it("추론 강도는 미지정(공급사 기본값)으로 기록한다 — 값을 지어내지 않는다", () => {
    const spec = STUDENT_CHAT_SPECS["case@1"];
    expect(spec.effort).toBe("unspecified");
    expect(spec.effortLabel).toBe("미지정(공급사 기본값)");
  });

  it("렌더 해시는 ko/en 모두 64자리 SHA-256 이다", () => {
    const { renderSha256 } = STUDENT_CHAT_SPECS["case@1"];
    expect(renderSha256.ko).toMatch(/^[0-9a-f]{64}$/);
    expect(renderSha256.en).toMatch(/^[0-9a-f]{64}$/);
    expect(renderSha256.ko).not.toBe(renderSha256.en);
  });

  it("레지스트리와 스펙은 불변이다", () => {
    const spec = STUDENT_CHAT_SPECS["case@1"];
    expect(Object.isFrozen(STUDENT_CHAT_SPECS)).toBe(true);
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.model)).toBe(true);
    expect(Object.isFrozen(spec.renderSha256)).toBe(true);
    expect(() => {
      (spec as { note: string }).note = "덮어쓰기";
    }).toThrow(TypeError);
    expect(() => {
      (STUDENT_CHAT_SPECS as Record<string, unknown>)["case@2"] = spec;
    }).toThrow(TypeError);
  });

  it("없는 스펙 ID 를 조회하면 던진다", () => {
    expect(() => getStudentChatSpec("nope@9" as never)).toThrow(/nope@9/);
  });
});

describe("모델 선택 방식 기록은 실제 동작과 같다 (기록만 하고 바꾸지 않는다)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("스펙은 환경변수 AI_MODEL 과 기본값으로 모델을 고른다고 적는다", () => {
    expect(STUDENT_CHAT_SPECS["case@1"].model).toEqual({
      selection: "env-with-default",
      envVar: "AI_MODEL",
      defaultModel: "gpt-5.6-luna",
      source: "lib/ai-models.ts",
    });
  });

  it("환경변수가 비어 있으면 lib/ai-models.ts 의 AI_MODEL 이 스펙에 적힌 기본값이다", async () => {
    vi.resetModules();
    vi.stubEnv("AI_MODEL", "");
    const { AI_MODEL } = await import("@/lib/ai-models");
    expect(AI_MODEL).toBe(STUDENT_CHAT_SPECS["case@1"].model.defaultModel);
  });

  it("환경변수가 있으면 그 값이 그대로 쓰인다 (스펙이 모델을 덮어쓰지 않는다)", async () => {
    vi.resetModules();
    vi.stubEnv("AI_MODEL", "env-model-x");
    const { AI_MODEL } = await import("@/lib/ai-models");
    expect(AI_MODEL).toBe("env-model-x");
  });
});

describe("buildStudentChatSpecStamp", () => {
  it("spec, template_sha(앞 16자), effort 를 돌려준다", () => {
    const { renderSha256 } = STUDENT_CHAT_SPECS["case@1"];
    expect(TEMPLATE_SHA_LENGTH).toBe(16);

    expect(buildStudentChatSpecStamp({ specId: "case@1", language: "ko" })).toEqual({
      spec: "case@1",
      template_sha: renderSha256.ko.slice(0, 16),
      effort: "unspecified",
    });
    expect(buildStudentChatSpecStamp({ specId: "case@1", language: "en" })).toEqual({
      spec: "case@1",
      template_sha: renderSha256.en.slice(0, 16),
      effort: "unspecified",
    });
  });

  it("알 수 없는 언어는 빌더와 같이 ko 로 취급한다", () => {
    const stamp = buildStudentChatSpecStamp({ specId: "case@1", language: "fr" as never });
    expect(stamp.template_sha).toBe(STUDENT_CHAT_SPECS["case@1"].renderSha256.ko.slice(0, 16));
  });

  it("기록을 만들다 실패해도 던지지 않고 빈 기록을 돌려준다 (학생 응답을 막지 않는다)", () => {
    expect(buildStudentChatSpecStamp({ specId: "nope@9" as never, language: "ko" })).toEqual({});
  });
});

describe("buildResponseModelStamp", () => {
  const REQUESTED = "requested-model";

  it("응답 객체의 model 을 그대로 기록한다", () => {
    expect(buildResponseModelStamp({ model: "gpt-5.6-luna-2026-09-01" }, REQUESTED)).toEqual({
      response_model: "gpt-5.6-luna-2026-09-01",
      response_model_source: "response",
    });
  });

  it.each([
    ["model 이 없으면", {}],
    ["model 이 빈 문자열이면", { model: "" }],
    ["model 이 공백뿐이면", { model: "   " }],
    ["model 이 문자열이 아니면", { model: 5 }],
    ["응답이 undefined 이면", undefined],
    ["응답이 null 이면", null],
  ])("%s 요청한 모델명으로 대체하고 대체했다고 구분해 적는다", (_label, response) => {
    expect(buildResponseModelStamp(response, REQUESTED)).toEqual({
      response_model: REQUESTED,
      response_model_source: "request",
    });
  });

  it("model 을 읽다 던져도 던지지 않고 요청한 모델명으로 대체한다", () => {
    const response = {
      get model(): string {
        throw new Error("boom");
      },
    };
    expect(buildResponseModelStamp(response, REQUESTED)).toEqual({
      response_model: REQUESTED,
      response_model_source: "request",
    });
  });
});
