/**
 * 학생 시험 채팅 프롬프트 현행본 잠금 (이슈 #515)
 *
 * 왜 이 테스트가 있나
 *   학생 채팅 프롬프트는 3/2, 3/9, 4/6, 4/16 에 걸쳐 되돌려지는 회귀를 반복했다.
 *   `__tests__/prompts.test.ts` 는 언어 분기 몇 줄만 보므로 본문을 통째로 바꿔도 통과한다.
 *   10/14 동결과 10/21 정식 시험에서 "모든 학생이 같은 프롬프트를 받았다" 를 말하려면
 *   현행 출력이 한 글자라도 바뀌면 CI 가 깨져야 한다.
 *
 * 무엇을 잠그나
 *   1) `buildStudentChatSystemPrompt` 의 ko/en × 최소/전체 입력 출력 SHA-256
 *   2) 위 출력의 사람이 읽는 스냅샷 (`__snapshots__/prompt-assets-lock/`) — 해시가 우선이고
 *      스냅샷은 PR diff 에서 무엇이 바뀌었는지 눈으로 보기 위한 보조다.
 *
 * 이 테스트가 깨졌다면
 *   의도한 변경이면 새 스펙 버전을 추가하고(`lib/student-chat-spec.ts`) 해시와 변경 사유를
 *   함께 갱신한다. 기존 버전의 본문과 해시는 고치지 않는다. 의도하지 않았다면 되돌린다.
 *
 * 해시 입력은 순수 함수 출력이어야 한다: 학생 메시지, 시각, 난수가 섞이지 않는다.
 * (`lib/prompts.ts` 의 이 두 빌더는 Date/Math.random/process.env 를 읽지 않는다.)
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildStudentChatSystemPrompt } from "@/lib/prompts";
import {
  assembleStudentChatInstructions,
  buildRagNotice,
  classifyRagState,
} from "@/lib/chat-instructions";
import { STUDENT_CHAT_SPECS } from "@/lib/student-chat-spec";

/** 줄바꿈 형식(CRLF/LF)이 해시를 흔들지 않게 LF 로 맞춘 뒤 해시한다. */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function sha256(text: string): string {
  return createHash("sha256").update(normalizeNewlines(text), "utf8").digest("hex");
}

const CHANGE_NOTICE =
  "프롬프트가 바뀌었습니다. 의도한 변경이면 새 스펙 버전을 추가하고 " +
  "해시와 변경 사유를 함께 갱신하세요. (기존 버전의 본문과 해시는 고치지 않습니다.)";

/** 최소 입력: 제목과 문제 본문만. */
const MINIMAL_INPUT = {
  examTitle: "Sample",
  currentQuestionText: "Question body",
};

/** 전체 입력: 제목, 코드, 문항 ID, 문제, 교수 컨텍스트, 자료, 루브릭을 모두 채운다. */
const FULL_INPUT = {
  examTitle: "시험 제목",
  examCode: "ABC123",
  questionId: "q-1",
  currentQuestionText: "문제 본문입니다",
  currentQuestionAiContext: "채점 맥락",
  relevantMaterialsText: "자료 조각",
  rubric: [{ evaluationArea: "영역1", detailedCriteria: "기준1" }],
};

/** 전체 입력 렌더의 기준값. 스펙 레지스트리(`case@1`)의 렌더 해시와 같아야 한다. */
const KO_FULL_SHA256 = "a9280876b978b02cd24d1637bc8a8a7ab7ee3f55e824f986b0a40d72c5d4f313";
const EN_FULL_SHA256 = "e3b41726291f5eb5f5f7f10db208a3bfc9d1cb7afa33acf8c60cfa62fa66a620";

type LockCase = {
  name: string;
  render: () => string;
  /** 현행(2026-10-03, staging b8287303)에서 측정한 SHA-256. */
  sha256: string;
  snapshot: string;
};

const BUILDER_LOCKS: LockCase[] = [
  {
    name: "ko 최소",
    render: () => buildStudentChatSystemPrompt(MINIMAL_INPUT),
    sha256: "4410f6e8b13413f517857316e0fe7cd694f982659c45c7c5ce5840384aa97204",
    snapshot: "./__snapshots__/prompt-assets-lock/student-chat.ko.minimal.txt",
  },
  {
    name: "ko 전체",
    render: () => buildStudentChatSystemPrompt(FULL_INPUT),
    sha256: KO_FULL_SHA256,
    snapshot: "./__snapshots__/prompt-assets-lock/student-chat.ko.full.txt",
  },
  {
    name: "en 최소",
    render: () => buildStudentChatSystemPrompt({ ...MINIMAL_INPUT, language: "en" }),
    sha256: "1eee0fa378bf59d036a54f92929b5b07b34e51f2b7c51f330bcc2a4b750d34b0",
    snapshot: "./__snapshots__/prompt-assets-lock/student-chat.en.minimal.txt",
  },
  {
    name: "en 전체",
    render: () => buildStudentChatSystemPrompt({ ...FULL_INPUT, language: "en" }),
    sha256: EN_FULL_SHA256,
    snapshot: "./__snapshots__/prompt-assets-lock/student-chat.en.full.txt",
  },
];

describe("buildStudentChatSystemPrompt 현행본 해시 잠금", () => {
  it.each(BUILDER_LOCKS)("$name 입력의 렌더 SHA-256 이 현행 기준값과 같다", ({ name, render, sha256: expected }) => {
    const actual = sha256(render());
    expect(
      actual,
      `${CHANGE_NOTICE}\n  대상: buildStudentChatSystemPrompt (${name})\n  기준값: ${expected}\n  현재값: ${actual}`
    ).toBe(expected);
  });

  it("같은 입력을 두 번 렌더하면 같다 (비결정 값이 섞이지 않았다)", () => {
    for (const { render } of BUILDER_LOCKS) {
      expect(render()).toBe(render());
    }
  });

  it("출력에 CR 이 섞여 있지 않다 (소스의 CRLF 는 템플릿 리터럴이 LF 로 정규화한다)", () => {
    for (const { render } of BUILDER_LOCKS) {
      expect(render()).not.toContain("\r");
    }
  });
});

describe("줄바꿈 정규화", () => {
  it("CRLF 와 LF 로 쓴 같은 텍스트는 같은 해시가 된다", () => {
    expect(sha256("a\r\nb\r\nc")).toBe(sha256("a\nb\nc"));
  });

  it("줄바꿈이 아닌 차이는 해시를 바꾼다", () => {
    expect(sha256("a\nb")).not.toBe(sha256("a\n b"));
  });
});

describe("스펙 레지스트리의 렌더 해시", () => {
  it("case@1 의 ko/en 렌더 해시는 전체 입력 렌더의 현행 기준값과 같다", () => {
    const { renderSha256 } = STUDENT_CHAT_SPECS["case@1"];
    expect(renderSha256.ko, CHANGE_NOTICE).toBe(KO_FULL_SHA256);
    expect(renderSha256.en, CHANGE_NOTICE).toBe(EN_FULL_SHA256);
  });

  it("case@1 의 빌더는 잠금 대상 빌더와 같은 함수다", () => {
    expect(STUDENT_CHAT_SPECS["case@1"].build).toBe(buildStudentChatSystemPrompt);
  });
});

/**
 * 라우트가 모델에 보내는 최종 지시문 = 빌더 출력 + 자료 검색 결과에 따른 덧붙임 문장.
 * 세 상태(검색 0건, 관련성 낮음, 정상)별로 잠근다. 기준값은 지시문 조립을 route.ts 에서
 * `lib/chat-instructions.ts` 로 옮기기 **전** 라우트에서 측정한 값이고
 * (`chat-route-prompt-stamp.test.ts` 가 라우트 수준에서 같은 값을 확인한다),
 * 옮긴 뒤에도 같다.
 */
describe("assembleStudentChatInstructions 세 상태 해시 잠금", () => {
  const ROUTE_LIKE_INPUT = {
    examTitle: "시험 제목",
    examCode: "TST001",
    questionId: "q-1",
    currentQuestionText: "문제 본문입니다",
    currentQuestionAiContext: "채점 맥락",
  };
  const MATERIALS = "[자료 1: a.pdf]\n자료 본문입니다";

  type State = "no_materials" | "low_relevance" | "normal";
  const RAG: Record<State, { relevantMaterialsText: string; resultsCount: number; topSimilarity: number | null }> = {
    no_materials: { relevantMaterialsText: "", resultsCount: 0, topSimilarity: null },
    low_relevance: { relevantMaterialsText: MATERIALS, resultsCount: 1, topSimilarity: 0.25 },
    normal: { relevantMaterialsText: MATERIALS, resultsCount: 1, topSimilarity: 0.5 },
  };

  const PINS: Array<{ language: "ko" | "en"; state: State; sha256: string }> = [
    { language: "ko", state: "no_materials", sha256: "31ac35ae196c03e0f6aeba8c89f952ced195f64c33bb106c3017f7e8b2f75160" },
    { language: "ko", state: "low_relevance", sha256: "631c57335f9b02b3e10f86a79358c00f5d04f9bfac25c1e1798056115e74178c" },
    { language: "ko", state: "normal", sha256: "e106ef0c8abce58728af45ffd38b9b9d26692923d8e5307deaa2e6cdce2a725b" },
    { language: "en", state: "no_materials", sha256: "27921b3f412abb8cb17b543e39501d9d0feed13065cb2f57205fd99e40b3ad77" },
    { language: "en", state: "low_relevance", sha256: "b8b92a71375a78cee31c576118dc3d66e9f5df7f58348e8c130c61bb43e79fa3" },
    { language: "en", state: "normal", sha256: "ba6e395575899ca9d74564ed239fc8af69ca5dcacecc7bdda055f86b19f9d1bf" },
  ];

  it.each(PINS)("$language / $state 의 최종 지시문 SHA-256 이 현행 기준값과 같다", ({ language, state, sha256: expected }) => {
    const { instructions } = assembleStudentChatInstructions({ ...ROUTE_LIKE_INPUT, language, rag: RAG[state] });
    const actual = sha256(instructions);
    expect(
      actual,
      `${CHANGE_NOTICE}\n  대상: assembleStudentChatInstructions (${language}, ${state})\n  기준값: ${expected}\n  현재값: ${actual}`
    ).toBe(expected);
  });

  it("정상 상태의 지시문은 빌더 출력과 글자 하나까지 같다 (덧붙이는 것이 없다)", () => {
    const { instructions } = assembleStudentChatInstructions({
      ...ROUTE_LIKE_INPUT,
      language: "ko",
      rag: RAG.normal,
    });
    expect(instructions).toBe(
      buildStudentChatSystemPrompt({
        ...ROUTE_LIKE_INPUT,
        relevantMaterialsText: MATERIALS,
        language: "ko",
      })
    );
  });

  it("덧붙이는 문장은 빌더 출력 뒤에만 붙는다", () => {
    for (const state of ["no_materials", "low_relevance"] as const) {
      const base = buildStudentChatSystemPrompt({
        ...ROUTE_LIKE_INPUT,
        relevantMaterialsText: RAG[state].relevantMaterialsText,
        language: "ko",
      });
      const { instructions } = assembleStudentChatInstructions({
        ...ROUTE_LIKE_INPUT,
        language: "ko",
        rag: RAG[state],
      });
      expect(instructions.startsWith(base)).toBe(true);
      expect(instructions.slice(base.length)).toBe(buildRagNotice(RAG[state]));
      expect(instructions.length).toBeGreaterThan(base.length);
    }
  });

  it("학생 메시지는 지시문에 섞이지 않는다 (해시 입력은 순수 함수 출력이다)", () => {
    const clean = assembleStudentChatInstructions({ ...ROUTE_LIKE_INPUT, language: "ko", rag: RAG.normal });
    const withMessage = assembleStudentChatInstructions({
      ...ROUTE_LIKE_INPUT,
      message: "학생이 보낸 질문 12345",
      language: "ko",
      rag: RAG.normal,
    } as never);
    expect(withMessage.instructions).toBe(clean.instructions);
    expect(clean.instructions).not.toContain("12345");
  });

  it("같은 입력은 항상 같은 지시문이다 (시각이나 난수가 섞이지 않는다)", () => {
    const first = assembleStudentChatInstructions({ ...ROUTE_LIKE_INPUT, language: "en", rag: RAG.low_relevance });
    const second = assembleStudentChatInstructions({ ...ROUTE_LIKE_INPUT, language: "en", rag: RAG.low_relevance });
    expect(second.instructions).toBe(first.instructions);
  });

  it("어떤 스펙과 언어로 만들었는지 함께 돌려준다 (응답 기록용)", () => {
    expect(assembleStudentChatInstructions({ ...ROUTE_LIKE_INPUT, language: "en", rag: RAG.normal })).toMatchObject({
      specId: "case@1",
      language: "en",
    });
    // language 를 안 주면 빌더와 같이 ko 다.
    expect(assembleStudentChatInstructions({ ...ROUTE_LIKE_INPUT, rag: RAG.normal })).toMatchObject({
      specId: "case@1",
      language: "ko",
    });
  });
});

describe("자료 검색 상태 판정 (route.ts 의 조건을 그대로 옮긴 것)", () => {
  it("검색 0건이면 관련성 수치와 무관하게 자료 없음이다", () => {
    expect(classifyRagState({ resultsCount: 0, topSimilarity: null })).toBe("no_materials");
    expect(classifyRagState({ resultsCount: 0, topSimilarity: 0.1 })).toBe("no_materials");
  });

  it("유사도가 0.3 미만이면 관련성 낮음이고 0.3 은 정상이다", () => {
    expect(classifyRagState({ resultsCount: 1, topSimilarity: 0.2999 })).toBe("low_relevance");
    expect(classifyRagState({ resultsCount: 1, topSimilarity: 0.3 })).toBe("normal");
    expect(classifyRagState({ resultsCount: 5, topSimilarity: 0.9 })).toBe("normal");
  });

  it("키워드 검색 결과(유사도 null)는 정상이다", () => {
    expect(classifyRagState({ resultsCount: 1, topSimilarity: null })).toBe("normal");
    expect(buildRagNotice({ resultsCount: 1, topSimilarity: null })).toBe("");
  });
});

describe("buildStudentChatSystemPrompt 현행본 스냅샷 (사람이 diff 로 읽는 용도)", () => {
  // 해시 테스트가 먼저 실패해 이유를 알려 준다. 이 스냅샷은 "무엇이 바뀌었는지" 를 PR diff 로
  // 보여 주기 위한 것이라 같은 변경에서 함께 갱신된다 (`npx vitest run -u <이 파일>`).
  it.each(BUILDER_LOCKS)("$name 렌더가 스냅샷과 같다", async ({ render, snapshot }) => {
    await expect(normalizeNewlines(render())).toMatchFileSnapshot(snapshot);
  });
});
