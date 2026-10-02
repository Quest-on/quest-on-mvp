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
    sha256: "a9280876b978b02cd24d1637bc8a8a7ab7ee3f55e824f986b0a40d72c5d4f313",
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
    sha256: "e3b41726291f5eb5f5f7f10db208a3bfc9d1cb7afa33acf8c60cfa62fa66a620",
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

describe("buildStudentChatSystemPrompt 현행본 스냅샷 (사람이 diff 로 읽는 용도)", () => {
  // 해시 테스트가 먼저 실패해 이유를 알려 준다. 이 스냅샷은 "무엇이 바뀌었는지" 를 PR diff 로
  // 보여 주기 위한 것이라 같은 변경에서 함께 갱신된다 (`npx vitest run -u <이 파일>`).
  it.each(BUILDER_LOCKS)("$name 렌더가 스냅샷과 같다", async ({ render, snapshot }) => {
    await expect(normalizeNewlines(render())).toMatchFileSnapshot(snapshot);
  });
});
